// pagecharts: what pass 11 adds to the chart part for the page blocks (SCENE-22 section 3, "charts the original uses").
// Line styles and point markers per series, goal lines and bands (the goal words are read in tools/chart11.ts, which owns the
// annotation list), a real time axis (bounds, tick unit and step), a log and linear toggle on one chart, and the calculator layout.
// It sits beside tools/chart11.ts, which calls it from a few places. The evaluator (tools/chart.ts, tools/expr.ts) is not touched:
// every new word is read here, checked here, and taken out of the chart before the evaluator sees it (the same way chart11 does
// for `tz`, `format` and `annotations`). Pure: the browser draws with the same code doccheck checks with.
import { chartControls, chartCheck, evalChart, chartMeta, CHART_TONES, type ChartControl } from "./chart";
import { charge, lim } from "./chart-work";
import { parseTime, startOf, add, partsOf, wallToMs, MIN, HOUR, DAY, type TimeUnit } from "./chart-time";
import type { Val } from "./expr";

export const LINE_STYLES = ["solid", "dashed", "dotted"];
export const MARKERS = ["circle", "square", "triangle", "diamond", "plus", "cross", "none"];
export const SERIES_STYLE_KEYS = ["line", "marker"];
export const TIME_UNITS = ["minute", "hour", "day", "week", "month", "quarter", "year"];
export const LAYOUTS = ["calculator"];
export const CALC_ROW_KEYS = ["let", "label", "format", "currency", "unit", "note", "result", "verdict", "tone", "tone_from", "units", "slots", "per_row"];
/** the colour words of a verdict and of a units kind (the same words as everywhere: tone 1 to 8 as c1 to c8, acc, good, warn, bad, muted) */
export const ROW_TONES = [...CHART_TONES.filter((t) => t !== "accent"), "acc", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
export const UNIT_TILES = 200; // a units row draws at most this many tiles; the rest is said in words
/** the caps that are not lists a page can make long (the lengths of words and the sizes of tile grids) */
export const PC_CAPS = { inputs: 12, rows: 24, unit: 24, label: 60, note: 90, every: 1000, verdicts: 4, unitRows: 4, unitKinds: 6, unitTotal: 100_000, verdict: 80 };
export const PC_KEYS = ["layout", "calc", "inputs", "formulas"];
export const INPUT_LOOKS = ["boxes", "label"];
export const FORMULA_LOOKS = ["table", "worked"];
const MAX_FORMULA = 10_000; // the expression language's own length limit (tools/expr.ts)
export const AXIS_PC_KEYS = ["toggle", "min", "max", "unit", "every"]; // time axis: min, max, unit, every; any value axis: toggle
const FORMATS = ["number", "percent", "money", "duration", "duration-ms", "bytes"];

const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);
const num = (v: any) => typeof v === "number" && Number.isFinite(v);
const typeOf = (k: string) => (k === "area" ? "line" : k);

export interface PcStyle { line?: string; marker?: string }
export interface CalcRow { name: string; label: string; format: string; currency?: string; unit?: string; note: string; result: boolean; formula: string; verdict: boolean; tone?: string; toneFrom?: string; units?: { kind: string; tone: string }[]; slots?: number; perRow?: number; src: string }
export interface CalcInput { name: string; label: string; unit?: string; kind: string }
export interface PcExt {
  /** per series name: its line style and marker */
  styles: Record<string, PcStyle>;
  /** the axes that carry `toggle: true`, and the scale the chart starts with */
  toggle?: { axes: ("x" | "y" | "y2")[]; start: "linear" | "log" };
  /** a time axis' own bounds (ms), tick unit and step */
  time?: { min?: number; max?: number; unit?: string; every?: number };
  calc?: { rows: CalcRow[]; inputs: CalcInput[]; hasChart: boolean; inputLook: string; formulaLook: string };
}
export const emptyPc = (): PcExt => ({ styles: {} });

/** the scale toggle of a chart as written, read without evaluating anything (the renderer needs it before the first draw) */
export function toggleOf(d: any): PcExt["toggle"] | undefined {
  if (!isObj(d)) return undefined;
  const axes: ("x" | "y" | "y2")[] = [];
  let start: "linear" | "log" = "linear";
  for (const name of ["x", "y", "y2"] as const) {
    const a = d[name];
    if (isObj(a) && a.toggle === true) { if (!axes.length) start = a.scale === "log" ? "log" : "linear"; axes.push(name); }
  }
  return axes.length ? { axes, start } : undefined;
}
/** the chart with every toggle axis set to one scale (the reader's choice) */
export function applyScale(d: any, tg: NonNullable<PcExt["toggle"]>, scale: "linear" | "log"): any {
  const out: any = { ...d };
  for (const name of tg.axes) if (isObj(d[name])) out[name] = { ...d[name], scale };
  return out;
}

