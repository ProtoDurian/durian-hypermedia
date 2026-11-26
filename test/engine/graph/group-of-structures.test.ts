// render3: an array, a map and a tree in one group (format 63, the page review). Raised, the graph engine gave each a slot of
// its own size and the data layout drew them bigger: "cart sizes" past "orders service", "sorted ids" under "price index".
// Ranked, they sit side by side inside the group; on a phone a row wider than the stage is a column.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { atSizes } from "../../../src/engine/render/font";
import type { Prim, Rect } from "../../../src/engine/types";

const FILE = "fixtures/format/63-animation-an-array-a-map-and-a-tree-in-one-scene.dh.md";
const inside = (a: Rect, b: Rect) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
describe("structures in one group", () => {
  const c = compile(fencesOf(join(ROOT, FILE), migrate(readFileSync(join(ROOT, FILE), "utf8")), "fmt12")[0].src);
  for (const w of [1178, 356, 341]) test(String(w), () => atSizes(w < 480, () => {
    const p = c.plan(w);
    if (w < 480) expect(p.w).toBeLessThanOrEqual(w);
    for (let k = 1; k < c.states.length; k++) {
      const f = p.frame(k), box = (id: string) => (f.find((q) => q.k === "box" && q.key === `t:${id}`) as Extract<Prim, { k: "box" }> | undefined)?.rect;
      const api = box("api")!, kids = ["ids", "idx", "cart"].map(box).filter((r): r is Rect => !!r);
      expect([w, k, kids.every((r) => inside(r, api))]).toEqual([w, k, true]);
      expect([w, k, kids.some((r, i) => kids.some((s, j) => j > i && meets(r, s)))]).toEqual([w, k, false]);
    }
  }));
});
