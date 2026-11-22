// chart-time: the date code of the chart's time axis (format version 11). Pure, no node modules: the browser draws with the
// same code doccheck checks with. It is our own small adapter on Intl.DateTimeFormat, so no date library is added.
//
// A time without an offset (`2026-11-20T10:08`) is wall-clock time in the chart's zone (`tz:`, default UTC), so what an
// author writes is what the axis shows. A time with `Z` or an offset (`+01:00`) is an exact moment, shown in the zone.
// Reading a time is a hand scan (no regular expression over the author's text).
import { charge } from "./chart-work";

export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export type TimeUnit = "millisecond" | "second" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";

const dtf = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = dtf.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", era: "short" }); dtf.set(tz, f); }
  return f;
}
export function validZone(tz: string): boolean {
  if (tz === "UTC") return true;
  if (tz.length > 64) return false;
  try { fmtFor(tz); return true; } catch { return false; }
}
export interface Parts { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number; dow: number }
/** the wall-clock parts of an instant in a zone (dow: 0 is Sunday) */
export function partsOf(t: number, tz = "UTC"): Parts {
  if (tz === "UTC") {
    const d = new Date(t);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(), dow: d.getUTCDay() };
  }
  const o: Record<string, string> = {};
  for (const p of fmtFor(tz).formatToParts(new Date(t))) o[p.type] = p.value;
  let y = +o.year; if (o.era === "B") y = 1 - y;
  const ms = ((t % 1000) + 1000) % 1000;
  return { y, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, ms, dow: new Date(Date.UTC(y, +o.month - 1, +o.day)).getUTCDay() };
}
const utc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0) => { const x = new Date(0); x.setUTCFullYear(y, mo - 1, d); x.setUTCHours(h, mi, s, ms); return x.getTime(); };
/** the instant of a wall-clock time in a zone (the earlier one, when a clock change makes it ambiguous) */
export function wallToMs(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, tz = "UTC"): number {
  const guess = utc(y, mo, d, h, mi, s, ms);
  if (tz === "UTC") return guess;
  let t = guess;
  for (let k = 0; k < 3; k++) {
    const p = partsOf(t, tz);
    const shown = utc(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms);
    const diff = shown - guess;
    if (diff === 0) break;
    t -= diff;
  }
  return t;
}
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
/** n digits at i: their value, or -1 */
function digits(s: string, i: number, n: number): number {
  let v = 0;
  for (let k = 0; k < n; k++) { const c = s[i + k]; if (!isDigit(c)) return -1; v = v * 10 + (c!.charCodeAt(0) - 48); }
  return v;
}
/** "2026-11-20" and nothing else (a date without a time) */
export const isDateOnly = (s: string): boolean => { const t = s.trim(); return t.length === 10 && digits(t, 0, 4) >= 0 && t[4] === "-" && digits(t, 5, 2) >= 0 && t[7] === "-" && digits(t, 8, 2) >= 0; };
/** an ISO date or time to an instant (ms), or null when it is not one. No offset: wall-clock time in `tz`. */
export function parseTime(v: unknown, tz = "UTC"): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v !== "string" || v.length > 64) return null;
  const s = v.trim();
  const y = digits(s, 0, 4), mo = s[4] === "-" ? digits(s, 5, 2) : -1, d = s[7] === "-" ? digits(s, 8, 2) : -1;
  if (y < 0 || mo < 0 || d < 0) return null;
  let i = 10, h = 0, mi = 0, sec = 0, ms = 0;
  if (i < s.length && (s[i] === "T" || s[i] === " ")) {
    i++;
    h = digits(s, i, 2); if (h < 0 || s[i + 2] !== ":") return null;
    mi = digits(s, i + 3, 2); if (mi < 0) return null;
    i += 5;
    if (s[i] === ":") {
      sec = digits(s, i + 1, 2); if (sec < 0) return null;
      i += 3;
      if (s[i] === ".") { let k = i + 1, n = 0, f = 0; while (n < 3 && isDigit(s[k])) { f = f * 10 + (s.charCodeAt(k) - 48); k++; n++; } if (!n) return null; ms = f * 10 ** (3 - n); i = k; }
    }
  }
  while (s[i] === " ") i++;
  let off: number | null = null;
  if (i < s.length) {
    if (s[i] === "Z" && i + 1 === s.length) off = 0;
    else if ((s[i] === "+" || s[i] === "-") && i > 10) {
      const oh = digits(s, i + 1, 2); if (oh < 0) return null;
      let k = i + 3; if (s[k] === ":") k++;
      const om = digits(s, k, 2); if (om < 0 || k + 2 !== s.length) return null;
      off = (s[i] === "-" ? -1 : 1) * (oh * 60 + om);
    } else return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || sec > 59) return null;
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  if (off !== null) return utc(y, mo, d, h, mi, sec, ms) - off * MIN;
  return wallToMs(y, mo, d, h, mi, sec, ms, tz);
}
const p2 = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** a time as text: tokens yyyy MMM MM dd d HH mm ss EEE; anything else is kept; 'quoted' text is kept as it is (the
 *  pattern is the chart's own, never the author's) */
