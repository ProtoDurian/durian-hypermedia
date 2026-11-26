// Lane core (Opus): two states -> the motion between them (DESIGN 2.1). Contract: ../types.ts Motion.
//
// - enter / exit: things that become visible / hidden.
// - move: a thing visible in both whose container (`in`), seat (`at`), side or place among its siblings (`after`) changed.
// - a light of a chart's part range is one id per category (`returns.Jul`, `returns.Aug` ...).
// - restyle: a thing visible in both whose chip (`is`), lines (`text`), tone, dim, lift or open changed.
// - values: a thing whose cells changed (a chart: cell j is category j, so map[j] = j while it existed); `map[j]` is the old index of new cell j, so an equal value slides to its new
//   cell (equal values keep their order); `null` is a new cell. With `from` (values that fly in from other things)
//   every cell is new to this thing: the renderer flies them in from the `from` things.
// - relEnter / relExit: relations that start / stop showing.
// - events: what step b says that lasts one step (sends, speech, light, split/merge/drop, note/foot), each with its
//   beat (the number of `then` lines before it).
// - touched: everything the step changes, lights, makes speak or sends along, in declaration order (the auto camera
//   frames these).
// - beats: `then` lines + 1; pace: the step's `pace` line, else the fence's `pace=`, else normal.
import type { Event, Fact, Id, Model, Motion, StepState, ThingState } from "../types";
import { baseOf, expand, expandParts } from "./ids";
import { hasScenes, sceneModel, scenePath } from "./scenes"; // eng-scenes

export const still = (step: number): Motion => ({ step, enter: [], exit: [], move: [], restyle: [], values: [], relEnter: [], relExit: [], events: [], touched: [], beats: 1, pace: "normal" });

const STYLE_FIELDS: (keyof ThingState)[] = ["is", "text", "tone", "dim", "lifted", "open"];
const same = (x: unknown, y: unknown) => (Array.isArray(x) || Array.isArray(y) ? JSON.stringify(x) === JSON.stringify(y) : x === y);

/** map[j] = the index in `before` of new cell j (equal values matched in order), null for a new value */
export function valueMap(before: string[], after: string[]): (number | null)[] {
  const free = new Map<string, number[]>();
  before.forEach((v, i) => { (free.get(v) ?? free.set(v, []).get(v)!).push(i); });
  return after.map((v) => { const q = free.get(v); return q && q.length ? q.shift()! : null; });
}

/** the facts of step k (k = 0: the setup) */
const factsOf = (model: Model, k: number): Fact[] => (k === 0 ? model.setup : model.steps[k - 1]?.facts ?? []);

/** render3: a send whose words are a token the same step puts in or at its target (`send "seg 1" app -> buf as s1`: `app -> buf:
 *  seg 1`, `show s1`, `s1 in buf`) carries no words of its own: the token is the words, so they are not drawn twice (on the line
 *  and in the buffer; the page review, format 95) */
function becomesItem(model: Model, facts: Fact[], words: string | null, to: Id): boolean {
  if (!words) return false;
  return facts.some((g) => (g.k === "in" || g.k === "at") && g.place === to && g.ids.some((id) => { const t = model.things[id]; return !!t && (t.shape === "token" || t.shape === "ref") && t.title === words; }));
}

/** the events a step's facts make (things that last one step), each with its beat */
export function eventsOf(model: Model, facts: Fact[]): { events: Event[]; beats: number } {
  const events: Event[] = [];
  let beat = 0;
  for (const f of facts) {
    switch (f.k) {
      case "then": beat++; break;
      case "rel": {
        const rel = model.relations[f.rel];
        if (!rel) break;
        if (f.style === "lost" || f.style === "stream" || f.words !== null)
          events.push({ k: "send", rel: rel.id, from: rel.from, to: rel.to, words: becomesItem(model, facts, f.words, rel.to) ? null : f.words, style: f.style === "lost" ? "lost" : f.style === "stream" ? "stream" : "token", role: f.role ?? rel.role, beat });
        break;
      }
      case "say": events.push({ k: "say", id: f.id, words: f.words, ...(f.side ? { side: f.side } : {}), ...(f.role !== undefined ? { role: f.role } : {}), beat }); break;
      case "light": events.push({ k: "light", ids: expandParts(model, expand(model, f.ids)), ...(f.note ? { note: f.note } : {}), beat }); break;
      // a split: ids = [the token, ...its pieces]; a merge: ids = the pieces, to = what they make; a drop: to = where it is lost
      case "split": events.push({ k: "split", ids: [f.id, ...f.into], beat }); break;
      case "merge": events.push({ k: "merge", ids: expand(model, f.ids), to: f.into, beat }); break;
      case "drop": events.push({ k: "drop", ids: expand(model, f.ids), ...(f.at ? { to: f.at } : {}), beat }); break;
      case "note": case "foot": events.push({ k: f.k, words: f.words, ...(f.tone !== undefined ? { tone: f.tone } : {}) }); break;
      default: break;
    }
  }
  return { events, beats: beat + 1 };
}

