// Layout family "sheet" (lane L-sheet): `sheet` (the worksheet), `wrap` (boxes inside boxes, with fields) and `track`
// (the phase strip). Contract: ../types.ts LayoutPlugin, ../ENGINE.md section 3; what the parse lane hands over and
// what the three words mean: ./sheet/SHEET.md.
//
// A port, not a rewrite: the old stage's head blocks (src/core/stage-sheet.ts, stage-nest.ts, stage-blocks.ts `track`)
// keep every measured rule; ./sheet/blocks.ts reads them from the Model, ./sheet/place.ts stacks them, ./sheet/items.ts
// turns their items into primitives.
import { blockFor } from "../../core/stage-core";
import type { LayoutName, LayoutPlugin, Model, Problem } from "../types";
import { buildHeads, headFacts, HEAD_LAYOUT } from "./sheet/blocks";
import { placeSheetFamily } from "./sheet/place";

/** the words a layout owns: its head word and the old block's `more` and step words */
function wordsOf(layout: LayoutName): { setup: string[]; step: string[] } {
  const setup: string[] = [], step: string[] = [];
  for (const [w, l] of Object.entries(HEAD_LAYOUT)) {
    if (l !== layout) continue;
    const b = blockFor(w)!;
    setup.push(w, ...(b.more ?? [])); step.push(...(b.ops ?? []));
  }
  return { setup, step };
}

function plugin(name: LayoutName): LayoutPlugin {
  const own = wordsOf(name);
  return {
    name,
    // `show`, `hide` and `light` stay the core's words; the old blocks take them back when the ids are theirs (blocks.ts)
    words: { setup: own.setup, step: own.step.filter((w) => w !== "show" && w !== "hide" && w !== "light") },
    // the old blocks check their words as they read them; the refusals are reported once, with the first step
    step(model: Model, prev: unknown, _facts, problem: (p: Problem) => void) {
      const seen = prev as { n: number } | undefined;
      if (!seen) for (const p of buildHeads(model, [name]).problems) problem(p);
      return { n: (seen?.n ?? 0) + 1 };
    },
    place: (input, ctx) => placeSheetFamily(name, input, ctx),
    llm: (model) => headFacts(buildHeads(model, [name])),
  };
}
export const Sheet: LayoutPlugin = plugin("sheet");
export const Wrap: LayoutPlugin = plugin("wrap");
export const Track: LayoutPlugin = plugin("track");

// ---- blocks2: the parts of a scene laid out by sheet, wrap or track (layouts/parts.ts): Model things the front ends make
import { measure, wrap as wrapText } from "../../core/stage-core";
import { addParts, shownFirst, type PartItem } from "./parts";
/** the drawing of a scene at a wide and at a phone width, as the parts see it */
export function sheetDrawn(model: Model): PartItem[][] {
  const none = { w: 0, h: 0, at: () => ({}), decor: () => [] };
  return [[1280, false], [390, true]].map(([width, phone]) => {
    const sink: PartItem[] = [];
    const ctx = { width: width as number, phone: phone as boolean, look: model.look, measure: (t: string, f: never) => measure(t, f), wrap: (t: string, w: number, f: never, m?: number) => wrapText(t, w, f, m), child: () => none, problem: () => {} };
    placeSheetFamily(model.layout as LayoutName, { model, states: [], container: null, members: [], regions: [] }, ctx as never, sink);
    return sink;
  });
}
export function sheetParts(model: Model): void {
  if (!(model.layout === "sheet" || model.layout === "wrap" || model.layout === "track") || !model.layoutWords[model.layout]?.length) return;
  addParts(model, model.layout, sheetDrawn(model), shownFirst);
}
