// The story camera leaves a box out whole rather than cut it (SPEC.md 6.14): where a container sits just inside the
// stage's edge with its far side past it, and the scene's margin holds the view back from leaving it out, the view may
// slide up to SLACK px past that margin (a few pixels of empty ground beyond the scene on the other side), and only
// when that cuts fewer. (The array, map and tree on a 390 px phone: its whole view cut the price index at the right.)
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { compileScene, cutBy, storyView, useNarrow, MARGIN, type Compiled } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";
import { heldViews } from "../src/core/calm";
import { SLACK } from "../src/core/edge10";
import { phoneAr } from "../src/ui/anim";

const FIX = join(import.meta.dir, "../fixtures/format");
const scenes = () => readdirSync(FIX).filter((x) => x.endsWith(".dh.md")).sort().flatMap((file) => {
  const out: { head: string; steps: { title: string; raw: string; line: number }[]; base?: number; info?: Record<string, string> }[] = [];
  const walk = (v: unknown): void => { if (!v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const o = v as Record<string, unknown>; if (o.type === "animation" && o.anim && !o.stage) { out.push(o.anim as (typeof out)[number]); return; } Object.values(o).forEach(walk); };
  walk(parse(readFileSync(join(FIX, file), "utf8")));
  return out.map((a) => ({ file, wide: compileScene(a.head, a.steps, a.base ?? 1, a.info ?? {}) }));
});
// a phone stage px wide (844 px window): the server's shape for the layout width, held by the stylesheet to 360..680
const views = (wide: Compiled, px: number, lw: number) => {
  const h = Math.min(Math.max(px / (phoneAr(wide, lw) ?? wide.aspect), 360), 680), ar = px / h;
  const c = phoneScene(wide, useNarrow(wide, lw)) ?? wide, held = heldViews(c, ar, px);
  return c.frames.map((f, k) => ({ f, at: held[k]?.frame ?? f, v: storyView(held[k]?.frame ?? f, ar, px) }));
};

describe("the camera leaves a box out whole rather than cut it", () => {
  test("the array, map and tree on a 390 px phone: its whole view (steps 1 and 11) cuts nothing", () => {
    const wide = scenes().find((s) => s.file.startsWith("63-"))!.wide, vs = views(wide, 390, 384);
    expect([0, vs.length - 1].map((k) => cutBy(vs[k].f, vs[k].v).length)).toEqual([0, 0]);
  });
  test("no view of any fixture on a phone runs more than SLACK past the scene's margin", () => {
    const far: string[] = [];
    for (const { file, wide } of scenes()) for (const [px, lw] of [[390, 384], [360, 352]] as const) views(wide, px, lw).forEach(({ at, v }, k) => {
      // (the bounds of what the view was framed on: a held view's, for the steps that share it)
      const b = at.bounds, lo = b.x - MARGIN - SLACK - 0.5, hi = b.x + b.w + MARGIN + SLACK + 0.5;
      if (v.w < b.w + 2 * MARGIN && (v.x < lo || v.x + v.w > hi)) far.push(`${file} ${px} step ${k + 1}`);
    });
    expect(far).toEqual([]);
  }, 30000);
});
