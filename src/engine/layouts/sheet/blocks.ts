// Lane sheet: the old stage's head blocks `sheet`, `nest` and `track` (src/core/stage-sheet.ts, stage-nest.ts,
// stage-blocks.ts) read from the new Model. The blocks keep every measured rule of their layout; this file only
// hands them what they were handed by the old stage's compile loop (src/core/stage.ts compileStage):
//   - the setup words the parse lane kept verbatim in `model.layoutWords[layout]` (see SHEET.md for the contract),
//   - the step words, as `layout` facts (and `show` / `hide` / `light` facts whose ids the model does not own).
// Nothing here draws; `place.ts` asks a block for its items (`layout(node, box)`) and `items.ts` turns them into prims.
import { blockFor, StageError, type Box, type Line, type ParseCtx, type StageBlock } from "../../../core/stage-core";
import "../../../core/stage-blocks"; // track (and the step panels, the time block `track` looks at)
import "../../../core/stage-sheet";
import "../../../core/stage-nest";
import { entriesOf } from "./things";
import type { Fact, LayoutName, Model, Problem } from "../../types";

/** the head words this lane owns, and the layout each belongs to */
export const HEAD_LAYOUT: Record<string, LayoutName> = { sheet: "sheet", nest: "wrap", track: "track" };
export const MY_LAYOUTS: LayoutName[] = ["sheet", "wrap", "track"];

export type Head = { block: StageBlock; node: any; word: string; line: number; layout: LayoutName };
export type Built = { heads: Head[]; problems: Problem[]; steps: number; ctx: ParseCtx };

/** raw source lines of an entry's body as the old stage's `Line`s: tabs are two spaces, blank and `// ` lines dropped */
export function toLines(raw: string[], line0: number): Line[] {
  const out: Line[] = [];
  raw.forEach((r, i) => {
    const t0 = r.replace(/\t/g, "  "), t = t0.trim();
    if (!t || t.startsWith("// ")) return;
    out.push({ n: line0 + i, ind: t0.length - t0.trimStart().length, t });
  });
  return out;
}

