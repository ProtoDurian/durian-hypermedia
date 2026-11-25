// Finding formulas in Markdown source (format version 11), by GitHub's and Pandoc's `$` rule. Pure, linear: every search that found
// no end is remembered, so a text of many `$` and no closing one is read once (a later start never repeats an earlier search).
//
//   inline  `$` + a non-space ... a non-space + `$` not followed by a digit ("it costs $5 and $10" stays text); `\$` is a dollar sign;
//           never spans a line, and never crosses a code span.
//   display `$$` ... `$$` (on its own lines, or around one run of text); never spans a blank line.
import type { MathNode } from "./render";

export interface MathData { tex: string; display: boolean; tree?: MathNode; error?: string }
/** what the last search found, for one source text */
interface Memo { src: string; from: number; res: number; stop: number }
export interface Searches { inline: Memo | null; block: Memo | null; money: string | null; moneyWarned: string | null }
export const newSearches = (): Searches => ({ inline: null, block: null, money: null, moneyWarned: null });

const isSpace = (c: string | undefined) => c === undefined || c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v" || c === " ";
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** the end of an inline formula that starts at `from` (the index after its opening `$`): the index of the closing `$`, or -1 */
export function closeInline(src: string, from: number, max: number, memo: Searches): number {
  const m = memo.inline;
  if (m && m.src === src && from >= m.from && from <= (m.res >= 0 ? m.res : m.stop)) return m.res;
  let j = from;
  for (; j < max; j++) {
    const c = src[j];
    if (c === "\\") { j++; continue; }
    if (c === "\n" || c === "`") break;   // a line ends it; so does a code span (a formula holds no backtick)
    if (c === "$" && !isSpace(src[j - 1]) && !isDigit(src[j + 1])) { memo.inline = { src, from, res: j, stop: j }; return j; }
  }
  memo.inline = { src, from, res: -1, stop: Math.min(j, max) };
  return -1;
}
/** the end of a display formula whose text starts at `from` (after the opening `$$`): the index of the closing `$$`, or -1 */
export function closeBlock(src: string, from: number, max: number, memo: Searches): number {
  const m = memo.block;
  if (m && m.src === src && from >= m.from && from <= (m.res >= 0 ? m.res : m.stop)) return m.res;
  let j = from;
  for (; j < max - 1; j++) {
    const c = src[j];
    if (c === "\\") { j++; continue; }
    if (c === "\n") {
      // a blank line (only spaces up to the next newline) ends the paragraph
      let k = j + 1;
      while (k < max && (src[k] === " " || src[k] === "\t")) k++;
      if (k >= max || src[k] === "\n") break;
      // so does the line of a code fence
      if (src.startsWith("```", k) || src.startsWith("~~~", k)) break;
    } else if (c === "$" && src[j + 1] === "$") { memo.block = { src, from, res: j, stop: j }; return j; }
  }
  memo.block = { src, from, res: -1, stop: Math.min(j, max) };
  return -1;
}

export interface Found { end: number; tex: string; display: boolean; tail?: undefined }
/** Is there a formula at `pos` (a `$`)? `block`: only a `$$` display formula. Null when not; a lone `$$` that closes nowhere is two dollar signs of text. */
export function findMath(src: string, pos: number, max: number, block: boolean, memo: Searches): Found | { end: number; text: true } | null {
  if (src[pos] !== "$") return null;
  if (src[pos + 1] === "$") {
    const j = closeBlock(src, pos + 2, max, memo);
    if (j >= 0) return { end: j + 2, tex: src.slice(pos + 2, j).replace(/^\n|\n$/g, ""), display: true };
    return block ? null : { end: pos + 2, text: true };
  }
  if (block) return null;
  if (isSpace(src[pos + 1]) || pos + 1 >= max) return null;
  const j = closeInline(src, pos + 1, max, memo);
  if (j >= 0) return { end: j + 1, tex: src.slice(pos + 1, j), display: false };
  return null;
}
