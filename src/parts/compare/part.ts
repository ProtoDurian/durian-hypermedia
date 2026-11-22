// The compare part (format version 11): a comparison matrix. One criterion a line, one value per option. Pure.
//
//   ```compare title="Which queue?" winner=on pick=Kafka
//   options: Redis Streams, Kafka [c2], SQS
//   Ordering: yes, yes, partial (FIFO queues only)
//   Throughput: 3, 5, 3 (score 1-5)
//   Latency (lower is better): 12 ms, 8 ms, 30 ms
//   Cost at our size: good, bad, good
//   ```
//
// A value is yes / no / partial, good / warn / bad, a number (a score, with an optional unit), a word, or - for "no
// data". A note in round brackets after a value shows on hover, focus or tap. One row has one kind of value.
// Every scan over author text is a hand scan (no regular expression), and every loop charges the part's budget.
import { definePart } from "../types";
import { isSpace, mdTable, type Err } from "../kit/text";
import type { Budget } from "../../core/budget";

export const COMPARE_KEYS = ["id", "title", "winner", "pick", "view", "llm", "static"];
export const COMPARE_COLOURS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc"];
export type Kind = "bool" | "tone" | "score" | "word";
export interface Cell { text: string; note: string; kind: Kind | "none"; num: number | null; unit: string }
export interface Row { name: string; line: number; kind: Kind; cells: Cell[]; lower: boolean; scale: [number, number] | null; best: number[] }
export interface CompareMatrix { options: { name: string; colour: string }[]; rows: Row[]; winner: boolean; pick: number; view: "table" | "single"; wins: number[]; mostWins: number }
export interface CompareData { title: string; compare: CompareMatrix | null; errors: Err[] }
export interface Lim { compareOptions: number; compareRows: number; compareValue: number; compareNote: number; compareName: number }

const BOOL = ["yes", "no", "partial"], TONE = ["good", "warn", "bad"];
const LOWER = "lower is better";

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isWordChar = (c: string | undefined) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || isDigit(c) || c === "_");
const skipSpaces = (s: string, i: number) => { while (i < s.length && isSpace(s[i])) i++; return i; };

