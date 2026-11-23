// 0.7.0-rc.3, the rc.2 reviews' SHOULD items for the samples. (13) The swimlane matrix sample's chips show when the
// story makes them: the API's "202" when it answers (step 2), the stored "original" and "3 sizes" when the worker
// writes them (step 3). (5) The composed stage samples that check one edge case of the layout are titled "Test: ..."
// and the example index lists them after the stories, under "The composed stage: tests and edge cases".
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beginDocument } from "../../src/core/stage-budget";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";

const FIX = join(import.meta.dir, "../../fixtures/stage");
const ROLES = { client: 1, server: 2, store: 3, job: 4, cache: 5, ops: 6, plain: 0 };
function stage(file: string) {
  const text = readFileSync(join(FIX, file), "utf8"), a = text.indexOf("```animation\n") + 13, b = text.indexOf("\n```", a);
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  text.slice(a, b).split("\n").forEach((l, n) => { const m = l.match(/^@step (.*)$/); if (m) steps.push({ title: m[1], raw: "", line: n + 1 }); else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l; else head.push(l); });
  beginDocument(); return compileStage(head.join("\n"), steps, 1, {}, ROLES);
}
const shownAt = (it: any, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));

for (const w of [1000, 340]) test(`04: each chip shows from the step that makes it, its place kept from step 1 (${w})`, () => {
  const c = stage("04-animation-a-swimlane-matrix.dh.md"); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, w);
  for (const [label, from] of [["202", 2], ["original", 3], ["3 sizes", 3]] as const) {
    const bs = p.items.filter((i: any) => i.k === "box" && i.bar?.label === label); expect(bs.length).toBe(1);
    for (let k = 1; k <= 4; k++) expect([label, k, shownAt(bs[0], k)]).toEqual([label, k, k >= from]);
  }
});
test("04: the LLM view names the chips when they come in, not in the starting matrix", () => {
  const l = stageLlm(stage("04-animation-a-swimlane-matrix.dh.md")), start = l.slice(0, l.indexOf("Send"));
  for (const s of ["chip 202", "chip original", "chip 3 sizes"]) expect(start).not.toContain(s);
  expect(l).toMatch(/Now in the matrix: [^.]*202/); expect(l).toMatch(/Now in the matrix: [^.]*original[^.]*3 sizes/);
});
test("the 18 edge-case samples are 'Test:' fixtures; the stories stay 'Animation:'", () => {
  const files = readdirSync(FIX).filter((f) => /^\d\d-/.test(f));
  const tests = files.filter((f) => /^\d\d-test-/.test(f));
  expect(tests.length).toBe(18); expect(files.length).toBe(38);
  for (const f of tests) { const t = readFileSync(join(FIX, f), "utf8"); expect(t).toMatch(/^title: "Test: /m); expect(t).toMatch(/^## Test: /m); }
  for (const f of ["01-animation-a-composed-stage.dh.md", "05-animation-time.dh.md", "20-animation-boxes-inside-boxes.dh.md", "22-animation-a-bar-chart-in-a-scene.dh.md", "34-animation-bins.dh.md"]) expect(files).toContain(f);
  expect(readFileSync(join(FIX, "10-test-cells-exchange-a-copy.dh.md"), "utf8")).toMatch(/A section titled \*\*Test:\*\* checks one edge case of the layout/);
});
test("the example index lists the Test: stage fixtures after the stories, in their own group", () => {
  const src = readFileSync(join(import.meta.dir, "../../example/build.tsx"), "utf8");
  expect(src).toContain(`const STAGE_TESTS = "The composed stage: tests and edge cases";`);
  expect(src).toMatch(/dir === "stage" && \/\^\\d\\d-test-\/\.test\(f\) \? STAGE_TESTS : group/);
  expect(src).toMatch(/groups\.flatMap\(\(\[dir, g\]\) => \(dir === "stage" \? \[g, STAGE_TESTS\] : \[g\]\)\)/);
});
