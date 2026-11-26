// Chart kinds (lane chwire): histogram boxplot violin funnel waterfall treemap sunburst calendar, as ChartDraw.
// The numbers come from src/parts/chart-kinds/compute.ts (a View); `specOfView` puts a View in a ChartSpec; the page calls
// `kindBuild` for the primitives and the marks (one popover each) and `kindHeight` for the room. Contract: ./kinds/common.ts.
import type { ChartDraw, ChartSpec, Rect } from "../types";
import { asDraw, viewOf, zoomOf, type KBuilt, type KCtx, type KindImpl } from "./kinds/common";
import { histogram } from "./kinds/histogram";
import { boxplot } from "./kinds/boxplot";
import { violin } from "./kinds/violin";
import { funnel } from "./kinds/funnel";
import { waterfall } from "./kinds/waterfall";
import { treemap } from "./kinds/treemap";
import { sunburst } from "./kinds/sunburst";
import { calendar } from "./kinds/calendar";

export type { KMark, KBuilt, KCtx } from "./kinds/common";
export { specOfView, viewOf, numbersOf } from "./kinds/common";
export { crumbs, treeHint, fmtOf } from "./kinds/treemap";
const IMPLS: KindImpl[] = [histogram, boxplot, violin, funnel, waterfall, treemap, sunburst, calendar];
const BY = new Map<string, KindImpl>(IMPLS.map((i) => [i.kind, i]));
const impl = (spec: ChartSpec): KindImpl => { const i = BY.get(spec.kind); if (!i) throw new Error(`kinds: not a kind of this lane: ${spec.kind}`); return i; };
/** primitives and marks of one chart of these kinds */
export const kindBuild = (spec: ChartSpec, rect: Rect, ctx: Omit<KCtx, "zoom">): KBuilt => impl(spec).build(viewOf(spec), rect, { ...ctx, zoom: zoomOf(spec) });
export const kindHeight = (spec: ChartSpec, w: number): number => impl(spec).height(viewOf(spec), w);
export const kindWidth = (spec: ChartSpec): number | null => impl(spec).width?.(viewOf(spec)) ?? null;
export const KIND_NAMES = IMPLS.map((i) => i.kind);
export const KINDS: ChartDraw[] = IMPLS.map(asDraw);
