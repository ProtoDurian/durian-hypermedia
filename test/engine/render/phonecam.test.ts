// phonecam: a plan wider than the stage shrinks to fit, per step, down to the scale where the step's smallest words are
// 11 px on the screen (as the old camera); only below that is it a natural-size window with shaded edges. A scene shrinks
// only when every step of it fits (no zoom between its steps); a view that cuts only a thing's border is not shaded.
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { beginDocument } from "../../../src/core/stage-budget";
import { setPhoneFont } from "../../../src/core/stage-core";
import React from "react";
import { renderToString } from "react-dom/server";
import { Draw, cameraOf, minWordPx, viewOf, wholeOf } from "../../../src/engine/render/svg";
import { leastScaleOf, shrinkToFit, union } from "../../../src/engine/render/camera";
import type { Rect } from "../../../src/engine/types";
import { useStandin } from "./standin";

const ROOT = join(import.meta.dir, "../../..");
let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
beforeEach(() => { beginDocument(); });

const compiled = (prefix: string) => {
  const file = readdirSync(join(ROOT, "fixtures/format")).find((x) => x.startsWith(prefix))!;
  setPhoneFont(true);
  const doc = parse(readFileSync(join(ROOT, "fixtures/format", file), "utf8"), { path: "x.dh.md" });
  return tryEngine((doc as any).blocks.find((b: any) => b.type === "animation")).c!;
};
const within = (o: Rect, r: Rect) => o.x <= r.x + 0.5 && o.y <= r.y + 0.5 && o.x + o.w >= r.x + r.w - 0.5 && o.y + o.h >= r.y + r.h - 0.5;

test("the least scale: the smallest words reach 11 px, never under the old floors, never above natural size", () => {
  expect(leastScaleOf(11.5, true)).toBeCloseTo(11 / 11.5, 6);
  expect(leastScaleOf(11, true)).toBe(1);
  expect(leastScaleOf(10, false)).toBe(1);
  expect(leastScaleOf(21, true)).toBe(0.8);
  expect(leastScaleOf(21, false)).toBe(0.65);
  expect(leastScaleOf(Infinity, true)).toBe(1); // no words: no shrink to stand on
});

test("shrinkToFit: things wider than the stage are framed whole when they fit the least scale, else not at all", () => {
  const whole = { x: 0, y: 0, w: 400, h: 300 }, view = { w: 356, h: 300 };
  expect(shrinkToFit({ x: 10, y: 0, w: 300, h: 100 }, whole, view, 380)).toBeNull(); // fits the stage: the usual camera
  expect(shrinkToFit({ x: 10, y: 0, w: 390, h: 100 }, whole, view, 380)).toBeNull(); // wider than the least scale: a window
  const f = shrinkToFit({ x: 16, y: 0, w: 358, h: 100 }, whole, view, 372)!;
  expect(f.w).toBeLessThanOrEqual(372 + 1e-9);
  expect(within(f, { x: 16, y: 0, w: 358, h: 100 })).toBe(true);
});

test("a scene wider than a phone stage is shown whole when every step fits, with words never under 11 px on the screen, and holds one frame across its steps", () => {
  const c = compiled("55-animation"), plan = c.plan(356), view = viewOf(plan);
  const all: Rect[] = [];
  for (let k = 0; k < c.states.length; k++) all.push(...Object.values(plan.rects(k)));
  const things = union(all)!;
  expect(things.w).toBeGreaterThan(view.w); // the case: its things are wider than the stage at natural size
  for (const px of [0, 356, 366, 380]) {
    const stage = px || view.w, cams: Rect[] = [];
    for (let k = 1; k < c.states.length; k++) {
      const cam = cameraOf(c, plan, k, px);
      cams.push(cam);
      // never under 11 px: drawn at natural size or larger, or shrunk no further than the step's least scale
      expect(stage / cam.w).toBeGreaterThanOrEqual(Math.min(1, 11 / minWordPx(c, plan, k)) - 1e-6);
      // shrunk only as far as fitting needs
      expect(cam.w).toBeLessThanOrEqual(Math.max(view.w, things.w + 16, stage) + 0.5);
      if (px >= 366) for (const r of Object.values(plan.rects(k))) expect(within(cam, r)).toBe(true); // every step fits: whole
    }
    expect(new Set(cams.map((r) => `${r.x.toFixed(2)} ${r.w.toFixed(2)}`)).size).toBe(1); // no zoom between steps
    // a stage of 356 (a 390 screen): the steps with words on a line (11 px) cannot shrink, so none does
    if (px === 0 || px === 356) expect(cams[0].w).toBeCloseTo(view.w, 3);
    if (px >= 366) expect(cams[0].w).toBeGreaterThan(view.w);
  }
});

test("a view that cuts only a card's border (its things a few px wider than the stage) shades no edge", () => {
  const c = compiled("55-animation"), plan = c.plan(356);
  const draw = (cam: Rect) => renderToString(React.createElement(Draw as any, { c, plan, from: 1, to: 1, t: 1, cam, still: true }));
  const cam = cameraOf(c, plan, 1);
  const all: Rect[] = Object.values(plan.rects(1));
  expect(all.some((r) => !within(cam, r))).toBe(true); // the border is cut ...
  expect(draw(cam)).not.toContain("eng-edges"); // ... and not shaded
  expect(draw({ ...cam, x: cam.x + 40 })).toContain("eng-edges"); // a real cut still is
});

test("a scene whose things fit the stage keeps the frames it had, at any stage width", () => {
  const c = compiled("51-animation"), plan = c.plan(356), view = viewOf(plan);
  const all: Rect[] = [];
  for (let k = 0; k < c.states.length; k++) all.push(...Object.values(plan.rects(k)));
  expect(union(all)!.w).toBeLessThanOrEqual(view.w);
  for (let k = 1; k < c.states.length; k++) expect(cameraOf(c, plan, k, 380)).toEqual(cameraOf(c, plan, k));
  expect(wholeOf(plan).w).toBeGreaterThan(0);
});
