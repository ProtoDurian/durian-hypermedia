// The core's side of the inline hook (format version 11): the one place where the Markdown core (markdown.ts), parse()
// (document.ts) and the LLM view (core/dh-lib.ts) meet the inline parts. The parts are listed by the generated registry
// (INLINE_PARTS); builders never edit this file. A part's own code lives in its folder (see parts/inline.ts).
//
// The work is paid twice. The page's budget is charged one step per character offered to a part (before the scan; prose is
// bounded by the page size cap). The scan itself gets a sub-budget made for the text it is given, a fixed number of steps
// per character: a scan that is not linear in its text runs out of it however short the text is, and stops early instead
// of eating the page's budget. That is the guard of the "doubling test".
import { Budget, BudgetError, currentBudget, partBudget } from "../core/budget";
import { LIMITS, type Limits } from "../safety";
import { FOLDER_PART_DEFS, INLINE_PARTS } from "./generated/registry";
import { inputOf } from "./runtime";
import type { Node, PartNode } from "../core/dh-lib";
import type { InlineDef, InlineHit } from "./inline";
import type { PartInput } from "./types";

/** steps a scan may take for each character it is offered, and a fixed amount on top (a scan of a short text) */
export const INLINE_STEPS_PER_CHAR = 24;
export const INLINE_STEPS_FLAT = 4_096;

export interface InlineProblem { line: number; level: "error" | "warn"; message: string }
/** One inline part on one page: its state, or why it stopped. */
interface Active { def: InlineDef<any, any>; state: unknown; stopped: boolean }
/** The inline parts of one page: made once by prepareInlines, used by the Markdown core for every text run. */
export interface InlineRun { active: Active[]; problems: InlineProblem[]; limits: Limits; /** problems the core reported so far (it lists at most 100) */ reported: number }

/** A node of the page that is a block of this part, anywhere inside tabs, accordions and :::human. In page order. */
function blocksNamed(nodes: Node[], name: string, out: PartNode[] = []): PartNode[] {
  for (const n of nodes) {
    if (n.kind !== "part") continue;
    if (n.name === name) out.push(n);
    blocksNamed(n.nodes, name, out);
    for (const it of n.items) blocksNamed(it.nodes, name, out);
  }
  return out;
}

/** The parts in the order they read a text: lower `rank` first (a part with a marker like ":spark[" reads before the parts that
 *  match words), then by name. The registry is by name already. */
const ORDER: InlineDef<any, any>[] = [...INLINE_PARTS].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

/** Run every part's `prepare` for a page. `nodes` are the page's nodes (for the blocks of each part), `frontMatter` its front matter. */
export function prepareInlines(frontMatter: Record<string, unknown>, nodes: Node[], limits: Limits = LIMITS, idPrefix = "", options: Readonly<Record<string, unknown>> = {}): InlineRun {
  const run: InlineRun = { active: [], problems: [], limits, reported: 0 };
  for (const def of ORDER) {
    try {
      const blocks: PartInput[] = [];
      const fenced = Object.hasOwn(FOLDER_PART_DEFS, def.name) ? FOLDER_PART_DEFS[def.name] : undefined;
      if (fenced) for (const p of blocksNamed(nodes, def.name)) blocks.push(inputOf(p, fenced));
      const budget = partBudget(`the ${def.name} part`);
      const state = def.prepare ? def.prepare({ frontMatter, blocks, limits, budget, idPrefix, options }) : {};
      if (state !== null && state !== undefined) run.active.push({ def, state, stopped: false });
    } catch (e) {
      run.problems.push({ line: 1, level: "error", message: `${def.name}: ${e instanceof BudgetError ? e.message : `could not be read (${e instanceof Error ? e.message : String(e)})`}; its marks in the text are not made` });
    }
  }
  return run;
}

/** A heading of this depth starts: tell the parts (a part that marks the first use in a section starts again). */
export function inlineSection(run: InlineRun, depth: number): void {
  for (const a of run.active) if (!a.stopped && a.def.section) { try { a.def.section(a.state, depth); } catch { a.stopped = true; } }
}

/** What one part found in one text: ranges checked (whole numbers, inside the text, in order, none overlapping another's). */
export interface Found { from: number; to: number; name: string; data: unknown; def: InlineDef<any, any>; skip?: boolean }
const MASK = "￼";

/** The ranges of every part in one plain text run, sorted. `problem` is told what went wrong (a part's own `problem`, a bad range, a spent budget). */
export function scanRun(run: InlineRun, text: string, problem: (p: { message: string; level: "error" | "warn" }) => void): Found[] {
  if (!run.active.length || !text) return [];
  return scanWith(run.active, text, problem, currentBudget());
}

