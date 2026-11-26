// Test helpers of lane sheet: a scene of the fixtures read by the real front end (parse lane's lowerStage, through the
// pipeline's readModel), its states from the core lane, and the old stage's own plan of the same scene to match against.
import { join } from "node:path";
import { compileStage, layoutStage } from "../../../src/core/stage";
import { readModel } from "../../../src/engine/pipeline";
import { states } from "../../../src/engine/core/states";
import type { LayoutName, Model } from "../../../src/engine/types";
import { fencesOf, type Fence } from "../parse/fixtures";

export const FIXTURES = join(import.meta.dir, "../../../fixtures/stage");
/** every composed scene of a fixture file, in order (the scenes the one engine reads as format 11) */
export const scenes = (file: string): Fence[] => fencesOf(join(FIXTURES, file), undefined, file);
export const modelOf = (f: Fence): Model => readModel(f.src);
export const statesOf = states;
/** the old stage's plan of the scene at a width, from the source the front end kept */
export function oldPlan(m: Model, f: Fence, width: number) {
  const s = JSON.parse(m.fence["stage-src"]) as { head: string; steps: { title: string; raw: string; line: number }[]; base: number; info: Record<string, string> };
  const c = compileStage(s.head, s.steps, s.base, s.info, f.src.roles);
  return { errors: c.errors, plan: layoutStage(c.model, width) };
}
/** the layout of this lane that a scene's head words ask for first */
export const mineOf = (m: Model): LayoutName => (["sheet", "wrap", "track"] as const).find((l) => m.layoutWords[l]?.length) ?? "track";
