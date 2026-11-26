// charts2: the halos round chart words (sunburst names, radar and polar ring numbers) must win over `.chart-svg text { stroke: none }`;
// they never showed (the review measured about 2.3:1 for light words on light rings in dark)
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const css = readFileSync("src/ui/chartprims.css", "utf8");
const rule = (sel: string) => new RegExp(sel.replace(/\./g, "\\.") + "\\s*\\{([^}]*)\\}").exec(css)?.[1] ?? "";
test("the stroke-none rule is there, so a halo needs a more specific selector", () => { expect(css).toMatch(/\.chart-svg text\s*\{\s*stroke:\s*none/); });
for (const sel of [".chart-svg text.kd-an", ".chart-svg text.ch-halo"]) test(`${sel}: a solid halo of the page colour`, () => {
  const r = rule(sel);
  expect(r).toMatch(/stroke:\s*var\(--surface\)/);
  expect(r).not.toContain("transparent");
  expect(parseFloat(/stroke-width:\s*([\d.]+)px/.exec(r)?.[1] ?? "0")).toBeGreaterThanOrEqual(3);
});
