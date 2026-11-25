// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { beginDocument } from "../../src/core/stage-budget";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import type { Item } from "../../src/core/stage-core";
beforeEach(() => beginDocument());
const roles = { server: 1 };
const head = "bars 3 server: load\n  labels: A, B, C";
const compile = (steps: string[]) => {
  const c = compileStage(head, steps.map((raw, i) => ({ title: "Step " + (i + 1), raw, line: 10 + i * 3 })), 1, {}, roles);
  expect(c.errors).toEqual([]); return c;
};
const below = () => compile(["values: 1.4 1 0.9\npeak: highest\nlimit 1.1: cap\ntone C bad", "values: 1 1.09 0.9\npeak: highest"]);
const fill = (items: Item[], name: string, step: number) => items.find((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.cls?.includes("stg-bar") && i.bar?.label === name && !!i.on?.includes(step))!.fill;
test("an authored peak below the cap stays highlighted beside an explicitly toned bar", () => {
  const c = below();
  for (const w of [1178, 356, 326]) {
    const p = layoutStage(c.model, w);
    expect(fill(p.items, "B", 2)).toBe("bad:line");
    expect(fill(p.items, "C", 2)).toBe("bad:line");
  }
});
test("the words describe a below-cap highlight as the peak", () => {
  expect(stageLlm(below())).toContain("Lit bars: B 1.09 (the peak), C 0.9 (marked bad).");
});
test("a giving bar at the cap has no warning when no peak was requested", () => {
  const c = compile(["values: 1.4 0.7 0.9\nlimit 1.2: cap", "values: 1.2 0.9 0.9\nmove 2 from A to B"]);
  const p = layoutStage(c.model, 1178), words = stageLlm(c);
  expect(fill(p.items, "A", 2)).toBe("role:server:line");
  expect(fill(p.items, "B", 2)).toBe("good:line");
  expect(words).toContain("Moves: A to B (2).");
  expect(words).toContain("Lit bars: B 0.9 (takes); at the limit 1.2, not lit: A 1.2.");
  expect(words).not.toContain("A 1.2 (gives)");
});
