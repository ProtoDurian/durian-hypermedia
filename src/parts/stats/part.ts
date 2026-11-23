// The stats part (format version 11): stat tiles, the row of big numbers at the top of a dashboard. Each tile is one
// figure with its name, how it changed and, if given, a tiny line of its recent values. Pure.
//
//   ```stats title="The week"
//   Requests "1.2 M" change=+12% [good] note="last 7 days" spark=3 5 4 6 8 9
//   p95 latency "180 ms" change=-8% [good]
//   ```
//
// A line is `<name> "<value>" [change=<signed number>] [<colour>] [note="..."] [spark=<numbers>]` and may also take
// glyph="...", trend=up|down|flat and sub="...". The colour word in brackets says whether the change is good or bad (a
// fall in latency is good): it is never guessed from the sign. Hand scans only.
import { definePart } from "../types";
import { COLOUR_WORDS, isSpace, type Err } from "../kit/text";
import type { Budget } from "../../core/budget";

export const STAT_KEYS = ["change", "note", "spark", "glyph", "trend", "sub"];
export const STAT_ATTRS = ["id", "title", "static", "llm"];
export interface Tile { name: string; value: string; change: string; dir: "up" | "down" | "flat" | ""; colour: string; glyph?: string; trend?: "up" | "down" | "flat"; sub?: string; note: string; spark: number[]; line: number }
export interface StatsData { title: string; tiles: Tile[]; errors: Err[] }
export interface Lim { statsTiles: number; statsSpark: number; statsText: number; statsNote: number }

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isLower = (c: string | undefined) => c !== undefined && c >= "a" && c <= "z";
const isAlpha = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
const isSign = (c: string | undefined) => c === "-" || c === "−";
/** the end of the run of non-space characters that starts at `from` */
function wordEnd(t: string, from: number): number { let e = from; while (e < t.length && !isSpace(t[e])) e++; return e; }

/** a plain number: an optional minus, digits, an optional fraction (3, -2, 4.5) */
export function isNumWord(w: string): boolean {
  let i = isSign(w[0]) ? 1 : 0;
  const d0 = i;
  while (isDigit(w[i])) i++;
  if (i === d0) return false;
  if (w[i] === ".") { const f = ++i; while (isDigit(w[i])) i++; if (i === f) return false; }
  return i === w.length;
}
/** a change: an optional sign, a number (commas allowed in the whole part), at most one space, a unit of up to 6 letters or % */
export function isChange(w: string): boolean {
  let i = w[0] === "+" || isSign(w[0]) ? 1 : 0;
  if (!isDigit(w[i])) return false;
  i++;
  while (isDigit(w[i]) || w[i] === ",") i++;
  if (w[i] === ".") { const f = ++i; while (isDigit(w[i])) i++; if (i === f) return false; }
  if (isSpace(w[i])) i++;
  const u = i;
  while (i < w.length && (isAlpha(w[i]) || w[i] === "%")) i++;
  return i === w.length && i - u <= 6;
}
/** a change that is zero (0, 0.0, 0%) */
function isZero(w: string): boolean {
  let i = 0;
  while (w[i] === "0") i++;
  if (i === 0) return false;
  if (w[i] === ".") { i++; while (w[i] === "0") i++; }
  return !isDigit(w[i]) && w[i] !== ",";
}

export function parseStats(body: string, baseLine: number, attrs: Record<string, string>, lim: Lim, budget?: Budget): StatsData {
  const tiles: Tile[] = [], errors: Err[] = [];
  for (const k of Object.keys(attrs)) if (!STAT_ATTRS.includes(k)) errors.push({ line: baseLine - 1, msg: `unknown key "${k.slice(0, 40)}" (keys: title, static)` });
  let line = baseLine;
  for (let from = 0; from <= body.length; line++) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    const raw = body.slice(from, to);
    from = to + 1;
    budget?.charge(2 + (raw.length >> 4));
    const t = raw.trim();
    if (t && !t.startsWith("//")) {
      if (tiles.length >= lim.statsTiles) { errors.push({ line, msg: `more than ${lim.statsTiles} tiles; the most is ${lim.statsTiles}: split them into two stats blocks` }); break; }
      readTile(t, line, tiles, errors, lim, budget);
    }
    if (to === body.length) break;
  }
  if (!tiles.length && !errors.length) errors.push({ line: baseLine, msg: `stats has no tile: write one line per tile, like: Requests "1.2 M" change=+12% [good]` });
  return { title: attrs.title ?? "", tiles, errors };
}

