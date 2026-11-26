// Shared axis maths for our own charts (lane ch-xy owns this file; ch-radial uses it for radar's scale).
// Pure: numbers in, numbers and words out. No colours, no DOM.
import { fmtValue } from "../../core/chart11";

/** one decimal at most, no trailing zero: 1.5 -> "1.5", 2 -> "2" */
const trim1 = (x: number): string => { const s = x.toFixed(1); return s.endsWith(".0") ? s.slice(0, -2) : s; };

/** A number as a short tick word: 950, 1k, 1.5k, 12k, 3M, 2.5B (point 22: the axis never spends width on "1500"). */
export function compactNumber(v: number): string {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v), sign = v < 0 ? "-" : "";
  if (a >= 1e12) return `${sign}${trim1(a / 1e12)}T`;
  if (a >= 1e9) return `${sign}${trim1(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}${trim1(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}${trim1(a / 1e3)}k`;
  if (Number.isInteger(v)) return String(v);
  return String(+v.toFixed(a < 1 ? 3 : 2));
}

const symbolCache = new Map<string, string>();
function currencySymbol(code: string): string {
  let s = symbolCache.get(code);
  if (s === undefined) {
    try { s = new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code; } catch { s = code; }
    symbolCache.set(code, s);
  }
  return s;
}

/** A value as the axis shows it: the unit kept (money, percent, duration, bytes), numbers compact. */
/** a number and its unit: a short unit joins it ("80k", "40%"), a word gets a space ("1500 dollars"); fmt12: shared with the stage's bars */
export const withUnit = (s: string, u: string): string => (!u ? s : u.length <= 3 ? s + u : `${s} ${u}`);
export function tickText(v: number, format = "number", currency = "USD"): string {
  if (!Number.isFinite(v)) return "";
  if (format.startsWith("unit:")) return withUnit(compactNumber(v), format.slice(5));
  switch (format) {
    case "money": { const s = currencySymbol(currency); return s.length <= 2 ? `${v < 0 ? "-" : ""}${s}${compactNumber(Math.abs(v))}` : `${compactNumber(v)} ${s}`; }
    case "percent": return `${compactNumber(+v.toFixed(2))}%`;
    case "number": return compactNumber(v);
    default: return fmtValue(v, format, currency, true);
  }
}
/** A value in full, as a popover or a table shows it. */
export const fullText = (v: number, format = "number", currency = "USD"): string => (!Number.isFinite(v) ? "" : format.startsWith("unit:") ? withUnit(fmtValue(v, "number"), format.slice(5)) : fmtValue(v, format, currency));

export interface Scale {
  lo: number; hi: number; log: boolean;
  ticks: number[];
  /** a value's position 0..1 along the axis (0 = lo) */
  at(v: number): number;
}

/** Round steps: 1, 2, 2.5, 5 times a power of ten. */
function niceStep(raw: number, whole: boolean): number {
  const e = Math.floor(Math.log10(raw)), f = raw / 10 ** e;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  const step = m * 10 ** e;
  return whole ? Math.max(1, step) : step;
}

/**
 * A linear scale on round ticks. `zero` forces 0 into the range (bars, areas); `min` and `max` are the author's own
 * bounds and are kept as they are. `count` is the most ticks wanted (set from the plot's height or width).
 */
export function linearScale(dataLo: number, dataHi: number, count: number, o: { min?: number; max?: number; zero?: boolean; whole?: boolean } = {}): Scale {
  if (o.min !== undefined && o.max !== undefined && o.min >= o.max) o = { ...o, min: undefined, max: undefined };
  let lo = o.min ?? dataLo, hi = o.max ?? dataHi;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (o.zero) { if (o.min === undefined) lo = Math.min(lo, 0); if (o.max === undefined) hi = Math.max(hi, 0); }
  if (hi === lo) { if (o.min === undefined) lo -= 1; if (o.max === undefined || o.min !== undefined) hi += 1; if (hi <= lo) hi = lo + 1; }
  const step = niceStep((hi - lo) / Math.max(1, count - 1), !!o.whole);
  if (o.min === undefined) lo = Math.floor(lo / step + 1e-9) * step;
  if (o.max === undefined) hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  const first = Math.ceil(lo / step - 1e-9);
  for (let k = first, n = 0; k * step <= hi + step * 1e-9 && n < 200; k++, n++) ticks.push(+(k * step).toPrecision(12));
  return { lo, hi, log: false, ticks, at: (v) => (hi === lo ? 0 : (v - lo) / (hi - lo)) };
}

/** A log scale ending on powers of ten; names 1, 2 and 5 of each power (only 1 on a phone or past three decades). */
export function logScale(dataLo: number, dataHi: number, o: { min?: number; max?: number; phone?: boolean } = {}): Scale {
  const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : NaN);
  let lo = pos(o.min ?? NaN), hi = pos(o.max ?? NaN);
  if (!(lo > 0)) lo = Number.isFinite(dataLo) && dataLo > 0 ? 10 ** Math.floor(Math.log10(dataLo)) : 1;
  if (!(hi > 0)) hi = Number.isFinite(dataHi) && dataHi > 0 ? 10 ** Math.ceil(Math.log10(dataHi)) : lo * 10;
  if (hi <= lo) hi = lo * 10;
  const span = Math.log10(hi / lo), ticks: number[] = [];
  const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
  for (let e = e0; e <= e1; e++) for (const m of [1, 2, 5]) {
    const v = m * 10 ** e;
    if (v < lo * (1 - 1e-9) || v > hi * (1 + 1e-9)) continue;
    if (m === 1 || (!o.phone && span <= 3)) ticks.push(+v.toPrecision(12));
  }
  const l0 = Math.log10(lo), l1 = Math.log10(hi);
  return { lo, hi, log: true, ticks, at: (v) => (v > 0 ? (Math.log10(v) - l0) / (l1 - l0) : 0) };
}

/** True when every number is a whole number (a count is never drawn with half steps). */
export const allWhole = (vals: number[]): boolean => { const n = vals.filter(Number.isFinite); return n.length > 0 && n.every(Number.isInteger); };

/** A category band: where band i sits along a length, with `n` equal bands. */
export const bandAt = (i: number, n: number, len: number) => ({ start: (i * len) / n, size: len / n, mid: ((i + 0.5) * len) / n });

/** A word that is safe in a primitive key (no spaces or separators). */
export const keyOf = (s: string): string => s.replace(/[^\p{L}\p{N}_.-]+/gu, "_").slice(0, 40);

/** Cut a label to `max` characters with an ellipsis. */
export const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + "…" : s);