function scanWith(parts: Active[], text: string, problem: (p: { message: string; level: "error" | "warn" }) => void, page: Budget | null = null): Found[] {
  const found: Found[] = [];
  let claimed: Uint8Array | null = null;   // the characters an earlier part took, so a later one neither reads nor takes them
  let seen = text;
  const n = text.length;
  for (const a of parts) {
    if (a.stopped) continue;
    const name = a.def.name;
    let hits: InlineHit<unknown>[];
    try {
      const budget = new Budget({ steps: INLINE_STEPS_PER_CHAR * n + INLINE_STEPS_FLAT, values: n + 256, chars: INLINE_STEPS_PER_CHAR * n + INLINE_STEPS_FLAT }, null, null, `the ${name} part`);
      budget.charge(n);
      page?.charge(n);
      hits = a.def.scan(seen, a.state, budget);
    } catch (e) {
      a.stopped = true;
      problem({ level: "error", message: `${name}: ${e instanceof BudgetError ? e.message : `could not be read (${e instanceof Error ? e.message : String(e)})`}; the rest of the text is left as written` });
      continue;
    }
    let at = 0, bad = 0;
    const mine: Found[] = [];
    for (const h of hits) {
      const ok = Number.isInteger(h.from) && Number.isInteger(h.to) && h.from >= at && h.to > h.from && h.to <= n && !taken(claimed, h.from, h.to);
      if (!ok) { bad++; continue; }
      at = h.to;
      // a wrong use stays text, and no other part reads it
      if (h.problem) problem({ level: h.level ?? "error", message: `${name}: ${h.problem}` });
      mine.push({ from: h.from, to: h.to, name, data: h.data, def: a.def, skip: !!h.problem });
    }
    if (bad) problem({ level: "error", message: `${name}: ${bad} range${bad === 1 ? "" : "s"} overlap or lie outside the text; they are left as written` });
    if (mine.length) {
      claimed ??= new Uint8Array(n);
      for (const m of mine) claimed.fill(1, m.from, m.to);
      found.push(...mine);
      seen = mask(text, found);
    }
  }
  return found.filter((f) => !f.skip).sort((x, y) => x.from - y.from);
}
const taken = (c: Uint8Array | null, from: number, to: number): boolean => { if (!c) return false; for (let i = from; i < to; i++) if (c[i]) return true; return false; };
/** the text with every range a part took replaced by one filler character per character (so offsets stay) */
function mask(text: string, found: Found[]): string {
  const f = [...found].sort((x, y) => x.from - y.from);
  let out = "", at = 0;
  for (const m of f) { out += text.slice(at, m.from) + MASK.repeat(m.to - m.from); at = m.to; }
  return out + text.slice(at);
}

/** After the page's text was read: every part's problems about the whole page (a term the text never used). */
export function finishInlines(run: InlineRun): InlineProblem[] {
  const out: InlineProblem[] = [...run.problems];
  for (const a of run.active) {
    if (!a.def.check || a.stopped) continue;
    try { for (const i of a.def.check(a.state)) out.push({ line: i.line ?? 1, level: i.level ?? "error", message: i.message.startsWith(`${a.def.name}:`) ? i.message : `${a.def.name}: ${i.message}` }); }
    catch (e) { out.push({ line: 1, level: "error", message: `${a.def.name}: the check stopped: ${e instanceof Error ? e.message : String(e)}` }); }
  }
  return out;
}

// ---------------------------------------------------------------- the LLM view

/** The text the parts want at the top of the page's LLM view (their `llmHead`), joined; "" when none. */
export function inlineLlmHead(run: InlineRun): string {
  const out: string[] = [];
  for (const a of run.active) { if (!a.def.llmHead || a.stopped) continue; try { const t = a.def.llmHead(a.state); if (t) out.push(t); } catch { /* left out */ } }
  return out.join("\n\n");
}

const LLM_PARTS: InlineDef<any, any>[] = ORDER.filter((d) => d.llm);

/** Markdown text with every range a part's `llm` rewrites replaced by what an LLM reads (core/dh-lib.ts inlineToLlm calls it for each
 *  run of text outside code). Only parts with `llm` are read, with the state of an empty page. */
export function inlineLlmText(t: string): string {
  if (!LLM_PARTS.length || !t) return t;
  const limits = currentBudget()?.lim ?? LIMITS;
  const parts: Active[] = [];
  for (const def of LLM_PARTS) {
    try {
      const state = def.prepare ? def.prepare({ frontMatter: {}, blocks: [], limits, idPrefix: "", options: {}, budget: new Budget({ steps: INLINE_STEPS_FLAT, values: 256, chars: INLINE_STEPS_FLAT }, null, null, `the ${def.name} part`) }) : {};
      if (state !== null && state !== undefined) parts.push({ def, state, stopped: false });
    } catch { /* a part that cannot prepare is read as written */ }
  }
  if (!parts.length) return t;
  const found = scanWith(parts, t, () => {});
  if (!found.length) return t;
  let out = "", at = 0;
  for (const m of found) {
    out += t.slice(at, m.from);
    const shown = t.slice(m.from, m.to);
    out += m.def.llm ? safeLlm(m, shown) : shown;
    at = m.to;
  }
  return out + t.slice(at);
}
function safeLlm(m: Found, shown: string): string { try { return String(m.def.llm!(m.data, shown) ?? shown); } catch { return shown; } }