export function fmtTime(t: number, pattern: string, tz = "UTC"): string {
  const p = partsOf(t, tz);
  return pattern.replace(/'([^']*)'|yyyy|MMM|MM|dd|d|HH|mm|ss|EEE/g, (tok, q) => {
    if (q !== undefined) return q;
    switch (tok) {
      case "yyyy": return String(p.y).padStart(4, "0");
      case "MMM": return MONTHS[p.mo - 1];
      case "MM": return p2(p.mo);
      case "dd": return p2(p.d);
      case "d": return String(p.d);
      case "HH": return p2(p.h);
      case "mm": return p2(p.mi);
      case "ss": return p2(p.s);
      default: return DAYS[p.dow];
    }
  });
}
/** an instant as ISO text in a zone: a date alone when `dateOnly` */
export const isoOf = (t: number, tz = "UTC", dateOnly = false) => (dateOnly ? fmtTime(t, "yyyy-MM-dd", tz) : fmtTime(t, "yyyy-MM-dd'T'HH:mm", tz));

export function startOf(t: number, unit: TimeUnit, tz = "UTC", weekday = 1): number {
  const p = partsOf(t, tz);
  switch (unit) {
    case "millisecond": return t;
    case "second": return wallToMs(p.y, p.mo, p.d, p.h, p.mi, p.s, 0, tz);
    case "minute": return wallToMs(p.y, p.mo, p.d, p.h, p.mi, 0, 0, tz);
    case "hour": return wallToMs(p.y, p.mo, p.d, p.h, 0, 0, 0, tz);
    case "day": return wallToMs(p.y, p.mo, p.d, 0, 0, 0, 0, tz);
    case "week": { const back = (p.dow - weekday + 7) % 7; return wallToMs(p.y, p.mo, p.d - back, 0, 0, 0, 0, tz); }
    case "month": return wallToMs(p.y, p.mo, 1, 0, 0, 0, 0, tz);
    case "quarter": return wallToMs(p.y, Math.floor((p.mo - 1) / 3) * 3 + 1, 1, 0, 0, 0, 0, tz);
    case "year": return wallToMs(p.y, 1, 1, 0, 0, 0, 0, tz);
  }
}
export function add(t: number, n: number, unit: TimeUnit, tz = "UTC"): number {
  switch (unit) {
    case "millisecond": return t + n;
    case "second": return t + n * 1000;
    case "minute": return t + n * MIN;
    case "hour": return t + n * HOUR;
    case "day": case "week": { const p = partsOf(t, tz); return wallToMs(p.y, p.mo, p.d + n * (unit === "week" ? 7 : 1), p.h, p.mi, p.s, p.ms, tz); }
    case "month": case "quarter": case "year": {
      const p = partsOf(t, tz), months = n * (unit === "year" ? 12 : unit === "quarter" ? 3 : 1);
      const mo0 = p.mo - 1 + months, y = p.y + Math.floor(mo0 / 12), mo = ((mo0 % 12) + 12) % 12 + 1;
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return wallToMs(y, mo, Math.min(p.d, last), p.h, p.mi, p.s, p.ms, tz);
    }
  }
}
export const endOf = (t: number, unit: TimeUnit, tz = "UTC", weekday = 1) => add(startOf(t, unit, tz, weekday), 1, unit, tz) - 1;
export function diff(a: number, b: number, unit: TimeUnit, tz = "UTC"): number {
  switch (unit) {
    case "millisecond": return a - b;
    case "second": return (a - b) / 1000;
    case "minute": return (a - b) / MIN;
    case "hour": return (a - b) / HOUR;
    case "day": case "week": { const pa = partsOf(a, tz), pb = partsOf(b, tz); const d = (utc(pa.y, pa.mo, pa.d) - utc(pb.y, pb.mo, pb.d)) / DAY + ((pa.h - pb.h) * 60 + (pa.mi - pb.mi)) / 1440; return unit === "week" ? d / 7 : d; }
    default: { const pa = partsOf(a, tz), pb = partsOf(b, tz); const m = (pa.y - pb.y) * 12 + (pa.mo - pb.mo) + (pa.d - pb.d) / 31; return unit === "year" ? m / 12 : unit === "quarter" ? m / 3 : m; }
  }
}

