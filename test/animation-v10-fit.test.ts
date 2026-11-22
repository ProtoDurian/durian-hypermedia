// Format version 10, the fit round before the 0.6.0 tag: the 3D fit on a phone. "Show everything" pressed before the 3D stage is
// live is kept and done once it mounts; the phone's story view (cut to what the step touches at the least scale) slides
// to keep within the scene, so it never leaves an empty band on one side while it cuts the other; a layer whose plane is
// wholly off the stage keeps its name only as the nearest one on that side, with an arrow. What is drawn was checked in
// a browser in the prototype (real clicks, corners read from the three.js scene).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slide1, keepInScene, screenBox, project, axes, type V3 } from "../src/ui/fit3d";
import { leastGoal, ppuAt, distFor, type Goal } from "../src/ui/least3d";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const FOV = 40;

// a stack of seven layer planes, 300 x 200, 80 apart, with a thing on the top layer (the seven-layer scene's shape)
const stack = () => {
  const planes = Array.from({ length: 7 }, (_, L) => ({ c: { x: 0, y: -L * 80 + 8, z: 0 }, half: { x: 160, y: 12, z: 110 } }));
  const top = { c: { x: -60, y: 20, z: 0 }, half: { x: 30, y: 12, z: 20 } };
  return { planes, top, scene: [...planes, top] };
};
// the goal that frames boxes from a turn and tilt, centred on their middle, at a distance d
const aim = (bs: { c: V3; half: V3 }[], d: number, az = -0.5, el = 0.62): Goal => {
  const xs = bs.flatMap((b) => [b.c.x - b.half.x, b.c.x + b.half.x]), ys = bs.flatMap((b) => [b.c.y - b.half.y, b.c.y + b.half.y]), zs = bs.flatMap((b) => [b.c.z - b.half.z, b.c.z + b.half.z]);
  return { tx: (Math.min(...xs) + Math.max(...xs)) / 2, ty: (Math.min(...ys) + Math.max(...ys)) / 2, tz: (Math.min(...zs) + Math.max(...zs)) / 2, az, el, dist: d };
};
// the band: the empty strip on one side while the other side is cut (pixels)
const band = (b: { x0: number; x1: number; y0: number; y1: number }, w: number, h: number) => Math.max(b.y1 > h ? Math.max(0, b.y0) : 0, b.y0 < 0 ? Math.max(0, h - b.y1) : 0, b.x1 > w ? Math.max(0, b.x0) : 0, b.x0 < 0 ? Math.max(0, w - b.x1) : 0);

describe("the projection matches the 3D stage's camera", () => {
  test("the target draws at the stage's middle; a point one unit up along the camera's up draws ppu pixels higher", () => {
    const g: Goal = { tx: 10, ty: -40, tz: 5, az: -0.5, el: 0.62, dist: 900 };
    const c = project(g, FOV, 375, 521, { x: 10, y: -40, z: 5 })!;
    expect(c.x).toBeCloseTo(187.5, 6); expect(c.y).toBeCloseTo(260.5, 6);
    const { up, right } = axes(g);
    const u = project(g, FOV, 375, 521, { x: 10 + up.x, y: -40 + up.y, z: 5 + up.z })!;
    expect(c.y - u.y).toBeCloseTo(ppuAt(521, FOV, 900), 6);
    const r = project(g, FOV, 375, 521, { x: 10 + right.x, y: -40, z: 5 + right.z })!;
    expect(r.x - c.x).toBeCloseTo(ppuAt(521, FOV, 900), 6);
  });
  test("a point behind the camera has no place on the stage", () => {
    const g: Goal = { tx: 0, ty: 0, tz: 0, az: 0, el: 0.5, dist: 100 };
    expect(project(g, FOV, 375, 521, { x: 0, y: 200 * Math.sin(0.5), z: 200 * Math.cos(0.5) })).toBeNull();
  });
});

describe("slide1: the view keeps within the scene along one axis", () => {
  test("a scene that fits comes wholly inside, by the least move", () => {
    expect(slide1(-20, 300, null, 500, 10)).toBe(30);
    expect(slide1(220, 520, null, 500, 10)).toBe(-30);
    expect(slide1(50, 400, null, 500, 10)).toBe(0);
  });
  test("a bigger scene with an empty band on one side meets that edge (the cut side gains)", () => {
    // the seven layers' first step: the top 40 % empty, the lower layers cut at the bottom
    expect(slide1(210, 900, null, 521, 20)).toBe(-190);
    expect(slide1(-400, 300, null, 521, 20)).toBe(201);
  });
  test("a bigger scene cut on both sides does not move", () => expect(slide1(-50, 700, null, 521, 20)).toBe(0));
  test("what the step touches never leaves the margin because of the slide", () => {
    expect(slide1(210, 900, [250, 300], 521, 20)).toBe(-190);
    expect(slide1(210, 900, [100, 150], 521, 20)).toBe(-80);
    // already past the margin: the slide does not take it further out
    expect(slide1(210, 900, [5, 40], 521, 20)).toBe(0);
    expect(slide1(-400, 300, [400, 510], 521, 20)).toBe(0);
  });
});

