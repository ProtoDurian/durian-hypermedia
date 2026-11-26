// Lane render: a line between two rects that avoids the others (the rules of core/route.ts, SPEC 6.8):
// - a line leaves from the side that faces the other end; lines on one side FAN out by where they go (each end sits
//   along its side by the direction to the other end, so two lines from one side never cross there and never share a
//   point), and the place depends only on the two ends: a line whose ends do not move keeps its path (no jitter);
// - straight where the two sides face each other and nothing is in the way, else right angles (out, across, in) with
//   rounded corners, the middle leg in a free gap; when no simple way is free, a search of the free space finds a path
//   with more corners;
// - it never runs through a thing it does not end at (the containers that hold either end are not in its way), and,
//   in one frame, it keeps off the lines already drawn (no crossings where another way is free);
// - it stops PORT_GAP short of each outline, so the arrowhead sits on the outline.
// Output: an absolute SVG path (M, L, Q only), which pipeline.translatePath and the renderer's tween read.
import type { Rect, Relation } from "../types";

export const PORT_GAP = 3;     // a line stops this far from a shape
export const FAN = 16;         // lines on one side sit about this far apart
export const RADIUS = 10;      // a corner's radius
export const JOG_MIN = 24;     // ends closer than this sideways are joined by one straight line, not a step
export const LEAD = 12;        // a line leaves its side straight for at least this long before it turns
const CLEAR = 4;               // a line keeps this far from a thing it passes
const HEAD_W = 170, HEAD_H = 26; // a container's heading: its top-left words
const overlap = (p: Rect, q: Rect) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

type Pt = { x: number; y: number };
type Side = "t" | "b" | "l" | "r";
const vert = (s: Side) => s === "t" || s === "b";
const NORM: Record<Side, Pt> = { t: { x: 0, y: -1 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 }, r: { x: 1, y: 0 } };

/** lines already drawn in one frame (the pipeline makes one obstacles array per frame) */
const framed = new WeakMap<Rect[], Pt[][]>();

const cx = (r: Rect) => r.x + r.w / 2, cy = (r: Rect) => r.y + r.h / 2;
const inside = (o: Rect, r: Rect) => o.x <= r.x + 0.5 && o.y <= r.y + 0.5 && o.x + o.w >= r.x + r.w - 0.5 && o.y + o.h >= r.y + r.h - 0.5;

/** how far along a side an end may sit from its middle */
function room(r: Rect, s: Side): number { const len = vert(s) ? r.w : r.h; return Math.max(0, len / 2 - Math.min(10, len * 0.18)); }
/** the stateless fan: an end sits along its side by the direction to the other end (quantised, so tiny moves keep it) */
function fanOffset(a: Rect, s: Side, other: Pt): number {
  const dx = other.x - cx(a), dy = other.y - cy(a), along = vert(s) ? dx : dy, across = vert(s) ? Math.abs(dy) : Math.abs(dx);
  const k = along / (Math.abs(along) + across + 1e-6), o = room(a, s) * k;
  return Math.round(o / 4) * 4;
}
function port(r: Rect, s: Side, o: number): Pt {
  const oo = Math.max(-room(r, s), Math.min(room(r, s), o));
  switch (s) {
    case "t": return { x: cx(r) + oo, y: r.y - PORT_GAP };
    case "b": return { x: cx(r) + oo, y: r.y + r.h + PORT_GAP };
    case "l": return { x: r.x - PORT_GAP, y: cy(r) + oo };
    default: return { x: r.x + r.w + PORT_GAP, y: cy(r) + oo };
  }
}
const lead = (p: Pt, s: Side, d = LEAD): Pt => ({ x: p.x + NORM[s].x * d, y: p.y + NORM[s].y * d });

