// The sparkline in a sentence (format version 11): `:spark[3,5,2,8,9]`, `:spark[3,5,2,8,9 bar good]`. An inline part (parts/inline.ts).
// The numbers are joined by commas; then, optionally, `line` or `bar` and one colour word. Pure: no DOM, no React.
import { defineInline } from "../inline";
import type { Budget } from "../../core/budget";

export const SPARK_COLOURS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc", "good", "warn", "bad", "muted"] as const;
export interface Spark { values: number[]; style: "line" | "bar"; colour: string }
export interface SparkState { cap: number }
const OPEN = ":spark[";
/** the longest number written out (digits, sign, point, exponent) */
const MAX_NUMBER = 32;

/** a number written out (sign, digits, one point, an exponent), read by a plain scan so that no pattern can backtrack over author text */
export function isNumberText(s: string): boolean {
  let i = 0;
  const n = s.length;
  if (s[i] === "+" || s[i] === "-") i++;
  let digits = 0;
  while (i < n && s[i] >= "0" && s[i] <= "9") { i++; digits++; }
  if (s[i] === ".") { i++; while (i < n && s[i] >= "0" && s[i] <= "9") { i++; digits++; } }
  if (!digits) return false;
  if (s[i] === "e" || s[i] === "E") { i++; if (s[i] === "+" || s[i] === "-") i++; let ed = 0; while (i < n && s[i] >= "0" && s[i] <= "9") { i++; ed++; } if (!ed) return false; }
  return i === n;
}
const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}...` : s);

/** The numbers, the style and the colour of the text inside :spark[...]; an error names the fix. One pass; charges one step per character. */
export function parseSpark(inner: string, cap: number, budget?: Budget): { spark?: Spark; error?: string } {
  budget?.charge(inner.length + 1);
  // the numbers end at each comma; the last one is followed by the words (a style and a colour)
  const toks: string[] = [];
  let count = 1, start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner.charCodeAt(i) !== 44) continue;
    count++;
    if (toks.length <= cap) toks.push(inner.slice(start, i).trim());
    start = i + 1;
  }
  if (count > cap) return { error: `:spark has ${count} numbers; at most ${cap} (a sparkline is a glance: aggregate the data)` };
  // the last piece: its first word is the last number, the rest are words
  const tail = inner.slice(start);
  const words: string[] = [];
  for (let i = 0, from = -1; i <= tail.length; i++) {
    const ws = i === tail.length || isWs(tail[i]);
    if (!ws && from < 0) from = i;
    else if (ws && from >= 0) { words.push(tail.slice(from, i)); from = -1; }
  }
  toks.push(words[0] ?? "");
  if (toks.length < 2) return { error: `:spark[${short(inner)}] needs at least 2 numbers joined by commas, like :spark[3,5,2,8,9]` };
  const values: number[] = [];
  for (const t of toks) {
    if (t.length > MAX_NUMBER || !isNumberText(t)) return { error: `:spark[${short(inner)}]: "${short(t)}" is not a number; write numbers joined by commas, then an optional style (line, bar) and colour (${SPARK_COLOURS.join(", ")})` };
    values.push(Number(t));
  }
  let style: "line" | "bar" = "line", colour = "acc";
  for (const w of words.slice(1)) {
    if (w === "line" || w === "bar") style = w;
    else if ((SPARK_COLOURS as readonly string[]).includes(w)) colour = w;
    else return { error: `:spark[${short(inner)}]: "${short(w)}" is not a style or colour; use line or bar, and one of ${SPARK_COLOURS.join(", ")}` };
  }
  return { spark: { values, style, colour } };
}

export default defineInline<SparkState, Spark>({
  name: "spark",
  // the marker ":spark[" is this part's own: it reads before the parts that match plain words
  rank: -1,
  prepare: (page) => ({ cap: page.limits.sparkValues }),
  scan(text, state, budget) {
    const hits: { from: number; to: number; data: Spark; problem?: string }[] = [];
    // the next "]": found once and kept while it is still ahead, so a text of many openers and no closer is read once
    let close = -2;
    for (let i = text.indexOf(OPEN); i >= 0;) {
      const s = i + OPEN.length;
      if (close !== -1 && close < s) close = text.indexOf("]", s);
      if (close === -1) break;
      const r = parseSpark(text.slice(s, close), state.cap, budget);
      hits.push({ from: i, to: close + 1, data: r.spark ?? { values: [], style: "line", colour: "acc" }, ...(r.error ? { problem: r.error } : {}) });
      i = text.indexOf(OPEN, close + 1);
    }
    return hits;
  },
  llm: (data, text) => (data.values.length ? `(${data.values.join(", ")})` : text),
});
