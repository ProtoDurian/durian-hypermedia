// Lane eng-scenes: a scene inside a scene (SPEC 6.12). Ported from src/core/scenes.ts (compileNested, nestedLlm).
//
// - `scene id "label" ... end` is lowered by parse into `model.scenes[id]`: its own things, lines and setup facts.
//   Scenes are declared flat in the overview's setup; one scene enters another with `enter`.
// - `enter <scene> from <thing>` and `leave [<scene>]` are steps of their own. The story's path (the scenes it is in,
//   outermost first) is read once per model here; a step's facts belong to the scene on top of the path after its
//   control line, and only to it: every other scene is carried along frozen.
// - Each scene is replayed on its own over the whole story as a "scene model": the scene's model with the story's
//   steps, where a step keeps its facts only when it is a step of that scene (so step k of the scene model is step k
//   of the story, and every scene keeps its own size for the whole story: the still rule).
// - The refusals of SPEC 6.12 that read the steps are found here (`scenePath(model).problems`); the ones that need
//   the states (entering from a thing that is not on the stage) in `sceneProblems`.
import type { Fact, Id, Model, Problem, StepState } from "../types";

/** how deep scenes may go: the overview, a scene inside it, a scene inside that */
export const MAX_DEPTH = 2;
/** a scene's own steps on each visit (after the step that enters): fewer would be a single picture, better as a step */
export const MIN_SUB_STEPS = 2;

type Ctl = Extract<Fact, { k: "enter" } | { k: "leave" }>;
export interface ScenePath {
  /** per step 0..n: the scenes the story is in after that step, outermost first ([] = the overview) */
  path: Id[][];
  /** per step 0..n: the scene whose step it is ("" = the overview), or null for a step that enters or leaves */
  owner: (Id | null)[];
  /** per step that enters: the scene entered; per step that leaves: the scene left (else null) */
  enter: (Id | null)[];
  leave: (Id | null)[];
  /** per step that enters or leaves: the thing entered from (in the outer scene) */
  via: (Id | null)[];
  problems: Problem[];
}

/** a model that uses scenes: one declared, or a step that enters or leaves */
export const hasScenes = (model: Model): boolean =>
  Object.keys(model.scenes).length > 0 || model.steps.some((s) => s.facts.some((f) => f.k === "enter" || f.k === "leave"));

/** the label a scene is called by: its title, else its id */
export const sceneLabel = (model: Model, id: Id): string => model.scenes[id]?.title || id;

const PATHS = new WeakMap<Model, ScenePath>();
export function scenePath(model: Model): ScenePath {
  const hit = PATHS.get(model); if (hit) return hit;
  const ids = Object.keys(model.scenes);
  const problems: Problem[] = [];
  const err = (line: number, msg: string) => problems.push({ line, msg });
  const path: Id[][] = [[]], owner: (Id | null)[] = [""], enter: (Id | null)[] = [null], leave: (Id | null)[] = [null], via: (Id | null)[] = [null];
  type Visit = { id: Id; from: Id; line: number; steps: number };
  const stack: Visit[] = [];
  const entered = new Set<Id>();
  model.steps.forEach((st, i) => {
    const k = i + 1;
    enter[k] = null; leave[k] = null; via[k] = null;
    const ctl = st.facts.filter((f): f is Ctl => f.k === "enter" || f.k === "leave");
    if (!ctl.length) {
      owner[k] = stack[stack.length - 1]?.id ?? "";
      // a step of the scene the story is in counts for that visit (also after a deeper scene was left)
      if (stack.length) stack[stack.length - 1].steps++;
      path[k] = stack.map((v) => v.id);
      return;
    }
    owner[k] = null;
    const o = ctl[0];
    const other = st.facts.find((f) => f !== o && f.k !== "pace");
    if (other) err(other.src.line, `a step that ${o.k === "enter" ? "enters" : "leaves"} a scene does only that (the camera flies ${o.k === "enter" ? "in" : "out"}); put this change in the next step, with its own caption`);
    if (o.k === "enter") {
      if (!model.scenes[o.scene]) err(o.src.line, `enter ${o.scene}: no scene ${o.scene}${ids.length ? ` (scenes: ${ids.join(", ")})` : `; declare it in the setup: scene ${o.scene} "label", its lines, then end`}`);
      else if (stack.some((v) => v.id === o.scene)) err(o.src.line, `enter ${o.scene}: the story is already in ${o.scene}; leave it first`);
      else if (stack.length >= MAX_DEPTH) err(o.src.line, `enter ${o.scene}: scenes go ${MAX_DEPTH} deep at most (the overview, a scene in it, a scene in that); leave one first, or show this in the scene you are in`);
      else { stack.push({ id: o.scene, from: o.from, line: o.src.line, steps: 0 }); entered.add(o.scene); enter[k] = o.scene; via[k] = o.from; }
    } else {
      const top = stack[stack.length - 1];
      if (!top) err(o.src.line, `leave: the story is in the overview, not in a scene; there is nothing to leave`);
      else if (o.scene && o.scene !== top.id) err(o.src.line, `leave ${o.scene}: the story is in ${top.id}${stack.length > 1 ? ` (inside ${stack.slice(0, -1).map((v) => v.id).join(" > ")})` : ""}, not ${o.scene}; write leave, or leave ${top.id}`);
      else {
        if (top.steps < MIN_SUB_STEPS) err(o.src.line, `scene ${top.id} has ${top.steps} step${top.steps === 1 ? "" : "s"} of its own on this visit (after the one that enters, line ${top.line}); give it at least ${MIN_SUB_STEPS}, or show it as a step of the overview`);
        stack.pop(); leave[k] = top.id; via[k] = top.from;
      }
    }
    path[k] = stack.map((v) => v.id);
  });
  for (const v of stack) err(v.line, `the story ends inside scene ${v.id}: add a step that leaves it (leave), so the reader comes back to the overview`);
  for (const id of ids) {
    const line = firstLine(model.scenes[id]);
    if (id === "all" || id === "overview") err(line, `"${id}" is a reserved word; give the scene another id`);
    if (!entered.has(id)) err(line, `scene ${id} is declared but never entered: add a step with enter ${id} from <thing>`);
  }
  // an id names one thing in one scene: the same id in two scenes would make the LLM view and the reader's notes ambiguous
  const where = new Map<Id, string>();
  for (const id of model.order) where.set(id, "");
  for (const sid of ids) for (const id of model.scenes[sid].order) {
    const o = where.get(id);
    if (o === undefined) { where.set(id, sid); continue; }
    err(model.scenes[sid].things[id].src.line, `"${id}" is in ${o ? `scene ${o}` : "the overview"} and in scene ${sid}; an id names one thing in one scene: rename one`);
  }
  const out = { path, owner, enter, leave, via, problems };
  PATHS.set(model, out);
  return out;
}
const firstLine = (m: Model): number => { const v = Math.min(...m.order.map((id) => m.things[id].src.line), ...Object.values(m.relations).map((r) => r.src.line), ...m.setup.map((f) => f.src.line)); return Number.isFinite(v) ? v : 0; };