// ------------------------------------------------------------------ geometry tests
/** does the segment p-q (axis-aligned or not) pass through r? */
function segHits(p: Pt, q: Pt, r: Rect, m = CLEAR): boolean {
  const x0 = r.x - m, y0 = r.y - m, x1 = r.x + r.w + m, y1 = r.y + r.h + m;
  // Liang-Barsky clip
  let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
  const clip = (pp: number, qq: number) => { if (pp === 0) return qq >= 0; const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
  if (!clip(-dx, p.x - x0) || !clip(dx, x1 - p.x) || !clip(-dy, p.y - y0) || !clip(dy, y1 - p.y)) return false;
  return t1 - t0 > 1e-6;
}
function cross(p: Pt, p2: Pt, q: Pt, q2: Pt): boolean {
  const d = (p2.x - p.x) * (q2.y - q.y) - (p2.y - p.y) * (q2.x - q.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((q.x - p.x) * (q2.y - q.y) - (q.y - p.y) * (q2.x - q.x)) / d, u = ((q.x - p.x) * (p2.y - p.y) - (q.y - p.y) * (p2.x - p.x)) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}
/** two axis-aligned segments that run along each other closer than `apart` */
/** where two segments meet, each reaching 4 px past its ends (a corner that touches another line counts), or null */
function meet(p: Pt, p2: Pt, q: Pt, q2: Pt): Pt | null {
  const d = (p2.x - p.x) * (q2.y - q.y) - (p2.y - p.y) * (q2.x - q.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((q.x - p.x) * (q2.y - q.y) - (q.y - p.y) * (q2.x - q.x)) / d, u = ((q.x - p.x) * (p2.y - p.y) - (q.y - p.y) * (p2.x - p.x)) / d;
  const ep = 4 / (Math.hypot(p2.x - p.x, p2.y - p.y) || 1), eq = 4 / (Math.hypot(q2.x - q.x, q2.y - q.y) || 1);
  return t >= -ep && t <= 1 + ep && u >= -eq && u <= 1 + eq ? { x: p.x + t * (p2.x - p.x), y: p.y + t * (p2.y - p.y) } : null;
}
/** how often two lines cross away from their ends (as a reader sees it: a corner on another line is a crossing) */
function crossings(A: Pt[], B: Pt[]): number {
  const end = (x: Pt, L: Pt[]) => Math.hypot(x.x - L[0].x, x.y - L[0].y) < 12 || Math.hypot(x.x - L[L.length - 1].x, x.y - L[L.length - 1].y) < 12;
  const hits: Pt[] = [];
  for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) {
    const x = meet(A[i - 1], A[i], B[j - 1], B[j]);
    if (x && !end(x, A) && !end(x, B) && hits.every((h) => Math.hypot(h.x - x.x, h.y - x.y) > 6)) hits.push(x);
  }
  return hits.length;
}
function along(p: Pt, p2: Pt, q: Pt, q2: Pt, apart = 6): number {
  const h1 = Math.abs(p.y - p2.y) < 0.5, h2 = Math.abs(q.y - q2.y) < 0.5, v1 = Math.abs(p.x - p2.x) < 0.5, v2 = Math.abs(q.x - q2.x) < 0.5;
  if (h1 && h2 && Math.abs(p.y - q.y) < apart) { const lo = Math.max(Math.min(p.x, p2.x), Math.min(q.x, q2.x)), hi = Math.min(Math.max(p.x, p2.x), Math.max(q.x, q2.x)); return Math.max(0, hi - lo); }
  if (v1 && v2 && Math.abs(p.x - q.x) < apart) { const lo = Math.max(Math.min(p.y, p2.y), Math.min(q.y, q2.y)), hi = Math.min(Math.max(p.y, p2.y), Math.max(q.y, q2.y)); return Math.max(0, hi - lo); }
  return 0;
}
const len = (pts: Pt[]) => pts.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);

function score(pts: Pt[], obst: Rect[], others: Pt[][]): { score: number; hard: number } {
  let hard = 0, soft = 0;
  for (let i = 1; i < pts.length; i++) for (const o of obst) if (segHits(pts[i - 1], pts[i], o)) hard++;
  for (const ln of others) {
    soft += crossings(pts, ln);
    for (let i = 1; i < pts.length; i++) for (let j = 1; j < ln.length; j++) soft += along(pts[i - 1], pts[i], ln[j - 1], ln[j]) / 20;
  }
  // turning back (a leg against the way to the end) and corners cost a little
  const bends = Math.max(0, pts.length - 2);
  return { score: hard * 1000 + soft * 120 + bends * 14 + len(pts) * 0.05, hard };
}

// ------------------------------------------------------------------ candidates
/** the simple ways from side sa of a to side sb of b: straight, one corner (L), two corners (Z, U) */
function simple(a: Rect, b: Rect, sa: Side, sb: Side, gaps: { xs: number[]; ys: number[] }): Pt[][] {
  const out: Pt[][] = [];
  const pa = port(a, sa, fanOffset(a, sa, { x: cx(b), y: cy(b) })), pb = port(b, sb, fanOffset(b, sb, { x: cx(a), y: cy(a) }));
  const va = vert(sa), vb = vert(sb);
  if (va === vb) {
    const facing = (sa === "r" && sb === "l" && pb.x > pa.x) || (sa === "l" && sb === "r" && pb.x < pa.x) || (sa === "b" && sb === "t" && pb.y > pa.y) || (sa === "t" && sb === "b" && pb.y < pa.y);
    if (facing) {
      // straight: a common coordinate inside both sides
      const lo = va ? Math.max(cx(a) - room(a, sa), cx(b) - room(b, sb)) : Math.max(cy(a) - room(a, sa), cy(b) - room(b, sb));
      const hi = va ? Math.min(cx(a) + room(a, sa), cx(b) + room(b, sb)) : Math.min(cy(a) + room(a, sa), cy(b) + room(b, sb));
      const want = va ? (pa.x + pb.x) / 2 : (pa.y + pb.y) / 2;
      if (hi >= lo) { const c = Math.max(lo, Math.min(hi, want)); out.push(va ? [{ x: c, y: pa.y }, { x: c, y: pb.y }] : [{ x: pa.x, y: c }, { x: pb.x, y: c }]); }
      if (va ? Math.abs(pa.x - pb.x) < 0.5 : Math.abs(pa.y - pb.y) < 0.5) out.push([pa, pb]);
      // Z: out, across in a gap, in
      const mids = va ? gaps.ys.filter((g) => g > Math.min(pa.y, pb.y) + LEAD && g < Math.max(pa.y, pb.y) - LEAD) : gaps.xs.filter((g) => g > Math.min(pa.x, pb.x) + LEAD && g < Math.max(pa.x, pb.x) - LEAD);
      const mid = va ? (pa.y + pb.y) / 2 : (pa.x + pb.x) / 2;
      for (const m of [mid, ...mids.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid))].slice(0, 7)) out.push(va ? [pa, { x: pa.x, y: m }, { x: pb.x, y: m }, pb] : [pa, { x: m, y: pa.y }, { x: m, y: pb.y }, pb]);
    } else {
      // U: both out the same way, around
      const ea = lead(pa, sa, 18), eb = lead(pb, sb, 18);
      if (va) { const y = sa === "b" ? Math.max(ea.y, eb.y) : Math.min(ea.y, eb.y); out.push([pa, { x: pa.x, y }, { x: pb.x, y }, pb]); }
      else { const x = sa === "r" ? Math.max(ea.x, eb.x) : Math.min(ea.x, eb.x); out.push([pa, { x, y: pa.y }, { x, y: pb.y }, pb]); }
    }
  } else {
    // L: out of a, one corner, into b
    const c = va ? { x: pa.x, y: pb.y } : { x: pb.x, y: pa.y };
    const okA = va ? (sa === "b" ? c.y > pa.y + LEAD : c.y < pa.y - LEAD) : (sa === "r" ? c.x > pa.x + LEAD : c.x < pa.x - LEAD);
    const okB = vb ? (sb === "b" ? c.y > pb.y + LEAD : c.y < pb.y - LEAD) : (sb === "r" ? c.x > pb.x + LEAD : c.x < pb.x - LEAD);
    if (okA && okB) out.push([pa, c, pb]);
  }
  return out;
}

