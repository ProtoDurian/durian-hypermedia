// chart11: what pass 11 adds to the chart part (DESIGN 4.1 to 4.5): steps, a time axis, annotations, value formats, heatmaps.
// It sits beside tools/chart.ts (whose evaluator is not touched in pass 11): `prepareChart` turns a chart written with the new
// words into a plain chart that the evaluator and its checks already understand (the base), plus the new facts (ext).
// Pure: the browser draws with the same code doccheck checks with.
import { chartCheck, evalChart, chartMeta, CHART_KEYS, CHART_KINDS, CHART_TONES, type ChartSeries } from "./chart";
import { chartTable } from "./chart-llm";
import { BudgetError } from "./budget";
import { charge, lim, withChartBudget } from "./chart-work";
import { parseTime, validZone, fmtTime, isoOf, isDateOnly } from "./chart-time";
import type { Val } from "./expr";
import { pcPrepare, pcStripSeries, pcDeepCheck, calcLines, tickCountError, pcAnnLogError, PC_KEYS, type PcExt } from "./pagecharts"; // p11 pagecharts

export const FORMATS = ["number", "percent", "money", "duration", "duration-ms", "bytes"];
export const ANN_TONES = [...CHART_TONES, "acc", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
export const CHART11_KEYS = [...CHART_KEYS, "tz", "steps", "annotations", ...PC_KEYS];
export const CHART11_KINDS = [...CHART_KINDS, "heatmap"];
export const ANN_KINDS = ["bar", "line", "area", "scatter", "candlestick"]; // where annotations are drawn
export const TIME_KINDS = ["bar", "line", "area", "candlestick"];
export const ANN_KEYS = ["at", "from", "to", "y", "goal", "axis", "label", "text", "tone", "fill"];
export const STEP_KEYS = ["title", "series", "annotations", "y"];
export const STEP_SERIES_KEYS = ["name", "data", "add", "kind", "tone", "axis", "line", "marker"];
export const HEAT_SERIES_KEYS = ["name", "data", "tone", "diverge"];
export const AXIS11_KEYS = ["format", "currency"];
/** the caps of the new chart words: the page's own (LIMITS, UNTRUSTED_LIMITS or the host's), read when the work is done */
export const caps = () => { const l = lim(); return { points: l.maxChartPoints, annotations: l.maxChartAnnotations, steps: l.maxChartSteps, heatCells: l.maxChartHeatCells, label: 40 }; };
export const isCurrency = (s: unknown): s is string => { if (typeof s !== "string" || s.length !== 3) return false; for (const c of s) if (c < "A" || c > "Z") return false; return true; };

const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);
const num = (v: any) => typeof v === "number" && Number.isFinite(v);

export interface Ann {
  kind: "event" | "range" | "threshold";
  label: string; text: string; tone: string;
  /** event: at; range: from and to (a time in ms, or the index of a category, or a number on a scatter's x) */
  from?: number; to?: number;
  /** threshold: y (a line) or [y, y2] (a band) */
  y?: number; y2?: number; axis: "y" | "y2"; fill?: "above" | "below";
  /** the time or place in words, in the chart's zone */
  when: string;
  /** a goal line or band (p11 pagecharts): a threshold with the goal word, drawn between from and to when it has them */
  goal?: boolean;
}
export interface Ext {
  tz: string; time: boolean; timePoints: boolean; timesMs: number[]; dateOnly: boolean;
  formats: { x?: { format: string; currency?: string }; y?: { format: string; currency?: string }; y2?: { format: string; currency?: string } };
  anns: Ann[];
  heat?: { diverge?: number; tone?: string };
  step: number; steps: number; stepTitle?: string;
  /** p11 pagecharts: series styles, the scale toggle, the time axis bounds, the calculator */
  pc?: PcExt;
}
export interface Prepared { base: any; ext: Ext; errors: string[]; warnings: string[] }

const xValuesOf = (d: any): any[] | undefined => (Array.isArray(d?.x) ? d.x : isObj(d?.x) && Array.isArray(d.x.values) ? d.x.values : undefined);

