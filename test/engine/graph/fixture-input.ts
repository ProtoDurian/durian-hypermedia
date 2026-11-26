// Legacy replay to hand-built frozen-contract inputs, shared by the geometry and browser checks.
import { parseScene, play, type Ent } from "../../../src/core/scene";
import type { LayoutInput, Model, Shape, StepState, Thing } from "../../../src/engine/types";

export function fixtureInput(head: string, steps: { title: string; raw: string; line: number }[], info: Record<string, string>): LayoutInput {
  const src = { head, steps, base: 1, info };
  const parsed = parseScene(head, steps.length ? [{ title: "Setup", raw: "", line: 1 }, ...steps] : [], 1, info);
  const replay = play(parsed.scene);
  const all = new Map<string, Ent>();
  for (const s of replay.states) for (const e of Object.values(s.ents)) if (!all.has(e.id)) all.set(e.id, e);
  const things: Record<string, Thing> = Object.fromEntries([...all.values()].map((e, order) => [e.id, {
    id: e.id, title: e.label, role: e.family, lines: [], flags: [e.kind], shape: e.kind === "pointer" ? "ref" : e.kind as Shape,
    layout: null, container: ["group", "graph", "grid", "array", "list", "stack", "queue", "tree"].includes(e.kind),
    parent: e.parent, region: null, order, values: null, keys: { layout: e.layout }, chart: null, src: { line: 1 },
  }]));
  const model: Model = { format: 12, origin: "graph10", layout: info.layout === "free" ? "free" : "graph", title: null, note: null,
    look: "classic", view: "2d", roles: {}, regions: [], things, order: [...all.keys()], relations: {}, setup: [],
    steps: steps.map((s) => ({ title: s.title, caption: "", facts: [], src: { line: s.line } })),
    scenes: {}, fence: { ...info, "graph-src": JSON.stringify(src) }, layoutWords: {}, problems: [], };
  const states: StepState[] = replay.states.map((s, step) => ({ step,
    things: Object.fromEntries([...all.keys()].map((id) => [id, {
      visible: !!s.ents[id], in: s.ents[id]?.parent ?? things[id].parent, at: s.ents[id]?.anchor ?? null, side: null,
      is: null, text: null, tone: null, dim: false, values: null, lifted: false, open: false,
    }])), relations: {}, focus: "all", zoom: [], layersApart: false, scene: null, camera: null, layout: {},
  }));
  return { model, states, members: model.order.filter((id) => states.some((s) => s.things[id].in === null && !s.things[id].at)), container: null, regions: [] };
}

