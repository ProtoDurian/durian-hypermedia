// The native grid (format 12): regions are rows, cells are things, a bin is a container and "x in bin" slides a thing into it.
import { describe, expect, test } from "bun:test";
import { Grid } from "../../../src/engine/layouts/grid";
import type { LayoutInput, Placed, StepState } from "../../../src/engine/types";
import { ctxAt, emptyModel, inputOf, states, thing } from "./helpers";

// a stage grid with two regions, and a bins scene: inventory `inv` holding b1..b4, bins `s` and `r`
const rowsModel = () => {
  const m = emptyModel({ regions: [{ id: "a", title: "Row A", flags: [], src: { line: 1 } }, { id: "b", title: "Row B", flags: [], src: { line: 2 } }], steps: [{ title: "One", caption: "", facts: [], src: { line: 3 } }] });
  for (const [id, region] of [["a1", "a"], ["a2", "a"], ["a3", "a"], ["b1", "b"]] as const) { m.things[id] = thing(id, { region, title: id.toUpperCase(), lines: ["a line"], order: m.order.length }); m.order.push(id); }
  return m;
};
const binsModel = () => {
  const m = emptyModel({ steps: [{ title: "One", caption: "", facts: [], src: { line: 1 } }, { title: "Two", caption: "", facts: [], src: { line: 2 } }] });
  const add = (id: string, o: Parameters<typeof thing>[1] = {}) => { m.things[id] = thing(id, { order: m.order.length, ...o }); m.order.push(id); };
  add("inv", { title: "Inventory", container: true, layout: "grid", keys: { cols: "4" } });
  for (const b of ["b1", "b2", "b3", "b4"]) add(b, { title: b, parent: "inv" });
  add("s", { title: "Science", container: true, layout: "grid", keys: { cols: "2" } });
  add("r", { title: "Reference", container: true, layout: "grid", keys: { cols: "2" } });
  return m;
};
/** the engine's way of placing nested containers, enough for these tests */
const placeAll = (m: ReturnType<typeof binsModel>, sts: StepState[], width: number) => {
  const cache = new Map<string | null, Placed>();
  const ctx = ctxAt(width); ctx.child = (id, avail) => get(id, avail);
  const members = (c: string | null) => m.order.filter((t) => sts.some((s) => (s.things[t].in ?? m.things[t].parent) === c));
  const get = (c: string | null, avail?: number): Placed => { let p = cache.get(c); if (!p) { const input: LayoutInput = { model: m, states: sts, container: c, members: members(c), regions: c === null ? m.regions : [], avail }; p = Grid.place(input, ctx); cache.set(c, p); } return p; };
  return { root: get(null), get };
};

describe("rows from regions", () => {
  test("a region is a row: its cells side by side, the rows one under the other, the same column widths", () => {
    const m = rowsModel(), p = Grid.place(inputOf(m, states(m), null, m.order), ctxAt(1280)), r = p.at(1);
    expect(r.a1.y).toBe(r.a2.y); expect(r.a2.y).toBe(r.a3.y); expect(r.b1.y).toBeGreaterThan(r.a1.y + r.a1.h - 1);
    expect(r.a1.w).toBe(r.b1.w); expect(r.a2.x).toBeGreaterThan(r.a1.x + r.a1.w);
    expect(p.h).toBeGreaterThan(r.b1.y + r.b1.h - 1);
  });
  test("the row titles are drawn once, in every step", () => {
    const m = rowsModel(), p = Grid.place(inputOf(m, states(m), null, m.order), ctxAt(1280));
    for (const k of [0, 1]) expect(p.decor(k).filter((d) => d.k === "text").map((d) => (d as { lines: string[] }).lines[0])).toEqual(["Row A", "Row B"]);
  });
  test("a phone puts the row title over its cells and keeps everything inside the width", () => {
    const m = rowsModel(), p = Grid.place(inputOf(m, states(m), null, m.order), ctxAt(390));
    for (const rc of Object.values(p.at(1))) expect(rc.x + rc.w).toBeLessThanOrEqual(390);
    expect(p.w).toBe(390);
  });
});

describe("bins as containers", () => {
  const sts = (m: ReturnType<typeof binsModel>) => states(m, (step, id) => (step >= 1 && (id === "b1" || id === "b3") ? { in: "s" } : step >= 2 && id === "b2" ? { in: "r" } : {}));
  test("a member has a slot in every container it visits, and moves between them", () => {
    const m = binsModel(), s = sts(m), { get } = placeAll(m, s, 1000);
    expect(Object.keys(get("s").at(1)).sort()).toEqual(["b1", "b3"]);
    expect(Object.keys(get("inv").at(1)).sort()).toEqual(["b2", "b4"]);
    expect(Object.keys(get("inv").at(0)).sort()).toEqual(["b1", "b2", "b3", "b4"]);
    expect(Object.keys(get("r").at(2))).toEqual(["b2"]);
  });
  test("nothing else shifts when a thing leaves: the others keep their slots", () => {
    const m = binsModel(), s = sts(m), { get } = placeAll(m, s, 1000);
    expect(get("inv").at(1).b2).toEqual(get("inv").at(0).b2);
    expect(get("inv").at(1).b4).toEqual(get("inv").at(0).b4);
  });
  test("a bin's count is derived from the states, and it is a framed cell", () => {
    const m = binsModel(), s = sts(m), { get } = placeAll(m, s, 1000);
    const count = (step: number) => (get("s").decor(step).find((d) => d.k === "chip") as { words: string }).words;
    expect([count(0), count(1), count(2)]).toEqual(["0", "2", "2"]);
    expect(get("s").decor(1).some((d) => d.k === "box" && d.container)).toBe(true);
  });
  test("a bin is drawn by its own decor, not by the engine's card", () => {
    const m = binsModel(), s = sts(m), { root } = placeAll(m, s, 1000);
    expect(root.draw!(1, "s", { x: 0, y: 0, w: 10, h: 10 }, s[1].things.s)).toEqual([]);
    expect(root.draw!(1, "b1", { x: 0, y: 0, w: 10, h: 10 }, s[1].things.b1)).toBeNull();
  });
  test("the root grid holds the inventory and the bins side by side and fits the width", () => {
    const m = binsModel(), s = sts(m), { root } = placeAll(m, s, 1000), r = root.at(1);
    expect(Object.keys(r).sort()).toEqual(["inv", "r", "s"]);
    for (const rc of Object.values(r)) expect(rc.x + rc.w).toBeLessThanOrEqual(1000);
  });
});
