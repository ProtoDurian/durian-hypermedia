// The timeline layout's port of the composed stage's time block (src/core/stage-time.ts, 164 KB: not rewritten).
// The block keeps its own grammar and its measured layout; this file replays the handed-over layout words into it
// (parse -> claim -> check -> op, as src/core/stage.ts does), runs its layout for one width, and returns its Items.
import { blockFor, PAD, StageError, type Box, type Item, type Line, type LayoutOut, type ParseCtx, type StageBlock } from "../../../core/stage-core";
import "../../../core/stage-time"; // registers the `time` block
import { pointLabelsOffLines } from "./labels"; // render2
import { newBudget, withStageBudget, type Budget } from "../../../core/stage-budget";
import type { Fact, Model, Problem } from "../../types";
import { lineText, splitKeep, STEP_WORDS } from "./words";

type LayoutFact = Extract<Fact, { k: "layout" }>;
type Head = { node: any; line: number };
/** one marker's words that the stage appends to the step caption (`at 6 [caption]: words`) */
export type CaptionAdd = { step: number; text: string; keep?: boolean };

export interface TimeScene {
  block: StageBlock;
  heads: Head[];
  steps: number;
  stepTitles: string[];
  captions: CaptionAdd[];
  problems: Problem[];
}

const LAYOUT_NAME = "timeline";
const lines = (body: string[], line: number): Line[] => body.map((t) => ({ n: line, ind: 1, t: t.trim() }));

/** A fresh work budget for one read or one layout: a page's stage never spends another's room. */
const budget = (): Budget => newBudget();

/** Read the model's timeline words into the block: heads, their setup lines, then every step's ops. */
export function readScene(model: Model, knownRoles?: Iterable<string>): TimeScene {
  return withStageBudget(budget(), () => {
    const block = blockFor("time");
    if (!block) throw new Error("the time block is not registered");
    const problems: Problem[] = [];
    const captions: CaptionAdd[] = [];
    const problem = (line: number, msg: string) => { problems.push({ line, msg }); };
    const steps = model.steps.length;
    const ctx: ParseCtx = {
      roles: new Set(knownRoles ?? Object.keys(model.roles)),
      problem, ids: new Set(Object.keys(model.things)), steps,
      caption: (step, text, keep) => { captions.push({ step, text, keep }); },
    };
    const heads: Head[] = [];
    const guard = (line: number, run: () => void) => { try { run(); } catch (e) { if (e instanceof StageError) problem(e.line || line, e.message); else throw e; } };

    // ---- the setup: `time:` starts a head; every other setup word is claimed by the last head
    for (const w of model.layoutWords[LAYOUT_NAME] ?? []) {
      const line = w.src.line, text = lineText(w.word, w.arg);
      guard(line, () => {
        if (w.word.replace(/:$/, "").trim() === "time") { // the head: its arg is "a..b | unit" or "name: a..b | unit", as the block reads it
          heads.push({ node: block.parse({ word: "time", arg: w.arg.replace(/^:\s*/, "").trim(), body: lines(w.body, line), line }, ctx), line });
          return;
        }
        const head = heads.at(-1);
        if (!head) { problem(line, `"${text.split(":")[0]}" goes after a "time:" line`); return; }
        if (!block.claim!(head.node, { n: line, ind: 0, t: text }, lines(w.body, line), ctx)) problem(line, `this time line does not read: "${text}"`);
      });
    }
    for (const h of heads) guard(h.line, () => block.check?.(h.node, ctx));

    // ---- the steps: each layout fact is offered to every head in source order, as the stage does
    // `show <axis name>` arrives as a layout fact too (parse hands it to the layout that has such a name); `at prepare` may be a
    // phase strip's: another layout of this scene owns the word then, and a line none of my axes takes is not an error
    const own = new Set([...STEP_WORDS, "show"]);
    const others = Object.keys(model.layoutWords).some((n) => n !== LAYOUT_NAME && model.layoutWords[n].length > 0);
    model.steps.forEach((s, i) => {
      for (const f of s.facts) {
        if (f.k !== "layout") continue;
        const keepFlag = (f as { keep?: boolean }).keep;
        const { word, arg, keep } = splitKeep(f.word, f.arg, keepFlag);
        if (!own.has(word)) continue;
        guard(f.src.line, () => {
          if (!heads.length) { problem(f.src.line, `"${word}" works on a time axis: declare one with "time:" in the setup`); return; }
          const shared = heads.length > 1 || others || word === "show";
          for (const h of heads) if (block.op!(h.node, { word, arg: arg.replace(/^:\s*/, ""), body: lines(f.body, f.src.line), line: f.src.line, step: i + 1, keep, shared }, ctx) !== false) return;
          if (shared) return;
          problem(f.src.line, `no time axis of this scene has what "${keep ? "keep " : ""}${word} ${arg}" names`);
        });
      }
    });
    return { block, heads, steps, stepTitles: model.steps.map((s) => s.title), captions, problems };
  });
}

