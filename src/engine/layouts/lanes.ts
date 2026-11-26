// Layout family "lanes" (lane L-lanes): regions are columns (and bands under, above or across them), cards stacked,
// cards inside cards, `...` lines, the phone's stacking, the still rule (a place for every card from the start).
// The composed stage's own compile and layout (core/stage*.ts) are called for GEOMETRY only: the lanes' places, a rect per
// card per step, where a card's parts sit, and the lines in the lane gaps (with their words' chips). What a card shows is
// drawn from the Model and the core's states (lanes/cards.ts, through thingPrims): its title, lines, state chip, tone,
// dim, shape, tokens, record values, badges and pills. The stage's own card items are left out of the decor; what stays
// there is the lanes' own drawing (headings, regions, `...` lines, keys, notes, says, line words, head blocks).
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../core/stage";
import { withStageBudget, newBudget, BudgetError } from "../../core/stage-budget";
import type { Item, StageBlock } from "../../core/stage-core";
import { CHART } from "../charts";
import type { Id, LayoutCtx, LayoutInput, LayoutPlugin, Model, Placed, Prim, Rect, Relation, ThingState } from "../types";
import { idOfBox, isWire, itemPrims, pathD, shownAt } from "./lanes/items";
import { cardGeos, cardItems, cardPrims, pillRect } from "./lanes/cards";
import { cardSteps } from "./lanes/words";
import { chipsOffTitles } from "./lanes/chips"; // render2
import { stageRoles, stageSrcOf } from "./lanes/stage-src";
import { PANEL_WORDS } from "./grid/legacy"; // eng-migrate2
import { lanesLlm } from "./lanes/llm"; // llm3
import { rowsNeed } from "../../core/stage-blocks"; // render3

/** can the chart system draw this kind yet? (a kind still a stub keeps the stage's own block, so nothing goes backwards) */
const ready = new Map<string, boolean>();
export function chartReady(kind: string): boolean {
  let r = ready.get(kind); if (r !== undefined) return r;
  try {
    CHART[kind as keyof typeof CHART].draw({ kind: kind as never, title: "", unit: null, x: ["a"], series: [{ name: "", role: null, values: [1] }], flags: [], opts: {} }, [[1]], { x: 0, y: 0, w: 200, h: 100 }, { phone: false, look: "stage", measure: () => 10, step: 1, prev: null, max: [[1]], lit: [] });
    r = true;
  } catch (e) { r = !/not built yet/.test(String((e as Error)?.message ?? e)); }
  ready.set(kind, r); return r;
}
/** ADAPTER (named in lanes/NOTES.md): a stage chart block the chart system cannot draw whole yet keeps the stage's own
 * drawing. The chart system draws a stage block's numbers, labels and axis; a block that uses any other of its own
 * words (setup words such as `tabs`, step words such as `peak`, `heading`, `big`, `limit`, `move`) stays the stage's */
export const CHART_DRAWS_OPTS = new Set(["axis", "every", "total", "badges", "text", "max"]); // max: a column block's scale over the story (lower-stage) // `line` (a bar block's guide line and its words): drawn outside the part on a phone (gt 09), so it stays the stage's
export function chartDraws(model: Model, spec: { opts: Record<string, string> }, ops: string[]): boolean {
  // a stage bar block the chart system draws whole (eng-stagebars lowers its words to opts: bar-steps, bar-most, line, tabs ...)
  if (spec.opts.stage === "bars") return true;
  if (Object.keys(spec.opts).some((k) => !CHART_DRAWS_OPTS.has(k))) return false;
  const own = new Set(ops);
  return !model.steps.some((s) => s.facts.some((f) => f.k === "layout" && own.has(f.word)));
}
/** the stage's block for a chart thing, with its drawing taken out: it keeps its place and height and leaves one slot item (id = the chart thing), which the pipeline draws the chart in */
const slotBlock = (b: StageBlock, id: string): StageBlock => ({ ...b, layout: (node, box) => { const out = b.layout(node, box); return { ...out, items: [{ k: "box", x: 0, y: 0, w: box.w, h: out.h, fill: "none", stroke: "none", r: 0, cls: SLOT, id }] }; } });
export const SLOT = "stg-chart-slot";

/** render3: a rows panel keeps its columns over the story: every panel with the same head line (and as many columns) gets
 *  the widest each column needs in any step that shows it (SPEC: one size per thing for the whole story) */
