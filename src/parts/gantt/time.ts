// The gantt's date code (format version 11): our own small layer on Intl.DateTimeFormat, so no date library is added.
// Pure. A time without an offset (`2026-12-01T09:00`) is wall-clock time in the chart's zone (`tz=`, default UTC), so
// what an author writes is what the axis shows; a time with `Z` or an offset (`+01:00`) is an exact moment. Every scan
// of author text here is by hand (no regular expression), linear in the text.
import type { Budget } from "../../core/budget";

export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export type TimeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";

const dtf = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = dtf.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", era: "short" }); dtf.set(tz, f); }
  return f;
}
/** is this an IANA zone name the browser knows */
export function validZone(tz: string): boolean {
  if (tz === "UTC") return true;
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

// ---- reading an ISO date or time: a hand scan ----
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
/** n digits at i as a number, or -1 */
function digits(s: string, i: number, n: number): number {
  if (i + n > s.length) return -1;
  let v = 0;
  for (let k = 0; k < n; k++) { const c = s.charCodeAt(i + k) - 48; if (c < 0 || c > 9) return -1; v = v * 10 + c; }
  return v;
}
export interface Iso { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number; /** minutes east of UTC, or null: wall-clock */ off: number | null; time: boolean }
/** The shape of an ISO date or time: `2026-12-01`, `2026-12-01T09:00`, `...:30`, and an optional `Z` or `+01:00`/`+0100`.
 *  Strict (a token of a line): no spaces, no fraction. Loose (an attribute): `T` or a space before the time, a fraction
 *  of 1 to 3 digits after the seconds, white space before the offset and at the end. null when the shape is not that. */
export function scanIso(s: string, loose = false): Iso | null {
  const y = digits(s, 0, 4), mo = digits(s, 5, 2), d = digits(s, 8, 2);
  if (y < 0 || mo < 0 || d < 0 || s[4] !== "-" || s[7] !== "-") return null;
  let i = 10, h = 0, mi = 0, sec = 0, ms = 0, time = false;
  if (i < s.length && (s[i] === "T" || (loose && s[i] === " " && isDigit(s[i + 1])))) {
    h = digits(s, i + 1, 2); mi = digits(s, i + 4, 2);
    if (h < 0 || mi < 0 || s[i + 3] !== ":") return null;
    i += 6; time = true;
    if (s[i] === ":") {
      sec = digits(s, i + 1, 2);
      if (sec < 0) return null;
      i += 3;
      if (loose && s[i] === ".") {
        let j = i + 1;
        while (j < s.length && j < i + 4 && isDigit(s[j])) j++;
        if (j === i + 1) return null;
        ms = +s.slice(i + 1, j).padEnd(3, "0"); i = j;
      }
    }
  }
  if (loose) while (i < s.length && s[i].trim() === "") i++;
  let off: number | null = null;
  if (i < s.length && s[i] === "Z") { off = 0; i++; }
  else if (i < s.length && (s[i] === "+" || s[i] === "-")) {
    const hh = digits(s, i + 1, 2), at = s[i + 3] === ":" ? i + 4 : i + 3, mm = digits(s, at, 2);
    if (hh < 0 || mm < 0) return null;
    off = (s[i] === "-" ? -1 : 1) * (hh * 60 + mm); i = at + 2;
  }
  if (loose) while (i < s.length && s[i].trim() === "") i++;
  return i === s.length ? { y, mo, d, h, mi, s: sec, ms, off, time } : null;
}
/** a whole `YYYY-MM-DD` and nothing else */
export const isDateOnly = (s: string) => s.length === 10 && scanIso(s) !== null;
/** an ISO date or time to an instant (ms), or null when it is not one (or not a real date). No offset: wall-clock time in `tz`. */
export function parseTime(v: string, tz = "UTC"): number | null {
  const p = scanIso(v.trim(), true);
  if (!p) return null;
  if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.h > 23 || p.mi > 59 || p.s > 59) return null;
  if (p.d > new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate()) return null;
  if (p.off !== null) return utc(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms) - p.off * MIN;
  return wallToMs(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms, tz);
}

// ---- showing a time ----
const p2 = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A time as text. The pattern is the code's own (never author text): tokens yyyy MMM MM dd d HH mm ss; 'quoted' text is
 *  kept as it is, anything else too. */
export function fmtTime(t: number, pattern: string, tz = "UTC"): string {
  const p = partsOf(t, tz);
  let out = "";
  for (let i = 0; i < pattern.length;) {
    const c = pattern[i];
    if (c === "'") { const e = pattern.indexOf("'", i + 1); if (e > 0) { out += pattern.slice(i + 1, e); i = e + 1; continue; } }
    const at = (w: string) => pattern.startsWith(w, i);
    if (at("yyyy")) { out += String(p.y).padStart(4, "0"); i += 4; }
    else if (at("MMM")) { out += MONTHS[p.mo - 1]; i += 3; }
    else if (at("MM")) { out += p2(p.mo); i += 2; }
    else if (at("dd")) { out += p2(p.d); i += 2; }
    else if (at("HH")) { out += p2(p.h); i += 2; }
    else if (at("mm")) { out += p2(p.mi); i += 2; }
    else if (at("ss")) { out += p2(p.s); i += 2; }
    else if (c === "d") { out += String(p.d); i += 1; }
    else { out += c; i += 1; }
  }
  return out;
}

