// render3: a bin that takes items in its step is drawn lit (the stage's .stg-box.stg-hot: thick border, soft shadow). The grid's
// boxes carried a g-hot class nothing styled, so "Seed packets" never lit Autumn at its last step (page review; the old engine did).
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { atSizes } from "../../../src/engine/render/font";
import type { Prim } from "../../../src/engine/types";

describe("a lit bin", () => {
  const c = compile(fencesOf(join(ROOT, "fixtures/stage/34-animation-bins.dh.md"))[1].src);
  for (const w of [1178, 356]) test(String(w), () => atSizes(w < 480, () => {
    const lit = (k: number) => c.plan(w).frame(k).filter((q): q is Extract<Prim, { k: "box" }> => q.k === "box" && q.lit && /^bin:/.test(q.id ?? "")).map((q) => q.id);
    expect([lit(1), lit(2), lit(3)]).toEqual([["bin:a"], ["bin:b"], ["bin:c"]]);
  }));
});
