// The one engine's glue (integrator): source -> Model -> states -> motions -> plans. Every lane's work meets here.
// Contract: ./types.ts. Nothing in this file knows a layout, a chart kind or a colour.
import type { Compiled, EngineSrc, Id, LayoutCtx, LayoutInput, LayoutName, Model, Motion, Placed, Plan, Prim, Problem, Rect, StepState } from "./types";
import { LAYOUT } from "./layouts";
import { parse12 } from "./parse/parse12";
import { lowerStage } from "./parse/lower-stage";
import { lowerGraph } from "./parse/lower-graph";
import { states as stepStates } from "./core/states";
import { diff, still } from "./core/diff";
import { check } from "./core/check";
import { llm } from "./core/llm";
import { sceneModel } from "./core/scenes"; // eng-scenes
import { thingPrims } from "./render/prims";
import { TITLE_RANK, withTitleFloor } from "./render/prims/fit"; // render2
import { route, routeTaken } from "./render/route";
import { focusRect } from "./render/camera";
import { CHART } from "./charts";
import type { ThingState, Thing } from "./types";
import { isStage } from "../core/stage";
import { measure as stageMeasure, wrap as stageWrap } from "../core/stage-core";
import { atSizes } from "./render/font";

const PHONE_W = 480;

/** Which front-end reads a block (ENGINE.md section 1). */
export function frontEnd(src: EngineSrc): Model["origin"] {
  if (src.format12) return "format12";
  const head = src.body.split("\n@step")[0];
  return isStage(src.fence, head) ? "stage11" : "graph10";
}

export function readModel(src: EngineSrc): Model {
  const o = frontEnd(src);
  return o === "format12" ? parse12(src) : o === "stage11" ? lowerStage(src) : lowerGraph(src);
}

export function compile(src: EngineSrc): Compiled {
  const model = readModel(src);
  const states = stepStates(model);
  const motions: Motion[] = states.map((s, k) => (k === 0 ? still(0) : diff(model, states[k - 1], s)));
  const problems: Problem[] = [...model.problems, ...check(model, states)];
  const plans = new Map<number, Plan>();
  return {
    model, states, motions, problems,
    plan: (width) => {
      const w = Math.round(width); let p = plans.get(w);
      if (!p) {
        p = planAt(model, states, motions, w); plans.set(w, p);
        for (const q of p.problems) if (!problems.some((o) => o.line === q.line && o.msg === q.msg)) problems.push(q);
      }
      return p;
    },
    llm: () => llm(model, states),
  };
}

/** the layout a container uses: its own flag, else the layout that holds it (that layout lays out its insides) */
const layoutOf = (model: Model, id: Id | null, inherited: LayoutName): LayoutName => (id === null ? model.layout : model.things[id]?.layout ?? inherited);

/** members of a container: things whose `in` is it at some step, in declaration order */
function membersOf(model: Model, states: StepState[], id: Id | null): Id[] {
  const set = new Set<Id>();
  for (const s of states) for (const t of model.order) { const st = s.things[t]; if (st && (st.in ?? model.things[t].parent) === id && !st.at) set.add(t); }
  return model.order.filter((t) => set.has(t));
}

/** the plan at a width: placed and drawn at that width's type sizes (phone or stage), without leaving the module-wide
 *  font flag changed - every call into the plan, now or later, measures at its own sizes (render/font.ts atSizes) */
export function planAt(model: Model, states: StepState[], motions: Motion[], width: number): Plan {
  const phone = width < PHONE_W;
  const p = atSizes(phone, () => planAtSizes(model, states, motions, width, phone));
  const out = { ...p } as Record<string, unknown>;
  for (const [k, v] of Object.entries(p)) if (typeof v === "function") out[k] = (...a: unknown[]) => atSizes(phone, () => (v as (...x: unknown[]) => unknown)(...a));
  return out as unknown as Plan;
}

