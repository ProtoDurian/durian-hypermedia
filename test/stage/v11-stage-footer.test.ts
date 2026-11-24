// 0.7.0-rc.3 (rc.3 review, the layers story on a phone: a step's caption sat ~2,000 px under what it changed): on a phone the step
// buttons and the caption are one footer that stays at the foot of the screen while a tall stage scrolls; it adds no
// height (no padding, no border: every stage's height stay as they were)
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("on a phone the step buttons and the caption are one sticky footer that adds no height", () => {
  const tsx = readFileSync(join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8"), css = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8");
  expect(tsx).toMatch(/<div className="stg-foot">\s*<ol className="stg-steps">[\s\S]*?<div className="stg-capbox">[\s\S]*?<\/div>\s*<\/div>/);
  const rule = css.match(/@media screen and \(max-width: 560px\) \{ \.stg-foot \{([^}]*)\} \}/)?.[1] ?? "";
  expect(rule).toContain("position: sticky; bottom: 0;");
  expect(rule).not.toMatch(/padding|border|margin|height/);
  expect(css.match(/\.stg-foot \{/g)?.length).toBe(1);
});
