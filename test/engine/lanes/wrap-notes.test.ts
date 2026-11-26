// eng-lanes2: a wrap scene's step notes are on the stage (as the old stage drew them), not in the caption.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import { ownsNotes } from "../../../src/engine/layouts/sheet/notes";
import { fencesOf, ROOT } from "../parse/fixtures";

describe("wrap: a step's notes are a strip on the stage", () => {
  const c = compile(fencesOf(join(ROOT, "fixtures/stage/example-layers.dh.md"))[9].src);
  for (const w of [1280, 390]) test(`example-layers 10 at ${w}: step 1 and step 4 notes drawn, under the last part that shows in their step`, () => {
    const p = c.plan(w);
    expect(p.words).toBe("own"); // the renderer adds no caption notes
    const strip = (k: number) => p.frame(k).find((q) => q.key.startsWith("sh::notes") && q.k === "rect");
    const words = (k: number) => p.frame(k).filter((q) => q.key.startsWith("sh::notes") && q.k === "text").map((q) => (q.k === "text" ? q.lines.join(" ") : "")).join(" ");
    expect(words(1)).toContain("Arrived"); expect(words(1)).toContain("decoded to bits");
    expect(words(4)).toContain("To acknowledge"); expect(words(4)).toContain("1060");
    expect(strip(2)).toBeUndefined();
    // step 1: the grid of panels shows nothing yet, so the note takes its place; step 4: under the grid
    const grid = Object.entries(p.rects(4)).filter(([id]) => id.startsWith("grid")).map(([, r]) => r.y + r.h);
    const s1 = strip(1), s4 = strip(4);
    expect(s1 && s4 && s1.k === "rect" && s4.k === "rect" ? s1.rect.y < s4.rect.y : false).toBe(true);
    if (grid.length && s4?.k === "rect") expect(s4.rect.y).toBeGreaterThanOrEqual(Math.max(...grid));
  });
  test("a scene with says keeps the renderer's notes (words own would drop its says)", () => {
    const m = { ...c.model, steps: c.model.steps.map((s, i) => (i ? s : { ...s, facts: [...s.facts, { k: "say", id: "fr", words: "hi", src: s.facts[0].src } as never] })) };
    expect(ownsNotes(c.model)).toBe(true);
    expect(ownsNotes(m as never)).toBe(false);
  });
});
