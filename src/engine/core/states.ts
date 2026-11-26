// Lane core (Opus): facts -> what is true at each step. Contract: ../types.ts, ../ENGINE.md 2.2, DESIGN 2.1.
//
// Rules (DESIGN 2.1, ENGINE.md 2.2):
// - step 0 is the setup: the declared things, then the setup's facts in order; step k starts from step k-1.
// - in one step the last line about a thing wins; writing a fact that is already true changes nothing.
// - a thing whose first show/hide/split/merge mention in the steps is `show x`, a piece of a split or what a merge
//   makes starts hidden, and so does what it holds (it hides with its container, and shows with it unless it is
//   itself named in a later `show`).
// - `is` replaces the chip (never stacks); `tone x off` clears the tone.
// - a relation drawn in a step stays until `clear` (setup relations stay); it shows while both its ends show, so
//   `hide x` takes x's lines with it and a later `show x` brings them back (SPEC 6.13). `show`/`hide` may name a
//   relation id (`a->b`) to draw or remove that line.
// - a lost send (`a -x b`) draws no lasting line; a stream (`a ~> b`) and a plain `a -> b` do.
// - `split`, `merge`, `drop` are events that also set the pieces' state: the pieces of a split show where the token
//   was and it goes; what a merge makes shows where the first piece was and the pieces go; a dropped token goes.
// - layout-owned words (`layout` facts) are handed to the owning plug-in's `step` hook, once per step, with its
//   state from the step before; its answer is `StepState.layout[name]`.
// - a chart's other series (`id.2 = ...`: a values fact with `series` k >= 1) go to `ThingState.series[k]` (index 0
//   unused: series 0 is `values`).
// While replaying, the refusals that need the running state (zoom, lift, a token moved twice, a lifted thing moved,
// pointing into a closed inside) are collected; `check` reads them through `replayProblems`.
import type { Fact, Id, Model, Problem, StepState, ThingState } from "../types";
import { LAYOUT, layoutForWord } from "../layouts";
import { expand, within } from "./ids";
import { goneMessage } from "./gone";
import { hasScenes, sceneAt, sceneModel, sceneProblems, scenePath, factsIn } from "./scenes"; // eng-scenes

type LayoutFact = Extract<Fact, { k: "layout" }>;

const REPLAY = new WeakMap<Model, Problem[]>();
const CACHE = new WeakMap<Model, StepState[]>();

/** refusals found while replaying the model (zoom, lift, tokens, closed insides, layout words) */
export function replayProblems(model: Model): Problem[] {
  if (!REPLAY.has(model)) states(model);
  return REPLAY.get(model) ?? [];
}

/** a closed thing: `[closed]`, `[hidden-inside]`, or the legacy key `closed=yes|hidden` */
export const isClosed = (model: Model, id: Id): boolean => {
  const t = model.things[id];
  if (!t) return false;
  return t.flags.includes("closed") || t.flags.includes("hidden-inside") || t.keys.closed === "yes" || t.keys.closed === "hidden";
};
/** a closed thing whose inside is not drawn at all until zoomed into */
export const insideHidden = (model: Model, id: Id): boolean => {
  const t = model.things[id];
  return !!t && (t.flags.includes("hidden-inside") || t.keys.closed === "hidden");
};

const DATA = new Set(["array", "list", "stack", "queue", "map"]);
/** a thing that holds values: a data structure, a chart, or one declared with values */
export const holdsValues = (model: Model, id: Id): boolean => {
  const t = model.things[id];
  return !!t && (t.chart !== null || (t.layout !== null && DATA.has(t.layout)) || t.values !== null || t.flags.includes("values"));
};

function initialThing(model: Model, id: Id): ThingState {
  const t = model.things[id];
  const side = t.flags.includes("left") ? "left" : t.flags.includes("right") ? "right" : null;
  const values = t.values ? [...t.values] : t.chart?.series[0] ? t.chart.series[0].values.map(String) : null;
  return { visible: true, at: null, in: t.parent, side, is: null, text: null, tone: null, dim: false, values, lifted: false, open: false };
}

