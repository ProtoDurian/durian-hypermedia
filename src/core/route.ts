// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// route (format version 10): how a line runs between two things.
//   - Each line leaves a thing from a point on the side facing the other thing. Several lines on one side fan out:
//     their points are spread along the side (16 apart), in the order of where they go, so they never cross there.
//   - A line is straight where the two points face each other and nothing is in the way; else it runs at right angles
//     (down, across, down) with rounded corners. A line around something in its way takes the least detour that
//     clears it (over, under or beside it) and never swings past its target.
//   - The router tries the simple ways first and keeps the first that crosses no word, no thing and no other line;
//     a send drawn beside a connector runs parallel to it, on the same path.
// A route is stored relative to the two things (which side, how far along it, where the middle leg is), so a line
// follows its ends while they move, in 2D and in 3D.

export interface RPt { x: number; y: number }
// kind: the thing's shape (a pill's round ends and a cylinder's caps leave less of a side for lines)
export interface RRect { x: number; y: number; w: number; h: number; kind?: string }
// one cubic piece; a routed line is several (straight pieces and rounded corners), kept in segs with their lengths
export interface Cubic { P: RPt; c1: RPt; c2: RPt; Q: RPt; segs?: Cubic[]; lens?: number[] }
export type Side = "t" | "b" | "l" | "r";
// sa, sb: the side each end leaves from; oa, ob: how far along it from its middle (units); m: where the middle leg
// runs: for a line between facing sides, that share of the way (0..1); around a thing (both ends on one side), this
// far beyond the outer of the two sides; for one corner (an L), unused. way: the corners of a path found in the free
// space (when no simple way is clean), with ca, cb: where the two things' centres were then (a corner moves with the
// ends: the first with a, the last with b, those between in proportion)
// line: one straight line between the two points whatever their offset (a tree's edges: diagonal, the usual look)
export interface Route { sa: Side; sb: Side; oa: number; ob: number; m: number; way?: RPt[]; ca?: RPt; cb?: RPt; line?: boolean }

export const PORT_GAP = 3; // a line stops this far from a shape
export const FAN = 16; // lines on one side sit this far apart
export const RADIUS = 10; // a corner's radius
export const JOG_MIN = 24; // ends closer than this sideways are joined by one straight line, not a step
const NORM: Record<Side, RPt> = { t: { x: 0, y: -1 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 }, r: { x: 1, y: 0 } };
const OPP: Record<Side, Side> = { t: "b", b: "t", l: "r", r: "l" };
const vertSide = (s: Side) => s === "t" || s === "b";

