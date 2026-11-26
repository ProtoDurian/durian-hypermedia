// violin as primitives (lane chwire): the box plot's frame (./boxplot.ts statsBuild) with a smoothed shape per category. The shape is one
// closed path of the same curves for every number (KDE_GRID points a side), so a step that changes the data glides it.
import type { View } from "../../../parts/chart-kinds/compute";
import { statsBuild, statsHeight } from "./boxplot";
import type { KindImpl } from "./common";

type S = Extract<View, { kind: "boxplot" | "violin" }>;
export const violin: KindImpl = {
  kind: "violin",
  height: (v) => statsHeight(v as S),
  build: (v, rect, ctx) => statsBuild(v as S, rect, ctx, true),
};
