// The chart registry (integrator, M0; lanes do not edit it): xy (lane ch-xy), radial (ch-radial), kinds (ch-wire).
import type { ChartDraw, ChartKind } from "../types";
import { KINDS as XY } from "./xy";
import { KINDS as RADIAL } from "./radial";
import { KINDS as OURS } from "./kinds";
export const CHART: Record<ChartKind, ChartDraw> = Object.fromEntries([...XY, ...RADIAL, ...OURS].map((c) => [c.kind, c])) as Record<ChartKind, ChartDraw>;
