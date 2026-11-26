// The timeline layout's words (lane L-time). The composed stage's time block (src/core/stage-time.ts) owns the
// grammar: this file only says which words reach it and rebuilds a source line from a handed-over layout word.
import { TIME_WORDS } from "../../../core/stage-time";

/** setup words the layout owns (first words of a setup line); `show`/`light`/`hide` are core words and never listed */
export const SETUP_WORDS = ["time", "row", "zoom", "zoom row", "ticks", "zoom ticks", "zoom labels", "ruler", "row labels", "cells", "window", "height", "plot", "point", "axis", "band", "at", "dot"];
/** step words the layout owns: the time block's `ops` without `show` (a core fact) */
export const STEP_WORDS = ["at", "span", "dot", "arrow", "hush", "tag", "fill", "off"];
/** the same words after `keep` (it stays from this step on): parse hands the word `keep` (arg: the rest) or as written, `keep span`; the adapter drops `keep mark` (a card's or the sheet's) */
export const KEEP_STEP_WORDS = ["keep", "keep at", "keep span", "keep dot", "keep fill"];

/** the block's own spellings, longest first ("zoom row" before "zoom") */
const SPELLINGS = [...new Set(Object.values(TIME_WORDS) as string[])].sort((a, b) => b.length - a.length);
/** spellings written `word: value` (the colon is part of the word) */
const COLONED = new Set(["time", "ticks", "zoom ticks", "zoom labels", "zoom", "window", "plot", "ruler", "row labels", "cells", "height", "axis"]);

/**
 * The line a handed-over layout word came from. The parse lane hands `word` (the first word, a trailing colon
 * dropped or kept) and `arg` (the rest of the line, a leading colon dropped or kept); the block reads the whole line,
 * so both forms rebuild the same text: `zoom` + `24..36 | Close-up` -> `zoom: 24..36 | Close-up`.
 */
export function lineText(word: string, arg: string): string {
  const w = word.replace(/:$/, "").trim(), a = arg.replace(/^:\s*/, "").trim();
  let raw = a ? `${w} ${a}` : w;
  const sp = SPELLINGS.find((s) => raw === s || raw.startsWith(s + " ") || raw.startsWith(s + ":"));
  if (sp && COLONED.has(sp) && raw.startsWith(sp + " ")) raw = `${sp}:${raw.slice(sp.length)}`;
  return raw;
}

/** `keep at 6 [bad]: x` may arrive as word "keep" (arg "at 6 ...") or "keep at"; the stage reads `keep` as a flag */
export function splitKeep(word: string, arg: string, flag?: boolean): { word: string; arg: string; keep: boolean } {
  let keep = !!flag, w = word.trim(), a = arg;
  if (w === "keep") { keep = true; const i = a.search(/\s/); w = i < 0 ? a : a.slice(0, i); a = i < 0 ? "" : a.slice(i + 1); }
  else if (w.startsWith("keep ")) { keep = true; w = w.slice(5).trim(); }
  return { word: w.replace(/:$/, ""), arg: a, keep };
}
