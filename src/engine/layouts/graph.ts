// Graph/free and legacy groups. Ranking and row/column/grid placement come from core/scene.ts.
// Reserve every member and its largest size once: visibility and relations never shuffle the story.
import type { Font, Id, LayoutCtx, LayoutInput, LayoutPlugin, Placed, Rect, StepState, Thing } from "../types";
import { CHIP, DESIGN, PHONE, METER_ROOM, headH, headW, textW, wrapEven, type SizeName } from "../../core/scene";
import { LINE_H } from "../../core/stage-core";
import { work } from "../../core/work";
import { graphLayout, type ParentGraph } from "./graph/ranks";
import { leafGeom } from "./graph/leaf";
import { legacyGraph } from "./graph/legacy";
import { structureMember } from "./graph/draw";
import { chartRoom } from "./chart-room"; // fmt12

type Mode = "graph" | "free" | "row" | "column" | "grid";
const modes: readonly string[] = ["graph", "free", "row", "column", "grid"];
const sizeName = (s: string | undefined): SizeName => s === "s" || s === "l" ? s : "m";
const ownerOf = (input: LayoutInput): Thing | undefined => input.container === null ? undefined : input.model.things[input.container];
const parentAt = (input: LayoutInput, id: Id, state?: StepState): Id | null => state?.things[id]?.in ?? input.model.things[id]?.parent ?? null;

/** A relation between descendants ranks their immediate containers, including their later homes. */
function storyLinks(input: LayoutInput): [Id, Id][] {
  const members = new Set(input.members), links = new Map<string, [Id, Id]>();
  const own = (id: Id, state?: StepState): Id | null => {
    const seen = new Set<Id>();
    while (!seen.has(id)) {
      seen.add(id);
      if (members.has(id)) return id;
      const p = parentAt(input, id, state);
      if (p === null || p === input.container) return null;
      id = p;
    }
    return null;
  };
  for (const state of input.states.length ? input.states : [undefined]) {
    for (const rel of Object.values(input.model.relations)) {
      work(4 + input.members.length);
      const a = own(rel.from, state), b = own(rel.to, state);
      if (a && b && a !== b) links.set(JSON.stringify([a, b]), [a, b]);
    }
  }
  return [...links.values()];
}

function memberSize(input: LayoutInput, ctx: LayoutCtx, thing: Thing): [number, number] {
  if (thing.container || thing.layout) {
    const child = ctx.child(thing.id);
    return [child.w, child.h];
  }
  if (thing.chart) return chartRoom(input, ctx, thing); // fmt12: a chart is as wide as its row and as tall as its drawing, not a card
  const sn = sizeName(thing.keys.size ?? input.model.fence.size);
  const z = (ctx.phone ? PHONE : DESIGN)[sn];
  const meter = thing.keys.level !== undefined || input.states.some((s) => s.things[thing.id]?.keys?.level !== undefined);
  if (ctx.look === "classic" && !thing.lines.length && !input.states.some((s) => s.things[thing.id]?.text || s.things[thing.id]?.is)) {
    const g = leafGeom({ label: thing.title, kind: thing.shape, level: meter ? thing.keys.level ?? "0" : undefined }, z);
    return [g.w, g.h];
  }
  const font: Font = "title";
  const texts = [thing.lines, ...input.states.flatMap((s) => s.things[thing.id]?.text ? [s.things[thing.id].text!] : [])];
  const chips = input.states.map((s) => s.things[thing.id]?.is).filter((s): s is string => !!s);
  const measure = (t: string, f: Font) => ctx.look === "classic" ? textW(t, f === "title" ? z.font : CHIP.font) : ctx.measure(t, f);
  const titleW = measure(thing.title, font);
  const bodyW = Math.max(0, ...texts.flat().map((t) => measure(t, "body")));
  const chipW = Math.max(0, ...chips.map((t) => measure(t, "chip") + 2 * CHIP.px));
  let w = Math.max(z.minW, Math.min(z.maxW, Math.max(titleW, bodyW, chipW) + 2 * z.px));
  const wrap = (t: string, f: Font) => ctx.look === "classic" ? wrapEven(t, f === "title" ? z.font : CHIP.font, w - 2 * z.px) : ctx.wrap(t, w - 2 * z.px, f);
  let h = Math.max(z.minH, wrap(thing.title, font).length * LINE_H.title + 2 * z.py
    + Math.max(0, ...texts.map((ls) => ls.reduce((n, t) => n + wrap(t, "body").length * LINE_H.body, 0)))
    + (chips.length ? CHIP.h + CHIP.gap : 0)) + (meter ? METER_ROOM : 0);
  // The old leafGeom reserves the silhouettes outside their words.
  if (thing.shape === "circle" || thing.shape === "dot") w = h = Math.max(w, h);
  if (thing.shape === "diamond") { w *= 1.4; h *= 1.4; }
  if (thing.shape === "person") h += Math.round(z.minH * 0.95);
  if (thing.shape === "cylinder") h += Math.round(z.minH * 0.18) * 2;
  if (thing.shape === "cloud") { w += 16; h += 12; }
  return [Math.ceil(w), Math.ceil(h)];
}

