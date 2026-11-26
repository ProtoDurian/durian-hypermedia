// Lane core: doccheck on states (refusals and warnings with their line). SPEC 6.7, 6.11; the wording follows
// src/core/scene.ts, src/core/story.ts and src/core/depth.ts.
//
// Two sources: the refusals the replay finds with the running state (core/states.ts: zoom, lift, put back, a token
// moved twice, a lifted thing moved, pointing into a closed inside, `in` a thing that is not a container, split and
// merge rules, layout words), and the checks here that read the facts and the finished states (unknown ids with the
// nearest one, two hops in one step, `then`, values on a thing that holds none, a line between a container and what
// it holds, `focus` on an unknown region, a step that points at a hidden thing, long token labels).
import type { Fact, Id, Model, Problem, StepState } from "../types";
import { expand, nearest, partOf, within } from "./ids";
import { holdsValues, replayProblems, states as stepStates } from "./states";
import { hasScenes, sceneModel, scenePath } from "./scenes"; // eng-scenes
import { LIMITS } from "../../safety";

const MAX_BEATS = 6;
const TOKEN_LABEL = 18;

export function check(model: Model, states: StepState[]): Problem[] {
  // the caps of src/safety.ts, as the old engine refuses them (src/document.ts)
  const n = model.steps.length;
  if (n > LIMITS.maxAnimSteps) return [{ line: model.steps[LIMITS.maxAnimSteps].src.line, msg: `${n} steps; the limit is ${LIMITS.maxAnimSteps}` }];
  const real = model.order.filter((id) => !model.things[id].flags.includes("part")); // eng-blocks2: parts (layouts/parts.ts) are not things an author wrote
  if (real.length > LIMITS.maxAnimEntities) return [{ line: model.things[real[LIMITS.maxAnimEntities]].src.line, msg: `${real.length} things on the stage; the limit is ${LIMITS.maxAnimEntities}` }];
  const out: Problem[] = [...replayProblems(model)];
  // ids of a scene inside the scene count too (a step after `enter` names them)
  const sceneIds = Object.values(model.scenes).flatMap((s) => s.order);
  const thingIds = [...model.order, ...sceneIds];
  const relIds = Object.keys(model.relations);

  const unknown = (id: Id, line: number, what = "thing") => {
    const near = nearest(id, what === "line" ? relIds : thingIds);
    out.push({ line, msg: `no ${what} "${id}" on the stage${near.length ? ` (did you mean ${near.join(", ")}?)` : ""}` });
  };
  /** every id must name a thing (or, where allowed, a relation or a chart's part) */
  const need = (ids: Id[], line: number, o: { rel?: boolean; part?: boolean } = {}) => {
    for (const id of expand(model, ids)) {
      if (model.things[id] || sceneIds.includes(id)) continue;
      if (o.rel && model.relations[id]) continue;
      const base = partOf(model, id);
      if (base) {
        if (!model.things[base].chart && !model.things[base].container && !holdsValues(model, base)) out.push({ line, msg: `${id}: ${base} has no parts (only a chart's categories or a data structure's cells can be named with a dot)` });
        continue;
      }
      unknown(id, line);
    }
  };

  // relations: both ends exist; never a container and what it holds
  for (const rel of Object.values(model.relations)) {
    const line = rel.src.line;
    // an end may be a part (a hash table's bucket `h.2`) or a thing of a scene inside the scene
    const end = (id: Id) => !!model.things[id] || sceneIds.includes(id) || !!partOf(model, id);
    if (!end(rel.from)) unknown(rel.from, line);
    if (!end(rel.to)) unknown(rel.to, line);
    if (!model.things[rel.from] || !model.things[rel.to]) continue;
    const up = (id: Id) => model.things[id]?.parent ?? null;
    if (within(up, rel.to, rel.from) || within(up, rel.from, rel.to)) {
      const [outer, inner] = within(up, rel.to, rel.from) ? [rel.from, rel.to] : [rel.to, rel.from];
      out.push({ line, msg: `${rel.from} -> ${rel.to}: ${inner} is inside ${outer}; a line joins two things side by side, not a container and what it holds` });
    }
  }

  // tokens: the stage cuts a long chip with "…"
  for (const id of model.order) {
    const t = model.things[id];
    if (t.shape === "token" && t.title.length > TOKEN_LABEL) out.push({ line: t.src.line, warn: true, msg: `${id}: a token's label over ${TOKEN_LABEL} characters ("${t.title}") is cut with "…" on the stage; put the detail in the caption or a note` });
  }

  const regionIds = model.regions.map((r) => r.id);
  const checkFacts = (facts: Fact[], k: number) => {
    for (const f of facts) {
      const line = f.src.line;
      switch (f.k) {
        case "show": case "hide": need(f.ids, line, { rel: true }); break;
        case "at": need(f.ids, line); need([f.place], line); break;
        case "in": need(f.ids, line); need([f.place], line); if (f.after) need([f.after], line); break;
        case "is": case "tone": case "dim": case "lift": case "putback": need(f.ids, line); break;
        case "text": need([f.id], line); break;
        case "light": need(f.ids, line, { part: true }); break;
        case "say": need([f.id], line); break;
        case "values": {
          need(f.from, line);
          const base = partOf(model, f.id) ?? f.id;
          if (!model.things[base]) { if (!sceneIds.includes(base)) unknown(f.id, line); break; }
          if (!holdsValues(model, base)) out.push({ line, msg: `${f.id} = ${f.values.join(" ")}: ${base} holds no values; values go on a data structure ([array], [list], [stack], [queue], [map]) or a chart ([chart bar])` });
          break;
        }
        case "rel": if (!model.relations[f.rel]) unknown(f.rel, line, "line"); break;
        case "split": need([f.id, ...f.into], line); break;
        case "merge": need([...f.ids, f.into], line); break;
        case "drop": need(f.ids, line); if (f.at) need([f.at], line); break;
        case "focus":
          if (f.target === "all") break;
          if (!regionIds.length) out.push({ line, msg: `focus ${f.target}: this scene has no regions (## lines) to focus on` });
          else if (!regionIds.includes(f.target) && !model.regions.some((r) => r.title === f.target)) out.push({ line, msg: `focus ${f.target}: no region "${f.target}" (the regions are ${regionIds.join(", ")})` });
          break;
        case "zoom": if (f.into) need(f.into, line); break;
        case "enter":
          if (!model.scenes[f.scene]) out.push({ line, msg: `enter ${f.scene}: no scene "${f.scene}"${Object.keys(model.scenes).length ? ` (the scenes are ${Object.keys(model.scenes).join(", ")})` : ""}` });
          need([f.from], line);
          break;
        case "camera": if (f.ids !== "all") need(f.ids, line); break;
        default: break;
      }
    }
    if (k > 0) stepRules(model, facts, states[k], out);
  };
  checkFacts(model.setup, 0);
  // eng-scenes: a step of a scene is checked in that scene (below); a step that enters or leaves by core/scenes.ts
  const sp = hasScenes(model) ? scenePath(model) : null;
  model.steps.forEach((s, i) => checkFacts(sp && sp.owner[i + 1] !== "" ? [] : s.facts, i + 1));
  if (sp) for (const id of Object.keys(model.scenes)) { const m = sceneModel(model, id); out.push(...check(m, stepStates(m))); }

  // one message per line and words, in line order
  const seen = new Set<string>();
  return out.filter((p) => { const key = `${p.line}|${p.msg}`; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.line - b.line);
}

/** the rules of one step: one hop, `then`, pointing at hidden things */
function stepRules(model: Model, facts: Fact[], after: StepState | undefined, out: Problem[]) {
  // one hop per step (format version 7): a send that starts where another send of this step ends is a second hop
  // the composed stage (format 11) draws chains of connectors in one step; the rule is the graph engine's and format 12's
  // eng-migrate2: the rule counts per BEAT (DESIGN 2.2): `then` splits a step into beats, so a relay `c -> r`, `then`,
  // `r -> s` is one step in two beats (migrate writes it so); two hops in one beat are still refused
  const beatOf = new Map<Fact, number>(); { let b = 0; for (const f of facts) { if (f.k === "then") b++; beatOf.set(f, b); } }
  const sends = model.origin === "stage11" ? [] : facts.filter((f): f is Extract<Fact, { k: "rel" }> => f.k === "rel" && f.style !== "stream" && (f.words !== null || f.style === "lost") && !!model.relations[f.rel]);
  for (const b of sends) {
    const rb = model.relations[b.rel];
    const a = sends.find((x) => x !== b && beatOf.get(x) === beatOf.get(b) && model.relations[x.rel].to === rb.from);
    if (a) {
      const ra = model.relations[a.rel];
      out.push({ line: b.src.line, msg: `one hop per step: ${ra.from} -> ${ra.to} then ${rb.from} -> ${rb.to} in one step is two hops; move "${b.words || `${rb.from} -> ${rb.to}`}" to a step of its own, with its own caption` });
    }
  }
  // then (format version 9): a change before and after it; at most 6 beats
  const thens = facts.map((f, i) => (f.k === "then" ? i : -1)).filter((i) => i >= 0);
  const body = (i: number) => facts[i] && facts[i].k !== "then" && facts[i].k !== "pace";
  for (const i of thens) {
    const before = facts.slice(0, i).some((_, j) => body(j)), next = facts.slice(i + 1).some((_, j) => body(i + 1 + j));
    if (!before) out.push({ line: facts[i].src.line, msg: "then comes between two changes: a change must come before it in the step" });
    else if (!next) out.push({ line: facts[i].src.line, msg: "then comes between two changes: a change must come after it in the step" });
    else if (facts[i + 1]?.k === "then") out.push({ line: facts[i + 1].src.line, msg: "then twice in a row: a change must come between them" });
  }
  if (thens.length + 1 > MAX_BEATS) out.push({ line: facts[thens[MAX_BEATS - 1]].src.line, msg: `a step plays at most ${MAX_BEATS} beats; this one has ${thens.length + 1}: give the rest a step of its own` });
  // a step that points at a thing it does not show
  if (!after) return;
  const hidden = (id: Id) => { const base = partOf(model, id) ?? id; return !!after.things[base] && !after.things[base].visible ? base : null; };
  for (const f of facts) {
    const line = f.src.line;
    const ids: [string, Id][] =
      f.k === "light" ? expand(model, f.ids).map((id) => ["light", id]) :
      f.k === "say" ? [["say", f.id]] :
      f.k === "rel" && model.relations[f.rel] && f.style !== "lost" ? [[`${model.relations[f.rel].from} -> ${model.relations[f.rel].to}`, model.relations[f.rel].from], [`${model.relations[f.rel].from} -> ${model.relations[f.rel].to}`, model.relations[f.rel].to]] :
      [];
    for (const [what, id] of ids) {
      const h = hidden(id);
      if (h) out.push({ line, warn: true, msg: `${what}: ${h} is hidden in this step, so the reader cannot see it; show ${h} in this step or an earlier one` });
    }
  }
}
