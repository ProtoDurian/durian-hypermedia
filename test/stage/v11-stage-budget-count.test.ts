// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// The stage's budget keeps refusing after a marker's words join a step caption (every charge names a count: a
// charge with none made the work left NaN, so nothing on the page was refused after it).
import { afterEach, expect, test } from "bun:test";
import { compileStage } from "../../src/core/stage";
import { beginDocument, docBudget, newBudget, BudgetError } from "../../src/core/stage-budget";

afterEach(() => { beginDocument(); });

test("after a [caption] marker the work left is a number and an over-budget charge still refuses", () => {
  beginDocument(newBudget(100_000));
  const steps = [{ title: "One", raw: "keep at 2 [caption]: words in the caption", line: 5 }, { title: "Two", raw: "", line: 7 }];
  const c = compileStage("time: 0..4", steps, 1, {}, { job: 1 });
  expect(c.errors).toEqual([]);
  expect(c.model.steps[1].caption).toContain("words in the caption");
  const left = docBudget().left().work;
  expect(Number.isFinite(left)).toBe(true);
  expect(left).toBeLessThan(100_000);
  expect(() => docBudget().charge("more", left + 1)).toThrow(BudgetError);
});
