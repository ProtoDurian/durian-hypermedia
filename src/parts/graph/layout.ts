// The graph part's own layouts (format version 11): layers, radial, the force seed and the still picture. Pure; every loop
// charges the budget it is given, and no step looks through a list for what a map would find (the work grows about with
// the nodes and edges, never with their square).
import type { Budget } from "../../core/budget";
import { forceCost, forceIterations, GRAPH_STILL_MAX, NODE_H, nodeWidth, opSteps, type GGroup, type GraphSpec, type Still, type StillItem } from "./shape";

const GAP_X = 16, LAYER_GAP = 100, BAND_PAD = 18, BAND_GAP = 40, RING_GAP = 120;

type Adj = { out: number[][]; inn: number[][] };
function adjacency(spec: GraphSpec, B: Budget): Adj {
  B.charge(opSteps(spec.nodes.length + spec.edges.length));
  const idx = new Map(spec.nodes.map((n, i) => [n.id, i]));
  const out: number[][] = spec.nodes.map(() => []), inn: number[][] = spec.nodes.map(() => []);
  for (const e of spec.edges) { const a = idx.get(e.from), b = idx.get(e.to); if (a == null || b == null || a === b) continue; out[a].push(b); inn[b].push(a); }
  return { out, inn };
}
/** the chain of groups from the top down, from a map of the groups: ["core", "lib"] */
function groupPath(byId: Map<string, GGroup>, gid: string | null): string[] {
  const out: string[] = [];
  for (let p = gid; p; p = byId.get(p)?.parent ?? null) out.unshift(p);
  return out;
}
export const groupMap = (spec: GraphSpec) => new Map(spec.groups.map((g) => [g.id, g]));

/**
 * layers: a direction, for dependencies (a -> b: a uses b; a sits above b). Cycles are broken by turning back edges round;
 * each node sits one layer below the lowest node that points at it. A group is a band (nested bands for nested groups), and
 * no band shares a layer with another band in the same columns, so a group's area never covers a node of another group;
 * two groups that use different layers may share columns (packed, so the graph stays about as wide as its widest layer).
 * The nodes of a layer and the bands are ordered to keep lines short (barycentre sweeps).
 */
