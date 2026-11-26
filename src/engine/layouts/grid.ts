// Layout family "grid" (lane L-grid): the swimlane matrix, the step panels (grid N, rows, map, list, card, calc, cells, chips),
// bins as containers in a grid, and the plain native grid of format 12. Contract: ../types.ts LayoutPlugin, ../ENGINE.md section 3,
// and ./grid/CONTRACT.md for the words the front-ends hand this layout.
//
// Two paths, one plug-in:
//  - the ported words (matrix:, bins:, step panels), read from `model.layoutWords.grid` and step `layout` facts, laid out by the
//    stage's own block code (src/core/stage-slanes.ts, stage-bins.ts, stage-blocks.ts, stage-panels2.ts, stage-cells.ts);
//  - the native grid: a container `[grid]` whose regions are rows and whose members are cells (and containers: a bin is one).
import type { LayoutPlugin, Problem } from "../types";
import { HEAD_WORDS, PANEL_WORDS, readLegacy } from "./grid/legacy";
import { legacyLlm, placeLegacy } from "./grid/place-legacy";
import { placeNative } from "./grid/native";
import { addParts, shownSetup, type PartItem } from "./parts";
import { measure, wrap as wrapText, PAD } from "../../core/stage-core";
import type { Model } from "../types";

const reported = new WeakSet<object>();

/** the model's grid words are the ported kind when any head block or panel word reached this layout */
const isLegacy = (words: unknown[] | undefined, steps: { facts: { k: string; word?: string }[] }[]): boolean =>
  !!words?.length || steps.some((s) => s.facts.some((f) => f.k === "layout" && (PANEL_WORDS as readonly string[]).includes(f.word ?? "")));

export const Grid: LayoutPlugin = {
  name: "grid",
  words: { setup: [...HEAD_WORDS], step: [...PANEL_WORDS, "into", "beside"] },
  /** doccheck: the ported words are read once per model; their refusals are this layout's problems */
  step(model, prev, _facts, problem) {
    if (isLegacy(model.layoutWords.grid, model.steps) && !reported.has(model)) {
      reported.add(model);
      for (const p of readLegacy(model).problems) problem(p as Problem);
    }
    return prev ?? {};
  },
  place(input, ctx) {
    const { model } = input;
    return isLegacy(model.layoutWords.grid, model.steps) ? placeLegacy(input, ctx) : placeNative(input, ctx);
  },
  llm(model) {
    return isLegacy(model.layoutWords.grid, model.steps) ? legacyLlm(readLegacy(model), model.steps.length) : [];
  },
};

// ---- blocks2: the parts of the ported words' drawing (layouts/parts.ts): Model things the front ends make
/** the drawing at a wide and at a phone width, as the parts see it */
export function gridDrawn(model: Model, container: string | null = null): PartItem[][] {
  const none = { w: 0, h: 0, at: () => ({}), decor: () => [] };
  return [[1280, false], [390, true]].map(([width, phone]) => {
    const sink: PartItem[] = [];
    const ctx = { width: width as number, phone: phone as boolean, look: model.look, measure: (t: string, f: never) => measure(t, f), wrap: (t: string, w: number, f: never, m?: number) => wrapText(t, w, f, m), child: () => none, problem: () => {} };
    placeLegacy({ model, states: [], container, members: [], regions: [], ...(container ? { avail: (width as number) - 2 * PAD } : {}) }, ctx as never, readLegacy(model), sink);
    return sink;
  });
}
export function gridParts(model: Model, container: string | null = null): void {
  if ((container === null && model.layout !== "grid") || !isLegacy(model.layoutWords.grid, model.steps)) return;
  addParts(model, "grid", gridDrawn(model, container), shownSetup, container); // in the hosting container: its layout draws and places them
}
