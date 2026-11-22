// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// chart: The chart shape (kind, x, y, series with name and data) plus controls and let.
// Pure: no node modules, so the browser evaluates a chart with the same code doccheck checks it with.
import { parseDefs, evalDefs, parse as parseExpr, evaluate as evalAst, sizeOf, spelledOf, type Val } from "./expr";
import { type Budget, BudgetError, partBudget } from "./budget";
import { yamlExtra } from "../host/yaml";
export const CHART_CAPS = { controls: 100, options: 1000, message: 2000 };
/** JSON of a value from the author's text, stopping after max characters (never the whole of a long or shared value). */
export function briefJson(v: any, max = 60): string {
  let out = "";
  const put = (s: string) => { out += s; return out.length < max; };
  const walk = (x: any, depth: number): boolean => {
    if (typeof x === "string") return put(JSON.stringify(x.length > max ? x.slice(0, max) : x));
    if (x === null || typeof x !== "object") return put(String(JSON.stringify(x) ?? x));
    if (depth > 8) return put("…");
    if (Array.isArray(x)) { if (!put("[")) return false; for (let i = 0; i < x.length; i++) { if ((i && !put(",")) || !walk(x[i], depth + 1)) return false; } return put("]"); }
    if (!put("{")) return false;
    let first = true;
    for (const k of Object.keys(x)) { if ((!first && !put(",")) || !put(JSON.stringify(k.length > max ? k.slice(0, max) : k) + ":") || !walk(x[k], depth + 1)) return false; first = false; }
    return put("}");
  };
  walk(v, 0);
  return out.length > max ? out.slice(0, max - 1) + "…" : out;
}
/** A value from the author's text as a short label: text and numbers as they are, anything else as short JSON. */
export const label = (v: any, max = 200): string => { const t = v === null || typeof v !== "object" ? String(v) : briefJson(v, max); return t.length > max ? t.slice(0, max - 1) + "…" : t; };
// a value from the author's text in an error message: short, and never a long list printed out
const brief = (v: any, json = false): string => (Array.isArray(v) ? `a list of ${v.length}` : json || (v !== null && typeof v === "object") ? briefJson(v) : label(v, 60));
const fmt = (n: number) => n.toLocaleString("en-US");
/** YAML anchors and aliases may repeat data: what a chart holds may pass what its source spells out by at most one
 *  part's caps. What the source spells out is the length of its YAML text (a value slot or a character takes at least
 *  one character of text); for data that did not come from yamlParse, its size with each shared list counted once.
 *  Returns the room the chart's results have (what the source spells out plus one part's caps). */
