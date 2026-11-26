// Parts: the Model things of a head-block layout (timeline, sheet, wrap, track, the grid's ported words).
// lane blocks2. The old blocks (src/core/stage-time.ts, stage-sheet.ts, stage-nest.ts, stage-slanes.ts, stage-bins.ts ...)
// keep what they are good at, MEASURED PLACEMENT; they no longer decide what shows at a step. Each block lays its drawing
// out once and says per item when it shows (from, to, on), when it is lit (hot) and when it is faded (dim). Items that
// share one such window are one PART: the front end (lowerStage, parse12) makes a Model thing for every part and writes
// its life into the steps as facts (`show`, `hide`, `dim`, `light`). From then on the Model and the StepState decide:
//   - core.states says whether a part shows or is faded in step k; core.diff says it entered, so the camera frames it;
//   - the layout's `at(step)` gives every visible part the real rect of what it draws;
//   - the layout's `decor(step)` draws an item only when its part shows in the StepState of that step.
// A part is named `<layout>-<n>` (n by first appearance, wide drawing first); `keys.sig` is its window, `keys.part` the
// layout, `title` a plain-words description for the LLM view.
import { measure, LINE_H, type Item, type Font } from "../../core/stage-core";
import type { Fact, Id, Model, Rect, StepState, Thing } from "../types";

/** the grid container that holds the step panels of a scene whose heads belong to another layout (blocks2) */
export const HOST = "grid-panels";

/** when an item shows (the stage's `When`): `on` lists steps; else from..to (to 0 = to the end); hot = lit steps; dim = faded steps */
export type Vis = { from?: number; to?: number; on?: number[]; hot?: number[]; dim?: number[] };

const list = (a?: number[]) => (a && a.length ? [...a].sort((x, y) => x - y).join(",") : "");
/** the window of an item as a key: items with one key are one part */
export const sigOf = (v: Vis): string => (v.on ? `on:${list(v.on)}` : `${v.from ?? 1}-${v.to ?? 0}`) + `|h${list(v.hot)}|d${list(v.dim)}`;

/** is the item on screen at step k >= 1 (the stage's rule) */
export const shownAt = (v: Vis, k: number): boolean => (v.on ? v.on.includes(k) : k >= (v.from ?? 1) && (!v.to || k <= v.to));
/** the setup (step 0) of a stage whose first picture is step 1 */
export const shownFirst = (v: Vis): boolean => shownAt(v, 1);
/** the setup of the grid's blocks: what shows from the first step on and does not end (a step-only frame waits for its step) */
export const shownSetup = (v: Vis): boolean => !v.on && (v.from ?? 1) <= 1 && !v.to;