export function layersLayout(spec: GraphSpec, B: Budget) {
  const n = spec.nodes.length;
  const { out } = adjacency(spec, B);
  const byId = groupMap(spec);
  // 1. break cycles (iterative depth-first search; an edge to a node on the stack turns round)
  B.charge(opSteps(n + spec.edges.length));   // the search takes one turn per node and per edge
  const state = new Uint8Array(n); // 0 new, 1 on the stack, 2 done
  const dag: number[][] = spec.nodes.map(() => []);
  for (let s = 0; s < n; s++) {
    if (state[s]) continue;
    const stack: [number, number][] = [[s, 0]]; state[s] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1]; const [v, k] = top;
      if (k >= out[v].length) { state[v] = 2; stack.pop(); continue; }
      top[1]++;
      const w = out[v][k];
      if (state[w] === 1) dag[w].push(v);          // a back edge: turn it round
      else { dag[v].push(w); if (!state[w]) { state[w] = 1; stack.push([w, 0]); } }
    }
  }
  // 2. layers: longest path from the sources, in topological order
  const indeg = new Int32Array(n); for (const vs of dag) for (const w of vs) indeg[w]++;
  B.charge(opSteps(spec.edges.length));
  const layer = new Int32Array(n); const q: number[] = []; for (let v = 0; v < n; v++) if (!indeg[v]) q.push(v);
  for (let h = 0; h < q.length; h++) { const v = q[h]; for (const w of dag[v]) { layer[w] = Math.max(layer[w], layer[v] + 1); if (!--indeg[w]) q.push(w); } }
  let L = 0; for (let v = 0; v < n; v++) L = Math.max(L, layer[v] + 1);
  // 3. bands: the root band holds the nodes in no group (one column) and a band per top-level group, and so on down
  type Band = { gid: string | null; kids: Band[]; direct: number[]; x: number; w: number; key: number };
  const root: Band = { gid: null, kids: [], direct: [], x: 0, w: 0, key: 0 };
  const bandOf = new Map<string, Band>();
  const bandFor = (gid: string | null): Band => {
    if (!gid) return root;
    let b = bandOf.get(gid); if (b) return b;
    b = { gid, kids: [], direct: [], x: 0, w: 0, key: 0 }; bandOf.set(gid, b);
    const parent = byId.get(gid)?.parent ?? null;
    bandFor(parent).kids.push(b);
    return b;
  };
  B.charge(opSteps(spec.groups.length + n));
  for (const g of spec.groups) bandFor(g.id);
  spec.nodes.forEach((nd, i) => bandFor(nd.group).direct.push(i));
  const horiz = spec.dir === "down";
  const breadth = (i: number) => (horiz ? spec.nodes[i].w : NODE_H);
  // the order inside a band's direct column, per layer; starts in the written order
  const order = new Float64Array(n); for (let i = 0; i < n; i++) order[i] = i;
  const pos = new Float64Array(n);
  const members = new Map<Band, number[]>();
  const collect = (b: Band): number[] => { const all = [...b.direct, ...b.kids.flatMap(collect)]; members.set(b, all); return all; };
  collect(root);
  B.charge(opSteps(n * 2) + bandOf.size);
  const span = new Map<Band, [number, number]>();
  for (const [b, ms] of members) { let lo = Infinity, hi = -Infinity; for (const i of ms) { lo = Math.min(lo, layer[i]); hi = Math.max(hi, layer[i]); } span.set(b, [lo, hi]); }
  const place = () => {
    const walk = (b: Band, x0: number): number => {
      B.charge(1 + (b.direct.length >> 2));
      let x = x0 + (b.gid ? BAND_PAD : 0);
      // the direct column: per layer, nodes side by side; the column is as wide as its widest layer (only the layers it uses)
      const rows = new Map<number, number[]>();
      for (const i of b.direct) { const r = rows.get(layer[i]); if (r) r.push(i); else rows.set(layer[i], [i]); }
      let colW = 0;
      const rowW = (r: number[]) => r.reduce((s, i) => s + breadth(i), 0) + GAP_X * Math.max(0, r.length - 1);
      for (const r of rows.values()) { r.sort((a, c) => order[a] - order[c]); colW = Math.max(colW, rowW(r)); }
      const kids = [...b.kids].sort((a, c) => a.key - c.key);
      // the direct column goes where its weight puts it among the kids
      const directKey = b.direct.length ? b.direct.reduce((s, i) => s + order[i], 0) / b.direct.length : -Infinity;
      let placedDirect = !b.direct.length;
      const putDirect = () => { for (const r of rows.values()) { let cx = x + (colW - rowW(r)) / 2; for (const i of r) { pos[i] = cx + breadth(i) / 2; cx += breadth(i) + GAP_X; } } x += colW + BAND_GAP; placedDirect = true; };
      for (const k of kids) { if (!placedDirect && directKey <= k.key) putDirect(); k.x = x; const w = walk(k, x); k.w = w; x += w + BAND_GAP; }
      if (!placedDirect) putDirect();
      x -= BAND_GAP;
      if (b.gid) x += BAND_PAD;
      return Math.max(x - x0, 0);
    };
    // the top level: each top-level group's band and each node in no group is a piece. In the order their links pull them
    // (the first time: as written), each piece goes right after whatever already sits in its layers, so two groups that
    // use different layers share columns, and nothing shares a layer with a band in the same columns
    const pieces = [...root.kids.filter((b) => members.get(b)!.length).map((b) => ({ b, i: -1, key: b.key })), ...root.direct.map((i) => ({ b: null as Band | null, i, key: order[i] }))].sort((a, c) => a.key - c.key);
    const edge = new Float64Array(L).fill(-Infinity), wasBand = new Uint8Array(L);
    for (const pc of pieces) {
      const [lo, hi] = pc.b ? span.get(pc.b)! : [layer[pc.i], layer[pc.i]];
      B.charge(2 + ((hi - lo + 1) >> 5)); // the layer loops below are plain array reads: a step stands for 32 of them
      const w = pc.b ? walk(pc.b, 0) : breadth(pc.i);
      let x = 0;
      for (let l = lo; l <= hi; l++) if (edge[l] > -Infinity) x = Math.max(x, edge[l] + (pc.b || wasBand[l] ? BAND_GAP : GAP_X));
      if (pc.b) walk(pc.b, x); else pos[pc.i] = x + w / 2;
      for (let l = lo; l <= hi; l++) { edge[l] = x + w; wasBand[l] = pc.b ? 1 : 0; }
    }
  };
  place();
  // 4. sweeps: a node's key is the mean position of its neighbours; a band's key is the mean of its nodes' keys
  const nb: number[][] = spec.nodes.map(() => []);
  spec.nodes.forEach((_, v) => { for (const w of out[v]) { nb[v].push(w); nb[w].push(v); } });
  for (let sweep = 0; sweep < 6; sweep++) {
    B.charge(opSteps(n + spec.edges.length) + bandOf.size);
    const key = new Float64Array(n);
    for (let v = 0; v < n; v++) key[v] = nb[v].length ? nb[v].reduce((s, w) => s + pos[w], 0) / nb[v].length : pos[v];
    for (let v = 0; v < n; v++) order[v] = key[v] + v * 1e-6;
    for (const [b, m] of members) if (b !== root) b.key = m.length ? m.reduce((s, i) => s + key[i], 0) / m.length : 0;
    place();
  }
  const depthOf = (i: number) => layer[i] * (horiz ? LAYER_GAP : 0);
  // across the layers: down, a fixed gap; right, each layer as wide as its widest node (one pass for every layer's width)
  const layerX: number[] = [];
  if (!horiz) {
    const widest = new Float64Array(L).fill(48);
    spec.nodes.forEach((nd, i) => { widest[layer[i]] = Math.max(widest[layer[i]], nd.w); });
    let x = 0; for (let l = 0; l < L; l++) { layerX.push(x + widest[l] / 2); x += widest[l] + 72; }
  }
  spec.nodes.forEach((nd, i) => {
    if (horiz) { nd.x = Math.round(pos[i]); nd.y = depthOf(i); }
    else { nd.x = Math.round(layerX[layer[i]]); nd.y = Math.round(pos[i]); }
  });
}

