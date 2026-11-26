// Fixtures 48, 49, 60, 62, 63 through the real front-end and core, then the data and tree layouts. The other lanes' layouts
// (still stubs when this was written) are replaced for the test by a column that stacks what a stage holds.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { LAYOUT } from "../../../src/engine/layouts";
import type { LayoutName, LayoutPlugin, Rect } from "../../../src/engine/types";

// the render lane's thingPrims and route are stubs here: one box per thing, a straight line. A module mock outlives its file
// in one bun process, so the real modules are kept and put back in afterAll (the files that run after this one need them).
const realPrims = { ...(await import("../../../src/engine/render/prims")) }, realRoute = { ...(await import("../../../src/engine/render/route")) };
mock.module("../../../src/engine/render/prims", () => ({ thingPrims: (t: any, _s: any, r: Rect) => [{ k: "box", key: `thing:${t.id}`, id: t.id, shape: t.shape, rect: r, role: t.role, tone: null }] }));
mock.module("../../../src/engine/render/route", () => ({ route: (_r: any, a: Rect, b: Rect) => `M${a.x} ${a.y}L${b.x} ${b.y}` }));
const { compile } = await import("../../../src/engine/pipeline");
const column: LayoutPlugin["place"] = (input, ctx) => {
  const sizes = input.members.map((m): [string, number, number] => { const t = input.model.things[m]; if (t.layout || t.container) { const c = ctx.child(m); return [m, c.w, c.h]; } return [m, 90, 34]; });
  let y = 0; const rect: Record<string, Rect> = {};
  for (const [m, w, h] of sizes) { rect[m] = { x: 0, y, w, h }; y += h + 20; }
  const w = Math.max(0, ...sizes.map((s) => s[1]));
  return { w, h: Math.max(0, y - 20), at: (k) => Object.fromEntries(Object.entries(rect).filter(([m]) => { const st = input.states[k].things[m]; return st?.visible && !st.at && (st.in ?? input.model.things[m].parent) === input.container; })), decor: () => [] };
};
const saved: Partial<Record<LayoutName, LayoutPlugin>> = {};
const OWN = new Set<LayoutName>(["array", "list", "stack", "queue", "map", "tree"]);
beforeAll(() => { for (const n of Object.keys(LAYOUT) as LayoutName[]) if (!OWN.has(n)) { saved[n] = LAYOUT[n]; LAYOUT[n] = { name: n, place: column }; } });
afterAll(() => {
  for (const [n, p] of Object.entries(saved)) LAYOUT[n as LayoutName] = p!;
  mock.module("../../../src/engine/render/prims", () => realPrims);
  mock.module("../../../src/engine/render/route", () => realRoute);
});

