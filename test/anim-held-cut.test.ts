// The story camera never cuts what it shows (SPEC.md 6.14): a thing, or a container's heading, at the stage's edge is
// whole or left out. One held view for several steps gives way where it would cut what a step's own view shows whole
// (the service mesh on a phone: from step 7 the held view cut node 1's heading), and a phone stage grows a little
// (its calm height, judged at the least height the stylesheet draws) where that lets every step show its things whole.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { compileScene, cutBy, storyView, useNarrow, type Compiled } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";
import { calmHeight, heldViews, PHONE_WIN } from "../src/core/calm";
import { phoneAr } from "../src/ui/anim";

const FIX = join(import.meta.dir, "../fixtures/format");
const scene = (pre: string): Compiled => {
  const file = readdirSync(FIX).find((x) => x.startsWith(pre))!;
  let a: { head: string; steps: { title: string; raw: string; line: number }[]; base?: number; info?: Record<string, string> } | undefined;
  const walk = (v: unknown): void => { if (a || !v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const o = v as Record<string, unknown>; if (o.type === "animation" && o.anim) { a = o.anim as unknown as typeof a; return; } Object.values(o).forEach(walk); };
  walk(parse(readFileSync(join(FIX, file), "utf8")));
  return compileScene(a!.head, a!.steps, a!.base ?? 1, a!.info ?? {});
};
// a 390 px phone (844 px tall): the stage is 390 wide; its shape is the server's for the 384 layout width, held by the
// stylesheet to 360..680 px
const cutSteps = (wide: Compiled) => {
  const px = 390, h = Math.min(Math.max(px / (phoneAr(wide, 384) ?? wide.aspect), 360), 680), ar = px / h;
  const c = phoneScene(wide, useNarrow(wide, 384)) ?? wide, held = heldViews(c, ar, px);
  return c.frames.flatMap((f, k) => (cutBy(f, storyView(held[k]?.frame ?? f, ar, px)).length ? [k + 1] : []));
};

describe("the story camera never cuts what it shows", () => {
  test("the service mesh on a phone: no step cuts a thing or a heading (steps 7 to 13 cut node 1's heading)", () => {
    expect(cutSteps(scene("53-"))).toEqual([]);
  });
  test("eight colours on a phone: the calm height is judged at the height drawn (it was judged at 260 px, drawn at 360)", () => {
    expect(cutSteps(scene("55a-"))).toEqual([]);
  });
  test("a calm height is never under the least height the stylesheet draws", () => {
    for (const pre of ["53-", "55a-", "58-", "63-"]) {
      const wide = scene(pre), cp = phoneScene(wide, useNarrow(wide, 384))!, h = calmHeight(cp, 384, PHONE_WIN);
      if (h != null) expect(h).toBeGreaterThanOrEqual(360);
    }
  });
});
