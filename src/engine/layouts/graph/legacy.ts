// The legacy graph front-end keeps its source so measured graph10 layouts can move by call.
// New models use the rank port in ranks.ts; this bridge preserves the old slot and phone decisions.
import { compileScene, edgeGeom, bezPath, union, pad, MARGIN, type Compiled } from "../../../core/scene";
import { phoneScene, narrowWins, leastScale } from "../../../core/readable";
import { wholeLayout } from "../../../core/whole";
import { LINE_H } from "../../../core/stage-core";
import { thingPrims } from "../../render/prims";
import { structureMember } from "./draw";
import type { Id, LayoutCtx, LayoutInput, Model, Placed, Rect } from "../../types";
import { raise12 } from "./raise"; // render2

type Source = { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string>; setup?: string };
// render2: a format 12 graph scene is raised into the graph engine's words once per model (raise.ts), so it gets the
// same measured layout as the old form of the same scene; null when it uses words the graph engine does not have
const raised = new WeakMap<Model, string | null>();
/** tests of the rank port (graph.ts) turn raise12On off (the rank layout alone) */
export const raise12On = { on: true };
function sourceOf(input: LayoutInput): string | undefined {
  const { model } = input;
  if (model.origin === "graph10") return model.fence["graph-src"];
  if (model.origin !== "format12" || !raise12On.on) return undefined;
  if (!raised.has(model)) { const r = raise12(model, input.states); raised.set(model, r ? JSON.stringify(r) : null); }
  return raised.get(model) ?? undefined;
}
const cache = new WeakMap<Model, { source: string; wide: Compiled; widths: Map<number, Compiled> }>();

// Port of ui/anim.tsx cutAt/laptopKey: use the downward plan on a laptop when only that plan fits at readable words.
const cutAt = (c: Compiled, width: number): boolean => width > 0 && c.frames.some((f) => pad(f.bounds, MARGIN).w * leastScale(f, width) > width + 1);
function laptopLayout(wide: Compiled, width: number): Compiled {
  if (!cutAt(wide, width)) return wide;
  const narrow = phoneScene(wide, true);
  return narrow && !cutAt(narrow, width) ? narrow : wide;
}

