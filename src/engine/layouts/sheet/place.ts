// Lane sheet: one `place` for the three layouts of this family (sheet, wrap, track). A scene (or a container) of one of
// them is a stack: the head blocks of the layout in source order, 12 px apart, then the containers the scene holds that
// are laid out by other layouts (`ctx.child`), as the old stage stacked a worksheet, a phase strip and its panels.
// Geometry is computed once for the whole story (the still rule): the blocks say per item in which steps it shows.
import { setPhoneLines, PAD } from "../../../core/stage-core";
import { atSizes } from "../../render/font";
import { setPhone } from "../../../core/stage-phone";
import { setCardPad } from "../../../core/stage-cards";
import type { Id, LayoutCtx, LayoutInput, LayoutName, Placed, Prim, Rect, StepState } from "../../types";
import { boxFor, buildHeads, MY_LAYOUTS } from "./blocks";
import { drawItems, stepsOf, type Drawn } from "./items";
import { noteBands, ownsNotes } from "./notes";
import { Parts, type PartItem } from "../parts";

const TOP = 8, GAP = 12;
/** the steps (0..n) a member container is visible in */
function visibleIn(states: StepState[], id: Id): Set<number> {
  const s = new Set<number>();
  states.forEach((st, k) => { if (st.things[id]?.visible) s.add(k); });
  return s;
}

/** `sink`: the front end asks for every item's window and rect (the parts are made from them); `partsOf`: the layout the Model's parts belong to */
export function placeSheetFamily(name: LayoutName, input: LayoutInput, ctx: LayoutCtx, sink?: PartItem[], partsOf: string = name): Placed {
  const { model, states } = input, root = input.container === null;
  const n = model.steps.length;
  // an entry kind that a member container of this scene already lays out (its own layout) is not drawn twice
  const childLayouts = new Set<LayoutName>(input.members.map((id) => model.things[id]).filter((t) => t?.container && t.layout).map((t) => t!.layout!));
  const layouts = root ? MY_LAYOUTS.filter((l) => l === name || !childLayouts.has(l)) : [name];
  const built = buildHeads(model, layouts, input.container);
  const W0 = Math.round(input.avail ?? ctx.width), pad = root ? PAD : 0, box = boxFor(model, W0, ctx.phone, PAD); // the width its parent gives it (blocks2)
  const known = (id: string) => !!model.things[id] && !model.things[id].flags.includes("part");
  const pv = new Parts(model, states, partsOf);

  // the old stage laid every narrow scene out with its phone settings on, and put them off after
  setPhone(ctx.phone); setCardPad(ctx.phone); setPhoneLines(ctx.phone);
  type Part = { order: number; head?: (typeof built.heads)[number]; child?: Id };
  const parts: Part[] = [
    ...built.heads.map((h) => ({ order: h.line, head: h })),
    ...input.members.filter((id) => model.things[id]?.container && model.things[id]?.layout).map((id) => ({ order: model.things[id].src.line, child: id })),
  ].sort((a, b) => a.order - b.order);

  const drawn: Drawn[] = [], childAt = new Map<Id, Rect>(), childPlaced = new Map<Id, Placed>();
  let y = root ? TOP : 0, bottom = y;
  // containers that never show in the same step share one place (the stage's panel region: as tall as the tallest)
  let region: { y: number; h: number; steps: Set<number> } | null = null;
  // eng-lanes2: where each placed block or container sits and the steps it shows in (a step's notes go under the last one)
  const spans: { y: number; h: number; steps: Set<number> }[] = [];
  let notesDrawn: Drawn | null = null;
  const closeRegion = () => { if (region) { y = region.y + region.h + GAP; bottom = Math.max(bottom, region.y + region.h); region = null; } };
  atSizes(ctx.phone, () => { try { // the phone's sizes only while the blocks measure (render/font.ts)
    for (const p of parts) {
      if (p.head) {
        closeRegion();
        const out = p.head.block.layout(p.head.node, box);
        drawn.push(drawItems(out.items, `sh:${input.container ?? ""}:${p.head.word}${built.heads.indexOf(p.head)}`, pad, y, n, known, pv.any ? pv : undefined));
        spans.push({ y, h: out.h, steps: new Set(out.items.flatMap((it) => stepsOf(it, n))) }); // eng-lanes2
        y += out.h + GAP; bottom = Math.max(bottom, y - GAP);
      } else if (p.child) {
        const placed = ctx.child(p.child, root ? W0 - 2 * PAD : undefined), steps = visibleIn(states, p.child);
        const disjoint = region && [...steps].every((k) => !region!.steps.has(k)) && steps.size > 0;
        if (!disjoint) { closeRegion(); region = { y, h: 0, steps: new Set() }; }
        region!.h = Math.max(region!.h, placed.h); for (const k of steps) region!.steps.add(k);
        childAt.set(p.child, { x: pad, y: region!.y, w: placed.w, h: placed.h }); childPlaced.set(p.child, placed);
        // eng-lanes2: a container counts in the steps it draws something in (a grid of panels is visible from the start)
        spans.push({ y: region!.y, h: placed.h, steps: new Set([...steps].filter((k) => k >= 1 && (placed.decor(k).length > 0 || Object.keys(placed.at(k)).length > 0))) });
      }
    }
    closeRegion();
    // eng-lanes2: a wrap scene's notes on the stage (sheet/notes.ts), each under the last part that shows in its step
    // (a worksheet's and a strip's notes sit by the stage's slot rules, beside an outcome column: not ported, they stay
    // in the caption)
    if (root && name === "wrap" && ownsNotes(model)) {
      const items = noteBands(model, box.w).flatMap((b, si) => {
        if (!b) return [];
        const k = si + 1, at = Math.max(TOP, ...spans.filter((s) => s.steps.has(k)).map((s) => s.y + s.h + GAP));
        bottom = Math.max(bottom, at + b.h);
        return b.items.map((it) => (it.k === "path" ? it : { ...it, y: (it as { y: number }).y + at }) as typeof it);
      });
      if (items.length) notesDrawn = drawItems(items, "sh::notes", pad, 0, n, known);
    }
  } finally { setPhone(false); setCardPad(false); setPhoneLines(false); } });

  const rectOf = new Map<Id, Rect>(); for (const d of drawn) for (const [id, r] of d.rects) if (!rectOf.has(id)) rectOf.set(id, r);
  const w = root ? W0 : W0 - 2 * PAD;
  const h = root ? Math.ceil(bottom + 6) : Math.ceil(bottom);
  const members = new Set<Id>([...rectOf.keys()]);
  // the parts of the drawing: Model things whose rect is what their items cover
  const partRects = new Map<Id, Rect>();
  for (const d of drawn) for (const o of d.ones) { pv.cover(partRects, o.vis, o.rect); sink?.push(o); }
  return {
    w, h,
    at: (step) => {
      const out: Record<Id, Rect> = {};
      for (const [id, r] of rectOf) if (states[step]?.things[id]?.visible !== false) out[id] = r;
      for (const [id, r] of childAt) if (states[step]?.things[id]?.visible) out[id] = r;
      Object.assign(out, pv.at(partRects, step));
      return out;
    },
    decor: (step): Prim[] => [...drawn.flatMap((d) => d.at(step)), ...(notesDrawn?.at(step) ?? [])],
    ...(notesDrawn ? { words: "own" as const } : {}), // eng-lanes2: the notes are on the stage, not in the caption
    // the blocks draw their own rows, groups and wrappers; the plain card of a thing the block already drew stays out
    draw: (_step, id) => (members.has(id) || partRects.has(id) || model.things[id]?.flags.includes("part") ? [] : null),
  };
}