/** things that start hidden: the first show/hide/split/merge mention of them in the steps makes them appear */
function startsHidden(model: Model): Set<Id> {
  const first = new Map<Id, boolean>(); // id -> hidden at start
  const note = (ids: Id[], hidden: boolean) => { for (const id of expand(model, ids)) if (model.things[id] && !first.has(id)) first.set(id, hidden); };
  for (const s of model.steps) for (const f of s.facts) {
    if (f.k === "show") note(f.ids, true);
    else if (f.k === "hide") note(f.ids, false);
    else if (f.k === "split") { note([f.id], false); note(f.into, true); }
    else if (f.k === "merge") { note(f.ids, false); note([f.into], true); }
  }
  return new Set([...first].filter(([, h]) => h).map(([id]) => id));
}

/** the layouts a model uses (its own, its regions', its containers') */
function usedLayouts(model: Model): Set<string> {
  const out = new Set<string>([model.layout]);
  for (const r of model.regions) if (r.layout) out.add(r.layout);
  for (const id of model.order) { const l = model.things[id].layout; if (l) out.add(l); }
  for (const k of Object.keys(model.layoutWords)) out.add(k); // a layout whose setup words the scene writes
  return out;
}

interface Run {
  model: Model;
  st: StepState;
  own: Record<Id, boolean>;      // shown/hidden as written (a thing also hides with its container)
  drawn: Record<Id, boolean>;    // relations drawn (they show while both ends show)
  problems: Problem[];
  moved: Map<Id, number>;        // tokens moved in this step -> line
}

const parentOf = (r: Run) => (id: Id): Id | null => r.st.things[id]?.in ?? null;
const isToken = (model: Model, id: Id) => { const s = model.things[id]?.shape; return s === "token" || s === "ref"; };

/** the closed thing (not zoomed into) that hides `id`, if any */
function hiddenBy(r: Run, id: Id): Id | null {
  const up = parentOf(r);
  let p = r.st.things[id]?.at ?? up(id);
  // a token at a thing: what hides that thing (or the thing itself when closed and it sits inside)
  if (r.st.things[id]?.at) { const at = r.st.things[id].at!; if (isClosed(r.model, at) && !r.st.things[at]?.open) return null; p = up(at); }
  for (let n = 0; p && n < 256; n++, p = up(p)) if (isClosed(r.model, p) && !r.st.things[p]?.open) return p;
  return null;
}
function pointInto(r: Run, what: string, id: Id, line: number) {
  const by = hiddenBy(r, id);
  if (by) r.problems.push({ line, msg: `${what} ${id}, which is inside ${by}; ${by} is closed (its inside is ${insideHidden(r.model, by) ? "not drawn" : "drawn faint, without words"}): zoom into ${by} in this step or an earlier one` });
}

function setThing(r: Run, id: Id, patch: Partial<ThingState>) {
  const cur = r.st.things[id];
  if (!cur) return;
  r.st.things[id] = { ...cur, ...patch };
}

function moveToken(r: Run, id: Id, line: number) {
  if (!isToken(r.model, id)) return;
  const prev = r.moved.get(id);
  if (prev !== undefined) r.problems.push({ line, msg: `one hop per step: ${id} already moved in this step (line ${prev}); give its next hop a step of its own, with its own caption` });
  else r.moved.set(id, line);
}

function liftedMove(r: Run, id: Id, line: number) {
  if (r.st.things[id]?.lifted) r.problems.push({ line, msg: `${id} is lifted out of its box in this step; a lifted thing settles back into its own place, so it cannot move: put back ${id} (or zoom out) in an earlier step, then move it` });
}

function holdsAny(r: Run, id: Id): boolean {
  const up = parentOf(r);
  return r.model.order.some((t) => t !== id && up(t) === id);
}

