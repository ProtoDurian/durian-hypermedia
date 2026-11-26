// Hand-built chart specs for the radial lane (made-up numbers): the same shapes the parse lane gives a `[chart <kind>]` thing.
import type { ChartSpec } from "../../../src/engine/types";
import { measure } from "../../../src/core/stage-core";
import type { ChartCtx } from "../../../src/engine/types";
export const ctx = (phone: boolean, extra: Partial<ChartCtx> = {}): ChartCtx => ({ phone, look: "stage", measure, step: 0, prev: null, max: [], lit: [], ...extra });
const spec = (kind: ChartSpec["kind"], x: string[], series: ChartSpec["series"], extra: Partial<ChartSpec> = {}): ChartSpec => ({ kind, title: "", unit: null, x, series, flags: [], opts: {}, ...extra });
export const PIE = spec("pie", ["Ask", "Validate", "Generate", "Write"], [{ name: "seconds", role: null, values: [4, 5, 12, 5] }], { title: "Time in one create" });
export const DOUGHNUT = spec("doughnut", ["init calls", "validate calls"], [{ name: "runs", role: null, values: [4, 2] }]);
export const POLAR = spec("polar", ["Morning", "Noon", "Afternoon", "Evening", "Night"], [{ name: "calls", role: null, values: [34, 52, 61, 28, 9] }]);
export const RADAR = spec("radar", ["Speed", "Safety", "Size", "Clarity", "Cost"], [{ name: "Replay all answers", role: null, values: [3, 5, 2, 4, 4] }, { name: "Keep a session", role: null, values: [5, 2, 4, 3, 2] }]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DOTS6 = spec("dots", MONTHS, [{ name: "returns", role: "store", values: [24, 19, 31, 22, 27, 12] }], { unit: "books" });
export const DOTS_CTX = { max: [[35]], lit: [] as string[], prev: null as number[][] | null };
export const DOTS12_CTX = { max: [[35]], lit: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], prev: [[24, 19, 31, 22, 27, 12]] };
export const DOTS12 = DOTS6;
export const DOTS12V = [24, 19, 31, 22, 27, 12, 9, 11, 28, 30, 26, 35];
export const UNITS = spec("units", ["kept", "added", "removed"], [{ name: "clips", role: null, values: [16, 8, 4] }], { opts: { total: "64" } });
export const UNITS_PANEL = spec("units", ["kept", "leaving"], [{ name: "client desk", role: "job", values: [8, 4] }, { name: "server desk", role: "job", values: [10, 2] }]);
export const SPANS = spec("spans", ["Plan", "Build", "Test", "Ship"], [{ name: "start", role: "job", values: [0, 2, 5, 8] }, { name: "end", role: "job", values: [3, 6, 8, 8] }], { opts: { unit: "weeks" } });
