// The folder interface of a part (format version 11): what one folder under src/parts/<name>/ gives the package.
// A part owns its folder; scripts/parts.ts reads the folders and writes the registry, the dispatch and the lists
// (src/parts/generated/), so adding a part edits no shared file. PARTS.md is the builder's checklist.
//
//   src/parts/<name>/
//     part.ts        export default definePart({ name, parse, llm, check, ... })   pure: no DOM, no React
//     limits.ts      export const LIMITS = { <name>Xxx: n, ... };  export const UNTRUSTED_LIMITS = { ...LIMITS, ... }
//     view.tsx       export default function View(props: PartViewProps<Data>)       React, `static` aware
//     style.css      one :root block of --<name>-* tokens, one dark block, then rules (scoped by the build)
//     spec.md        the part's SPEC section (### heading, one example, its doccheck rows)
//     sample.md      the Format page sample (Markdown: the part, its :::llm if any, a line of prose)
//     fixtures/      good-*.dh.md (0 problems) and hostile-*.dh.md (refused quickly, never a hang)
//     <name>.test.ts unit tests, the doubling test, the hostile fixtures
//
// Rules a test enforces (test/parts.test.ts): part.ts and limits.ts import nothing from core/dh-lib, core/doccheck,
// document or markdown (they are loaded while those load); every LIMITS key starts with the part's name; the name is
// the folder's name; style.css has one :root block and one dark block.
import type { Problem } from "../types";
import type { Budget } from "../core/budget";
import type { Limits } from "../safety";

/** One `@step <title>` line of a fenced part, and the lines under it (the format's own step split). */
export interface PartStep { title: string; line: number; raw: string }

/** What the format hands a part: the lines inside the fence and where they are. */
export interface PartInput {
  /** the lines inside the fence, as written */
  body: string;
  /** the line of the first body line (1-based) */
  bodyLine: number;
  /** the fence's own line (1-based) */
  line: number;
  /** the info string's key=value attributes (#id is `id`), as written; a bare word (```video loop) is `loop: "true"` */
  attrs: Record<string, string>;
  /** with `steps: true`: the text before the first @step, and the steps; otherwise "" and [] */
  head: string;
  steps: PartStep[];
}

/** What a part's parse gets besides its input. */
export interface PartContext {
  /** the caps of this parse() call: LIMITS, UNTRUSTED_LIMITS or the host's own, with this part's keys in them */
  limits: Limits;
  /** this part's share of the one page budget, named "the <name> part": charge(steps, values, chars) before the work.
   *  Over the limit it throws BudgetError: let it go (never catch it to keep going); the part is refused with its message. */
  budget: Budget;
  /** the page's front matter, read-only (a code reference's pins, a page-wide setting); {} when the page has none */
  frontMatter?: Readonly<Record<string, unknown>>;
  /** the page's Markdown text nodes as written, in page order (code blocks of the page are not in them); [] when none. A part that counts
   *  marks over the whole page (citations: the number of each cite) reads them here. Read-only. */
  texts?: readonly string[];
  /** the page's id prefix (ParseOptions.idPrefix, default "dh-"): put it before an id the part's view makes (an anchor), so two
   *  documents on one page never share one */
  idPrefix?: string;
}

/** A problem a part's check reports; the line defaults to the fence's line, the level to "error". */
export interface PartIssue { line?: number; level?: "error" | "warn"; message: string }

/** How the LLM view shows the part when the author wrote no :::llm after it. */
export type PartLlm = "own" | "as-is";

/** One local file a part names. */
export interface PartFileRef {
  /** the path as written in the page (a query or #fragment is dropped) */
  path: string;
  line: number;
  /** the file's checksum must be this */
  hash?: { algo: "sha256" | "sha512"; hex: string };
  /** read the file as JSON and pass it to check (an unreadable one is refused by the Node entry) */
  json?: boolean;
  /** read at most this many bytes (default the Node entry's own cap); a bigger file is not read: check still gets its size */
  readMax?: number;
  /** read the file (up to readMax) and pass its bytes to check */
  bytes?: boolean;
  /** the part's own rules over the file: its size, and its JSON when `json` and the file was read. Messages, no prefix. */
  check?(file: { size: number; json?: unknown; bytes?: Uint8Array }): string[];
}