function putBackInside(r: Run, ids: Id[]) {
  const up = parentOf(r);
  for (const t of r.model.order) if (r.st.things[t]?.lifted && ids.some((z) => t === z || within(up, t, z))) setThing(r, t, { lifted: false });
}

/** render3: a cell of a data structure (`a.2`, `h.apple`): the data layout draws it and gives it a rect, so a token or a pointer can
 *  sit at it (format 47: `i at a.2`; the core dropped it, and the pointer was drawn apart from the array) */
const DATA_LAYOUTS = new Set(["array", "list", "stack", "queue", "map"]);
function isCell(model: Model, place: Id): boolean {
  const k = place.lastIndexOf("."); if (k <= 0) return false;
  const base = model.things[place.slice(0, k)];
  return !!base && !!base.layout && DATA_LAYOUTS.has(base.layout);
}

function applyFact(r: Run, f: Fact) {
  const { model } = r;
  const line = f.src.line;
  // a part (`a.2`, `returns.Jul`) has no ThingState: a state fact on a part changes nothing (events still name it)
  const known = (ids: Id[]) => expand(model, ids).filter((x) => model.things[x]);
  switch (f.k) {
    case "show": case "hide": {
      for (const id of expand(model, f.ids)) {
        if (model.relations[id]) { r.drawn[id] = f.k === "show"; continue; }
        if (model.things[id]) r.own[id] = f.k === "show";
      }
      return;
    }
    case "at": {
      for (const id of known(f.ids)) {
        if ((!model.things[f.place] && !(isCell(model, f.place) && ["token", "ref"].includes(model.things[id].shape))) || id === f.place) continue; // render3: a token or pointer may sit at a cell (`i at a.2`)
        const cur = r.st.things[id];
        if (cur.at === f.place) continue;
        liftedMove(r, id, line); moveToken(r, id, line);
        // an item that sits at a thing has left the queue, stack or list it was in (`pop q to net`)
        const leaves = cur.in !== null && ["queue", "stack", "list", "array"].includes(model.things[cur.in]?.layout ?? "") && cur.in !== model.things[id]!.parent;
        setThing(r, id, leaves ? { at: f.place, in: model.things[id]!.parent } : { at: f.place });
      }
      return;
    }
    case "in": {
      const place = model.things[f.place] ? f.place : null;
      if (!place) return;
      if (!model.things[place].container) {
        r.problems.push({ line, msg: `${f.ids.join(",")} in ${place}: ${place} is not a container, so nothing can go into it; give it a layout flag (such as [array] or [grid]) or indent things under it` });
        return;
      }
      for (const id of known(f.ids)) {
        if (id === place) { r.problems.push({ line, msg: `${id} cannot go into itself` }); continue; }
        if (within(parentOf(r), place, id)) { r.problems.push({ line, msg: `${id} in ${place}: ${place} is inside ${id}, so ${id} cannot go into it` }); continue; }
        const cur: ThingState = r.st.things[id];
        const side = f.side ?? (cur.in === place ? cur.side : null);
        const after = f.after ?? (cur.in === place ? cur.after ?? null : null);
        if (cur.in === place && cur.at === null && cur.side === side && (cur.after ?? null) === after) continue;
        liftedMove(r, id, line); moveToken(r, id, line); pointInto(r, `${id} in`, place, line);
        setThing(r, id, { in: place, at: null, side, after });
      }
      return;
    }
    case "is": for (const id of known(f.ids)) setThing(r, id, { is: f.words }); return;
    case "text": if (model.things[f.id]) setThing(r, f.id, { text: [...f.lines] }); return;
    case "tone": for (const id of known(f.ids)) setThing(r, id, { tone: f.tone === "off" ? null : f.tone }); return;
    case "dim": for (const id of known(f.ids)) setThing(r, id, { dim: f.on }); return;
    case "values": {
      const id = f.id; // a part (`a.2 = 5`) has no values of its own
      if (!model.things[id]) return;
      const k = f.series ?? 0;
      if (k === 0) { setThing(r, id, { values: [...f.values] }); return; }
      const ser: (string[] | null)[] = [...(r.st.things[id].series ?? [])];
      while (ser.length < k) ser.push(null);
      ser[k] = [...f.values];
      setThing(r, id, { series: ser });
      return;
    }
    case "clear": for (const id of Object.keys(r.drawn)) if (!model.relations[id]?.setup) r.drawn[id] = false; return;
    case "rel": {
      const rel = model.relations[f.rel];
      if (!rel) return;
      if (f.style !== "lost") r.drawn[rel.id] = true;
      if (f.style !== "stream" && f.words !== null) pointInto(r, `a send to`, rel.to, line);
      return;
    }
    case "light": for (const id of known(f.ids)) pointInto(r, "light", id, line); return;
    case "say": if (model.things[f.id]) pointInto(r, "say", f.id, line); return;
    case "split": {
      const src = r.st.things[f.id];
      if (!src) return;
      if (f.into.length < 2 || f.into.length > 8) r.problems.push({ line, msg: `split ${f.id} into ${f.into.length}: a split makes 2 to 8 pieces (more cannot be read on the stage)` });
      if (model.things[f.id]?.shape === "ref") r.problems.push({ line, msg: `split ${f.id}: ${f.id} is a pointer; only a token splits` });
      for (const p of f.into) if (r.st.things[p]) { r.own[p] = true; setThing(r, p, { at: src.at, in: src.in, side: src.side }); }
      r.own[f.id] = false;
      return;
    }
    case "merge": {
      const ids = known(f.ids);
      if (!ids.length) return;
      const where = (id: Id) => r.st.things[id].at ?? r.st.things[id].in ?? "";
      const odd = ids.find((id) => where(id) !== where(ids[0]));
      if (odd) r.problems.push({ line, msg: `merge ${ids.join(", ")}: they are not all in one place; move ${odd} to ${where(ids[0]) || "where the others are"} first, in an earlier step` });
      const first = r.st.things[ids[0]];
      if (r.st.things[f.into]) { r.own[f.into] = true; setThing(r, f.into, { at: first.at, in: first.in, side: first.side }); }
      for (const id of ids) if (id !== f.into) r.own[id] = false;
      return;
    }
    case "drop": {
      for (const id of known(f.ids)) {
        if (!isToken(model, id)) { r.problems.push({ line, msg: `drop works on a token, and ${id} is not one; use hide ${id}` }); continue; }
        moveToken(r, id, line);
        if (f.at && model.things[f.at]) { pointInto(r, "drop at", f.at, line); setThing(r, id, { at: f.at }); }
        r.own[id] = false;
      }
      return;
    }
    case "focus": r.st.focus = f.target; return;
    case "zoom": zoomFact(r, f); return;
    case "lift": liftFact(r, f); return;
    case "putback": putBackFact(r, f); return;
    case "enter": case "leave": return; // eng-scenes: the story's path is read by core/scenes.ts (states() sets StepState.scene)
    case "layers": r.st.layersApart = f.apart; return;
    case "camera": r.st.camera = f; return;
    case "layout": if (isKeysSet(f)) setKeysFact(r, f.arg, line); return;
    case "note": case "foot": case "then": case "pace": return;
  }
}

