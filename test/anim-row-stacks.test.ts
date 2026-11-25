// A row of containers stacks on a phone (SPEC.md 6.14): in the narrow layout a row whose children are containers (a
// cluster's three nodes) becomes a column, and so do their own rows of things, so the story camera never has to cut
// one; what links into the column from outside stands beside it, so no line runs down through the containers above
// (the lines test, animation-v10, holds every fixture to that). On a laptop it keeps its rows; a 3D scene keeps its rows. (Pods, nodes and a service: the row was 448 px wide on a
// 390 px phone, and the camera cut node 3 at every step.)
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { compileScene, cutBy, storyView, useNarrow, type Compiled } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";
import { heldViews } from "../src/core/calm";
import { phoneAr } from "../src/ui/anim";

const FIX = join(import.meta.dir, "../fixtures/format");
const scene = (pre: string): Compiled => {
  const file = readdirSync(FIX).find((x) => x.startsWith(pre))!;
  let a: { head: string; steps: { title: string; raw: string; line: number }[]; base?: number; info?: Record<string, string> } | undefined;
  const walk = (v: unknown): void => { if (a || !v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const o = v as Record<string, unknown>; if (o.type === "animation" && o.anim) { a = o.anim as unknown as typeof a; return; } Object.values(o).forEach(walk); };
  walk(parse(readFileSync(join(FIX, file), "utf8")));
  return compileScene(a!.head, a!.steps, a!.base ?? 1, a!.info ?? {});
};
// a phone stage px wide (844 px window): the server's shape for the 384 layout width, held by the stylesheet to 360..680
const cutSteps = (wide: Compiled, px: number) => {
  const h = Math.min(Math.max(px / (phoneAr(wide, 384) ?? wide.aspect), 360), 680), ar = px / h;
  const c = phoneScene(wide, useNarrow(wide, 384)) ?? wide, held = heldViews(c, ar, px);
  return c.frames.flatMap((f, k) => (cutBy(f, storyView(held[k]?.frame ?? f, ar, px)).length ? [k + 1] : []));
};
const nodes = (c: Compiled) => ["n1", "n2", "n3"].map((id) => c.frames[0].boxes.find((b) => b.id === id)!);

describe("a row of containers stacks on a phone", () => {
  for (const pre of ["52-", "72-"]) {
    test(`${pre} the cluster's nodes stand one under another on a phone, and no step cuts a thing`, () => {
      const wide = scene(pre), n = nodes(phoneScene(wide, true)!);
      expect(n[0].y + n[0].h).toBeLessThanOrEqual(n[1].y);
      expect(n[1].y + n[1].h).toBeLessThanOrEqual(n[2].y);
      expect(cutSteps(wide, 390)).toEqual([]);
      expect(cutSteps(wide, 360)).toEqual([]);
    });
  }
  test("on a laptop the nodes keep their row", () => {
    const n = nodes(scene("52-"));
    expect(n[0].y).toBe(n[1].y);
    expect(n[0].x + n[0].w).toBeLessThanOrEqual(n[1].x);
  });
  test("on a phone a node's pods stand one under another too, and the service stands beside the nodes, not above", () => {
    const f = phoneScene(scene("52-"), true)!.frames[0], at = (id: string) => f.boxes.find((b) => b.id === id)!;
    expect(at("w1").y + at("w1").h).toBeLessThanOrEqual(at("c1").y);
    expect(at("svc").x + at("svc").w).toBeLessThanOrEqual(at("cluster").x);
  });
  test("on a laptop a node's pods keep their row", () => {
    const f = scene("52-").frames[0], at = (id: string) => f.boxes.find((b) => b.id === id)!;
    expect(at("w1").y).toBe(at("c1").y);
  });
});
