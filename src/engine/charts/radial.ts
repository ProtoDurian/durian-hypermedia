// Chart kinds (lane radial): pie doughnut polar radar dots units spans. Contract: ../types.ts ChartDraw.
// Our own SVG drawing (no Chart.js): every mark is a primitive with a key that stays the same for the same slice, point,
// dot or cell, so the renderer glides them when the numbers change. The drawing lives in ./radial/*.
import type { ChartDraw } from "../types";
import { ROUND } from "./radial/round";
import { RADAR } from "./radial/radar";
import { DOTS } from "./radial/dots";
import { UNITS } from "./radial/units";
import { SPANS } from "./radial/spans";
export const KINDS: ChartDraw[] = [...ROUND, RADAR, DOTS, UNITS, SPANS];
