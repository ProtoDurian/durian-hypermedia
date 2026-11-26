// Layout family "time" (lane L-time): the `timeline` layout. A port, not a rewrite: the composed stage's time block
// (src/core/stage-time.ts) keeps its grammar and its measured layout rules (an axis, rows of states, markers `at`,
// `span`s, an inset `zoom`, `plot:`, the phone forms). This file wires it to the one engine's contract:
//   words.setup / words.step  the time words, handed over verbatim by the front end (layouts/time/words.ts)
//   place()                   replays them into the block (layouts/time/adapter.ts) to MEASURE: it lays the story out once
//                             (the still rule: every part keeps its place), at the width its parent gives it
//   the Model                 decides what shows at a step (blocks2): every part of the drawing (layouts/parts.ts) is a Model
//                             thing the front end made (`timeParts`), so decor(step) draws an item only when the StepState
//                             says its part shows, lit or faded, and at(step) gives every visible part its real rect
//   llm()                     the block's facts for the LLM view
import type { LayoutInput, LayoutCtx, LayoutPlugin, Model, Placed, Prim, Rect, StepState } from "../types";
import { atSizes } from "../render/font";
import { captionWords, layoutScene, readScene, sceneFacts } from "./time/adapter";
import { primsAt } from "./time/prims";
import { KEEP_STEP_WORDS, SETUP_WORDS, STEP_WORDS } from "./time/words";
import { addParts, itemRect, Parts, shownFirst, type PartItem, type Vis } from "./parts";
import { PAD } from "../../core/stage-core";

const visOf = (it: unknown): Vis => it as Vis;

/** the drawing at a wide and at a phone width, as the parts see it (the front end makes the Model things from it) */
export function timeDrawn(model: Model): PartItem[][] {
  const scene = readScene(model);
  if (scene.problems.length && !scene.heads.length) return [];
  return [[1280, false], [390, true]].map(([w, phone]) => atSizes(phone as boolean, () => layoutScene(scene, w as number, phone as boolean).items.map((it) => ({ vis: visOf(it), rect: itemRect(it) }))));
}
/** make the parts of a model whose timeline words are in `model.layoutWords.timeline` (parse lane front ends call this once, last) */
export function timeParts(model: Model): void {
  if (model.layout !== "timeline" || !model.layoutWords.timeline?.length) return;
  addParts(model, "timeline", timeDrawn(model), shownFirst);
}

export const Timeline: LayoutPlugin = {
  name: "timeline",
  words: { setup: SETUP_WORDS, step: [...STEP_WORDS, ...KEEP_STEP_WORDS] },
  place(input: LayoutInput, ctx: LayoutCtx): Placed {
    const W = Math.max(40, Math.round(input.avail ?? ctx.width)), phone = ctx.phone || W < 480;
    const scene = readScene(input.model);
    for (const p of scene.problems) ctx.problem(p);
    const laid = atSizes(phone, () => layoutScene(scene, W, phone)); // the phone's sizes only while measuring (render/font.ts)
    const parts = new Parts(input.model, input.states, "timeline");
    const rects = new Map<string, Rect>();
    atSizes(phone, () => { for (const it of laid.items) parts.cover(rects, visOf(it), itemRect(it)); });
    // containers of another layout under the timeline (the step panels: a grid), each as wide as the timeline less its margins
    const kids = input.members.filter((id) => input.model.things[id]?.container && input.model.things[id]?.layout);
    const kidAt = new Map<string, Rect>(); let bottom = laid.h;
    for (const id of kids) { const c = ctx.child(id, W - 2 * PAD); kidAt.set(id, { x: PAD, y: bottom + (bottom > 0 ? 8 : 0), w: c.w, h: c.h }); bottom += (bottom > 0 ? 8 : 0) + c.h; }
    const cache = new Map<number, Prim[]>();
    const view = { shown: (it: unknown, k: number) => parts.shown(visOf(it), k), hot: (it: unknown, k: number) => parts.lit(visOf(it), k), dim: (it: unknown, k: number) => parts.dim(visOf(it), k) };
    const states: StepState[] = input.states;
    return {
      w: W, h: bottom,
      at: (step) => { const out = parts.at(rects, Math.min(step, states.length - 1)); for (const [id, r] of kidAt) if (states[step]?.things[id]?.visible !== false) out[id] = r; return out; },
      caption: (step) => captionWords(scene, step, input.model.steps[step - 1]?.caption ?? ""),
      decor: (step) => { const k = Math.max(1, step); let p = cache.get(k); if (!p) { p = primsAt(laid.items, k, view as never); cache.set(k, p); } return p; },
      // the items are drawn by decor: the engine draws no card for a part
      draw: (_step, id) => (rects.has(id) || kidAt.has(id) ? [] : null),
    };
  },
  llm(model: Model, _states: StepState[]): string[] {
    return sceneFacts(readScene(model));
  },
};
