// The "↔ Swipe to see all of it" line under a drawing that scrolls sideways (owner feedback, point 23): it must sit in the
// flow, under the stage, never over the drawing. It carries the class .table-more, which base.css takes out of the flow
// (a table's line is placed by script under its table); parts.css must put this one back.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const css = (f: string) => readFileSync(join(import.meta.dir, "..", "src/ui", f), "utf8");
const rule = (src: string, sel: string) => { const m = src.match(new RegExp(`(?:^|\\n)${sel.replace(/[.\-]/g, "\\$&")}[^{]*\\{([^}]*)\\}`)); return m ? m[1] : ""; };
test("the base .table-more line is out of the flow (placed by script under a table)", () => {
  expect(rule(css("base.css"), ".table-more")).toMatch(/position:\s*absolute/);
});
test("the stage's swipe line is put back in the flow, so it sits under the stage and takes its own room", () => {
  const parts = css("parts.css");
  const both = parts.match(/\.scn-swipe-more,\s*\.scn-swipe-more\.table-more\s*\{([^}]*)\}/);
  expect(both).not.toBeNull();
  expect(both![1]).toMatch(/position:\s*static/);
  expect(both![1]).not.toMatch(/position:\s*(absolute|fixed|sticky)|transform|translate|top:|bottom:/);
});
test("the other swipe lines (sequence, wardley, grid) are plain in-flow lines", () => {
  for (const [file, sel] of [["../parts/sequence/style.css", ".seq-hint"], ["../parts/wardley/style.css", ".wardley-hint"], ["tiers.css", ".al-more"]] as const) {
    const r = rule(css(file), sel);
    expect(r).not.toBe("");
    expect(r).not.toMatch(/position:\s*(absolute|fixed)|transform|translate/);
  }
});