// upstream gaps (reported to brant): lowerGraph gives `buckets` no layout, and core never opens a zoomed array/map; patched here so the layouts are tested
function compileFixed(src: ReturnType<typeof fence>["src"]) {
  const c = compile(src);
  const h = c.model.things.h; if (h && !h.layout && h.keys.count) { h.layout = "map"; h.container = true; h.keys.buckets = h.keys.count; }
  const ds = c.states.map((s, k) => (k ? c.model.steps[k - 1].facts : []).filter((f) => f.k === "zoom")).flat().length;
  if (c.model.things.ids && ds) c.states.forEach((s, k) => { s.things.ids = { ...s.things.ids, open: k >= 2 && k <= 3 }; s.things.cart = { ...s.things.cart, open: k >= 5 && k <= 6 }; });
  return c;
}
const fence = (name: string) => fencesOf(join(ROOT, "fixtures/format", `${name}.dh.md`), undefined, name)[0];
const NAMES = {
  48: "48-animation-binary-search-tree-insert", 49: "49-animation-hash-table-with-a-collision", 60: "60-animation-by-a-new-author-a-queue-with-workers",
  62: "62-animation-one-thing-splits-travels-and-merges", 63: "63-animation-an-array-a-map-and-a-tree-in-one-scene",
};
describe("real fixtures: data and tree layouts", () => {
  for (const [n, name] of Object.entries(NAMES)) {
    test(`${n}: plans at 1280 and 390, every step draws with keys that never repeat`, () => {
      const c = compileFixed(fence(name).src);
      for (const w of [1280, 390]) {
        const p = c.plan(w);
        for (let k = 0; k < c.states.length; k++) {
          const keys = p.frame(k).map((d) => d.key);
          expect(new Set(keys).size).toBe(keys.length);
        }
        expect(p.w).toBeGreaterThan(0); expect(p.h).toBeGreaterThan(0);
      }
    });
  }
  test("63: the array, the map and the tree keep one box through the story; zooming opens them in place", () => {
    const c = compileFixed(fence(NAMES[63]).src), p = c.plan(1280);
    for (const id of ["ids", "cart", "idx"]) for (let k = 1; k < c.states.length; k++) expect(p.rects(k)[id]).toEqual(p.rects(0)[id]);
    const text = (k: number) => p.frame(k).filter((d) => d.k === "text").flatMap((d) => (d as any).lines as string[]);
    expect(text(0)).toContain("sorted ids · 3 items");          // closed at the overview: a count title (0.7.0 trimmed the sample to 3 ids)
    const open = c.states.findIndex((s) => s.things.ids.open);
    expect(open).toBeGreaterThan(0); expect(text(open)).toContain("34"); expect(text(open)).toContain("sorted ids");
    expect(p.rects(0)["ids.2"]).toBeDefined(); expect(p.rects(0)["cart.ana"]).toBeDefined(); expect(p.rects(0)["cart.b1"]).toBeDefined();
  });
  test("63: the map's new key lands in its bucket, the tree walks 30 > 50 down and to the right (0.7.0 trimmed node 40)", () => {
    const c = compileFixed(fence(NAMES[63]).src), p = c.plan(1280), last = c.states.length - 1;
    const r = p.rects(last);
    expect(r["cart.dee"]).toBeDefined(); expect(r["cart.dee"].y).toBeGreaterThanOrEqual(r["cart.b2"].y); expect(r["cart.dee"].y + r["cart.dee"].h).toBeLessThanOrEqual(r["cart.b2"].y + r["cart.b2"].h);
    expect(r.p20.x).toBeLessThan(r.p30.x); expect(r.p50.x).toBeGreaterThan(r.p30.x); expect(r.p50.y).toBeGreaterThan(r.p30.y); expect(r.p40).toBeUndefined();
  });
  test("60: the queue closes up: job 3 moves to the front when jobs 1 and 2 are taken; job 4 joins at the back", () => {
    const c = compileFixed(fence(NAMES[60]).src), p = c.plan(1280);
    const r1 = p.rects(1), r2 = p.rects(2), r3 = p.rects(3), r6 = p.rects(6);
    expect(r1.j1.x).toBeGreaterThan(r1.j2.x); expect(r1.j2.x).toBeGreaterThan(r1.j3.x);
    expect(r2.j1.x).not.toBe(r1.j1.x); // j1 is in worker 1 now, not in the queue
    expect(r2.j2.x + r2.j2.w).toBe(r1.j1.x + r1.j1.w); // job 2 is the front: flush right where job 1 was
    expect(r3.j3.x + r3.j3.w).toBe(r1.j1.x + r1.j1.w);
    expect(r6.j4.x + r6.j4.w).toBe(r1.j1.x + r1.j1.w); // job 4 is alone in line, so it is the front
  });
  test("49: pills declared in h.2 chain up in bucket 2: apple, then grape; kiwi alone in bucket 4", () => {
    const c = compileFixed(fence(NAMES[49]).src), p = c.plan(1280), r = p.rects(3);
    expect(p.rects(1).apple).toBeDefined(); expect(p.rects(1).kiwi).toBeUndefined();
    expect(r.apple.y).toBe(r.grape.y); expect(r.grape.x).toBeGreaterThan(r.apple.x + r.apple.w); expect(r.kiwi.y).toBeGreaterThan(r.apple.y);
    expect(r["h.2"].x + r["h.2"].w).toBeGreaterThanOrEqual(r.grape.x + r.grape.w); // the row holds the whole chain
  });
  test("63: a closed array shows no index numbers", () => {
    const c = compileFixed(fence(NAMES[63]).src), p = c.plan(1280);
    expect(p.frame(0).filter((d) => d.k === "text" && (d as any).cls === "index")).toEqual([]);
    expect(p.frame(2).some((d) => d.k === "text" && (d as any).cls === "index")).toBe(true);
  });
  test("48: the tree puts 6 under 3, right of 3, with no node moving when it appears", () => {
    const c = compileFixed(fence(NAMES[48]).src), p = c.plan(1280), last = c.states.length - 1;
    const r = p.rects(last), first = p.rects(1);
    expect(r.n6.y).toBeGreaterThan(r.n3.y); expect(r.n6.x).toBeGreaterThan(r.n3.x);
    for (const id of ["n8", "n3", "n10", "n1", "n14"]) expect(r[id]).toEqual(first[id]);
  });
});
