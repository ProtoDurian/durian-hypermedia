// render3: the inset's title writes its range 24–36, not 24..36 (at its size the two dots read as one: "24.36").
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { atSizes } from "../../../src/engine/render/font";
import { rangeWords } from "../../../src/engine/layouts/time/prims";

describe("an inset's range", () => {
  for (const file of ["fixtures/stage/06-animation-time-up-close.dh.md", "fixtures/stage/08-animation-time-detail-static.dh.md"]) test(file, () => {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const page of [text, migrate(text)]) {
      const c = compile(fencesOf(join(ROOT, file), page, file)[0].src);
      for (const w of [1178, 356]) atSizes(w < 480, () => {
        const words = c.plan(w).frame(1).flatMap((q) => (q.k === "text" ? q.lines : []));
        expect(words.filter((s) => s.startsWith("Close-up"))).toEqual(["Close-up (24–36)"]);
      });
    }
  });
  test("only a numeric range in brackets at the end", () => {
    expect([rangeWords("Zoom (1.5..2.5)"), rangeWords("a (x..y)"), rangeWords("(3..4) left")]).toEqual(["Zoom (1.5–2.5)", "a (x..y)", "(3..4) left"]);
  });
});
