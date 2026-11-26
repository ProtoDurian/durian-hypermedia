import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Graph, Free } from "../../../src/engine/layouts/graph";
import { raise12On } from "../../../src/engine/layouts/graph/legacy"; // render2: these test the rank port (scenes that are not raised)
import { compileScene } from "../../../src/core/scene";
import { measure, wrap, setPhoneFont } from "../../../src/core/stage-core";
import type { LayoutCtx, LayoutInput, Model, Placed, Rect, StepState, Thing, ThingState } from "../../../src/engine/types";

beforeAll(() => { raise12On.on = false; });
afterAll(() => { raise12On.on = true; });

const thing = (id: string, more: Partial<Thing> = {}): Thing => ({
  id, title: id, role: null, lines: [], flags: [], shape: "box", layout: null, container: false,
  parent: null, region: null, order: 0, values: null, keys: {}, chart: null, src: { line: 1 }, ...more,
});
const state = (more: Partial<ThingState> = {}): ThingState => ({
  visible: true, at: null, in: null, side: null, is: null, text: null, tone: null, dim: false,
  values: null, lifted: false, open: false, ...more,
});
function scene(things: Thing[], links: [string, string][] = [], patches: Record<string, Partial<ThingState>>[] = [{}]): LayoutInput {
  const model: Model = {
    format: 12, origin: "format12", title: null, note: null, look: "stage", view: "2d", layout: "graph",
    roles: {}, regions: [], things: Object.fromEntries(things.map((t) => [t.id, t])), order: things.map((t) => t.id),
    relations: Object.fromEntries(links.map(([from, to], i) => [String(i), { id: String(i), from, to, style: "arrow", label: null, role: null, setup: true, src: { line: 1 } }])),
    setup: [], steps: patches.slice(1).map(() => ({ title: "Next", caption: "", facts: [], src: { line: 1 } })),
    scenes: {}, fence: {}, layoutWords: {}, problems: [],
  };
  const states: StepState[] = patches.map((patch, step) => ({
    step, things: Object.fromEntries(things.map((t) => [t.id, state({ in: t.parent, ...patch[t.id] })])),
    relations: Object.fromEntries(links.map((_, i) => [String(i), { visible: true }])), focus: "all", zoom: [],
    layersApart: false, scene: null, camera: null, layout: {},
  }));
  return { model, states, members: things.filter((t) => !t.parent).map((t) => t.id), regions: [], container: null };
}
function context(width = 1280, look: "stage" | "classic" = "stage"): LayoutCtx {
  setPhoneFont(width < 480);
  return { width, phone: width < 480, look, measure, wrap,
    child: () => { throw new Error("unexpected container"); }, problem: (p) => { throw new Error(p.msg); } };
}
function nested(input: LayoutInput, ctx: LayoutCtx): Placed {
  const place = (i: LayoutInput): Placed => Graph.place(i, { ...ctx, child: (id) => place({ ...i, container: id, regions: [],
    members: i.model.order.filter((x) => i.states.some((s) => (s.things[x]?.in ?? i.model.things[x].parent) === id && !s.things[x]?.at)),
  }) });
  return place(input);
}
const right = (a: Rect, b: Rect) => expect(a.x + a.w).toBeLessThan(b.x);
const below = (a: Rect, b: Rect) => expect(a.y + a.h).toBeLessThan(b.y);
const inside = (r: Rect, w: number, h: number) => { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(w + 0.01); expect(r.y + r.h).toBeLessThanOrEqual(h + 0.01); };

