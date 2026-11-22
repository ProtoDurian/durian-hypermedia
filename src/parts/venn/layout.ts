// The venn's layout (format version 11): the fixed figures (2 or 3 circles, the classic 4 ellipses), and where each
// region's words go, worked out from a grid and a distance map. Pure; the cost is charged to the budget it is given.
import type { Budget } from "../../core/budget";
import { clipTo, textW } from "../kit/text";
import type { VennRegion, VennSpec } from "./part";

export interface Shape { cx: number; cy: number; rx: number; ry: number; rot: number }
export interface Anchor { x: number; y: number; r: number }
export interface VennLayout { w: number; h: number; shapes: Shape[]; anchors: Map<number, Anchor>; labels: { x: number; y: number; anchor: "start" | "middle" | "end" }[]; font: number; minW: number }
export const VENN = { font: 15, small: 15, lh: 21, cell: 4 };

const D = Math.PI / 180;
export const inShape = (e: Shape, x: number, y: number) => { const c = Math.cos(e.rot), s = Math.sin(e.rot), dx = x - e.cx, dy = y - e.cy, u = dx * c + dy * s, v = -dx * s + dy * c; return (u * u) / (e.rx * e.rx) + (v * v) / (e.ry * e.ry) <= 1; };
// the three fixed figures, before they are fitted into the frame (only the proportions matter)
function baseShapes(n: number): Shape[] {
  if (n === 2) return [{ cx: -62, cy: 0, rx: 105, ry: 105, rot: 0 }, { cx: 62, cy: 0, rx: 105, ry: 105, rot: 0 }];
  if (n === 3) return [{ cx: -60, cy: -34, rx: 104, ry: 104, rot: 0 }, { cx: 60, cy: -34, rx: 104, ry: 104, rot: 0 }, { cx: 0, cy: 70, rx: 104, ry: 104, rot: 0 }];
  // the classic 4-set figure: two ellipses leaning one way, two the other, so all 15 regions exist
  const rx = 172, ry = 91, a = 4, b = 45.5, c = 41.3, th = 55 * D;
  return [{ cx: -a, cy: -b, rx, ry, rot: th }, { cx: -c, cy: b * 0.3, rx, ry, rot: th }, { cx: c, cy: b * 0.3, rx, ry, rot: -th }, { cx: a, cy: -b, rx, ry, rot: -th }];
}
function extent(e: Shape) { // the box of an ellipse
  const c = Math.cos(e.rot), s = Math.sin(e.rot), hx = Math.sqrt(e.rx * e.rx * c * c + e.ry * e.ry * s * s), hy = Math.sqrt(e.rx * e.rx * s * s + e.ry * e.ry * c * c);
  return { l: e.cx - hx, r: e.cx + hx, t: e.cy - hy, b: e.cy + hy };
}
const CACHE = new Map<number, VennLayout>();
/** The figure of n sets (2 to 4). Its cost depends on n only (never on the text), and is charged on every call, even when
 *  the figure was made before and is served from the cache. */