/** which sides face: the primary pair first, then the others that make sense */
function sidePairs(a: Rect, b: Rect): [Side, Side][] {
  const gx = b.x - (a.x + a.w) > 0 ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
  const gy = b.y - (a.y + a.h) > 0 ? b.y - (a.y + a.h) : a.y - (b.y + b.h);
  const right = cx(b) >= cx(a), below = cy(b) >= cy(a);
  const H: [Side, Side] = right ? ["r", "l"] : ["l", "r"], V: [Side, Side] = below ? ["b", "t"] : ["t", "b"];
  const L1: [Side, Side] = [H[0], V[1]], L2: [Side, Side] = [V[0], H[1]];
  const first = gx >= gy ? [H, V] : [V, H];
  const pairs: [Side, Side][] = [...first, L1, L2];
  // around: when they overlap in both directions or the facing way is blocked
  pairs.push([H[0], H[0]], [V[0], V[0]], [H[1], H[1]], [V[1], V[1]]);
  return pairs;
}

// ------------------------------------------------------------------ the search (more corners, when nothing simple is free)
function search(pa: Pt, sa: Side, pb: Pt, sb: Side, obst: Rect[], others: Pt[][], area: Rect): Pt[] | null {
  const s0 = lead(pa, sa), t0 = lead(pb, sb);
  const xs = new Set<number>([s0.x, t0.x]), ys = new Set<number>([s0.y, t0.y]);
  const M = CLEAR + 8;
  for (const o of obst) { xs.add(o.x - M); xs.add(o.x + o.w + M); ys.add(o.y - M); ys.add(o.y + o.h + M); }
  xs.add(area.x - 20); xs.add(area.x + area.w + 20); ys.add(area.y - 20); ys.add(area.y + area.h + 20);
  const X = [...xs].sort((p, q) => p - q), Y = [...ys].sort((p, q) => p - q);
  if (X.length * Y.length > 9000) return null;
  const W = X.length, key = (i: number, j: number) => j * W + i;
  const free = (p: Pt, q: Pt) => !obst.some((o) => segHits(p, q, o, CLEAR));
  const si = X.indexOf(s0.x), sj = Y.indexOf(s0.y), ti = X.indexOf(t0.x), tj = Y.indexOf(t0.y);
  // Dijkstra over (cell, direction): a corner costs, crossing a drawn line costs
  const dist = new Map<string, number>(), prev = new Map<string, string>();
  const q: [number, string][] = [];
  const push = (d: number, k: string) => { q.push([d, k]); };
  const start = `${key(si, sj)}:${vert(sa) ? 1 : 0}`;
  dist.set(start, 0); push(0, start);
  const crossCost = (p: Pt, r: Pt) => others.reduce((a, ln) => a + ln.slice(1).reduce((b, w, k) => b + (cross(p, r, ln[k], w) ? 60 : 0) + along(p, r, ln[k], w) * 3, 0), 0);
  let steps = 0;
  while (q.length && steps++ < 60000) {
    let bi = 0; for (let k = 1; k < q.length; k++) if (q[k][0] < q[bi][0]) bi = k;
    const [d, k] = q.splice(bi, 1)[0];
    if (d > (dist.get(k) ?? Infinity)) continue;
    const [cell, dir] = k.split(":").map(Number), i = cell % W, j = Math.floor(cell / W);
    if (i === ti && j === tj) {
      const pts: Pt[] = []; let cur: string | undefined = k;
      while (cur) { const c = +cur.split(":")[0]; pts.unshift({ x: X[c % W], y: Y[Math.floor(c / W)] }); cur = prev.get(cur); }
      return simplify([pa, ...pts, pb]);
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= Y.length) continue;
      const p = { x: X[i], y: Y[j] }, r = { x: X[ni], y: Y[nj] };
      if (!free(p, r)) continue;
      const nd = dj !== 0 ? 1 : 0, nk = `${key(ni, nj)}:${nd}`;
      const c = d + Math.hypot(r.x - p.x, r.y - p.y) + (nd !== dir ? 40 : 0) + crossCost(p, r);
      if (c < (dist.get(nk) ?? Infinity)) { dist.set(nk, c); prev.set(nk, k); push(c, nk); }
    }
  }
  return null;
}
/** drop points on a straight run */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 0.01 && Math.abs(out[out.length - 1].y - p.y) < 0.01) continue;
    if (out.length >= 2) { const a = out[out.length - 2], b = out[out.length - 1]; if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - p.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - p.y) < 0.01)) { out[out.length - 1] = p; continue; } }
    out.push(p);
  }
  return out;
}