/** Split at commas that are not inside round brackets, giving up after `max` pieces (the rest is dropped: `more` says so). */
export function splitTop(s: string, max = Infinity): { parts: string[]; more: boolean } {
  const out: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") { if (depth > 0) depth--; }
    else if (ch === "," && depth === 0) {
      if (out.length >= max) return { parts: out, more: true };
      out.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  if (out.length >= max) return { parts: out, more: true };
  out.push(s.slice(from).trim());
  return { parts: out, more: false };
}

/** "value (note)": the note is the last round-bracketed group at the end, holding no bracket of its own. One scan from the end. */
export function splitNote(raw: string): { text: string; note: string | null } {
  const t = raw.trimEnd();
  if (!t.endsWith(")")) return { text: raw.trim(), note: null };
  const i = t.lastIndexOf("(");
  if (i < 0 || t.indexOf(")", i) !== t.length - 1) return { text: raw.trim(), note: null };
  return { text: t.slice(0, i).trim(), note: t.slice(i + 1, -1).trim() };
}

/** a number as the scores write it: [-+−]digits[.digits], then optional spaces and a unit of up to 6 letters or % */
export function numberOf(text: string): { num: number; unit: string } | null {
  let i = 0;
  const neg = text[0] === "-" || text[0] === "−";
  if (neg || text[0] === "+") i++;
  const d0 = i;
  while (isDigit(text[i])) i++;
  if (i === d0) return null;
  if (text[i] === "." && isDigit(text[i + 1])) { i++; while (isDigit(text[i])) i++; }
  const num = Number(text.slice(d0, i));
  i = skipSpaces(text, i);
  const u0 = i;
  while (i < text.length && i - u0 < 7 && ((text[i] >= "a" && text[i] <= "z") || (text[i] >= "A" && text[i] <= "Z") || text[i] === "%")) i++;
  if (i !== text.length || i - u0 > 6) return null;
  return { num: neg ? -num : num, unit: text.slice(u0) };
}

/** the index of a phrase (any case) in a short text, or -1; a scan that never allocates more than the phrase */
function phraseAt(s: string, phrase: string, from = 0): number {
  for (let i = from; i + phrase.length <= s.length; i++) if (s.slice(i, i + phrase.length).toLowerCase() === phrase) return i;
  return -1;
}
/** the text without the phrase, with one separator (from `seps`) and the spaces either side of it taken too; null when absent */
function without(s: string, phrase: string, seps: string): string | null {
  const i = phraseAt(s, phrase);
  if (i < 0) return null;
  let a = i, b = i + phrase.length;
  while (a > 0 && isSpace(s[a - 1])) a--;
  if (a > 0 && seps.includes(s[a - 1])) a--;
  while (b < s.length && isSpace(s[b])) b++;
  if (b < s.length && seps.includes(s[b])) b++;
  return (s.slice(0, a) + s.slice(b)).trim();
}
const trimSeps = (s: string) => { let a = 0, b = s.length; while (a < b && (isSpace(s[a]) || s[a] === "," || s[a] === ";")) a++; while (b > a && (isSpace(s[b - 1]) || s[b - 1] === "," || s[b - 1] === ";")) b--; return s.slice(a, b); };

/** `score 1-5` (or `score 1 to 5`) inside a note: the scale and the note without it */
export function scaleIn(note: string): { lo: string; hi: string; rest: string } | null {
  for (let i = phraseAt(note, "score"); i >= 0; i = phraseAt(note, "score", i + 1)) {
    if (i > 0 && isWordChar(note[i - 1])) continue;
    let j = i + 5;
    if (!isSpace(note[j])) continue;
    j = skipSpaces(note, j);
    const a = readNum(note, j);
    if (!a) continue;
    j = skipSpaces(note, a.end);
    if (note[j] === "-" || note[j] === "–") j++;
    else if (note.slice(j, j + 2).toLowerCase() === "to") j += 2;
    else continue;
    j = skipSpaces(note, j);
    const b = readNum(note, j);
    if (!b) continue;
    return { lo: a.text, hi: b.text, rest: trimSeps(note.slice(0, i) + note.slice(b.end)) };
  }
  return null;
}
function readNum(s: string, i: number): { text: string; end: number } | null {
  const a = i;
  if (s[i] === "-") i++;
  const d = i;
  while (isDigit(s[i])) i++;
  if (i === d) return null;
  if (s[i] === "." && isDigit(s[i + 1])) { i++; while (isDigit(s[i])) i++; }
  return { text: s.slice(a, i), end: i };
}

function cellOf(raw: string, lim: Lim): { cell?: Cell; err?: string } {
  const sn = splitNote(raw);
  const text = sn.text, note = sn.note ?? "";
  if (!text) return { err: `a value is empty${note ? ` (only the note "${note}")` : ""}; write the value first, then the note in round brackets; "-" means no data` };
  if (text.length > lim.compareValue) return { err: `a value is at most ${lim.compareValue} characters` };
  if (note.length > lim.compareNote) return { err: `a note is at most ${lim.compareNote} characters` };
  const low = text.toLowerCase();
  if (text === "-" || low === "n/a") return { cell: { text: "–", note, kind: "none", num: null, unit: "" } };
  if (BOOL.includes(low)) return { cell: { text: low, note, kind: "bool", num: null, unit: "" } };
  if (TONE.includes(low)) return { cell: { text: low, note, kind: "tone", num: null, unit: "" } };
  const n = numberOf(text);
  if (n) return { cell: { text, note, kind: "score", num: n.num, unit: n.unit } };
  return { cell: { text, note, kind: "word", num: null, unit: "" } };
}

const kindName: Record<string, string> = { bool: "yes/no/partial", tone: "good/warn/bad", score: "a number", word: "a word" };

export function parseCompare(body: string, bodyLine: number, line: number, attrs: Record<string, string>, lim: Lim, budget?: Budget): CompareData {
  const errors: Err[] = [];
  const title = attrs.title ?? "";
  for (const k of Object.keys(attrs)) if (!COMPARE_KEYS.includes(k)) errors.push({ line, msg: `unknown key "${k.slice(0, 40)}" (keys: ${COMPARE_KEYS.filter((x) => x !== "id").join(", ")})` });
  let options: CompareMatrix["options"] | null = null;
  const rows: Row[] = [];
  let at = bodyLine;
  for (let from = 0; from <= body.length; at++) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    const raw = body.slice(from, to);
    from = to + 1;
    budget?.charge(1 + (raw.length >> 4));
    const t = raw.trim();
    if (!t || t.startsWith("//")) { if (to === body.length) break; continue; }
    const colon = t.indexOf(":");
    if (colon <= 0) { errors.push({ line: at, msg: `a line is "<criterion>: <value>, <value>, ..." (the first line is "options: A, B, C"); got "${t.slice(0, 40)}"` }); if (to === body.length) break; continue; }
    const head = t.slice(0, colon).trim(), rest = t.slice(colon + 1).trim();
    if (!options) {
      if (head.toLowerCase() !== "options") { errors.push({ line: at, msg: `the first line is "options: A, B, C" (the columns); got "${head.slice(0, 40)}:"` }); options = []; if (to === body.length) break; continue; }
      const sp = splitTop(rest, lim.compareOptions + 1);
      budget?.charge(sp.parts.length, sp.parts.length);
      options = sp.parts.map((v) => { const e = v.trimEnd(), i = e.lastIndexOf("["); return e.endsWith("]") && i >= 0 ? { name: e.slice(0, i).trim(), colour: e.slice(i + 1, -1).trim() } : { name: v, colour: "" }; });
      if (options.length < 2) errors.push({ line: at, msg: `compare needs at least 2 options (options: A, B)` });
      if (sp.more || options.length > lim.compareOptions) errors.push({ line: at, msg: `more than ${lim.compareOptions} options; the most is ${lim.compareOptions}: split the comparison` });
      const seen = new Set<string>();
      for (const o of options) {
        if (!o.name) errors.push({ line: at, msg: `an option has no name (a comma too many?)` });
        else if (o.name.length > lim.compareName) errors.push({ line: at, msg: `an option name is at most ${lim.compareName} characters` });
        if (o.colour && !COMPARE_COLOURS.includes(o.colour)) errors.push({ line: at, msg: `[${o.colour.slice(0, 20)}] is not a colour word for an option (${COMPARE_COLOURS.map((c) => `[${c}]`).join(" ")}; never a hex value)` });
        const key = o.name.toLowerCase();
        if (seen.has(key)) errors.push({ line: at, msg: `the option "${o.name.slice(0, 40)}" is listed twice` });
        seen.add(key);
      }
      if (to === body.length) break;
      continue;
    }
    // a criterion row
    if (rows.length >= lim.compareRows) { errors.push({ line: at, msg: `more than ${lim.compareRows} rows; the most is ${lim.compareRows}: split the comparison` }); break; }
    let name = head, lower = false;
    {
      const sn = splitNote(head);
      if (sn.note !== null && sn.note.length <= lim.compareNote && phraseAt(sn.note, LOWER) >= 0) {
        lower = true;
        const left = without(sn.note, LOWER, ",") ?? "";
        name = left ? `${sn.text} (${left})` : sn.text;
      }
    }
    if (!name) { errors.push({ line: at, msg: `a row needs a criterion name before the colon` }); if (to === body.length) break; continue; }
    if (name.length > lim.compareName) { errors.push({ line: at, msg: `a criterion name is at most ${lim.compareName} characters` }); if (to === body.length) break; continue; }
    const sp = splitTop(rest, options.length);
    const vals = sp.parts;
    budget?.charge(vals.length, vals.length);
    const done = () => to === body.length;
    if (sp.more || vals.length !== options.length) {
      errors.push({ line: at, msg: `"${name}" has ${sp.more ? "more than " + options.length : vals.length} value${vals.length === 1 && !sp.more ? "" : "s"} but there are ${options.length} options (${options.map((o) => o.name).join(", ").slice(0, 120)}); one value per option, in the same order` });
      if (done()) break;
      continue;
    }
    const cells: Cell[] = []; let bad = false;
    for (const v of vals) { const r = cellOf(v, lim); if (r.err) { errors.push({ line: at, msg: `"${name}": ${r.err}` }); bad = true; break; } cells.push(r.cell!); }
    if (bad) { if (done()) break; continue; }
    const kinds = [...new Set(cells.filter((c) => c.kind !== "none").map((c) => c.kind as Kind))];
    if (kinds.length > 1) {
      const ex = kinds.map((k) => `"${cells.find((c) => c.kind === k)!.text.slice(0, 40)}" is ${kindName[k]}`).join(" but ");
      errors.push({ line: at, msg: `"${name}" mixes kinds of value in one row: ${ex}; one row holds one kind (all yes/no/partial, all good/warn/bad, all numbers, or all words)` });
      if (done()) break;
      continue;
    }
    let scale: [number, number] | null = null;
    for (const c of cells) {
      const nl = without(c.note, LOWER, ",;");
      if (nl !== null) { lower = true; c.note = nl; }
      const s = scaleIn(c.note);
      if (s) {
        const lo = Number(s.lo), hi = Number(s.hi);
        if (!(hi > lo)) errors.push({ line: at, msg: `"${name}": the scale "score ${s.lo}-${s.hi}" must go up (score 1-5)` });
        else scale = [lo, hi];
        c.note = s.rest;
      }
    }
    const kind: Kind = kinds[0] ?? "word";
    if (kind === "score" && scale) for (const c of cells) if (c.num != null && (c.num < scale[0] || c.num > scale[1])) errors.push({ line: at, msg: `"${name}": ${c.text} is outside its scale ${scale[0]}-${scale[1]}` });
    rows.push({ name, line: at, kind, cells, lower, scale, best: [] });
    if (done()) break;
  }
  if (!options) { errors.push({ line: bodyLine, msg: `compare needs a first line "options: A, B, C" and then one line per criterion` }); return { title, compare: null, errors }; }
  if (!rows.length && !errors.length) errors.push({ line: bodyLine, msg: `compare has no criterion line; write one like: Ordering: yes, no, partial` });
  if (attrs.winner && !["on", "off"].includes(attrs.winner)) errors.push({ line, msg: `winner= is on or off` });
  if (attrs.view && !["table", "single"].includes(attrs.view)) errors.push({ line, msg: `view= is table (all options in columns) or single (one option at a time)` });
  let pick = -1;
  if (attrs.pick) { pick = options.findIndex((o) => o.name.toLowerCase() === attrs.pick.toLowerCase()); if (pick < 0) errors.push({ line, msg: `pick="${attrs.pick.slice(0, 40)}" is not one of the options (${options.map((o) => o.name).join(", ").slice(0, 120)})` }); }
  // the best value of every scored or yes/no (and good/warn/bad) row; a row where every value is alike has no best
  const wins = options.map(() => 0);
  for (const r of rows) {
    budget?.charge(1 + r.cells.length, 0);
    let score: (c: Cell) => number | null;
    if (r.kind === "score") score = (c) => (c.num == null ? null : r.lower ? -c.num : c.num);
    else if (r.kind === "bool") score = (c) => (c.kind === "none" ? null : c.text === "yes" ? 2 : c.text === "partial" ? 1 : 0);
    else if (r.kind === "tone") score = (c) => (c.kind === "none" ? null : c.text === "good" ? 2 : c.text === "warn" ? 1 : 0);
    else continue;
    const sc = r.cells.map(score), have = sc.filter((x): x is number => x != null);
    if (!have.length) continue;
    const top = Math.max(...have);
    if (have.every((x) => x === top)) continue;
    r.best = sc.map((x, i) => (x === top ? i : -1)).filter((i) => i >= 0);
    for (const i of r.best) wins[i]++;
  }
  const most = wins.length ? Math.max(...wins) : 0;
  const mostWins = most > 0 && wins.filter((w) => w === most).length === 1 ? wins.indexOf(most) : -1;
  return { title, compare: { options, rows, winner: attrs.winner === "on", pick, view: attrs.view === "single" ? "single" : "table", wins, mostWins }, errors };
}

/** The LLM view: a Markdown table, options as columns, notes kept; with winner=on the best value of a row is bold. A body
 *  that did not read stays a code block as written. */
export function compareLlm(d: CompareData, body: string): string {
  const c = d.compare;
  if (!c || d.errors.length) return "```compare\n" + body.replace(/\n+$/, "") + "\n```";
  const cols = [d.title || "Criterion", ...c.options.map((o) => o.name)];
  const rows = c.rows.map((r) => [`${r.name}${r.lower ? " (lower is better)" : ""}`, ...r.cells.map((x, i) => { const t = x.note ? `${x.text} (${x.note})` : x.text; return c.winner && r.best.includes(i) ? `**${t}**` : t; })]);
  return mdTable(cols, rows);
}

export default definePart<CompareData>({
  name: "compare",
  form: "fenced",
  steps: false,
  llmKind: "own",
  parse: (input, ctx) => parseCompare(input.body, input.bodyLine, input.line, input.attrs, ctx.limits, ctx.budget),
  llm: (d, input) => compareLlm(d, input.body),
  check: (d) => d.errors.map((e) => ({ line: e.line, message: e.msg })),
});