function place(input: LayoutInput, ctx: LayoutCtx, fallback: "graph" | "free"): Placed {
  const legacyPlan = legacyGraph(input, ctx);
  if (legacyPlan) return legacyPlan;
  const owner = ownerOf(input), options = owner?.keys ?? input.model.fence;
  const legacy = options["legacy-layout"] ?? options.layout;
  let mode: Mode = modes.includes(legacy) ? legacy as Mode : fallback;
  // Legacy plain groups default to row, even inside a graph; explicit graph/free still win.
  if (owner && !owner.layout && !legacy && input.model.origin === "graph10") mode = "row";
  if (ctx.phone && mode === "row" && !owner) mode = "column";
  // From layoutState's narrow layout: outgoing lines leave a column side by side on a phone.
  if (ctx.phone && owner && mode === "column" && input.model.layout === "graph") {
    const inside = (id: Id, state: StepState): boolean => {
      const seen = new Set<Id>();
      while (!seen.has(id)) { if (id === owner.id) return true; seen.add(id); const p = parentAt(input, id, state); if (!p) return false; id = p; }
      return false;
    };
    if (input.states.some((s) => Object.values(input.model.relations).some((r) => inside(r.from, s) !== inside(r.to, s)))) mode = "row";
  }
  const dir = options.dir === "down" || (ctx.phone && !owner) ? "down" : "right";
  const sn = sizeName(options.size ?? input.model.fence.size), z = (ctx.phone ? PHONE : DESIGN)[sn];
  const links = storyLinks(input);
  const gap = owner ? (links.length ? Math.max(z.gap, 38) : z.gap)
    : mode === "graph" ? Math.round(z.gap * 1.6) : Math.max(links.length ? 38 : 0, Math.round(z.gap * 2.2));
  const sizes = new Map(input.members.map((id) => [id, memberSize(input, ctx, input.model.things[id])]));
  // render3: on a phone a row of things no line joins that is wider than the stage is a column (format 63: three data structures
  // in one group were 600 px wide at 390, and the stage cut them off)
  if (ctx.phone && owner && mode === "row" && !links.length && [...sizes.values()].reduce((s, [a]) => s + a + gap, -gap) > ctx.width - 48) mode = "column";
  const rects: Record<Id, Rect> = {};
  const set = (id: Id, x: number, y: number) => { const [w, h] = sizes.get(id)!; rects[id] = { x, y, w, h }; };
  let w = 0, h = 0;
  if (input.members.length) {
    if (mode === "graph") {
      const parents: ParentGraph = { ents: Object.fromEntries(input.members.map((id) => [id, { id, parent: null }])) };
      const labels = [...Object.values(input.model.relations).map((r) => r.label),
        ...input.model.steps.flatMap((s) => s.facts.flatMap((f) => f.k === "rel" ? [f.words] : []))];
      const room = Math.max(0, ...labels.filter((s): s is string => !!s).map((s) => Math.min(CHIP.edgeW, ctx.measure(s, "chip")) + 2 * CHIP.px));
      [w, h] = graphLayout(parents, input.members, sizes, set, dir, gap, links, room, 0,
        ctx.phone && !owner && (input.model.steps.length === 0 || "static" in input.model.fence) ? Math.max(1, ctx.width - 32) : 0);
    } else if (mode === "column") {
      w = Math.max(...[...sizes.values()].map(([a]) => a));
      for (const id of input.members) { const [a, b] = sizes.get(id)!; set(id, (w - a) / 2, h); h += b + gap; }
      h -= gap;
    } else if (mode === "grid") {
      const parsed = Number(options.cols ?? 3), cols = Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 3;
      const cw = Math.max(...[...sizes.values()].map(([a]) => a)), ch = Math.max(...[...sizes.values()].map(([, b]) => b));
      input.members.forEach((id, i) => { const [a, b] = sizes.get(id)!; set(id, (i % cols) * (cw + gap) + (cw - a) / 2, Math.floor(i / cols) * (ch + gap) + (ch - b) / 2); });
      w = Math.min(cols, input.members.length) * (cw + gap) - gap; h = Math.ceil(input.members.length / cols) * (ch + gap) - gap;
    } else if (mode === "free") {
      let fx = 0;
      for (const id of input.members) {
        const pos = input.model.things[id].keys.pos?.split(",").map(Number);
        const valid = pos?.length === 2 && pos.every(Number.isFinite);
        if (pos && !valid) ctx.problem({ line: input.model.things[id].src.line, msg: "pos needs two grid coordinates, for example pos=2,1" });
        const [a, b] = sizes.get(id)!, x = valid ? pos[0] * 40 : fx, y = valid ? pos[1] * 40 : 0;
        if (!valid) fx += a + gap;
        set(id, x, y); w = Math.max(w, x + a); h = Math.max(h, y + b);
      }
    } else {
      h = Math.max(...[...sizes.values()].map(([, b]) => b));
      for (const id of input.members) { const [a, b] = sizes.get(id)!; set(id, w, (h - b) / 2); w += a + gap; }
      w -= gap;
    }
  }
  // A child plan includes its own heading and inset; pipeline places it at the container's outer origin.
  const pad = owner ? z.pad : 16;
  const heading = owner?.title ? Math.max(headH(z), LINE_H.title + 12) : 0;
  const minX = Math.min(0, ...Object.values(rects).map((r) => r.x)), minY = Math.min(0, ...Object.values(rects).map((r) => r.y));
  for (const r of Object.values(rects)) { r.x += pad - minX; r.y += pad + heading - minY; }
  w = Math.max(w - minX + 2 * pad, owner?.title ? headW(owner.title, z) + 2 * pad : 0);
  h = h - minY + 2 * pad + heading;
  if (owner) { w = Math.max(w, 40); h = Math.max(h, 40); }
  return {
    w, h,
    at(step) {
      const state = input.states[step];
      if (!state) return {};
      return Object.fromEntries(input.members.filter((id) => {
        const st = state.things[id];
        return st?.visible && !st.at && parentAt(input, id, state) === input.container;
      }).map((id) => [id, { ...rects[id] }]));
    },
    decor: () => [],
    draw: (_step, id, rect, state) => structureMember(input.model.things[id], state, rect, ctx),
  };
}

export const Graph: LayoutPlugin = { name: "graph", place: (input, ctx) => place(input, ctx, "graph") };
export const Free: LayoutPlugin = { name: "free", place: (input, ctx) => place(input, ctx, "free") };
