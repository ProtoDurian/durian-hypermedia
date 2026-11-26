// hydrate: a figure off the screen keeps its CSS animations still, and gets back only the ones paused for it. The DOM
// is faked here (the package tests have no DOM); the browser run (idle frames on the sample page) is in the lane's notes.
import { expect, test } from "bun:test";
import { pauseAway } from "../src/react/pause-away";

type Anim = { playState: string; effect: { target: any }; pause: () => void; play: () => void };
const anim = (target: any, playState = "running"): Anim => { const a: Anim = { playState, effect: { target }, pause: () => { a.playState = "paused"; }, play: () => { a.playState = "running"; } }; return a; };

function world() {
  const figs = [0, 1, 2].map((i) => ({ id: i, isConnected: true, contains: (t: any) => t === figs[i] || t.fig === i }));
  const kids = figs.map((f) => ({ fig: f.id, isConnected: true }));
  const anims: Anim[] = [];
  let ioCb: (es: { target: any; isIntersecting: boolean }[]) => void = () => {};
  const observed: any[] = [];
  const timers: (() => void)[] = [];
  const root = { ownerDocument: { getAnimations: () => anims }, contains: (t: any) => figs.includes(t) || kids.includes(t), querySelectorAll: () => figs };
  const win = { IntersectionObserver: class { constructor(cb: any) { ioCb = cb; } observe(el: any) { observed.push(el); } disconnect() {} }, setInterval: (f: () => void) => { timers.push(f); return 1; }, clearInterval: () => {} };
  return { figs, kids, anims, root, win, observed, see: (es: { target: any; isIntersecting: boolean }[]) => ioCb(es), tick: () => timers.forEach((f) => f()) };
}

test("the animations of a figure away from the screen pause; on the screen they run; back on the screen they run again", () => {
  const w = world();
  const a0 = anim(w.kids[0]), a1 = anim(w.kids[1]), a2 = anim(w.kids[2]);
  w.anims.push(a0, a1, a2);
  const stop = pauseAway(w.root as any, w.win as any);
  expect(w.observed).toEqual(w.figs);
  w.see([{ target: w.figs[0], isIntersecting: true }, { target: w.figs[1], isIntersecting: false }, { target: w.figs[2], isIntersecting: false }]);
  expect([a0.playState, a1.playState, a2.playState]).toEqual(["running", "paused", "paused"]);
  w.see([{ target: w.figs[1], isIntersecting: true }]);
  expect([a0.playState, a1.playState, a2.playState]).toEqual(["running", "running", "paused"]);
  stop();
  expect(a2.playState).toBe("running");
});

test("an animation the page paused itself stays paused when its figure comes back; a new one in a figure away is caught on the next sweep", () => {
  const w = world();
  const own = anim(w.kids[1], "paused");
  w.anims.push(own);
  pauseAway(w.root as any, w.win as any);
  w.see([{ target: w.figs[1], isIntersecting: false }]);
  w.see([{ target: w.figs[1], isIntersecting: true }]);
  expect(own.playState).toBe("paused");
  w.see([{ target: w.figs[2], isIntersecting: false }]);
  const late = anim(w.kids[2]); w.anims.push(late);
  expect(late.playState).toBe("running");
  w.tick();
  expect(late.playState).toBe("paused");
});

test("no IntersectionObserver or no getAnimations: nothing is paused, nothing breaks", () => {
  const w = world(); const a = anim(w.kids[0]); w.anims.push(a);
  pauseAway(w.root as any, {} as any)();
  pauseAway({ ...w.root, ownerDocument: {} } as any, w.win as any)();
  expect(a.playState).toBe("running");
});
