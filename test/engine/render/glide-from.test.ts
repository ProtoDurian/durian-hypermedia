// render2: a step asked for before the stage has its width (no plan yet: the camera is the 1 x 1 stand-in) glided from
// that point, so the stage grew from nothing over the step (cards inside cards at 390, on the page). The glide starts
// from the view on screen only when there is one; else (null) from the step's own frame.
import { expect, test } from "bun:test";
import { glideFrom, isStandIn, STAND_IN } from "../../../src/engine/render/svg";

test("no plan, or the stand-in: the glide starts from the step's own frame", () => {
  expect(isStandIn(STAND_IN)).toBe(true);
  expect(glideFrom(false, STAND_IN)).toBeNull();
  expect(glideFrom(true, STAND_IN)).toBeNull();
  expect(glideFrom(false, { x: 0, y: 0, w: 356, h: 830 })).toBeNull();
  expect(glideFrom(true, null)).toBeNull();
});
test("a view on screen (a reader's zoom, a step cut short) is where the glide starts", () => {
  const v = { x: 10, y: 20, w: 120, h: 90 };
  expect(glideFrom(true, v)).toBe(v);
});