// ------------------------------------------------------------------ the path
/** a polyline with rounded corners, as absolute M, L and Q commands */
export function roundedPath(pts: Pt[]): string {
  const f = (n: number) => +n.toFixed(1);
  if (pts.length < 2) return "M0 0";
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.max(0, Math.min(RADIUS, (i === 1 ? l1 : l1 / 2) - 1, (i === pts.length - 2 ? l2 - 6 : l2 / 2) - 1));
    const A = { x: c.x - ((c.x - p.x) / (l1 || 1)) * r, y: c.y - ((c.y - p.y) / (l1 || 1)) * r }, B = { x: c.x + ((n.x - c.x) / (l2 || 1)) * r, y: c.y + ((n.y - c.y) / (l2 || 1)) * r };
    d += `L${f(A.x)} ${f(A.y)}` + (r > 0.2 ? `Q${f(c.x)} ${f(c.y)} ${f(B.x)} ${f(B.y)}` : "");
  }
  const z = pts[pts.length - 1];
  return d + `L${f(z.x)} ${f(z.y)}`;
}

/** the points a path runs through (its corners; a Q's control point stands for the corner) */
export function pathPoints(d: string): Pt[] {
  const out: Pt[] = [];
  for (const m of d.matchAll(/([MLQHVCZ])([^MLQHVCZ]*)/g)) {
    const n = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    const last = out[out.length - 1] ?? { x: 0, y: 0 };
    if (m[1] === "M" || m[1] === "L") for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
    else if (m[1] === "H") out.push({ x: n[0], y: last.y });
    else if (m[1] === "V") out.push({ x: last.x, y: n[0] });
    else if (m[1] === "Q" && n.length >= 4) { out.push({ x: n[0], y: n[1] }, { x: n[2], y: n[3] }); }
    else if (m[1] === "C" && n.length >= 6) out.push({ x: n[4], y: n[5] });
  }
  return out;
}

