// render3: a rows panel keeps its columns over the story (SPEC: one size per thing for the whole story). The gate:
// example-layers 9, routing table T3: step 5 adds ": matches, longest: chosen" to the "out" column, and every column
// head and cell moved (moved 18 -> 37 at 1280). The lanes adapter gives each panel with the same head line the widest
// each column needs in any step; the old engine (no keep) is unchanged.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { atSizes } from "../../../src/engine/render/font";
import type { Prim } from "../../../src/engine/types";

const FILE = "fixtures/stage/example-layers.dh.md";
const xOf = (f: Prim[], s: string) => f.filter((q): q is Extract<Prim, { k: "text" }> => q.k === "text" && q.lines.join(" ") === s).map((q) => Math.round(q.x));

describe("a rows panel keeps its columns over the story", () => {
  const c = compile(fencesOf(join(ROOT, FILE), readFileSync(join(ROOT, FILE), "utf8"), "layers")[8].src);
  test("routing table T3: the column heads stay put from step 2 to step 5", () => {
    atSizes(false, () => {
      const p = c.plan(1178);
      for (const head of ["learned from", "next hop", "out"]) {
        const at = [2, 3, 4, 5].map((k) => xOf(p.frame(k), head));
        expect(at[0].length).toBe(1);
        expect(at).toEqual([at[0], at[0], at[0], at[0]]);
      }
    });
  });
});