const UNIT_MS: Record<string, number> = { minute: MIN, hour: HOUR, day: DAY, week: 7 * DAY, month: 30 * DAY, quarter: 91 * DAY, year: 365 * DAY };
export const MAX_TICKS = 200;
/** the ticks of a time axis with its own unit and step: whole units of the zone, `every` of them apart (hours align to the day, months and years to the year) */
export function ticksEvery(min: number, max: number, unit: string, every: number, tz = "UTC", pay = true): number[] {
  const u = unit as TimeUnit, out: number[] = [];
  // charged before any tick is made, for the most this call can make: the ticks the range holds, and never more than a chart carries
  if (!Number.isFinite(min) || !Number.isFinite(max)) return out;
  const room = Math.max(0, Math.min(MAX_TICKS, Math.ceil((max - min) / (UNIT_MS[u] * every)) + 2));
  if (pay) charge(room + 8, room);
  // minutes are seeded from the exact start instant (the start of its real minute), not from a wall clock time that a
  // repeated hour could read an hour early
  // (a zone's own offset may have seconds, as Europe/Paris did before 1911, so the wall second is taken off too)
  let t = u === "minute" ? min - (() => { const w = partsOf(min, tz); return w.s * 1000 + w.ms; })() : startOf(min, u, tz);
  const p = partsOf(t, tz);
  if (every > 1) {
    if (u === "hour") t = wallToMs(p.y, p.mo, p.d, Math.floor(p.h / every) * every, 0, 0, 0, tz);
    else if (u === "minute") t -= (p.mi - Math.floor(p.mi / every) * every) * MIN;
    else if (u === "month") t = wallToMs(p.y, Math.floor((p.mo - 1) / every) * every + 1, 1, 0, 0, 0, 0, tz);
    else if (u === "year") t = wallToMs(Math.floor(p.y / every) * every, 1, 1, 0, 0, 0, 0, tz);
  }
  if (u === "hour" || u === "minute") {
    // hours and minutes step on the zone's wall clock, so a clock change does not move 08:00 to 09:00
    const q = partsOf(t, tz);
    for (let k = 0; k < room; k++) {
      // minutes are real minutes (a clock change neither skips nor repeats one); hours step on the zone's wall clock
      const x = u === "hour" ? wallToMs(q.y, q.mo, q.d, q.h + k * every, 0, 0, 0, tz) : t + k * every * MIN;
      if (x > max) break;
      if (x >= min && (!out.length || x > out[out.length - 1])) out.push(x);
    }
  } else {
    if (t < min) t = add(t, every, u, tz);
    for (let k = 0; t <= max && k < room; k++) { out.push(t); t = add(t, every, u, tz); }
  }
  return out;
}
/** a time axis with its own unit that would carry more ticks than a chart can label */
export function tickCountError(lo: number, hi: number, t: NonNullable<PcExt["time"]>): string | null {
  if (!t.unit || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const a = t.min ?? lo, b = t.max ?? hi;
  const n = Math.ceil((b - a) / (UNIT_MS[t.unit] * (t.every ?? 1))) + 1;
  return n > MAX_TICKS ? `x: unit ${t.unit}${t.every ? ` every ${t.every}` : ""} would put about ${n} ticks on this axis (at most ${MAX_TICKS}); use a bigger unit or a bigger every` : null;
}

export interface LabelBox { i: number; text: string; x: number; x2: number; y: number; y2: number }
export interface LabelPlace { i: number; side: "left" | "right" | "mid"; top: number }
const LABEL_H = 24;
/** where each goal label goes: above its line, at the right end; when that would sit on another label, the left end, then below the line.
 *  Boxes are estimated from the text (6.6 px a character and the padding): the browser has not drawn them yet. Pure; linear in the labels. */
export function placeLabels(items: LabelBox[], width: number, avoid: number[] = []): LabelPlace[] {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const out: LabelPlace[] = [];
  const onData = (a: { x0: number; x1: number; y0: number; y1: number }) => { for (let k = 0; k + 1 < avoid.length; k += 2) if (avoid[k] > a.x0 - 3 && avoid[k] < a.x1 + 3 && avoid[k + 1] > a.y0 - 3 && avoid[k + 1] < a.y1 + 3) return true; return false; };
  const hit = (a: { x0: number; x1: number; y0: number; y1: number }) => placed.some((b) => a.x0 < b.x1 + 2 && b.x0 < a.x1 + 2 && a.y0 < b.y1 + 2 && b.y0 < a.y1 + 2) || onData(a);
  for (const it of [...items].sort((a, b) => a.y2 - b.y2)) {
    const w = Math.min(width - 8, it.text.length * 6.6 + 22);
    const up = Math.max(0, it.y2 - LABEL_H - 2);
    const cands: { side: "left" | "right" | "mid"; top: number }[] = [
      { side: "right", top: up }, { side: "left", top: up }, { side: "mid", top: up },
      { side: "right", top: it.y + 3 }, { side: "left", top: it.y + 3 }, { side: "mid", top: it.y + 3 },
      { side: "right", top: it.y2 + 3 }, { side: "left", top: it.y2 + 3 },
    ];
    const at = (c: { side: string }) => (c.side === "right" ? Math.max(0, it.x2 - w - 4) : c.side === "left" ? Math.max(0, it.x + 4) : Math.max(0, (it.x + it.x2) / 2 - w / 2));
    let pick = cands[0];
    for (const c of cands) { const x0 = at(c); if (!hit({ x0, x1: x0 + w, y0: c.top, y1: c.top + LABEL_H })) { pick = c; break; } }
    const x0 = at(pick);
    placed.push({ x0, x1: x0 + w, y0: pick.top, y1: pick.top + LABEL_H });
    out.push({ i: it.i, side: pick.side, top: pick.top });
  }
  return out;
}

/** a goal or threshold at 0 or below on an axis that is (or can become) log has no place to be drawn */
export function pcAnnLogError(anns: { kind: string; y?: number; y2?: number; axis: "y" | "y2"; label: string }[], base: any, pc?: PcExt): string | null {
  for (const a of anns) {
    if (a.kind !== "threshold") continue;
    const ax = base?.[a.axis];
    const switchable = !!pc?.toggle?.axes.includes(a.axis);
    const lo = Math.min(a.y as number, a.y2 ?? (a.y as number));
    if (((isObj(ax) && ax.scale === "log") || switchable) && lo <= 0) return `annotation "${a.label}": ${lo} cannot be drawn on a log axis, which has no 0 or below${switchable ? " (the log and linear switch can turn this axis to log)" : ""}; use a value above 0`;
  }
  return null;
}

/** white space runs made one space, the ends trimmed (a scan; no pattern over the author's text) */
function collapse(s: string): string {
  let out = "", gap = false;
  for (const c of s) { if (c === " " || c === "\t" || c === "\n" || c === "\r") gap = out.length > 0; else { if (gap) out += " "; gap = false; out += c; } }
  return out;
}
const isCurrency = (s: unknown): s is string => { if (typeof s !== "string" || s.length !== 3) return false; for (const c of s) if (c < "A" || c > "Z") return false; return true; };
/** a formula as the reader reads it: names become labels, * and / become × and ÷ (a hand-written scan, linear) */
export function formulaText(src: string, label: (id: string) => string | undefined, readable = true): string {
  let out = "", i = 0;
  const n = src.length;
  const idStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  const digit = (c: string) => c >= "0" && c <= "9";
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { const j = src.indexOf(c, i + 1); const e = j < 0 ? n : j + 1; out += src.slice(i, e); i = e; continue; }
    if (idStart(c)) {
      let j = i + 1;
      while (j < n && (idStart(src[j]) || digit(src[j]))) j++;
      const id = src.slice(i, j);
      let k = j; while (k < n && src[k] === " ") k++;
      out += src[k] === "(" ? id : (label(id) ?? id);
      i = j; continue;
    }
    if (digit(c) || c === ".") {
      let j = i; while (j < n && (digit(src[j]) || src[j] === ".")) j++;
      if ((src[j] === "e" || src[j] === "E") && (digit(src[j + 1] ?? "") || ((src[j + 1] === "+" || src[j + 1] === "-") && digit(src[j + 2] ?? "")))) { j += 2; while (j < n && digit(src[j])) j++; }
      out += src.slice(i, j); i = j; continue;
    }
    out += readable && c === "*" ? "×" : readable && c === "/" ? "÷" : c;
    i++;
  }
  return collapse(out);
}