/** A line from a to b around the other rects. Contract: render lane (ENGINE.md section 3). */
export function route(rel: Relation, a: Rect, b: Rect, obstacles: Rect[]): string {
  let others = framed.get(obstacles); if (!others) { others = []; framed.set(obstacles, others); }
  // the things in the way: not its ends, not what holds them (or is held by them), not a token's copy of an end
  const obst = obstacles.filter((o) => o !== a && o !== b && o.w > 2 && o.h > 2 && !inside(o, a) && !inside(o, b) && !inside(a, o) && !inside(b, o));
  // a container that holds an end is not in the way, but its heading is: a line never runs through a container's words
  for (const o of obstacles) if (o !== a && o !== b && (inside(o, a) || inside(o, b)) && !(inside(a, o) && inside(o, a)) && !(inside(b, o) && inside(o, b))) {
    const head = { x: o.x, y: o.y, w: Math.min(o.w, HEAD_W), h: HEAD_H };
    if (!overlap(head, a) && !overlap(head, b)) obst.push(head);
  }
  if (rel.from === rel.to || (inside(a, b) && inside(b, a))) {
    // a line to itself: a small loop on its right
    const p = { x: a.x + a.w + PORT_GAP, y: cy(a) - 8 }, q = { x: a.x + a.w + PORT_GAP, y: cy(a) + 8 };
    return roundedPath([p, { x: p.x + 22, y: p.y }, { x: q.x + 22, y: q.y }, q]);
  }
  const gaps = gapsBetween(a, b, obst);
  let best: { pts: Pt[]; score: number; hard: number } | null = null;
  // two things one above the other (or side by side) that share a span: a straight line in that span, clear of the lines
  // already there (a pair of lines both ways between two things runs as two parallel lines, never a crossing jog)
  for (const pts of [...parallels(a, b, others), ...beside(a, b, others), ...slides(a, b)]) { const sc = score(pts, obst, others); if (!best || sc.score < best.score) best = { pts, ...sc }; }
  for (const [sa, sb] of sidePairs(a, b)) {
    for (const pts of simple(a, b, sa, sb, gaps)) {
      const s = score(pts, obst, others);
      if (!best || s.score < best.score) best = { pts, ...s };
    }
    if (best && best.hard === 0 && best.score < 400) break;
  }
  if (!best || best.hard > 0) {
    const area = obstacles.reduce((u, r) => ({ x: Math.min(u.x, r.x), y: Math.min(u.y, r.y), w: Math.max(u.x + u.w, r.x + r.w) - Math.min(u.x, r.x), h: Math.max(u.y + u.h, r.y + r.h) - Math.min(u.y, r.y) }), { ...a });
    for (const [sa, sb] of sidePairs(a, b).slice(0, 4)) {
      const pa = port(a, sa, fanOffset(a, sa, { x: cx(b), y: cy(b) })), pb = port(b, sb, fanOffset(b, sb, { x: cx(a), y: cy(a) }));
      const pts = search(pa, sa, pb, sb, obst, others, area);
      if (pts) { const s = score(pts, obst, others); if (!best || s.score < best.score) best = { pts, ...s }; if (s.hard === 0) break; }
    }
  }
  const pts = best!.pts;
  others.push(pts);
  return roundedPath(pts);
}

