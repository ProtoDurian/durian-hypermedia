// The parts' kit: small pure helpers every folder part may import (format version 11). Linear time, hand scans, no
// regular expression that can backtrack over author text. Changing a helper here changes every part: add, never alter.
import type { Budget } from "../../core/budget";

export interface Err { line: number; msg: string }
export interface StepInfo { title: string; line: number }
/** one body line with the step it is under (-1: before the first @step) */
export interface SrcLine { text: string; line: number; step: number }

/** the theme's colour words a part may name in its source (never a hex value, a pixel size or a time) */
export const COLOUR_WORDS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc", "good", "warn", "bad", "muted"];
/** the eight family colours, in the order parts hand them out */
export const FAMILY = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
export const familyOf = (k: number) => FAMILY[k % FAMILY.length];

/** one character: is it white space (the set of \s) */
export const isSpace = (c: string | undefined) => c !== undefined && c !== "" && c.trim() === "";
/** the spaces at the start of a line */
export function indentOf(s: string): number { let i = 0; while (i < s.length && isSpace(s[i])) i++; return i; }
/** "head: rest" split at the first colon of a trimmed line (null when there is no head) */
export function colonSplit(t: string): [string, string] | null {
  const k = t.indexOf(":");
  if (k <= 0) return null;
  const head = t.slice(0, k).trimEnd();
  return head ? [head, t.slice(k + 1).trimStart()] : null;
}
/** the line starts with this word (any case) followed by white space: the rest, trimmed; else null */
export function afterWord(t: string, word: string): string | null {
  if (t.length <= word.length || t.slice(0, word.length).toLowerCase() !== word || !isSpace(t[word.length])) return null;
  return t.slice(word.length + 1).trim();
}

/** The body split into lines that carry a step number; blank lines and // comments are dropped; `@step <title>` lines
 *  start a step. Charges one step a line and one more each 16 characters (reading makes no new text). */
export function scanLines(body: string, baseLine: number, budget?: Budget): { lines: SrcLine[]; steps: StepInfo[] } {
  const lines: SrcLine[] = [], steps: StepInfo[] = [];
  let line = baseLine;
  for (let from = 0; from <= body.length; line++) {
    let to = body.indexOf("\n", from);
    if (to < 0) to = body.length;
    const raw = body.slice(from, to);
    from = to + 1;
    budget?.charge(1 + (raw.length >> 4));
    const lead = indentOf(raw);
    if (lead === raw.length || raw.startsWith("//", lead)) { if (to === body.length) break; continue; }
    if (raw.startsWith("@step", lead) && (raw.length === lead + 5 || isSpace(raw[lead + 5]))) steps.push({ title: raw.slice(lead + 5).trim(), line });
    else lines.push({ text: raw.trimEnd(), line, step: steps.length - 1 });
    if (to === body.length) break;
  }
  return { lines, steps };
}

// ---- text width and wrapping: an estimate, so a layout needs no browser (the same table the animation engine uses) ----
const chW = (c: number, ch: string) => (c >= 0x2e80 ? 13 : c >= 0x0900 && c <= 0x0dff ? 8.6 : "ABCDEFGHIJKLMNOPQRSTUVWXYZ@#%&mwMW".includes(ch) ? 8.6 : "ilj.,:;'|!".includes(ch) ? 3.8 : 7.1);
/** the width of a text in CSS pixels at this font size (sans, an estimate) */
export function textW(s: string, font = 13): number {
  let w = 0;
  for (const ch of s) w += chW(ch.codePointAt(0)!, ch);
  return (w * font) / 13;
}
/** Words wrapped to lines at most maxW wide; a word wider than a line is broken; past maxLines the last ends in "…".
 *  Charges the characters it measures when a budget is given. */
export function wrap(text: string, maxW: number, font: number, maxLines = 99, budget?: Budget): string[] {
  budget?.charge(1 + text.length, 0, 2 * text.length);
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "", curW = 0;
  const space = textW(" ", font);
  for (const w of words) {
    const ww = textW(w, font);
    if (cur && curW + space + ww > maxW) { out.push(cur); cur = w; curW = ww; } else { cur = cur ? `${cur} ${w}` : w; curW = cur === w ? ww : curW + space + ww; }
  }
  if (cur) out.push(cur);
  const fit: string[] = [];
  for (const l of out) {
    if (textW(l, font) <= maxW) { fit.push(l); continue; }
    let part = "", pw = 0;
    for (const ch of l) { const cw = textW(ch, font); if (part && pw + cw > maxW) { fit.push(part); part = ch; pw = cw; } else { part += ch; pw += cw; } }
    if (part) fit.push(part);
  }
  if (fit.length > maxLines) { const k = fit.slice(0, maxLines); k[maxLines - 1] = k[maxLines - 1].slice(0, -1) + "…"; return k; }
  return fit.length ? fit : [""];
}
/** a text cut with "…" to at most maxW wide */
export function clipTo(s: string, maxW: number, font: number): string {
  if (textW(s, font) <= maxW) return s;
  let o = "", w = textW("…", font);
  for (const ch of s) { const cw = textW(ch, font); if (w + cw > maxW) break; o += ch; w += cw; }
  return o + "…";
}

/** a Markdown table (for an LLM view): cells have | and line ends made safe */
export function mdTable(cols: string[], rows: string[][]): string {
  const cell = (s: string) => s.split("|").join("\\|").split("\n").join(" ");
  return [`| ${cols.map(cell).join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