/** What one layout at one width gives: the block's Items in the stage's frame (x from PAD, y from 8) and its height. */
export interface Laid { items: Item[]; h: number; heads: LayoutOut[] }

export function layoutScene(scene: TimeScene, width: number, phone: boolean): Laid {
  return withStageBudget(budget(), () => {
    const { block, heads, steps, stepTitles } = scene;
    const box: Box = { w: width - 2 * PAD, narrow: phone || width < 480, steps, stepTitles };
    // heads that share a column key share their widest gutter (stage.ts: columnLeft)
    const groups = new Map<string, { head: Head; left: number }[]>(), columnLeft = new Map<Head, number>();
    for (const head of heads) {
      const c = block.columns?.(head.node, box); if (!c) continue;
      const g = groups.get(c.key) ?? []; g.push({ head, left: c.left }); groups.set(c.key, g);
    }
    for (const g of groups.values()) if (g.length > 1) { const left = Math.max(...g.map((c) => c.left)); for (const c of g) columnLeft.set(c.head, left); }
    const items: Item[] = [], outs: LayoutOut[] = [];
    let y = 8;
    for (const head of heads) {
      const out = block.layout(head.node, { ...box, ...(columnLeft.has(head) ? { columnLeft: columnLeft.get(head) } : {}) });
      outs.push(out);
      items.push(...pointLabelsOffLines(out.items).map((it) => shiftItem(it, PAD, y))); // render2: a plot line never runs through a point label
      y += out.h + 12;
    }
    return { items, h: Math.max(y, 8), heads: outs };
  });
}

/** `shift` of stage-core, minus the `when` merge (the block's items already carry their steps) */
function shiftItem(it: Item, dx: number, dy: number): Item {
  if (it.k === "path") return { ...it, pts: it.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  return { ...it, x: (it as { x: number }).x + dx, y: (it as { y: number }).y + dy } as Item;
}

/** words a `[caption]` marker adds to a step's caption (stage.ts: each once, from its step to the end when kept or written in the setup) */
export function captionWords(scene: TimeScene, step: number, caption: string): string[] {
  const out: string[] = [];
  for (const c of scene.captions) {
    const from = Math.max(1, c.step), to = c.keep || !c.step ? scene.steps : c.step;
    if (step >= from && step <= to && !caption.includes(c.text) && !out.includes(c.text)) out.push(c.text);
  }
  return out;
}

/** the LLM view's lines: the block's facts, step 0 = the setup, then `Step k:` per fact */
export function sceneFacts(scene: TimeScene): string[] {
  return withStageBudget(budget(), () => {
    const out: string[] = [];
    for (let k = 0; k <= scene.steps; k++) {
      const facts = scene.heads.flatMap((h) => scene.block.facts(h.node, k));
      if (k === 0) out.push(...facts); else out.push(...facts.map((f) => `Step ${k}: ${f}`));
    }
    return out;
  });
}