const rawControl = (d: any, c: ChartControl): any => (Array.isArray(d?.controls) ? d.controls.find((x: any) => isObj(x) && String(x[c.kind]) === c.name) : undefined);

/** what pass 11's chart helper does not know: read the page-block words, check them, and take them out of `base`
 *  (the plain chart the evaluator sees). `ext.pc` gets the facts the renderer needs. */
export function pcPrepare(d: any, base: any, ext: { tz: string; time: boolean; pc?: PcExt }, errors: string[], warnings: string[]): void {
  const pc = emptyPc();
  ext.pc = pc;
  if (!isObj(d)) return;
  const heat = d.kind === "heatmap";
  let m: ReturnType<typeof chartMeta> | null = null;
  try { m = chartMeta(heat ? { ...d, kind: "bar" } : d); } catch { m = null; }
  const series: any[] = Array.isArray(d.series) ? d.series : [];

  // ---- series: line style and marker
  const typeFor = (s: any) => typeOf(String(s?.kind ?? d.kind));
  series.forEach((s, i) => {
    if (!isObj(s) || (s.line === undefined && s.marker === undefined)) return;
    const nm = String(s.name ?? s.label ?? `#${i + 1}`);
    const st: PcStyle = {};
    const kind = String(d.kind);
    const candles = kind === "candlestick" && s.kind !== "line";
    const drawsLine = !heat && !candles && !(m?.round) && kind !== "bubble" && kind !== "scatter" && (kind === "radar" || (kind === "candlestick" ? s.kind === "line" : typeFor(s) === "line"));
    const drawsPoints = !heat && !candles && !(m?.round) && kind !== "bubble" && (kind === "scatter" || kind === "radar" || (kind === "candlestick" ? s.kind === "line" : typeFor(s) === "line"));
    if (s.line !== undefined) {
      if (!LINE_STYLES.includes(String(s.line))) errors.push(`series "${nm}": line must be ${LINE_STYLES.join(", ")} (got ${JSON.stringify(s.line)})`);
      else if (!drawsLine) errors.push(heat ? `a heatmap has no lines; remove line from series "${nm}"` : candles ? `series "${nm}": candles have no line style; put line on a line series on top of them (kind: line)` : kind === "scatter" ? `series "${nm}": a scatter chart draws points, not lines; use marker, or kind: line` : m?.round || kind === "bubble" ? `series "${nm}": a ${kind} chart has no lines; remove line` : `series "${nm}": line works on a line or area series (this one is ${typeFor(s)}); remove it, or give the series kind: line`);
      else st.line = String(s.line);
    }
    if (s.marker !== undefined) {
      if (!MARKERS.includes(String(s.marker))) errors.push(`series "${nm}": marker must be ${MARKERS.join(", ")} (got ${JSON.stringify(s.marker)})`);
      else if (!drawsPoints) errors.push(heat ? `a heatmap has no markers; remove marker from series "${nm}"` : candles ? `series "${nm}": candles have no point markers; put marker on a line series on top of them (kind: line)` : kind === "bubble" ? `series "${nm}": a bubble chart draws circles sized by the data; remove marker` : m?.round ? `series "${nm}": a ${kind} chart has no points; remove marker` : `series "${nm}": marker works on a line, area, scatter or radar series (this one is ${typeFor(s)}); remove it, or give the series kind: line`);
      else st.marker = String(s.marker);
    }
    if (st.line || st.marker) pc.styles[nm] = st;
  });

  // ---- axes: the scale toggle, and a time axis' own bounds
  const toggles: ("x" | "y" | "y2")[] = [], starts: string[] = [];
  for (const name of ["x", "y", "y2"] as const) {
    const a = d[name];
    if (!isObj(a)) continue;
    const b = isObj(base[name]) ? base[name] : null;
    if (a.toggle !== undefined) {
      if (a.toggle !== true && a.toggle !== false) errors.push(`${name}.toggle must be true or false (got ${JSON.stringify(a.toggle)})`);
      else if (a.toggle) {
        const ok = !heat && m && !m.round && !m.radial && (name === "x" ? m.points : name === "y2" ? m.category || m.candle : m.category || m.points || m.candle);
        if (name === "x" && ext.time) errors.push(`x.toggle does not apply to a time axis (a time axis has no log scale); remove it`);
        else if (!ok) errors.push(`${name}.toggle does not apply here: a log and linear switch works on a value axis (y, y2, or a scatter chart's x), and not on ${heat ? "a heatmap" : m?.round ? `a ${d.kind} chart` : m?.radial ? `a ${d.kind} chart` : `the ${name} axis of this chart`}; remove it`);
        else { toggles.push(name); starts.push(a.scale === "log" ? "log" : "linear"); }
      }
      if (b) delete b.toggle;
    }
    if (name === "x") {
      const has = ["min", "max", "unit", "every"].filter((k) => a[k] !== undefined);
      if (has.length && ext.time) {
        const t: NonNullable<PcExt["time"]> = {};
        for (const k of ["min", "max"] as const) if (a[k] !== undefined) {
          const v = parseTime(a[k] instanceof Date ? a[k].toISOString() : a[k], ext.tz);
          if (v === null) errors.push(`x.${k} ${JSON.stringify(a[k])} is not an ISO time; write 2026-11-20 or 2026-11-20T10:00`);
          else t[k] = v;
        }
        if (t.min !== undefined && t.max !== undefined && t.min >= t.max) errors.push(`x: min must be before max`);
        if (a.unit !== undefined) { if (!TIME_UNITS.includes(String(a.unit))) errors.push(`x.unit must be ${TIME_UNITS.join(", ")} (got ${JSON.stringify(a.unit)})`); else t.unit = String(a.unit); }
        if (a.every !== undefined) {
          if (!Number.isInteger(a.every) || a.every < 1 || a.every > PC_CAPS.every) errors.push(`x.every must be a whole number from 1 to ${PC_CAPS.every} (every 6 hours is unit: hour, every: 6)`);
          else if (a.unit === undefined) errors.push(`x.every counts ticks of x.unit; add unit: ${TIME_UNITS.join(" | ")}`);
          else t.every = a.every;
        }
        pc.time = t;
      } else if (has.some((k) => k !== "min" && k !== "max")) { const k = has.find((q) => q !== "min" && q !== "max")!; errors.push(`x.${k} works with a time axis (x: { scale: time }); remove it`); }
      // on a number axis min and max are the plain chart's own, checked by the evaluator's rules
      else if (a.scale === "time" && !ext.time) { /* reported by chart11 */ }
      if (b) for (const k of ["unit", "every"]) delete b[k];
      if (b && ext.time) { delete b.min; delete b.max; }
    }
  }
  if (toggles.length) {
    if (new Set(starts).size > 1) errors.push(`axes with toggle: true must start on the same scale (${toggles.join(", ")} start on ${starts.join(", ")}); give them the same scale`);
    else pc.toggle = { axes: toggles, start: starts[0] as "linear" | "log" };
  }

  // ---- the calculator layout
  const calcWords = d.layout !== undefined || d.calc !== undefined;
  if (calcWords) calcPrepare(d, base, pc, errors, series);
}