// how far along a side an end may sit: the side's half length, less the corner
export function sideRoom(r: RRect, s: Side): number {
  const v = vertSide(s), len = v ? r.w : r.h;
  switch (r.kind) {
    case "pill": return Math.max(0, v ? r.w / 2 - r.h / 2 + 2 : r.h * 0.22);
    case "cylinder": return Math.max(0, v ? len / 2 - 8 : len / 2 - 12);
    case "cloud": case "person": case "dot": return len * 0.22;
    default: return Math.max(0, len / 2 - Math.min(8, len * 0.15));
  }
}
// the point on side s, o along it from its middle, PORT_GAP out
export function portAt(r: RRect, s: Side, o: number): RPt {
  const room = sideRoom(r, s), oo = Math.max(-room, Math.min(room, o));
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  switch (s) {
    case "t": return { x: cx + oo, y: r.y - PORT_GAP };
    case "b": return { x: cx + oo, y: r.y + r.h + PORT_GAP };
    case "l": return { x: r.x - PORT_GAP, y: cy + oo };
    default: return { x: r.x + r.w + PORT_GAP, y: cy + oo };
  }
}
export const flipRoute = (rt: Route): Route => ({ sa: rt.sb, sb: rt.sa, oa: rt.ob, ob: rt.oa, m: OPP[rt.sa] === rt.sb ? 1 - rt.m : rt.m, ...(rt.line ? { line: true } : {}), ...(rt.way ? { way: [...rt.way].reverse(), ca: rt.cb, cb: rt.ca } : {}) });
// a line between two steps (format version 10): its ends slide along their sides and its middle leg moves, rather
// than jumping, when the line keeps its sides; else it takes its new way at once
export function lerpRoute(a: Route | null | undefined, b: Route | null | undefined, t: number): Route | null {
  if (!b) return b ?? null;
  if (!a || t >= 1 || a.way || b.way || a.sa !== b.sa || a.sb !== b.sb) return b;
  return { ...b, oa: a.oa + (b.oa - a.oa) * t, ob: a.ob + (b.ob - a.ob) * t, m: a.m + (b.m - a.m) * t };
}
export type Shape = "straight" | "z" | "l" | "u" | "way" | "bad";
export function routeShape(a: RRect, b: RRect, rt: Route): Shape {
  if (rt.way) return "way";
  if (rt.line) return "straight";
  const P = portAt(a, rt.sa, rt.oa), Q = portAt(b, rt.sb, rt.ob), na = NORM[rt.sa], nb = NORM[rt.sb];
  if (OPP[rt.sa] === rt.sb) {
    if ((Q.x - P.x) * na.x + (Q.y - P.y) * na.y <= 4) return "bad";
    const jog = vertSide(rt.sa) ? Math.abs(Q.x - P.x) : Math.abs(Q.y - P.y);
    return jog < JOG_MIN ? "straight" : "z";
  }
  if (rt.sa === rt.sb) return "u";
  const C = vertSide(rt.sa) ? { x: P.x, y: Q.y } : { x: Q.x, y: P.y };
  return (C.x - P.x) * na.x + (C.y - P.y) * na.y > 6 && (C.x - Q.x) * nb.x + (C.y - Q.y) * nb.y > 6 ? "l" : "bad";
}
// the corners of a route, from a's point to b's
export function routePts(a: RRect, b: RRect, rt: Route): RPt[] {
  const P = portAt(a, rt.sa, rt.oa), Q = portAt(b, rt.sb, rt.ob);
  if (rt.way) {
    const da = rt.ca ? { x: a.x + a.w / 2 - rt.ca.x, y: a.y + a.h / 2 - rt.ca.y } : { x: 0, y: 0 }, db = rt.cb ? { x: b.x + b.w / 2 - rt.cb.x, y: b.y + b.h / 2 - rt.cb.y } : { x: 0, y: 0 };
    const n = rt.way.length;
    return [P, ...rt.way.map((p, i) => { const t = n < 2 ? 0.5 : i / (n - 1); return { x: p.x + da.x + (db.x - da.x) * t, y: p.y + da.y + (db.y - da.y) * t }; }), Q];
  }
  const sh = routeShape(a, b, rt);
  if (sh === "straight" || sh === "bad") return [P, Q];
  if (sh === "z") {
    if (vertSide(rt.sa)) { const y = P.y + (Q.y - P.y) * rt.m; return [P, { x: P.x, y }, { x: Q.x, y }, Q]; }
    const x = P.x + (Q.x - P.x) * rt.m; return [P, { x, y: P.y }, { x, y: Q.y }, Q];
  }
  if (sh === "l") return [P, vertSide(rt.sa) ? { x: P.x, y: Q.y } : { x: Q.x, y: P.y }, Q];
  // around: both ends on one side, the middle leg rt.m beyond the outer of the two
  const d = Math.max(8, rt.m);
  switch (rt.sa) {
    case "t": { const y = Math.min(P.y, Q.y) - d; return [P, { x: P.x, y }, { x: Q.x, y }, Q]; }
    case "b": { const y = Math.max(P.y, Q.y) + d; return [P, { x: P.x, y }, { x: Q.x, y }, Q]; }
    case "l": { const x = Math.min(P.x, Q.x) - d; return [P, { x, y: P.y }, { x, y: Q.y }, Q]; }
    default: { const x = Math.max(P.x, Q.x) + d; return [P, { x, y: P.y }, { x, y: Q.y }, Q]; }
  }
}
// the same polyline moved off to the right of its way (an arrow beside a connector)
export function offsetPts(pts: RPt[], off: number): RPt[] {
  if (!off || pts.length < 2) return pts;
  const nrm = (p: RPt, q: RPt) => { const L = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (-(q.y - p.y) / L) * off, y: ((q.x - p.x) / L) * off }; };
  const segs = pts.slice(1).map((q, i) => { const n = nrm(pts[i], q); return [{ x: pts[i].x + n.x, y: pts[i].y + n.y }, { x: q.x + n.x, y: q.y + n.y }]; });
  const out: RPt[] = [segs[0][0]];
  for (let i = 1; i < segs.length; i++) {
    const [p, p2] = segs[i - 1], [q, q2] = segs[i];
    const r = { x: p2.x - p.x, y: p2.y - p.y }, s = { x: q2.x - q.x, y: q2.y - q.y }, d = r.x * s.y - r.y * s.x;
    if (Math.abs(d) < 1e-9) { out.push(q); continue; }
    const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / d;
    out.push({ x: p.x + r.x * t, y: p.y + r.y * t });
  }
  out.push(segs[segs.length - 1][1]);
  return out;
}
const line = (A: RPt, B: RPt): Cubic => ({ P: A, c1: { x: A.x + (B.x - A.x) / 3, y: A.y + (B.y - A.y) / 3 }, c2: { x: A.x + ((B.x - A.x) * 2) / 3, y: A.y + ((B.y - A.y) * 2) / 3 }, Q: B });
// a polyline with rounded corners, as cubic pieces. A corner's radius is at most RADIUS, half of a middle leg (less 16,
// so a straight stretch stays between two turns), and leaves the last leg 10 units of straight line for the head
export function roundPts(pts: RPt[]): Cubic {
  if (pts.length < 3) return line(pts[0], pts[pts.length - 1]);
  const L = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  const pieces: Cubic[] = [];
  let cur = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const inL = L[i - 1], outL = L[i];
    const rin = i === 1 ? inL - 2 : (inL - 16) / 2, rout = i + 2 === pts.length ? outL - 10 : (outL - 16) / 2;
    const r = Math.max(0, Math.min(RADIUS, rin, rout));
    const C = pts[i], di = { x: (C.x - pts[i - 1].x) / (inL || 1), y: (C.y - pts[i - 1].y) / (inL || 1) }, dout = { x: (pts[i + 1].x - C.x) / (outL || 1), y: (pts[i + 1].y - C.y) / (outL || 1) };
    const A = { x: C.x - di.x * r, y: C.y - di.y * r }, B = { x: C.x + dout.x * r, y: C.y + dout.y * r };
    if (Math.hypot(A.x - cur.x, A.y - cur.y) > 0.01) pieces.push(line(cur, A));
    if (r > 0.01) { const k = 0.5523 * r; pieces.push({ P: A, c1: { x: A.x + di.x * k, y: A.y + di.y * k }, c2: { x: B.x - dout.x * k, y: B.y - dout.y * k }, Q: B }); }
    cur = B;
  }
  pieces.push(line(cur, pts[pts.length - 1]));
  if (pieces.length === 1) return pieces[0];
  const lens = pieces.map((c) => { const ch = Math.hypot(c.Q.x - c.P.x, c.Q.y - c.P.y), poly = Math.hypot(c.c1.x - c.P.x, c.c1.y - c.P.y) + Math.hypot(c.c2.x - c.c1.x, c.c2.y - c.c1.y) + Math.hypot(c.Q.x - c.c2.x, c.Q.y - c.c2.y); return (ch + poly) / 2; });
  return { P: pieces[0].P, c1: pieces[0].c1, c2: pieces[pieces.length - 1].c2, Q: pieces[pieces.length - 1].Q, segs: pieces, lens };
}
export function routeGeom(a: RRect, b: RRect, rt: Route, off = 0, ak?: string, bk?: string): Cubic { return roundPts(offsetPts(routePts(ak ? { ...a, kind: ak } : a, bk ? { ...b, kind: bk } : b, rt), off)); }
// which piece t falls on (t over the whole line, by length), and t inside it
export function pieceAt(g: Cubic, t: number): [Cubic, number] {
  if (!g.segs || !g.lens) return [g, t];
  const total = g.lens.reduce((x, y) => x + y, 0);
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < g.segs.length; i++) { if (d <= g.lens[i] || i === g.segs.length - 1) return [g.segs[i], g.lens[i] ? Math.max(0, Math.min(1, d / g.lens[i])) : 0]; d -= g.lens[i]; }
  return [g.segs[g.segs.length - 1], 1];
}
// the polyline the router scores and the checks read: straight pieces as they are, each corner as 8 short pieces
export function routeLine(g: Cubic): RPt[] {
  const ps = g.segs ?? [g];
  const out: RPt[] = [ps[0].P];
  for (const c of ps) {
    const straight = Math.abs((c.c1.x - c.P.x) * (c.Q.y - c.P.y) - (c.c1.y - c.P.y) * (c.Q.x - c.P.x)) < 1e-6 && Math.abs((c.c2.x - c.P.x) * (c.Q.y - c.P.y) - (c.c2.y - c.P.y) * (c.Q.x - c.P.x)) < 1e-6;
    if (!straight) for (const t of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) { const u = 1 - t; out.push({ x: u * u * u * c.P.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * c.Q.x, y: u * u * u * c.P.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * c.Q.y }); }
    out.push(c.Q);
  }
  return out;
}