/** radial: the centre in the middle, then a ring per step away from it (either direction); nodes it never reaches on the outside */
export function radialLayout(spec: GraphSpec, B: Budget) {
  const n = spec.nodes.length;
  const { out, inn } = adjacency(spec, B);
  const byId = groupMap(spec);
  const c = spec.nodes.findIndex((nd) => nd.id === spec.centre);
  const ring = new Int32Array(n).fill(-1); ring[c] = 0;
  const q = [c];
  B.charge(opSteps(2 * spec.edges.length + n));   // the search looks at each node's links once
  for (let h = 0; h < q.length; h++) { const v = q[h]; for (const w of [...out[v], ...inn[v]]) { if (ring[w] < 0) { ring[w] = ring[v] + 1; q.push(w); } } }
  let R = 0; for (let v = 0; v < n; v++) R = Math.max(R, ring[v]);
  for (let v = 0; v < n; v++) if (ring[v] < 0) ring[v] = R + 1;
  let rings = 0; for (let v = 0; v < n; v++) rings = Math.max(rings, ring[v] + 1);
  // the nodes of each ring, in one pass (never a pass over every node per ring)
  const byRing: number[][] = Array.from({ length: rings }, () => []);
  B.charge(opSteps(n) + rings);
  for (let v = 0; v < n; v++) byRing[ring[v]].push(v);
  const groupIdx = new Map(spec.groups.map((g, i) => [g.id, i]));
  const topIdx = new Float64Array(n);
  for (let v = 0; v < n; v++) { const p = groupPath(byId, spec.nodes[v].group); topIdx[v] = p.length ? groupIdx.get(p[0])! : 1e6; }
  B.charge(opSteps(n * 2));
  const angle = new Float64Array(n);
  let prevR = 0;
  spec.nodes[c].x = 0; spec.nodes[c].y = 0;
  for (let k = 1; k < rings; k++) {
    const vs = byRing[k];
    B.charge(opSteps(vs.length * 4));
    // the mean angle of the neighbours one ring in; ties by group, then the written order
    const key = (v: number) => { const ps = [...out[v], ...inn[v]].filter((w) => ring[w] === k - 1 && k > 1); if (!ps.length) return topIdx[v] * 1e-3; let sx = 0, sy = 0; for (const w of ps) { sx += Math.cos(angle[w]); sy += Math.sin(angle[w]); } return Math.atan2(sy, sx); };
    const keys = new Map(vs.map((v) => [v, key(v)]));
    vs.sort((a, b) => (k === 1 ? topIdx[a] - topIdx[b] || a - b : keys.get(a)! - keys.get(b)! || topIdx[a] - topIdx[b] || a - b));
    const around = vs.reduce((s, v) => s + spec.nodes[v].w + 24, 0);
    const r = Math.max(prevR + RING_GAP, around / (2 * Math.PI), k * 140);
    // start where the first node's parents are, so the rings do not twist
    const start = k === 1 ? -Math.PI / 2 : keys.get(vs[0])!;
    let a = start;
    for (const v of vs) { const step = ((spec.nodes[v].w + 24) / around) * 2 * Math.PI; angle[v] = a + step / 2; a += step; }
    for (const v of vs) { spec.nodes[v].x = Math.round(r * Math.cos(angle[v])); spec.nodes[v].y = Math.round(r * Math.sin(angle[v])); }
    prevR = r;
  }
}