function calcPrepare(d: any, base: any, pc: PcExt, errors: string[], series: any[]): void {
  delete base.layout; delete base.calc; delete base.inputs; delete base.formulas;
  if (d.layout !== undefined && d.layout !== "calculator") { errors.push(`layout must be calculator (got ${JSON.stringify(d.layout)}); a chart has no other layout yet`); return; }
  if (d.layout === undefined) { errors.push(`calc goes with layout: calculator; add layout: calculator, or remove calc`); return; }
  const hasChart = series.length > 0;
  if (d.inputs !== undefined && !INPUT_LOOKS.includes(String(d.inputs))) errors.push(`inputs must be ${INPUT_LOOKS.join(" or ")} (boxes: a slider and a number box; label: the value in the label, a slider only); got ${JSON.stringify(d.inputs)}`);
  if (d.formulas !== undefined && !FORMULA_LOOKS.includes(String(d.formulas))) errors.push(`formulas must be ${FORMULA_LOOKS.join(" or ")} (table: label, value and formula; worked: one text line each, the inputs' values written into the formula); got ${JSON.stringify(d.formulas)}`);
  if (d.steps !== undefined) errors.push(`a calculator has no steps (the reader's inputs change it); remove steps`);
  if (!hasChart) {
    for (const k of ["kind", "x", "y", "y2", "annotations", "stacked", "horizontal", "tz"]) if (d[k] !== undefined) errors.push(`a calculator without a chart takes no ${k}; remove it, or add series to draw a chart under the result`);
    base.kind = "bar"; base.x = ["·"]; base.series = [{ name: "calculator", data: [0] }];
  }
  const { controls } = chartControls(d);
  const inputs = controls.filter((c) => c.kind !== "button");
  if (!inputs.length) errors.push(`a calculator needs inputs: add controls (slider, select or toggle) under controls`);
  if (inputs.length > lim().maxCalcInputs) errors.push(`a calculator has at most ${lim().maxCalcInputs} inputs (this one has ${inputs.length}); keep the ones the reader changes`);
  const names = new Set<string>();
  const ins: CalcInput[] = [];
  for (const c of controls) {
    const raw = rawControl(d, c);
    if (raw?.unit !== undefined && (typeof raw.unit !== "string" || !raw.unit.trim() || raw.unit.length > PC_CAPS.unit)) errors.push(`control ${c.name}: unit must be a short text (at most ${PC_CAPS.unit} characters), such as GB or "USD per GB"`);
    if (raw?.unit !== undefined && c.kind !== "slider" && c.kind !== "select") errors.push(`control ${c.name}: unit goes with a slider or a select; remove it`);
    if (c.kind === "slider" && num(c.value) && num(c.min) && num(c.step) && (c.step as number) > 0) {
      const k = ((c.value as number) - c.min!) / (c.step as number);
      if (Math.abs(k - Math.round(k)) > 1e-6) errors.push(`control ${c.name}: the start value ${c.value} is not on the slider's steps (min ${c.min} plus whole steps of ${c.step}); use a value on them, or a smaller step`);
    }
    if (c.kind !== "button") { names.add(c.name); ins.push({ name: c.name, label: String(c.label ?? c.name), unit: typeof raw?.unit === "string" ? raw.unit : undefined, kind: c.kind }); }
  }
  charge(controls.length + 1);
  const lets = isObj(d.let) ? Object.keys(d.let).filter((k) => !k.includes("(")) : [];
  if (!lets.length) errors.push(`a calculator needs formulas: write them under let (name: expression)`);
  if (!Array.isArray(d.calc) || !d.calc.length) { errors.push(`a calculator needs calc: a list of rows to show (let: the name, label: the words, one row with result: true)`); return; }
  if (d.calc.length > lim().maxCalcRows) errors.push(`a calculator shows at most ${lim().maxCalcRows} rows (this one has ${d.calc.length}); keep the ones that matter`);
  if (d.calc.length > lim().maxCalcRows) return;
  charge(d.calc.length * 6 + 1, d.calc.length);
  const labelOf = new Map<string, string>();
  for (const c of ins) labelOf.set(c.name, c.label);
  const rows: CalcRow[] = [];
  d.calc.forEach((r: any, i: number) => {
    if (!isObj(r)) { errors.push(`calc row ${i + 1} must be an object with let (the formula's name) and label`); return; }
    for (const k of Object.keys(r)) if (!CALC_ROW_KEYS.includes(k)) errors.push(`calc row ${i + 1}: unknown key "${k}" (keys: ${CALC_ROW_KEYS.join(", ")})`);
    if (typeof r.let !== "string" || !lets.includes(r.let)) { errors.push(`calc row ${i + 1}: let must name a formula under let (${lets.slice(0, 8).join(", ") || "none yet"}; got ${JSON.stringify(r.let)})`); return; }
    if (rows.some((x) => x.name === r.let)) { errors.push(`calc row ${i + 1}: ${r.let} is shown twice; show each formula once`); return; }
    if (r.label !== undefined && (typeof r.label !== "string" || r.label.length > PC_CAPS.label)) errors.push(`calc row ${i + 1}: label must be text of at most ${PC_CAPS.label} characters`);
    if (r.note !== undefined && (typeof r.note !== "string" || r.note.length > PC_CAPS.note)) errors.push(`calc row ${i + 1}: note must be text of at most ${PC_CAPS.note} characters (it replaces the formula the reader sees)`);
    if (r.unit !== undefined && (typeof r.unit !== "string" || !r.unit.trim() || r.unit.length > PC_CAPS.unit)) errors.push(`calc row ${i + 1}: unit must be a short text (at most ${PC_CAPS.unit} characters)`);
    if (r.result !== undefined && typeof r.result !== "boolean") errors.push(`calc row ${i + 1}: result must be true or false`);
    const format = r.format === undefined ? "number" : String(r.format);
    if (!FORMATS.includes(format)) errors.push(`calc row ${i + 1}: format must be one of ${FORMATS.join(", ")} (got ${JSON.stringify(r.format)})`);
    if (r.currency !== undefined) { if (format !== "money") errors.push(`calc row ${i + 1}: currency goes with format: money`); else if (!isCurrency(r.currency)) errors.push(`calc row ${i + 1}: currency must be an ISO 4217 code such as EUR`); }
    if (r.unit !== undefined && r.format !== undefined && format !== "number") errors.push(`calc row ${i + 1}: a row has a format or a unit, not both (the format already names its unit); remove one`);
    // a verdict line (text from a formula, with a colour word) and a units row (counts per kind, drawn as tiles)
    let verdict = false, units: CalcRow["units"];
    if (r.verdict !== undefined && typeof r.verdict !== "boolean") errors.push(`calc row ${i + 1}: verdict must be true or false`);
    else if (r.verdict === true) {
      verdict = true;
      for (const k of ["result", "units", "format", "unit", "currency"]) if (r[k] !== undefined) errors.push(`calc row ${i + 1}: a verdict row is a line of text from its formula; remove ${k}`);
    }
    if (r.tone !== undefined && !ROW_TONES.includes(String(r.tone))) errors.push(`calc row ${i + 1}: tone must be c1 to c8, acc, good, warn, bad or muted (got ${JSON.stringify(r.tone)})`);
    if (r.tone_from !== undefined) { if (!verdict) errors.push(`calc row ${i + 1}: tone_from goes with verdict: true`); else if (typeof r.tone_from !== "string" || !lets.includes(r.tone_from)) errors.push(`calc row ${i + 1}: tone_from must name a formula under let that gives a colour word (got ${JSON.stringify(r.tone_from)})`); else if (r.tone !== undefined) errors.push(`calc row ${i + 1}: a verdict has tone or tone_from, not both`); }
    if (r.tone !== undefined && !verdict && r.units === undefined) errors.push(`calc row ${i + 1}: tone goes with a verdict row (or a units row's own colours)`);
    if (r.units !== undefined) {
      if (!isObj(r.units) || !Object.keys(r.units).length) errors.push(`calc row ${i + 1}: units is a list of kinds with a colour each, like { kept: good, added: acc, removed: bad }; its formula gives one count per kind, in that order`);
      else if (Object.keys(r.units).length > PC_CAPS.unitKinds) errors.push(`calc row ${i + 1}: units has at most ${PC_CAPS.unitKinds} kinds`);
      else {
        units = Object.entries(r.units).map(([kind, tone]) => ({ kind, tone: String(tone) }));
        for (const u of units) if (!ROW_TONES.includes(u.tone)) errors.push(`calc row ${i + 1}: the units kind "${u.kind}" has the colour ${JSON.stringify(u.tone)}; use c1 to c8, acc, good, warn, bad or muted`);
      }
      for (const k of ["result", "format", "unit", "currency", "verdict"]) if (r[k] !== undefined && r[k] !== false) errors.push(`calc row ${i + 1}: a units row is a counted grid of tiles; remove ${k}`);
    }
    let slots: number | undefined, perRow: number | undefined;
    if (r.slots !== undefined) { if (!r.units) errors.push(`calc row ${i + 1}: slots goes with units (the number of tiles drawn, the unused ones pale)`); else if (!Number.isInteger(r.slots) || r.slots < 1 || r.slots > UNIT_TILES) errors.push(`calc row ${i + 1}: slots must be a whole number from 1 to ${UNIT_TILES}`); else slots = r.slots; }
    if (r.per_row !== undefined) { if (!r.units) errors.push(`calc row ${i + 1}: per_row goes with units`); else if (!Number.isInteger(r.per_row) || r.per_row < 1 || r.per_row > 100) errors.push(`calc row ${i + 1}: per_row must be a whole number from 1 to 100 (tiles in a line)`); else perRow = r.per_row; }
    rows.push({ slots, perRow, src: "", verdict, tone: typeof r.tone === "string" ? r.tone : undefined, toneFrom: typeof r.tone_from === "string" ? r.tone_from : undefined, units, name: r.let, label: typeof r.label === "string" && r.label ? r.label : r.let, format, currency: format === "money" ? (r.currency ?? "USD") : undefined, unit: typeof r.unit === "string" ? r.unit : undefined, note: typeof r.note === "string" ? r.note : "", result: r.result === true, formula: "" });
  });
  for (const r of rows) labelOf.set(r.name, r.label);
  let chars = 0;
  for (const r of rows) {
    const src = String(d.let[r.name]);
    if (src.length > MAX_FORMULA) { errors.push(`calculator formula "${r.name}" is ${src.length} characters; at most ${MAX_FORMULA} (split it into steps under let)`); continue; }
    chars += src.length;
    r.src = src;
    r.formula = r.verdict || r.units ? r.note : r.note || formulaText(src, (id) => labelOf.get(id));
  }
  if (rows.filter((r) => r.verdict).length > PC_CAPS.verdicts) errors.push(`a calculator has at most ${PC_CAPS.verdicts} verdict rows`);
  if (rows.filter((r) => r.units).length > PC_CAPS.unitRows) errors.push(`a calculator has at most ${PC_CAPS.unitRows} units rows`);
  charge(chars + 8, chars);
  const nres = rows.filter((r) => r.result).length;
  if (rows.length && nres !== 1) errors.push(nres === 0 ? `a calculator has one result row: add result: true to the row that answers the question` : `a calculator has one result row (this has ${nres}); keep result: true on one row`);
  pc.calc = { rows, inputs: ins, hasChart, inputLook: String(d.inputs ?? "boxes"), formulaLook: String(d.formulas ?? "table") };
  charge(rows.length * 4 + ins.length * 2, rows.length + ins.length);
}

