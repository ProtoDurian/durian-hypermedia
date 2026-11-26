// Shared helpers of the radial chart kinds (lane chradial): colours, round paths, nice ticks, number text, legends.
// Everything returns primitives (../../types.ts Prim) with keys that stay the same for the same slice, spoke, dot or
// cell, so the renderer can glide a primitive from the numbers of step k-1 to those of step k.
import type { ChartCtx, ChartSpec, Font, Prim, Rect } from "../../types";
import { fmtValue } from "../../../parts/chart-kinds/fmt";

export type DrawCtx = ChartCtx;
export const TAU = Math.PI * 2;
/** the colour role of the k-th slice or series: the page's colours c1..c8, then round again */
export const roleOf = (k: number): string => `c${(k % 8) + 1}`;
export const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
export const cats = (spec: ChartSpec, n: number): string[] => Array.from({ length: Math.max(n, spec.x.length) }, (_, i) => spec.x[i] ?? String(i + 1));
export const key = (...p: (string | number)[]): string => p.join(":");
/** whole percents of a total that add up to 100 (largest remainder): 4, 5, 12, 5 is 16, 19, 46, 19 (not 15+19+46+19 = 99) // charts2 */
export function wholeShares(vs: number[]): number[] {
  const t = vs.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(t > 0)) return vs.map(() => 0);
  const raw = vs.map((v) => (Math.max(0, v) / t) * 100), out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).filter(([, i]) => vs[i] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

/** a number as the chart shows it: the spec's `format` (number, percent, money ...), short on a phone or with `compact` */
export function fmtNum(spec: ChartSpec, v: number, ctx: DrawCtx): string {
  return fmtValue(v, spec.opts.format ?? "number", spec.opts.currency ?? "USD", ctx.phone || spec.flags.includes("compact"));
}
/** an axis number that stays short: 1500 is 1.5k when compact */
export function tickText(spec: ChartSpec, v: number, ctx: DrawCtx): string {
  const t = fmtNum(spec, v, ctx);
  return (ctx.phone || spec.flags.includes("compact")) && !spec.opts.format && Math.abs(v) >= 1000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v).toLowerCase() : t;
}
/** round tick values from lo to a nice top at or above `hi` (about `n` steps) */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) hi = lo + 1;
  const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step + 1e-9) * step, out: number[] = [];
  for (let v = a; v < hi + step * 0.999; v += step) { out.push(+v.toFixed(10)); if (v >= hi - 1e-9) break; }
  return out.length > 1 ? out : [lo, hi];
}
const f2 = (v: number) => +v.toFixed(2);
/** the point at angle `a` (radians, 0 at the top, clockwise) and radius `r` */
export const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [f2(cx + r * Math.sin(a)), f2(cy - r * Math.cos(a))];
/** a circular arc from angle a to b as four cubic curves (always four, so a path keeps one shape while its numbers change) */
function arc(cx: number, cy: number, r: number, a: number, b: number): string {
  const t = (b - a) / 4, k = (4 / 3) * Math.tan(t / 4);
  let out = "";
  for (let i = 0; i < 4; i++) {
    const s = a + t * i, e = s + t, [x0, y0] = [cx + r * Math.sin(s), cy - r * Math.cos(s)], [x1, y1] = [cx + r * Math.sin(e), cy - r * Math.cos(e)];
    const c1 = [x0 + k * r * Math.cos(s), y0 + k * r * Math.sin(s)], c2 = [x1 - k * r * Math.cos(e), y1 - k * r * Math.sin(e)];
    out += `C${f2(c1[0])} ${f2(c1[1])} ${f2(c2[0])} ${f2(c2[1])} ${f2(x1)} ${f2(y1)}`;
  }
  return out;
}
/** a ring slice from angle a0 to a1 between radii r0 and r1 (r0 = 0 is a pie slice); the same commands for every slice */
export function ringPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = pt(cx, cy, r1, a0), [xi, yi] = pt(cx, cy, r0, a1);
  return `M${x0} ${y0}${arc(cx, cy, r1, a0, a1)}L${xi} ${yi}${arc(cx, cy, r0, a1, a0)}Z`;
}
/** a full circle as an open outline (grid rings) */
export const circlePath = (cx: number, cy: number, r: number): string => { const [x, y] = pt(cx, cy, r, 0); return `M${x} ${y}${arc(cx, cy, r, 0, TAU)}Z`; };
/** a polygon through points (always `L`) */
export const polyPath = (ps: [number, number][]): string => (ps.length ? `M${ps[0][0]} ${ps[0][1]}${ps.slice(1).map((p) => `L${p[0]} ${p[1]}`).join("")}Z` : "");

/** the text cut with "..." so it fits in `w` px */
export function fit(measure: DrawCtx["measure"], s: string, w: number, font: Font): string {
  if (measure(s, font) <= w) return s;
  let t = s; while (t.length > 1 && measure(t + "...", font) > w) t = t.slice(0, -1);
  return t + "...";
}
export interface LegendEntry { id: string; label: string; role: string | null; dashed?: boolean }
/** a key: a dot and a label per entry, in rows (one column when `cols` is 1); returns the prims and the height used */
export function legend(entries: LegendEntry[], r: Rect, cols: number, ctx: DrawCtx, pitch = 20): { prims: Prim[]; h: number } {
  const prims: Prim[] = [], colW = Math.min(r.w / cols, Math.max(...entries.map((e) => ctx.measure(e.label, "sub"))) + 36), rows = Math.ceil(entries.length / cols);
  entries.forEach((e, i) => {
    const c = i % cols, row = Math.floor(i / cols), x = r.x + c * colW, y = r.y + row * pitch + pitch / 2;
    prims.push({ k: "dot", key: key("key", e.id), x: x + 6, y, r: 5, role: e.role }, { k: "text", key: key("keyt", e.id), x: x + 16, y: y + 4, lines: [fit(ctx.measure, e.label, colW - 20, "sub")], font: "sub", anchor: "start", ink: "ink" });
  });
  return { prims, h: rows * pitch };
}
/** how many legend columns fit: as many as the widest label allows (at most `max`) */
export function legendCols(labels: string[], w: number, ctx: DrawCtx, max = 3): number {
  const widest = Math.max(0, ...labels.map((l) => ctx.measure(l, "sub"))) + 26;
  return Math.max(1, Math.min(max, Math.floor(w / widest), labels.length));
}
/** a number written in the chart's own lines (`opts` keeps text), or the default */
export const optN = (spec: ChartSpec, name: string, d: number): number => { const v = spec.opts[name]; const n = v === undefined || v === "" ? NaN : Number(v); return Number.isFinite(n) ? n : d; };
