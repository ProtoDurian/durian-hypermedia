// 0.7.0-rc.4 (at 800 a line from the first of three side-by-side cards to the third ran straight
// through the middle card and its pill, so the pill read struck out): side by side in one row, a line goes straight across
// only when no card stands between; else it hops over the row (or under it), clear of every card and pill it passes.
import { expect, test } from "bun:test";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

const SRC = `## Kitchen
job k: kitchen | takes the order
  pill k1: soup ready
  pill k2: salad made
## Counter
job c: counter | hands it over
  pill c1: bread sliced
  pill c2: tea poured
## Table
server t: table | eats the meal
  pill t1: soup eaten
  pill t2: salad eaten
## Shelf 0
job s0: shelf 0 | holds the plates and the cups
## Shelf 1
job s1: shelf 1 | holds the plates and the cups`; // five lanes: too wide side by side at 800, the narrow form
const steps = [{ title: "One", raw: "", line: 30 }, { title: "Two", raw: "k --> t: menu", line: 31 }];
type Box = Extract<Item, { k: "box" }>; type Path = Extract<Item, { k: "path" }>;
const through = (l: Path, b: Box) => l.pts.some((q, k) => { if (!k) return false; const a = l.pts[k - 1]; for (let s = 1; s < 40; s++) { const x = a[0] + (q[0] - a[0]) * s / 40, y = a[1] + (q[1] - a[1]) * s / 40; if (x > b.x + 1 && x < b.x + b.w - 1 && y > b.y + 1 && y < b.y + b.h - 1) return true; } return false; });

for (const w of [1178, 800, 766]) test(`at ${w}: the kitchen-to-table line passes neither the counter nor its pills`, () => {
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const c = compileStage(SRC, steps, 1, {}, { job: 1, server: 3 }); expect(c.errors).toEqual([]);
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const its = layoutStage(c.model, w).items;
  const k = its.find((i): i is Box => i.k === "box" && (i as { id?: string }).id === "k")!, cn = its.find((i): i is Box => i.k === "box" && (i as { id?: string }).id === "c")!, t = its.find((i): i is Box => i.k === "box" && (i as { id?: string }).id === "t")!;
  expect(Math.abs(k.y - t.y) < 1 && Math.abs(cn.y - k.y) < 1).toBe(true); // three side by side in one row
  const line = its.find((i): i is Path => i.k === "path" && (i as { id?: string }).id === "k>t")!;
  const pills = its.filter((i): i is Box => i.k === "box" && String((i as { id?: string }).id).endsWith("@c"));
  expect(pills.length).toBe(2);
  expect([cn, ...pills].filter((b) => through(line, b)).map((b) => (b as { id?: string }).id)).toEqual([]);
});