function zoomFact(r: Run, f: Extract<Fact, { k: "zoom" }>) {
  const { model } = r;
  const line = f.src.line;
  const up = parentOf(r);
  const zs = r.st.zoom.map((z) => [...z]);
  const top = () => zs[zs.length - 1];
  if (f.into && f.into.length) {
    const ids = expand(model, f.into);
    for (const id of ids) {
      const t = model.things[id];
      if (!t) return; // check names it
      if (!t.container) { r.problems.push({ line, msg: `${id} is a ${t.shape}, and a ${t.shape} has no inside to zoom into; give it one: put its parts in it (indent them under ${id}) and mark it [closed]` }); return; }
      if (!holdsAny(r, id) && !holdsValues(model, id)) { r.problems.push({ line, msg: `${id} holds nothing: there is no inside to show` }); return; }
    }
    for (const a of ids) for (const b of ids) if (a !== b && within(up, a, b)) { r.problems.push({ line, msg: `zoom into ${ids.join(" ")}: ${a} is inside ${b}; zoom into ${b} first, then into ${a} in a later step (zooms nest)` }); return; }
    if (top() && ids.length === top().length && ids.every((id) => top().includes(id))) { r.problems.push({ line, msg: `zoom into ${ids.join(" ")}: the story is already zoomed into ${ids.length > 1 ? "them" : "it"}` }); return; }
    // a sideways move: close the levels that do not hold every new thing, then open the new one
    while (top() && !ids.every((id) => top().some((z) => id !== z && within(up, id, z)))) putBackInside(r, zs.pop()!);
    zs.push([...ids]);
  } else {
    if (!zs.length) { r.problems.push({ line, msg: `zoom out: nothing is zoomed into; write zoom into <id> in an earlier step` }); return; }
    for (let n = f.all ? zs.length : 1; n > 0; n--) putBackInside(r, zs.pop()!);
  }
  r.st.zoom = zs;
  const open = new Set(zs.flat());
  for (const id of model.order) { const o = open.has(id); if (r.st.things[id].open !== o) setThing(r, id, { open: o }); }
}

