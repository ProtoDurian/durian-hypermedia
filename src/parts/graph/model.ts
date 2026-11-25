// The graph part's view model (format version 11): which elements show for a fold state, a group's area (a padded convex
// hull of its members) and the lookups the view uses. Pure: no DOM, no React, no cytoscape; the tests call it directly.
import type { GGroup, GNode, GraphSpec } from "./shape";
import { NODE_H, nodeWidth as nodeW } from "./shape";

export type Model = { nodes: Map<string, GNode>; groups: Map<string, GGroup>; order: Map<string, number>; under: Map<string, string[]> };
export function modelOf(spec: GraphSpec): Model {
  const nodes = new Map(spec.nodes.map((n) => [n.id, n])), groups = new Map(spec.groups.map((g) => [g.id, g]));
  const order = new Map<string, number>(); spec.groups.forEach((g, i) => order.set(g.id, i)); spec.nodes.forEach((n, i) => order.set(n.id, spec.groups.length + i));
  // every node under a group, at any depth
  const under = new Map<string, string[]>(spec.groups.map((g) => [g.id, []]));
  for (const n of spec.nodes) for (let p = n.group; p; p = groups.get(p)?.parent ?? null) under.get(p)!.push(n.id);
  return { nodes, groups, order, under };
}
export const parentOf = (m: Model, id: string) => m.nodes.get(id)?.group ?? m.groups.get(id)?.parent ?? null;
export const ancestors = (m: Model, id: string) => { const out: string[] = []; for (let p = parentOf(m, id); p; p = parentOf(m, p)) out.push(p); return out; };
/** what stands for a node or group on screen: its outermost folded group, or itself */
export function repOf(m: Model, id: string, folded: Set<string>): string {
  let rep = id;
  for (const a of ancestors(m, id)) if (folded.has(a)) rep = a;
  return rep;
}

// every node is pannable: nodes cannot be dragged, so a drag that starts on one (a finger covers several when zoomed out) moves the view
export type ViewEl = { group: "nodes" | "edges"; data: Record<string, any>; pannable?: boolean; classes: string; position?: { x: number; y: number } };
/** the elements cytoscape draws for a fold state: a folded group is one node; an open group is no element (its area is
 * drawn under the canvas); nodes inside a folded group are left out and their edges join the folded group */
export function viewOf(spec: GraphSpec, m: Model, folded: Set<string>, pos: Map<string, { x: number; y: number }>, compact: Map<string, { x: number; y: number }> | null = null): ViewEl[] {
  const els: ViewEl[] = [];
  const shown = (id: string) => repOf(m, id, folded) === id;
  for (const g of spec.groups) {
    if (!shown(g.id) || !folded.has(g.id)) continue;
    const count = m.under.get(g.id)!.length;
    const label = `${g.label}  ${count}`;
    const ps = m.under.get(g.id)!.map((id) => pos.get(id)).filter(Boolean) as { x: number; y: number }[];
    const c = compact?.get(g.id) ?? (ps.length ? { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } : { x: 0, y: 0 });
    els.push({ group: "nodes", pannable: true, data: { id: g.id, label, full: g.label, tone: g.tone ?? "none", w: nodeW(label) + 18, tw: nodeW(label) + 4, count, kind: "folded" }, classes: "gr-group gr-folded", position: c });
  }
  for (const n of spec.nodes) {
    if (!shown(n.id)) continue;
    els.push({ group: "nodes", pannable: true, data: { id: n.id, label: n.label, full: n.label, tone: n.tone ?? "none", w: n.w, tw: n.w - 18, kind: "node" }, classes: "gr-node", position: compact?.get(n.id) ?? pos.get(n.id) ?? { x: n.x, y: n.y } });
  }
  const anchors = new Set<string>();
  const agg = new Map<string, { a: string; b: string; count: number; labels: string[]; tone: string | null; dashed: boolean }>();
  for (const e of spec.edges) {
    const a = repOf(m, e.from, folded), b = repOf(m, e.to, folded);
    if (a === b) continue;
    // an edge to an open group goes to the group as a whole: it ends on a small dot in the middle of the group's area
    const ends = [a, b].map((x) => (m.groups.has(x) && !folded.has(x) ? anchorId(x) : x));
    for (const x of [a, b]) if (m.groups.has(x) && !folded.has(x) && !anchors.has(x)) anchors.add(x);
    const k = `${ends[0]}\u0000${ends[1]}`;
    const x = agg.get(k);
    if (x) { x.count++; if (e.label && x.labels.length < 3 && !x.labels.includes(e.label)) x.labels.push(e.label); if (x.tone !== e.tone) x.tone = null; x.dashed &&= e.dashed; }
    else agg.set(k, { a: ends[0], b: ends[1], count: 1, labels: e.label ? [e.label] : [], tone: e.tone, dashed: e.dashed });
  }
  for (const g of anchors) {
    const ps = m.under.get(g)!.map((id) => pos.get(id)).filter(Boolean) as { x: number; y: number }[];
    const c = ps.length ? { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } : { x: 0, y: 0 };
    els.push({ group: "nodes", pannable: true, data: { id: anchorId(g), anchorOf: g, full: m.groups.get(g)!.label, label: "", tone: m.groups.get(g)!.tone ?? "none", w: 10, tw: 1, kind: "anchor" }, classes: "gr-anchor", position: c });
  }
  let i = 0;
  for (const x of agg.values()) {
    const label = x.count > 1 ? `${x.count} links${x.labels.length ? `: ${x.labels.join(", ")}` : ""}` : x.labels[0] ?? "";
    els.push({ group: "edges", data: { id: `e${i++}`, source: x.a, target: x.b, label, count: x.count, tone: x.tone ?? "none" }, classes: `gr-edge${x.dashed ? " gr-dashed" : ""}` });
  }
  return els;
}
/** With every top-level group folded, the pills (and the nodes in no group) take the places of the still picture, which is laid
 * out for boxes that size: the open layout spreads a group's members over a wide area, and one pill at its middle would
 * leave the pills far apart and the picture small. null when some group is open, or the still holds all loose nodes as one box. */