/** force: cytoscape's cose layout runs in the browser. Here: a seed it starts from (groups on a circle, their nodes in a disc
 * around the group's place), so the result is the same on every load, and the up-front charge for its fixed iterations. */
export function forceSeed(spec: GraphSpec, B: Budget) {
  const n = spec.nodes.length, e = spec.edges.length;
  spec.forceIterations = forceIterations(n, e);
  B.charge(forceCost(n, e), 0, 0);
  const byId = groupMap(spec);
  const top = new Map<string, number[]>();
  spec.nodes.forEach((nd, i) => { const k = groupPath(byId, nd.group)[0] ?? `\u0000${nd.id}`; const a = top.get(k) ?? []; a.push(i); top.set(k, a); });
  const keys = [...top.keys()];
  const discR = (m: number) => 26 * Math.sqrt(m) + 30;
  const total = keys.reduce((s, k) => s + 2 * discR(top.get(k)!.length) + 40, 0) || 1;
  const ringR = Math.max(0, total / (2 * Math.PI));
  let a = -Math.PI / 2;
  for (const k of keys) {
    const vs = top.get(k)!; const d = discR(vs.length); const step = ((2 * d + 40) / total) * 2 * Math.PI;
    const cx = ringR * Math.cos(a + step / 2), cy = ringR * Math.sin(a + step / 2); a += step;
    B.charge(opSteps(vs.length));
    vs.forEach((v, j) => { const r = 26 * Math.sqrt(j + 0.5), t = j * 2.39996; spec.nodes[v].x = Math.round(cx + r * Math.cos(t)); spec.nodes[v].y = Math.round(cy + r * Math.sin(t)); });
  }
}

/**
 * The still picture (before cytoscape loads, and with no script): the top-level groups with their node counts, the nodes in
 * no group (or one box for them all when there are many), and the lines between them with how many edges each stands for.
 * Laid out with the layers layout on that small graph.
 */
