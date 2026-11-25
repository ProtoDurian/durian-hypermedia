// The weather part (format version 11): a forecast written in the source, units the reader switches. Pure.
//
//   ```weather place="San Francisco" unit=c tz=America/Los_Angeles
//   2026-11-22 sun 18/11 rain=0% wind=12km/h
//   2026-11-24 rain 14/9 rain=80% wind=30km/h precip=6mm note="Ferry may stop"
//   ```
//
// A line is a day (`<date> <sky> <high>/<low> ...`) or an hour (`<date> <time> <sky> <temp> ...`). Values are kept in the
// fence's units and converted when shown. Every scan is by hand (no regular expression over author text).
import { definePart } from "../types";
import type { Budget } from "../../core/budget";
import { isSpace } from "../kit/text";
import { dateWords, hm, isDate, isZone, parseTime } from "../kit/places";
import { DEFAULT_UNITS, PRESSURE_UNITS, RAIN_UNITS, SKIES, SKY_WORDS, TEMP_UNITS, UNIT_WORDS, WIND_UNITS, showPressure, showRain, showTemp, showWind, type Sky, type Units } from "./units";

export const WX_KEYS = ["title", "place", "unit", "wind", "rain", "pressure", "tz"];
export type WxErr = { line: number; msg: string };
export type WxRow = { line: number; date: string; time: string | null; sky: Sky; hi: number; lo: number | null; chance: number | null; wind: number | null; precip: number | null; pressure: number | null; note: string };
export type WxSpec = { title: string; place: string; tz: string; units: Units; kind: "day" | "hour"; rows: WxRow[]; errors: WxErr[] };
export type WxLim = { weatherRows: number; weatherLineChars: number; weatherNoteChars: number };

const WIND_SUFFIX: Record<string, string> = { "km/h": "kmh", kmh: "kmh", mph: "mph", "m/s": "ms", ms: "ms", kn: "kn", kt: "kn" };
const PRESS_SUFFIX: Record<string, string> = { hpa: "hpa", inhg: "inhg" };
const MAX_DIGITS = 9;

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
/** `[+-]digits[.digits]` at the start of s: the number and what follows it; null when s does not start with one */
function takeNumber(s: string): { value: number; rest: string; digits: number } | null {
  let i = 0;
  if (s[i] === "+" || s[i] === "-") i++;
  const d0 = i;
  while (isDigit(s[i])) i++;
  if (i === d0) return null;
  let digits = i - d0;
  if (s[i] === "." && isDigit(s[i + 1])) { i++; const f0 = i; while (isDigit(s[i])) i++; digits += i - f0; }
  return { value: Number(s.slice(0, i)), rest: s.slice(i), digits };
}
/** a whole number of exactly h:mm or hh:mm */
const looksLikeTime = (s: string) => { const k = s.indexOf(":"); return (k === 1 || k === 2) && s.length === k + 3 && isDigit(s[k + 1]) && isDigit(s[k + 2]) && [...s.slice(0, k)].every(isDigit); };
/** the words of a line (split at white space), linear */
function words(s: string): string[] { const out: string[] = []; let from = -1; for (let i = 0; i <= s.length; i++) { const sp = i === s.length || isSpace(s[i]); if (sp) { if (from >= 0) out.push(s.slice(from, i)); from = -1; } else if (from < 0) from = i; } return out; }
/** `note="..."` anywhere in the line (after a space or at its start): the text and the line without it; `open` is true when the quote never closes */
function takeNote(t: string): { rest: string; note: string | null; open: boolean } {
  let from = 0;
  for (;;) {
    const k = t.indexOf('note="', from);
    if (k < 0) return { rest: t, note: null, open: false };
    if (k === 0 || isSpace(t[k - 1])) {
      const end = t.indexOf('"', k + 6);
      if (end < 0) return { rest: t, note: null, open: true };
      return { rest: `${t.slice(0, k)} ${t.slice(end + 1)}`, note: t.slice(k + 6, end), open: false };
    }
    from = k + 6;
  }
}