function liftFact(r: Run, f: Extract<Fact, { k: "lift" | "putback" }>) {
  const { model } = r;
  const line = f.src.line;
  const up = parentOf(r);
  if (model.view !== "3d-only") { r.problems.push({ line, msg: "lift is a 3D-only word: a thing rising out of its box shows only in depth. Write ```animation 3d only on the fence (the scene then has no flat form), or use light" }); return; }
  const ids = expand(model, f.ids).filter((id) => model.things[id]);
  const now = model.order.filter((t) => r.st.things[t].lifted);
  for (const id of ids) {
    const t = model.things[id];
    if (t.shape === "token" || t.shape === "ref") { r.problems.push({ line, msg: `lift raises a thing out of its box; ${id} is a ${t.shape === "ref" ? "pointer" : "token"}, which rides on what it sits at or in: lift that instead` }); return; }
    if (!up(id)) { r.problems.push({ line, msg: `lift raises a thing out of the box it is in; ${id} stands on the stage, in no box (put it in a container, or lift what it holds)` }); return; }
    if (now.includes(id)) { r.problems.push({ line, msg: `${id} is already lifted; put back ${id} first` }); return; }
    const by = hiddenBy(r, id);
    if (by) { r.problems.push({ line, msg: `lift ${id}: it is inside ${by}, which is closed; zoom into ${by} in this step or an earlier one` }); return; }
    const held = now.find((x) => x !== id && within(up, x, id));
    if (held) { r.problems.push({ line, msg: `lift ${id}: it holds ${held}, which is lifted; put back ${held} first, or lift ${id} before ${held} (lifts nest: the outer one rises first)` }); return; }
  }
  for (const a of ids) for (const b of ids) if (a !== b && within(up, a, b)) { r.problems.push({ line, msg: `lift ${ids.join(" ")}: ${a} is inside ${b}; lift ${b} alone (what it holds rises with it), and lift ${a} out of it in a later step if it should rise again` }); return; }
  for (const id of ids) setThing(r, id, { lifted: true });
}

function putBackFact(r: Run, f: Extract<Fact, { k: "lift" | "putback" }>) {
  const { model } = r;
  const line = f.src.line;
  if (model.view !== "3d-only") { r.problems.push({ line, msg: "put back is a 3D-only word: a thing rising out of its box shows only in depth. Write ```animation 3d only on the fence (the scene then has no flat form), or use light" }); return; }
  const now = model.order.filter((t) => r.st.things[t].lifted);
  if (!now.length) { r.problems.push({ line, msg: `put back: nothing is lifted; write lift <id> in an earlier step` }); return; }
  const which = f.ids.length ? expand(model, f.ids) : now;
  for (const id of which) if (model.things[id] && !now.includes(id)) { r.problems.push({ line, msg: `put back ${id}: ${id} is not lifted (lifted now: ${now.join(", ")})` }); return; }
  putBackInside(r, which.filter((id) => model.things[id]));
}

