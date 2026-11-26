// The timeline layout through the engine's own glue (core states and motions, pipeline planAt) on the parse lane's models.
// lowerStage names a time-only scene's layout "lanes"; here the layout is set to "timeline" as the integrator will.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { diff, still } from "../../../src/engine/core/diff";
import { states } from "../../../src/engine/core/states";
import { lowerStage } from "../../../src/engine/parse/lower-stage";
import { planAt } from "../../../src/engine/pipeline";
import { loadFence } from "./lower";

const FX = join(import.meta.dir, "../../../fixtures/stage");
function build(file: string) {
  const f = loadFence(join(FX, file));
  const body = [f.head, ...f.steps.map((s) => `@step ${s.title}\n${s.raw}`)].join("\n");
  const model = lowerStage({ body, line0: f.base, fence: {}, roles: f.roles, format12: false });
  model.layout = "timeline";
  const st = states(model), motions = st.map((s, k) => (k === 0 ? still(0) : diff(model, st[k - 1], s)));
  return { model, st, motions };
}

describe("timeline through the pipeline", () => {
  for (const w of [1280, 390]) test(`05 at ${w}`, () => {
    const { model, st, motions } = build("05-animation-time.dh.md");
    const plan = planAt(model, st, motions, w);
    expect(plan.w).toBe(w);
    expect(plan.h).toBeGreaterThan(100);
    const words = (k: number) => plan.frame(k).flatMap((p) => (p.k === "text" ? p.lines : []));
    expect(words(1)).toContain("27 s");
    expect(words(2)).toContain("build done");
    expect(words(1)).not.toContain("build done");
  });
  test("30: the caption marker's words are in the step caption once (the parse lane adds them; the layout adds none twice)", () => {
    const { model, st, motions } = build("30-test-arrivals-over-a-bottom-ruler.dh.md");
    expect(model.steps[0].caption).toContain("The parcel is released.");
    expect(planAt(model, st, motions, 1280).caption(1)).toEqual([]);
  });
});