function planAtSizes(model: Model, states: StepState[], motions: Motion[], width: number, phone: boolean): Plan {
  const problems: Problem[] = [];
  const placed = new Map<string, Placed>();
  const availOf = new Map<string, number | undefined>(); // a child placed again at another width replaces the earlier placement
  const place = (id: Id | null, inherited: LayoutName, avail?: number): Placed => {
    const key = id ?? "";
    const hit = placed.get(key); if (hit && (avail === undefined || availOf.get(key) === avail)) return hit;
    availOf.set(key, avail);
    const name = layoutOf(model, id, inherited);
    const plugin = LAYOUT[name];
    const input: LayoutInput = { model, states, container: id, members: membersOf(model, states, id), regions: id === null ? model.regions : [], ...(avail !== undefined ? { avail } : {}) };
    const ctx: LayoutCtx = {
      width, phone, look: model.look,
      measure: (t, f) => stageMeasure(t, f), wrap: (t, w, f, max) => stageWrap(t, w, f, max),
      child: (c, w) => place(c, name, w), problem: (p) => problems.push(p),
    };
    const p = plugin.place(input, ctx);
    placed.set(key, p);
    return p;
  };
  const root = place(null, model.layout);

  // absolute rects: a member's rect is relative to its container's top-left
  const rectsCache = new Map<number, Record<Id, Rect>>();
  const rects = (step: number): Record<Id, Rect> => {
    const hit = rectsCache.get(step); if (hit) return hit;
    const out: Record<Id, Rect> = {};
    const walk = (p: Placed, ox: number, oy: number) => {
      for (const [id, r] of Object.entries(p.at(step))) {
        const a = { x: r.x + ox, y: r.y + oy, w: r.w, h: r.h }; out[id] = a;
        const c = placed.get(id); if (c) walk(c, a.x, a.y);
      }
    };
    walk(root, 0, 0);
    // tokens and refs sit at a thing: placed by the renderer's prims next to it (state.at)
    for (const [id, st] of Object.entries(states[step]?.things ?? {})) if (st.at && out[st.at] && !out[id]) out[id] = { ...out[st.at] };
    rectsCache.set(step, out);
    return out;
  };

  const frame = (step: number): Prim[] => {
    const s = states[step]; const r = rects(step); const prims: Prim[] = [];
    const offsetOf = (key: string): [number, number] => { if (key === "") return [0, 0]; const a = r[key]; return a ? [a.x, a.y] : [0, 0]; };
    // paint order: the stage's decor, then each thing followed by the decor of the layout inside it (a container's box
    // is under its own layout's titles and cells, and over what lies under it)
    const decorOf = (key: string) => { const p = placed.get(key); if (!p) return; const [ox, oy] = offsetOf(key); for (const d of p.decor(step)) prims.push(shiftPrim(d, ox, oy)); };
    decorOf("");
    const things = () => { for (const id of paintOrder(model, s)) {
      const st = s.things[id]; const rect = r[id]; if (!st?.visible || !rect) continue;
      const t = model.things[id];
      if (t.chart) { prims.push(...chartPrims(t, step, rect)); continue; }
      const owner = placed.get(st.in ?? t.parent ?? "") ?? root;
      const own = owner.draw?.(step, id, rect, st);
      prims.push(...(own ?? thingPrims(model.things[id], st, rect, model.look, phone)));
      if (id !== "") decorOf(id);
    } };
    const start = prims.length;
    things();
    // render2: a graph scene's boxes share one title size (the smallest any of them took): drawn again with that floor
    if (model.layout === "graph") {
      const ranks = prims.slice(start).flatMap((p) => (p.k === "text" && p.id && p.key === `t:${p.id}:title` && !model.things[p.id]?.container && TITLE_RANK[p.font] !== undefined ? [TITLE_RANK[p.font]] : []));
      const most = Math.max(-1, ...ranks);
      if (ranks.length > 1 && ranks.some((k) => k !== most)) { prims.length = start; withTitleFloor(most === 2 ? "sub" : "body", things); }
    }
    const obstacles = Object.values(r);
    // lines a layout routes itself go first, so the engine's router keeps every other line off them
    const shown = Object.values(model.relations).flatMap((rel) => {
      if (!s.relations[rel.id]?.visible) return [];
      const a = r[rel.from], b = r[rel.to]; if (!a || !b) return [];
      const owner = placed.get(model.things[rel.from]?.parent ?? "") ?? root;
      const own = owner.routes?.(step, rel, a, b) ?? null;
      if (own) routeTaken(obstacles, own);
      return [{ rel, a, b, owner, own }];
    });
    // eng-lanes2: a layout may route two relations along one line (the lanes stage draws one line for a pair and its
    // reverse); the second is drawn as `eng-shared` (engine.css: no stroke), so the line is drawn once, while its prim
    // stays for its arrowhead and for the dot of what it carries
    const ownEnds = new Set<string>();
    for (const { rel, a, b, owner, own } of shown) {
      const d = own ?? route(rel, a, b, obstacles);
      const ends = own ? sharedKey(own) : null, shared = !!ends && ownEnds.has(ends);
      if (ends) ownEnds.add(ends);
      const cls = [owner.words === "own" || root.words === "own" ? "eng-words-own" : "", shared ? "eng-shared" : ""].filter(Boolean).join(" ");
      // a line without its own (role) takes its source thing's colour (the stage's rule)
      // eng-polish: a line the step sends along (or lights) draws hot: the stage's 2.2 px at full strength (types.ts Prim width "hot")
      const hot = (motions[step]?.events ?? []).some((e) => (e.k === "send" && e.rel === rel.id) || (e.k === "light" && e.ids.includes(rel.id)));
      prims.push({ k: "path", key: `rel:${rel.id}`, id: rel.id, d, role: rel.role ?? model.things[rel.from]?.role ?? null, dashed: rel.style === "dashed", arrow: rel.style === "line" ? null : rel.style === "both" ? "both" : "end", ...(hot ? { width: "hot" as const } : {}), ...(cls ? { cls } : {}) });
    }
    // eng-lanes2: prims a layout marks `eng-top` (types.ts Prim) are drawn after the lines, in their own order
    const top = (p: Prim) => /(^|\s)eng-top(\s|$)/.test(p.cls ?? "");
    if (prims.some(top)) return [...prims.filter((p) => !top(p)), ...prims.filter(top)];
    return prims;
  };
  // a chart thing draws through the chart system (charts/), with what it needs to glide and keep its size
  const chartPrims = (t: Thing, step: number, rect: Rect): Prim[] => {
    const spec = t.chart!;
    const at = (k: number) => chartNumbers(t, states[k]?.things[t.id]);
    const max = at(0).map((row, s) => row.map((_, j) => Math.max(...states.map((_s, k) => at(k)[s]?.[j] ?? 0))));
    const lit = (motions[step]?.events ?? []).flatMap((e) => (e.k === "light" ? e.ids : [])).filter((i) => i.startsWith(t.id + ".")).map((i) => i.slice(t.id.length + 1));
    return CHART[spec.kind].draw(spec, at(step), rect, { phone, look: model.look, measure: (x, f) => stageMeasure(x, f), step, prev: step > 0 ? at(step - 1) : null, max, lit });
  };
  const whole: Rect = { x: 0, y: 0, w: root.w, h: root.h };
  const caption = (step: number) => [...placed.values()].flatMap((p) => p.caption?.(step) ?? []);
  const focus = (step: number) => { const r = rects(step); return focusRect((motions[step]?.touched ?? []).map((id) => r[id]).filter(Boolean), whole, phone); };
  // eng-scenes: a nested scene has its own plan (its own size, over the whole story); at a step inside it, frame, rects,
  // focus and caption are that scene's (in its own coordinates: the renderer frames it into the stage, which keeps the
  // overview's size, SPEC 6.12)
  const scenePlans = new Map<Id, Plan>();
  const scene = (id: Id): Plan => {
    const hit = scenePlans.get(id); if (hit) return hit;
    const sm = sceneModel(model, id);
    const inner = states.map((s) => s.inner![id]);
    const p = planAt(sm, inner, inner.map((s, k) => (k === 0 ? still(0) : { ...diff(sm, inner[k - 1], s), scene: id })), width);
    scenePlans.set(id, p);
    return p;
  };
  const at = (step: number): Plan | null => { const id = states[step]?.scene; return id && model.scenes[id] && states[step].inner?.[id] ? scene(id) : null; };
  // a step past either end (a caller counting steps differently, a story with no steps) is the nearest real step
  const near = (step: number) => Math.max(0, Math.min(states.length - 1, Math.floor(Number.isFinite(step) ? step : 0)));
  return {
    width, w: root.w, h: root.h, phone, problems,
    frame: (k) => { const step = near(k); return at(step)?.frame(step) ?? frame(step); },
    rects: (k) => { const step = near(k); return at(step)?.rects(step) ?? rects(step); },
    caption: (k) => { const step = near(k); return at(step)?.caption(step) ?? caption(step); },
    words: root.words,
    focus: (k) => { const step = near(k); return at(step)?.focus(step) ?? focus(step); },
    ...(Object.keys(model.scenes).length ? { scene } : {}),
  };
}