export function parseWeather(input: { body: string; bodyLine: number; steps: unknown[]; attrs: Record<string, string> }, lim: WxLim, budget?: Budget): WxSpec {
  const errors: WxErr[] = [];
  const a = input.attrs;
  const spec: WxSpec = { title: a.title ?? "", place: a.place ?? "", tz: a.tz ?? "UTC", units: { ...DEFAULT_UNITS }, kind: "day", rows: [], errors };
  const err = (line: number, msg: string) => errors.push({ line, msg });
  for (const k of Object.keys(a)) if (k !== "id" && k !== "static" && !WX_KEYS.includes(k)) err(0, `unknown key "${k}" (keys: #id, ${WX_KEYS.join(", ")})`);
  const unitKey = (key: string, field: keyof Units, list: string[]) => {
    if (a[key] === undefined) return;
    const v = a[key].toLowerCase();
    if (!list.includes(v)) err(0, `unknown unit ${key}=${a[key]}; the units are ${list.join(", ")}`); else spec.units[field] = v;
  };
  unitKey("unit", "temp", TEMP_UNITS); unitKey("wind", "wind", WIND_UNITS); unitKey("rain", "rain", RAIN_UNITS); unitKey("pressure", "pressure", PRESSURE_UNITS);
  if (a.tz !== undefined && !isZone(a.tz)) err(0, `unknown time zone "${a.tz}"; use an IANA name like America/Los_Angeles`);
  if (input.steps.length) err(0, `weather takes no @step lines`);

  const kinds = new Set<string>();
  let rows = 0, tooMany = false, from = 0, line = input.bodyLine;
  const body = input.body;
  for (; from <= body.length; line++) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    const raw = body.slice(from, to);
    from = to + 1;
    budget?.charge(1 + (raw.length >> 4), 0, 0);
    const last = to === body.length;
    let t = raw.trim();
    if (t && !t.startsWith("//") && !tooMany) {
      if (++rows > lim.weatherRows) { tooMany = true; err(line, `more than ${lim.weatherRows} forecast lines; the cap is ${lim.weatherRows}: split it into two weather parts`); }
      else if (t.length > lim.weatherLineChars) err(line, `a forecast line of ${t.length} characters; the cap is ${lim.weatherLineChars}: shorten the note`);
      else {
        const nt = takeNote(t); t = nt.rest;
        if (nt.open) err(line, `note=" has no closing quote; write note="text"`);
        else if (nt.note !== null && nt.note.length > lim.weatherNoteChars) err(line, `a note of ${nt.note.length} characters; the cap is ${lim.weatherNoteChars}: shorten it`);
        const row = parseLine(words(t), nt.note ?? "", line, spec, err, budget);
        if (row) { kinds.add(row.time === null ? "day" : "hour"); spec.rows.push(row); }
      }
    }
    if (last) break;
  }
  if (kinds.size > 1) err(input.bodyLine, `a part shows days or hours, not both; write two weather parts`);
  spec.kind = kinds.has("hour") ? "hour" : "day";
  if (!spec.rows.length && !errors.length) err(input.bodyLine, `weather has no forecast lines; write one per day, like: 2026-11-22 sun 18/11 rain=0% wind=12km/h`);
  return spec;
}

function parseLine(toks: string[], note: string, line: number, spec: WxSpec, err: (line: number, msg: string) => void, budget?: Budget): WxRow | null {
  budget?.charge(toks.length, 1, 0);
  const date = toks.shift() ?? "";
  if (!isDate(date)) { err(line, `"${date.slice(0, 20)}" is not an ISO date; a line starts with a date like 2026-11-22`); return null; }
  let time: string | null = null;
  if (toks[0] !== undefined && looksLikeTime(toks[0])) {
    const m = parseTime(toks[0]);
    if (m === null) { err(line, `"${toks[0]}" is not a 24-hour time; write 14:30`); return null; }
    time = hm(m); toks.shift();
  }
  const sky = toks.shift();
  if (!sky || !(SKIES as readonly string[]).includes(sky)) { err(line, `unknown sky "${(sky ?? "").slice(0, 20)}"; the skies are ${SKIES.join(", ")}`); return null; }
  const tempTok = toks.shift() ?? "";
  // a temperature: a number, then an optional °C or °F (or C, F) that must be the fence's unit
  const temp = (s: string, what: string): number => {
    const n = takeNumber(s);
    const u = n ? n.rest.replace("°", "").toLowerCase() : "";
    if (!n || n.digits > MAX_DIGITS || (u !== "" && u !== "c" && u !== "f")) { err(line, `"${s.slice(0, 20)}" is not a ${what}; write a number like 18`); return NaN; }
    if (u && u !== spec.units.temp) err(line, `${s} is in °${u.toUpperCase()} but this part's unit is ${UNIT_WORDS[spec.units.temp]}; write one unit per part (the reader switches units on the page)`);
    return n.value;
  };
  let hi = NaN, lo: number | null = null;
  if (time === null) {
    const k = tempTok.indexOf("/");
    if (k < 0 || tempTok.indexOf("/", k + 1) >= 0) { err(line, `a day line has a high and a low like 18/11; got "${tempTok.slice(0, 20)}"`); return null; }
    hi = temp(tempTok.slice(0, k), "high"); lo = temp(tempTok.slice(k + 1), "low");
    if (Number.isFinite(hi) && Number.isFinite(lo) && (lo as number) > hi) err(line, `the low (${lo}) is above the high (${hi}); write the high first, like 18/11`);
    if (!Number.isFinite(lo)) lo = null;
  } else {
    if (tempTok.includes("/")) { err(line, `an hour line has one temperature like 14; got "${tempTok.slice(0, 20)}"`); return null; }
    hi = temp(tempTok, "temperature");
  }
  if (!Number.isFinite(hi)) return null;
  const row: WxRow = { line, date, time, sky: sky as Sky, hi, lo, chance: null, wind: null, precip: null, pressure: null, note };
  for (const o of toks) {
    if (o.startsWith("rain=")) {
      const n = takeNumber(o.slice(5));
      if (!n || n.rest !== "%" || n.digits > MAX_DIGITS) err(line, `rain=... is a chance like rain=40%; got "${o.slice(0, 20)}"`);
      else { row.chance = n.value; if (n.value < 0 || n.value > 100) err(line, `rain=${n.value}% is over 100%; a chance is 0 to 100`); }
    } else if (o.startsWith("wind=")) {
      const n = takeNumber(o.slice(5));
      if (!n || n.digits > MAX_DIGITS) { err(line, `wind=... is a speed like wind=12km/h; got "${o.slice(0, 20)}"`); continue; }
      const u = n.rest === "" ? "" : WIND_SUFFIX[n.rest.toLowerCase()];
      if (u === undefined) err(line, `unknown wind unit "${n.rest.slice(0, 12)}"; the units are km/h, mph, m/s, kn`);
      else {
        if (u !== "" && u !== spec.units.wind) err(line, `wind=${n.value}${n.rest} is not in this part's wind unit (${UNIT_WORDS[spec.units.wind]}); write one unit per part, or set wind=${u} on the fence`);
        if (n.value < 0) err(line, `a wind speed cannot be below 0`);
        row.wind = n.value;
      }
    } else if (o.startsWith("precip=")) {
      const n = takeNumber(o.slice(7));
      const u = n ? n.rest.toLowerCase() : "";
      if (!n || n.digits > MAX_DIGITS || (u !== "" && !RAIN_UNITS.includes(u))) { err(line, `precip=... is an amount like precip=6mm; got "${o.slice(0, 20)}"`); continue; }
      if (u && u !== spec.units.rain) err(line, `precip=${n.value}${n.rest} is not in this part's rain unit (${spec.units.rain}); write one unit per part, or set rain=${u} on the fence`);
      if (n.value < 0) err(line, `a rain amount cannot be below 0`);
      row.precip = n.value;
    } else if (o.startsWith("pressure=")) {
      const n = takeNumber(o.slice(9));
      if (!n || n.digits > MAX_DIGITS) { err(line, `pressure=... is a number like pressure=1013hPa; got "${o.slice(0, 20)}"`); continue; }
      const u = n.rest === "" ? "" : PRESS_SUFFIX[n.rest.toLowerCase()];
      if (u === undefined) { err(line, `unknown pressure unit "${n.rest.slice(0, 12)}"; the units are hPa, inHg`); continue; }
      if (u !== "" && u !== spec.units.pressure) err(line, `pressure=${n.value}${n.rest} is not in this part's pressure unit (${UNIT_WORDS[spec.units.pressure]}); write one unit per part, or set pressure=${u} on the fence`);
      row.pressure = n.value;
    } else err(line, `cannot read "${o.slice(0, 20)}"; a line may have rain=<n>%, wind=<n><unit>, precip=<n><unit>, pressure=<n><unit> and note="..."`);
  }
  return row;
}