/** the chart a step shows: the chart as written, then each step's changes on top of the one before */
export function specAt(d: any, k: number): { spec: any; errors: string[] } {
  const errors: string[] = [];
  const steps: any[] = Array.isArray(d?.steps) ? d.steps : [];
  let spec: any = { ...d }; delete spec.steps;
  spec.series = (d.series ?? []).map((s: any) => (isObj(s) ? { ...s } : s));
  for (let i = 0; i <= k && i < steps.length; i++) {
    const st = steps[i];
    if (!isObj(st)) { errors.push(`step ${i + 1} must be an object with a title (and series, annotations or y when it changes them)`); continue; }
    for (const key of Object.keys(st)) if (!STEP_KEYS.includes(key)) errors.push(`step ${i + 1}: unknown key "${key}" (keys: ${STEP_KEYS.join(", ")})`);
    if (st.title !== undefined && typeof st.title !== "string") errors.push(`step ${i + 1}: title must be text`);
    if (st.series !== undefined) {
      if (!Array.isArray(st.series)) errors.push(`step ${i + 1}: series must be a list`);
      else for (const ss of st.series) {
        if (!isObj(ss) || typeof ss.name !== "string") { errors.push(`step ${i + 1}: a series needs a name`); continue; }
        for (const key of Object.keys(ss)) if (!STEP_SERIES_KEYS.includes(key)) errors.push(`step ${i + 1}: series "${ss.name}": unknown key "${key}" (keys: ${STEP_SERIES_KEYS.join(", ")})`);
        const at = spec.series.findIndex((s: any) => isObj(s) && String(s.name ?? s.label) === ss.name);
        if (ss.add === true) {
          if (at >= 0) errors.push(`step ${i + 1}: series "${ss.name}" already exists; remove add: true to change its data`);
          else { const { add, ...rest } = ss; spec.series.push(rest); }
        } else if (at < 0) errors.push(`step ${i + 1}: series "${ss.name}" is not in the chart; add add: true to bring in a new series (series: ${spec.series.map((s: any) => s?.name).filter(Boolean).join(", ") || "none"})`);
        else { const { add, name, ...rest } = ss; spec.series[at] = { ...spec.series[at], ...rest }; }
      }
    }
    if (st.annotations !== undefined) spec.annotations = st.annotations;
    if (st.y !== undefined) spec.y = isObj(st.y) ? { ...(isObj(spec.y) ? spec.y : {}), ...st.y } : st.y;
  }
  return { spec, errors };
}

const sameZone = (tz: any) => (tz === undefined ? "UTC" : String(tz));
const isoLike = (v: any) => parseTime(v, "UTC") !== null;

