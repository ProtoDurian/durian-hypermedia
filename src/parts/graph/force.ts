// The graph part's force layout (format version 11): cytoscape's cose, run in two stages so each group keeps an area of
// its own. It takes the cytoscape factory as an argument and runs headless, so a test (or the view) can call it. The
// iterations are fixed when the part is read (shape.ts forceIterations) and charged there.
import { ancestors, type Model } from "./model";
import { NODE_H, forceRunIterations, type GraphSpec } from "./shape";

// ------------------------------------------------------------------ the force layout, in two stages
type P2 = { x: number; y: number };
/** room kept round a top-level group's nodes in the force layout: its area's padding, a gap, and its name above */
export const forceMargin = (maxDepth: number) => ({ side: 14 + 10 * maxDepth + 14, top: 14 + 10 * maxDepth + 34 });
const runLayout = (cy: any, opts: Record<string, unknown>) => new Promise<void>((res) => { const l = cy.layout({ name: "cose", animate: false, randomize: false, fit: false, nodeDimensionsIncludeLabels: false, ...opts }); l.one("layoutstop", () => res()); l.run(); });
/**
 * The force layout (cytoscape's cose), in two stages so each group keeps an area of its own:
 * 1. each top-level group alone, its nodes and the edges inside it, with a hidden centre per group (nested ones too)
 *    tied to its members;
 * 2. the groups as blocks the size of their stage-1 result (plus their area's padding and name), with the nodes in no
 *    group, linked by the edges between them; then any blocks that still overlap are pushed apart.
 * Each run uses the iterations fixed at parse time from the counts (and charged there to the page's budget), fewer for a
 * run over many nodes (forceRunIterations: each iteration compares every pair).
 * When the stage is clearly taller than wide (`aspect` = height / width, as on a phone) and the blocks came out wide,
 * the blocks' places are turned a quarter (x and y swapped; each group's own drawing keeps its way up), so it fills the stage.
 * `cytoscape` is the library's factory; it runs headless, so a test can call this without a browser.
 */
