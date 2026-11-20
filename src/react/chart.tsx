// The chart part (```chart): Chart.js, loaded when the chart mounts; the reader's controls feed the chart's formulas.
import React from "react";
import { Chart } from "../ui/chart";
import { useDh } from "./context";
import type { ChartBlock } from "../types";
export function ChartPart({ block }: { block: ChartBlock }) {
  const { ui } = useDh();
  return <Chart spec={block.chart} controls={block.controls} initial={block.initial as any} ui={ui} />;
}
export default ChartPart;