/** straight lines between a and b inside the span they share (x when one is above the other, y when side by side), at
 * least 8 px from a line already drawn across that gap, nearest the middle of the span first */
function parallels(a: Rect, b: Rect, others: Pt[][]): Pt[][] {
  const out: Pt[][] = [];
  const above = a.y + a.h <= b.y || b.y + b.h <= a.y, beside = a.x + a.w <= b.x || b.x + b.w <= a.x;
  if (above === beside) return out;
  const vertical = above, lo = vertical ? Math.max(a.x, b.x) + 8 : Math.max(a.y, b.y) + 8, hi = vertical ? Math.min(a.x + a.w, b.x + b.w) - 8 : Math.min(a.y + a.h, b.y + b.h) - 8;
  if (hi < lo) return out;
  const taken: number[] = [];
  for (const ln of others) for (let j = 1; j < ln.length; j++) { const p = ln[j - 1], q = ln[j]; if (vertical && Math.abs(p.x - q.x) < 0.6) taken.push(p.x); if (!vertical && Math.abs(p.y - q.y) < 0.6) taken.push(p.y); }
  const mid = (lo + hi) / 2, at: number[] = [];
  for (let v = lo; v <= hi + 0.01; v += 4) if (taken.every((t) => Math.abs(t - v) >= 8)) at.push(v);
  at.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
  for (const v of at.slice(0, 3)) {
    if (vertical) { const down = b.y >= a.y + a.h; out.push([{ x: v, y: down ? a.y + a.h + PORT_GAP : a.y - PORT_GAP }, { x: v, y: down ? b.y - PORT_GAP : b.y + b.h + PORT_GAP }]); }
    else { const right = b.x >= a.x + a.w; out.push([{ x: right ? a.x + a.w + PORT_GAP : a.x - PORT_GAP, y: v }, { x: right ? b.x - PORT_GAP : b.x + b.w + PORT_GAP, y: v }]); }
  }
  return out;
}
/** one-corner lines that leave a's side facing b from any point along it (every 8 px) and enter b from the side: when the
 * fanned port's way is blocked (a heading in the way) a point further along the side is often free */
