// The chart part (```chart): Chart.js, loaded when the chart mounts; the reader's controls feed the chart's formulas.
import React from "react";
import { Chart } from "../ui/chart";
import { useDh } from "./context";
import { staticOfAttr } from "../parts/react";
import type { ChartBlock } from "../types";
export function ChartPart({ block }: { block: ChartBlock }) {
  const { ui, static: docStatic } = useDh();
  const fence = staticOfAttr(block.attrs?.static);
  return <Chart spec={block.chart} controls={block.controls} initial={block.initial as any} ui={ui} static={fence !== undefined ? fence : docStatic} />;
}
export default ChartPart;