function keepColumns(steps: { panels: { block: { word: string }; node: unknown }[] }[]) {
  const groups = new Map<string, Parameters<typeof rowsNeed>[0][]>();
  for (const s of steps) for (const p of s.panels) {
    if (p.block.word !== "rows") continue;
    const t = p.node as Parameters<typeof rowsNeed>[0], key = JSON.stringify(t.head);
    if (!t.head.length) continue;
    const g = groups.get(key) ?? []; if (!g.includes(t)) g.push(t); groups.set(key, g);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const needs = g.map(rowsNeed), n = needs[0].length;
    if (needs.some((x) => x.length !== n)) continue;
    const keep = Array.from({ length: n }, (_, j) => Math.max(...needs.map((x) => x[j])));
    for (const t of g) t.keep = keep;
  }
}

type Laid = { items: Item[]; w: number; h: number; phone: boolean };

/** compile and lay out the stage for a Model at one width; problems go to the context */
export function layStage(model: Model, width: number, problem: LayoutCtx["problem"]): Laid {
  const src = stageSrcOf(model);
  for (const p of src.problems ?? []) problem(p);
  return withStageBudget(newBudget(STAGE_WORK, STAGE_MEMORY), () => {
    try {
      const info: Record<string, string> = { ...src.info };
      if (model.title && info.title === undefined) info.title = model.title;
      const c = compileStage(src.head, src.steps, src.base, info, stageRoles(model));
      for (const e of c.errors) problem({ line: e.line, msg: e.msg });
      for (const e of c.warnings) problem({ line: e.line, msg: e.msg, warn: true });
      // charts the Model holds as things (bars, columns, units) are drawn by the chart system once it can
      for (const t of Object.values(model.things)) {
        const at = t.chart ? Number(t.keys.headAt) : -1;
        if (t.chart && at >= 0 && c.model.head[at] && chartReady(t.chart.kind) && chartDraws(model, t.chart, c.model.head[at].block.ops ?? [])) c.model.head[at] = { ...c.model.head[at], block: slotBlock(c.model.head[at].block, t.id) };
      }
      keepColumns(c.model.steps); // render3
      const plan = layoutStage(c.model, width);
      return { items: plan.items, w: plan.w, h: plan.h, phone: !!plan.phone };
    } catch (e) {
      if (e instanceof BudgetError) { problem({ line: 0, msg: "this scene is too large to lay out" }); return { items: [], w: width, h: 80, phone: false }; }
      throw e;
    }
  });
}

/** the connector items between two things (the engine asks for a line per relation; the stage drew one per step it shows in) */
const wireKey = (from: Id, to: Id) => `${from}>${to}`;

