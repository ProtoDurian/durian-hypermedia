// The line that says there is more beyond the stage's edge never sits on a word (SPEC.md 6.14): it takes the middle
// of its edge, else the left end, else the right end; where every spot would cover a word, only the shaded edge and
// its arrow say so. (On a phone it lay on a box's name.)
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CUE, cueAt, cueWidth } from "../src/core/edge10";
import type { Frame } from "../src/core/scene";

// a view of 0..600 x 0..300 drawn on a 600 x 300 stage: one unit is one pixel
const CAM = { x: 0, y: 0, w: 600, h: 300 };
const SAY = "↓ more beyond the edge";
const pw = cueWidth(SAY), y = 300 - CUE.gap - CUE.h;
const at = (...lbl: { x: number; y: number; w: number; h: number }[]) => ({ boxes: lbl.map((r, k) => ({ key: k + 1, lbl: r })), edges: [], marks: [] }) as unknown as Frame;
const mid = { x: 300 - 30, y: y + 4, w: 60, h: 14 }, left = { x: CUE.side + 4, y: y + 4, w: 40, h: 14 }, right = { x: 600 - CUE.side - 44, y: y + 4, w: 40, h: 14 };

describe("the 'more beyond the edge' line keeps off every word", () => {
  test("with no word under it, it stands in the middle of its edge", () => {
    expect(cueAt(at({ x: 20, y: 20, w: 80, h: 14 }), CAM, 600, 300, "b", SAY)).toBe("c");
  });
  test("a box's name under the middle: it moves to the left end, then the right end", () => {
    expect(cueAt(at(mid), CAM, 600, 300, "b", SAY)).toBe("l");
    expect(cueAt(at(mid, left), CAM, 600, 300, "b", SAY)).toBe("r");
  });
  test("a thing whose name is drawn inside it (a bucket \"2\") counts as a word too", () => {
    const f = { boxes: [{ key: 1, kind: "bucket", label: "2", lbl: null, x: 290, y: y + 2, w: 20, h: 20 }], edges: [], marks: [] } as unknown as Frame;
    expect(cueAt(f, CAM, 600, 300, "b", SAY)).toBe("l");
  });
  test("a bucket's number, drawn in its first 30 px, counts too", () => {
    const f = { boxes: [{ key: 1, kind: "bucket", container: true, label: "2", lbl: null, x: 285, y: y - 10, w: 120, h: 40 }], edges: [], marks: [] } as unknown as Frame;
    expect(cueAt(f, CAM, 600, 300, "b", SAY)).toBe("l");
  });
  test("a cell's index, drawn under the cell, counts too", () => {
    const f = { boxes: [{ key: 1, kind: "cell", label: "", lbl: null, index: 2, x: 290, y: y - 20, w: 20, h: 16 }], edges: [], marks: [] } as unknown as Frame;
    expect(cueAt(f, CAM, 600, 300, "b", SAY)).toBe("l");
  });
  test("every spot on a word: no line, the shaded edge's arrow says it", () => {
    expect(cueAt(at(mid, left, right), CAM, 600, 300, "b", SAY)).toBeNull();
  });
  test("at the top edge it looks at the top; the words are read through the view (zoomed in twice)", () => {
    const top = { x: 150 - 15, y: 2, w: 30, h: 7 }; // in a view of half the size, at the top middle
    expect(cueAt(at(top), { x: 0, y: 0, w: 300, h: 150 }, 600, 300, "t", SAY)).toBe("l");
    expect(cueAt(at(top), { x: 0, y: 0, w: 300, h: 150 }, 600, 300, "b", SAY)).toBe("c");
  });
  test("a word 3 px or more away leaves it in place", () => {
    const below = { x: 270, y: y - 3 - 14 - 0.5, w: 60, h: 14 };
    expect(cueAt(at(below), CAM, 600, 300, "b", SAY)).toBe("c");
    expect(pw).toBeGreaterThan(150); // the drawn line is about 172 px at 11.5 px words
  });
  test("the stage draws it where cueAt says, and leaves it out when cueAt finds no spot", () => {
    const src = readFileSync(join(import.meta.dir, "../src/ui/anim.tsx"), "utf8"), css = readFileSync(join(import.meta.dir, "../src/ui/parts.css"), "utf8");
    expect(src).toContain('{downMore && moreAt && <em className="scn-more-say" data-side={downMore} data-at={moreAt === "c" ? undefined : moreAt}>{moreSay}</em>}');
    expect(css).toContain('.scn-more-say[data-at="l"] { left: 30px; translate: none; }');
    expect(css).toContain('.scn-more-say[data-at="r"] { left: auto; right: 30px; translate: none; }');
  });
});
