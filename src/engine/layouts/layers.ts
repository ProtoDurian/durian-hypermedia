// Layout family "layers" (lane L-layers): `layout: layers`. SPEC 6.9, ported from core/scene.ts (the `banded` block).
//
// 2D: when the top-level things sit on two or more layers (`## Region` = one layer, the first is the top), the stage is
// a column of bands, one per layer, each with its name; the n-th thing of every band shares one column, so two stacks
// stand side by side and a line between two layers runs straight up or down. With one layer (or none) layers change
// nothing in 2D: the top-level things stand in one row (wrapping on a phone).
// 3D (render/three.ts): the same rects are the floor plan; a thing's floor-plan y is its y minus its band's top
// (`band:<region id>` rects in `decor`), and its height comes from its layer's index.
//
// The still rule (DESIGN 2.3): every member keeps one place for the whole story, also while it is hidden. A container
// is laid out by this same plug-in as a row (`dir=down` or `[tree]`-like flags are other layouts' business) with its
// heading above; the rects of its members include the container's padding and heading, as the engine adds only the
// container's own top-left (pipeline.ts `walk`).
import type { Font, Id, LayoutCtx, LayoutInput, LayoutPlugin, Placed, Prim, Rect, Region, Thing } from "../types";

// the stage's "m" size (SPEC 6.10), in world units ~ CSS pixels
export const SZ = { px: 14, py: 9, minW: 72, wrapW: 160, minH: 38, pad: 12, gap: 18, head: 22, lh: 17, cell: 40 };
const BAND_PAD = SZ.pad + 2;          // inside a band, round its things
const COL_GAP = SZ.gap * 3;           // between the columns of a band
const BAND_GAP = Math.round(SZ.gap * 0.8); // between two bands
const LINE_GAP = 44;                  // between two bands that a line joins: the line shows at least this long
const BAND_R = 12;

/** the layer (region) a thing stands on: its own region; a thing inside a container follows the container */
export function layerOf(input: Pick<LayoutInput, "model">, id: Id): Region | null {
  const m = input.model;
  for (let t: Thing | undefined = m.things[id], n = 0; t && n < 64; t = t.parent ? m.things[t.parent] : undefined, n++) {
    const r = t.region ? m.regions.find((x) => x.id === t.region) : null;
    if (r) return r;
  }
  return m.regions[0] ?? null;
}

/** one card's size at "m": its title wrapped at the least width, its lines under it; shapes keep their own ratio */
export function sizeOfThing(t: Thing, ctx: LayoutCtx): [number, number] {
  if (t.shape === "dot") return [14, 14];
  if (t.shape === "token") return [Math.max(24, ctx.measure(t.title, "chip") + 14), 20];
  const inner = SZ.wrapW - 2 * SZ.px;
  const title = t.title ? ctx.wrap(t.title, inner, "body", 3) : [];
  const lines = t.lines.flatMap((l) => ctx.wrap(l, inner, "sub", 3));
  const wOf = (ls: string[], f: Font) => ls.reduce((a, l) => Math.max(a, ctx.measure(l, f)), 0);
  const w = Math.max(wOf(title, "body"), wOf(lines, "sub")) + 2 * SZ.px;
  let h = (title.length + lines.length) * SZ.lh + 2 * SZ.py + (lines.length && title.length ? 2 : 0);
  let ww = Math.max(SZ.minW, Math.ceil(w));
  if (t.shape === "circle") { const d = Math.max(ww, h, 52); return [d, d]; }
  if (t.shape === "cylinder") { h += 14; ww = Math.max(ww, 80); }
  if (t.shape === "person") { h += 22; ww = Math.max(ww, 64); }
  if (t.shape === "cloud") { h += 10; ww = Math.max(ww, 96); }
  if (t.shape === "diamond") { ww = Math.round(ww * 1.3); h = Math.round(h * 1.25); }
  return [ww, Math.max(SZ.minH, h)];
}

type Slot = { id: Id; w: number; h: number };
const sizesOf = (input: LayoutInput, ctx: LayoutCtx, ids: Id[]): Slot[] =>
  ids.map((id) => {
    const t = input.model.things[id];
    if (t.container) { const c = ctx.child(id); return { id, w: c.w, h: c.h }; }
    const [w, h] = sizeOfThing(t, ctx);
    return { id, w, h };
  });

const shown = (input: LayoutInput, step: number, id: Id, container: Id | null): boolean => {
  const st = input.states[step]?.things[id];
  return !!st && st.visible && !st.at && (st.in ?? input.model.things[id].parent ?? null) === container;
};

/** a row of slots, wrapping at `maxW`; or a column when `down` */
function flow(slots: Slot[], gap: number, maxW: number, down: boolean): { at: Map<Id, Rect>; w: number; h: number } {
  const at = new Map<Id, Rect>();
  if (!slots.length) return { at, w: 0, h: 0 };
  if (down) {
    let y = 0, w = 0;
    for (const s of slots) { at.set(s.id, { x: 0, y, w: s.w, h: s.h }); y += s.h + gap; w = Math.max(w, s.w); }
    for (const r of at.values()) r.x = (w - r.w) / 2;
    return { at, w, h: y - gap };
  }
  const rows: Slot[][] = [[]];
  let x = 0;
  for (const s of slots) {
    const cur = rows[rows.length - 1];
    if (cur.length && x + s.w > maxW) { rows.push([]); x = 0; }
    rows[rows.length - 1].push(s); x += s.w + gap;
  }
  let y = 0, w = 0;
  for (const row of rows) {
    const h = Math.max(...row.map((s) => s.h)); let rx = 0;
    for (const s of row) { at.set(s.id, { x: rx, y: y + (h - s.h) / 2, w: s.w, h: s.h }); rx += s.w + gap; }
    w = Math.max(w, rx - gap); y += h + gap;
  }
  return { at, w, h: y - gap };
}