// ---------------------------------------------------------------- geometry the router and the check share
const sub = (a: RPt, b: RPt) => ({ x: a.x - b.x, y: a.y - b.y });
const crs = (a: RPt, b: RPt) => a.x * b.y - a.y * b.x;
export function segX(p: RPt, p2: RPt, q: RPt, q2: RPt): RPt | null {
  const r = sub(p2, p), s = sub(q2, q), d = crs(r, s);
  if (Math.abs(d) < 1e-9) return null;
  const t = crs(sub(q, p), s) / d, u = crs(sub(q, p), r) / d;
  // ends included: a line through the very corner of another still crosses it
  const e = 1e-9;
  return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e ? { x: p.x + r.x * t, y: p.y + r.y * t } : null;
}
export function distSeg(p: RPt, a: RPt, b: RPt): number {
  const ab = sub(b, a), L = ab.x * ab.x + ab.y * ab.y;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / L)) : 0;
  return Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t);
}
export function rectThrough(pts: RPt[], r: RRect, m = 1.5): boolean {
  const x0 = r.x + m, y0 = r.y + m, x1 = r.x + r.w - m, y1 = r.y + r.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    let t0 = 0, t1 = 1;
    const dx = q.x - p.x, dy = q.y - p.y;
    const clip = (pp: number, qq: number) => { if (pp === 0) return qq >= 0; const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    if (clip(-dx, p.x - x0) && clip(dx, x1 - p.x) && clip(-dy, p.y - y0) && clip(dy, y1 - p.y) && t0 <= t1) return true;
  }
  return false;
}
const bbox = (pts: RPt[]) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { x0, y0, x1, y1 }; };
// a line already on the stage, for the router: its points, its two ends (things' keys), its end points
export interface Placed { pts: RPt[]; ends: [number, number]; at: [RPt, RPt]; box: { x0: number; y0: number; x1: number; y1: number } }
export const placed = (pts: RPt[], ends: [number, number]): Placed => ({ pts, ends, at: [pts[0], pts[pts.length - 1]], box: bbox(pts) });
// how two lines meet: crossings and touches away from a thing they share, and ends that share a point on one thing
export function meet(A: Placed, B: Placed): { cross: number; touch: number; bunch: number } {
  const same = (A.ends[0] === B.ends[0] && A.ends[1] === B.ends[1]) || (A.ends[0] === B.ends[1] && A.ends[1] === B.ends[0]);
  if (same) return { cross: 0, touch: 0, bunch: 0 };
  const near: RPt[] = [];
  let bunch = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (A.ends[i] === B.ends[j]) { near.push(A.at[i], B.at[j]); if (Math.hypot(A.at[i].x - B.at[j].x, A.at[i].y - B.at[j].y) < 6) bunch++; }
  if (A.box.x1 < B.box.x0 - 3 || B.box.x1 < A.box.x0 - 3 || A.box.y1 < B.box.y0 - 3 || B.box.y1 < A.box.y0 - 3) return { cross: 0, touch: 0, bunch };
  const ok = (p: RPt) => !near.some((n) => Math.hypot(p.x - n.x, p.y - n.y) < 14);
  for (let a = 0; a + 1 < A.pts.length; a++) for (let b = 0; b + 1 < B.pts.length; b++) { const x = segX(A.pts[a], A.pts[a + 1], B.pts[b], B.pts[b + 1]); if (x && ok(x)) return { cross: 1, touch: 0, bunch }; }
  // touch: two nearly parallel pieces less than 3 apart, side by side for 8 units or more (away from a shared end)
  for (let a = 0; a + 1 < A.pts.length; a++) {
    const p = A.pts[a], q = A.pts[a + 1], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
    if (L < 8) continue;
    const ux = dx / L, uy = dy / L;
    for (let b = 0; b + 1 < B.pts.length; b++) {
      const s = B.pts[b], t = B.pts[b + 1], ex = t.x - s.x, ey = t.y - s.y, M = Math.hypot(ex, ey);
      if (M < 8 || Math.abs(ux * ey - uy * ex) / M > 0.08) continue;
      // how far apart, and how much they overlap along A's direction
      if (Math.abs((s.x - p.x) * uy - (s.y - p.y) * ux) >= 3) continue;
      const t0 = (s.x - p.x) * ux + (s.y - p.y) * uy, t1 = (t.x - p.x) * ux + (t.y - p.y) * uy;
      const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(L, Math.max(t0, t1));
      if (hi - lo < 8) continue;
      const mid = { x: p.x + ux * (lo + hi) / 2, y: p.y + uy * (lo + hi) / 2 };
      if (ok(mid)) return { cross: 0, touch: 1, bunch };
    }
  }
  return { cross: 0, touch: 0, bunch };
}

