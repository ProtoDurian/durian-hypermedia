// render3: two arrows, one label each (stage 18). Two lines that say the same words keep a label each; a line of
// several pairs (`m -> s, t: 12 each`) keeps one label for the bundle. The page review: in the migrated form the
// second "30 crates" was gone (the lanes adapter joined the two lines into one bundle).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { atSizes } from "../../../src/engine/render/font";
import type { Prim } from "../../../src/engine/types";

const FILE = "fixtures/stage/18-animation-two-arrows-one-label-each.dh.md";
const words = (f: Prim[], s: string) => f.filter((q) => q.k === "text" && q.lines.join(" ") === s).length;

describe("two arrows, one label each", () => {
  const text = readFileSync(join(ROOT, FILE), "utf8");
  for (const [form, page] of [["old", text], ["format 12", migrate(text)]] as const) test(form, () => {
    const c = compile(fencesOf(join(ROOT, FILE), page, form)[0].src);
    for (const w of [1178, 356]) atSizes(w < 480, () => {
      const p = c.plan(w);
      expect([w, words(p.frame(1), "30 crates")]).toEqual([w, 2]);
      expect([w, words(p.frame(2), "12 each")]).toEqual([w, 1]);
      expect([w, words(p.frame(3), "30 crates")]).toEqual([w, 1]);
    });
  });
  test("migrate keeps a line of several pairs on one line, and two lines as two", () => {
    const rels = migrate(text).split("\n").filter((l) => /^\w+(, \w+)* -> /.test(l));
    expect(rels).toEqual(["a -> m: 30 crates", "b -> m: 30 crates", "m -> s, t: 12 each", "a -> m: 30 crates"]);
  });
});