// ---- ticks: whole minutes, hours, days or months as fits
const STEPS: [TimeUnit, number][] = [
  ["second", 1], ["second", 5], ["second", 15], ["second", 30], ["minute", 1], ["minute", 5], ["minute", 15], ["minute", 30],
  ["hour", 1], ["hour", 3], ["hour", 6], ["hour", 12], ["day", 1], ["day", 2], ["week", 1], ["week", 2], ["month", 1], ["month", 3], ["month", 6], ["year", 1], ["year", 2], ["year", 5], ["year", 10], ["year", 25], ["year", 100],
];
/** ticks across [min, max] on whole units of a zone, at most `maxTicks` of them; charges the chart's budget by what it makes */
export function timeTicks(min: number, max: number, tz = "UTC", maxTicks = 8): { t: number[]; unit: TimeUnit; step: number } {
  let pick = STEPS[STEPS.length - 1];
  for (const s of STEPS) {
    const per = s[0] === "second" ? 1000 : s[0] === "minute" ? MIN : s[0] === "hour" ? HOUR : s[0] === "day" ? DAY : s[0] === "week" ? 7 * DAY : s[0] === "month" ? 30 * DAY : 365 * DAY;
    if ((max - min) / (per * s[1]) <= maxTicks) { pick = s; break; }
  }
  const [unit, step] = pick;
  const out: number[] = [];
  let t = startOf(min, unit, tz);
  if (unit === "hour" || unit === "month" || unit === "year") {
    const p = partsOf(t, tz);
    if (unit === "hour") t = wallToMs(p.y, p.mo, p.d, Math.floor(p.h / step) * step, 0, 0, 0, tz);
    else if (unit === "month") t = wallToMs(p.y, Math.floor((p.mo - 1) / step) * step + 1, 1, 0, 0, 0, 0, tz);
    else t = wallToMs(Math.floor(p.y / step) * step, 1, 1, 0, 0, 0, 0, tz);
  }
  if (t < min) t = add(t, step, unit, tz);
  for (let k = 0; t <= max && k < maxTicks * 4; k++) { out.push(t); t = add(t, step, unit, tz); }
  charge(out.length + 8, out.length);
  return { t: out, unit, step };
}
/** the label of a tick, short for the unit */
export function tickLabel(t: number, unit: TimeUnit, tz = "UTC", first = false): string {
  switch (unit) {
    case "second": return fmtTime(t, "HH:mm:ss", tz);
    case "minute": case "hour": return first || partsOf(t, tz).h + partsOf(t, tz).mi === 0 ? fmtTime(t, "MMM d HH:mm", tz) : fmtTime(t, "HH:mm", tz);
    case "day": case "week": return fmtTime(t, "MMM d", tz);
    case "month": case "quarter": return fmtTime(t, "MMM yyyy", tz);
    default: return fmtTime(t, "yyyy", tz);
  }
}