/** effective visibility: shown as written, inside a shown container, and at a shown thing */
function settle(r: Run) {
  const { model, st } = r;
  const memo = new Map<Id, boolean>();
  const vis = (id: Id, depth = 0): boolean => {
    const hit = memo.get(id); if (hit !== undefined) return hit;
    if (depth > 256) return false;
    const t = st.things[id];
    let v = !!r.own[id];
    if (v && t.in && st.things[t.in]) v = vis(t.in, depth + 1);
    if (v && t.at && st.things[t.at]) v = vis(t.at, depth + 1);
    memo.set(id, v);
    return v;
  };
  for (const id of model.order) { const v = vis(id); if (st.things[id].visible !== v) st.things[id] = { ...st.things[id], visible: v }; }
  const rels: StepState["relations"] = {};
  for (const rel of Object.values(model.relations)) rels[rel.id] = { visible: !!r.drawn[rel.id] && !!st.things[rel.from]?.visible && !!st.things[rel.to]?.visible };
  st.relations = rels;
}

/** eng-migrate2: the core's words a head block takes back when the ids are its items, and the layouts that hold such blocks */
const BLOCK_CORE = new Set(["show", "hide", "light"]);
const HEAD_BLOCKS = new Set(["timeline", "grid", "sheet", "wrap", "track"]);

function runLayouts(r: Run, facts: Fact[], prev: StepState | null) {
  const { model } = r;
  const mine = facts.filter((f): f is LayoutFact => f.k === "layout" && !isKeysSet(f));
  const byName = new Map<string, LayoutFact[]>();
  const used = usedLayouts(model);
  for (const f of mine) {
    // eng-migrate2: a word two layouts own goes to the one this scene uses (a phase strip's `at`, a worksheet's `mark`)
    const p = Object.values(LAYOUT).find((x) => used.has(x.name) && x.words?.step?.includes(f.word)) ?? layoutForWord(f.word, "step");
    // eng-migrate2: `show`, `hide`, `light` on names a head block gives its items (a matrix cell `c.sb`, a nest's box, a bin): the
    // parser hands them on as layout words because those names are not things; the block reads them (its parts' facts, or the
    // stage it hosts), so they are its words, not a refusal
    if (!p && BLOCK_CORE.has(f.word) && [...used].some((l) => HEAD_BLOCKS.has(l))) continue;
    // a lowered block (format 10/11) may carry words whose layout is not ported yet: a warning, not a refusal
    if (!p) { r.problems.push({ line: f.src.line, msg: (model.origin === "format12" ? goneMessage(f.word) : null) ?? `"${f.word}" is a word no layout owns in a step`, ...(model.origin !== "format12" ? { warn: true } : {}) }); continue; }
    // format 12: a word of a layout this scene does not use is refused (with its new spelling when it is a gone word), never dropped
    if (model.origin === "format12" && !used.has(p.name)) {
      r.problems.push({ line: f.src.line, msg: goneMessage(f.word) ?? `"${f.word}" is a word of the ${p.name} layout, and this scene does not use it (it uses ${[...used].join(", ")}); write "layout: ${p.name}" or a thing with [${p.name}] if you mean it` });
      continue;
    }
    (byName.get(p.name) ?? byName.set(p.name, []).get(p.name)!).push(f);
  }
  const layout: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev?.layout ?? {})) layout[k] = v;
  for (const p of Object.values(LAYOUT)) {
    if (!p.step || (!used.has(p.name) && !byName.has(p.name))) continue;
    try {
      layout[p.name] = p.step(model, prev?.layout[p.name], byName.get(p.name) ?? [], (x) => r.problems.push(x));
    } catch (e) {
      r.problems.push({ line: (byName.get(p.name)?.[0]?.src.line) ?? 0, msg: `layout ${p.name}: ${(e as Error).message}` });
    }
  }
  r.st.layout = layout;
}

