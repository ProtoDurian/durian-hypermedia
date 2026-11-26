import { describe, expect, test } from "bun:test";
import { Layers, layerOf } from "../../../src/engine/layouts/layers";
import { planAt } from "../../../src/engine/pipeline";
import type { LayoutCtx, LayoutInput, Rect } from "../../../src/engine/types";
import { measure, wrap } from "../../../src/core/stage-core";
import { model, states } from "./helpers";

const ctxOf = (width: number, kids: (id: string) => any = () => { throw new Error("no child"); }): LayoutCtx => ({
  width, phone: width < 480, look: "stage", measure, wrap: (t, w, f, m) => wrap(t, w, f, m), child: kids, problem: () => {},
});
const stack = () => model([["app", "application"], ["tcp", "TCP"], ["link", "link"]], [
  { id: "a1", title: "browser", region: "app" }, { id: "b1", title: "web server", region: "app" },
  { id: "a2", title: "segments", region: "tcp" }, { id: "b2", title: "segments", region: "tcp" },
  { id: "a3", title: "Wi-Fi", region: "link" }, { id: "b3", title: "Ethernet", region: "link" },
], [["a1", "a2"], ["a2", "a3"], ["b3", "b2"], ["b2", "b1"], ["a3", "b3"]]);
const input = (m: ReturnType<typeof stack>, n = 2): LayoutInput => ({ model: m, states: states(m, n), container: null, members: m.order, regions: m.regions });

describe("layers: 2D bands", () => {
  const m = stack(), p = Layers.place(input(m), ctxOf(1280));
  const r = p.at(1);
  test("a column of bands, top layer first, each one band", () => {
    const bands = p.decor(1).filter((d) => d.k === "rect") as Extract<ReturnType<typeof p.decor>[number], { k: "rect" }>[];
    expect(bands.map((b) => b.key)).toEqual(["band:app", "band:tcp", "band:link"]);
    for (let i = 1; i < bands.length; i++) expect(bands[i].rect.y).toBeGreaterThan(bands[i - 1].rect.y + bands[i - 1].rect.h);
    expect(Math.max(...bands.map((b) => b.rect.x + b.rect.w))).toBeLessThanOrEqual(p.w + 0.01);
    expect(bands[2].rect.y + bands[2].rect.h).toBeCloseTo(p.h, 0);
  });
  test("the n-th thing of every band shares a column", () => {
    const mid = (x: Rect) => x.x + x.w / 2;
    expect(mid(r.a1)).toBeCloseTo(mid(r.a2), 3); expect(mid(r.a2)).toBeCloseTo(mid(r.a3), 3);
    expect(mid(r.b1)).toBeCloseTo(mid(r.b2), 3); expect(mid(r.b1)).toBeGreaterThan(mid(r.a1));
  });
  test("every thing lies inside its own band", () => {
    const bands = new Map((p.decor(1).filter((d) => d.k === "rect") as any[]).map((b) => [b.key, b.rect as Rect]));
    for (const [id, band] of [["a1", "app"], ["b2", "tcp"], ["a3", "link"]] as const) {
      const b = bands.get(`band:${band}`)!, x = r[id];
      expect(x.y).toBeGreaterThanOrEqual(b.y); expect(x.y + x.h).toBeLessThanOrEqual(b.y + b.h);
      expect(x.x).toBeGreaterThanOrEqual(b.x); expect(x.x + x.w).toBeLessThanOrEqual(b.x + b.w);
    }
  });
  test("things never overlap", () => {
    const rs = Object.values(r);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  });
  test("the name of a band is drawn once, in the band; focus dims the others", () => {
    const m2 = stack(), inp = { ...input(m2), states: states(m2, 2, () => ({}), (s) => (s === 1 ? "tcp" : "all")) };
    const d = Layers.place(inp, ctxOf(1280)).decor(1);
    expect(d.filter((x) => x.k === "text").map((x: any) => x.lines[0])).toEqual(["application", "TCP", "link"]);
    const cls = Object.fromEntries((d.filter((x) => x.k === "rect") as any[]).map((x) => [x.key, x.cls]));
    expect(cls["band:tcp"]).toContain("is-focus"); expect(cls["band:app"]).toContain("is-dim"); expect(cls["band:link"]).toContain("is-dim");
    expect(Layers.place(input(m2), ctxOf(1280)).decor(1).every((x: any) => !String(x.cls ?? "").includes("is-dim"))).toBe(true);
  });
  test("a line between two bands gets room to show", () => {
    const m3 = model([["a", "A"], ["b", "B"]], [{ id: "x", region: "a" }, { id: "y", region: "b" }]);
    const m4 = model([["a", "A"], ["b", "B"]], [{ id: "x", region: "a" }, { id: "y", region: "b" }], [["x", "y"]]);
    const gap = (mm: typeof m3) => { const r = Layers.place({ ...input(mm as any), model: mm as any, states: states(mm), members: mm.order }, ctxOf(1280)).at(0); return r.y.y - (r.x.y + r.x.h); };
    expect(gap(m4)).toBeGreaterThan(gap(m3));
  });
  test("hidden things keep their place (the still rule)", () => {
    const m5 = stack(), inp = { ...input(m5, 3), states: states(m5, 3, (s, id) => ({ visible: id !== "b2" || s === 2 })) };
    const p5 = Layers.place(inp, ctxOf(1280));
    expect(p5.at(1).b2).toBeUndefined(); expect(p5.at(2).b2).toEqual(p.at(1).b2);
  });
  test("a phone puts the name above the things and stays narrower", () => {
    const pp = Layers.place(input(m), ctxOf(390));
    expect(pp.w).toBeLessThan(p.w);
    const name = pp.decor(1).find((d: any) => d.key === "band-name:tcp") as any, b = pp.decor(1).find((d: any) => d.key === "band:tcp") as any;
    expect(name.y).toBeLessThan(pp.at(1).a2.y); expect(name.y).toBeGreaterThanOrEqual(b.rect.y);
  });
});