export function legacyGraph(input: LayoutInput, ctx: LayoutCtx): Placed | null {
  const { model, container } = input;
  const source = sourceOf(input); // render2
  if (!source) return null;
  let memo = cache.get(model);
  if (!memo || memo.source !== source) {
    let src: Source;
    try { src = JSON.parse(source); } catch { return null; }
    if (!src || typeof src.head !== "string" || !Array.isArray(src.steps) || !src.info) return null;
    // The model has state 0 as well as steps 1..n. The same story sizing pass places that setup frame too.
    const steps = src.steps.length ? [{ title: "Setup", raw: src.setup ?? "", line: src.base }, ...src.steps] : []; // render2: a raised scene's setup step hides what step 0 hides
    const wide = compileScene(src.head, steps, src.base, src.info);
    if (model.origin !== "graph10" && wide.errors.length) { raised.set(model, null); return null; } // render2: refused raised words: rank it instead
    memo = { source, wide, widths: new Map() }; cache.set(model, memo);
    for (const p of [...wide.errors, ...wide.warnings.map((p) => ({ ...p, warn: true }))]) ctx.problem(p);
  }
  let compiled = memo.widths.get(ctx.width);
  if (!compiled) {
    const whole = model.steps.length === 0 || "static" in model.fence;
    compiled = whole ? wholeLayout(memo.wide, ctx.width)
      : ctx.phone ? phoneScene(memo.wide, narrowWins(memo.wide, ctx.width)) ?? memo.wide : laptopLayout(memo.wide, ctx.width);
    memo.widths.set(ctx.width, compiled);
  }
  // Recursion stays with the pipeline: the current plugin only returns its immediate members.
  // eng-stagebars: a hash table's box is as wide as its widest row (the data layout's own size), not only as the old scene's box
  const wider = new Map<Id, { w: number; h: number }>();
  const frames = compiled.frames;
  // fmt12: a group whose members grew (below) grows with them, so its parent makes room for it too
  const most = (id: Id) => frames.reduce((a, f) => { const b = f.boxes.find((x) => x.id === id); return b ? { w: Math.max(a.w, b.w), h: Math.max(a.h, b.h) } : a; }, { w: 0, h: 0 });
  for (const id of input.members) if (model.things[id].container || model.things[id].layout) { const c = ctx.child(id); if (["map", "array", "list", "stack", "queue"].includes(model.things[id].layout ?? "")) wider.set(id, { w: c.w, h: c.h }); else if (model.things[id].container) { const o = most(id); if (o.w && (c.w > o.w + 0.5 || c.h > o.h + 0.5)) wider.set(id, { w: c.w, h: c.h }); } } // render3: every data structure, not only a map: raised on the page, an array drew its cells past its frame
  // fmt12: a member drawn wider (or taller) than the old scene's box pushes the members after it in its row (or below it in
  // its column) over by what it grew, and the group's box takes the room: before, the box grew over its neighbours (format 63:
  // the sorted ids over the price index, the cart sizes past the service's frame)
  const spread = (boxes: { id: Id; x: number; y: number; w: number; h: number; w0: number; h0: number }[]) => {
    for (const b of [...boxes].sort((p, q) => p.x - q.x)) { const dw = b.w - b.w0; if (dw > 0.5) for (const o of boxes) if (o !== b && o.x >= b.x + b.w0 - 1 && o.y < b.y + b.h && b.y < o.y + o.h) o.x += dw; }
    for (const b of [...boxes].sort((p, q) => p.y - q.y)) { const dh = b.h - b.h0; if (dh > 0.5) for (const o of boxes) if (o !== b && o.y >= b.y + b.h0 - 1 && o.x < b.x + b.w && b.x < o.x + o.w) o.y += dh; }
    return boxes;
  };
  // render3: a grown list, stack or queue keeps its middle where the graph engine put it, so straight lines stay straight
  const lift = (id: Id, b: { h: number; h0: number }) => (["array", "list", "stack", "queue"].includes(model.things[id]?.layout ?? "") ? Math.max(0, b.h - b.h0) / 2 : 0);
  const placed = frames.map((frame) => spread(input.members.flatMap((id) => { const box = frame.boxes.find((b) => b.id === id); if (!box) return []; const g = wider.get(id); return [{ id, x: box.x, y: box.y, w: Math.max(box.w, g?.w ?? 0), h: Math.max(box.h, g?.h ?? 0), w0: box.w, h0: box.h }]; })));
  const reach = (k: number) => { const bs = placed[k], f = frames[k]; let dx = 0, dy = 0; for (const b of bs) { const o = f.boxes.find((x) => x.id === b.id)!; dx = Math.max(dx, b.x + b.w - (o.x + o.w)); dy = Math.max(dy, b.y + b.h - (o.y + o.h)); } return { dx, dy }; };
  const extra = frames.reduce((a, _, k) => { const r = reach(k); return { dx: Math.max(a.dx, r.dx), dy: Math.max(a.dy, r.dy) }; }, { dx: 0, dy: 0 });
  const bounds = union(frames.map((f) => f.bounds));
  const owners = container === null ? [] : frames.flatMap((f) => f.boxes.filter((b) => b.id === container));
  const pad = 16;
  const ox = container === null ? pad - bounds.x : 0, oy = container === null ? pad - bounds.y : 0;
  const w = (container === null ? bounds.w + 2 * pad : Math.max(40, ...owners.map((b) => b.w))) + extra.dx;
  const h = (container === null ? bounds.h + 2 * pad : Math.max(40, ...owners.map((b) => b.h))) + extra.dy;
  const at = (step: number): Record<Id, Rect> => {
    const state = input.states[step], frame = frames[step];
    if (!state || !frame) return {};
    const owner = container === null ? null : frame.boxes.find((b) => b.id === container);
    const out: Record<Id, Rect> = {};
    for (const id of input.members) {
      const st = state.things[id];
      if (!st?.visible || st.at || (st.in ?? model.things[id].parent) !== container) continue;
      const box = placed[step]?.find((b) => b.id === id);
      if (box) out[id] = { x: box.x - (owner?.x ?? 0) + ox, y: box.y - (owner?.y ?? 0) + oy - lift(id, box), w: box.w, h: box.h }; // fmt12: placed = moved over by a grown neighbour
    }
    return out;
  };
  return {
    w, h, at, decor: () => [],
    draw(step, id, rect, state) {
      const data = structureMember(model.things[id], state, rect, ctx);
      if (data) return data;
      const box = frames[step]?.boxes.find((b) => b.id === id);
      if (!box?.container || !box.lbl) return null;
      // layoutState chooses a heading position clear of every story line, sometimes on the right.
      // Keep that choice when the common renderer supplies the container's shape and text.
      return thingPrims(model.things[id], state, rect, ctx.look, ctx.phone).map((p) => p.k === "text" && p.key === `t:${id}:title`
        ? { ...p, x: rect.x + box.lbl!.x - box.x, y: rect.y + box.lbl!.y - box.y + LINE_H.lane - 5 }
        : p);
    },
    routes(step, rel, from) {
      const frame = frames[step]; if (!frame) return null;
      const a = frame.boxes.find((b) => b.id === rel.from), b = frame.boxes.find((b) => b.id === rel.to);
      if (!a || !b) return null;
      const edge = frame.edges.find((e) => e.from === a.key && e.to === b.key);
      if (!edge) return null;
      // render3: a data structure drawn bigger than the graph engine sized it (wider) is left and entered at its drawn border
      // fmt12: as placed (a member moved over by a grown neighbour is left and entered where it is drawn)
      const grown = <T extends { id: string; x: number; y: number; w: number; h: number }>(q: T): T => { const p = placed[step]?.find((b) => b.id === q.id); return p ? { ...q, x: p.x, y: p.y - lift(q.id, p), w: p.w, h: p.h } : q; };
      const ga = grown(a), gb = grown(b), geom0 = edgeGeom(edge, ga, gb), dx = from.x - ga.x, dy = from.y - ga.y;
      // a stored route (rt) keeps the graph engine's ports: an end that lies inside a grown box moves out to its nearest
      // drawn border (its control point with it), so the line meets the border and the fanned ports stay
      const out = (pt: { x: number; y: number }, c: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) => {
        if (pt.x <= r.x || pt.x >= r.x + r.w || pt.y <= r.y || pt.y >= r.y + r.h) return [pt, c];
        const d = [[pt.y - r.y, 0, r.y - 3 - pt.y], [r.y + r.h - pt.y, 0, r.y + r.h + 3 - pt.y], [pt.x - r.x, r.x - 3 - pt.x, 0], [r.x + r.w - pt.x, r.x + r.w + 3 - pt.x, 0]].sort((m, n) => m[0] - n[0])[0];
        return [{ x: pt.x + d[1], y: pt.y + d[2] }, { x: c.x + d[1], y: c.y + d[2] }];
      };
      const ends = (g: typeof geom0, first: boolean, last: boolean): typeof geom0 => {
        let { P, c1, c2, Q } = g;
        if (first && ga !== a) [P, c1] = out(P, c1, ga);
        if (last && gb !== b) [Q, c2] = out(Q, c2, gb);
        return { ...g, P, c1, c2, Q, ...(g.segs ? { segs: g.segs.map((s, i, all) => ends(s, first && i === 0, last && i === all.length - 1)) } : {}) };
      };
      const geom = ends(geom0, true, true);
      const shift = (g: typeof geom): typeof geom => ({ ...g,
        P: { x: g.P.x + dx, y: g.P.y + dy }, Q: { x: g.Q.x + dx, y: g.Q.y + dy },
        c1: { x: g.c1.x + dx, y: g.c1.y + dy }, c2: { x: g.c2.x + dx, y: g.c2.y + dy },
        ...(g.segs ? { segs: g.segs.map(shift) } : {}),
      });
      return bezPath(shift(geom));
    },
  };
}