function slides(a: Rect, b: Rect): Pt[][] {
  const out: Pt[][] = [], g = PORT_GAP;
  const below = b.y >= a.y + a.h, above = b.y + b.h <= a.y, right = b.x >= a.x + a.w, left = b.x + b.w <= a.x;
  if (below || above) {
    const y0 = below ? a.y + a.h + g : a.y - g, y = cy(b);
    for (let x = a.x + 8; x <= a.x + a.w - 8; x += 8) {
      if (x < b.x - 6) out.push([{ x, y: y0 }, { x, y }, { x: b.x - g, y }]);
      else if (x > b.x + b.w + 6) out.push([{ x, y: y0 }, { x, y }, { x: b.x + b.w + g, y }]);
    }
  }
  if (right || left) {
    const x0 = right ? a.x + a.w + g : a.x - g, x = cx(b);
    for (let y = a.y + 8; y <= a.y + a.h - 8; y += 8) {
      if (y < b.y - 6) out.push([{ x: x0, y }, { x, y }, { x, y: b.y - g }]);
      else if (y > b.y + b.h + 6) out.push([{ x: x0, y }, { x, y }, { x, y: b.y + b.h + g }]);
    }
  }
  return out;
}
/** a line's course at right angles: its straight legs only (the points a rounded corner adds dropped), met at corners */
function orth(pts: Pt[]): Pt[] | null {
  const legs: { h: boolean; a: Pt; b: Pt }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], h = Math.abs(p.y - q.y) < 0.6, v = Math.abs(p.x - q.x) < 0.6;
    if ((!h && !v) || Math.hypot(q.x - p.x, q.y - p.y) < 2) continue;
    const last = legs[legs.length - 1];
    if (last && last.h === h) last.b = q; else legs.push({ h, a: p, b: q });
  }
  if (!legs.length) return null;
  const out: Pt[] = [{ ...legs[0].a }];
  for (let i = 1; i < legs.length; i++) { const A = legs[i - 1], B = legs[i]; out.push(A.h ? { x: B.a.x, y: A.a.y } : { x: A.a.x, y: B.a.y }); }
  out.push({ ...legs[legs.length - 1].b });
  return out;
}
/** a line already drawn between the same two things (the other way, often a layout's own): the same course moved 8 or
 * 12 px to one side, its ends kept on their sides, so a pair both ways runs side by side instead of across */
function beside(a: Rect, b: Rect, others: Pt[][]): Pt[][] {
  const near = (p: Pt, r: Rect) => p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6;
  const out: Pt[][] = [];
  for (const ln of others) {
    if (ln.length < 2) continue;
    const s0 = ln[0], e0 = ln[ln.length - 1];
    const raw = near(s0, a) && near(e0, b) ? ln : near(s0, b) && near(e0, a) ? [...ln].reverse() : null;
    const course = raw && orth(raw);
    if (!course || course.length < 2) continue;
    for (const d of [8, -8, 12, -12]) {
      // each straight leg moves d px to the same side of its way (a true parallel: the copy never crosses its course);
      // the ends slide along their sides
      const legs = course.slice(1).map((q, i) => { const p0 = course[i], h = Math.abs(p0.y - q.y) < 0.6, dir = h ? Math.sign(q.x - p0.x) : Math.sign(q.y - p0.y); return { h, c: h ? p0.y - dir * d : p0.x + dir * d }; });
      const p: Pt[] = [legs[0].h ? { x: course[0].x, y: legs[0].c } : { x: legs[0].c, y: course[0].y }];
      for (let i = 1; i < legs.length; i++) { const A = legs[i - 1], B = legs[i]; p.push(A.h ? { x: B.c, y: A.c } : { x: A.c, y: B.c }); }
      const L = legs[legs.length - 1], e = course[course.length - 1];
      p.push(L.h ? { x: e.x, y: L.c } : { x: L.c, y: e.y });
      out.push(p);
    }
  }
  return out;
}
/** free coordinates for a middle leg: the gaps between the things between the two ends (both axes) */
function gapsBetween(a: Rect, b: Rect, obst: Rect[]): { xs: number[]; ys: number[] } {
  const xs: number[] = [], ys: number[] = [];
  const x0 = Math.min(a.x + a.w, b.x + b.w), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y + a.h, b.y + b.h), y1 = Math.max(a.y, b.y);
  for (const o of obst) {
    if (o.x + o.w < x0 || o.x > x1) { /* not between on x */ } else { xs.push(o.x - 10, o.x + o.w + 10); }
    if (o.y + o.h < y0 || o.y > y1) { /* not between on y */ } else { ys.push(o.y - 10, o.y + o.h + 10); }
  }
  return { xs, ys };
}

/** A line a layout routed itself (Placed.routes) in this frame: the router keeps its own lines off it as it does off
 * its own. The pipeline calls it with the frame's obstacles array, as route(). */
export function routeTaken(obstacles: Rect[], d: string): void {
  let others = framed.get(obstacles); if (!others) { others = []; framed.set(obstacles, others); }
  others.push(pathPoints(d));
}