/** series keys the evaluator does not know are taken out of the plain chart */
export function pcStripSeries(base: any): void {
  if (!isObj(base) || !Array.isArray(base.series)) return;
  if (!base.series.some((s: any) => isObj(s) && (s.line !== undefined || s.marker !== undefined))) return;
  base.series = base.series.map((s: any) => { if (!isObj(s) || (s.line === undefined && s.marker === undefined)) return s; const { line, marker, ...rest } = s; return rest; });
}

/** the control values doccheck evaluates a chart at: the start, every slider's ends, every select option, each toggle flipped, each button */
export function caseValues(controls: ChartControl[], cap = 60): Record<string, Val>[] {
  const cases: Record<string, Val>[] = [{}];
  for (const c of controls) {
    if (c.kind === "slider") cases.push({ [c.name]: c.min as number }, { [c.name]: c.max as number });
    else if (c.kind === "select") for (const o of c.options ?? []) cases.push({ [c.name]: o });
    else if (c.kind === "toggle") cases.push({ [c.name]: !c.value });
    else if (c.kind === "button") cases.push({ ...(c.set as Record<string, Val>) });
    if (cases.length >= cap) break;
  }
  return cases.slice(0, cap);
}

const caseText = (v: Record<string, Val>) => (Object.keys(v).length ? ` with ${JSON.stringify(v)}` : "");
/** checks that need the evaluator: the log and linear views of a toggle, and every calculator row at the inputs' extremes.
 *  `bases` are the plain charts of every step (step 1 first); `d` is the chart as written. Messages name the fix. */