export function startOf(t: number, unit: TimeUnit, tz = "UTC", weekday = 1): number {
  const p = partsOf(t, tz);
  switch (unit) {
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

// ---- lengths: 3d, 2w, 4h, 90m ----
export const LENGTH_UNITS: Record<string, number> = { m: MIN, h: HOUR, d: DAY, w: 7 * DAY };
const isLetter = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
/** "3d" to {n: 3, unit: "d"}; null when it is not a length at all; `known` is false when the unit is not m, h, d or w */
export function parseLength(s: string): { n: number; unit: string; known: boolean } | null {
  let i = 0;
  while (i < s.length && isDigit(s[i])) i++;
  if (!i) return null;
  if (s[i] === ".") { const f = i + 1; i = f; while (i < s.length && isDigit(s[i])) i++; if (i === f) return null; }
  const num = s.slice(0, i), unit = s.slice(i);
  if (!unit) return null;
  for (const c of unit) if (!isLetter(c)) return null;
  return { n: +num, unit, known: Object.hasOwn(LENGTH_UNITS, unit) };
}
/** a progress such as `60%` or `12.5%` (the number), or null */
export function parsePercent(s: string): number | null {
  if (!s.endsWith("%")) return null;
  const body = s.slice(0, -1);
  let i = 0;
  while (i < body.length && isDigit(body[i])) i++;
  if (!i) return null;
  if (body[i] === ".") { const f = i + 1; i = f; while (i < body.length && isDigit(body[i])) i++; if (i === f) return null; }
  return i === body.length ? +body : null;
}
/** the end (exclusive) of a length from a start: hours and minutes as they are; days and weeks in whole days, and with
 *  workdays only Monday to Friday count (a week is 5 working days) */
export function addLength(start: number, n: number, unit: string, tz = "UTC", workdays = false): number {
  if (unit === "m" || unit === "h") return start + n * LENGTH_UNITS[unit];
  const days = Math.max(1, Math.round(n * (unit === "w" ? (workdays ? 5 : 7) : 1)));
  if (!workdays) return add(start, days, "day", tz);
  let t = nextWorkday(start, tz), left = days;
  // whole weeks at once (the same weekday again), then at most 5 days by hand: never a loop as long as the length
  const weeks = Math.floor((left - 1) / 5);
  if (weeks > 0) { t = add(t, weeks * 7, "day", tz); left -= weeks * 5; }
  while (left > 0) { const d = partsOf(t, tz).dow; if (d !== 0 && d !== 6) left--; t = add(t, 1, "day", tz); }
  return t;
}
/** the next working day at or after t */
export function nextWorkday(t: number, tz = "UTC"): number { let x = t; for (let k = 0; k < 3; k++) { const d = partsOf(x, tz).dow; if (d === 0 || d === 6) x = add(startOf(x, "day", tz), 1, "day", tz); else break; } return x; }

// ---- ticks: whole minutes, hours, days or months as fits ----
const STEPS: [TimeUnit, number][] = [
  ["second", 1], ["second", 5], ["second", 15], ["second", 30], ["minute", 1], ["minute", 5], ["minute", 15], ["minute", 30],
  ["hour", 1], ["hour", 3], ["hour", 6], ["hour", 12], ["day", 1], ["day", 2], ["week", 1], ["week", 2], ["month", 1], ["month", 3], ["month", 6], ["year", 1], ["year", 2], ["year", 5], ["year", 10], ["year", 25], ["year", 100],
];
/** Ticks across [min, max] on whole units of a zone, at most `maxTicks` of them (never more than 200); charges the budget by what it makes. */
export function timeTicks(min: number, max: number, tz = "UTC", maxTicks = 8, budget?: Budget): { t: number[]; unit: TimeUnit; step: number } {
  maxTicks = Math.min(200, Math.max(1, maxTicks));
  let pick = STEPS[STEPS.length - 1];
  for (const s of STEPS) {
    const per = s[0] === "second" ? 1000 : s[0] === "minute" ? MIN : s[0] === "hour" ? HOUR : s[0] === "day" ? DAY : s[0] === "week" ? 7 * DAY : s[0] === "month" ? 30 * DAY : 365 * DAY;
    if ((max - min) / (per * s[1]) <= maxTicks) { pick = s; break; }
  }
  const [unit, step] = pick;
  const out: number[] = [];
  let t = startOf(min, unit, tz);
  if (unit === "hour" || unit === "month" || unit === "year") {
    // align a 3-hour, 6-hour, 3-month ... step to the unit of its parent (hours of the day, months of the year)
    const p = partsOf(t, tz);
    if (unit === "hour") t = wallToMs(p.y, p.mo, p.d, Math.floor(p.h / step) * step, 0, 0, 0, tz);
    else if (unit === "month") t = wallToMs(p.y, Math.floor((p.mo - 1) / step) * step + 1, 1, 0, 0, 0, 0, tz);
    else t = wallToMs(Math.floor(p.y / step) * step, 1, 1, 0, 0, 0, 0, tz);
  }
  if (t < min) t = add(t, step, unit, tz);
  for (let k = 0; t <= max && k < maxTicks * 4; k++) { out.push(t); t = add(t, step, unit, tz); }
  budget?.charge(out.length + 8, out.length);
  return { t: out, unit, step };
}
/** the label of a tick, short for the unit */
export function tickLabel(t: number, unit: TimeUnit, tz = "UTC", first = false): string {
  switch (unit) {
    case "second": return fmtTime(t, "HH:mm:ss", tz);
    case "minute": case "hour": { const p = partsOf(t, tz); return first || p.h + p.mi === 0 ? fmtTime(t, "MMM d HH:mm", tz) : fmtTime(t, "HH:mm", tz); }
    case "day": case "week": return fmtTime(t, "MMM d", tz);
    case "month": case "quarter": return fmtTime(t, "MMM yyyy", tz);
    default: return fmtTime(t, "yyyy", tz);
  }
}
