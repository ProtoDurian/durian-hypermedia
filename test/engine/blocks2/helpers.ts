// Test helpers (lane blocks2): every animation fence of the stage fixtures, compiled through the one engine's front end.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadFence } from "../time/lower";
import { compile } from "../../../src/engine/pipeline";
import type { Compiled } from "../../../src/engine/types";

export const DIR = join(import.meta.dir, "../../../fixtures/stage");
export type Fx = { name: string; compiled: Compiled };
/** every ```animation fence of the stage fixtures whose scene is laid out by one of `layouts` */
export function fences(layouts: string[]): Fx[] {
  const out: Fx[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".dh.md")).sort()) {
    for (let nth = 0; nth < 40; nth++) {
      let fence; try { fence = loadFence(join(DIR, f), nth); } catch { break; }
      const body = [fence.head, ...fence.steps.map((s) => `@step ${s.title}\n${s.raw}`)].join("\n");
      let c: Compiled; try { c = compile({ body, line0: fence.base, fence: {}, roles: fence.roles, format12: false }); } catch { continue; }
      if (layouts.includes(c.model.layout)) out.push({ name: `${f.slice(0, 2)}${f.startsWith("example") ? "ex" : ""}#${nth}`, compiled: c });
    }
  }
  return out;
}
export const partIds = (c: Compiled) => c.model.order.filter((id) => c.model.things[id].keys.part);

import { planAt } from "../../../src/engine/pipeline";
import { states as stepStates } from "../../../src/engine/core/states";
import { diff, still } from "../../../src/engine/core/diff";
import type { Model } from "../../../src/engine/types";

/** a copy of the model without its parts: the old windows then decide what shows */
export function withoutParts(model: Model): Model {
  const drop = new Set(model.order.filter((id) => model.things[id].keys.part)); // the parts (not the grid that hosts panels)
  const things = Object.fromEntries(Object.entries(model.things).filter(([id]) => !drop.has(id)));
  const strip = (facts: Model["steps"][number]["facts"]) => facts.filter((f) => !("ids" in f && Array.isArray(f.ids) && f.ids.some((i: string) => drop.has(i))));
  return { ...model, things, order: model.order.filter((id) => !drop.has(id)), setup: strip(model.setup), steps: model.steps.map((s) => ({ ...s, facts: strip(s.facts) })) };
}
/** a plan of any model at a width (the pipeline's own glue) */
export function planOf(model: Model, width: number) {
  const states = stepStates(model);
  const motions = states.map((s, k) => (k === 0 ? still(0) : diff(model, states[k - 1], s)));
  return planAt(model, states, motions, width);
}