export interface PartDef<D = unknown> {
  /** the fence word, the same as the folder's name: lower case letters, digits and dashes */
  name: string;
  /** "fenced": a code block ```<name>. (Containers stay in the Markdown core.) */
  form: "fenced";
  /** does it take @step lines (the format splits them into input.steps) */
  steps: boolean;
  /** "own": llm(data) is what an LLM reads; "as-is": the fence as written */
  llmKind: PartLlm;
  /** body to data. Pure, linear in the body, charges ctx.budget for every loop over author text. Return data even for a
   *  wrong body (with its errors inside, for check and the view); throw an Error only when nothing can be drawn. */
  parse(input: PartInput, ctx: PartContext): D;
  /** what an LLM reads in place of the part (llmKind "own"); plain text, at most about 400 tokens for a normal part */
  llm?(data: D, input: PartInput): string;
  /** doccheck's rules for the part: every refusal names the line and says the fix */
  check?(data: D, input: PartInput): PartIssue[];
  /** the npm packages the part's code imports (they must be in package.json dependencies at the exact version) */
  dependencies?: string[];
  /** other code blocks this part reads: a block whose info word is `word` and whose info string has the bare word `flag`
   *  (```json explore) is this part, and input.attrs.lang is that word. Without the flag it stays a plain code block. */
  fences?: { word: string; flag: string }[];
  /** chart kinds this part draws: a ```chart whose YAML has `kind: <one of these>` at the top level is this part (its
   *  body the chart's YAML). Its block type is this part's name; its doccheck messages start "chart:". */
  chartKinds?: string[];
  /** true when this part's LLM view may be over the 400-token rule without a :::llm after it, because the long text IS
   *  the content (an audio part's transcript). doccheck asks it with the part's data. */
  llmExempt?(data: D): boolean;
  /** The local files this part's data names (a download, a Lottie, a poster, a caption file). Read only by the Node entry
   *  (durian-markdown/node checkLocalFiles); parse, the checks and the browser never call it. `ctx.limits` are the caps the
   *  page was parsed with, `ctx.line` the fence's line (for a path given in the info string). A path with a scheme or `//` is not local and is skipped; the rest is read under the host's root. */
  files?(data: D, ctx: { limits: Limits; line: number }): PartFileRef[];
}

/** Make a part definition (type help; the generator checks the name against the folder). */
export function definePart<D>(def: PartDef<D>): PartDef<D> { return def; }

// ---------------------------------------------------------------- the view

/** The `static` prop (designed by the static helper): undefined = not asked; false = `static=false` (live, but print is
 *  still static); "" = the finished state; "<number>" = that step, from 1; anything else = the step with that title.
 *  A static part draws one state whole: no player, no control row, no motion. */
export type StaticProp = string | false | undefined;

/** What the frame gives a part's view about where it is drawn. A part may lay itself out whole (it places every box,
 *  line and word itself, at any width): it reads `width`, draws at its own size and calls `report` with that size.
 *  The frame never scales, clips or lays out a part's content; static mode and the frame wrap it either way. */
export interface PartStage {
  /** the width the part may use, in CSS pixels, measured from the frame (0 before the first measure, on the server) */
  width: number;
  /** the theme the part is drawn in now */
  theme: "light" | "dark";
  /** "off": draw no motion (the host, the page or the reader's reduce-motion setting) */
  motion: "on" | "off";
  /** the part tells the frame the size it drew at (optional; a part laid out by CSS need not call it) */
  report(size: { width: number; height: number }): void;
}

export interface PartViewProps<D = unknown> {
  /** what parse returned */
  data: D;
  /** the block: id, line, attrs, llm text */
  block: PartBlock<D>;
  /** the renderer's own words (buttons, hints) */
  ui: import("../ui/ui").Ui;
  /** see StaticProp: from the fence (static=...), the document (DocumentView static), or undefined */
  static: StaticProp;
  stage: PartStage;
}

/** The block parse() makes for a folder part. */
export interface PartBlock<D = unknown> {
  type: string;
  id: string | null;
  line: number;
  attrs: Record<string, string>;
  llm: string | null;
  llmKind: "text" | "none" | "own" | "as-is";
  /** what the part's parse returned */
  data: D;
}

/** A part's limits file: every key starts with the part's name ("fishboneCauses"), every value a whole number. */
export type PartLimitValues = Record<string, number>;

export type { Problem };
