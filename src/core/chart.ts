// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// chart: The chart shape (kind, x, y, series with name and data) plus controls and let.
// Pure: no node modules, so the browser evaluates a chart with the same code doccheck checks it with.
import { parseDefs, evalDefs, parse as parseExpr, evaluate as evalAst, type Val } from "./expr";
export interface ChartControl { kind: "slider" | "select" | "toggle" | "button"; name: string; label?: string; min?: number; max?: number; step?: number; value?: Val; options?: Val[]; set?: Record<string, Val> }
export function chartControls(d: any): { controls: ChartControl[]; errors: string[] } {
  const errors: string[] = [], controls: ChartControl[] = [];
  for (const c of d?.controls ?? []) {
    const kind = (["slider", "select", "toggle", "button"] as const).find((k) => k in c);
    if (!kind) { errors.push(`a control needs one of slider, select, toggle or button: ${JSON.stringify(c)}`); continue; }
    const name = String(c[kind]);
    if (kind === "slider") { if (typeof c.min !== "number" || typeof c.max !== "number" || c.min >= c.max) errors.push(`slider ${name} needs min < max`); controls.push({ kind, name, label: c.label, min: c.min, max: c.max, step: c.step ?? 1, value: c.value ?? c.min }); }
    else if (kind === "select") { if (!Array.isArray(c.options) || c.options.length < 2) errors.push(`select ${name} needs at least 2 options`); controls.push({ kind, name, label: c.label, options: c.options ?? [], value: c.value ?? c.options?.[0] }); }
    else if (kind === "toggle") controls.push({ kind, name, label: c.label, value: Boolean(c.value) });
    else { if (!c.set || typeof c.set !== "object") errors.push(`button ${name} needs set: {control: value}`); controls.push({ kind, name, label: c.label ?? name, set: c.set ?? {} }); }
  }
  return { controls, errors };
}
export const CHART_KINDS = ["bar", "line", "area", "scatter", "bubble", "radar", "pie", "doughnut", "polar"];
export const CHART_KEYS = ["kind", "title", "x", "y", "y2", "series", "stacked", "horizontal", "controls", "let"];
export const SERIES_KEYS = ["name", "label", "data", "values", "kind", "tone", "axis"];
export const SERIES_KINDS = ["bar", "line", "area"]; // a series' own kind (mixed charts)
export const CHART_TONES = ["1", "2", "3", "4", "5", "6", "7", "8", "accent", "good", "warn", "bad", "muted"];
export const CHART_SCALES = ["linear", "log"];
const CATEGORY = ["bar", "line", "area"]; // charts with a category x axis and a value axis
const POINTS = ["scatter", "bubble"];
const ROUND = ["pie", "doughnut", "polar"];
const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);
const num = (v: any) => typeof v === "number" && Number.isFinite(v);
const typeOf = (k: string) => (k === "area" ? "line" : k);

export interface ChartMeta {
  kind: string; horizontal: boolean; stacked: false | true | "percent";
  mixed: boolean; y2: boolean; round: boolean; points: boolean; category: boolean; radial: boolean;
  scale: { x: string; y: string; y2: string }; // "linear" or "log"
}
// what the renderer and the LLM view need to know about a chart, from its source alone
export function chartMeta(d: any): ChartMeta {
  const kind = String(d?.kind ?? "bar");
  const series: any[] = Array.isArray(d?.series) ? d.series : [];
  const types = new Set(series.map((s) => typeOf(String(s?.kind ?? kind))));
  const sc = (a: any) => (isObj(a) && a.scale === "log" ? "log" : "linear");
  return {
    kind, horizontal: d?.horizontal === true, stacked: d?.stacked === "percent" ? "percent" : d?.stacked === true,
    mixed: CATEGORY.includes(kind) && (types.size > 1 || (types.size === 1 && !types.has(typeOf(kind)))), y2: isObj(d?.y2), round: ROUND.includes(kind), points: POINTS.includes(kind),
    category: CATEGORY.includes(kind), radial: kind === "radar" || kind === "polar",
    scale: { x: sc(d?.x), y: sc(d?.y), y2: sc(d?.y2) },
  };
}