/** eng-lanes2: a path's two ends, in either order (the same line run either way has the same key) */
export function sharedKey(d: string): string | null {
  const n = d.match(/-?\d+(?:\.\d+)?/g); if (!n || n.length < 4) return null;
  const r = (v: string) => Math.round(Number(v));
  const a = `${r(n[0])},${r(n[1])}`, b = `${r(n[n.length - 2])},${r(n[n.length - 1])}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function shiftPrim(p: Prim, dx: number, dy: number): Prim {
  if (!dx && !dy) return p;
  switch (p.k) {
    case "box": case "rect": return { ...p, rect: { ...p.rect, x: p.rect.x + dx, y: p.rect.y + dy } };
    case "text": case "chip": case "dot": return { ...p, x: p.x + dx, y: p.y + dy };
    case "path": return { ...p, d: `M0 0` === p.d ? p.d : translatePath(p.d, dx, dy) };
  }
}
/** absolute SVG path commands only (M, L, H, V, C, Q, A, Z), which is what the layouts emit */
export function translatePath(d: string, dx: number, dy: number): string {
  return d.replace(/([MLHVCQAZ])([^MLHVCQAZ]*)/g, (_m, c: string, args: string) => {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    const out = n.map((v, i) => {
      if (c === "H") return v + dx; if (c === "V") return v + dy; if (c === "Z") return v;
      if (c === "A") return i % 7 === 5 ? v + dx : i % 7 === 6 ? v + dy : v;
      return i % 2 === 0 ? v + dx : v + dy;
    });
    return c + (out.length ? out.map((v) => +v.toFixed(2)).join(" ") : "");
  });
}

/** a chart thing's numbers at a step: series 0 from `values`, the rest from `series`, else the setup's */
export function chartNumbers(t: Thing, st: ThingState | undefined): number[][] {
  const spec = t.chart!; const num = (v: string[]) => v.map((x) => Number(String(x).replace(/,/g, "")) || 0);
  return spec.series.map((ser, s) => {
    const w = s === 0 ? st?.values : st?.series?.[s];
    return w ? num(w) : ser.values;
  });
}

/** the order things are painted at a step: a container before what it holds at that step (its depth by `in`, then
 *  declaration order), and things sitting at a thing (tokens, refs) after everything else, so nothing that moved
 *  into a later-declared container is painted under it */
export function paintOrder(model: Model, s: StepState): Id[] {
  const up = (id: Id): Id | null => s.things[id]?.in ?? model.things[id]?.parent ?? null;
  const depth = new Map<Id, number>();
  const d = (id: Id, seen = 0): number => { const hit = depth.get(id); if (hit !== undefined) return hit; const p = up(id); const v = p && seen < 64 ? d(p, seen + 1) + 1 : 0; depth.set(id, v); return v; };
  const at = (id: Id) => (s.things[id]?.at ? 1 : 0);
  return model.order.map((id, i) => ({ id, i, a: at(id), k: d(id) })).sort((x, y) => x.a - y.a || x.k - y.k || x.i - y.i).map((x) => x.id);
}