// ---------------------------------------------------------------- the router
export interface RBox extends RRect { key: number; kind: string }
// ga, gb: the outermost container around a that does not hold b (and the other way round), or the thing itself: the
// middle leg of a step runs in the free gap between them, not inside a container. area: where a line may run (the
// scene and a margin)
// conts: the containers' outlines (a line crosses them, but does not run along them)
export interface Req { id: string; a: RBox; b: RBox; words: RRect[]; shapes: RRect[]; ga?: RRect; gb?: RRect; area?: RRect; conts?: RRect[] }
// clean: it crosses no word, no thing and no other line, meets no line at one point and never turns back
export interface Choice { rt: Route | null; score: number; pts: RPt[]; clean: boolean; hard: number }
// lines that keep their old way: a circle's lines run along the line between the centres (a tree's edges)
export const routable = (a: RBox, b: RBox) => a.kind !== "circle" && b.kind !== "circle" && a.key !== b.key;
// the sides a line between a and b leaves from: the facing sides across the wider gap
export function facing(a: RRect, b: RRect): [Side, Side] | null {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const gx = Math.abs(cb.x - ca.x) - (a.w + b.w) / 2, gy = Math.abs(cb.y - ca.y) - (a.h + b.h) / 2;
  if (gx <= 0 && gy <= 0) return null;
  if (gy > gx) return cb.y > ca.y ? ["b", "t"] : ["t", "b"];
  return cb.x > ca.x ? ["r", "l"] : ["l", "r"];
}
// spread the ends on each side of each thing: in the order of where their lines go, FAN apart (less on a short side),
// each as near as it can be to where it wants to be
// want: where the end would sit (for a straight line, or the side's middle); sure: a straight line is possible, so its
// want weighs more than a middle's
export interface End { req: number; end: 0 | 1; box: RBox; side: Side; other: RBox; want: number; sure?: boolean }
export function fanOut(ends: End[]): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, End[]>();
  for (const e of ends) { const k = `${e.box.key}:${e.side}`; groups.set(k, [...(groups.get(k) ?? []), e]); }
  for (const g of groups.values()) {
    const v = vertSide(g[0].side), b = g[0].box, room = sideRoom(b, g[0].side);
    const along = (r: RRect) => (v ? r.x + r.w / 2 - (b.x + b.w / 2) : r.y + r.h / 2 - (b.y + b.h / 2));
    // ends going to one row (the same place along the side): the line that goes farther runs on the outside of the turn
    const far = (r: RRect) => (v ? Math.abs(r.y + r.h / 2 - (b.y + b.h / 2)) : Math.abs(r.x + r.w / 2 - (b.x + b.w / 2)));
    g.sort((p, q) => { const d = along(p.other) - along(q.other); if (Math.abs(d) > 1) return d; const turn = Math.sign(along(p.other)); return (turn > 0 ? far(q.other) - far(p.other) : turn < 0 ? far(p.other) - far(q.other) : 0) || p.want - q.want || p.req - q.req; });
    const s = g.length > 1 ? Math.min(FAN, (2 * room) / (g.length - 1)) : 0;
    // the nearest spread to what each end wants, s apart, in order (weighted least squares: pool adjacent violators
    // on want - i*s)
    const y = g.map((e, i) => Math.max(-room, Math.min(room, e.want)) - i * s);
    const blocks: { v: number; n: number; w: number }[] = [];
    y.forEach((v, i) => { const w = g[i].sure ? 6 : 1; blocks.push({ v, n: 1, w }); while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) { const b2 = blocks.pop()!, b1 = blocks.pop()!; blocks.push({ v: (b1.v * b1.w + b2.v * b2.w) / (b1.w + b2.w), n: b1.n + b2.n, w: b1.w + b2.w }); } });
    const pos: number[] = [];
    for (const b of blocks) for (let k = 0; k < b.n; k++) pos.push(b.v + pos.length * s);
    // back inside the side, as a block if it must
    const lo = pos[0], hi = pos[pos.length - 1];
    const shift = lo < -room ? -room - lo : hi > room ? room - hi : 0;
    g.forEach((e, i) => out.set(`${e.req}:${e.end}`, pos[i] + shift));
  }
  return out;
}
// where an end would sit for a straight line: the middle of the overlap of the two facing sides, nearest the middle
// between the two things; else the side's middle
export const canStraight = (a: RRect, b: RRect, sa: Side) => straightWant(a, b, sa, true) !== 0;
export function straightWant(a: RRect, b: RRect, sa: Side, ask = false): number {
  const v = vertSide(sa);
  const a0 = v ? a.x : a.y, a1 = a0 + (v ? a.w : a.h), b0 = v ? b.x : b.y, b1 = b0 + (v ? b.w : b.h);
  const ra = sideRoom(a, sa), rb = sideRoom(b, OPP[sa]);
  const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
  const lo = Math.max(ca - ra, cb - rb), hi = Math.min(ca + ra, cb + rb);
  if (lo > hi) return 0;
  if (ask) return 1;
  return Math.max(lo, Math.min(hi, (ca + cb) / 2)) - ca;
}
const MS = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8, 0.12, 0.88];
const DS = [12, 18, 26, 36, 48, 62, 80, 100];
// where the middle leg of a step between facing sides may run: first in the free gap between ga and gb (its middle,
// then 8, 16 ... either side), then anywhere between the two ends; as shares of the way from a's end to b's
// shapes, conts: the things and containers in between; the middle of each gap between two of their edges (that no
// thing spans) is tried next
export function channels(a: RRect, b: RRect, rt: Route, ga: RRect = a, gb: RRect = b, shapes: RRect[] = [], conts: RRect[] = []): { m: number; cost: number }[] {
  const gaps = [...shapes, ...conts];
  const P = portAt(a, rt.sa, rt.oa), Q = portAt(b, rt.sb, rt.ob), v = vertSide(rt.sa);
  const p = v ? P.y : P.x, q = v ? Q.y : Q.x, span = q - p;
  if (Math.abs(span) < 1e-6) return [{ m: 0.5, cost: 0 }];
  const out: { m: number; cost: number }[] = [];
  const edge = (r: RRect, s: Side) => (s === "t" ? r.y : s === "b" ? r.y + r.h : s === "l" ? r.x : r.x + r.w);
  const lo = edge(ga, rt.sa), hi = edge(gb, rt.sb), dir = Math.sign(span);
  if ((hi - lo) * dir > 16) {
    const mid = (lo + hi) / 2, half = Math.abs(hi - lo) / 2 - 6;
    for (const d of [0, 8, -8, 16, -16, 24, -24, 34, -34, 46, -46]) if (Math.abs(d) <= half) out.push({ m: (mid + d - p) / span, cost: Math.abs(d) / 8 });
  }
  // the middles of the gaps between things and containers along the way
  if (gaps.length) {
    const e: [number, number][] = gaps.map((g) => (v ? [g.y, g.y + g.h] : [g.x, g.x + g.w]));
    const lo2 = Math.min(p, q) + 8, hi2 = Math.max(p, q) - 8;
    const edges = [...new Set(e.flat())].filter((x) => x > lo2 - 20 && x < hi2 + 20).sort((x, y) => x - y);
    for (let i = 0; i + 1 < edges.length; i++) {
      const mid = (edges[i] + edges[i + 1]) / 2;
      if (edges[i + 1] - edges[i] < 12 || mid < lo2 || mid > hi2) continue;
      // a real gap: no outline spans its middle
      if (shapes.some((g) => (v ? g.y : g.x) < mid - 1 && (v ? g.y + g.h : g.x + g.w) > mid + 1)) continue;
      const nearEdge = conts.some((g) => Math.min(Math.abs((v ? g.y : g.x) - mid), Math.abs((v ? g.y + g.h : g.x + g.w) - mid)) < 7);
      out.push({ m: (mid - p) / span, cost: 2 + Math.abs((mid - p) / span - 0.5) * 4 + (nearEdge ? 3 : 0) });
    }
  }
  for (const m of MS) out.push({ m, cost: 4 + Math.abs(m - 0.5) * 6 });
  return out;
}
// every way worth trying for one line, the simplest first (each with its cost of shape)
export function candidates(a: RBox, b: RBox, base: Route | null, ga?: RRect, gb?: RRect, shapes: RRect[] = [], conts: RRect[] = []): { rt: Route; cost: number }[] {
  const out: { rt: Route; cost: number }[] = [];
  const add = (rt: Route, cost: number) => { const sh = routeShape(a, b, rt); if (sh !== "bad") out.push({ rt, cost: cost + (sh === "straight" ? 0 : sh === "z" ? 3 : sh === "l" ? 5 : 14) }); };
  if (base) { const sh = routeShape(a, b, base); for (const c of sh === "z" ? channels(a, b, base, ga, gb, shapes, conts) : [{ m: base.m, cost: 0 }]) add({ ...base, m: c.m }, c.cost); }
  // the base ends moved along their sides (both together, so a straight line stays straight)
  if (base && OPP[base.sa] === base.sb) for (const d of [FAN, -FAN, 2 * FAN, -2 * FAN]) { const b2 = { ...base, oa: base.oa + d, ob: base.ob + d }; for (const c of routeShape(a, b, b2) === "z" ? channels(a, b, b2, ga, gb, shapes, conts).slice(0, 6) : [{ m: 0.5, cost: 0 }]) add({ ...b2, m: c.m }, 2 + Math.abs(d) / FAN + c.cost); }
  // the other pairs of facing sides, ends where a straight line wants them
  const pairs: [Side, Side][] = [["b", "t"], ["t", "b"], ["r", "l"], ["l", "r"]];
  for (const [sa, sb] of pairs) {
    if (base && sa === base.sa && sb === base.sb) continue;
    const w = straightWant(a, b, sa);
    const b2 = { sa, sb, oa: w, ob: straightWant(b, a, sb), m: 0.5 };
    for (const c of routeShape(a, b, b2) === "z" ? channels(a, b, b2, ga, gb, shapes, conts).slice(0, 8) : [{ m: 0.5, cost: 0 }]) add({ ...b2, m: c.m }, 4 + c.cost);
  }
  // an end on a side the fan did not plan: its middle, or FAN either way (so it meets no other line at one point)
  const offs = (s: Side, side: Side | undefined, o: number | undefined) => (side === s && o != null ? [o] : [0, FAN, -FAN, 2 * FAN, -2 * FAN]);
  // one corner: leave one way, arrive from the side
  for (const sa of ["t", "b", "l", "r"] as Side[]) for (const sb of ["t", "b", "l", "r"] as Side[]) if (vertSide(sa) !== vertSide(sb)) for (const oa of offs(sa, base?.sa, base?.oa)) for (const ob of offs(sb, base?.sb, base?.ob)) add({ sa, sb, oa, ob, m: 0 }, 2 + (Math.abs(oa) + Math.abs(ob)) / FAN);
  // around: both ends on one side; first beyond the outer containers (ga, gb), so the leg runs in free space
  const edge = (r: RRect, s: Side) => (s === "t" ? -r.y : s === "b" ? r.y + r.h : s === "l" ? -r.x : r.x + r.w);
  for (const s of ["t", "b", "l", "r"] as Side[]) {
    const beyond = ga && gb ? Math.max(edge(ga, s), edge(gb, s)) - Math.max(edge(a, s), edge(b, s)) : 0;
    for (const oa of offs(s, base?.sa, base?.oa)) for (const ob of offs(s, base?.sb, base?.ob)) {
      const sp = (Math.abs(oa) + Math.abs(ob)) / FAN;
      if (beyond > 4) for (const d of DS.slice(0, 5)) add({ sa: s, sb: s, oa, ob, m: beyond + d }, d / 6 + sp);
      for (const d of DS) add({ sa: s, sb: s, oa, ob, m: d }, d / 6 + sp + (beyond > 4 ? 3 : 0));
    }
  }
  return out;
}
// resample a polyline every `step` units, so stretches are measured in units, not in samples
export function resample(pts: RPt[], step = 2): RPt[] {
  const out: RPt[] = [pts[0]];
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= L) { out.push({ x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L }); t += step; }
    carry = L - (t - step);
  }
  const last = pts[pts.length - 1], o = out[out.length - 1];
  if (Math.hypot(last.x - o.x, last.y - o.y) > 0.01) out.push(last);
  return out;
}
// turns back (1 or 0): heading more than 90 degrees (with 6 degrees of slack) away from the way to its end, from where
// it is, for 6 units or more; the first and last 6 units (where a line leaves or enters a side) do not count. The
// router and the check (tools/lines10.ts) share it
export function turnsBack(pts0: RPt[]): number {
  const pts = resample(pts0, 2), Q = pts[pts.length - 1];
  const total = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
  let run = 0, s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y, l = Math.hypot(dx, dy);
    s += l;
    if (l < 1e-6 || s < 6 || s > total - 6) { run = 0; continue; }
    const wx = Q.x - pts[i].x, wy = Q.y - pts[i].y, wl = Math.hypot(wx, wy) || 1;
    if ((dx * wx + dy * wy) / (l * wl) < -0.1) { run += l; if (run >= 6) return 1; } else run = 0;
  }
  return 0;
}
// wiggles (1 or 0): an s-curve: a run of turning one way (30 degrees or more), then a run the other way (30 or more),
// with less than 12 units of straight line between them. Shared with the check (tools/lines10.ts)
export function wiggles(pts0: RPt[]): number {
  const pts = resample(pts0, 2), DEG = Math.PI / 180;
  const runs: { sum: number; start: number; end: number }[] = [];
  let s = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const ux = pts[i].x - pts[i - 1].x, uy = pts[i].y - pts[i - 1].y, vx = pts[i + 1].x - pts[i].x, vy = pts[i + 1].y - pts[i].y;
    const lu = Math.hypot(ux, uy);
    s += lu;
    if (lu < 1e-6 || Math.hypot(vx, vy) < 1e-6) continue;
    const t = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (Math.abs(t) < 1.5 * DEG) continue;
    const last = runs[runs.length - 1];
    if (last && Math.sign(last.sum) === Math.sign(t) && s - last.end < 12) { last.sum += t; last.end = s; }
    else runs.push({ sum: t, start: s, end: s });
  }
  for (let i = 0; i + 1 < runs.length; i++) { const a = runs[i], b = runs[i + 1]; if (Math.sign(a.sum) !== Math.sign(b.sum) && Math.abs(a.sum) >= 30 * DEG && Math.abs(b.sum) >= 30 * DEG && b.start - a.end < 12) return 1; }
  return 0;
}
// hugs: stretches that run along a container's edge (within 4 units, 10 units or more): a line beside a border reads
// as part of it
export function hugs(pts: RPt[], conts: RRect[]): number {
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    const hz = Math.abs(p.y - q.y) < 0.5, vt = Math.abs(p.x - q.x) < 0.5;
    if (!hz && !vt) continue;
    for (const c of conts) {
      if (hz) { const lo = Math.max(Math.min(p.x, q.x), c.x), hi = Math.min(Math.max(p.x, q.x), c.x + c.w); if (hi - lo >= 10 && (Math.abs(p.y - c.y) < 4 || Math.abs(p.y - c.y - c.h) < 4)) { n++; break; } }
      else { const lo = Math.max(Math.min(p.y, q.y), c.y), hi = Math.min(Math.max(p.y, q.y), c.y + c.h); if (hi - lo >= 10 && (Math.abs(p.x - c.x) < 4 || Math.abs(p.x - c.x - c.w) < 4)) { n++; break; } }
    }
  }
  return n;
}
// a dip (format version 10): a line that arrives through a side (left or right) yet runs above or below both of its
// things, then comes back (the service mesh: control plane to the first proxy went under the pod box and came up into
// the proxy's side); the same across for a line arriving through its top or bottom. 1 if it dips, else 0
export const DIP_COST = 140;
export function dips(pts: RPt[], a: RRect, b: RRect): number {
  if (pts.length < 3) return 0;
  const p = pts[pts.length - 2], q = pts[pts.length - 1];
  const across = Math.abs(q.x - p.x) > Math.abs(q.y - p.y); // the last piece runs left or right: it enters a side
  const lo = across ? Math.min(a.y, b.y) : Math.min(a.x, b.x), hi = across ? Math.max(a.y + a.h, b.y + b.h) : Math.max(a.x + a.w, b.x + b.w);
  return pts.some((r) => { const v = across ? r.y : r.x; return v < lo - 3 || v > hi + 3; }) ? 1 : 0;
}
// the score of one way: words and things crossed weigh most, then other lines crossed, touched or met at one point,
// and a turn back; then its length
export function scoreRoute(pts: RPt[], req: Req, others: Placed[], ends: [number, number]): { score: number; hard: number; soft: number } {
  let hard = 0;
  for (const r of req.words) if (rectThrough(pts, r, 1)) hard++;
  for (const r of req.shapes) if (rectThrough(pts, r, -5)) hard++;
  let soft = turnsBack(pts) * 250 + wiggles(pts) * 150 + (req.conts ? hugs(pts, req.conts) * 60 : 0) + dips(pts, req.a, req.b) * DIP_COST;
  if (req.area) for (const p of pts) if (p.x < req.area.x || p.y < req.area.y || p.x > req.area.x + req.area.w || p.y > req.area.y + req.area.h) { soft += 120; break; }
  const me = placed(pts, ends);
  for (const o of others) { const m = meet(me, o); soft += m.cross * 300 + m.touch * 200 + m.bunch * 150; }
  const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
  return { score: hard * 10000 + soft + len * 0.02, hard, soft };
}
export function bestRoute(req: Req, base0: Route | null, others: Placed[], off = 0): Choice | null {
  let best: Choice | null = null;
  // with no base given: the facing sides, the ends where a straight line wants them
  const f = base0 ? null : routable(req.a, req.b) ? facing(req.a, req.b) : null;
  const base = base0 ?? (f ? { sa: f[0], sb: f[1], oa: straightWant(req.a, req.b, f[0]), ob: straightWant(req.b, req.a, f[1]), m: 0.5 } : null);
  const cands = candidates(req.a, req.b, base, req.ga, req.gb, req.shapes, req.conts ?? []);
  for (const c of cands.slice(0, 220)) {
    const pts = routeLine(routeGeom(req.a, req.b, c.rt, off));
    const s = scoreRoute(pts, req, others, [req.a.key, req.b.key]);
    const score = s.score + c.cost;
    const clean = s.hard === 0 && s.soft === 0;
    if (!best || score < best.score) best = { rt: c.rt, score, pts, clean, hard: s.hard };
    // the simplest way that crosses nothing is taken at once
    if (clean) break;
  }
  // no simple way is clean: search the free space for one (a path with more corners)
  if (!best?.clean) { const w = wayRoute(req, base, others, off); if (w && (!best || w.score < best.score)) best = w; }
  return best;
}

