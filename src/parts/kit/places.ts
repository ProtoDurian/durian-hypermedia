// Shared geographic and schedule values: pure dates, zones and colour-word scans.
export type PErr = { line: number; msg: string };

/** the colour words every part takes (the format): 8 family colours, an accent and four roles */
export const COLOUR_WORDS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc", "good", "warn", "bad", "muted"];

/** "[c3]" at the end or anywhere in a line: the word, or null; a bad word is reported by the caller */
// (0.6.2, linear time: the three helpers below scan with indexOf, never with a regex that can backtrack over author text)
/** the line without s[from, to) and the spaces before it, spaces collapsed */
const cutOut = (s: string, from: number, to: number): string => (s.slice(0, from).trimEnd() + " " + s.slice(to)).replace(/\s+/g, " ").trim();
export function takeColour(s: string): { rest: string; word: string | null; raw: string | null } {
  const i = s.indexOf("["), j = i < 0 ? -1 : s.indexOf("]", i + 1);
  if (j < 0) return { rest: s, word: null, raw: null };
  const raw = s.slice(i + 1, j).trim();
  return { rest: cutOut(s, i, j + 1), word: COLOUR_WORDS.includes(raw) ? raw : null, raw };
}
/** a bare "label" (double quotes, no key) anywhere in a line */
export function takeLabel(s: string): { rest: string; value: string | null } {
  const i = s.indexOf('"'), j = i < 0 ? -1 : s.indexOf('"', i + 1);
  return j < 0 ? { rest: s, value: null } : { rest: cutOut(s, i, j + 1), value: s.slice(i + 1, j) };
}
export const colourError = (what: string, raw: string) =>
  `${what}: unknown colour "[${raw}]"; colours are ${COLOUR_WORDS.join(", ")} (theme words, never a hex value)`;

/** `key="two words"` anywhere in a line; returns the value and the line without it */
export function takeQuoted(s: string, key: string): { rest: string; value: string | null } {
  const open = `${key}="`;
  for (let from = 0; ;) {
    const i = s.indexOf(open, from);
    if (i < 0) return { rest: s, value: null };
    if (i > 0 && /\w/.test(s[i - 1])) { from = i + 1; continue; } // the key is a whole word
    const j = s.indexOf('"', i + open.length);
    if (j < 0) return { rest: s, value: null };
    return { rest: cutOut(s, i, j + 1), value: s.slice(i + open.length, j) };
  }
}

/** the part's own attributes: only these keys are known, anything else is refused with the list */
export function unknownKeys(attrs: Record<string, string>, known: string[], name: string): string[] {
  return Object.keys(attrs).filter((k) => k !== "id" && k !== "static" && k !== "llm" && !known.includes(k)).map((k) => `${name}: unknown key "${k}" (keys: #id, ${known.join(", ")})`);
}

// ---------- dates and zones (Intl only) ----------
export const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** true when `s` is a real calendar date, written YYYY-MM-DD */
export function isDate(s: string): boolean {
  const m = s.match(ISO_DATE);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
}
/** days since 1970-01-01 of an ISO date (a number to add to and compare) */
export const dayNum = (iso: string): number => { const m = iso.match(ISO_DATE)!; return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000); };
export const dayIso = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);
/** 0 = Monday ... 6 = Sunday */
export const weekdayOf = (iso: string): number => (((dayNum(iso) + 3) % 7) + 7) % 7;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "Mon 23 Nov 2026" */
export const dateWords = (iso: string): string => { const m = iso.match(ISO_DATE)!; return `${WEEKDAYS[weekdayOf(iso)]} ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`; };
/** minutes since midnight as "09:05" (1440 is "24:00") */
export const hm = (min: number): string => `${String(Math.floor(min / 60) % 24 === 0 && min >= 1440 ? 0 : Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export function parseTime(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}
/** is `tz` an IANA zone this runtime knows */
export function isZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/.test(tz) || tz === "UTC"; } catch { return false; }
}
const FMT = new Map<string, Intl.DateTimeFormat>();
function fmtOf(tz: string): Intl.DateTimeFormat {
  let f = FMT.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); FMT.set(tz, f); }
  return f;
}
/** the wall clock in `tz` at a UTC instant: { date: "2026-11-23", min: 540 } */
export function wall(ms: number, tz: string): { date: string; min: number } {
  const o: Record<string, string> = {};
  for (const p of fmtOf(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, min: +o.hour * 60 + +o.minute };
}
/** the UTC instant (ms) of a wall-clock date and minute in `tz` (a time that does not exist, in the hour a clock jumps, moves forward) */
export function instant(date: string, min: number, tz: string): number {
  const m = date.match(ISO_DATE)!;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0) + min * 60000;
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const w = wall(t, tz);
    const wm = dayNum(w.date) * 1440 + w.min, want = dayNum(date) * 1440 + min;
    if (wm === want) return t;
    t += (want - wm) * 60000;
  }
  return t;
}
/** "UTC-8" style label for the zone at an instant, for a popover */
export function zoneLabel(tz: string, ms: number): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? tz; } catch { return tz; }
}
