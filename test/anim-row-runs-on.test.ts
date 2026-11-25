// A row of things wider than a phone runs on in rows (SPEC.md 6.14): in the narrow layout a container's row of things
// wider than ROW_FIT (the narrowest phone stage, less the scene's margins) runs on in rows, in reading order, so the
// story camera never has to leave one of them, or what links to them, out. (Eight colours on a phone: the region's five
// things side by side were 590 units wide, and step 2's subject, the worker reading the queue, was below the edge.)
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/index";
import { compileScene, cutBy, storyView, useNarrow, ROW_FIT, type Compiled } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";
import { heldViews } from "../src/core/calm";
import { phoneAr } from "../src/ui/anim";

const FIX = join(import.meta.dir, "../fixtures/format");
type Anim = { head: string; steps: { title: string; raw: string; line: number }[]; base?: number; info?: Record<string, string> };
const scenes = () => readdirSync(FIX).filter((x) => x.endsWith(".dh.md")).sort().flatMap((file) => {
  const out: Anim[] = [];
  const walk = (v: unknown): void => { if (!v || typeof v !== "object") return; if (Array.isArray(v)) return v.forEach(walk); const o = v as Record<string, unknown>; if (o.type === "animation" && o.anim && !o.stage) { out.push(o.anim as Anim); return; } Object.values(o).forEach(walk); };
  walk(parse(readFileSync(join(FIX, file), "utf8")));
  return out.map((a) => ({ file, a, wide: compileScene(a.head, a.steps, a.base ?? 1, a.info ?? {}) }));
});
const narrow = (a: Anim): Compiled => compileScene(a.head, a.steps, a.base ?? 1, { ...(a.info ?? {}), phone: "1", narrow: "1" });
// each step's view on a phone stage px wide (844 px window), laid out for the page's layout width
const views = (wide: Compiled, px: number) => {
  const lw = Math.floor(px / 16) * 16, h = Math.min(Math.max(px / (phoneAr(wide, lw) ?? wide.aspect), 360), 680), ar = px / h;
  const c = phoneScene(wide, useNarrow(wide, lw)) ?? wide, held = heldViews(c, ar, px);
  return c.frames.map((f, k) => ({ f, v: storyView(held[k]?.frame ?? f, ar, px) }));
};
const inside = (b: { x: number; y: number; w: number; h: number }, v: { x: number; y: number; w: number; h: number }) => b.x >= v.x - 0.5 && b.y >= v.y - 0.5 && b.x + b.w <= v.x + v.w + 0.5 && b.y + b.h <= v.y + v.h + 0.5;

describe("a row of things wider than a phone runs on in rows", () => {
  test("eight colours: the region's things run on in rows that fit, in reading order", () => {
    const f = narrow(scenes().find((s) => s.file.startsWith("55a-"))!.a).frames[0], at = (id: string) => f.boxes.find((b) => b.id === id)!;
    expect(at("region").w).toBeLessThanOrEqual(ROW_FIT);
    const order = ["w1", "s1", "q1", "db", "c1"].map(at);
    for (let i = 1; i < order.length; i++) expect(order[i].y > order[i - 1].y + 1 || (Math.abs(order[i].y + order[i].h / 2 - order[i - 1].y - order[i - 1].h / 2) < 1 && order[i].x > order[i - 1].x)).toBe(true);
  });
  // (on a 294 px stage, a page's column on a 360 px phone, the scene is taller than the stage's least aspect allows)
  test("eight colours on a 390, 360 and 321 px phone stage: every step shows the worker, and cuts nothing", () => {
    const wide = scenes().find((s) => s.file.startsWith("55a-"))!.wide;
    for (const px of [390, 360, 321]) views(wide, px).forEach(({ f, v }, k) => {
      expect([px, k + 1, inside(f.boxes.find((b) => b.id === "k1")!, v), cutBy(f, v).length]).toEqual([px, k + 1, true, 0]);
    });
  });
  test("every fixture: no row of things in the narrow layout is wider than ROW_FIT, but a row turned from a column", () => {
    const wide: string[] = [];
    for (const { file, a } of scenes()) {
      if (a.info?.view === "3d" || a.info?.only3d) continue;
      for (const b of narrow(a).frames[0].boxes) {
        if (!b.container || b.ent.layout !== "row" || ["bucket", "array", "list", "queue", "stack", "table", "record", "layer"].includes(b.kind)) continue;
        const kids = narrow(a).frames[0].boxes.filter((k) => k.ent.parent === b.id);
        if (kids.length > 2 && !kids.some((k) => k.container) && b.w > ROW_FIT + 0.5) wide.push(`${file.slice(0, 3)} ${b.id} ${b.w.toFixed(0)}`);
      }
    }
    expect(wide).toEqual([]);
  }, 30000);
});