// the rules a chart's source must follow whatever its data is; each message names the fix (data rules: evalChart)
export function chartCheck(d: any): string[] {
  const out: string[] = [];
  const kind = d?.kind;
  if (!CHART_KINDS.includes(kind)) return out; // doccheck reports the kind itself
  const m = chartMeta(d);
  const series: any[] = Array.isArray(d.series) ? d.series : [];
  if (d.stacked !== undefined && d.stacked !== true && d.stacked !== false && d.stacked !== "percent") out.push(`stacked must be true, false or percent (not ${JSON.stringify(d.stacked)})`);
  if (m.stacked && !m.category) out.push(`stacked works with kind bar, line or area (this chart is ${kind}); remove stacked`);
  if (d.horizontal !== undefined && typeof d.horizontal !== "boolean") out.push(`horizontal must be true or false`);
  if (d.horizontal === true && kind !== "bar") out.push(`horizontal works with kind: bar (this chart is ${kind}); remove horizontal`);
  if (d.horizontal === true && m.mixed) out.push(`a horizontal chart draws bars only; remove the series that has kind: line or kind: area, or remove horizontal`);
  if (d.horizontal === true && m.y2) out.push(`a horizontal chart has one value axis; remove y2 and axis: y2, or remove horizontal`);
  // axes: keys, min and max, scale
  const axes: [string, any][] = [["x", d.x], ["y", d.y], ["y2", d.y2]];
  for (const [name, a] of axes) {
    if (a === undefined || Array.isArray(a) || (name === "x" && typeof a === "string")) continue;
    if (!isObj(a)) { out.push(`${name} must be a list or an object with label, min, max and scale`); continue; }
    const keys = name === "x" ? ["label", "values", "min", "max", "scale"] : ["label", "min", "max", "scale"];
    for (const k of Object.keys(a)) if (!keys.includes(k)) out.push(`${name}: unknown key "${k}" (keys: ${keys.join(", ")})`);
    for (const k of ["min", "max"]) if (a[k] !== undefined && !num(a[k])) out.push(`${name}.${k} must be a number`);
    if (num(a.min) && num(a.max) && a.min >= a.max) out.push(`${name}: min must be below max`);
    if (a.scale !== undefined) {
      const ok = name === "x" ? m.points : name === "y2" ? m.category : m.category || m.points;
      if (!CHART_SCALES.includes(a.scale)) out.push(`${name}.scale must be linear or log (symlog and time scales are not drawn; use log, or write the dates as x labels)`);
      else if (!ok) out.push(`${name}.scale does not apply to ${kind === "bar" || kind === "line" || kind === "area" ? `the ${name} axis` : `kind ${kind}`}; remove it${name === "x" && m.category ? " (a category axis has no scale)" : ""}`);
      else if (a.scale === "log") {
        if (num(a.min) && a.min <= 0) out.push(`${name}: a log scale needs min above 0 (got ${a.min}); set min to a positive number or remove it`);
        if (m.stacked && name === "y") out.push(`a log scale cannot be stacked; remove stacked or use scale: linear`);
      }
    }
  }
  // series: keys, kind, axis, tone
  const onY2 = series.filter((s) => isObj(s) && s.axis === "y2").length;
  series.forEach((s, i) => {
    const nm = isObj(s) ? String(s.name ?? s.label ?? `#${i + 1}`) : `#${i + 1}`;
    if (!isObj(s)) { out.push(`series ${nm} must be an object with name and data`); return; }
    for (const k of Object.keys(s)) if (!SERIES_KEYS.includes(k)) out.push(`series "${nm}": unknown key "${k}" (keys: ${SERIES_KEYS.join(", ")})`);
    if (s.kind !== undefined) {
      if (!m.category) out.push(`series "${nm}": its own kind works in a bar, line or area chart (this chart is ${kind}); remove it`);
      else if (!SERIES_KINDS.includes(s.kind)) out.push(`series "${nm}": kind must be bar, line or area`);
    }
    if (s.axis !== undefined) {
      if (s.axis !== "y" && s.axis !== "y2") out.push(`series "${nm}": axis must be y or y2`);
      else if (!m.category) out.push(`series "${nm}": axis works in a bar, line or area chart (this chart is ${kind}); remove it`);
      else if (s.axis === "y2" && !m.y2) out.push(`series "${nm}": axis: y2 needs a second axis; add y2: { label: ... } to the chart`);
    }
    if (s.tone !== undefined && !CHART_TONES.includes(String(s.tone))) out.push(`series "${nm}": tone must be 1 to 8, accent, good, warn, bad or muted (got ${JSON.stringify(s.tone)})`);
  });
  if (m.y2 && m.category && onY2 === 0) out.push(`y2 is declared but no series uses it; add axis: y2 to a series, or remove y2`);
  if (m.stacked === "percent" && series.some((s) => isObj(s) && typeOf(String(s.kind ?? kind)) !== typeOf(kind) && s.axis !== "y2")) out.push(`with stacked: percent, a series of another kind must use axis: y2 (it cannot sit on the 0 to 100 percent axis)`);
  return out;
}

