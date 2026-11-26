// Grid layout, the ported words placed: heads (matrix, bins) stacked, then the step panels in one region as tall as the
// tallest step (the stage's panel region, src/core/stage.ts "panels: one region"), each step's panels shown in that step only.
// Everything is laid out once for the whole story (the still rule); a thing never moves between steps.
import { LINE_H, PAD, shift, type Item, type LayoutOut } from "../../../core/stage-core";
import { setPhone } from "../../../core/stage-phone";
import { setCardPad } from "../../../core/stage-cards";
import { setPhoneLines } from "../../../core/stage-core";
import { atSizes } from "../../render/font";
import { PHONE } from "../../../core/stage-phone";
import { panelTitle } from "../../../core/stage";
import type { Id, LayoutCtx, LayoutInput, Placed, Prim, Rect, ThingState } from "../../types";
import { itemPrims, shownAt, shownAtSetup } from "./paint";
import { itemRect, Parts, shownSetup, type PartItem, type Vis } from "../parts";
import { boxFor, readLegacy, type Legacy } from "./legacy";
import { bandOf, emptyBand, layoutBand } from "./notes";

const REGION_KINDS = new Set(["lane", "band", "panel", "bin", "track", "table"]);
const GAP_HEADS = 12;

type Placed1 = { it: Item; key: string };

/** a thing the old blocks name by an item id: matrix card `mx:t1`, bin `bin:s`, a binned thing `unit:p1@s` */
const thingOf = (it: Item): Id | null => {
  const id = (it as { id?: string }).id; if (!id) return null;
  if (id.startsWith("mx:")) { const r = id.slice(3); return r.startsWith("lane:") || r.startsWith("cell:") || r.startsWith("band:") ? null : r; }
  if (id.startsWith("bin:")) return id.slice(4);
  if (id.startsWith("unit:")) return id.slice(5).split("@")[0];
  return null;
};