export function pcDeepCheck(d: any, bases: any[], pc: PcExt | undefined): string[] {
  const errors: string[] = [];
  if (!pc || !bases.length) return errors;
  const first = bases[0];
  if (pc.toggle) {
    const other = pc.toggle.start === "log" ? "linear" : "log";
    const word = other === "log" ? "log" : "linear";
    bases.forEach((b, k) => {
      const copy = applyScale(b, pc.toggle!, other);
      for (const e of chartCheck(copy)) { errors.push(`${pc.toggle!.axes.join(", ")}.toggle: the ${word} view cannot be drawn${bases.length > 1 ? ` (step ${k + 1})` : ""}: ${e}; fix it, or remove toggle`); return; }
      const cases = k === 0 ? caseValues(chartControls(copy).controls) : [{}];
      for (const v of cases) {
        const pts = (Array.isArray(copy.series) ? copy.series : []).reduce((n: number, q: any) => n + (isObj(q) && Array.isArray(q.data) ? q.data.length : 0), 0);
        charge(40 + pts, 8 + pts);
        const r = evalChart(copy, v);
        if (r.error) { errors.push(`${pc.toggle!.axes.join(", ")}.toggle: the ${word} view cannot be drawn${bases.length > 1 ? ` (step ${k + 1})` : ""}${caseText(v)}: ${r.error}; fix the data, or remove toggle`); return; }
      }
    });
  }
  if (pc.calc) {
    const { controls } = chartControls(first);
    const cases = caseValues(controls);
    for (const v of cases) {
      charge(60 + pc.calc.rows.length, pc.calc.rows.length);
      const r = evalChart(first, v);
      if (r.error) { errors.push(`calculator${caseText(v)}: ${r.error}`); break; }
      let bad = false;
      for (const row of pc.calc.rows) {
        const x = r.vars[row.name];
        if (row.verdict) {
          if (typeof x !== "string" || !x.trim() || x.length > PC_CAPS.verdict) { errors.push(`calculator verdict "${row.label}"${caseText(v)} is ${typeof x === "string" ? (x.trim() ? "over " + PC_CAPS.verdict + " characters" : "empty") : typeof x}, not a short text; make its formula give a word or a short sentence`); bad = true; break; }
          if (row.toneFrom) { const t = r.vars[row.toneFrom]; if (typeof t !== "string" || !ROW_TONES.includes(t)) { errors.push(`calculator verdict "${row.label}"${caseText(v)}: tone_from ${row.toneFrom} gives ${JSON.stringify(t)}; it must give one of c1 to c8, acc, good, warn, bad, muted`); bad = true; break; } }
          continue;
        }
        if (row.units) {
          const ok = Array.isArray(x) && x.length === row.units.length && x.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
          if (!ok) { errors.push(`calculator units row "${row.label}"${caseText(v)} gives ${JSON.stringify(x)}; it must give a list of ${row.units.length} counts (${row.units.map((u) => u.kind).join(", ")}), each 0 or more`); bad = true; break; }
          if (row.slots !== undefined && (x as number[]).reduce((a, n) => a + Math.round(n), 0) > row.slots) { errors.push(`calculator units row "${row.label}"${caseText(v)} counts ${(x as number[]).reduce((a, n) => a + Math.round(n), 0)} units but has ${row.slots} slots; raise slots or scale the counts`); bad = true; break; }
          if ((x as number[]).reduce((a, n) => a + n, 0) > PC_CAPS.unitTotal) { errors.push(`calculator units row "${row.label}"${caseText(v)} counts over ${PC_CAPS.unitTotal} units; scale the counts down`); bad = true; break; }
          continue;
        }
        const ok = typeof x === "number" ? Number.isFinite(x) : row.format === "number" && !row.unit && (typeof x === "string" || typeof x === "boolean");
        if (!ok) { errors.push(`calculator row "${row.label}"${caseText(v)} is ${typeof x === "number" ? String(x) : Array.isArray(x) ? "a list" : `${typeof x} text`}, not a number; check the formula for a division by zero or a name that can be 0, or narrow the input's range`); bad = true; break; }
      }
      if (bad) break;
    }
  }
  return errors;
}

