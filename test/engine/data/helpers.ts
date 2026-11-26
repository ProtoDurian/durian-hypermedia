// Hand-built Models and StepStates for the data and tree layout tests (core and parse are other lanes).
import type { Fact, Id, LayoutCtx, LayoutName, Model, Placed, Plan, Prim, Rect, Shape, StepState, Thing, ThingState } from "../../../src/engine/types";
import { LAYOUT } from "../../../src/engine/layouts";

export interface TSpec { id: Id; title?: string; layout?: LayoutName; shape?: Shape; flags?: string[]; parent?: Id | null; values?: string[]; keys?: Record<string, string>; container?: boolean }
export const thing = (s: TSpec, order: number): Thing => ({
  id: s.id, role: null, title: s.title ?? "", lines: [], flags: s.flags ?? [], shape: s.shape ?? "box", layout: s.layout ?? null,
  container: s.container ?? !!s.layout, parent: s.parent ?? null, region: null, order, values: s.values ?? null, keys: s.keys ?? {}, chart: null, src: { line: 1 },
});
export const src = { line: 1 };
export function model(things: TSpec[], steps: Fact[][] = [], opts: { layout?: LayoutName; setup?: Fact[]; fence?: Record<string, string> } = {}): Model {
  const th: Record<Id, Thing> = {};
  things.forEach((s, i) => { th[s.id] = thing(s, i); });
  return {
    format: 12, origin: "format12", title: null, note: null, look: "stage", view: "2d", layout: opts.layout ?? "graph", roles: {}, regions: [], things: th,
    order: things.map((t) => t.id), relations: {}, setup: opts.setup ?? [], steps: steps.map((facts, i) => ({ title: `s${i + 1}`, caption: "", facts, src })), scenes: {}, fence: opts.fence ?? {}, layoutWords: {}, problems: [],
  };
}
const blank = (visible: boolean, parent: Id | null): ThingState => ({ visible, at: null, in: parent, side: null, is: null, text: null, tone: null, dim: false, values: null, lifted: false, open: false });
/** a minimal stand-in for core.states: replays show/hide/in/at/values/side facts */
export function states(m: Model, hidden: Id[] = []): StepState[] {
  const cur: Record<Id, ThingState> = {};
  for (const id of m.order) cur[id] = { ...blank(!hidden.includes(id), m.things[id].parent), values: m.things[id].values };
  const out: StepState[] = [];
  const snap = (step: number) => out.push({ step, things: Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, { ...v }])), relations: {}, focus: "all", zoom: [], layersApart: false, scene: null, camera: null, layout: {} });
  const apply = (facts: Fact[]) => {
    for (const f of facts) {
      if (f.k === "show" || f.k === "hide") for (const i of f.ids) cur[i].visible = f.k === "show";
      else if (f.k === "in") for (const i of f.ids) { cur[i].in = f.place; cur[i].at = null; if (f.side) cur[i].side = f.side; }
      else if (f.k === "at") for (const i of f.ids) cur[i].at = f.place;
      else if (f.k === "values") cur[f.id].values = f.values;
      else if (f.k === "zoom" && f.into) for (const i of f.into) cur[i].open = true;
    }
  };
  apply(m.setup); snap(0);
  m.steps.forEach((s, k) => { apply(s.facts); snap(k + 1); });
  return out;
}
export const ctx = (width = 1280, over: Partial<LayoutCtx> = {}): LayoutCtx & { child: (id: Id) => Placed } => {
  let self: LayoutCtx & { child: (id: Id) => Placed };
  self = {
    width, phone: width < 480, look: "stage",
    measure: (t) => t.length * 7, wrap: (t, w) => { const out: string[] = []; let cur = ""; for (const wd of t.split(" ")) { if (cur && (cur + " " + wd).length * 7 > w) { out.push(cur); cur = wd; } else cur = cur ? cur + " " + wd : wd; } if (cur) out.push(cur); return out; },
    child: () => { throw new Error("child not wired"); }, problem: () => {}, ...over,
  };
  return self;
};
/** lay out one container like the pipeline: children by their own layout, members by in/parent */
export function lay(m: Model, st: StepState[], container: Id | null, width = 1280): Placed {
  const placed = new Map<string, Placed>();
  const place = (id: Id | null, inherited: LayoutName): Placed => {
    const key = id ?? ""; const hit = placed.get(key); if (hit) return hit;
    const name = id === null ? m.layout : m.things[id]?.layout ?? inherited;
    const members = m.order.filter((t) => st.some((s) => { const x = s.things[t]; return x && (x.in ?? m.things[t].parent) === id && !x.at; }));
    const c = ctx(width, { child: (c2: Id) => place(c2, name) });
    const p = LAYOUT[name].place({ model: m, states: st, container: id, members, regions: [] }, c);
    placed.set(key, p); return p;
  };
  return place(container, container === null ? m.layout : m.things[container].layout ?? "graph");
}
export const cells = (p: Placed, step: number, id: Id): { key: string; rect: Rect; text: string }[] => {
  const prims = p.decor(step);
  const out: { key: string; rect: Rect; text: string }[] = [];
  for (const d of prims) if (d.k === "box" && d.id?.startsWith(`${id}.`)) { const t = prims.find((x): x is Extract<Prim, { k: "text" }> => x.k === "text" && x.key === `${d.key}:t`); out.push({ key: d.key, rect: d.rect, text: t?.lines[0] ?? "" }); }
  return out;
};
export type { Plan };
