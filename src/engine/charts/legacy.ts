// A page's ```chart fence (the YAML of format 7 to 11) as a ChartSpec and numbers for ANY kind the chart part draws:
// xy kinds through ./xy/legacy.ts (fromLegacy), pie doughnut polar radar here. The numbers come from the old evaluator
// (core/chart11.ts), so the controls' formulas, steps and value formats keep meaning what they meant.
import type { ChartKind, ChartSpec } from "../types";
import { evalChart11 } from "../../core/chart11";
import type { Val } from "../../core/expr";
import { fromLegacy, XY_KINDS, type Legacy } from "./xy/legacy";

export const RADIAL_KINDS: string[] = ["pie", "doughnut", "polar", "radar"];
export type { Legacy };
const nan = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const roleOf = (tone: string | undefined): string | null => (!tone ? null : /^[1-8]$/.test(tone) ? `c${tone}` : tone === "acc" ? "accent" : tone);

/** the chart as written, at the reader's control values and the chart's own step */
export function chartFrom(d: any, controls?: Record<string, Val>, step = 0): Legacy | null {
  if (XY_KINDS.includes(d?.kind)) {
    const lg = fromLegacy(d, controls, step);
    // a chart whose steps add series: the key keeps room for every series of the story, so the plot does not move from step to step
    if (lg && Array.isArray(d.steps) && d.steps.length > 1) {
      const names = new Set<string>(lg.spec.series.map((s) => s.name));
      for (let k = 0; k < d.steps.length; k++) { try { for (const s of fromLegacy(d, controls, k)?.spec.series ?? []) names.add(s.name); } catch { /* a step the evaluator refuses adds none */ } }
      if (names.size > lg.spec.series.length) lg.spec.opts["key.reserve"] = JSON.stringify([...names]);
    }
    // a time axis' own tick unit and step: fromLegacy hands only its bounds (the xy kinds read x.unit and x.every when they can)
    const t = lg?.data.ext.pc?.time;
    if (lg && t?.unit) lg.spec.opts["x.unit"] = t.unit;
    if (lg && t?.every) lg.spec.opts["x.every"] = String(t.every);
    return lg;
  }
  if (!RADIAL_KINDS.includes(d?.kind)) return null;
  const data = evalChart11(d, controls, step), kind = d.kind as ChartKind, o: Record<string, string> = {};
  const f = data.ext.formats.y;
  if (f) { o.format = f.format; if (f.currency) o.currency = f.currency; }
  if (kind === "radar" || kind === "polar") for (const k of ["min", "max"]) if (d.y && typeof d.y === "object" && typeof d.y[k] === "number") o[k] = String(d.y[k]);
  const values = data.series.map((s) => (s.data as unknown[]).map(nan));
  const series = data.series.map((s, i) => ({ name: s.name, role: roleOf(s.tone), values: values[i] }));
  const spec: ChartSpec = { kind, title: typeof d.title === "string" ? d.title : "", unit: null, x: data.x.map(String), series, flags: [], opts: o };
  return { spec, values, data, ...(data.error ? { error: data.error } : {}) };
}
