// The timeline layout fed by the parse lane's own lowering of the stage fixtures (not the hand-built model of lower.ts):
// the layout words arrive as the parse lane hands them, and the blocks read them without a problem. (lowerStage names the
// stage layout "lanes" even for a time-only scene: who places a time head beside lanes is the integrator's, see the report.)
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { measure, wrap } from "../../../src/core/stage-core";
import { Timeline } from "../../../src/engine/layouts/time";
import { lowerStage } from "../../../src/engine/parse/lower-stage";
import type { LayoutCtx, Problem } from "../../../src/engine/types";
import { layoutScene, readScene } from "../../../src/engine/layouts/time/adapter";
import { loadFence, timeModel } from "./lower";

const DIR = join(import.meta.dir, "../../../fixtures/stage");
const NUMS = ["05", "06", "08", "09", "10", "11", "23", "25", "27", "28", "29", "30", "31", "32", "33", "35", "36", "37", "38"];

describe("timeline fed by lowerStage", () => {
  for (const f of readdirSync(DIR).filter((x) => NUMS.includes(x.slice(0, 2)) && x.endsWith(".dh.md"))) test(f.slice(0, 2), () => {
    const fence = loadFence(join(DIR, f));
    const body = [fence.head, ...fence.steps.map((s) => `@step ${s.title}\n${s.raw}`)].join("\n");
    const model = lowerStage({ body, line0: fence.base, fence: {}, roles: fence.roles, format12: false });
    expect(model.problems.filter((p) => !p.warn)).toEqual([]);
    const problems: Problem[] = [];
    const ctx: LayoutCtx = { width: 1280, phone: false, look: "stage", measure: (t, ft) => measure(t, ft), wrap: (t, w, ft, m) => wrap(t, w, ft, m), child: () => { throw new Error("none"); }, problem: (p) => problems.push(p) };
    const placed = Timeline.place({ model, states: [], container: null, members: [], regions: [] }, ctx);
    expect(problems).toEqual([]);
    expect(placed.decor(1).length).toBeGreaterThan(5);
    // the same words as the hand-built model: the same drawing (a line parse lost shows here)
    const mine = layoutScene(readScene(timeModel(fence)), 1280, false).items, theirs = layoutScene(readScene(model), 1280, false).items;
    expect(JSON.stringify(theirs)).toBe(JSON.stringify(mine));
  });
});