/** what is true at each step, 0 (the setup) to n */
export function states(model: Model): StepState[] {
  const hit = CACHE.get(model); if (hit) return hit;
  const hidden = startsHidden(model);
  const things: Record<Id, ThingState> = {};
  const own: Record<Id, boolean> = {};
  for (const id of model.order) { if (!model.things[id]) continue; things[id] = initialThing(model, id); own[id] = !hidden.has(id); }
  const drawn: Record<Id, boolean> = {};
  for (const rel of Object.values(model.relations)) drawn[rel.id] = rel.setup;
  const st: StepState = { step: 0, things, relations: {}, focus: "all", zoom: [], layersApart: false, scene: null, camera: null, layout: {} };
  const r: Run = { model, st, own, drawn, problems: [], moved: new Map() };
  const out: StepState[] = [];
  const snapshot = (): StepState => ({ ...r.st, things: { ...r.st.things }, relations: { ...r.st.relations }, zoom: r.st.zoom.map((z) => [...z]), layout: { ...r.st.layout } });
  const run = (facts: Fact[], prev: StepState | null) => {
    r.moved = new Map();
    for (const f of facts) applyFact(r, f);
    runLayouts(r, facts, prev);
    settle(r);
    const s = snapshot();
    out.push(s);
    return s;
  };
  const sp = hasScenes(model) ? scenePath(model) : null; // eng-scenes
  let prev = run(model.setup, null);
  model.steps.forEach((step, i) => {
    r.st = { ...snapshot(), step: i + 1 };
    r.own = { ...r.own }; r.drawn = { ...r.drawn };
    prev = run(sp ? factsIn(model, sp, "", i + 1) : step.facts, prev); // eng-scenes: a step of another scene leaves the overview as it is
  });
  if (sp) withScenes(model, out, r.problems); // eng-scenes
  CACHE.set(model, out);
  REPLAY.set(model, r.problems);
  return out;
}

// ---------------------------------------------------------------- eng-scenes: a scene inside a scene (SPEC 6.12)
/** each step's scene and every scene's own state (replayed on its own: frozen while the story is elsewhere) */
function withScenes(model: Model, out: StepState[], problems: Problem[]) {
  const sp = scenePath(model);
  const inner: Record<Id, StepState[]> = {};
  for (const id of Object.keys(model.scenes)) inner[id] = states(sceneModel(model, id));
  out.forEach((s, k) => {
    s.scene = sceneAt(sp, k);
    s.inner = Object.fromEntries(Object.keys(inner).map((id) => [id, inner[id][k]]));
  });
  problems.push(...sp.problems, ...sceneProblems(model, out));
}

/** the graph form of `set`: `set id k=v ...`. The wrap form `set box: a => b` (a layout's word, the id ends in a colon) is not it. */
export function isKeysSet(f: LayoutFact): boolean {
  return f.word === "set" && !/^\S+:(\s|$)/.test(f.arg.trim());
}

/** `set id k=v k2=v2` (a layout fact word "set"): the step changes those keys of the thing; they last until set again */
function setKeysFact(r: Run, arg: string, line: number) {
  const m = /^(\S+)\s+(.*)$/.exec(arg.trim()); if (!m) return;
  const id = m[1]!; const st = r.st.things[id];
  if (!st) { r.problems.push({ line, msg: `set ${id}: there is no thing named ${id}` }); return; }
  const keys = { ...(st.keys ?? {}) };
  for (const kv of m[2]!.matchAll(/([\w-]+)=("[^"]*"|\S+)/g)) keys[kv[1]!] = kv[2]!.replace(/^"|"$/g, "");
  setThing(r, id, { keys });
}
