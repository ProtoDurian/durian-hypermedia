// Maths in a sentence and in a paragraph of its own (format version 11): `$A = \pi r^2$` and `$$ ... $$`. An inline part with a raw mark
// (parts/inline.ts InlineRaw): it reads the Markdown source before escapes and emphasis, so `\\`, `_` and `*` stay the author's TeX.
// The TeX is drawn by KaTeX at parse time (render.ts) into a tree of elements; the page runs no maths script.
import { defineInline } from "../inline";
import { BudgetError } from "../../core/budget";
import { MathError, renderMath, bannedIn } from "./render";
import { findMath, newSearches, type MathData, type Searches } from "./scan";

export interface MathState { caps: { chars: number; nodes: number }; formulas: number; maxFormulas: number; searches: Searches }

/** a formula as data: its tree, or why KaTeX could not draw it (the page then shows its TeX, and the check says why) */
export function drawMath(tex: string, display: boolean, st: Pick<MathState, "caps">, budget: import("../../core/budget").Budget): { data: MathData; problem?: string } {
  try {
    return { data: { tex, display, tree: renderMath(tex, display, st.caps, budget) } };
  } catch (e) {
    if (e instanceof BudgetError) throw e;
    if (!(e instanceof MathError)) throw e;
    const at = e.pos === undefined ? "" : ` (${where(tex, e.pos)})`;
    return { data: { tex, display, error: e.message }, problem: `${e.message}${at}` };
  }
}
/** "line 2, column 5 of the formula" for a position in the TeX */
export function where(tex: string, pos: number): string {
  let line = 1, last = -1;
  for (let i = tex.indexOf("\n"); i >= 0 && i < pos; i = tex.indexOf("\n", i + 1)) { line++; last = i; }
  return `line ${line}, column ${pos - last} of the formula`;
}

export default defineInline<MathState, MathData>({
  name: "math",
  rank: -2,
  prepare(page) {
    return { caps: { chars: page.limits.mathChars, nodes: page.limits.mathNodes }, formulas: 0, maxFormulas: page.limits.mathFormulas, searches: newSearches() };
  },
  scan: () => [],   // the marks are read from the source itself (raw)
  raw: {
    chars: "$",
    match(src, pos, max, st, budget, block) {
      budget.charge(1);
      const f = findMath(src, pos, max, block, st.searches);
      if (!f) {
        // two prices in one paragraph ("$5 and $10") that read as no formula: say so once, the text stays as written
        if (!block && isDigitAt(src, pos + 1)) {
          if (st.searches.money === src) {
            if (st.searches.moneyWarned !== src) { st.searches.moneyWarned = src; return { end: pos + 1, problem: "two \"$\" with a number right after each look like prices; \\$ writes a dollar sign, and $...$ is a formula", level: "warn" }; }
          } else st.searches.money = src;
        }
        return null;
      }
      if ("text" in f) return { end: f.end };
      budget.charge(f.tex.length / 16 + 1, 0, 0);
      if (st.formulas >= st.maxFormulas) return { end: f.end, problem: `more than ${st.maxFormulas} formulas on the page; this one is left as written`, level: "error" };
      st.formulas++;
      const r = drawMath(f.tex, f.display, st, budget);
      return { end: f.end, data: r.data, ...(r.problem ? { problem: r.problem, level: "error" as const } : {}) };
    },
  },
});
const isDigitAt = (s: string, i: number) => s[i] >= "0" && s[i] <= "9";
export { bannedIn };
