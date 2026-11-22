// The timeline part (format version 11): `<date or year> <title> [colour] note="..."`, one a line, indented lines as
// detail. Pure: the parser and the LLM view; the cards are drawn as HTML by the view. Every scan is by hand.
//
//   ```timeline title="A release plan"
//   2026-05-04 Design review [c1]
//     Scope and owners agreed
//   2026-11-23 Version 2 ships [good] note="the big one"
//   ```
import { definePart } from "../types";
import { COLOUR_WORDS, indentOf, isSpace, scanLines, type Err, type StepInfo } from "../kit/text";
import type { Budget } from "../../core/budget";

export interface TlEvent { date: string; title: string; colour: string; note: string; detail: string[]; step: number; line: number }
export interface TlSpec { title: string; across: boolean; events: TlEvent[]; steps: StepInfo[]; errors: Err[]; warnings: Err[]; attrs: string[] }
export interface TimelineLimits { timelineEvents: number }

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const digits = (t: string, at: number, n: number) => { for (let i = 0; i < n; i++) if (!isDigit(t[at + i])) return false; return true; };
/** `2026`, `2026-11` or `2026-11-23`, a space, then the rest (non-empty): [date, rest]; null when the line does not start so */
export function dateLine(t: string): [string, string] | null {
  if (!digits(t, 0, 4)) return null;
  let e = 4;
  if (t[e] === "-" && digits(t, e + 1, 2)) { e += 3; if (t[e] === "-" && digits(t, e + 1, 2)) e += 3; }
  if (!isSpace(t[e])) return null;
  let r = e; while (r < t.length && isSpace(t[r])) r++;
  return r < t.length ? [t.slice(0, e), t.slice(r)] : null;
}
/** `... note="words"` or `... note=word` at the end of the line: [the note, the text before it], by a hand scan */
export function noteAtEnd(rest: string): [string, string] | null {
  const r = rest.trimEnd();
  if (r.endsWith("\"") && r.length > 1) {
    const q = r.lastIndexOf("\"", r.length - 2);
    if (q >= 6 && r.slice(q - 5, q) === "note=" && isSpace(r[q - 6])) return [r.slice(q + 1, -1), r.slice(0, q - 5)];
  }
  let k = r.length; while (k > 0 && !isSpace(r[k - 1])) k--;
  const word = r.slice(k);
  return k > 0 && word.startsWith("note=") && word.length > 5 ? [word.slice(5), r.slice(0, k)] : null;
}
/** "head [colour]" -> head and colour (lower case, "" when none); the bracket must be last: a hand scan, the last non-space
 *  character is "]", and its "[" is the first one after the "]" before it */
export function takeColour(s: string): { head: string; colour: string; raw: string; has: boolean } {
  let end = s.length;
  while (end > 0 && isSpace(s[end - 1])) end--;
  const close = end - 1, open = close > 0 && s[close] === "]" ? s.indexOf("[", s.lastIndexOf("]", close - 1) + 1) : -1;
  if (open < 0 || open >= close) return { head: s.trim(), colour: "", raw: "", has: false };
  const raw = s.slice(open + 1, close).trim();
  return { head: s.slice(0, open).trim(), colour: raw.toLowerCase(), raw, has: true };
}

export function parseTimeline(body: string, baseLine: number, title: string, across: boolean, lim: TimelineLimits, budget?: Budget): TlSpec {
  const errors: Err[] = [], warnings: Err[] = [];
  const { lines, steps } = scanLines(body, baseLine, budget);
  const events: TlEvent[] = [];
  for (const l of lines) {
    budget?.charge(2, 1);
    const indent = indentOf(l.text), t = l.text.trim();
    if (indent > 0) {
      const last = events[events.length - 1];
      if (!last) errors.push({ line: l.line, msg: `an indented line is a detail of the event above it; there is no event above this one` }); else last.detail.push(t);
      continue;
    }
    const m = dateLine(t);
    if (!m) { errors.push({ line: l.line, msg: `"${t.slice(0, 40)}" does not start with a date; write: 2026-11-23 What happened (a year 2026, a month 2026-11 or a day 2026-11-23)` }); continue; }
    let tail = m[1], note = "";   // (m[0] is the date, m[1] the rest of the line)
    const nm = noteAtEnd(tail);
    if (nm) { note = nm[0]; tail = nm[1]; }
    const c = takeColour(tail);
    let colour = "";
    if (c.has) {
      if (!COLOUR_WORDS.includes(c.colour)) errors.push({ line: l.line, msg: `event: unknown colour "${c.raw}"; colours are ${COLOUR_WORDS.join(", ")} (theme words, never a hex value)` });
      else colour = c.colour;
    }
    const d = m[0];
    if (!c.head) { errors.push({ line: l.line, msg: `the event on ${d} has no title` }); continue; }
    if (d.length >= 7 && (+d.slice(5, 7) < 1 || +d.slice(5, 7) > 12)) { errors.push({ line: l.line, msg: `"${d}" is not a date (the month is 01 to 12)` }); continue; }
    if (d.length === 10 && (+d.slice(8) < 1 || +d.slice(8) > 31)) { errors.push({ line: l.line, msg: `"${d}" is not a date (the day is 01 to 31)` }); continue; }
    if (events.length >= lim.timelineEvents) { errors.push({ line: l.line, msg: `more than ${lim.timelineEvents} events; split the timeline` }); break; }
    const prev = events[events.length - 1];
    if (prev && d < prev.date && prev.date.length === d.length) warnings.push({ line: l.line, msg: `${d} comes after ${prev.date} in the list but is earlier; list events from oldest to newest` });
    events.push({ date: d, title: c.head, colour, note, detail: [], step: l.step, line: l.line });
  }
  if (!events.length) errors.push({ line: baseLine, msg: `a timeline has no event; write one, like: 2026-11-23 Release` });
  return { title, across, events, steps, errors, warnings, attrs: [] };
}
export function timelineLlm(s: TlSpec): string {
  const out = [`Timeline${s.title ? `: ${s.title}` : ""}.`];
  let step = -2;
  for (const e of s.events) {
    if (s.steps.length && e.step !== step && e.step >= 0) { step = e.step; out.push(s.steps[e.step].title); }
    out.push(`- ${e.date}: ${e.title}${e.note ? ` (${e.note})` : ""}${e.detail.length ? ` — ${e.detail.join("; ")}` : ""}`);
  }
  return out.join("\n");
}

const ATTRS = ["id", "title", "dir", "static", "llm"];
export default definePart<TlSpec>({
  name: "timeline",
  form: "fenced",
  steps: true,
  llmKind: "own",
  parse: (input, ctx) => {
    const s = parseTimeline(input.body, input.bodyLine, input.attrs.title ?? "", input.attrs.dir === "across", ctx.limits, ctx.budget);
    for (const k of Object.keys(input.attrs)) if (!ATTRS.includes(k)) s.attrs.push(`unknown attribute "${k}" (a timeline takes #id, title=..., dir=across and static=...)`);
    if (input.attrs.dir && !["down", "across"].includes(input.attrs.dir)) s.attrs.push(`dir=${input.attrs.dir} is not a direction; write dir=across (or leave it out for down)`);
    return s;
  },
  llm: (s) => timelineLlm(s),
  check: (s) => [...s.attrs.map((m) => ({ line: undefined, message: m })), ...s.errors.map((e) => ({ line: e.line, message: e.msg })), ...s.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