/** the bounding box of one drawing item (text: measured; a path: its points) */
export function itemRect(it: Item): Rect | null {
  switch (it.k) {
    case "box": return { x: it.x, y: it.y, w: Math.max(0, it.w), h: Math.max(0, it.h) };
    case "text": {
      const f = it.f as Font, lines = it.breaks?.length ? it.breaks.length + 1 : 1, w = Math.max(1, measure(it.s, f) / (it.breaks?.length ? lines : 1)), h = (LINE_H[f] ?? 16) * lines;
      if (it.rotate === 90) return { x: it.x - h / 2, y: it.y - w / 2, w: h, h: w };
      const x = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x;
      return { x, y: it.y - (LINE_H[f] ?? 16) * 0.75, w, h };
    }
    case "path": {
      const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]); if (!xs.length) return null;
      const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      return { x: x - (w < 2 ? 1 : 0), y: y - (h < 2 ? 1 : 0), w: Math.max(w, 2), h: Math.max(h, 2) }; // a line has a width
    }
    case "badge": return { x: it.x, y: it.y, w: 17, h: 17 };
    case "tri": return { x: it.x - 1, y: it.y - 5, w: 8, h: 10 };
  }
}
export const union = (a: Rect | null, b: Rect | null): Rect | null => {
  if (!a || !b) return a ?? b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** one item as the parts see it: its window and what it covers */
export type PartItem = { vis: Vis; rect: Rect | null };

/** the plain words of a window ("steps 2 to the end", "step 3 only", "steps 1, 3") */
function describe(sig: string, layout: string): string {
  const [w] = sig.split("|");
  if (w.startsWith("on:")) return `${layout}: shown in step ${w.slice(3).split(",").join(", ")}`;
  const [a, b] = w.split("-").map(Number);
  return `${layout}: ${b === 0 ? (a <= 1 ? "shown throughout" : `shown from step ${a}`) : a === b ? `shown in step ${a} only` : `shown in steps ${a} to ${b}`}`;
}

/**
 * Make the Model things and the step facts of a layout's parts. `drawn` is one list of items per drawing (a wide and a phone
 * one): a window that only one of them has is a part too. A part is its own thing: no region, no parent, no title in the picture.
 */
export function addParts(model: Model, layout: string, drawn: PartItem[][], setup0: (v: Vis) => boolean, parent: Id | null = null): void {
  const n = model.steps.length;
  if (!n) return;
  const seen = new Map<string, Vis>();
  for (const items of drawn) for (const it of items) { const s = sigOf(it.vis); if (!seen.has(s)) seen.set(s, it.vis); }
  let c = 0;
  const at = (k: number): Fact[] => model.steps[k - 1].facts;
  for (const [sig, vis] of seen) {
    if (!Array.from({ length: n }, (_, i) => i + 1).some((k) => shownAt(vis, k))) continue; // never on screen: no part, the items stay out
    const id: Id = `${layout}-${++c}`;
    const line = model.steps[0]?.src.line ?? 0;
    const t: Thing = {
      id, role: null, title: describe(sig, layout), lines: [], flags: ["part"], shape: "box", layout: null, container: false, parent, region: null,
      order: model.order.length, values: null, keys: { part: layout, sig }, chart: null, src: { line },
    };
    model.things[id] = t; model.order.push(id);
    // its life: shown or hidden at each step, faded in the steps its items fade in, lit in the steps they are lit
    let was = setup0(vis), dim = false;
    for (let k = 1; k <= n; k++) {
      const on = shownAt(vis, k), src = { line: model.steps[k - 1].src.line };
      if (on !== was) at(k).push({ k: on ? "show" : "hide", ids: [id], src });
      was = on;
      const d = !!vis.dim?.includes(k);
      if (d !== dim) { at(k).push({ k: "dim", ids: [id], on: d, src }); dim = d; }
      if (vis.hot?.includes(k)) at(k).push({ k: "light", ids: [id], src });
    }
  }
}

/** how a layout reads its parts back: which part an item is, and what the StepState says about it */
export class Parts {
  private byWindow = new Map<string, Id>();
  constructor(private model: Model, private states: StepState[], layout: string) {
    for (const id of model.order) { const t = model.things[id]; if (t.keys.part === layout) this.byWindow.set(t.keys.sig, id); }
  }
  get any(): boolean { return this.byWindow.size > 0; }
  /** the part of an item, if the front end made one for its window */
  of(v: Vis): Id | undefined { return this.byWindow.get(sigOf(v)); }
  /** is the item on screen at this step: the part's state decides; an item with no part (a width the front end never drew) keeps its own window */
  shown(v: Vis, step: number, first: (v: Vis) => boolean = shownFirst): boolean {
    const id = this.of(v);
    if (id === undefined || !this.states[step]) return step === 0 ? first(v) : shownAt(v, step); // no part, or no state for this step (a bare layout test): the block's own window
    return !!this.states[step].things[id]?.visible;
  }
  dim(v: Vis, step: number): boolean { const id = this.of(v); return id === undefined || !this.states[step] ? !!v.dim?.includes(step) : !!this.states[step].things[id]?.dim; }
  lit(v: Vis, step: number): boolean {
    const id = this.of(v); if (id === undefined || !this.states[step]) return !!v.hot?.includes(step);
    return step >= 1 && !!this.model.steps[step - 1]?.facts.some((f) => f.k === "light" && f.ids.includes(id));
  }
  /** the rect of every part visible at a step, from the union of what its items cover (`rects`: part -> rect, still for the whole story) */
  at(rects: Map<Id, Rect>, step: number): Record<Id, Rect> {
    const out: Record<Id, Rect> = {};
    for (const [id, r] of rects) if (this.states[step]?.things[id]?.visible) out[id] = r;
    return out;
  }
  /** an item's part joined to the rect it covers (call for each item of the drawing in use) */
  cover(rects: Map<Id, Rect>, v: Vis, r: Rect | null) {
    const id = this.of(v); if (id === undefined || !r) return;
    const have = rects.get(id), u = union(have ?? null, r); if (u) rects.set(id, u);
  }
}