function placeContainer(input: LayoutInput, ctx: LayoutCtx): Placed {
  const id = input.container as Id;
  const down = input.model.things[id]?.keys.dir === "down";
  const slots = sizesOf(input, ctx, input.members);
  const maxW = ctx.phone ? Math.max(ctx.width - 2 * SZ.pad - 8, 140) : 1e9;
  const f = flow(slots, SZ.gap, maxW, down);
  const head = input.model.things[id]?.title ? SZ.head : 0;
  const w = Math.max(f.w + 2 * SZ.pad, ctx.measure(input.model.things[id]?.title ?? "", "lane") + 2 * SZ.pad + 2, slots.length ? 0 : 60);
  const h = f.h + head + 2 * SZ.pad;
  const ox = (w - f.w) / 2, oy = head + SZ.pad;
  return {
    w, h,
    at: (step) => { const out: Record<Id, Rect> = {}; for (const s of slots) if (shown(input, step, s.id, id)) { const r = f.at.get(s.id)!; out[s.id] = { ...r, x: r.x + ox, y: r.y + oy }; } return out; },
    decor: () => [],
  };
}

function placeStage(input: LayoutInput, ctx: LayoutCtx): Placed {
  const { model } = input;
  const layers = model.regions;
  const layerIdx = (id: Id) => { const r = layerOf(input, id); return r ? layers.indexOf(r) : 0; };
  const slots = sizesOf(input, ctx, input.members);
  const banded = layers.length > 1 && new Set(input.members.map(layerIdx)).size > 1;

  if (!banded) {
    const f = flow(slots, Math.round(SZ.gap * 2.2), ctx.phone ? Math.max(ctx.width - 2 * BAND_PAD, 140) : 1e9, false);
    return { w: f.w, h: f.h, at: (step) => { const out: Record<Id, Rect> = {}; for (const s of slots) if (shown(input, step, s.id, null)) out[s.id] = f.at.get(s.id)!; return out; }, decor: () => [] };
  }

  // bands: the n-th member of each band shares column n
  const per: Slot[][] = layers.map((_, L) => slots.filter((s) => layerIdx(s.id) === L));
  const ncol = Math.max(1, ...per.map((p) => p.length));
  const colW = Array.from({ length: ncol }, (_, c) => Math.max(40, ...per.map((p) => (p[c] ? p[c].w : 0))));
  const names = layers.map((l) => ctx.measure(l.title, "lane"));
  // the name stands in a column on the left, or (on a phone, where width is short) as a line above the band's things
  const side = !ctx.phone;
  const labelW = side ? Math.max(0, ...names) + 30 : 0;
  const labelH = side ? 0 : 20;
  const colGap = ctx.phone ? SZ.gap : COL_GAP;
  const joined = Object.values(model.relations).some((r) => {
    const a = model.things[r.from], b = model.things[r.to];
    return !!a && !!b && layerIdx(topOf(model, r.from)) !== layerIdx(topOf(model, r.to));
  });
  const bandGap = joined ? Math.max(BAND_GAP, LINE_GAP - 2 * BAND_PAD) : BAND_GAP;
  const totalW = Math.max(labelW + colW.reduce((a, b) => a + b, 0) + (ncol - 1) * colGap + BAND_PAD * (side ? 1 : 2), side ? 0 : Math.max(0, ...names) + 24);
  const rects = new Map<Id, Rect>();
  const bands: { region: Region; r: Rect }[] = [];
  let y = 0;
  per.forEach((p, L) => {
    const inner = Math.max(30, ...p.map((s) => s.h));
    let x = side ? labelW : BAND_PAD;
    p.forEach((s, c) => { rects.set(s.id, { x: x + (colW[c] - s.w) / 2, y: y + labelH + BAND_PAD + (inner - s.h) / 2, w: s.w, h: s.h }); x += colW[c] + colGap; });
    const h = labelH + inner + 2 * BAND_PAD;
    bands.push({ region: layers[L], r: { x: 0, y, w: totalW, h } });
    y += h + bandGap;
  });
  const h = y - bandGap;
  return {
    w: totalW, h,
    at: (step) => { const out: Record<Id, Rect> = {}; for (const s of slots) if (shown(input, step, s.id, null)) out[s.id] = rects.get(s.id)!; return out; },
    decor: (step) => {
      const focus = input.states[step]?.focus ?? "all";
      const out: Prim[] = [];
      bands.forEach(({ region, r }, L) => {
        const off = focus !== "all" && focus !== region.id;
        out.push({ k: "rect", key: `band:${region.id}`, rect: r, fill: "band", edge: "line", r: BAND_R, cls: `layer-band${off ? " is-dim" : ""}${focus === region.id ? " is-focus" : ""}` });
        out.push({ k: "text", key: `band-name:${region.id}`, x: r.x + 14, y: side ? r.y + r.h / 2 : r.y + 14, lines: [region.title], font: "lane", anchor: "start", ink: off ? "muted" : "ink", cls: "layer-name" });
        void L;
      });
      return out;
    },
  };
}

/** the top-level thing a thing stands in */
function topOf(model: LayoutInput["model"], id: Id): Id {
  let t = model.things[id], n = 0;
  while (t?.parent && model.things[t.parent] && n++ < 64) t = model.things[t.parent];
  return t?.id ?? id;
}

export const Layers: LayoutPlugin = {
  name: "layers",
  place: (input, ctx) => (input.container === null ? placeStage(input, ctx) : placeContainer(input, ctx)),
};
