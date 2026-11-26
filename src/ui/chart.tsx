// The chart part (```chart): drawn by our own renderer (src/engine/charts/page.tsx), no chart library. The numbers come from
// core/chart11.ts (the reader's controls feed the chart's formulas); the drawing is primitives painted as SVG with the page's
// tokens, and a control or step moves them smoothly by key.
import { ChartView } from "../engine/charts/page";
export const Chart = ChartView;
