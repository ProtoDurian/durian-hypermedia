// A row the narrow layout turns from a column fits the narrowest phone stage (SPEC.md 6.14): on a phone a column whose
// things link outside it turns into a row, so their lines leave side by side; its things now wrap their words tighter
// (never inside a word) so the row fits ROW_FIT, where the scene's things then fit too. (One
// question becomes three, in a page's column on a phone: its third branch was cut at every step.)
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
// a phone stage px wide (844 px window), laid out for the page's layout width
const cuts = (wide: Compiled, px: number) => {
  const lw = Math.floor(px / 16) * 16, h = Math.min(Math.max(px / (phoneAr(wide, lw) ?? wide.aspect), 360), 680), ar = px / h;
  const c = phoneScene(wide, useNarrow(wide, lw)) ?? wide, held = heldViews(c, ar, px);
  return c.frames.map((f, k) => cutBy(f, storyView(held[k]?.frame ?? f, ar, px)).length);
};

describe("a row the narrow layout turns from a column fits the narrowest phone stage", () => {
  test("one question becomes three: its branches side by side fit, and no step cuts one on a 294 or a 321 px stage", () => {
    const x = scenes().find((s) => s.file.startsWith("58-"))!;
    const f = narrow(x.a).frames[0], at = (id: string) => f.boxes.find((b) => b.id === id)!;
    expect(at("branches").w).toBeLessThanOrEqual(ROW_FIT);
    expect(at("b1").y).toBe(at("b2").y);
    expect(at("b1").x + at("b1").w).toBeLessThanOrEqual(at("b2").x);
    for (const px of [294, 321]) expect([px, ...cuts(x.wide, px)]).toEqual([px, ...cuts(x.wide, px).map(() => 0)]);
  });
  test("its things wrap between words, never inside one", () => {
    const f = narrow(scenes().find((s) => s.file.startsWith("58-"))!.a).frames[0];
    for (const id of ["b1", "b2", "b3"]) expect(f.boxes.find((b) => b.id === id)!.lines.join(" ")).toBe(f.boxes.find((b) => b.id === id)!.label);
  });
  test("every fixture: a turned row wraps tighter only where its scene's things then fit ROW_FIT", () => {
    const tight: string[] = [];
    for (const { file, a } of scenes()) {
      const fs = narrow(a).frames;
      if (fs.some((f) => f.tight)) tight.push(file.slice(0, 2));
    }
    // one question becomes three, and streams, meters and colours; colour families keeps its words (its two sorting
    // centres side by side are wider than ROW_FIT anyway)
    expect(tight).toEqual(["56", "58"]);
  }, 30000);
});
