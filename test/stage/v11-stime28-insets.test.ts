// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";
beforeEach(() => beginDocument());
const compile = (head: string, ...raw: string[]) => compileStage(head, raw.map((raw, i) => ({ title: "Step " + (i + 1), raw, line: 20 + i * 3 })), 1, {}, { job: 1, server: 2 });
type Box = Extract<Item, { k: "box" }>;
const dots = (items: Item[]) => items.filter((i): i is Box => i.k === "box" && !!i.cls?.includes("stg-time-dot"));
const head = 'time: 0..20 | Sample clock\nruler: below\nticks: 0, 5, 10, 15, 20\nrow job roots "Root": _ 0..2 [dot] [plain]; _ 18..20 [dot] [plain]\nrow server samples "Samples": _ 0..1 [dot]; _ 4..5 [dot]; _ 8..9 [dot]; _ 12..13 [dot]; _ 16..17 [dot]; _ 19..20 [dot]';
test("repeated phone dots fit inside their frame and retain exact positions on the same inset ruler", () => {
  const c = compile(head, "", "keep fill samples", "off samples");
  expect(c.errors).toEqual([]);
  for (const width of [356, 326]) {
    const p = layoutStage(c.model, width), frame = p.items.find((i): i is Box => i.k === "box" && !!i.cls?.includes("stg-time-rows"))!;
    const axis = p.items.find(i => i.k === "path" && i.bar?.axis === "time-x");
    expect(axis?.k).toBe("path");
    if (axis?.k !== "path") throw Error("missing ruler");
    expect(axis.pts[0][0]).toBeGreaterThan(frame.x + 4);
    expect(axis.pts[1][0]).toBeLessThan(frame.x + frame.w - 4);
    const positions = new Map<string, number[]>();
    for (const dot of dots(p.items)) {
      expect(dot.w).toBeLessThanOrEqual(8);
      expect(dot.x - .8).toBeGreaterThan(frame.x + 1);
      expect(dot.x + dot.w + .8).toBeLessThan(frame.x + frame.w - 1);
      const expected = axis.pts[0][0] + +dot.bar!.value / 20 * (axis.pts[1][0] - axis.pts[0][0]);
      expect(dot.x + dot.w / 2).toBeCloseTo(expected, 8);
      const place = [dot.x, dot.y, dot.w, dot.h], old = positions.get(dot.id!);
      if (old) expect(place).toEqual(old); else positions.set(dot.id!, place);
      if (dot.from === 2) expect(dot.fill).toBe(dot.stroke);
    }
  }
  const wide = layoutStage(c.model, 1178);
  expect(dots(wide.items).filter(i => i.id?.includes(":roots:")).every(i => i.w === 16)).toBe(true);
});
test("a single arrival keeps its sixteen-pixel circle when states share the same time", () => {
  const c = compile('time: 0..10 | Seconds\nruler: below\nrow job a: waiting 3.9..4.1 @1 [dot]; arrived 3.9..4.1 @2 [dot]', "", "");
  expect(c.errors).toEqual([]);
  for (const w of [1178, 356, 326]) expect(dots(layoutStage(c.model, w).items).every(i => i.w === 16)).toBe(true);
});
test("a repeated-sample range caption backing stays inside the frame", () => {
  const c = compile(head, "keep span samples 1..19 [above] [bad]: A sampling gap while the sender changes", "", "");
  expect(c.errors).toEqual([]);
  for (const w of [356, 326]) {
    const p = layoutStage(c.model, w), frame = p.items.find((i): i is Box => i.k === "box" && !!i.cls?.includes("stg-time-rows"))!;
    const masks = p.items.filter((i): i is Box => i.k === "box" && i.cls === "stg-time-caption-mask");
    expect(masks.length).toBeGreaterThan(0);
    for (const mask of masks) { expect(mask.x).toBeGreaterThanOrEqual(frame.x + 2); expect(mask.x + mask.w).toBeLessThanOrEqual(frame.x + frame.w - 2); }
  }
});
