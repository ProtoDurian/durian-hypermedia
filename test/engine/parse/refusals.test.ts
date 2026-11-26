// Lane parse: every refusal names the line and the fix.
import { expect, test } from "bun:test";
import { parse12 } from "../../../src/engine/parse/parse12";

const read = (body: string, roles: Record<string, number> = { node: 1 }) => parse12({ body, line0: 10, fence: {}, roles, format12: true });
const msgs = (body: string, roles?: Record<string, number>) => read(body, roles).problems.filter((p) => !p.warn).map((p) => `${p.line}: ${p.msg}`);

test("a role the page does not declare names the page's roles and the nearest one", () => {
  const p = msgs("nod a: A");
  expect(p).toHaveLength(1); expect(p[0]).toMatch(/^10: "nod" is not a role of this page; did you mean "node"\?.*front matter/);
});
test("an unknown flag lists the flags and the nearest", () => { expect(msgs("node a [cirle]: A")[0]).toMatch(/^10: unknown flag "cirle"; did you mean "circle"\?. Flags: shapes/); });
test("a thing declared twice names the first line", () => { expect(msgs("node a: A\nnode a: B")[0]).toMatch(/^11: "a" is declared twice; the first is on line 10/); });
test("a layout that does not exist lists them", () => { expect(msgs("layout: spiral")[0]).toMatch(/^10: "spiral" is not a layout: layout: lanes \| graph/); });
test("a bad tone names the tones", () => { expect(msgs("node a: A\n@step S: x\ntone a red")[0]).toMatch(/^12: tone is "tone ids good\|bad\|warn\|accent\|off"/); });
test("an unknown step word names the nearest word", () => { expect(msgs("node a: A\n@step S: x\nligth a")[0]).toMatch(/^12: "ligth" is not a word of a step/); });
test("a line that is nothing says what a line can be", () => { expect(msgs("node a: A\n@step S: x\n???")[0]).toMatch(/^12: "\?\?\?" is not a word of a step/); });
test("a range with the wrong number of titles says how many", () => { expect(msgs("node a1..a3: x; y")[0]).toMatch(/^10: 3 things \(a1\.\.a3\) but 2 titles/); });
test("a step needs a title", () => { expect(msgs("node a: A\n@step\nshow a")[0]).toMatch(/^11: @step needs a title/); });
test("a relation needs ids on both sides", () => { expect(msgs("node a: A\n-> a")[0]).toMatch(/^11: a relation names both ends/); });
test("a chart names its kind", () => { expect(msgs("node c [chart]: t")[0]).toMatch(/^10: a chart names its kind/); });
test("x: outside a chart is refused with the fix", () => { expect(msgs("x: a, b")[0]).toMatch(/^10: "x:" names a chart's categories/); });
test("a good block has no problem and keeps the fence's own words", () => {
  const m = parse12({ body: "node a: A", line0: 1, fence: { size: "s" }, roles: { node: 1 }, format12: true });
  expect(m.problems).toEqual([]); expect(m.fence.size).toBe("s"); expect(m.layout).toBe("graph");
});
