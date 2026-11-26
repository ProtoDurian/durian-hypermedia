// Port of core/scene.ts graphLayout: keep its cycle, crossing and whole-scene rules.
import { CHIP } from "../../../core/scene";
import { work } from "../../../core/work";

export interface ParentGraph { ents: Record<string, { id: string; parent: string | null }> }

// a graph: layers by the longest path along connectors (left to right, or top to bottom), then ordered to cut crossings
export function graphLayout(s: ParentGraph, kids: string[], size: Map<string, [number, number]>, set: (k: string, x: number, y: number) => void, dir: string, gap: number, links: [string, string][], room = 0, endRoom = 0, fit = 0, apart = false): [number, number] {
  if (!kids.length) return [0, 0];
  // a label sits beside a vertical arrow and across a horizontal one: leave it room
  const LAYER = endRoom + (dir === "down" ? Math.max(50, Math.min(90, room ? 2 * CHIP.lh + 30 : 0)) : Math.max(84, Math.min(CHIP.edgeW + 50, room + 40)));
  const idx = new Map(kids.map((k, i) => [k, i]));
  work(4 * kids.length + 8 * links.length);
  // a connector between anything inside two children counts as an edge between the two children
  const owner = (id: string): string | null => { let e: ParentGraph["ents"][string] | undefined = s.ents[id]; while (e) { if (idx.has(e.id)) return e.id; e = e.parent ? s.ents[e.parent] : undefined; } return null; };
  const out = new Map<string, Set<string>>(kids.map((k) => [k, new Set()]));
  for (const [x, y] of links) { const a = owner(x), b = owner(y); if (a && b && a !== b) out.get(a)!.add(b); }
  if (apart) {
    // format version 11: things no line joins are no reason to bend one: each joined group is its own block
    const seen = new Set<string>(), groups: string[][] = [];
    for (const k of kids) {
      if (seen.has(k)) continue;
      const g = new Set([k]), todo = [k];
      seen.add(k);
      for (let u = todo.pop(); u !== undefined; u = todo.pop()) for (const v of kids) if (!seen.has(v) && (out.get(u)!.has(v) || out.get(v)!.has(u))) { seen.add(v); g.add(v); todo.push(v); }
      groups.push(kids.filter((x) => g.has(x)));
    }
    if (groups.length > 1) {
      // blocks go across the way the lines run, and under each other where they would not fit
      const GROUP_GAP = gap * 2;
      let x = 0, y = 0, rowH = 0, W = 0, H = 0;
      for (const g of groups.sort((p, q) => q.length - p.length)) {
        const at = new Map<string, [number, number]>();
        const [w, h] = graphLayout(s, g, size, (k, a, b) => at.set(k, [a, b]), dir, gap, links, room, endRoom, fit);
        if (dir === "down" && fit && x && x + w > fit) { x = 0; y += rowH + LAYER; rowH = 0; }
        for (const [k, [a, b]] of at) set(k, x + a, y + b);
        W = Math.max(W, x + w); H = Math.max(H, y + h); rowH = Math.max(rowH, h);
        if (dir === "down") x += w + GROUP_GAP; else y += h + GROUP_GAP;
      }
      return [W, H];
    }
  }
  // drop the edges that close a loop (depth-first, in the order the author wrote things)
  const state = new Map<string, number>(); const back = new Set<string>();
  const dfs = (u: string) => { state.set(u, 1); for (const v of out.get(u)!) { if (state.get(v) === 1) back.add(`${u}>${v}`); else if (!state.get(v)) dfs(v); } state.set(u, 2); };
  for (const k of kids) if (!state.get(k)) dfs(k);
  const layer = new Map<string, number>();
  const lay = (u: string): number => { if (layer.has(u)) return layer.get(u)!; layer.set(u, 0); work(kids.length); let L = 0; for (const k of kids) if (out.get(k)!.has(u) && !back.has(`${k}>${u}`)) L = Math.max(L, lay(k) + 1); layer.set(u, L); return L; };
  kids.forEach(lay);
  const nL = Math.max(...layer.values()) + 1;
  const layers: string[][] = Array.from({ length: nL }, () => []);
  for (const k of kids) layers[layer.get(k)!].push(k);
  // order: two sweeps of the barycentre of each node's neighbours in the layer before
  const pos = new Map<string, number>();
  const setPos = () => layers.forEach((l) => l.forEach((k, i) => pos.set(k, i)));
  setPos();
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let L = 1; L < nL; L++) {
      const bc = (k: string) => { work(kids.length); const ps = kids.filter((p) => layer.get(p) === L - 1 && out.get(p)!.has(k)); return ps.length ? ps.reduce((a, p) => a + pos.get(p)!, 0) / ps.length : pos.get(k)!; };
      layers[L].sort((a, b) => bc(a) - bc(b) || idx.get(a)! - idx.get(b)!);
      setPos();
    }
  }
  const across = (k: string) => (dir === "down" ? size.get(k)![0] : size.get(k)![1]);
  const along = (k: string) => (dir === "down" ? size.get(k)![1] : size.get(k)![0]);
  // format version 11: a rank too wide for a scene that shows whole goes over several rows
  const WRAP_CHANNEL = 56, split = new Set<string[]>();
  if (fit && dir === "down") {
    for (let L = layers.length - 1; L >= 0; L--) {
      const rows: string[][] = [[]];
      // Split ranks need a line channel too: include that channel while choosing the rows.
      const full = layers[L].reduce((w, k) => w + across(k) + gap, -gap);
      const rowGap = full > fit ? Math.max(gap, WRAP_CHANNEL) : gap;
      let w = -rowGap;
      for (const k of layers[L]) {
        if (rows[rows.length - 1].length && w + rowGap + across(k) > fit) { rows.push([]); w = -rowGap; }
        rows[rows.length - 1].push(k); w += rowGap + across(k);
      }
      if (rows.length > 1) { layers.splice(L, 1, ...rows); for (const r of rows) split.add(r); }
    }
  }
  // rows of one rank leave a channel for the lines to the row behind
  const gapIn = layers.map((l, L) => (split.has(l) && L + 1 < layers.length && l.length > 1 ? Math.max(gap, WRAP_CHANNEL) : gap));
  const span = layers.map((l, L) => l.reduce((a, k) => a + across(k) + gapIn[L], -gapIn[L]));
  const maxSpan = Math.max(...span);
  let at = 0;
  layers.forEach((l, L) => {
    const thick = Math.max(...l.map(along));
    let c = (maxSpan - span[L]) / 2;
    for (const k of l) {
      const off = (thick - along(k)) / 2;
      if (dir === "down") set(k, c, at + off); else set(k, at + off, c);
      c += across(k) + gapIn[L];
    }
    at += thick + LAYER;
  });
  at -= LAYER;
  return dir === "down" ? [maxSpan, at] : [at, maxSpan];
}