// ---------- the LLM view: always °C and °F ----------
const both = (v: number, u: Units) => `${showTemp(v, u.temp, "c")} (${showTemp(v, u.temp, "f")})`;
export function weatherLlm(spec: WxSpec): string {
  const u = spec.units;
  const head = `Weather${spec.place ? `: ${spec.place}` : ""}${spec.title ? ` (${spec.title})` : ""}${spec.tz !== "UTC" ? `, times in ${spec.tz}` : ""}. Temperatures are given in °C and °F.`;
  const hasPressure = spec.rows.some((r) => r.pressure !== null);
  const when = (r: WxRow) => (r.time ? `${dateWords(r.date)} ${r.time}` : dateWords(r.date));
  const cell = (s: string) => s.split("|").join("\\|").split("\n").join(" ");
  const rainCell = (r: WxRow) => [r.chance !== null ? `${r.chance}%` : "", r.precip !== null ? showRain(r.precip, u.rain, u.rain) : ""].filter(Boolean).join(", ") || "-";
  const heads = [spec.kind === "day" ? "day" : "time", "sky", spec.kind === "day" ? "high / low" : "temperature", "rain", "wind", ...(hasPressure ? ["pressure"] : [])];
  const rows = spec.rows.map((r) => {
    const t = r.lo === null ? both(r.hi, u) : `${both(r.hi, u)} / ${both(r.lo, u)}`;
    const cells = [when(r), SKY_WORDS[r.sky], t, rainCell(r), r.wind !== null ? showWind(r.wind, u.wind, u.wind) : "-"];
    if (hasPressure) cells.push(r.pressure !== null ? showPressure(r.pressure, u.pressure, u.pressure) : "-");
    return `| ${cells.map(cell).join(" | ")} |`;
  });
  const notes = spec.rows.filter((r) => r.note).map((r) => `- ${when(r)}: ${r.note}`);
  return [head, "", `| ${heads.join(" | ")} |`, `| ${heads.map(() => "---").join(" | ")} |`, ...rows, ...(notes.length ? ["", "Notes:", ...notes] : [])].join("\n");
}

export default definePart<WxSpec>({
  name: "weather",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseWeather(input, ctx.limits as unknown as WxLim, ctx.budget),
  llm: (s) => weatherLlm(s),
  check: (s) => s.errors.map((e) => ({ line: e.line || undefined, message: e.msg })),
});
