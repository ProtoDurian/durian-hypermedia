// Lane prims: how a plain thing is drawn, from hand-built things and rects.
import { wrapWords } from "../../../src/engine/render/prims/fit";
import { describe, expect, test } from "bun:test";
import { thingPrims, CHIP_H, chipW } from "../../../src/engine/render/prims";
import { fitWords } from "../../../src/engine/render/prims/fit";
import { textBox } from "./audit";
import type { Prim, Rect, Shape, Thing, ThingState } from "../../../src/engine/types";

const thing = (o: Partial<Thing> & { id: string }): Thing => ({
  role: null, title: o.id, lines: [], flags: [], shape: "box", layout: null, container: false, parent: null, region: null, order: 0,
  values: null, keys: {}, chart: null, src: { line: 1 }, ...o,
});
const state = (o: Partial<ThingState> = {}): ThingState => ({ visible: true, at: null, in: null, side: null, is: null, text: null, tone: null, dim: false, values: null, lifted: false, open: false, ...o });
const texts = (ps: Prim[]) => ps.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text");
const inside = (b: Rect, r: Rect) => b.x >= r.x - 1 && b.x + b.w <= r.x + r.w + 1 && b.y >= r.y - 3 && b.y + b.h <= r.y + r.h + 3;

describe("prims: words fit the rect", () => {
  for (const phone of [false, true]) for (const shape of ["box", "pill", "circle", "cylinder", "cloud", "person", "diamond"] as Shape[]) {
    test(`${shape} ${phone ? "phone" : "wide"}: a title and a line stay inside a rect sized for them`, () => {
      const r: Rect = shape === "circle" ? { x: 20, y: 30, w: 110, h: 110 } : shape === "diamond" ? { x: 20, y: 30, w: 170, h: 100 } : { x: 20, y: 30, w: 140, h: shape === "person" || shape === "cylinder" ? 100 : 64 };
      const ps = thingPrims(thing({ id: "a", shape, title: "Checkout service", lines: ["takes the order"] }), state(), r, "stage", phone);
      for (const p of texts(ps)) expect(inside(textBox(p, phone), r)).toBe(true);
    });
  }
  test("a long note in a small legacy pill is dropped; the title stays whole", () => {
    const ps = thingPrims(thing({ id: "router", shape: "pill" }), state({ text: ["maps each key range to a shard"] }), { x: 16, y: 206, w: 77, h: 34 }, "classic", false);
    const t = texts(ps);
    expect(t.map((p) => p.key)).toEqual(["t:router:title"]);
    expect(t[0].lines).toEqual(["router"]);
  });
  test("a title that cannot fit ends in an ellipsis, never under 11 px", () => {
    const ps = thingPrims(thing({ id: "a", title: "an extremely long label that will never fit in a tiny box at all" }), state(), { x: 0, y: 0, w: 80, h: 40 }, "stage", true);
    const t = texts(ps)[0];
    expect(t.lines.at(-1)!.endsWith("…")).toBe(true);
    expect(["title", "body", "sub"]).toContain(t.font);
    expect(inside(textBox(t, true), { x: 0, y: 0, w: 80, h: 40 })).toBe(true);
  });
  test("the title steps down a size before it is cut", () => {
    const f = fitWords("Observability dashboards", [], 160, 26, { px: 11, pt: 10 });
    expect(f.cut).toBe(false);
    expect(f.title.length).toBe(1);
    expect(f.tf).not.toBe("title");
  });
  test("title and lines never touch: the lines start a gap under the title", () => {
    const ps = texts(thingPrims(thing({ id: "a", title: "Orders", lines: ["one", "two"] }), state(), { x: 0, y: 0, w: 160, h: 90 }, "stage", false));
    const ti = ps.find((p) => p.key === "t:a:title")!, su = ps.find((p) => p.key === "t:a:lines")!;
    expect(su.y - ti.y).toBeGreaterThanOrEqual(16 + 3 - 1);
  });
});

describe("prims: states", () => {
  test("a state chip clears a title that reaches under it", () => {
    const r: Rect = { x: 0, y: 40, w: 120, h: 60 };
    const ps = thingPrims(thing({ id: "a", title: "Replica primary" }), state({ is: "change 41" }), r, "stage", false);
    const chip = ps.find((p) => p.k === "chip") as Extract<Prim, { k: "chip" }>;
    const title = texts(ps)[0], b = textBox(title, false);
    const overlap = chip.x < b.x + b.w && b.x < chip.x + chipW(chip.words) && chip.y < b.y + b.h && b.y < chip.y + CHIP_H;
    expect(overlap).toBe(false);
  });
  test("a state chip sits on the top edge when the title is short", () => {
    const ps = thingPrims(thing({ id: "a", title: "db" }), state({ is: "ok" }), { x: 0, y: 40, w: 160, h: 60 }, "stage", false);
    expect((ps.find((p) => p.k === "chip") as { y: number }).y).toBe(40 - CHIP_H / 2);
  });
  test("down crosses the thing out and takes the bad tone", () => {
    const ps = thingPrims(thing({ id: "a" }), state({ keys: { down: "yes" } }), { x: 0, y: 0, w: 100, h: 50 }, "classic", false);
    expect(ps.some((p) => p.k === "path" && p.key === "t:a:x")).toBe(true);
    expect((ps.find((p) => p.k === "box") as { tone: string }).tone).toBe("bad");
  });
  test("a dimmed thing dims its words too", () => {
    const ps = thingPrims(thing({ id: "a", lines: ["x"] }), state({ dim: true }), { x: 0, y: 0, w: 100, h: 60 }, "stage", false);
    for (const p of texts(ps)) expect(p.cls).toContain("eng-dim");
  });
  test("a container of a data layout draws no heading; another container does", () => {
    const own = thingPrims(thing({ id: "a", container: true, layout: "array", title: "xs" }), state(), { x: 0, y: 0, w: 120, h: 50 }, "stage", false);
    const plain = thingPrims(thing({ id: "g", container: true, title: "Group" }), state(), { x: 0, y: 0, w: 120, h: 80 }, "stage", false);
    expect(texts(own)).toEqual([]);
    expect(texts(plain)[0].lines).toEqual(["Group"]);
  });
  test("a token sits on the bottom edge of what it is at", () => {
    const ps = thingPrims(thing({ id: "k", shape: "token", title: "6" }), state({ at: "n8" }), { x: 10, y: 10, w: 60, h: 40 }, "stage", false);
    const chip = ps[0] as Extract<Prim, { k: "chip" }>;
    expect(chip.y).toBe(10 + 40 - 1);
  });
});

test("a path too long for a line breaks after a slash, never inside its file name", () => {
  const ls = wrapWords("features/checkout/observability/contract.yaml", 150, "title", 99);
  expect(ls.join("")).toBe("features/checkout/observability/contract.yaml");
  expect(ls.some((l) => l === "contract.yaml" || l.endsWith("/contract.yaml"))).toBe(true);
});