/** one chart (no steps) written with the new words, as a plain chart plus the new facts */
export function prepareOne(d: any, step = 0, steps = 0, title?: string): Prepared {
  const errors: string[] = [], warnings: string[] = [];
  const ext: Ext = { tz: "UTC", time: false, timePoints: false, timesMs: [], dateOnly: false, formats: {}, anns: [], step, steps, stepTitle: title };
  const out = (base: any): Prepared => { pcStripSeries(base); return { base, ext, errors, warnings }; };
  if (!isObj(d)) return out(d);
  const base: any = { ...d };
  delete base.tz; delete base.annotations; delete base.steps;
  const heat = d.kind === "heatmap";
  // ---- zone
  if (d.tz !== undefined) { if (typeof d.tz !== "string" || !validZone(d.tz)) errors.push(`tz must be an IANA zone name such as America/Los_Angeles (got ${JSON.stringify(d.tz)})`); else ext.tz = d.tz; }
  const tz = ext.tz;
  // ---- axes: format and currency, and the time scale
  const axes: [string, any][] = [["x", d.x], ["y", d.y], ["y2", d.y2]];
  const m0 = (() => { try { return chartMeta(heat ? { ...d, kind: "bar" } : d); } catch { return null; } })();
  for (const [name, a] of axes) {
    if (!isObj(a)) continue;
    const b: any = { ...a };
    if (a.format !== undefined || a.currency !== undefined) {
      const f = a.format === undefined ? "number" : String(a.format);
      if (!FORMATS.includes(f)) errors.push(`${name}.format must be one of ${FORMATS.join(", ")} (got ${JSON.stringify(a.format)})`);
      else if (name === "x" && !(m0 && m0.points)) errors.push(`x.format works on a scatter or bubble chart's x axis (this chart is ${d.kind}); its x values are words or times: remove it`);
      else if (heat) errors.push(`${name}.format does not apply to a heatmap (its cells show the numbers as they are); remove it`);
      else {
        if (a.currency !== undefined) {
          if (f !== "money") errors.push(`${name}.currency goes with format: money; add it or remove currency`);
          else if (!isCurrency(a.currency)) errors.push(`${name}.currency must be an ISO 4217 code such as EUR (got ${JSON.stringify(a.currency)})`);
          else { try { new Intl.NumberFormat("en", { style: "currency", currency: a.currency }); } catch { errors.push(`${name}.currency "${a.currency}" is not a currency code`); } }
        }
        (ext.formats as any)[name] = { format: f, currency: f === "money" ? (a.currency ?? "USD") : undefined };
      }
      delete b.format; delete b.currency;
    }
    if (name === "x" && a.scale === "time") {
      ext.time = true;
      if (!TIME_KINDS.includes(d.kind)) errors.push(`x.scale: time works with kind bar, line, area or candlestick (this chart is ${d.kind}); a scatter chart's x is a number: use scale linear or log`);
      if (d.horizontal === true) errors.push(`a time axis runs along the bottom; remove horizontal`);
      delete b.scale;
    }
    base[name] = b;
  }
  pcPrepare(d, base, ext, errors, warnings); // p11 pagecharts: series styles, scale toggle, time bounds, calculator
  // ---- time axis: the values, or each series' points
  if (ext.time && !errors.length) {
    const xs = xValuesOf(d);
    const series: any[] = Array.isArray(d.series) ? d.series : [];
    const pointForm = (s: any) => isObj(s) && Array.isArray(s.data) && s.data.length > 0 && s.data.every((p: any) => (Array.isArray(p) && p.length === 2 && (typeof p[0] === "string" || p[0] instanceof Date)) || (isObj(p) && "t" in p));
    const forms = series.filter(isObj).map(pointForm);
    if (xs && forms.some(Boolean)) errors.push(`a time axis takes its times from x.values, or from each series' points [[time, value], ...], not both; remove one`);
    else if (!xs && !forms.length) errors.push(`a time axis needs its times: give x.values as ISO times, or write each series' data as points [[time, value], ...]`);
    else if (!xs && forms.some((f) => !f)) errors.push(`with a time axis and no x.values, every series' data is points [[time, value], ...]`);
    else if (typeof d.x?.values === "string") errors.push(`a time axis needs x.values as a list of ISO times, not a formula`);
    else if (xs) {
      charge(xs.length + 1, xs.length);
      const ms: number[] = [];
      for (let i = 0; i < xs.length; i++) {
        const t = parseTime(xs[i], tz);
        if (t === null) { errors.push(`x.values[${i + 1}] ${JSON.stringify(xs[i])} is not an ISO time; write 2026-11-20 or 2026-11-20T10:00 (add Z or +01:00 for an exact moment)`); break; }
        if (i && t <= ms[i - 1]) { errors.push(`x.values: ${JSON.stringify(xs[i])} (value ${i + 1}) is not after the one before it; times go forward`); break; }
        ms.push(t);
      }
      ext.timesMs = ms; ext.dateOnly = xs.every((v) => typeof v === "string" && isDateOnly(v));
      if (xs.length > caps().points) errors.push(`a time axis has at most ${caps().points} times (this one has ${xs.length}); aggregate the data into fewer points`);
    } else {
      ext.timePoints = true;
      const all = new Map<number, true>();
      let bad = false, n = 0;
      charge(series.length + 1);
      series.forEach((s) => {
        if (!isObj(s) || bad) return;
        (s.data as any[]).forEach((p, i) => {
          if (bad) return;
          const t = parseTime(Array.isArray(p) ? p[0] : p?.t, tz);
          n++;
          if (t === null) { bad = true; errors.push(`series "${s.name ?? "?"}" point ${i + 1}: ${JSON.stringify(Array.isArray(p) ? p[0] : p?.t)} is not an ISO time; write 2026-11-20 or 2026-11-20T10:00`); return; }
          all.set(t, true);
        });
        if (!bad && s.data.length > caps().points) { bad = true; errors.push(`series "${s.name}" has ${s.data.length} points; at most ${caps().points} (aggregate the data into fewer points)`); }
      });
      if (!bad) {
        const times = [...all.keys()].sort((a, b) => a - b);
        const dateOnly = series.every((s) => isObj(s) && (s.data as any[]).every((p) => typeof (Array.isArray(p) ? p[0] : p?.t) === "string" && isDateOnly(Array.isArray(p) ? p[0] : p.t)));
        ext.timesMs = times; ext.dateOnly = dateOnly;
        const labels = times.map((t) => isoOf(t, tz, dateOnly));
        const at = new Map(times.map((t, i) => [t, i]));
        base.x = { ...(isObj(base.x) ? base.x : {}), values: labels };
        base.series = series.map((s) => {
          if (!isObj(s)) return s;
          const data: (number | null)[] = labels.map(() => null);
          (s.data as any[]).forEach((p) => { const v = Array.isArray(p) ? p[1] : p?.v; data[at.get(parseTime(Array.isArray(p) ? p[0] : p?.t, tz)!)!] = v; });
          return { ...s, data };
        });
        charge(n + times.length, n + times.length * series.length);
      }
    }
  } else if (!ext.time && d.tz !== undefined && !errors.length) warnings.push(`tz sets the zone of a time axis; this chart has none (x: { scale: time }), so it does nothing`);
  if (ext.time && ext.timesMs.length) charge(ext.timesMs.length, ext.timesMs.length);
  if (ext.time && ext.pc?.time && ext.timesMs.length && !errors.length) { const e = tickCountError(ext.timesMs[0], ext.timesMs[ext.timesMs.length - 1], ext.pc.time); if (e) errors.push(e); } // p11 pagecharts
  // ---- heatmap: rows become series of a plain bar chart so that the evaluator checks the numbers and the lengths
  if (heat) {
    for (const k of ["stacked", "horizontal", "controls"] as const) if (d[k] !== undefined) errors.push(`a heatmap takes no ${k}; remove it`);
    ext.heat = {};
    if (d.annotations !== undefined) errors.push(`a heatmap has no annotations; remove them`);
    if (d.y2 !== undefined) errors.push(`a heatmap has no second axis; remove y2`);
    const xs = xValuesOf(d), ys = isObj(d.y) && Array.isArray(d.y.values) ? d.y.values : undefined;
    const series: any[] = Array.isArray(d.series) ? d.series : [];
    if (!xs || !xs.length) errors.push(`a heatmap needs x.values (the columns)`);
    if (!ys || !ys.length) errors.push(`a heatmap needs y.values (the rows): y is a category axis too`);
    if (series.length !== 1) errors.push(series.length === 0 ? `a heatmap needs one series with its rows as data` : `a heatmap draws one series; this one has ${series.length} (use one chart each)`);
    const s0 = series[0];
    if (isObj(s0)) {
      for (const k of Object.keys(s0)) if (!HEAT_SERIES_KEYS.includes(k)) errors.push(`heatmap series: unknown key "${k}" (keys: ${HEAT_SERIES_KEYS.join(", ")})`);
      if (s0.tone !== undefined && !ANN_TONES.includes(String(s0.tone))) errors.push(`heatmap series tone must be 1 to 8, accent, good, warn, bad or muted (got ${JSON.stringify(s0.tone)})`);
      if (s0.diverge !== undefined && !num(s0.diverge)) errors.push(`heatmap series diverge must be a number (the value the ramp turns around)`);
      else if (s0.diverge !== undefined) ext.heat = { ...(ext.heat ?? {}), diverge: s0.diverge };
      if (s0.tone !== undefined) ext.heat = { ...(ext.heat ?? {}), tone: String(s0.tone) };
      if (!Array.isArray(s0.data)) errors.push(`heatmap series data must be a list of rows, one per y value`);
      else if (ys && s0.data.length !== ys.length) errors.push(`a heatmap needs one row of data per y value: y has ${ys.length}, data has ${s0.data.length} rows`);
      else if (xs) {
        s0.data.forEach((row: any, i: number) => { if (!Array.isArray(row)) errors.push(`heatmap row ${i + 1} must be a list of ${xs.length} numbers`); else if (row.length !== xs.length) errors.push(`heatmap row ${i + 1} (${ys?.[i]}) has ${row.length} values, x has ${xs.length}`); });
        const cells = s0.data.length * xs.length;
        if (cells > caps().heatCells) errors.push(`a heatmap has at most ${caps().heatCells} cells (this one has ${cells}); aggregate the data into fewer rows or columns`);
        else charge(cells, cells);
      }
    }
    if (!errors.length && xs && ys && isObj(s0)) {
      base.kind = "bar";
      base.x = { label: isObj(d.x) ? d.x.label : undefined, values: xs };
      base.y = { label: isObj(d.y) ? d.y.label : undefined };
      base.series = (s0.data as any[]).map((row, i) => ({ name: String(ys[i]), data: row }));
    }
    return out(base);
  }
  // ---- annotations
  if (d.annotations !== undefined) {
    const list = d.annotations;
    if (!Array.isArray(list)) errors.push(`annotations must be a list (each with at, from and to, or y)`);
    else if (!ANN_KINDS.includes(d.kind)) errors.push(`annotations are drawn on kind line, area, bar, scatter or candlestick (this chart is ${d.kind}); remove them`);
    else if (d.horizontal === true) errors.push(`annotations need a chart that runs left to right; remove horizontal or the annotations`);
    else {
      if (list.length > caps().annotations) errors.push(`at most ${caps().annotations} annotations (this chart has ${list.length}); keep the ones that matter`);
      const xs = ext.time ? ext.timesMs : (xValuesOf(d) ?? []);
      const lo = ext.time ? (ext.pc?.time?.min ?? Math.min(...ext.timesMs)) : 0, hi = ext.time ? (ext.pc?.time?.max ?? Math.max(...ext.timesMs)) : xs.length - 1;
      const pointsKind = d.kind === "scatter";
      const cat = (v: any): number | null => { const i = xs.findIndex((x: any) => String(x) === String(v)); return i < 0 ? null : i; };
      const pos = (v: any, what: string, i: number): number | null => {
        if (ext.time) {
          const t = parseTime(v instanceof Date ? v.toISOString() : v, tz);
          if (t === null) { errors.push(`annotation ${i + 1}: ${what} ${JSON.stringify(v)} is not an ISO time; write 2026-11-20T10:08`); return null; }
          if (t < lo || t > hi) { errors.push(`annotation ${i + 1}: ${what} ${JSON.stringify(v)} is outside the x axis (${isoOf(lo, tz, ext.dateOnly)} to ${isoOf(hi, tz, ext.dateOnly)}); move it inside, or add data that covers it`); return null; }
          return t;
        }
        if (pointsKind) { if (!num(v)) { errors.push(`annotation ${i + 1}: ${what} must be a number on a scatter chart's x axis`); return null; } return v; }
        const c = cat(v);
        if (c === null) { errors.push(`annotation ${i + 1}: ${what} ${JSON.stringify(v)} is not one of the x values (${xs.slice(0, 6).map(String).join(", ")}${xs.length > 6 ? ", ..." : ""}); name one of them`); return null; }
        return c;
      };
      charge(list.length * 4, list.length); // before the loop that reads every annotation
      list.forEach((a: any, i: number) => {
        if (!isObj(a)) { errors.push(`annotation ${i + 1} must be an object with at, from and to, or y`); return; }
        for (const k of Object.keys(a)) if (!ANN_KEYS.includes(k)) errors.push(`annotation ${i + 1}: unknown key "${k}" (keys: ${ANN_KEYS.join(", ")})`);
        const hasGoal = a.goal !== undefined; // p11 pagecharts: a goal is a threshold that may stop at a time
        const hasAt = a.at !== undefined, hasRange = !hasGoal && (a.from !== undefined || a.to !== undefined), hasY = a.y !== undefined || hasGoal;
        if (hasGoal && a.y !== undefined) { errors.push(`annotation ${i + 1} has both goal and y; a goal is a line or band of its own: keep one`); return; }
        const kinds = [hasAt, hasRange, hasY].filter(Boolean).length;
        if (kinds !== 1) { errors.push(kinds === 0 ? `annotation ${i + 1} needs one of at (an event), from and to (a range) or y (a threshold)` : `annotation ${i + 1} has more than one of at, from and to, and y; an annotation is one kind`); return; }
        if (a.tone !== undefined && !ANN_TONES.includes(String(a.tone))) errors.push(`annotation ${i + 1}: tone must be c1 to c8 (or 1 to 8), acc, good, warn, bad or muted (got ${JSON.stringify(a.tone)})`);
        if (a.label !== undefined && typeof a.label !== "string") errors.push(`annotation ${i + 1}: label must be text`);
        if (a.text !== undefined && typeof a.text !== "string") errors.push(`annotation ${i + 1}: text must be text`);
        if (typeof a.label === "string" && a.label.length > caps().label) warnings.push(`annotation ${i + 1}: the label "${a.label.slice(0, 30)}..." is ${a.label.length} characters; keep it to ${caps().label} (put the rest in text)`);
        const tone = String(a.tone ?? (hasGoal ? "good" : "acc"));
        const axis = a.axis === undefined ? "y" : a.axis;
        if (axis !== "y" && axis !== "y2") errors.push(`annotation ${i + 1}: axis must be y or y2`);
        else if (a.axis !== undefined && !hasY) errors.push(`annotation ${i + 1}: axis goes with y (a threshold); an event or range sits on the x axis`);
        else if (axis === "y2" && !isObj(d.y2)) errors.push(`annotation ${i + 1}: axis: y2 needs a second axis; add y2: { label: ... } to the chart, or use axis: y`);
        if (a.fill !== undefined && !hasY) errors.push(`annotation ${i + 1}: fill goes with y (a threshold)`);
        else if (a.fill !== undefined && a.fill !== "above" && a.fill !== "below") errors.push(`annotation ${i + 1}: fill must be above or below`);
        const label = typeof a.label === "string" ? a.label : "";
        const text = typeof a.text === "string" ? a.text : "";
        const whenOf = (p: number) => (ext.time ? fmtTime(p, ext.dateOnly ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm", tz) : String(xs[p] ?? p));
        const rangeOf = (f: number, t: number) => (ext.time && !ext.dateOnly && fmtTime(f, "yyyy-MM-dd", tz) === fmtTime(t, "yyyy-MM-dd", tz) ? `${whenOf(f)} to ${fmtTime(t, "HH:mm", tz)}` : `${whenOf(f)} to ${whenOf(t)}`);
        if (hasAt) {
          const p = pos(a.at, "at", i);
          if (p !== null) ext.anns.push({ kind: "event", label: label || whenOf(p), text, tone, from: p, to: p, axis: "y", when: whenOf(p) });
        } else if (hasRange) {
          if (a.from === undefined || a.to === undefined) { errors.push(`annotation ${i + 1}: a range needs both from and to`); return; }
          const f = pos(a.from, "from", i), t = pos(a.to, "to", i);
          if (f !== null && t !== null) {
            if (f > t) errors.push(`annotation ${i + 1}: from ${JSON.stringify(a.from)} is after to ${JSON.stringify(a.to)}; swap them`);
            else ext.anns.push({ kind: "range", label: label || rangeOf(f, t), text, tone, from: f, to: t, axis: "y", when: rangeOf(f, t) });
          }
        } else {
          const word = hasGoal ? "goal" : "y", yv = hasGoal ? a.goal : a.y;
          const ys = Array.isArray(yv) ? yv : [yv];
          if (!ys.every(num) || ys.length > 2 || ys.length === 0) { errors.push(`annotation ${i + 1}: ${word} is a number (a line) or [low, high] (a band)`); return; }
          if (ys.length === 2 && ys[0] >= ys[1]) { errors.push(`annotation ${i + 1}: ${word}: [low, high] needs low below high`); return; }
          if (ys.length === 2 && a.fill !== undefined) { errors.push(`annotation ${i + 1}: a band ${word}: [low, high] is already tinted; remove fill`); return; }
          const fo = axis === "y2" ? ext.formats.y2 : ext.formats.y, vt = (v: number) => (fo ? fmtValue(v, fo.format, fo.currency) : fmtValue(v));
          const when = hasGoal ? (ys.length === 2 ? `goal ${vt(ys[0])} to ${vt(ys[1])}` : `goal ${vt(ys[0])}`) : ys.length === 2 ? `${axis} from ${ys[0]} to ${ys[1]}` : `${axis} = ${ys[0]}`;
          const ann: Ann = { kind: "threshold", label: label || (hasGoal ? when[0].toUpperCase() + when.slice(1) : when), text, tone, y: ys[0], y2: ys.length === 2 ? ys[1] : undefined, axis: axis === "y2" ? "y2" : "y", fill: a.fill, when };
          if (hasGoal) {
            ann.goal = true;
            if (a.from !== undefined || a.to !== undefined) {
              if (a.from === undefined || a.to === undefined) { errors.push(`annotation ${i + 1}: a goal that stops at a time needs both from and to (leave both out for the whole chart)`); return; }
              const f = pos(a.from, "from", i), t = pos(a.to, "to", i);
              if (f === null || t === null) return;
              if (f > t) { errors.push(`annotation ${i + 1}: from ${JSON.stringify(a.from)} is after to ${JSON.stringify(a.to)}; swap them`); return; }
              ann.from = f; ann.to = t; ann.when = `${when}, ${rangeOf(f, t)}`;
            }
          }
          ext.anns.push(ann);
        }
      });
      { const le = pcAnnLogError(ext.anns, base, ext.pc); if (le) errors.push(le); } // p11 pagecharts
    }
  }
  return out(base);
}

/** the chart as every step shows it, checked: `base` is step 1's plain chart, for the evaluator's own checks */
export function prepareChart(d: any): { base: any; errors: string[]; warnings: string[]; steps: Prepared[] } { return withChartBudget(() => prepareChartIn(d)); }
function prepareChartIn(d: any): { base: any; errors: string[]; warnings: string[]; steps: Prepared[] } {
  const errors: string[] = [], warnings: string[] = [];
  const steps: any[] = Array.isArray(d?.steps) ? d.steps : [];
  if (isObj(d) && d.steps !== undefined) {
    if (!Array.isArray(d.steps)) errors.push(`steps must be a list (each with a title, and the series, annotations or y it changes)`);
    else if (d.steps.length === 1) errors.push(`a chart with steps needs at least 2 (or none); add a second step, or remove steps`);
    else if (d.steps.length > caps().steps) errors.push(`at most ${caps().steps} steps (this chart has ${d.steps.length}); merge some`);
    if (d.controls !== undefined) errors.push(`a chart has steps or controls, not both; remove one`);
  }
  const n = Math.max(1, steps.length);
  const out: Prepared[] = [];
  for (let k = 0; k < n; k++) {
    const { spec, errors: es } = specAt(d, k);
    // a step's own mistakes are reported once (at the step that makes them)
    if (k === 0 || es.length) for (const e of es) if (!errors.includes(e)) errors.push(e);
    const title = steps[k]?.title;
    const p = prepareOne(spec, k, steps.length, typeof title === "string" ? title : undefined);
    out.push(p);
    for (const e of p.errors) { const msg = n > 1 ? `step ${k + 1}: ${e}` : e; if (!errors.includes(msg) && !(k > 0 && out[0].errors.includes(e))) errors.push(msg); }
    for (const w of p.warnings) if (k === 0) warnings.push(w);
    // later steps check their data lengths and numbers with the evaluator
    if (k > 0 && !p.errors.length && !es.length) { const r = evalChart(p.base); if (r.error) errors.push(`step ${k + 1}: ${r.error}`); }
  }
  return { base: out[0].base, errors, warnings, steps: out };
}
/** what doccheck calls first for a chart: the new words checked, and the plain chart left for the evaluator's own checks */
export function chart11Check(d: any): { base: any; errors: string[]; warnings: string[] } { return withChartBudget(() => chart11CheckIn(d)); }
function chart11CheckIn(d: any): { base: any; errors: string[]; warnings: string[] } {
  if (!isObj(d)) return { base: d, errors: [], warnings: [] };
  let p: ReturnType<typeof prepareChart>;
  try { p = prepareChart(d); } catch (e) { if (e instanceof BudgetError) return { base: d, errors: [e.message], warnings: [] }; throw e; }
  const errors = [...p.errors];
  if (!p.errors.length) { try { errors.push(...pcDeepCheck(d, p.steps.map((x) => x.base), p.steps[0].ext.pc)); } catch (e) { if (e instanceof BudgetError) return { base: d, errors: [e.message], warnings: [] }; throw e; } } // p11 pagecharts: scale toggle views, calculator rows
  for (const k of Object.keys(d)) if (!CHART11_KEYS.includes(k)) errors.push(`unknown key "${k}" (keys: ${CHART11_KEYS.join(", ")})`);
  return { base: p.base, errors, warnings: p.warnings };
}
export const usesChart11 = (d: any) => isObj(d) && (d.kind === "heatmap" || d.steps !== undefined || d.annotations !== undefined || d.tz !== undefined || d.layout !== undefined || d.inputs !== undefined || d.formulas !== undefined || d.calc !== undefined || [d.x, d.y, d.y2].some((a) => isObj(a) && (a.format !== undefined || a.currency !== undefined || a.scale === "time" || a.toggle !== undefined)) || (Array.isArray(d.series) && d.series.some((s: any) => isObj(s) && (s.line !== undefined || s.marker !== undefined))));

export interface Eval11 { x: Val[]; series: ChartSeries[]; vars: Record<string, Val>; error?: string; limit?: "part" | "page"; ext: Ext }
export const EMPTY_EXT: Ext = { tz: "UTC", time: false, timePoints: false, timesMs: [], dateOnly: false, formats: {}, anns: [], step: 0, steps: 0 };
/** evaluate a chart at a step, for the reader's control values; the data the renderer draws, plus the new facts */
export function evalChart11(d: any, values?: Record<string, Val>, step = 0): Eval11 {
  // the page's first evaluation draws from the page's budget; a reader's own action (a slider, a step) from a fresh one of its own
  try { return withChartBudget(() => {
    const steps = Array.isArray(d?.steps) ? d.steps : [];
    const k = Math.max(0, Math.min(step, Math.max(0, steps.length - 1)));
    const { spec, errors } = specAt(d, k);
    if (errors.length) return { x: [], series: [], vars: {}, error: errors[0], ext: EMPTY_EXT };
    const p = prepareOne(spec, k, steps.length, typeof steps[k]?.title === "string" ? steps[k].title : undefined);
    if (p.errors.length) return { x: [], series: [], vars: {}, error: p.errors[0], ext: p.ext };
    const r = evalChart(p.base, values);
    return { ...r, ext: p.ext };
  }); } catch (e) { return { x: [], series: [], vars: {}, error: (e as Error).message, ...(e instanceof BudgetError ? { limit: e.page ? "page" as const : "part" as const } : {}), ext: EMPTY_EXT }; }
}

// ---------------------------------------------------------------- value formats (4.4)
const nf = new Map<string, Intl.NumberFormat>();
const numFmt = (key: string, o: Intl.NumberFormatOptions) => { let f = nf.get(key); if (!f) { f = new Intl.NumberFormat("en-US", o); nf.set(key, f); } return f; };
const trim = (x: number, digits = 1) => { const s = x.toFixed(digits); if (!s.includes(".")) return s; let e = s.length; while (s[e - 1] === "0") e--; if (s[e - 1] === ".") e--; return s.slice(0, e); };
/** seconds to words: 90 is 1m 30s, 3700 is 1h 1m, 0.4 is 400 ms */
export function durationText(seconds: number): string {
  const neg = seconds < 0 ? "-" : "", s = Math.abs(seconds);
  if (s === 0) return "0s";
  if (s < 1) return `${neg}${trim(s * 1000, s < 0.01 ? 2 : 1)} ms`;
  if (s < 60) return `${neg}${trim(s, 2)}s`;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`); if (h) parts.push(`${h}h`); if (m && parts.length < 2) parts.push(`${m}m`); if (sec && !d && !h && parts.length < 2) parts.push(`${sec}s`);
  return neg + parts.slice(0, 2).join(" ");
}
const BYTE_UNITS = ["bytes", "KiB", "MiB", "GiB", "TiB", "PiB"];
export function bytesText(v: number, digits = 1): string {
  const neg = v < 0 ? "-" : "";
  let x = Math.abs(v), i = 0;
  while (x >= 1024 && i < BYTE_UNITS.length - 1) { x /= 1024; i++; }
  return `${neg}${i === 0 ? String(Math.round(x)) : trim(x, digits)} ${BYTE_UNITS[i]}`;
}
/** a value as the axis, the tooltip and the table show it; `compact` is for ticks (shorter) */
export function fmtValue(v: any, format = "number", currency = "USD", compact = false): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return v == null ? "" : String(v);
  switch (format) {
    case "percent": return `${trim(v, 2)}%`;
    case "money": return compact && Math.abs(v) >= 1_000 ? numFmt(`c${currency}`, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v) : numFmt(`m${currency}${Number.isInteger(v)}`, { style: "currency", currency, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
    case "duration": return durationText(v);
    case "duration-ms": return Math.abs(v) >= 1000 ? durationText(v / 1000) : `${trim(v, 2)} ms`;
    case "bytes": return bytesText(v);
    default: return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}
/** the unit the LLM view's table header names: p95 (ms) */
export function unitOf(f?: { format: string; currency?: string }): string {
  switch (f?.format) { case "percent": return "%"; case "money": return f.currency ?? "USD"; case "duration": return "s"; case "duration-ms": return "ms"; case "bytes": return "bytes"; default: return ""; }
}

// ---------------------------------------------------------------- the LLM view (4.1 to 4.5)
const cell = (v: any): string => (Array.isArray(v) ? (v.length === 2 && v.every(num) ? `${v[0]} to ${v[1]}` : v.join(", ")) : v == null ? "" : String(v));
function annLines(anns: Ann[], ext: Ext): string[] {
  return anns.map((a) => {
    if (a.kind === "event") return `- ${a.when} ${a.label} (event)${a.text ? `: ${a.text}` : ""}`;
    if (a.kind === "range") return `- ${a.when} ${a.label} (range)${a.text ? `: ${a.text}` : ""}`;
    const side = a.fill ? `; ${a.fill === "above" ? "above" : "below"} it is marked` : a.y2 !== undefined ? (a.goal ? "; band" : " (band)") : "";
    return `- ${a.when} ${a.label} (${a.goal ? "goal" : "threshold"}${side})${a.text ? `: ${a.text}` : ""}`;
  });
}
function plainTable(cols: string[], rows: string[][]): string {
  return `| ${cols.join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
}
/** the calculator layout's LLM view (p11 pagecharts): inputs, formulas and the result at the start values */
function calcTable11(d: any): string | null {
  let pre: ReturnType<typeof prepareChart>;
  try { pre = prepareChart(d); } catch (e) { if (e instanceof BudgetError) return null; throw e; }
  const pc = pre.steps[0].ext.pc;
  if (pre.errors.length || !pc?.calc) return null;
  const r = evalChart11(d);
  if (r.error) return null;
  return calcLines(typeof d.title === "string" ? d.title : undefined, pc.calc, d, r.vars, (v, f, c) => fmtValue(v, f, c)).join("\n");
}
/** the LLM view of a chart written with the new words; null when it cannot be drawn */
export function chartTable11(d: any): string | null { return withChartBudget(() => chartTable11In(d)); }
function chartTable11In(d: any): string | null {
  if (isObj(d) && d.layout === "calculator") return calcTable11(d); // p11 pagecharts
  if (!isObj(d) || d.controls || d.let) return null;
  let pre: ReturnType<typeof prepareChart>;
  try { pre = prepareChart(d); } catch (e) { if (e instanceof BudgetError) return null; throw e; }
  if (pre.errors.length) return null;
  const first = pre.steps[0];
  const e0 = first.ext;
  const unitCols = (b: any, ext: Ext): any => {
    // the header says the unit: p95 (ms); a point chart's axis labels too
    const out = { ...b };
    if (ext.time && !(isObj(b.x) && b.x.label)) out.x = { ...(isObj(b.x) ? b.x : {}), label: "time" };
    const fy = ext.formats.y, fy2 = ext.formats.y2;
    out.series = (b.series ?? []).map((s: any) => { if (!isObj(s)) return s; const u = unitOf(s.axis === "y2" ? fy2 : fy); return u ? { ...s, name: `${s.name} (${u})` } : s; });
    if (b.kind === "scatter" || b.kind === "bubble") {
      const ux = unitOf(ext.formats.x), uy = unitOf(fy);
      if (ux) out.x = { ...(isObj(b.x) ? b.x : {}), label: `${isObj(b.x) && b.x.label ? b.x.label : "x"} (${ux})` };
      if (uy) out.y = { ...(isObj(b.y) ? b.y : {}), label: `${isObj(b.y) && b.y.label ? b.y.label : "y"} (${uy})` };
    }
    return out;
  };
  let head: string;
  let table: string;
  if (d.kind === "heatmap") {
    const r = evalChart(first.base);
    if (r.error) return null;
    const xl = isObj(d.x) && d.x.label ? d.x.label : "x", yl = isObj(d.y) && d.y.label ? d.y.label : "y";
    head = `Chart (heatmap)${d.title ? `: ${d.title}` : ""}`;
    table = `Each cell is the value for one ${yl} and one ${xl}${e0.heat?.diverge !== undefined ? `; colours turn around ${e0.heat.diverge}` : ""}${r.series[0] ? ` (${(d.series?.[0]?.name) ?? "value"})` : ""}.\n\n${plainTable([`${yl} \\ ${xl}`, ...r.x.map(String)], r.series.map((s) => [s.name, ...s.data.map(cell)]))}`;
  } else {
    const t = chartTable(unitCols(first.base, e0));
    if (!t) return null;
    const i = t.indexOf("\n\n");
    head = i < 0 ? t : t.slice(0, i);
    table = i < 0 ? "" : t.slice(i + 2);
  }
  const lines: string[] = [head, ""];
  if (e0.steps > 1) lines.push(`Step 1: ${first.ext.stepTitle ?? ""}`.trimEnd(), "");
  if (e0.time) lines.push(`Time axis, shown in ${e0.tz}.`, "");
  if (e0.pc?.toggle) lines.push(`The reader can switch the ${e0.pc.toggle.axes.join(" and ")} axis between log and linear; it starts as ${e0.pc.toggle.start}.`, "");
  lines.push(table);
  if (e0.anns.length) lines.push("", "Annotations:", ...annLines(e0.anns, e0));
  // later steps: the series each one changed
  for (let k = 1; k < pre.steps.length; k++) {
    const prev = pre.steps[k - 1], cur = pre.steps[k];
    const rp = evalChart(prev.base), rc = evalChart(cur.base);
    if (rc.error || rp.error) return null;
    lines.push("", `Step ${k + 1}: ${cur.ext.stepTitle ?? ""}`.trimEnd());
    const changed = rc.series.filter((s) => { const o = rp.series.find((q) => q.name === s.name); return !o || JSON.stringify(o.data) !== JSON.stringify(s.data); });
    if (d.kind === "heatmap") {
      if (changed.length) lines.push("", plainTable([`${isObj(d.y) && d.y.label ? d.y.label : "y"} \\ ${isObj(d.x) && d.x.label ? d.x.label : "x"}`, ...rc.x.map(String)], changed.map((s) => [s.name, ...s.data.map(cell)])));
      else lines.push("", "No values change.");
    } else if (changed.length) {
      const f = (s: ChartSeries) => unitOf(s.axis === "y2" ? cur.ext.formats.y2 : cur.ext.formats.y);
      const cols = [first.base.x?.label || "x", ...changed.map((s) => (f(s) ? `${s.name} (${f(s)})` : s.name))];
      lines.push("", plainTable(cols, rc.x.map((x, i) => [cell(x), ...changed.map((s) => cell(s.data[i]))])));
    } else lines.push("", "No values change.");
    if (JSON.stringify(cur.ext.anns) !== JSON.stringify(prev.ext.anns)) lines.push("", "Annotations:", ...(cur.ext.anns.length ? annLines(cur.ext.anns, cur.ext) : ["- none"]));
  }
  return lines.join("\n");
}