describe("layers: not banded, containers", () => {
  test("one layer: one row of things; on a phone it wraps, nothing wider than the stage", () => {
    const m = model([["only", "only"]], Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, title: `server ${i}`, region: "only" })));
    const wide = Layers.place({ model: m, states: states(m), container: null, members: m.order, regions: m.regions }, ctxOf(1280));
    const ys = new Set(Object.values(wide.at(0)).map((r) => r.y)); expect(ys.size).toBe(1);
    const ph = Layers.place({ model: m, states: states(m), container: null, members: m.order, regions: m.regions }, ctxOf(390));
    expect(new Set(Object.values(ph.at(0)).map((r) => r.y)).size).toBeGreaterThan(1);
    expect(ph.w).toBeLessThanOrEqual(390);
  });
  test("through the pipeline: a container holds its members inside its own rect, below its heading", () => {
    const m = model([["us", "us-east"], ["eu", "eu-west"]], [
      { id: "c1", title: "cluster", region: "us" }, { id: "p1", title: "pod 1", parent: "c1", region: "us" }, { id: "p2", title: "pod 2", parent: "c1", region: "us" },
      { id: "d1", title: "primary", region: "eu", shape: "cylinder" },
    ], [["p1", "d1"]]);
    const sts = states(m, 2);
    const plan = planAt(m, sts, sts.map((s) => ({ step: s.step, enter: [], exit: [], move: [], restyle: [], values: [], relEnter: [], relExit: [], events: [], touched: ["p1", "d1"], beats: 1, pace: "normal" as const })), 1280);
    const r = plan.rects(1), c = r.c1;
    for (const id of ["p1", "p2"]) { expect(r[id].x).toBeGreaterThanOrEqual(c.x); expect(r[id].x + r[id].w).toBeLessThanOrEqual(c.x + c.w + 0.01); expect(r[id].y).toBeGreaterThan(c.y + 10); expect(r[id].y + r[id].h).toBeLessThanOrEqual(c.y + c.h); }
    expect(r.d1.y).toBeGreaterThan(c.y + c.h);
    expect(plan.focus(1).w).toBeGreaterThan(0);
  });
  test("layerOf: own region, else the container's, else the first", () => {
    const m = model([["a", "A"], ["b", "B"]], [{ id: "c", region: "b" }, { id: "k", parent: "c" }, { id: "z" }]);
    expect(layerOf({ model: m }, "k")?.id).toBe("b"); expect(layerOf({ model: m }, "z")?.id).toBe("a");
  });
});