const cache = new WeakMap<Model, Map<string, Built>>();
/** The head blocks of `layouts` in a model, parsed, with every step word applied. Cached per model and layout set. */
export function buildHeads(model: Model, layouts: LayoutName[], container: string | null = null): Built {
  const key = layouts.join(",") + "@" + (container ?? "");
  let per = cache.get(model); if (!per) cache.set(model, (per = new Map()));
  const hit = per.get(key); if (hit) return hit;
  const problems: Problem[] = [], problem = (line: number, msg: string) => problems.push({ line, msg });
  const n = model.steps.length;
  const ctx: ParseCtx = { roles: new Set(Object.keys(model.roles)), problem, ids: new Set(), steps: n };
  const heads: Head[] = [];
  const guard = (line: number, f: () => void) => { try { f(); } catch (e) { if (e instanceof StageError) problem(e.line, e.message); else throw e; } };

  // a time block elsewhere in the scene changes how a track draws (its phases are separators, not a journey): the time
  // block registers itself on the parse context, so parse its head line against the same one
  for (const e of model.layoutWords.timeline ?? []) { const b = blockFor(e.word); if (b?.kind === "head" && e.word === "time") guard(e.src.line, () => b.parse({ word: e.word, arg: e.arg, body: [], line: e.src.line }, ctx)); }

  // What lowerStage hands over (src/engine/parse/lower-stage.ts): the head line is an entry (word = the head word, arg = the
  // text after "word:", body = the lines indented under it, dedented by two); every line the block claims after it, and its
  // own words (labels:, carry: ...), are entries of their own in source order (word = the line's first word, arg = the rest,
  // body = its children, dedented by two). The old stage's lines are rebuilt from them.
  const indent = (raw: string[], line0: number) => toLines(raw.map((r) => "  " + r), line0);
  // a container thing of this lane that holds things (format 12) says its blocks itself; else the words lowerStage kept
  const held = container && model.things[container] && layouts.length === 1 ? entriesOf(model, model.things[container], layouts[0]) : [];
  const entries = held.length ? held : layouts.flatMap((l) => model.layoutWords[l] ?? []).sort((a, b) => a.src.line - b.src.line);
  const cur: { h: Head | null } = { h: null };
  for (const e of entries) {
    const block = blockFor(e.word);
    if (block?.kind === "head" && e.word in HEAD_LAYOUT) {
      guard(e.src.line, () => {
        const node = block.parse({ word: e.word, arg: e.arg, body: indent(e.body, e.src.line + 1), line: e.src.line }, ctx);
        const h0: Head = { block, node, word: e.word, line: e.src.line, layout: HEAD_LAYOUT[e.word] };
        heads.push(h0); cur.h = h0;
      });
      continue;
    }
    const h = cur.h;
    if (!h) { problem(e.src.line, `"${e.word}" goes after the line that opens it (${Object.keys(HEAD_LAYOUT).join(", ")})`); continue; }
    guard(e.src.line, () => {
      if (h.block.more?.includes(e.word)) { h.block.op!(h.node, { word: e.word, arg: e.arg, body: indent(e.body, e.src.line + 1), line: e.src.line, step: 0 }, ctx); return; }
      const t = `${e.word} ${e.arg}`.trim(), line: Line = { n: e.src.line, ind: 0, t };
      if (!h.block.claim?.(h.node, line, indent(e.body, e.src.line + 1), ctx)) problem(e.src.line, `"${t.slice(0, 40)}" does not read in a ${h.word}: its lines are ${h.block.more?.length ? `${h.block.more.join(", ")}, ` : ""}and the rows the ${h.word} claims`);
    });
  }
  for (const h of heads) guard(h.line, () => h.block.check?.(h.node, ctx));

  // blocks of the scene that are not this lane's also own step words (`at` is the track's and the time block's): the
  // old stage called a word "shared" when more than one head owned it, and a shared word is refused quietly by a block
  // that has nothing of that name (the next owner gets it)
  const foreignOwners = new Map<string, number>();
  for (const [l, es] of Object.entries(model.layoutWords)) for (const e of es) { if (layouts.includes(l as LayoutName)) continue; const b = blockFor(e.word); if (b?.kind === "head") for (const o of b.ops ?? []) foreignOwners.set(o, (foreignOwners.get(o) ?? 0) + 1); }
  const offer = (word: string, arg: string, body: Line[], line: number, step: number, keep: boolean): boolean => {
    const own = heads.filter((h) => h.block.ops?.includes(word)), shared = own.length + (foreignOwners.get(word) ?? 0) > 1 || word === "show" || word === "light" || word === "hide";
    for (const h of own) { let r: unknown; guard(line, () => { r = h.block.op!(h.node, { word, arg, body, line, step, keep, shared }, ctx); }); if (r !== false) return true; }
    return false;
  };
  model.steps.forEach((s, si) => {
    for (const f of s.facts) {
      if (f.k === "layout") {
        const keep = f.word.startsWith("keep "), word = keep ? f.word.slice(5) : f.word;
        if (!offer(word, f.arg, toLines(f.body, f.src.line + 1), f.src.line, si + 1, keep) && heads.some((h) => h.block.ops?.includes(word)) && !foreignOwners.get(word)) problem(f.src.line, `no ${heads.filter((h) => h.block.ops?.includes(word)).map((h) => h.word).join(" or ")} of this scene has what "${word} ${f.arg}" names`);
      } else if (f.k === "show" || f.k === "hide" || f.k === "light") {
        const ids = f.ids, note = f.k === "light" && f.note ? `: ${f.note}` : "";
        if (!offer(f.k, ids.join(", ") + note, [], f.src.line, si + 1, false) && f.k === "hide") offer(f.k, ids.join(" ") + note, [], f.src.line, si + 1, false);
      }
    }
  });
  const built: Built = { heads, problems, steps: n, ctx };
  per.set(key, built);
  return built;
}

/** the Box a block lays out in: the stage's own, less its side margins */
export function boxFor(model: Model, width: number, phone: boolean, pad: number): Box {
  return { w: width - 2 * pad, narrow: phone, steps: Math.max(1, model.steps.length), stepTitles: model.steps.map((s) => s.title), noteH: () => 0 };
}

/** the facts of every head for the LLM view: the setup's, then each step's with its number */
export function headFacts(b: Built): string[] {
  const out: string[] = [];
  for (const h of b.heads) out.push(...h.block.facts(h.node, 0));
  for (let k = 1; k <= b.steps; k++) for (const h of b.heads) out.push(...h.block.facts(h.node, k).map((f) => `Step ${k}: ${f}`));
  return out;
}
export type { Fact };