describe("keepInScene: the phone's story view of the seven-layer stack", () => {
  const W = 375, H = 521;
  const { top, scene } = stack();
  const whole = aim(scene, 1500), tight = aim([top], 200);
  // a least scale the whole view is under: the story frames the touched thing at that size
  const least = ppuAt(H, FOV, whole.dist) * 1.8;
  const lg = leastGoal(whole, tight, W, H, FOV, least);
  test("the old view (centred on what the step touches) leaves an empty band over 12 % while it cuts the stack", () => {
    expect(lg.cut).toBe(true);
    const b = screenBox(lg.goal, FOV, W, H, scene)!;
    expect(b.y1).toBeGreaterThan(H);
    expect(band(b, W, H) / H).toBeGreaterThan(0.12);
  });
  test("slid within the scene: the band is gone (the margin at most), the size is the same, the thing stays in frame", () => {
    const g = keepInScene(lg.goal, FOV, W, H, scene, [top]);
    expect(g.dist).toBe(lg.goal.dist);
    expect(g.az).toBe(lg.goal.az); expect(g.el).toBe(lg.goal.el);
    const b = screenBox(g, FOV, W, H, scene)!;
    expect(band(b, W, H)).toBeLessThanOrEqual(0.04 * W + 1);
    const k = screenBox(g, FOV, W, H, [top])!;
    expect(k.y0).toBeGreaterThanOrEqual(0); expect(k.y1).toBeLessThanOrEqual(H);
    expect(k.x0).toBeGreaterThanOrEqual(0); expect(k.x1).toBeLessThanOrEqual(W);
  });
  test("a scene the view already shows whole does not move", () => {
    const g = aim(scene, distFor(H, FOV, ppuAt(H, FOV, 1500)) * 1.4);
    const b0 = screenBox(g, FOV, W, H, scene)!;
    expect(b0.y0).toBeGreaterThan(0); expect(b0.y1).toBeLessThan(H);
    const g2 = keepInScene(g, FOV, W, H, scene, []);
    const b1 = screenBox(g2, FOV, W, H, scene)!;
    expect(Math.abs(b1.y0 - b0.y0)).toBeLessThan(25); expect(b1.y0).toBeGreaterThanOrEqual(0.04 * W - 1); expect(b1.y1).toBeLessThanOrEqual(H - 0.04 * W + 1);
  });
});

describe("the engine uses it", () => {
  const a3 = read("src/ui/anim3d.ts"), an = read("src/ui/anim.tsx");
  test("every story view cut to what the step touches goes through keepInScene", () => {
    const sg = a3.slice(a3.indexOf("const storyGoal = () =>"), a3.indexOf("const layerPts = (L: number)"));
    expect((sg.match(/leastGoal\(/g) ?? []).length).toBe(3);
    expect((sg.match(/inScene\(leastGoal\(|return inScene\(lg\)/g) ?? []).length).toBe(3);
  });
  test("the reader's Show everything frames everything with no least size (it never went through leastGoal)", () => {
    const fit = a3.split("\n").find((l) => /^\s+fit: \(\) =>/.test(l))!;
    expect(fit).toContain("fitBox(all");
    expect(fit).not.toContain("leastGoal");
  });
  test("Show everything pressed before the 3D stage is live is kept and done when it mounts", () => {
    expect(an).toMatch(/const fitAll = \(\) => \{ if \(s3\.current && mode === "3d"\) s3\.current\.fit\(\); else \{ fitAsked\.current = true;/);
    expect(an).toMatch(/if \(fitAsked\.current\) \{ fitAsked\.current = false; h\.fit\(\); \}/);
    // going back to the story, or to another step, forgets it
    expect((an.match(/fitAsked\.current = false/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  test("a layer name whose plane is wholly off the stage points that way (data-off and an arrow)", () => {
    expect(a3).toContain("pl.label.dataset.off = offOf(L)");
    const css = read("src/ui/parts.css");
    expect(css).toMatch(/\.scn3-layer\[data-off="b"\]::before \{ content: "\\2193/);
    expect(css).toMatch(/\.scn3-layer\[data-off="t"\]::before \{ content: "\\2191/);
  });
});