/** the calculator as plain text for the LLM view: the inputs, each formula with its value at the start values, the result */
export function calcLines(title: string | undefined, pc: NonNullable<PcExt["calc"]>, d: any, vars: Record<string, Val>, fmt: (v: any, format: string, currency?: string) => string): string[] {
  const controls = chartControls(d).controls;
  const val = (row: CalcRow): string => {
    const x = vars[row.name];
    if (typeof x !== "number") return String(x);
    return fmt(x, row.format, row.currency) + (row.unit ? ` ${row.unit}` : "");
  };
  const out: string[] = [`Calculator${title ? `: ${title}` : ""}`, "", "Inputs:", "| Input | Starts at | Can be |", "| --- | --- | --- |"];
  for (const c of pc.inputs) {
    const k = controls.find((x) => x.name === c.name);
    const u = c.unit ? ` ${c.unit}` : "";
    const can = k?.kind === "slider" ? `${k.min} to ${k.max}${u}` : k?.kind === "select" ? (k.options ?? []).join(", ") : "on or off";
    const start = k?.kind === "toggle" ? (k.value ? "on" : "off") : `${String(k?.value)}${k?.kind === "slider" ? u : ""}`;
    out.push(`| ${c.label} | ${start} | ${can} |`);
  }
  out.push("", "Formulas, at the start values:");
  for (const r of pc.rows) {
    if (r.result) continue;
    const x = vars[r.name];
    if (r.verdict) out.push(`- ${r.label}: ${String(x)}`);
    else if (r.units && Array.isArray(x)) out.push(`- ${r.label}: ${r.units.map((u, i) => `${u.kind} ${String(x[i])}`).join(", ")}${r.slots ? ` (of ${r.slots} slots)` : ""}`);
    else out.push(`- ${r.label} = ${r.formula} = ${val(r)}`);
  }
  const res = pc.rows.find((r) => r.result);
  if (res) out.push("", `Result: ${res.label} = ${res.formula} = ${val(res)}`);
  if (pc.hasChart) out.push("", "Under the result a chart is drawn from the same inputs.");
  return out;
}
