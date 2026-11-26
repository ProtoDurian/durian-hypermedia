// eng-3d3: the Speed control changes how long the 3D move takes, not only the pause between steps (review 2: at 2x the move still took 760 ms).
// The 3D stage is stubbed (no WebGL needed): what is measured is how long mount3d's tween plays before the view says it is at rest.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { Compiled, Motion } from "../../../src/engine/types";
import { planAt } from "../../../src/engine/pipeline";
import { model, states } from "./helpers";

const views: { at: number; playing: boolean }[] = [];
const stage = { update: (v: { playing?: boolean }) => { views.push({ at: performance.now(), playing: !!v.playing }); }, zoom() {}, pan() {}, walk() {}, fit() {}, back() {}, dispose() {} };
mock.module("../../../src/ui/anim3d", () => ({ mount3d: () => stage }));
const saved: Record<string, unknown> = {};
beforeAll(() => { saved.raf = (globalThis as any).requestAnimationFrame; saved.caf = (globalThis as any).cancelAnimationFrame; (globalThis as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 8); (globalThis as any).cancelAnimationFrame = (n: number) => clearTimeout(n); });
afterAll(() => { (globalThis as any).requestAnimationFrame = saved.raf; (globalThis as any).cancelAnimationFrame = saved.caf; });

const mo = (step: number): Motion => ({ step, enter: [], exit: [], move: [], restyle: [], values: [], relEnter: [], relExit: [], events: [], touched: [], beats: 1, pace: "normal" });
const compiled = () => {
  const m = model([["a", "top"], ["b", "bottom"]], [{ id: "x", region: "a" }, { id: "y", region: "b" }], [["x", "y"]]);
  const sts = states(m, 2), motions = sts.map((_, k) => mo(k));
  const plan = planAt(m, sts, motions, 1280);
  return { model: m, states: sts, motions, problems: [], llm: () => "", plan: () => plan } as unknown as Compiled;
};

/** ms from the step being asked for until the stage is told the move is over */
async function playMs(speed: number): Promise<number> {
  const { mount3d } = await import("../../../src/engine/render/three");
  const h = mount3d({} as HTMLElement, compiled(), 1280, { speed: () => speed });
  h.jump(0);
  views.length = 0;
  const t0 = performance.now();
  h.step(1);
  await new Promise((r) => setTimeout(r, 1500 / speed + 300));
  const end = views.find((v) => !v.playing);
  h.dispose();
  expect(views.some((v) => v.playing)).toBe(true); // it did play a tween
  return end!.at - t0;
}

describe("3D move follows the Speed control", () => {
  test("tweenMs: 760 ms at 1x, divided by the speed", async () => {
    const { tweenMs } = await import("../../../src/engine/render/three");
    expect(tweenMs()).toBe(760); expect(tweenMs(1)).toBe(760); expect(tweenMs(2)).toBe(380); expect(tweenMs(0.5)).toBe(1520); expect(tweenMs(1.5)).toBeCloseTo(506.67, 1);
  });
  test("at 2x the move ends in about half the time it takes at 1x", async () => {
    const one = await playMs(1), two = await playMs(2);
    expect(one).toBeGreaterThan(650); expect(one).toBeLessThan(1000);
    expect(two).toBeGreaterThan(300); expect(two).toBeLessThan(520);
    expect(one / two).toBeGreaterThan(1.5);
  });
});
