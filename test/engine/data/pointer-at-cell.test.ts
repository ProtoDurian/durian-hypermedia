// render3: a pointer at a cell (`i at a.2`, the graph engine's `move i to a.2`). The core dropped `at` a part, so "the engine"
// (format 47) drew its pointer apart from the array (under it at 1280, right of it at 390). A token or a pointer may sit at a
// cell of a data structure: the data layout gives the cell a rect, and the pointer is drawn over it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { atSizes } from "../../../src/engine/render/font";
import type { Prim } from "../../../src/engine/types";

const FILE = "fixtures/format/47-animation-the-engine.dh.md";
describe("a pointer at a cell", () => {
  const text = readFileSync(join(ROOT, FILE), "utf8");
  for (const [form, page] of [["old", text], ["format 12", migrate(text)]] as const) test(form, () => {
    const c = compile(fencesOf(join(ROOT, FILE), page, form)[0].src);
    expect([1, 3, 4].map((k) => c.states[k].things.i.at)).toEqual(["a.0", "a.1", "a.2"]);
    for (const w of [1178, 356]) atSizes(w < 480, () => {
      const p = c.plan(w);
      for (const [k, cell] of [[1, "a.0"], [4, "a.2"]] as const) {
        const f = p.frame(k);
        const arrow = f.find((q) => q.k === "path" && q.key === "t:i") as Extract<Prim, { k: "path" }>;
        const r = (f.find((q) => q.k === "box" && q.id === cell) as Extract<Prim, { k: "box" }>).rect;
        const [x, y1, , y2] = arrow.d.slice(1).split(/[ L]/).map(Number);
        expect([w, k, x > r.x && x < r.x + r.w, y1 < r.y && y2 <= r.y]).toEqual([w, k, true, true]);
      }
    });
  });
});