describe("graph layout", () => {
  test("reserves ranks for relations and hidden things throughout the story", () => {
    const input = scene([thing("a"), thing("b"), thing("c")], [["a", "b"], ["b", "c"]], [{ b: { visible: false } }, {}]);
    input.states[0].relations = {};
    const p = Graph.place(input, context());
    expect(p.at(0).b).toBeUndefined();
    expect(p.at(0).a).toEqual(p.at(1).a);
    expect(p.at(0).c).toEqual(p.at(1).c);
    right(p.at(1).a, p.at(1).b); right(p.at(1).b, p.at(1).c);
    for (const r of Object.values(p.at(1))) inside(r, p.w, p.h);
  });

  test("keeps a box's largest text and state-chip size for every step", () => {
    const i = scene([thing("a"), thing("b")], [["a", "b"]], [{}, { a: { text: ["A longer description that needs several lines", "Another line"], is: "Complete" } }]);
    const p = Graph.place(i, context());
    expect(p.at(0)).toEqual(p.at(1));
    expect(p.at(0).a.h).toBeGreaterThan(80);
    right(p.at(0).a, p.at(0).b);
  });

  test("reserves a later meter in every frame without shifting neighbours", () => {
    const i = scene([thing("a"), thing("b")], [["a", "b"]], [{}, { a: { keys: { level: "90" } } }]);
    const plain = Graph.place(scene([thing("a"), thing("b")], [["a", "b"]]), context());
    const p = Graph.place(i, context());
    expect(p.at(0)).toEqual(p.at(1));
    expect(p.at(0).a.h).toBe(plain.at(0).a.h + 12);
    right(p.at(0).a, p.at(0).b);
  });

  test("orders a crossed bipartite rank by its neighbours", () => {
    const p = Graph.place(scene([thing("a"), thing("b"), thing("c"), thing("d")], [["a", "d"], ["b", "c"]]), context());
    const r = p.at(0);
    expect(r.a.y).toBeLessThan(r.b.y); expect(r.d.y).toBeLessThan(r.c.y);
  });

  test("cycles, self links and disconnected nodes terminate with finite rectangles", () => {
    const p = Graph.place(scene([thing("a"), thing("b"), thing("c"), thing("d")], [["a", "b"], ["b", "c"], ["c", "a"], ["d", "d"]]), context());
    for (const r of Object.values(p.at(0))) { expect(Object.values(r).every(Number.isFinite)).toBe(true); inside(r, p.w, p.h); }
  });

  test("dir=down and the phone graph run down the page", () => {
    const i = scene([thing("a"), thing("b")], [["a", "b"]]);
    const phone = Graph.place(i, context(390)); below(phone.at(0).a, phone.at(0).b);
    i.model.fence.dir = "down";
    const wide = Graph.place(i, context()); below(wide.at(0).a, wide.at(0).b);
  });

  test("a static phone scene wraps a broad rank without overlaps", () => {
    const things = [thing("root"), ...Array.from({ length: 8 }, (_, k) => thing(`child${k}`))];
    const p = Graph.place(scene(things, things.slice(1).map((t) => ["root", t.id])), context(390));
    expect(p.w).toBeLessThanOrEqual(390);
    for (const r of Object.values(p.at(0))) inside(r, p.w, p.h);
  });

  test("descendant relations rank the containers they connect", () => {
    const i = scene([thing("left", { container: true, keys: { layout: "column" } }), thing("right", { container: true, keys: { layout: "column" } }), thing("a", { parent: "left" }), thing("b", { parent: "right" })], [["a", "b"]]);
    const p = nested(i, context()); right(p.at(0).left, p.at(0).right);
  });

  test("moves reserve both homes without moving neighbouring children", () => {
    const i = scene([thing("left", { container: true, keys: { layout: "column" } }), thing("right", { container: true, keys: { layout: "column" } }), thing("a", { parent: "left" }), thing("b", { parent: "left" }), thing("c", { parent: "right" })], [], [{}, { b: { in: "right" } }]);
    const p = nested(i, context());
    expect(p.at(0)).toEqual(p.at(1));
    const ctx = context(); ctx.child = () => { throw new Error("not used"); };
    const child = Graph.place({ ...i, container: "left", members: ["a", "b"] }, ctx);
    expect(child.at(0).a).toEqual(child.at(1).a);
    expect(child.at(1).b).toBeUndefined();
  });

  test("legacy row, column and grid groups keep the original placement rules", () => {
    for (const mode of ["row", "column", "grid"]) {
      const i = scene([thing("group", { container: true, keys: { layout: mode, cols: "2" } }), ...["a", "b", "c"].map((id) => thing(id, { parent: "group" }))]);
      const p = Graph.place({ ...i, container: "group", members: ["a", "b", "c"] }, context());
      const r = p.at(0);
      if (mode === "row") { right(r.a, r.b); right(r.b, r.c); }
      if (mode === "column") { below(r.a, r.b); below(r.b, r.c); }
      if (mode === "grid") { right(r.a, r.b); below(r.a, r.c); expect(r.a.x).toBe(r.c.x); }
      for (const box of Object.values(r)) { inside(box, p.w, p.h); expect(box.y).toBeGreaterThan(30); }
    }
  });

  test("phone columns with external links turn so outgoing lines leave side by side", () => {
    const i = scene([thing("group", { container: true, keys: { layout: "column" } }), thing("out"), thing("a", { parent: "group" }), thing("b", { parent: "group" })], [["a", "out"], ["b", "out"]]);
    const p = Graph.place({ ...i, container: "group", members: ["a", "b"] }, context(390));
    right(p.at(0).a, p.at(0).b);
    expect(p.at(0).a.y).toBe(p.at(0).b.y);
  });

  test("a fractional column count cannot produce nonfinite grid coordinates", () => {
    const i = scene([thing("group", { container: true, keys: { layout: "grid", cols: "0.5" } }), thing("a", { parent: "group" }), thing("b", { parent: "group" })]);
    const p = Graph.place({ ...i, container: "group", members: ["a", "b"] }, context());
    below(p.at(0).a, p.at(0).b);
  });

  test("lowered graph-engine grid keys stay with the graph family", () => {
    const i = scene([thing("group", { container: true, layout: "graph", keys: { "legacy-layout": "grid", cols: "2" } }), ...["a", "b", "c"].map((id) => thing(id, { parent: "group" }))]);
    const p = Graph.place({ ...i, container: "group", members: ["a", "b", "c"] }, context());
    right(p.at(0).a, p.at(0).b); below(p.at(0).a, p.at(0).c);
    expect(p.at(0).a.x).toBe(p.at(0).c.x);
  });

  test("a lowered root column key is used without stored source", () => {
    const i = scene([thing("a"), thing("b")]); i.model.fence["legacy-layout"] = "column";
    const p = Graph.place(i, context()); below(p.at(0).a, p.at(0).b);
  });

  test("classic leaf sizes and graph rank offsets match the old engine", () => {
    const input = scene([thing("a", { title: "reader", shape: "person" }), thing("b", { title: "web server" }), thing("c", { title: "database", shape: "cylinder" })], [["a", "b"], ["b", "c"]]);
    input.model.look = "classic";
    const p = Graph.place(input, context(1280, "classic"));
    const old = compileScene('person a "reader"\nbox b "web server"\ncylinder c "database"\na -> b\nb -> c', [], 1).frames[0];
    const r = p.at(0), a0 = old.boxes.find((b) => b.id === "a")!;
    for (const box of old.boxes) {
      expect(r[box.id].w).toBeCloseTo(box.w); expect(r[box.id].h).toBeCloseTo(box.h);
      expect(r[box.id].x - r.a.x).toBeCloseTo(box.x - a0.x);
      expect(r[box.id].y - r.a.y).toBeCloseTo(box.y - a0.y);
    }
  });

  test("each returned frame is isolated from caller mutation", () => {
    const p = Graph.place(scene([thing("a")]), context());
    const before = p.at(0).a.x; p.at(0).a.x = -123;
    expect(p.at(0).a.x).toBe(before); expect(p.at(99)).toEqual({});
  });

  test("empty scenes are finite", () => {
    const p = Graph.place(scene([]), context());
    expect(p.at(0)).toEqual({}); expect(p.w).toBeGreaterThan(0); expect(p.h).toBeGreaterThan(0);
  });
});