export function compactOf(spec: GraphSpec, folded: Set<string>): Map<string, { x: number; y: number }> | null {
  const tops = spec.groups.filter((g) => !g.parent);
  if (!tops.length || !spec.still || !tops.every((g) => folded.has(g.id)) || spec.still.items.some((it) => it.id === "\u0000other")) return null;
  return new Map(spec.still.items.map((it) => [it.id, { x: it.x, y: it.y }]));
}
/** the id of an open group's anchor dot (edges written to the group end there) */
export const anchorId = (g: string) => `\u0001${g}`;

// ------------------------------------------------------------------ group areas: a padded convex hull of the members
export type Pt = [number, number];
export function hullOf(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** inside the hull, or within `pad` of its outline */
export function nearHull(h: Pt[], x: number, y: number, pad: number): boolean {
  if (!h.length) return false;
  let inside = false;
  for (let i = 0, j = h.length - 1; i < h.length; j = i++) { const [xi, yi] = h[i], [xj, yj] = h[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; }
  if (inside) return true;
  for (let i = 0; i < h.length; i++) {
    const [ax, ay] = h[i], [bx, by] = h[(i + 1) % h.length];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= pad) return true;
  }
  return false;
}
export type Hull = { id: string; label: string; tone: string; depth: number; pad: number; pts: Pt[]; d: string; cx: number; top: number; count: number };

/** The least zoom at which the whole graph still names its nodes (a name is 13 px at zoom 1, and the zoomed-out label layer can place only some of the
 * rest): under it the groups start folded, a pill each with its count, big enough to read and tap, and the reader opens them. w x h: the box, room: what
 * the zoom buttons take at the right, bw x bh: the open graph. */
export const START_FOLDED_Z = 0.65;
export const startsFolded = (w: number, h: number, bw: number, bh: number, room = 0): boolean => Math.min((w - room - 40) / Math.max(1, bw), (h - 40) / Math.max(1, bh)) < START_FOLDED_Z;

/** The stage's height that shows the first view with no empty frame, worked out from the sample so the server writes it and the page does not
 * move when the graph loads: open = the whole graph at zoom 1 (its nodes, the groups' areas round them, and the margins fitAll keeps), fold =
 * the folded pills of the still picture. A force layout is placed in the browser (cytoscape), so it has no height here: null (the stage keeps
 * its size's height). The stage never grows past that height, and never goes under its least (style.css). */
export function stageHeights(spec: GraphSpec, m: Model = modelOf(spec)): { open: number; fold: number } | null {
  if (spec.layout === "force" || !spec.nodes.length) return null;
  const ys = spec.nodes.map((n) => [n.y - NODE_H / 2, n.y + NODE_H / 2]);
  const bh = Math.max(...ys.map((a) => a[1])) - Math.min(...ys.map((a) => a[0]));
  const depth = (g: string): number => { let d = 0; for (let p = m.groups.get(g)?.parent ?? null; p; p = m.groups.get(p)?.parent ?? null) d++; return d; };
  const maxDepth = Math.max(0, ...spec.groups.map((g) => depth(g.id)));
  const pad = spec.groups.length ? 14 + 10 * maxDepth : 0, top = spec.groups.length ? 22 : 0;
  const open = Math.ceil(bh + 2 * pad + 40 + top);
  const fold = spec.still ? Math.ceil(spec.still.h + 28) : open;
  return { open, fold: Math.min(fold, open) };
}