export interface ChartSeries { name: string; data: any[]; kind?: string; tone?: string; axis?: string }
// evaluate a chart for given control values; returns the data Chart.js draws, or an error
// Category kinds: data is a list of numbers (null = gap), or [low, high] in a bar series (a floating bar).
// scatter and bubble: data is a list of points, written [x, y] (bubble: [x, y, size]) or {x, y, size}; they come back as {x, y, r?}.
export function evalChart(d: any, values?: Record<string, Val>): { x: Val[]; series: ChartSeries[]; vars: Record<string, Val>; error?: string } {
  try {
    const { controls } = chartControls(d);
    const start: Record<string, Val> = {};
    for (const c of controls) if (c.kind !== "button") start[c.name] = c.value as Val;
    const { defs, errors } = parseDefs(d.let ?? {}, controls.filter((c) => c.kind !== "button").map((c) => c.name));
    if (errors.length) throw new Error(errors.join("; "));
    const vars = evalDefs(defs, { ...start, ...(values ?? {}) });
    const ev = (v: any): Val => (typeof v === "string" ? evalStr(v, vars, defs) : v);
    const m = chartMeta(d);
    const xs = Array.isArray(d.x) || typeof d.x === "string" ? d.x : d.x?.values;
    const x = (xs == null && m.points ? [] : ev(xs)) as Val[];
    if (!Array.isArray(x)) throw new Error("x must be a list or an expression that makes one");
    const series: ChartSeries[] = (d.series ?? []).map((s: any) => ({ name: String(s.name ?? s.label ?? ""), data: ev(s.data ?? s.values) as any[], kind: s.kind, tone: s.tone == null ? undefined : String(s.tone), axis: s.axis }));
    if (m.radial && d.kind === "radar" && x.length < 3) throw new Error(`a radar chart needs at least 3 axes in x (it has ${x.length}); add axes, or use kind: bar`);
    const log = (s: ChartSeries, name: string, v: any) => { if (v !== null && v <= 0) throw new Error(`log scale needs values above 0 (series "${s.name}" has ${v}); use scale: linear or change the value`); void name; };
    for (const s of series) {
      if (!Array.isArray(s.data)) throw new Error(`series "${s.name}" data must be a list`);
      if (m.points) {
        const bubble = d.kind === "bubble";
        s.data = s.data.map((pt: any, i: number) => {
          const p = Array.isArray(pt) ? pt : isObj(pt) ? [pt.x, pt.y, pt.size ?? pt.r] : [pt];
          if (!num(p[0]) || !num(p[1])) throw new Error(`series "${s.name}" point ${i + 1} must be [x, y] with two numbers`);
          if (bubble) {
            if (p.length < 3 || p[2] == null) throw new Error(`series "${s.name}" point ${i + 1} has no size; a bubble point is [x, y, size]`);
            if (!num(p[2]) || p[2] <= 0) throw new Error(`series "${s.name}" point ${i + 1} has size ${JSON.stringify(p[2])}; the size must be a number above 0`);
          } else if (p.length > 2 && p[2] != null) throw new Error(`series "${s.name}" point ${i + 1} has three values; a scatter point is [x, y] (use kind: bubble for a size)`);
          if (m.scale.x === "log") log(s, "x", p[0]);
          if (m.scale.y === "log") log(s, "y", p[1]);
          return bubble ? { x: p[0], y: p[1], r: p[2] } : { x: p[0], y: p[1] };
        });
        continue;
      }
      if (s.data.length !== x.length) throw new Error(`series "${s.name}" has ${s.data.length} values, x has ${x.length}`);
      const type = typeOf(s.kind ?? d.kind);
      const lg = (s.axis === "y2" ? m.scale.y2 : m.scale.y) === "log" && m.category;
      s.data.forEach((v: any, i: number) => {
        if (v === null || num(v)) { if (lg) log(s, "y", v); if (m.round && v !== null && v < 0) throw new Error(`series "${s.name}" has ${v}; a ${d.kind} chart needs values of 0 or more`); return; }
        if (Array.isArray(v)) {
          if (type !== "bar" || !m.category) throw new Error(`series "${s.name}" value ${i + 1} is a range; a range [low, high] works in a bar series only`);
          if (v.length !== 2 || !num(v[0]) || !num(v[1])) throw new Error(`series "${s.name}" value ${i + 1} must be a pair [low, high] of two numbers`);
          if (v[0] > v[1]) throw new Error(`series "${s.name}" value ${i + 1}: low ${v[0]} is above high ${v[1]}; write [${v[1]}, ${v[0]}]`);
          if (m.stacked) throw new Error(`a floating bar (series "${s.name}") cannot be stacked; remove stacked`);
          if (lg) { log(s, "y", v[0]); log(s, "y", v[1]); }
          return;
        }
        throw new Error(`series "${s.name}" holds a value that is not a number`);
      });
    }
    return { x, series, vars };
  } catch (e) { return { x: [], series: [], vars: {}, error: (e as Error).message }; }
}
function evalStr(src: string, vars: Record<string, Val>, defs: any): Val { return evalAst(parseExpr(src), { vars, fns: defs.fns }); }
