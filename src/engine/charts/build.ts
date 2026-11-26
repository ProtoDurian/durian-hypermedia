// One entry for the page: primitives and marks of a chart of any kind. xy kinds give their own marks (a bar's category, a point,
// a candle, a cell, an annotation, a key item); the eight kinds of ./kinds.ts give theirs; pie, doughnut, polar and radar get
// theirs here from the primitives (a slice, a radar corner). The marks are what the page puts one popover on.
import type { ChartCtx, ChartKind, ChartSpec, Prim, Rect } from "../types";
import { CHART } from "./index";
import { xyBuild } from "./xy";
import { kindBuild, kindHeight, kindWidth, KIND_NAMES, type KMark } from "./kinds";
import { RADIAL_KINDS } from "./legacy";

/** a popover place: `kind` says what it is; `series` a key item's series; `zoom` a tree's node to open; `skip` is not walked by the arrow keys */
export type PMark = { key: string; kind: string; rect: Rect; title: string; meta?: string; text?: string; series?: number; zoom?: number; skip?: boolean };
export type BuildCtx = Omit<ChartCtx, "step" | "prev" | "max" | "lit"> & Partial<Pick<ChartCtx, "step" | "prev" | "max" | "lit">> & { zoom?: number };
export const XY_NAMES: string[] = ["bar", "line", "area", "scatter", "bubble", "candlestick", "heatmap"];
export const isKindsChart = (k: string): boolean => KIND_NAMES.includes(k as ChartKind);

const bbox = (d: string): Rect => {
  const n = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: Math.max(2, x1 - x0), h: Math.max(2, y1 - y0) } : { x: 0, y: 0, w: 0, h: 0 };
};
const num = (v: unknown, fmt: (v: number) => string): string => (typeof v === "number" && Number.isFinite(v) ? fmt(v) : "no value");
/** marks of the round kinds: a slice (its category and number), a radar corner (its axis, series and number) */
function roundMarks(spec: ChartSpec, values: number[][], prims: Prim[]): PMark[] {
  const names = (n: number) => spec.x[n] ?? String(n + 1), out: PMark[] = [];
  const fmt = (v: number) => (spec.opts.format === "percent" ? `${+v.toFixed(2)}%` : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  for (const p of prims) {
    const m = /^slice:(\d+):(\d+)$/.exec(p.key), q = /^pt:(\d+):(\d+)$/.exec(p.key);
    if (m && p.k === "path") {
      const s = +m[1], i = +m[2], v = values[s]?.[i], row = (values[s] ?? []).filter((x) => Number.isFinite(x) && x > 0), total = row.reduce((a, b) => a + b, 0);
      if (!(v > 0)) continue;
      out.push({ key: p.key, kind: "slice", rect: bbox(p.d), title: names(i), meta: spec.series.length > 1 ? spec.series[s]?.name : undefined, text: `${num(v, fmt)}${spec.kind !== "polar" && total > 0 ? ` · ${Math.round((v / total) * 100)}%` : ""}` });
    } else if (q && p.k === "dot") {
      const s = +q[1], i = +q[2];
      out.push({ key: p.key, kind: "point", rect: { x: p.x - 10, y: p.y - 10, w: 20, h: 20 }, title: names(i), meta: spec.series.length > 1 ? spec.series[s]?.name : undefined, text: num(values[s]?.[i], fmt) });
    }
  }
  return out;
}

export function buildChart(spec: ChartSpec, values: number[][], rect: Rect, ctx: BuildCtx): { prims: Prim[]; marks: PMark[] } {
  const k = spec.kind;
  if (XY_NAMES.includes(k)) { const b = xyBuild(spec, values, rect, ctx); return { prims: b.prims, marks: b.marks }; }
  if (isKindsChart(k)) { const b = kindBuild(spec, rect, { step: 0, prev: null, max: [], lit: [], ...ctx }); return { prims: b.prims, marks: b.marks as KMark[] }; }
  const d = CHART[k as ChartKind];
  if (!d) throw new Error(`chart: no drawing for ${k}`);
  const prims = d.draw(spec, values, rect, { step: 0, prev: null, max: [], lit: [], ...ctx });
  return { prims, marks: RADIAL_KINDS.includes(k) ? roundMarks(spec, values, prims) : [] };
}
export { kindHeight, kindWidth };