export function chartRoom(d: any, b: Budget): { n: number; c: number; spelled: { n: number; c: number } } {
  const t = yamlExtra(d)?.text;
  const spelled = t != null ? { n: t, c: t } : spelledOf(d, b), whole = sizeOf(d, b);
  const room = { n: spelled.n + b.limits.values, c: spelled.c + b.limits.chars, spelled };
  if (whole.n > room.n || whole.c > room.c) throw new BudgetError(`the chart's YAML anchors and aliases repeat too much (${whole.n > room.n ? `${fmt(whole.n)} values where the source spells out ${fmt(spelled.n)}` : `${fmt(whole.c)} characters where the source spells out ${fmt(spelled.c)}`}; the limit for one part is ${fmt(b.limits.values)} values and ${fmt(b.limits.chars)} characters more)`);
  return room;
}
export interface ChartControl { kind: "slider" | "select" | "toggle" | "button"; name: string; label?: string; min?: number; max?: number; step?: number; value?: Val; options?: Val[]; set?: Record<string, Val> }
export function chartControls(d: any): { controls: ChartControl[]; errors: string[] } {
  const errors: string[] = [], controls: ChartControl[] = [];
  const all: any[] = Array.isArray(d?.controls) ? d.controls : [];
  if (all.length > CHART_CAPS.controls) errors.push(`a chart has at most ${CHART_CAPS.controls} controls (it has ${all.length}); the rest are left out`);
  for (const c of all.slice(0, CHART_CAPS.controls)) {
    const kind = isObj(c) ? (["slider", "select", "toggle", "button"] as const).find((k) => k in c) : undefined;
    if (!kind) { errors.push(`a control needs one of slider, select, toggle or button: ${brief(c, true)}`); continue; }
    if (typeof c[kind] === "string" && c[kind].length > 64) { errors.push(`a control name has at most 64 characters: "${label(c[kind], 40)}"`); continue; }
    const name = label(c[kind], 64);
    if (kind === "select" && Array.isArray(c.options) && c.options.length > CHART_CAPS.options) { errors.push(`select ${name} has ${c.options.length} options; the limit is ${CHART_CAPS.options}`); continue; }
    if (kind === "slider") { if (typeof c.min !== "number" || typeof c.max !== "number" || c.min >= c.max) errors.push(`slider ${name} needs min < max`); controls.push({ kind, name, label: c.label, min: c.min, max: c.max, step: c.step ?? 1, value: c.value ?? c.min }); }
    else if (kind === "select") { if (!Array.isArray(c.options) || c.options.length < 2) errors.push(`select ${name} needs at least 2 options`); controls.push({ kind, name, label: c.label, options: c.options ?? [], value: c.value ?? c.options?.[0] }); }
    else if (kind === "toggle") controls.push({ kind, name, label: c.label, value: Boolean(c.value) });
    else { if (!c.set || typeof c.set !== "object") errors.push(`button ${name} needs set: {control: value}`); controls.push({ kind, name, label: c.label ?? name, set: c.set ?? {} }); }
  }
  return { controls, errors };
}
export const CHART_KINDS = ["bar", "line", "area", "scatter", "bubble", "radar", "pie", "doughnut", "polar", "candlestick"];
export const CHART_KEYS = ["kind", "title", "x", "y", "y2", "series", "stacked", "horizontal", "controls", "let"];
export const SERIES_KEYS = ["name", "label", "data", "values", "kind", "tone", "axis"];
export const SERIES_KINDS = ["bar", "line", "area"]; // a series' own kind (mixed charts)
export const CANDLE_SERIES_KINDS = ["line", "candlestick"]; // in a candlestick chart: the candles (no kind, or candlestick) and lines on top
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
  mixed: boolean; candle: boolean; y2: boolean; round: boolean; points: boolean; category: boolean; radial: boolean;
  scale: { x: string; y: string; y2: string }; // "linear" or "log"
}
// what the renderer and the LLM view need to know about a chart, from its source alone
export function chartMeta(d: any): ChartMeta {
  const kind = label(d?.kind ?? "bar", 20);
  const series: any[] = Array.isArray(d?.series) ? d.series : [];
  const types = new Set(series.map((s) => typeOf(label(s?.kind ?? kind, 20))));
  const sc = (a: any) => (isObj(a) && a.scale === "log" ? "log" : "linear");
  return {
    kind, horizontal: d?.horizontal === true, stacked: d?.stacked === "percent" ? "percent" : d?.stacked === true,
    candle: kind === "candlestick",
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
  if (d.stacked !== undefined && d.stacked !== true && d.stacked !== false && d.stacked !== "percent") out.push(`stacked must be true, false or percent (not ${briefJson(d.stacked)})`);
  if (m.stacked && !m.category) out.push(m.candle ? `a candlestick chart cannot be stacked (a candle is one period's open, high, low and close); remove stacked` : `stacked works with kind bar, line or area (this chart is ${kind}); remove stacked`);
  if (d.horizontal !== undefined && typeof d.horizontal !== "boolean") out.push(`horizontal must be true or false`);
  if (d.horizontal === true && kind !== "bar") out.push(m.candle ? `a candlestick chart has its periods along the bottom and cannot be horizontal; remove horizontal` : `horizontal works with kind: bar (this chart is ${kind}); remove horizontal`);
  if (d.horizontal === true && m.mixed) out.push(`a horizontal chart draws bars only; remove the series that has kind: line or kind: area, or remove horizontal`);
  if (d.horizontal === true && m.y2) out.push(`a horizontal chart has one value axis; remove y2 and axis: y2, or remove horizontal`);
  // axes: keys, min and max, scale
  const axes: [string, any][] = [["x", d.x], ["y", d.y], ["y2", d.y2]];
  for (const [name, a] of axes) {
    if (a === undefined || Array.isArray(a) || (name === "x" && typeof a === "string")) continue;
    if (!isObj(a)) { out.push(`${name} must be a list or an object with label, min, max and scale`); continue; }
    const keys = name === "x" ? ["label", "values", "min", "max", "scale"] : ["label", "min", "max", "scale"];
    for (const k of Object.keys(a)) if (!keys.includes(k)) out.push(`${name}: unknown key "${label(k, 60)}" (keys: ${keys.join(", ")})`);
    for (const k of ["min", "max"]) if (a[k] !== undefined && !num(a[k])) out.push(`${name}.${k} must be a number`);
    if (num(a.min) && num(a.max) && a.min >= a.max) out.push(`${name}: min must be below max`);
    if (a.scale !== undefined) {
      const ok = name === "x" ? m.points : name === "y2" ? m.category || m.candle : m.category || m.points || m.candle;
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
    const nm = isObj(s) ? label(s.name ?? s.label ?? `#${i + 1}`, 60) : `#${i + 1}`;
    if (!isObj(s)) { out.push(`series ${nm} must be an object with name and data`); return; }
    for (const k of Object.keys(s)) if (!SERIES_KEYS.includes(k)) out.push(`series "${nm}": unknown key "${label(k, 60)}" (keys: ${SERIES_KEYS.join(", ")})`);
    if (s.kind !== undefined) {
      if (m.candle) { if (!CANDLE_SERIES_KINDS.includes(s.kind)) out.push(`series "${nm}": in a candlestick chart a series is the candles (no kind) or a line on top (kind: line); ${briefJson(s.kind)} is not drawn there`); }
      else if (!m.category) out.push(`series "${nm}": its own kind works in a bar, line or area chart (this chart is ${kind}); remove it`);
      else if (!SERIES_KINDS.includes(s.kind)) out.push(`series "${nm}": kind must be bar, line or area`);
    }
    if (s.axis !== undefined) {
      if (s.axis !== "y" && s.axis !== "y2") out.push(`series "${nm}": axis must be y or y2`);
      else if (!m.category && !m.candle) out.push(`series "${nm}": axis works in a bar, line or area chart (this chart is ${kind}); remove it`);
      else if (m.candle && !isLine(s, m)) out.push(`series "${nm}": the candles sit on the main axis; remove axis (only a line on top can use y2)`);
      else if (s.axis === "y2" && !m.y2) out.push(`series "${nm}": axis: y2 needs a second axis; add y2: { label: ... } to the chart`);
    }
    if (s.tone !== undefined && !CHART_TONES.includes(label(s.tone, 20))) out.push(`series "${nm}": tone must be 1 to 8, accent, good, warn, bad or muted (got ${briefJson(s.tone)})`);
  });
  if (m.candle) {
    const candles = series.filter((s) => isObj(s) && !isLine(s, m));
    if (candles.length !== 1) out.push(candles.length === 0 ? `a candlestick chart needs one series without a kind (the candles: data is [open, high, low, close] per period); add it, or use kind: line` : `a candlestick chart draws one set of candles; make the other ${candles.length - 1} series lines (kind: line) or remove them`);
    for (const s of candles) if (s.tone !== undefined) out.push(`series "${label(s.name ?? s.label ?? "candles", 60)}": the candles take good (up) and bad (down) from the theme; remove tone (a line on top may have one)`);
  }
  if (m.y2 && (m.category || m.candle) && onY2 === 0) out.push(`y2 is declared but no series uses it; add axis: y2 to a series, or remove y2`);
  if (m.stacked === "percent" && series.some((s) => isObj(s) && typeOf(label(s.kind ?? kind, 20)) !== typeOf(kind) && s.axis !== "y2")) out.push(`with stacked: percent, a series of another kind must use axis: y2 (it cannot sit on the 0 to 100 percent axis)`);
  return out;
}

const isLine = (s: any, m: ChartMeta) => (m.candle ? s?.kind === "line" : false);
export interface ChartSeries { name: string; data: any[]; kind?: string; tone?: string; axis?: string }
// evaluate a chart for given control values; returns the data Chart.js draws, or an error
// Category kinds: data is a list of numbers (null = gap), or [low, high] in a bar series (a floating bar).
// scatter and bubble: data is a list of points, written [x, y] (bubble: [x, y, size]) or {x, y, size}; they come back as {x, y, r?}.
// The work is paid for from budget: by default one part of the running parse() call's page budget, or a fresh one (a
// reader moving a control). Over it, the result has error and limit: true (parse() then refuses the part).
export function evalChart(d: any, values?: Record<string, Val>, budget?: Budget): { x: Val[]; series: ChartSeries[]; vars: Record<string, Val>; error?: string; limit?: "part" | "page" } {
  try {
    const b = budget ?? partBudget();
    const room = chartRoom(d, b);
    const { controls } = chartControls(d);
    b.charge(1 + controls.length); // reading the controls, once per evaluation (check() evaluates every case)
    const start: Record<string, Val> = {};
    for (const c of controls) if (c.kind !== "button") start[c.name] = c.value as Val;
    const { defs, errors } = parseDefs(d.let ?? {}, controls.filter((c) => c.kind !== "button").map((c) => c.name), b);
    if (errors.length) throw new Error(errors.join("; "));
    const vars = evalDefs(defs, { ...start, ...(values ?? {}) }, b);
    const ev = (v: any): Val => (typeof v === "string" ? evalStr(v, vars, defs, b) : v);
    const m = chartMeta(d);
    const xs = Array.isArray(d.x) || typeof d.x === "string" ? d.x : d.x?.values;
    const x = (xs == null && m.points ? [] : ev(xs)) as Val[];
    if (!Array.isArray(x)) throw new Error("x must be a list or an expression that makes one");
    const series: ChartSeries[] = (Array.isArray(d.series) ? d.series : []).map((s: any) => ({ name: label(s?.name ?? s?.label ?? ""), data: ev(s?.data ?? s?.values) as any[], kind: s?.kind, tone: s?.tone == null ? undefined : label(s.tone), axis: s?.axis }));
    // everything the result holds (vars, x, every series and its name), counted as it will be written out (a shared list
    // each time), is no more than the source spells out plus one part's caps
    let held = 0, text = 0;
    const add = (v: unknown) => { const z = sizeOf(v, b); held += 1 + z.n; text += z.c; };
    for (const k of Object.keys(vars)) { text += k.length; add(vars[k]); }
    add(x);
    for (const s of series) { add(s.name); add(s.data); add(s.tone); add(s.kind); add(s.axis); }
    if (held > room.n || text > room.c) throw new BudgetError(`the chart's data is too big (${held > room.n ? `${fmt(held)} values where the source spells out ${fmt(room.n - b.limits.values)}` : `${fmt(text)} characters where the source spells out ${fmt(room.c - b.limits.chars)}`}; the limit for one part is ${fmt(b.limits.values)} values and ${fmt(b.limits.chars)} characters more)`);
    // what the result holds beyond its source and beyond what this part already paid for (a list or text named many
    // times) is charged too, so across the page the results stay within the sources plus the page's caps
    const overN = held - room.spelled.n - b.values, overC = text - room.spelled.c - b.chars;
    if (overN > 0 || overC > 0) b.charge(1, Math.max(0, overN), Math.max(0, overC));
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
            if (!num(p[2]) || p[2] <= 0) throw new Error(`series "${s.name}" point ${i + 1} has size ${brief(p[2], true)}; the size must be a number above 0`);
          } else if (p.length > 2 && p[2] != null) throw new Error(`series "${s.name}" point ${i + 1} has three values; a scatter point is [x, y] (use kind: bubble for a size)`);
          if (m.scale.x === "log") log(s, "x", p[0]);
          if (m.scale.y === "log") log(s, "y", p[1]);
          return bubble ? { x: p[0], y: p[1], r: p[2] } : { x: p[0], y: p[1] };
        });
        continue;
      }
      if (m.candle && s.kind === "line" && s.data.some((v: any) => v !== null && !num(v))) throw new Error(`series "${s.name}" is a line on top of the candles: one number (or null) per period`);
      if (s.data.length !== x.length) throw new Error(`series "${s.name}" has ${s.data.length} values, x has ${x.length}`);
      if (m.candle && s.kind !== "line") { checkCandles(s, x, m.scale.y === "log" ? (v: number) => log(s, "y", v) : undefined); continue; }
      const type = typeOf(s.kind ?? d.kind);
      const lg = (s.axis === "y2" ? m.scale.y2 : m.scale.y) === "log" && (m.category || m.candle);
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
  } catch (e) { const m = String((e as Error).message); return { x: [], series: [], vars: {}, error: m.length > CHART_CAPS.message ? m.slice(0, CHART_CAPS.message - 1) + "…" : m, ...(e instanceof BudgetError ? { limit: e.page ? "page" as const : "part" as const } : {}) }; }
}
// a candle is [open, high, low, close]: high is the top of the wick, low the bottom, so neither may be crossed by the open or close
export const CANDLE_PARTS = ["open", "high", "low", "close"];
function checkCandles(s: ChartSeries, x: Val[], lg?: (v: number) => void) {
  if (s.data.length !== x.length) throw new Error(`series "${s.name}" has ${s.data.length} candles, x has ${x.length} periods`);
  s.data.forEach((c: any, i: number) => {
    if (c === null) return;
    const at = `series "${s.name}" candle ${i + 1} (${brief(x[i])})`;
    if (!Array.isArray(c) || c.length !== 4 || !c.every(num)) throw new Error(`${at} must be four numbers [open, high, low, close]${Array.isArray(c) ? ` (it has ${c.length === 4 ? "a value that is not a number" : c.length})` : ""}; use null for a period with no candle`);
    const [o, h, l, cl] = c as number[];
    const top = [["open", o], ["close", cl], ["low", l]].sort((p, q) => (q[1] as number) - (p[1] as number))[0];
    const bot = [["open", o], ["close", cl], ["high", h]].sort((p, q) => (p[1] as number) - (q[1] as number))[0];
    if (h < (top[1] as number)) throw new Error(`${at}: high ${h} is below the ${top[0]} (${top[1]}); the order is [open, high, low, close] and high must be the largest`);
    if (l > (bot[1] as number)) throw new Error(`${at}: low ${l} is above the ${bot[0]} (${bot[1]}); the order is [open, high, low, close] and low must be the smallest`);
    if (lg) for (const v of c) lg(v);
  });
}
function evalStr(src: string, vars: Record<string, Val>, defs: any, b: Budget): Val { return evalAst(parseExpr(src, b), { vars, fns: defs.fns }, b); }