export async function forceLayout(cytoscape: any, spec: GraphSpec, m: Model, seed: Map<string, P2>, aspect = 0): Promise<Map<string, P2>> {
  const pos = new Map<string, P2>(); for (const n of spec.nodes) pos.set(n.id, { ...(seed.get(n.id) ?? { x: n.x, y: n.y }) });
  const iters = spec.forceIterations ?? 100;
  const topOf = (id: string): string | null => { const a = m.groups.has(id) ? [id, ...ancestors(m, id)] : ancestors(m, id); return a.length ? a[a.length - 1] : null; };
  const maxDepth = Math.max(0, ...spec.groups.map((g) => ancestors(m, g.id).length));
  const mg = forceMargin(maxDepth);
  const tops = spec.groups.filter((g) => !g.parent && m.under.get(g.id)!.length);
  const cy = cytoscape({ headless: true, styleEnabled: true, elements: [], style: [{ selector: "node", style: { shape: "rectangle", width: "data(w)", height: "data(h)" } }] });
  const sizeOf = (id: string) => ({ w: m.nodes.get(id)!.w, h: NODE_H });
  // stage 1: each top-level group alone
  const box = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  for (const t of tops) {
    const ids = m.under.get(t.id)!, inside = new Set(ids);
    const subs = spec.groups.filter((g) => g.id === t.id || ancestors(m, g.id).includes(t.id));
    const els: any[] = ids.map((id) => ({ group: "nodes", data: { id, w: sizeOf(id).w, h: NODE_H }, position: { ...pos.get(id)! } }));
    const tie = (g: string) => `\u0000g:${g}`;
    for (const g of subs) {
      const ms = m.under.get(g.id)!; if (!ms.length) continue;
      els.push({ group: "nodes", data: { id: tie(g.id), w: 4, h: 4 }, position: ms.reduce((s, id) => ({ x: s.x + pos.get(id)!.x / ms.length, y: s.y + pos.get(id)!.y / ms.length }), { x: 0, y: 0 }) });
    }
    const have = new Set(els.map((e) => e.data.id));
    const seen = new Set<string>();
    const edge = (a: string, b: string, tieE: boolean) => { const k = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`; if (a === b || seen.has(k) || !have.has(a) || !have.has(b)) return; seen.add(k); els.push({ group: "edges", data: { id: `\u0000e${seen.size}`, source: a, target: b, tie: tieE ? 1 : 0 } }); };
    for (const g of subs) { for (const id of m.under.get(g.id)!) if (m.nodes.get(id)!.group === g.id) edge(tie(g.id), id, true); if (g.parent && g.id !== t.id) edge(tie(g.parent), tie(g.id), true); }
    for (const e of spec.edges) {
      const end = (x: string) => (inside.has(x) ? x : m.groups.has(x) && have.has(tie(x)) ? tie(x) : null);
      const a = end(e.from), b = end(e.to); if (a && b) edge(a, b, false);
    }
    cy.add(els);
    await runLayout(cy, { numIter: forceRunIterations(iters, cy.nodes().length), idealEdgeLength: (e: any) => (e.data("tie") ? 30 : 70), edgeElasticity: (e: any) => (e.data("tie") ? 24 : 120), nodeRepulsion: () => 9000, nodeOverlap: 20, gravity: 0.8, componentSpacing: 40, padding: 0 });
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const id of ids) { const p = cy.getElementById(id).position(), w = sizeOf(id).w; pos.set(id, { x: p.x, y: p.y }); x1 = Math.min(x1, p.x - w / 2); x2 = Math.max(x2, p.x + w / 2); y1 = Math.min(y1, p.y - NODE_H / 2); y2 = Math.max(y2, p.y + NODE_H / 2); }
    box.set(t.id, { x1: x1 - mg.side, y1: y1 - mg.top, x2: x2 + mg.side, y2: y2 + mg.side });
    cy.elements().remove();
  }
  // stage 2: the groups as blocks, with the loose nodes
  type R = { id: string; x: number; y: number; w: number; h: number; block: boolean };
  const rs: R[] = [];
  const centreOf = (ids: string[]) => ids.reduce((s, id) => ({ x: s.x + (seed.get(id)?.x ?? 0) / ids.length, y: s.y + (seed.get(id)?.y ?? 0) / ids.length }), { x: 0, y: 0 });
  for (const t of tops) { const b = box.get(t.id)!, c = centreOf(m.under.get(t.id)!); rs.push({ id: t.id, x: c.x, y: c.y, w: b.x2 - b.x1, h: b.y2 - b.y1, block: true }); }
  for (const n of spec.nodes) if (!topOf(n.id)) rs.push({ id: n.id, x: pos.get(n.id)!.x, y: pos.get(n.id)!.y, w: n.w + 16, h: NODE_H + 16, block: false });
  const meta = (r: R) => (r.block ? `\u0000b:${r.id}` : r.id);
  const els: any[] = rs.map((r) => ({ group: "nodes", data: { id: meta(r), w: r.w, h: r.h }, position: { x: r.x, y: r.y } }));
  const agg = new Map<string, number>();
  for (const e of spec.edges) {
    const end = (x: string) => { const t = topOf(x); return t ? `\u0000b:${t}` : x; };
    const a = end(e.from), b = end(e.to); if (a === b) continue;
    const k = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`; agg.set(k, (agg.get(k) ?? 0) + 1);
  }
  let k = 0; for (const [key, count] of agg) { const [a, b] = splitKey(key); els.push({ group: "edges", data: { id: `\u0000m${k++}`, source: a, target: b, count } }); }
  cy.add(els);
  await runLayout(cy, { numIter: forceRunIterations(iters, cy.nodes().length), idealEdgeLength: (e: any) => { const a = e.source(), b = e.target(); return 60 + (Math.max(a.width(), a.height()) + Math.max(b.width(), b.height())) / 4; }, edgeElasticity: (e: any) => 100 / Math.min(4, e.data("count")), nodeRepulsion: (n: any) => 6000 + 2 * n.width() * n.height(), nodeOverlap: 40, gravity: 0.35, componentSpacing: 80, padding: 0 });
  for (const r of rs) { const p = cy.getElementById(meta(r)).position(); r.x = p.x; r.y = p.y; }
  cy.destroy();
  if (aspect > 1.15 && rs.length > 1) {
    const ew = Math.max(...rs.map((r) => r.x + r.w / 2)) - Math.min(...rs.map((r) => r.x - r.w / 2)), eh = Math.max(...rs.map((r) => r.y + r.h / 2)) - Math.min(...rs.map((r) => r.y - r.h / 2));
    if (ew > eh * 1.15) for (const r of rs) [r.x, r.y] = [r.y, r.x];
  }
  // then push apart any block that still overlaps another rectangle (a few rounds; the loose nodes among themselves are left to cose)
  const blocks = rs.filter((r) => r.block);
  for (let round = 0; round < 40 && blocks.length; round++) {
    let moved = false;
    for (const a of blocks) for (const b of rs) {
      if (a === b || (b.block && rs.indexOf(b) < rs.indexOf(a))) continue;
      const ox = (a.w + b.w) / 2 + 8 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + 8 - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (ox < oy) { const d = (a.x <= b.x ? -1 : 1) * ox / 2; a.x += d; b.x -= d; } else { const d = (a.y <= b.y ? -1 : 1) * oy / 2; a.y += d; b.y -= d; }
    }
    if (!moved) break;
  }
  // place: each group's stage-1 drawing moved to its block's centre
  for (const r of rs) {
    if (!r.block) { pos.set(r.id, { x: r.x, y: r.y }); continue; }
    const b = box.get(r.id)!, dx = r.x - (b.x1 + b.x2) / 2, dy = r.y - (b.y1 + b.y2) / 2;
    for (const id of m.under.get(r.id)!) { const p = pos.get(id)!; pos.set(id, { x: p.x + dx, y: p.y + dy }); }
  }
  return pos;
}
const splitKey = (k: string): [string, string] => { const i = k.indexOf("\u0000", k.startsWith("\u0000") ? 1 : 0); return [k.slice(0, i), k.slice(i + 1)]; };
