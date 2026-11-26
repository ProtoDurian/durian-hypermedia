// The page's view of the one engine (lane core2): when the one engine draws an animation block, the page's LLM view,
// its translation texts and its doccheck come from the engine (core/llm.ts, core/texts.ts, core check), not from the old
// scene and stage compilers that read the same source. Which blocks the engine draws:
//   - every block of a page whose front matter says `format: 12` (the old compilers cannot read it);
//   - every block when the page is read with `engine: "new"` (ParseOptions.engine, as DocumentProps.engine);
//   - with `engine: "auto"`, the blocks the engine draws at a desktop and a phone width (bridge.tryEngine).
// The default is ENGINE_DEFAULT, as for the renderer: hosts pass the same mode to parse() and to <DhDocument engine>.
import type { AnimationBlock } from "../types";
import type { Compiled, Problem } from "./types";
import { ENGINE_DEFAULT, TRY_WIDTHS, engineSrcOf, tryEngine, type EngineMode } from "./bridge";
import { checkLayout } from "./core/check-layout";
import { compile } from "./pipeline";
import { modelTexts } from "./core/texts";

let mode: EngineMode = ENGINE_DEFAULT;
/** run `fn` with the page's engine mode (ParseOptions.engine); undefined keeps the mode already in force (ENGINE_DEFAULT at the top) */
export function withEngine<T>(m: EngineMode | undefined, fn: () => T): T {
  const was = mode; mode = m ?? was;
  try { return fn(); } finally { mode = was; }
}

/** what the engine says of a block it draws: `c` (null when it could not read the block at all, then `err` says why) */
export type EngineView = { c: Compiled | null; err: string | null };
const held = new WeakMap<object, Map<EngineMode, EngineView | null>>();
/**
 * the engine's view of a block when the engine draws it (under the current mode), else null (the old engines draw
 * it). `key` is the part (one answer per part and mode); `block` builds what the engine reads (its source, the page's
 * roles, whether it says format 12).
 */
export function engineView(key: object, block: () => Pick<AnimationBlock, "anim" | "engine">): EngineView | null {
  const per = held.get(key) ?? held.set(key, new Map()).get(key)!;
  if (per.has(mode)) return per.get(mode)!;
  const b = block();
  let v: EngineView | null;
  if (b.engine?.format12 || mode === "new") {
    // the engine draws it whatever it finds: its refusals are the page's problems (a refused block draws an error box),
    // and its view of the block (states, LLM view) is read even then
    try { v = { c: compile(engineSrcOf(b)), err: null }; } catch (e) { v = { c: null, err: e instanceof Error ? e.message : String(e) }; }
  } else if (mode === "auto") { const t = tryEngine(b); v = t.c ? { c: t.c, err: null } : null; }
  else v = null;
  per.set(mode, v);
  return v;
}

/** the LLM view of an engine-drawn block */
export const engineLlm = (v: EngineView): string => (v.c ? v.c.llm() : `Animation (not drawn: ${v.err})`);
/** the words a person reads in an engine-drawn block, in story order */
export const engineTexts = (v: EngineView): string[] => (v.c ? modelTexts(v.c.model) : []);
/** the layout findings of a block (words under 11 px, crossing lines, things that move, overlaps) at the page's own widths,
 *  worked out once per block and only by the doccheck, never when the page is drawn; a plan that cannot be made is an error */
const layoutOf = new WeakMap<Compiled, Problem[]>();
function layoutProblems(c: Compiled, line: number): Problem[] {
  let r = layoutOf.get(c);
  if (!r) {
    try { r = checkLayout(c, TRY_WIDTHS); }
    catch (e) { r = [{ line, msg: `the layout cannot be drawn: ${e instanceof Error ? e.message : String(e)}` }]; }
    layoutOf.set(c, r);
  }
  return r;
}
/** doccheck of an engine-drawn block: the engine's refusals as errors, its warnings as warnings, with their lines */
export function engineCheck(v: EngineView, line: number): { errors: { line: number; msg: string }[]; warnings: { line: number; msg: string }[] } {
  if (!v.c) return { errors: [{ line, msg: v.err ?? "the one engine cannot read this animation" }], warnings: [] };
  const errors: Problem[] = [], warnings: Problem[] = [];
  const seen = new Set<string>();
  for (const p of v.c.problems) {
    if (p.warn && /is a word no layout owns in a step$/.test(p.msg)) continue; // an old block's word the lanes adapter reads from the block's own text
    const k = `${p.line}:${p.msg}`; if (seen.has(k)) continue; seen.add(k); (p.warn ? warnings : errors).push(p); }
  // the layouts' own findings, only for a block that has no refusal (a refused block is not drawn)
  if (!errors.length) for (const p of layoutProblems(v.c, line)) (p.warn ? warnings : errors).push(p);
  return { errors, warnings };
}
