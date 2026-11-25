// A step about the whole scene shows it on a phone (SPEC.md 6.14). The array, map and tree: step 1 ("the service keeps
// three structures in memory") and the last step ("answered from memory, not the database") have no camera of their
// own, so they talk about the whole scene; on a phone the three structures side by side were 563 units wide, and the
// price index and the database were beyond the edge. In the narrow layout a row of data structures runs on in rows
// that fit a 360 px phone (DS_FIT), and the phone takes the narrow layout where, cutting as many steps' subjects as the
// phone layout, it shows more of the steps about the whole scene whole. (320 x 568: known, 0.7.x.)
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { compileScene, storyView, useNarrow, DS_FIT, MARGIN, type Compiled } from "../src/core/scene";
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
const FILE = "63-animation-an-array-a-map-and-a-tree-in-one-scene.dh.md";
const inside = (b: { x: number; y: number; w: number; h: number }, v: { x: number; y: number; w: number; h: number }) => b.x >= v.x - 0.5 && b.y >= v.y - 0.5 && b.x + b.w <= v.x + v.w + 0.5 && b.y + b.h <= v.y + v.h + 0.5;
// each step's view on a phone px wide in a window win tall (the stage held to min(680 px, 82% of the window))
const views = (wide: Compiled, px: number, win: number) => {
  const lw = Math.floor(px / 16) * 16, h = Math.min(Math.max(px / (phoneAr(wide, lw) ?? wide.aspect), 360), PHONE_TALL.most, win * PHONE_TALL.ofWindow), ar = px / h;
  const c = phoneScene(wide, useNarrow(wide, lw)) ?? wide, held = heldViews(c, ar, px);
  return c.frames.map((f, k) => ({ f, v: storyView(held[k]?.frame ?? f, ar, px) }));
};

describe("a step about the whole scene shows it on a phone", () => {
  test("the array, map and tree on a 390 x 844 and a 360 x 780 phone: its first and last steps show Ana, the three structures and the database whole", () => {
    const a = anim(FILE), wide = compileScene(a.head, a.steps, a.base ?? 1, a.info ?? {});
    for (const [px, win] of [[390, 844], [360, 780]] as const) {
      const vs = views(wide, px, win);
      for (const k of [0, vs.length - 1]) {
        const { f, v } = vs[k];
        expect([px, k + 1, ["ana", "api", "ids", "cart", "idx", "db"].filter((id) => !inside(f.boxes.find((b) => b.id === id)!, v))]).toEqual([px, k + 1, []]);
      }
    }
  });
  test("in the narrow layout its structures run on in rows no wider than DS_FIT", () => {
    const a = anim(FILE), f = compileScene(a.head, a.steps, a.base ?? 1, { ...(a.info ?? {}), phone: "1", narrow: "1" }).frames[0];
    const api = f.boxes.find((b) => b.id === "api")!, kids = f.boxes.filter((b) => b.ent.parent === "api");
    expect(new Set(kids.map((b) => Math.round(b.y + b.h / 2))).size).toBeGreaterThan(1);
    expect(api.w).toBeLessThanOrEqual(DS_FIT + MARGIN);
  });
});
