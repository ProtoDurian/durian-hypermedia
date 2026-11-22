// The inline hook of a part (format version 11): a part folder may add itself to the Markdown core as a part of a sentence
// (a term with its meaning, a sparkline), with one file, `src/parts/<name>/inline.ts`, and one view, `inline-view.tsx`.
// scripts/parts.ts lists it in the generated INLINE_PARTS; no shared file is edited by hand.
//
//   export default defineInline<State, Data>({
//     name: "spark",
//     prepare: (page) => ({ cap: page.limits.sparkValues }),          // once per page: facts in, the part's state out
//     scan: (text, state, budget) => [{ from, to, data }],            // once per plain text run: ranges in, no overlap
//     llm: (data, text) => "(3, 5, 2, 8, 9)",                          // what an LLM reads in place of the text (optional)
//   });
//
// What the core promises: `scan` is called once per plain text run of a paragraph, list item, quote, callout or table
// cell, in the page's order, never inside code, a link, an image, a heading, a table's rule row or an HTML tag. The core
// turns each range into the node `{ t: "ref", name, text, data }`; `text` is the matched slice. The core checks the
// ranges (whole numbers inside the run, in order, no overlap) and drops what is wrong, with a problem on the page.
// What the part promises: `scan` is linear in the text (a hand scan: no regular expression that can backtrack over author
// text), and charges `budget` for the work it does (the core already charged one step per character offered). A part
// never catches BudgetError: the core does, leaves the rest of the text plain and says so in the page's problems.
//
// Like the fenced parts, this file may import only `../types`, `./inline`, `../kit/text`, `../../core/budget` (types),
// `../../safety` (types), its own folder's pure files (`./part`, `./limits`) and another part's pure files. Never
// `core/dh-lib`, `core/doccheck`, `document`, `markdown` or React (they load it while they load).
import type { Budget } from "../core/budget";
import type { Limits } from "../safety";
import type { PartInput, PartIssue } from "./types";

/** What the page tells `prepare`, read-only. */
export interface InlinePage {
  /** the page's front matter ({} when there is none) */
  frontMatter: Readonly<Record<string, unknown>>;
  /** the page's own blocks of this part (a ```<name> fence), in page order, tabs and accordions included; [] when the part has
   *  no block form */
  blocks: PartInput[];
  /** the caps of this parse() call (LIMITS, UNTRUSTED_LIMITS or the host's own), with this part's keys in them */
  limits: Limits;
  /** a budget for the work of `prepare` (named "the <name> part"); draws from the page's */
  budget: Budget;
}

/** One range of one text run that is this part's. `from` and `to` are offsets in the text `scan` was given, `to` exclusive. */
export interface InlineHit<D = unknown> {
  from: number;
  to: number;
  data: D;
  /** a wrong use: the core reports it on the page (an error unless `level` is "warn") with the line of the text */
  problem?: string;
  level?: "error" | "warn";
}

export interface InlineDef<S = unknown, D = unknown> {
  /** the part's name: the folder's name (lower case letters, digits and dashes); the ref node's `name` */
  name: string;
  /** the order the parts read a text, lowest first (default 0; ties by name). A part with a marker of its own (":spark[") takes
   *  -1, so the parts that match plain words never read inside it: a later part sees the earlier parts' ranges as filler. */
  rank?: number;
  /** once per page, before its text is read: the part's state (a term table). Return `null` for "nothing to do on this page":
   *  the core then never calls `scan` (no text is offered, nothing is charged). Pure, charges `page.budget`. */
  prepare?(page: InlinePage): S | null;
  /** once per plain text run: the ranges that are this part's, in order, not overlapping. Linear; charges `budget`. The state
   *  is the one `prepare` made, and may be changed (a part that marks only the first use keeps what it has marked). */
  scan(text: string, state: S, budget: Budget): InlineHit<D>[];
  /** the core tells the part that a heading of this depth (1 to 6) starts: a section may begin here (optional) */
  section?(state: S, depth: number): void;
  /** what an LLM reads in place of the text a range covers (optional). A part with `llm` is also scanned in the LLM view, with
   *  the state of an empty page (`prepare` gets no front matter and no blocks): its scan must not depend on the page. */
  llm?(data: D, text: string): string;
  /** once per page, after all its text was read: problems about the whole page (a term never used) */
  check?(state: S): PartIssue[];
}

/** Make an inline part definition (type help; the generator checks the folder). */
export function defineInline<S = unknown, D = unknown>(def: InlineDef<S, D>): InlineDef<S, D> { return def; }

/** The props of an inline part's view (`inline-view.tsx`: `export default function <Name>Inline(props: InlineViewProps<Data>)`). */
export interface InlineViewProps<D = unknown> {
  /** the text the range covered, as written */
  text: string;
  /** what `scan` made for it */
  data: D;
  /** the renderer's own words */
  ui: import("../ui/ui").Ui;
  /** see StaticProp (parts/types.ts): the document's `static` setting; a static inline draws one still state (no motion, no timer) */
  static: import("./types").StaticProp;
}