// ---------------------------------------------------------------- a path through the free space (A*)
// For a line no simple way routes cleanly: right-angle moves along a sparse grid (the edges of every thing and word,
// with a gap, and the middles between them), each corner costing more than a stretch, crossing another line or
// heading away from the target costing much more
const DIRS: RPt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const dirOf = (n: RPt) => DIRS.findIndex((d) => d.x === Math.sign(n.x) && d.y === Math.sign(n.y));
export function gridPath(P: RPt, na: RPt, Q: RPt, nb: RPt, obst: RRect[], others: Placed[], area: RRect, conts: RRect[] = []): RPt[] | null {
  const S = { x: P.x + na.x * 10, y: P.y + na.y * 10 }, T = { x: Q.x + nb.x * 10, y: Q.y + nb.y * 10 };
  const inside = (p: RPt) => obst.some((r) => p.x > r.x + 0.01 && p.x < r.x + r.w - 0.01 && p.y > r.y + 0.01 && p.y < r.y + r.h - 0.01);
  if (inside(S) || inside(T)) return null;
  const coords = (vals: number[], lo: number, hi: number) => {
    const v = [...new Set(vals.filter((x) => x >= lo && x <= hi).map((x) => Math.round(x * 2) / 2))].sort((p, q) => p - q);
    const out: number[] = [];
    for (let i = 0; i < v.length; i++) { if (out.length && v[i] - out[out.length - 1] < 2) continue; if (out.length && v[i] - out[out.length - 1] > 16) out.push((out[out.length - 1] + v[i]) / 2); out.push(v[i]); }
    return out;
  };
  const G = 8;
  // format version 10: also 6 off each container edge, the middle of the usual 12-unit gap between a container and one
  // it holds (at +-12 only, a nested container's edge + 12 was the outer one's edge, and a line ran on it)
  const cx = (r: RRect) => [r.x - 12, r.x - 6, r.x + 6, r.x + 12, r.x + r.w - 12, r.x + r.w - 6, r.x + r.w + 6, r.x + r.w + 12];
  const cy = (r: RRect) => [r.y - 12, r.y - 6, r.y + 6, r.y + 12, r.y + r.h - 12, r.y + r.h - 6, r.y + r.h + 6, r.y + r.h + 12];
  const xs = coords([S.x, T.x, ...obst.flatMap((r) => [r.x - G, r.x + r.w + G]), ...conts.flatMap(cx)], area.x, area.x + area.w);
  const ys = coords([S.y, T.y, ...obst.flatMap((r) => [r.y - G, r.y + r.h + G]), ...conts.flatMap(cy)], area.y, area.y + area.h);
  const xi0 = xs.findIndex((x) => Math.abs(x - Math.round(S.x * 2) / 2) < 2), yi0 = ys.findIndex((y) => Math.abs(y - Math.round(S.y * 2) / 2) < 2);
  const xi1 = xs.findIndex((x) => Math.abs(x - Math.round(T.x * 2) / 2) < 2), yi1 = ys.findIndex((y) => Math.abs(y - Math.round(T.y * 2) / 2) < 2);
  if (xi0 < 0 || yi0 < 0 || xi1 < 0 || yi1 < 0) return null;
  const W = xs.length, H = ys.length, d0 = dirOf(na), dEnd = dirOf({ x: -nb.x, y: -nb.y });
  const wx = T.x - S.x, wy = T.y - S.y, wl = Math.hypot(wx, wy) || 1;
  const BEND = 30;
  const segOk = (p: RPt, q: RPt) => !obst.some((r) => rectThrough([p, q], r, 0.3));
  const crossCost = (p: RPt, q: RPt) => {
    let n = 0;
    const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
    for (const o of others) {
      if (o.box.x1 < x0 - 3 || o.box.x0 > x1 + 3 || o.box.y1 < y0 - 3 || o.box.y0 > y1 + 3) continue;
      for (let k = 0; k + 1 < o.pts.length; k++) {
        const a = o.pts[k], b = o.pts[k + 1];
        if (segX(p, q, a, b)) { n += 300; break; }
        // running along another line counts as much as a touch
        if (distSeg(a, p, q) < 3 && distSeg(b, p, q) < 3 && Math.hypot(b.x - a.x, b.y - a.y) > 4) { n += 200; break; }
      }
    }
    return n;
  };
  const key = (x: number, y: number, d: number) => (y * W + x) * 4 + d;
  const g = new Map<number, number>(), from = new Map<number, number>();
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (x: number, y: number) => Math.abs(xs[x] - T.x) + Math.abs(ys[y] - T.y);
  const k0 = key(xi0, yi0, d0);
  g.set(k0, 0); push(h(xi0, yi0), k0);
  let goal = -1, n = 0;
  while (heap.length && n++ < 6000) {
    const [, k] = pop();
    const d = k % 4, cell = (k - d) / 4, x = cell % W, y = (cell - x) / W, gk = g.get(k)!;
    if (x === xi1 && y === yi1) { if (d === dEnd || goal < 0) { goal = k; if (d === dEnd) break; } continue; }
    for (let d2 = 0; d2 < 4; d2++) {
      if (d2 === (d + 2) % 4) continue;
      const nx = x + DIRS[d2].x, ny = y + DIRS[d2].y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const p = { x: xs[x], y: ys[y] }, q = { x: xs[nx], y: ys[ny] };
      if (!segOk(p, q)) continue;
      const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      const back = (DIRS[d2].x * wx + DIRS[d2].y * wy) / wl < -0.035 ? len * 4 : 0;
      const end = nx === xi1 && ny === yi1 && d2 !== dEnd ? BEND : 0;
      const hug = conts.length ? hugs([p, q], conts) * len * 3 : 0;
      const cost = gk + len + (d2 !== d ? BEND : 0) + back + end + hug + crossCost(p, q);
      const k2 = key(nx, ny, d2);
      if (cost < (g.get(k2) ?? Infinity)) { g.set(k2, cost); from.set(k2, k); push(cost + h(nx, ny), k2); }
    }
  }
  if (goal < 0) return null;
  const cells: RPt[] = [];
  for (let k: number | undefined = goal; k != null; k = from.get(k)) { const d = k % 4, cell = (k - d) / 4, x = cell % W, y = (cell - x) / W; cells.push({ x: xs[x], y: ys[y] }); }
  cells.reverse();
  // the corners only, with the two ends
  const all = [P, ...cells, Q];
  const out: RPt[] = [all[0]];
  for (let i = 1; i + 1 < all.length; i++) { const a = out[out.length - 1], b = all[i], c = all[i + 1]; if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 0.01) out.push(b); }
  out.push(Q);
  return out;
}
export function wayRoute(req: Req, base: Route | null, others: Placed[], off = 0): Choice | null {
  const { a, b } = req;
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const all = [...req.shapes, ...req.words, a, b];
  const area = req.area ?? (() => { const x0 = Math.min(...all.map((r) => r.x)) - 30, y0 = Math.min(...all.map((r) => r.y)) - 30; return { x: x0, y: y0, w: Math.max(...all.map((r) => r.x + r.w)) + 30 - x0, h: Math.max(...all.map((r) => r.y + r.h)) + 30 - y0 }; })();
  const obst = [...req.shapes.map((r) => ({ x: r.x - 5, y: r.y - 5, w: r.w + 10, h: r.h + 10 })), ...req.words.map((r) => ({ x: r.x - 1.5, y: r.y - 1.5, w: r.w + 3, h: r.h + 3 })), ...[a, b].map((r) => ({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }))];
  const dx = cb.x - ca.x, dy = cb.y - ca.y, dl = Math.hypot(dx, dy) || 1;
  let best: Choice | null = null;
  for (const sa of ["t", "b", "l", "r"] as Side[]) for (const sb of ["t", "b", "l", "r"] as Side[]) {
    const na = NORM[sa], nb = NORM[sb];
    if ((na.x * dx + na.y * dy) / dl < -0.3 || (nb.x * -dx + nb.y * -dy) / dl < -0.3) continue;
    const oa = base && base.sa === sa ? base.oa : 0, ob = base && base.sb === sb ? base.ob : 0;
    const P = portAt(a, sa, oa), Q = portAt(b, sb, ob);
    const path = gridPath(P, na, Q, nb, obst, others, area, req.conts ?? []);
    if (!path) continue;
    const rt: Route = { sa, sb, oa, ob, m: 0, way: path.slice(1, -1), ca, cb };
    const pts = routeLine(routeGeom(a, b, rt, off));
    const s = scoreRoute(pts, req, others, [a.key, b.key]);
    const score = s.score + 16 + (path.length - 2) * 3;
    if (!best || score < best.score) best = { rt, score, pts, clean: s.hard === 0 && s.soft === 0, hard: s.hard };
  }
  return best;
}

