// Number formats of the chart kinds (the same words as every chart's axis): number, percent, money, duration,
// duration-ms, bytes. Pure; nothing here reads author text.
import { compactNum } from "../../core/compact-num";
export const FORMATS = ["number", "percent", "money", "duration", "duration-ms", "bytes"];
const nf = new Map<string, Intl.NumberFormat>();
const numFmt = (key: string, o: Intl.NumberFormatOptions) => { let f = nf.get(key); if (!f) { f = new Intl.NumberFormat("en-US", o); nf.set(key, f); } return f; };
/** a number with at most `digits` decimals and no trailing zeros */
const trim = (x: number, digits = 1) => {
  let s = x.toFixed(digits);
  if (!s.includes(".")) return s;
  let e = s.length;
  while (s[e - 1] === "0") e--;
  if (s[e - 1] === ".") e--;
  return s.slice(0, e);
};
/** seconds to words: 90 is 1m 30s, 3700 is 1h 1m, 0.4 is 400 ms */
export function durationText(seconds: number): string {
  const neg = seconds < 0 ? "-" : "", s = Math.abs(seconds);
  if (s === 0) return "0s";
  if (s < 1) return `${neg}${trim(s * 1000, s < 0.01 ? 2 : 1)} ms`;
  if (s < 60) return `${neg}${trim(s, 2)}s`;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && parts.length < 2) parts.push(`${m}m`);
  if (sec && !d && !h && parts.length < 2) parts.push(`${sec}s`);
  return neg + parts.slice(0, 2).join(" ");
}
const BYTE_UNITS = ["bytes", "KiB", "MiB", "GiB", "TiB", "PiB"];
export function bytesText(v: number, digits = 1): string {
  const neg = v < 0 ? "-" : "";
  let x = Math.abs(v), i = 0;
  while (x >= 1024 && i < BYTE_UNITS.length - 1) { x /= 1024; i++; }
  return `${neg}${i === 0 ? String(Math.round(x)) : trim(x, digits)} ${BYTE_UNITS[i]}`;
}
/** a value as the axis, the card and the table show it; `compact` is for ticks (shorter); `narrow` (a phone's chart) makes a plain number
 *  of a tick 1k, 1.5k, 2M and leaves the unit formats as they are */
export function fmtValue(v: unknown, format = "number", currency = "USD", compact = false, narrow = false): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return v == null ? "" : String(v);
  switch (format) {
    case "percent": return `${trim(v, 2)}%`;
    case "money": return compact && Math.abs(v) >= 1_000 ? numFmt(`c${currency}`, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v) : numFmt(`m${currency}${Number.isInteger(v)}`, { style: "currency", currency, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
    case "duration": return durationText(v);
    case "duration-ms": return Math.abs(v) >= 1000 ? durationText(v / 1000) : `${trim(v, 2)} ms`;
    case "bytes": return bytesText(v);
    default: if (compact && narrow) return compactNum(v); return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}
/** the unit a table header names: p95 (ms) */
export function unitOf(f?: { format: string; currency?: string }): string {
  switch (f?.format) { case "percent": return "%"; case "money": return f.currency ?? "USD"; case "duration": return "s"; case "duration-ms": return "ms"; case "bytes": return "bytes"; default: return ""; }
}