export function stillOf(spec: GraphSpec, B: Budget): Still {
  const byId = groupMap(spec);
  const nodeById = new Map(spec.nodes.map((x) => [x.id, x]));
  B.charge(opSteps(spec.nodes.length + spec.groups.length + spec.edges.length));
  const topOf = (id: string): string => { const nd = nodeById.get(id); let g = nd ? nd.group : byId.get(id)?.parent ?? null; let top: string | null = nd ? null : id; while (g) { top = g; g = byId.get(g)?.parent ?? null; } return top ?? id; };
  const loose = spec.nodes.filter((nd) => !nd.group);
  const tops = spec.groups.filter((g) => !g.parent);
  const looseOne = loose.length + tops.length > GRAPH_STILL_MAX;
  const items: StillItem[] = [];
  const count = new Map<string, number>();
  for (const nd of spec.nodes) { const t = nd.group ? topOf(nd.id) : looseOne ? "\u0000other" : nd.id; count.set(t, (count.get(t) ?? 0) + 1); }
  for (const g of tops) items.push({ id: g.id, label: g.label, tone: g.tone, count: count.get(g.id) ?? 0, group: true, x: 0, y: 0, w: 0 });
  if (looseOne) items.push({ id: "\u0000other", label: "not in a group", tone: null, count: loose.length, group: true, x: 0, y: 0, w: 0 });
  else for (const nd of loose) items.push({ id: nd.id, label: nd.label, tone: nd.tone, count: 1, group: false, x: 0, y: 0, w: 0 });
  const keyOf = (id: string) => { const t = topOf(id); if (byId.has(t)) return t; return looseOne ? "\u0000other" : t; };
  const ek = new Map<string, number>();
  for (const e of spec.edges) { const a = keyOf(e.from), b = keyOf(e.to); if (a === b) continue; const k = `${a}\u0001${b}`; ek.set(k, (ek.get(k) ?? 0) + 1); }
  const edges = [...ek].map(([k, c]) => { const i = k.indexOf("\u0001"); return { a: k.slice(0, i), b: k.slice(i + 1), count: c }; });
  // the layers layout on the small graph; a still item's box is wider than a node (it holds a count too)
  const small: GraphSpec = { ...spec, layout: "layers", dir: "down", groups: [], errors: [], warnings: [], still: null,
    nodes: items.map((it) => ({ id: it.id, label: it.label, group: null, tone: it.tone, note: "", line: 0, declared: true, x: 0, y: 0, w: nodeWidth(it.label + (it.group ? " · 0000" : "")) })),
    edges: edges.map((e) => ({ from: e.a, to: e.b, label: "", tone: null, dashed: false, line: 0 })) };
  if (items.length) layersLayout(small, B);
  small.nodes.forEach((nd, i) => { items[i].x = nd.x; items[i].y = nd.y; items[i].w = nd.w; });
  // a tall single column of groups: every line would run behind the boxes between, one bar on top of another. Alternate the boxes left and right a little so each line has its own path
  if (items.length >= 4) {
    const xs = items.map((it) => it.x), spread = Math.max(...xs) - Math.min(...xs), widest = Math.max(...items.map((it) => it.w));
    if (spread < widest * 0.5) { const mid = xs.reduce((p, q) => p + q, 0) / xs.length, off = widest * 0.3; items.forEach((it, i) => { it.x = mid + (i % 2 ? off : -off); }); }
  }
  let minX = 0, minY = 0; for (const it of items) { minX = Math.min(minX, it.x - it.w / 2); minY = Math.min(minY, it.y - 22); }
  for (const it of items) { it.x -= minX - 12; it.y -= minY - 12; }
  let w = 120, h = 60; for (const it of items) { w = Math.max(w, it.x + it.w / 2 + 12); h = Math.max(h, it.y + 34); }
  return { w: Math.round(w), h: Math.round(h), items, edges };
}
