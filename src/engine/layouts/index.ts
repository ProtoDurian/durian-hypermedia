// The layout registry (written by the integrator at M0; lanes do not edit it). One import per family.
import type { LayoutName, LayoutPlugin } from "../types";
import { Lanes } from "./lanes";
import { Graph, Free } from "./graph";
import { Tree } from "./tree";
import { ArrayLayout, ListLayout, StackLayout, QueueLayout, MapLayout } from "./data";
import { Timeline } from "./time";
import { Grid } from "./grid";
import { Sheet, Wrap, Track } from "./sheet";
import { Layers } from "./layers";
export const LAYOUT: Record<LayoutName, LayoutPlugin> = {
  lanes: Lanes, graph: Graph, free: Free, tree: Tree, array: ArrayLayout, list: ListLayout, stack: StackLayout, queue: QueueLayout, map: MapLayout,
  timeline: Timeline, grid: Grid, sheet: Sheet, wrap: Wrap, track: Track, layers: Layers,
};
/** the layout that owns a setup or step word, if any */
export const layoutForWord = (word: string, at: "setup" | "step"): LayoutPlugin | undefined =>
  Object.values(LAYOUT).find((p) => p.words?.[at]?.includes(word));