function readTile(t: string, line: number, tiles: Tile[], errors: Err[], lim: Lim, budget?: Budget): void {
  const err = (msg: string) => errors.push({ line, msg });
  // the name runs up to the first quote that follows white space; the value is what is between that quote and the next
  let q = t.indexOf('"');
  while (q >= 0 && !(q > 0 && isSpace(t[q - 1]))) q = t.indexOf('"', q + 1);
  const close = q < 0 ? -1 : t.indexOf('"', q + 1);
  if (q < 0 || close < 0) { err(`a tile is: <name> "<value>" [change=+12%] [good] [note="..."] [spark=3 5 4 6]; got "${t.slice(0, 40)}"`); return; }
  budget?.charge(1, 1);
  const tile: Tile = { name: t.slice(0, q).trim(), value: t.slice(q + 1, close), change: "", dir: "", colour: "", note: "", spark: [], line };
  if (!tile.name || !tile.value.trim()) err("a tile needs a name before the quoted value, and a value in the quotes");
  if (tile.name.length > lim.statsText || tile.value.length > lim.statsText) err(`a tile's name and value are short (at most ${lim.statsText} characters)`);
  tiles.push(tile);
  const n = t.length;
  let p = close + 1;
  for (;;) {
    while (p < n && isSpace(t[p])) p++;
    if (p >= n) return;
    budget?.charge(1);
    const bad = () => err(`"${t.slice(p, Math.min(wordEnd(t, p), p + 40))}" is not a tile word: a colour in brackets ([good]), change=, note=, spark=, glyph=, trend= or sub=`);
    if (t[p] === "[") {
      const e = t.indexOf("]", p + 1);
      let ok = e > p + 1;
      for (let i = p + 1; ok && i < e; i++) if (!isLower(t[i]) && !isDigit(t[i])) ok = false;
      if (!ok) { bad(); return; }
      const w = t.slice(p + 1, e);
      p = e + 1;
      if (!COLOUR_WORDS.includes(w)) err(`[${w.slice(0, 40)}] is not a colour word (${COLOUR_WORDS.join(", ")}; never a hex value)`);
      else tile.colour = w;
      continue;
    }
    let k = p;
    while (isLower(t[k])) k++;
    if (k === p || t[k] !== "=") { bad(); return; }
    const key = t.slice(p, k);
    let val: string;
    p = k + 1;
    if (t[p] === '"') {
      const e = t.indexOf('"', p + 1);
      if (e < 0) { val = ""; } else { val = t.slice(p + 1, e); p = e + 1; }
    } else {
      let e = p;
      while (e < n && !isSpace(t[e]) && t[e] !== '"') e++;
      val = t.slice(p, e);
      p = e;
    }
    if (key === "change") {
      if (!isChange(val)) err(`change=${val.slice(0, 40)} is not a number with a sign (change=+12%, change=-8%, change=+0.1)`);
      else { tile.change = val; tile.dir = isSign(val[0]) ? "down" : val[0] === "+" ? "up" : isZero(val) ? "flat" : "up"; }
    } else if (key === "glyph" || key === "sub") {
      if (val.length > lim.statsText || !val.trim()) err(`${key}= needs 1 to ${lim.statsText} characters`);
      else tile[key] = val;
    } else if (key === "trend") {
      if (val !== "up" && val !== "down" && val !== "flat") err("trend= is up, down or flat");
      else tile.trend = val;
    } else if (key === "note") {
      if (val.length > lim.statsNote) err(`note= is at most ${lim.statsNote} characters`);
      else tile.note = val;
    } else if (key === "spark") {
      // the numbers are the words that follow, up to the next key or colour
      const vals: number[] = [];
      let count = 0, notNumber = false;
      const take = (w: string) => {
        count++;
        if (!isNumWord(w)) { notNumber = true; return; }
        if (vals.length < lim.statsSpark) { budget?.charge(1, 1); vals.push(Number(isSign(w[0]) ? "-" + w.slice(1) : w)); }
      };
      if (val) take(val);
      for (;;) {
        while (p < n && isSpace(t[p])) p++;
        const e = wordEnd(t, p);
        if (e === p) break;
        const w = t.slice(p, e);
        if (!isNumWord(w)) break;
        budget?.charge(1);
        take(w);
        p = e;
      }
      if (notNumber || vals.some((x) => !Number.isFinite(x))) err("spark= takes numbers separated by spaces (spark=3 5 4 6 8 9)");
      else if (count < 2) err("spark= needs at least 2 numbers");
      else if (count > lim.statsSpark) err(`spark= has ${count} numbers; the most is ${lim.statsSpark}`);
      else tile.spark = vals;
    } else err(`unknown key "${key.slice(0, 40)}" on a tile (keys: ${STAT_KEYS.join(", ")})`);
  }
}

/** LLM view: `- Requests: 1.2 M (+12%, last 7 days)`, one line a tile; the decorative glyph is left out */
export function statsLlm(d: StatsData): string {
  const lines = d.tiles.map((t) => {
    const bits = [t.change, t.note, t.sub, t.trend ? `trend ${t.trend}` : ""].filter(Boolean).join(", ");
    return `- ${t.name}: ${t.value}${bits ? ` (${bits})` : ""}`;
  });
  return d.title ? [`Stat tiles: ${d.title}${/[.!?]$/.test(d.title) ? "" : "."}`, ...lines].join("\n") : lines.join("\n");
}

export default definePart<StatsData>({
  name: "stats",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseStats(input.body, input.bodyLine, input.attrs, ctx.limits, ctx.budget),
  llm: (d) => statsLlm(d),
  check: (d) => d.errors.map((e) => ({ line: e.line, message: e.msg })),
});