export function placeLanes(input: LayoutInput, ctx: LayoutCtx): Placed {
  const { model } = input;
  const laid = layStage(model, Math.round(input.avail ?? ctx.width), ctx.problem); // a lanes scene inside another layout lays out at the width its parent gives it
  const items = chipsOffTitles(laid.items, model, Math.max(1, input.states.length - 1), laid.w, laid.h); // render2: a line's words never cover a card's title
  const known = new Set(Object.keys(model.things));
  // the stage draws a line to or from a card inside a card at the card that holds it, and names it by the holders
  const top = (id: Id): Id => { let t = id; for (let i = 0; i < 8; i++) { const p = model.things[t]?.parent; if (!p) break; t = p; } return t; };
  const keyOf = (r: Relation) => wireKey(top(r.from), top(r.to));
  const relPairs = new Set(Object.values(model.relations).map(keyOf));
  /** a connector the engine draws itself, through `routes` (the relation exists in the Model) */
  const routed = (it: Item) => it.k === "path" && isWire(it) && relPairs.has(it.id!);
  const last = Math.max(1, input.states.length - 1);
  const stepOf = (k: number) => Math.min(Math.max(k, 1), last);

  const geo = cardGeos(items, model);
  const cs = cardSteps(model);
  // the card boxes: one rect per thing per step, in the stage's own coordinates; a pill sits in its slot of the card it is in
  const rectCache = new Map<number, Record<Id, Rect>>();
  const at = (step: number): Record<Id, Rect> => {
    const k = stepOf(step);
    let hit = rectCache.get(step); if (hit) return hit;
    hit = {};
    for (const it of items) {
      if (it.k !== "box" || !it.id || !shownAt(it, k)) continue;
      const id = idOfBox(it.id)!;
      if (known.has(id)) hit[id] = { x: it.x, y: it.y, w: it.w, h: it.h };
    }
    for (const id of model.order) { const r = pillRect(model, geo, id, input.states[step]?.things[id]); if (r) hit[id] = r; }
    rectCache.set(step, hit);
    return hit;
  };

  // the decor at a step: the lanes' own drawing. A chip of the lanes' own words (a line's words, a say, an `inside` chip)
  // and its words are `eng-top`: drawn over the cards and the lines, as the stage drew them (a line's words sit on it)
  const decorCache = new Map<number, Prim[]>();
  const decor = (step: number): Prim[] => {
    const k = stepOf(step), key = step === 0 ? 0 : k;
    const hit = decorCache.get(key); if (hit) return hit;
    const out: Prim[] = [];
    const cards = cardItems(items, model, k); // drawn from the Model by `draw`
    let chip = false; // the words right after a chip box, line after line, are the chip's
    items.forEach((it, i) => {
      if (!shownAt(it, k) || routed(it) || cards.has(i) || (it.k === "box" && it.cls === SLOT)) { chip = false; return; }
      const onTop = (it.k === "box" && it.cls === "stg-chip") || (chip && it.k === "text" && it.f === "chip");
      chip = onTop; // every line of a chip's words (a say wraps to two or three) goes with its chip
      // the setup (step 0) is the first step without its lights and dims
      for (const p of itemPrims(step === 0 ? { ...it, hot: [], dim: [] } as Item : it, i, k)) out.push(onTop ? { ...p, cls: p.cls ? `${p.cls} eng-top` : "eng-top" } : p);
    });
    decorCache.set(key, out);
    return out;
  };

  const routes = (step: number, rel: Relation, _a: Rect, _b: Rect): string | null => {
    const k = stepOf(step), id = keyOf(rel);
    const cands = items.filter((x) => x.k === "path" && x.id === id && isWire(x) && shownAt(x, k)) as Extract<Item, { k: "path" }>[];
    if (!cands.length) return null;
    // two relations that share holders share a name: the n-th relation drawn in this step takes the n-th line
    const mates = Object.values(model.relations).filter((r) => keyOf(r) === id && input.states[step]?.relations[r.id]?.visible !== false);
    const n = Math.max(0, mates.findIndex((r) => r.id === rel.id));
    const j = Math.min(n, cands.length - 1), it = cands[j];
    // more relations than the stage drew lines (the stage draws one line for a pair and its reverse, `bc -> oc` then
    // `oc -> bc`): a later one shares the line of the relation that took it, run backwards when it goes the other way,
    // so what it carries travels from its own source
    const owner = n > j ? mates[j] : null;
    const back = !!owner && owner.from === rel.to && owner.to === rel.from && owner.from !== owner.to;
    return pathD(back ? [...it.pts].reverse() : it.pts, it.curve);
  };

  // a card at a step: from the Model and the core's state, in the rect the stage gave it
  const width = laid.w;
  const draw = (step: number, id: Id, rect: Rect, st: ThingState): Prim[] | null => {
    const t = model.things[id]; if (!t) return null;
    return cardPrims(t, st, rect, { model, step, cs: cs[step] ?? cs[cs.length - 1], phone: ctx.phone, look: model.look, width, geo });
  };
  // `words: "own"`: the stage's chips for a line's words are in the decor (placed in the lane gaps, never on a card), so the renderer adds none
  return { w: laid.w, h: laid.h, at, decor, routes, draw, words: "own" };
}

export const Lanes: LayoutPlugin = {
  name: "lanes",
  // words only the lanes layout reads (the composed stage's pills, badges, keys, marks and light notes)
  // eng-migrate2: and the card words lanes/words.ts reads (a format 12 lanes scene writes them: `dashed id [off]`, `fill id key: v` ...),
  // and the step panels (`card`, `calc`, `rows` ...): a lanes scene draws them through the stage it hosts, as the composed stage did
  words: { setup: [], step: ["key", "mark", "beside", "cut", "inside", "title", "dashed", "cross", "fill", "state-tone", ...PANEL_WORDS] },
  place: placeLanes,
  llm: lanesLlm, // llm3: the hosted stage's blocks, key and lanes-only card words (lanes/llm.ts)
};
