// A page's ```chart fence (the YAML of format 7 to 11), evaluated by the old code (core/chart11.ts), as a ChartSpec and numbers
// this lane draws. It is how the 39 chart fences reach the new drawing, and what the chart part (lane ch-wire) can call until
// the parse lane writes ChartSpec itself. Only the kinds this lane draws (bar line area scatter bubble candlestick heatmap).
import type { ChartSpec, ChartKind } from "../../types";
import { evalChart11, type Eval11 } from "../../../core/chart11";
import type { Val } from "../../../core/expr";

export const XY_KINDS: string[] = ["bar", "line", "area", "scatter", "bubble", "candlestick", "heatmap"];
export interface Legacy { spec: ChartSpec; values: number[][]; data: Eval11; error?: string }

const roleOf = (tone: string | undefined): string | null => {
  if (!tone) return null;
  if (/^[1-8]$/.test(tone)) return `c${tone}`;
  return tone === "acc" ? "accent" : tone;
};
const nan = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/** `d` is the chart as written (the parsed YAML); `controls` the reader's values; `step` the chart's own step. */
export function fromLegacy(d: any, controls?: Record<string, Val>, step = 0): Legacy | null {
  if (!XY_KINDS.includes(d?.kind)) return null;
  const data = evalChart11(d, controls, step);
  const kind = d.kind as ChartKind;
  const o: Record<string, string> = {};
  const set = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== "") o[k] = String(v); };
  const ax = (name: "x" | "y" | "y2") => {
    const a = d[name];
    if (a && typeof a === "object" && !Array.isArray(a)) { set(`${name}.label`, a.label); set(`${name}.min`, a.min); set(`${name}.max`, a.max); if (a.scale === "log") set(`${name}.scale`, "log"); }
  };
  ax("x"); ax("y"); ax("y2");
  const ext = data.ext;
  for (const a of ext.pc?.toggle?.axes ?? []) o[`${a}.toggle`] = "1"; // eng-stagebars: the tick words' room is the same in both scales
  if (ext.time) { o["x.scale"] = "time"; o.tz = ext.tz; if (ext.pc?.time?.min !== undefined) o["x.min"] = String(ext.pc.time.min); if (ext.pc?.time?.max !== undefined) o["x.max"] = String(ext.pc.time.max); set("x.unit", ext.pc?.time?.unit); set("x.every", ext.pc?.time?.every); }
  for (const id of ["x", "y", "y2"] as const) { const f = ext.formats[id]; if (f) { set(`${id}.format`, f.format); set(`${id}.currency`, f.currency); } }
  if (ext.anns.length) o.ann = JSON.stringify(ext.anns);
  if (ext.heat) { set("heat.diverge", ext.heat.diverge); set("heat.tone", ext.heat.tone); }
  const flags: string[] = [];
  if (d.stacked === "percent") flags.push("stacked", "percent"); else if (d.stacked === true) flags.push("stacked");
  if (d.horizontal === true) flags.push("horizontal");
  const values: number[][] = [];
  const series = data.series.map((s, i) => {
    let v: number[];
    if (kind === "scatter" || kind === "bubble") v = (s.data as any[]).flatMap((p) => (kind === "bubble" ? [p.x, p.y, p.r] : [p.x, p.y]));
    else if (kind === "candlestick" && s.kind !== "line") v = (s.data as any[]).flatMap((c) => (c ? c : [NaN, NaN, NaN, NaN]));
    else if ((s.data as any[]).some(Array.isArray)) { v = (s.data as any[]).flatMap((c) => (Array.isArray(c) ? c : [NaN, NaN])); o[`s${i}.range`] = "1"; }
    else v = (s.data as any[]).map(nan);
    values.push(v);
    if (s.kind && kind !== "candlestick") o[`s${i}.kind`] = s.kind;
    if (kind === "candlestick" && s.kind === "line") o[`s${i}.kind`] = "line";
    if (s.axis === "y2") o[`s${i}.axis`] = "y2";
    const st = ext.pc?.styles?.[s.name];
    if (st?.line) o[`s${i}.line`] = st.line;
    if (st?.marker) o[`s${i}.marker`] = st.marker;
    return { name: s.name, role: roleOf(s.tone), values: v };
  });
  const spec: ChartSpec = { kind, title: typeof d.title === "string" ? d.title : "", unit: null, x: kind === "scatter" || kind === "bubble" ? [] : data.x.map(String), series, flags, opts: o };
  return { spec, values, data, ...(data.error ? { error: data.error } : {}) };
}
