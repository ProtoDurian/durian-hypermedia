// A step names its subject, so a short phone keeps it in view (SPEC.md 6.14: the story's camera keeps what the step
// touches in frame). Eight colours' step 2 is about the worker reading its queue: on a 320 x 568 phone the stage is
// held to 82% of the window (466 px), shorter than the whole scene at the least word size, and a step that touched
// nothing framed the top of the scene, the worker below the edge. Step 2 now lights the worker.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { compileScene, storyView, useNarrow, type Compiled } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";
import { heldViews, PHONE_TALL } from "../src/core/calm";
import { phoneAr } from "../src/ui/anim";

type Anim = { head: string; steps: { title: string; raw: string; line: number }[]; base?: number; info?: Record<string, string> };
const anim = (file: string): Anim => {
  let a: Anim | null = null;
  const walk = (v: unknown): void => { if (a || !v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const o = v as Record<string, unknown>; if (o.type === "animation" && o.anim && !o.stage) { a = o.anim as Anim; return; } Object.values(o).forEach(walk); };
  walk(parse(readFileSync(join(import.meta.dir, "../fixtures/format", file), "utf8")));
  return a!;
};
const inside = (b: { x: number; y: number; w: number; h: number }, v: { x: number; y: number; w: number; h: number }) => b.x >= v.x - 0.5 && b.y >= v.y - 0.5 && b.x + b.w <= v.x + v.w + 0.5 && b.y + b.h <= v.y + v.h + 0.5;
// each step's view on a phone px wide in a window win tall: the server's stage height, held by the stylesheet to
// min(680 px, 82% of the window)
const views = (wide: Compiled, px: number, win: number) => {
  const lw = Math.floor(px / 16) * 16, h = Math.min(Math.max(px / (phoneAr(wide, lw) ?? wide.aspect), 360), PHONE_TALL.most, win * PHONE_TALL.ofWindow), ar = px / h;
  const c = phoneScene(wide, useNarrow(wide, lw)) ?? wide, held = heldViews(c, ar, px);
  return c.frames.map((f, k) => ({ f, v: storyView(held[k]?.frame ?? f, ar, px) }));
};

test("eight colours: step 2 keeps the worker in view on a 320 x 568, a 360 x 640 and a 390 x 844 phone", () => {
  const a = anim("55a-animation-eight-colours-told-apart-by-everyone.dh.md"), wide = compileScene(a.head, a.steps, a.base ?? 1, a.info ?? {});
  for (const [px, win] of [[320, 568], [360, 640], [390, 844]] as const) {
    const s2 = views(wide, px, win)[1];
    expect([px, win, inside(s2.f.boxes.find((b) => b.id === "k1")!, s2.v)]).toEqual([px, win, true]);
  }
});
