// Shared by the eight chart kinds that are not xy or radial (histogram boxplot violin funnel waterfall treemap sunburst calendar).
// A kind's numbers are read once by src/parts/chart-kinds/compute.ts into a `View`; that View travels in `ChartSpec.opts.view`
// (JSON) and the numbers that change from step to step also sit in `values` (so the page can keep scales still and tween).
// Every kind is a `KindImpl`: build(view, rect, ctx) gives the primitives (keys stable per bin, box, stage, block, arc, day, so
// a step or control that changes the numbers glides) and the marks the page puts one popover on (hover, tap, focus, arrow keys).
import type { ChartCtx, ChartDraw, ChartKind, ChartSpec, Prim, Rect } from "../../types";
import { llmText, type View } from "../../../parts/chart-kinds/compute";

/** a place the popover opens on, in the order the arrow keys walk them */
export interface KMark { key: string; kind: string; rect: Rect; title: string; meta?: string; text?: string; /** treemap and sunburst: a click opens this node (the tree's id) */ zoom?: number; /** a mark the arrow keys skip (a whole-plot pick area) */ skip?: boolean }
export interface KBuilt { prims: Prim[]; marks: KMark[] }
/** what a kind gets besides the common ChartCtx: the node a tree is zoomed to (treemap, sunburst), the day a calendar is scrolled to */
export type KCtx = ChartCtx & { zoom?: number; at?: number };
export interface KindImpl {
  kind: ChartKind;
  /** the height in px. It never depends on the width except where a kind says so (a funnel's bands, a calendar's weeks) and must
   *  be the same at every width inside one phone/desktop class: the page is first drawn at an assumed width and measured after. */
  height(v: View, w: number): number;
  /** the width the drawing needs when it is wider than the room (a calendar's weeks); null = fits (the page scrolls it sideways) */
  width?(v: View): number | null;
  build(v: View, rect: Rect, ctx: KCtx): KBuilt;
}

const ZOOM = "zoom";
/** the spec the page hands the kinds for a View; `zoom` is a tree's open node (0 = the whole) */
export function specOfView(v: View, o: { zoom?: number } = {}): { spec: ChartSpec; values: number[][] } {
  const opts: Record<string, string> = { view: JSON.stringify(v) };
  if (o.zoom) opts[ZOOM] = String(o.zoom);
  return { spec: { kind: v.kind, title: v.title, unit: null, x: [], series: [], flags: [], opts }, values: numbersOf(v) };
}
export function viewOf(spec: ChartSpec): View {
  const j = spec.opts.view;
  if (!j) throw new Error(`chart ${spec.kind}: no view in the spec (build it with specOfView)`);
  return JSON.parse(j) as View;
}
export const zoomOf = (spec: ChartSpec): number => Number(spec.opts[ZOOM] ?? 0) || 0;
/** the numbers a story changes, one list per series (a histogram's counts per series; a box plot's median, q1, q3 per category;
 *  a funnel's stage values; a waterfall's changes; a tree's node values; a calendar's days) */
export function numbersOf(v: View): number[][] {
  switch (v.kind) {
    case "histogram": return v.series.map((s) => s.counts);
    case "boxplot": case "violin": return [v.stats.map((s) => s.median), v.stats.map((s) => s.q1), v.stats.map((s) => s.q3), v.stats.map((s) => s.min), v.stats.map((s) => s.max)];
    case "funnel": return [v.stages.map((s) => s.value)];
    case "waterfall": return [v.rows.map((r) => r.change), v.rows.map((r) => r.to)];
    case "treemap": case "sunburst": return [v.nodes.map((n) => n.value)];
    case "calendar": return [v.days.map((d) => d.value ?? NaN)];
  }
}
/** a ChartDraw from a KindImpl (the rect's height is the kind's own height when the page gave none) */
export function asDraw(impl: KindImpl): ChartDraw {
  return {
    kind: impl.kind,
    draw: (spec, _values, rect, ctx) => impl.build(viewOf(spec), rect, { ...ctx, zoom: zoomOf(spec) }).prims,
    llm: (spec) => llmText(spec.kind, spec.title, [{ errors: [], warnings: [], view: viewOf(spec) }]).split("\n"),
  };
}