// route every line of a frame: sides, then the fan on each side, then each line's way, twice over (so a line routed
// early sees the lines after it); then the ends are spread again on the sides the lines took
const CACHE = new Map<string, (Choice | null)[]>();
const rkey = (r: RRect) => `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.w.toFixed(1)},${r.h.toFixed(1)}`;
export function routeAll(reqs: Req[], fixed: Placed[] = []): (Choice | null)[] {
  const key = reqs.map((q) => [q.a.key, q.a.kind, rkey(q.a), q.b.key, q.b.kind, rkey(q.b), q.words.map(rkey).join(" "), q.shapes.map(rkey).join(" "), (q.conts ?? []).map(rkey).join(" "), q.ga ? rkey(q.ga) : "", q.gb ? rkey(q.gb) : "", q.area ? rkey(q.area) : ""].join("/")).join("|") + "#" + fixed.map((f) => f.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")).join("|");
  const hit = CACHE.get(key);
  if (hit) return hit;
  const res = routeAllNow(reqs, fixed);
  if (CACHE.size > 400) CACHE.delete(CACHE.keys().next().value!);
  CACHE.set(key, res);
  return res;
}
function routeAllNow(reqs: Req[], fixed: Placed[] = []): (Choice | null)[] {
  const base: (Route | null)[] = reqs.map((r) => { const f = routable(r.a, r.b) ? facing(r.a, r.b) : null; return f ? { sa: f[0], sb: f[1], oa: 0, ob: 0, m: 0.5 } : null; });
  const endsOf = (rt: (Route | null)[], keepOff: boolean) => {
    const ends: End[] = [];
    reqs.forEach((r, i) => {
      const b = rt[i]; if (!b || b.way) return;
      const facingSides = OPP[b.sa] === b.sb;
      const sure = facingSides && canStraight(r.a, r.b, b.sa);
      ends.push({ req: i, end: 0, box: r.a, side: b.sa, other: r.b, want: keepOff && !facingSides ? b.oa : facingSides ? straightWant(r.a, r.b, b.sa) : 0, sure }, { req: i, end: 1, box: r.b, side: b.sb, other: r.a, want: keepOff && !facingSides ? b.ob : facingSides ? straightWant(r.b, r.a, b.sb) : 0, sure });
    });
    return ends;
  };
  const fan = fanOut(endsOf(base, false));
  base.forEach((b, i) => { if (b) { b.oa = fan.get(`${i}:0`) ?? 0; b.ob = fan.get(`${i}:1`) ?? 0; } });
  const out: (Choice | null)[] = reqs.map(() => null);
  const lines = (skip: number) => [...fixed, ...out.flatMap((c, j) => (c && j !== skip ? [placed(c.pts, [reqs[j].a.key, reqs[j].b.key])] : []))];
  const cleanNow = (i: number) => { const c = out[i]; if (!c) return false; const s = scoreRoute(c.pts, reqs[i], lines(i), [reqs[i].a.key, reqs[i].b.key]); return s.hard === 0 && s.soft === 0; };
  for (let pass = 0; pass < 2; pass++) {
    reqs.forEach((r, i) => {
      if (!base[i]) return;
      // a second time round, a line stays as it is if it is still clean among all the others
      if (pass && cleanNow(i)) return;
      out[i] = bestRoute(r, base[i], lines(i));
    });
  }
  // spread the ends again over the sides the lines took (an end planned on a side and not used leaves its room);
  // a line takes its new ends only if that is no worse
  const fan2 = fanOut(endsOf(out.map((c) => c?.rt ?? null), true).filter((e) => { const rt = out[e.req]!.rt!; return OPP[rt.sa] === rt.sb; }));
  reqs.forEach((r, i) => {
    const c = out[i];
    if (!c?.rt || c.rt.way || OPP[c.rt.sa] !== c.rt.sb) return;
    const oa = fan2.get(`${i}:0`), ob = fan2.get(`${i}:1`);
    if (oa == null || ob == null || (Math.abs(oa - c.rt.oa) < 0.5 && Math.abs(ob - c.rt.ob) < 0.5)) return;
    const others = lines(i);
    const old = scoreRoute(c.pts, r, others, [r.a.key, r.b.key]);
    let best: Choice | null = null;
    const rt0 = { ...c.rt, oa, ob };
    for (const k of routeShape(r.a, r.b, rt0) === "z" ? channels(r.a, r.b, rt0, r.ga, r.gb, r.shapes, r.conts ?? []) : [{ m: c.rt.m, cost: 0 }]) {
      const rt = { ...rt0, m: k.m };
      const pts = routeLine(routeGeom(r.a, r.b, rt));
      const s = scoreRoute(pts, r, others, [r.a.key, r.b.key]);
      if (s.hard === 0 && s.soft === 0) { best = { rt, score: s.score, pts, clean: true, hard: 0 }; break; }
    }
    if (best && (old.hard > 0 || old.soft >= 0)) out[i] = best;
  });
  return out;
}