describe("free layout", () => {
  test("uses the legacy 40-unit grid and reserves later visibility", () => {
    const i = scene([thing("a", { keys: { pos: "2,1" } }), thing("b", { keys: { pos: "7,4" } })], [], [{ b: { visible: false } }, {}]);
    const p = Free.place(i, context());
    expect(p.at(1).b.x - p.at(1).a.x).toBe(200); expect(p.at(1).b.y - p.at(1).a.y).toBe(120);
    expect(p.at(0).a).toEqual(p.at(1).a);
  });
  test("negative grid points are kept inside the plan", () => {
    const p = Free.place(scene([thing("a", { keys: { pos: "-3,-2" } }), thing("b", { keys: { pos: "4,3" } })]), context());
    const r = p.at(0);
    expect(r.b.x - r.a.x).toBe(280); expect(r.b.y - r.a.y).toBe(200);
    for (const box of Object.values(r)) inside(box, p.w, p.h);
  });
  test("invalid positions report the source and fall back to the row", () => {
    const problems: unknown[] = [], ctx = context(); ctx.problem = (p) => problems.push(p);
    const p = Free.place(scene([thing("a", { keys: { pos: "bad" }, src: { line: 12 } }), thing("b")]), ctx);
    expect(problems).toHaveLength(1); expect(problems[0]).toMatchObject({ line: 12 });
    right(p.at(0).a, p.at(0).b);
  });
});