export function layoutVenn(n: number, budget?: Budget): VennLayout {
  const cells = n === 4 ? 100 * 80 : 105 * 80;
  budget?.charge(cells * (n + 2), cells);
  const hit = CACHE.get(n);
  if (hit) return hit;
  const base = baseShapes(n);
  // fit into a frame of 420 wide, a margin round it for the set names
  const W = 420, M = { x: 38, top: 30, bottom: 30 };
  const bb = base.map(extent), l = Math.min(...bb.map((b) => b.l)), r = Math.max(...bb.map((b) => b.r)), t = Math.min(...bb.map((b) => b.t)), b = Math.max(...bb.map((q) => q.b));
  const k = (W - 2 * M.x) / (r - l), H = Math.round((b - t) * k + M.top + M.bottom);
  const shapes = base.map((e) => ({ cx: (e.cx - l) * k + M.x, cy: (e.cy - t) * k + M.top, rx: e.rx * k, ry: e.ry * k, rot: e.rot }));
  // a grid of the figure: which sets cover each cell; then the distance of each cell to a cell with another cover
  const step = VENN.cell, gw = Math.ceil(W / step), gh = Math.ceil(H / step);
  const mask = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { let m = 0; shapes.forEach((e, q) => { if (inShape(e, i * step + step / 2, j * step + step / 2)) m |= 1 << q; }); mask[j * gw + i] = m; }
  const dist = new Float32Array(gw * gh).fill(1e9);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const m = mask[j * gw + i];
    if (i === 0 || j === 0 || i === gw - 1 || j === gh - 1) { dist[j * gw + i] = 0; continue; }
    if (mask[j * gw + i - 1] !== m || mask[j * gw + i + 1] !== m || mask[(j - 1) * gw + i] !== m || mask[(j + 1) * gw + i] !== m) dist[j * gw + i] = 0;
  }
  // chamfer: two passes
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= gw || j >= gh ? 1e9 : dist[j * gw + i]);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) dist[j * gw + i] = Math.min(dist[j * gw + i], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414);
  for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) dist[j * gw + i] = Math.min(dist[j * gw + i], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414);
  const anchors = new Map<number, Anchor>();
  const best = new Map<number, { d: number; i: number; j: number }>();
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const m = mask[j * gw + i]; if (!m) continue;
    const d = dist[j * gw + i], cur = best.get(m);
    if (!cur || d > cur.d + 1e-6) best.set(m, { d, i, j });
  }
  for (const [m, q] of best) anchors.set(m, { x: q.i * step + step / 2, y: q.j * step + step / 2, r: (q.d + 0.5) * step });
  // set names: outside the figure's edge, on the side the set leans to
  const cx = W / 2, cy = M.top + (H - M.top - M.bottom) / 2;
  const labels = shapes.map((e) => {
    const dx = e.cx - cx, dy = e.cy - cy, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // walk out from the shape's centre until outside it
    let x = e.cx, y = e.cy; for (let q = 0; q < 400 && inShape(e, x, y); q++) { x += ux; y += uy; }
    const side = ux < -0.25 ? "end" : ux > 0.25 ? "start" : "middle";
    return { x: Math.min(W - 6, Math.max(6, x + (side === "start" ? 6 : side === "end" ? -6 : 0))), y: Math.min(H - 8, Math.max(16, y + (uy < -0.2 ? -6 : uy > 0.2 ? 14 : 4))), anchor: side as "start" | "middle" | "end" };
  });
  const out: VennLayout = { w: W, h: H, shapes, anchors, labels, font: VENN.font, minW: Math.ceil((W * 11) / VENN.small) };
  CACHE.set(n, out);
  return out;
}

// what a region's words show: names that fit (clipped), the rest as "+N"
export interface RegionDraw { lines: { text: string; full: string; note: string }[]; more: number; count: string | null; word: string; fs: number }
export function regionDraw(spec: VennSpec, r: VennRegion, a: Anchor, budget?: Budget): RegionDraw {
  const fs = VENN.font;
  const bw = a.r * 1.7, bh = a.r * 1.5;
  const cap = Math.max(0, Math.floor(bh / VENN.lh));
  if (r.count != null) { budget?.charge(2, 1); return { lines: [], more: 0, count: String(r.count), word: r.countWord && textW(r.countWord, VENN.small) <= bw ? r.countWord : "", fs }; }
  // only the names that can be shown are clipped (the rest is a count): one charge for each, and the characters it reads
  const show = r.items.length <= cap ? r.items.length : Math.max(0, cap - 1);
  budget?.charge(2 + r.items.length, show, 0);
  const lines = r.items.slice(0, show).map((i) => { budget?.charge(1 + (i.name.length >> 4), 0, 0); return { text: clipTo(i.name, Math.max(24, bw), fs), full: i.name, note: i.note }; });
  return { lines, more: r.items.length - show, count: null, word: "", fs };
}

/** A set's name kept whole inside the frame. The layout knows only where a name starts; a name anchored at its end runs
 *  left from there, one anchored at its start runs right. The width is estimated from the characters at a generous 0.66 em
 *  (a 600 weight sans), so the clamp holds at any screen width: it is in the drawing's own units. A name too wide for one
 *  side moves in until it fits; wider than the frame, it starts at the margin. */
export const VENN_LABEL_PAD = 8;
export function fitSetLabel(label: string, at: { x: number; anchor: "start" | "middle" | "end" }, W: number, font = VENN.font): { x: number; anchor: "start" | "middle" | "end" } {
  const est = Math.ceil(label.length * font * 0.66), lo = VENN_LABEL_PAD, hi = W - VENN_LABEL_PAD;
  if (est >= hi - lo) return { x: lo, anchor: "start" };
  const left = at.anchor === "end" ? at.x - est : at.anchor === "middle" ? at.x - est / 2 : at.x;
  const shift = left < lo ? lo - left : left + est > hi ? hi - (left + est) : 0;
  return { x: at.x + shift, anchor: at.anchor };
}
