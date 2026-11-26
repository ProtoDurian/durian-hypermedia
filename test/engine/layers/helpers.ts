// Hand-built Models and StepStates for the layers lane (the parse and core lanes are not merged yet).
import type { Id, Model, Region, Relation, StepState, Thing, ThingState, Shape } from "../../../src/engine/types";

export interface T { id: Id; title?: string; region?: Id; parent?: Id; shape?: Shape; lines?: string[]; layout?: Thing["layout"]; keys?: Record<string, string> }

export function model(layers: [Id, string][], things: T[], rels: [Id, Id][] = [], opts: Partial<Model> = {}): Model {
  const regions: Region[] = layers.map(([id, title], i) => ({ id, title, flags: [], src: { line: i + 1 } }));
  const th: Record<Id, Thing> = {};
  things.forEach((t, order) => {
    const kids = things.some((x) => x.parent === t.id);
    th[t.id] = {
      id: t.id, role: null, title: t.title ?? t.id, lines: t.lines ?? [], flags: [], shape: t.shape ?? "box", layout: t.layout ?? null,
      container: kids || !!t.layout, parent: t.parent ?? null, region: t.region ?? null, order, values: null, keys: t.keys ?? {}, chart: null, src: { line: 10 + order },
    };
  });
  const relations: Record<Id, Relation> = {};
  for (const [a, b] of rels) relations[`${a}->${b}`] = { id: `${a}->${b}`, from: a, to: b, style: "arrow", label: null, role: null, setup: true, src: { line: 99 } };
  return {
    format: 12, origin: "graph10", title: null, note: null, look: "stage", view: "3d", layout: "layers", roles: {}, regions, things: th,
    order: things.map((t) => t.id), relations, setup: [], steps: [], scenes: {}, fence: { "3d": "" }, layoutWords: {}, problems: [], ...opts,
  };
}

const ts = (over: Partial<ThingState> = {}): ThingState => ({ visible: true, at: null, in: null, side: null, is: null, text: null, tone: null, dim: false, values: null, lifted: false, open: false, ...over });

/** n states (0..n-1), everything visible, nothing moving */
export function states(m: Model, n = 1, over: (step: number, id: Id) => Partial<ThingState> = () => ({}), focus: (step: number) => Id | "all" = () => "all"): StepState[] {
  return Array.from({ length: n }, (_, step) => ({
    step,
    things: Object.fromEntries(m.order.map((id) => [id, ts({ in: m.things[id].parent, ...over(step, id) })])),
    relations: Object.fromEntries(Object.keys(m.relations).map((r) => [r, { visible: true }])),
    focus: focus(step), zoom: [], layersApart: false, scene: null, camera: null, layout: {},
  }));
}
