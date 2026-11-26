// Chart kinds (lane xy): bar line area scatter bubble candlestick heatmap, drawn by us as primitives (no Chart.js).
// Contract: ../types.ts ChartDraw. What `opts` and the number layout mean: ./xy/INPUT.md. Popovers: `xyMarks` (same inputs).
import type { ChartDraw, ChartKind, ChartSpec, Rect, ChartCtx } from "../types";
import { buildCategory } from "./xy/category";
import { buildPoints, buildCandles, buildHeat } from "./xy/others";
import { xyLlm } from "./xy/llm";
import { drawStageBars } from "./xy/stagebars";
import type { Built } from "./xy/shared";
import type { Ctx } from "./xy/frame";

export type { Mark } from "./xy/shared";
const BUILD: Record<string, (s: ChartSpec, v: number[][], r: Rect, c: Ctx) => Built> = {
  bar: buildCategory, line: buildCategory, area: buildCategory, scatter: buildPoints, bubble: buildPoints, candlestick: buildCandles, heatmap: buildHeat,
};
/** primitives and marks of one chart: the marks are what a page puts one popover on (a bar's category, a point, a cell, an annotation, a key item) */
export function xyBuild(spec: ChartSpec, values: number[][], rect: Rect, ctx: Partial<ChartCtx> & Pick<ChartCtx, "phone" | "measure">): Built {
  const b = BUILD[spec.kind];
  if (!b) throw new Error(`xy: not a kind of this lane: ${spec.kind}`);
  return b(spec, values, rect, { look: "stage", ...ctx });
}
export const xyMarks = (spec: ChartSpec, values: number[][], rect: Rect, ctx: Partial<ChartCtx> & Pick<ChartCtx, "phone" | "measure">) => xyBuild(spec, values, rect, ctx).marks;

const one = (kind: ChartKind): ChartDraw => ({
  kind,
  draw: (spec, values, rect, ctx) => (kind === "bar" && spec.opts?.stage === "bars" ? drawStageBars(spec, values, rect, ctx) : xyBuild(spec, values, rect, ctx).prims), // eng-stagebars: the stage's bars
  llm: (spec, values) => xyLlm(spec, values),
});
export const KINDS: ChartDraw[] = (["bar", "line", "area", "scatter", "bubble", "candlestick", "heatmap"] as ChartKind[]).map(one);