/** the motion from state a to state b (b is step a+1 in the story; a jump reads b's own step facts) */
export function diff(model: Model, a: StepState, b: StepState): Motion {
  if (a.scene !== b.scene || b.scene) return sceneDiff(model, a, b); // eng-scenes
  const m = still(b.step);
  const touched = new Set<Id>();
  const touch = (id: Id | null | undefined) => { if (id) { const t = baseOf(model, id); if (model.things[t]) touched.add(t); } };
  for (const id of model.order) {
    const x = a.things[id], y = b.things[id];
    if (!x || !y) continue;
    if (!x.visible && y.visible) { m.enter.push(id); touch(id); continue; }
    if (x.visible && !y.visible) { m.exit.push(id); touch(id); continue; }
    if (!y.visible) continue;
    if (x.in !== y.in || x.at !== y.at || x.side !== y.side || (x.after ?? null) !== (y.after ?? null)) {
      m.move.push({ id, from: x.at ?? x.in, to: y.at ?? y.in });
      touch(id);
    }
    const fields = STYLE_FIELDS.filter((f) => !same(x[f], y[f]));
    if (fields.length) { m.restyle.push({ id, fields }); touch(id); }
  }
  const facts = factsOf(model, b.step);
  for (const id of model.order) {
    const x = a.things[id], y = b.things[id];
    if (!x || !y || !y.visible) continue;
    const before = x.values ?? [], after = y.values ?? [];
    if (same(before, after) && same(x.series ?? null, y.series ?? null)) continue;
    let from: Id[] = [];
    for (const f of facts) if (f.k === "values" && baseOf(model, f.id) === id) from = expand(model, f.from);
    // a chart's cells are its categories: cell j stays cell j (its bar glides); a data structure's equal values slide
    const map = from.length ? after.map(() => null) : model.things[id].chart ? after.map((_, j) => (j < before.length ? j : null)) : valueMap(before, after);
    m.values.push({ id, before: [...before], after: [...after], map, from });
    touch(id); from.forEach(touch);
  }
  for (const rel of Object.values(model.relations)) {
    const x = !!a.relations[rel.id]?.visible, y = !!b.relations[rel.id]?.visible;
    if (!x && y) { m.relEnter.push(rel.id); touch(rel.from); touch(rel.to); }
    if (x && !y) { m.relExit.push(rel.id); if (b.things[rel.from]?.visible) touch(rel.from); if (b.things[rel.to]?.visible) touch(rel.to); }
  }
  const { events, beats } = eventsOf(model, facts);
  m.events = events;
  m.beats = beats;
  for (const e of events) {
    if (e.k === "send") { touch(e.from); touch(e.to); }
    else if (e.k === "say") touch(e.id);
    else if (e.k === "light") e.ids.forEach(touch);
    else if (e.k === "split" || e.k === "merge" || e.k === "drop") { e.ids.forEach(touch); touch(e.to); }
  }
  // what a zoom opens and what a lift raises is in `restyle` (open, lifted); a focused region frames its things in the camera
  m.touched = model.order.filter((id) => touched.has(id));
  let pace: Motion["pace"] = model.fence.pace === "slow" || model.fence.pace === "fast" ? model.fence.pace : "normal";
  for (const f of facts) if (f.k === "pace") pace = f.pace;
  m.pace = pace;
  return m;
}

// ---------------------------------------------------------------- eng-scenes: a scene inside a scene (SPEC 6.12)
// - a step inside a scene diffs that scene's own states (in the scene's model) and says which scene (Motion.scene);
// - a step that enters or leaves changes no thing: Motion.scene is the scene entered or left. Leaving touches the thing
//   the scene was entered from, with the tokens and pointers at it, so the camera frames "where we left it".
function sceneDiff(model: Model, a: StepState, b: StepState): Motion {
  if (a.scene === b.scene) {
    const id = b.scene!;
    const x = a.inner?.[id], y = b.inner?.[id];
    if (!x || !y || !model.scenes[id]) return { ...still(b.step), scene: id };
    return { ...diff(sceneModel(model, id), x, y), step: b.step, scene: id };
  }
  const m: Motion = { ...still(b.step) };
  const sp = hasScenes(model) ? scenePath(model) : null;
  const left = sp?.leave[b.step] ?? null, entered = sp?.enter[b.step] ?? null;
  m.scene = entered ?? left ?? b.scene ?? a.scene;
  let pace: Motion["pace"] = model.fence.pace === "slow" || model.fence.pace === "fast" ? model.fence.pace : "normal";
  for (const f of factsOf(model, b.step)) if (f.k === "pace") pace = f.pace;
  m.pace = pace;
  const via = sp?.via[b.step];
  if (left && via) {
    const back = b.scene ? sceneModel(model, b.scene) : model;
    const st = b.scene ? b.inner?.[b.scene] : b;
    if (st?.things[via]) m.touched = back.order.filter((id) => id === via || (st.things[id]?.visible && st.things[id]?.at === via));
  }
  return m;
}
