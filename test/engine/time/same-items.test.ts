// The timeline layout against the composed stage it was ported from: for a fixture made only of a time block, the
// block's Items through the new path equal the old plan's Items at the same width (the geometry did not move).
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage } from "../../../src/core/stage";
import { setPhoneFont } from "../../../src/core/stage-core";
import { layoutScene, readScene } from "../../../src/engine/layouts/time/adapter";
import { loadFence, timeModel } from "./lower";
import { pointLabelsOffLines } from "../../../src/engine/layouts/time/labels";

const DIR = join(import.meta.dir, "../../../fixtures/stage");
const NUMS = ["05", "06", "08", "09", "10", "11", "23", "25", "28", "29", "30", "31", "32", "33", "35", "36", "37"]; // pure time blocks
const files = readdirSync(DIR).filter((f) => NUMS.includes(f.slice(0, 2)) && f.endsWith(".dh.md"));

describe("timeline layout equals the composed stage's time block", () => {
  for (const f of files) for (const w of [1280, 390]) test(`${f.slice(0, 2)} at ${w}`, () => {
    const fence = loadFence(join(DIR, f));
    const old = compileStage(fence.head, fence.steps, fence.base, {}, fence.roles);
    expect(old.errors.map((e) => e.msg)).toEqual([]);
    const oldPlan = layoutStage(old.model, w);
    const model = timeModel(fence);
    setPhoneFont(w < 480);
    const scene = readScene(model);
    expect(scene.problems).toEqual([]);
    const laid = layoutScene(scene, w, w < 480);
    const mine = JSON.parse(JSON.stringify(laid.items)), theirs = JSON.parse(JSON.stringify(pointLabelsOffLines(oldPlan.items))); // render2: with the one rule the port adds (a plot line runs through no point label)
    // the old plan holds the time block's items and, for a step's `foot:` line (fixture 31), the stage's own footnote:
    // a core fact the new engine draws elsewhere. Every other item is the block's, in the same order.
    const hasFoot = fence.steps.some((s) => /^foot\b/m.test(s.raw));
    if (!hasFoot) expect(mine).toEqual(theirs);
    else {
      let j = 0; for (const it of theirs) if (j < mine.length && JSON.stringify(it) === JSON.stringify(mine[j])) j++;
      expect(j).toBe(mine.length);
    }
  });
});