/** the scene a step is in (null: the overview) */
export const sceneAt = (sp: ScenePath, k: number): Id | null => sp.path[k]?.[sp.path[k].length - 1] ?? null;

/** the facts of step k (1..n) that belong to scene `id` ("" = the overview) */
export const factsIn = (model: Model, sp: ScenePath, id: Id, k: number): Fact[] => (sp.owner[k] === id ? model.steps[k - 1]?.facts ?? [] : []);

const SCENE_MODELS = new WeakMap<Model, Map<Id, Model>>();
/** a scene replayed over the whole story: its own things and setup, the story's steps with only its own facts */
export function sceneModel(model: Model, id: Id): Model {
  let byId = SCENE_MODELS.get(model);
  if (!byId) { byId = new Map(); SCENE_MODELS.set(model, byId); }
  const hit = byId.get(id); if (hit) return hit;
  const sc = model.scenes[id];
  const sp = scenePath(model);
  const m: Model = {
    ...sc, view: model.view, look: model.look, roles: { ...model.roles, ...sc.roles }, scenes: {}, problems: [],
    steps: model.steps.map((st, i) => ({ ...st, facts: factsIn(model, sp, id, i + 1) })),
  };
  byId.set(id, m);
  return m;
}

/** the refusals that need the states: entering from a thing that is not on the stage of the scene the story is in */
export function sceneProblems(model: Model, out: StepState[]): Problem[] {
  const sp = scenePath(model);
  const problems: Problem[] = [];
  model.steps.forEach((st, i) => {
    const k = i + 1, sc = sp.enter[k], from = sp.via[k];
    if (!sc || !from) return;
    const outer = sceneAt(sp, k - 1);
    const s = outer ? out[k - 1]?.inner?.[outer] : out[k - 1];
    if (!s?.things[from]?.visible) {
      const line = st.facts.find((f) => f.k === "enter")?.src.line ?? st.src.line;
      problems.push({ line, msg: `enter ${sc} from ${from}: no ${from} on the stage of ${outer ? `scene ${outer}` : "the overview"} at this step; name a thing that is there` });
    }
  });
  return problems;
}

/** the model a step is drawn and told from: the scene's model inside a scene, else the story's (for a renderer: its
 *  lines, roles and things; with `plan.scene(id)` for the stage's size while inside) */
export const modelAt = (model: Model, state: StepState | undefined): Model =>
  state?.scene && model.scenes[state.scene] ? sceneModel(model, state.scene) : model;