export function placeLegacy(input: LayoutInput, ctx: LayoutCtx, L: Legacy = readLegacy(input.model), sink?: PartItem[]): Placed {
  const { model } = input, n = model.steps.length;
  const pv = new Parts(model, input.states, "grid"); // blocks2: what shows at a step is the part's StepState
  const root = input.container === null, side = root ? PAD : 0;
  const narrow = ctx.phone;
  const W = input.avail ?? ctx.width;
  const box = boxFor(model, Math.max(40, W - 2 * side), narrow);
  setPhone(narrow); setCardPad(narrow); setPhoneLines(narrow);
  const placed: Placed1[] = [];
  let h = 0;
  atSizes(narrow, () => { try { // the phone's sizes only while the blocks measure (render/font.ts)
    // ---- heads, stacked in source order
    let y = 0;
    L.heads.forEach((hd, hi) => {
      const out: LayoutOut = hd.block.layout(hd.node, box);
      shift(out.items, side, y).forEach((it, i) => placed.push({ it, key: `h${hi}:${i}` }));
      y += out.h + GAP_HEADS;
    });
    const afterHeads = L.heads.length ? y : 0;
    // ---- the panel region: each step's panels, one region as tall as the tallest
    let PIN = narrow ? 0 : 10; const pbox = { ...box, w: box.w - 2 * PIN };
    const stepPanels = (si: number) => {
      const s = L.steps[si];
      if (!s || !s.panels.length) return { outs: [] as { out: LayoutOut; x: number; dy: number; w: number; side: boolean }[], h: 0 };
      if (!s.beside || Math.max(s.panels.length, s.beside.length) < 2 || narrow) {
        let hh = 0; const outs = s.panels.map((p) => { const o = { out: p.block.layout(p.node, pbox), x: 0, dy: hh, w: pbox.w, side: false }; hh += o.out.h + (narrow ? PHONE.panelGap : 36); return o; });
        return { outs, h: hh };
      }
      const sh = Array.from({ length: Math.max(s.panels.length, s.beside.length) }, (_, i) => s.beside![i] ?? 1), tot = sh.reduce((a, b) => a + b, 0), room = pbox.w - 20 * (sh.length - 1);
      let x = 0; const outs = s.panels.map((p, i) => { const pw = (room * sh[i]) / tot, o = { out: p.block.layout(p.node, { ...pbox, w: pw, beside: true }), x, dy: 0, w: pw, side: true }; x += pw + 20; return o; });
      return { outs, h: Math.max(...outs.map((o) => o.out.h)) + 36 };
    };
    const steps = Array.from({ length: n }, (_, si) => stepPanels(si));
    const panelH = Math.max(0, ...steps.map((s, si) => s.h - (L.steps[si]?.panels.length ? 0 : 0)));
    if (panelH > 0) {
      steps.forEach((sp, si) => {
        sp.outs.forEach(({ out, x, dy, w: sw, side: sd }, pi) => {
          const items = [...out.items];
          const f0 = items[0];
          // a lone full-width frame, or each frame of a "beside" row, grows to the region's height (a phone keeps its own height)
          if (!narrow && (L.steps[si].panels.length === 1 || sd) && f0?.k === "box" && f0.x === 0 && f0.y === 0 && f0.w >= sw - 1 && f0.h >= out.h - 1 && f0.cls === "scn-frame") items[0] = { ...f0, h: Math.max(f0.h, panelH - (narrow ? PHONE.panelGap : 36)) };
          // the panel is a region with its own title, for the bar: a frame that already is a region takes the title, else an unpainted box under it
          const p = L.steps[si].panels[pi], t0 = panelTitle(p), g = items[0], t = t0 && !items.some((it) => (it as { bar?: { label?: string } }).bar?.label === t0) ? t0 : "";
          const frame = g?.k === "box" && g.x === 0 && g.y === 0 && g.w >= sw - 1 && g.h >= out.h - 1 && REGION_KINDS.has(String(g.bar?.kind)) ? g : undefined;
          if (frame) { if (t && !frame.bar!.label) items[0] = { ...frame, bar: { ...frame.bar, label: t } }; }
          else items.unshift({ k: "box", x: 0, y: 0, w: sw, h: Math.max(out.h, g?.k === "box" && g.x === 0 && g.y === 0 ? g.h : 0), fill: "none", stroke: "none", r: 0, cls: "stg-region", bar: { kind: "panel" } });
          shift(items, side + PIN + x, afterHeads + dy, { from: si + 1, to: si + 1 }).forEach((it, i) => placed.push({ it, key: `p${si}.${pi}:${i}` }));
        });
      });
    }
    // ---- each step's notes, formula and foot lines: a band under its own panels (a step with no panels: under the region)
    // hosted by another layout (a container): that layout's renderer draws the notes and foot lines
    const bands = model.steps.map((st) => bandOf(st)).map((bd) => (!root || emptyBand(bd) ? null : { bd, lay: layoutBand(bd, box.w) }));
    const regionBottom = afterHeads + (panelH > 0 ? panelH - (narrow ? PHONE.panelGap : 36) : 0);
    const panelEnd = (si: number) => afterHeads + Math.max(0, ...steps[si].outs.map((o) => o.dy + o.out.h)) + 14;
    let bottom = panelH > 0 ? regionBottom : afterHeads - GAP_HEADS;
    bands.forEach((bn, si) => {
      if (!bn) return;
      const top = steps[si].outs.length ? panelEnd(si) : regionBottom + (panelH > 0 ? 14 : 0);
      shift(bn.lay.items, side, top, { from: si + 1, to: si + 1 }).forEach((it, i) => placed.push({ it, key: `n${si}:${i}` }));
      bottom = Math.max(bottom, top + bn.lay.h);
    });
    h = Math.ceil(bottom + 4 + (root ? 6 : 0));
    if (!L.heads.length && panelH <= 0 && !bands.some(Boolean)) h = 0;
  } finally { setPhone(false); setCardPad(false); setPhoneLines(false); } });
  void LINE_H;

  // a thing the blocks draw: its rect in each step, where its item shows
  const rectsAt = new Map<number, Record<Id, Rect>>();
  const partRects = new Map<Id, Rect>();
  for (const { it } of placed) { const o = { vis: it as Vis, rect: itemRect(it) }; pv.cover(partRects, o.vis, o.rect); sink?.push(o); }
  const at = (step: number): Record<Id, Rect> => {
    const hit = rectsAt.get(step); if (hit) return hit;
    const out: Record<Id, Rect> = {};
    for (const { it } of placed) {
      if (it.k !== "box") continue;
      const id = thingOf(it); if (!id || !model.things[id] || model.things[id].flags.includes("part")) continue;
      if (!pv.shown(it as Vis, step, shownSetup)) continue;
      out[id] = { x: it.x, y: it.y, w: it.w, h: it.h };
    }
    Object.assign(out, pv.at(partRects, step));
    rectsAt.set(step, out); return out;
  };
  const known = new Set<Id>([...partRects.keys(), ...placed.flatMap(({ it }) => { const id = it.k === "box" ? thingOf(it) : null; return id && model.things[id] ? [id] : []; })]);
  const decorAt = new Map<number, Prim[]>();
  return {
    w: W, h, words: "own",
    at,
    decor(step) {
      const hit = decorAt.get(step); if (hit) return hit;
      const out: Prim[] = [];
      for (const { it, key } of placed) if (pv.shown(it as Vis, step, shownSetup)) out.push(...itemPrims(it, key, step, { hot: pv.lit(it as Vis, step), dim: pv.dim(it as Vis, step) }));
      decorAt.set(step, out); return out;
    },
    // the things this layout draws itself are not drawn again by the engine
    draw: (_step: number, id: Id, _r: Rect, _s: ThingState) => (known.has(id) ? [] : null),
  };
}

/** the grid layout's lines of the LLM view: each block's own facts, the setup first, then each step's panels and head words */
export function legacyLlm(L: Legacy, n: number): string[] {
  const out: string[] = [];
  for (let k = 0; k <= n; k++) {
    const fs = [...L.heads.flatMap((h) => h.block.facts(h.node, k)), ...(k ? (L.steps[k - 1]?.panels ?? []).flatMap((p) => p.block.facts(p.node, k)) : [])];
    for (const f of fs) out.push(k ? `Step ${k}: ${f}` : `Setup: ${f}`);
  }
  return out;
}
