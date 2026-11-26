import { describe, expect, test } from "bun:test";
import { CHART } from "../../../src/engine/charts";
import type { ChartSpec, Prim, Rect } from "../../../src/engine/types";
import { wholeShares } from "../../../src/engine/charts/radial/common";
import { DOTS12_CTX, DOTS12V, DOTS6, DOTS_CTX, DOUGHNUT, PIE, POLAR, RADAR, SPANS, UNITS, UNITS_PANEL, ctx } from "./fixtures";

const WIDE: Rect = { x: 0, y: 0, w: 720, h: 340 }, PHONE: Rect = { x: 0, y: 0, w: 340, h: 420 };
const vals = (s: ChartSpec) => s.series.map((x) => x.values);
const draw = (s: ChartSpec, v = vals(s), r = WIDE, phone = false, extra = {}) => CHART[s.kind].draw(s, v, r, ctx(phone, extra));
const keys = (p: Prim[]) => p.map((x) => x.key);
/** a path's command letters: the shape a tween needs to stay the same */
const shape = (d: string) => d.replace(/[-\d.\s,]+/g, "");
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const bounds = (p: Prim): [number, number, number, number] | null => {
  if (p.k === "box" || p.k === "rect") return [p.rect.x, p.rect.y, p.rect.x + p.rect.w, p.rect.y + p.rect.h];
  if (p.k === "dot") return [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r];
  return null;
};
const inside = (p: Prim[], r: Rect) => p.every((x) => { const b = bounds(x); return !b || (b[0] >= r.x - 0.5 && b[1] >= r.y - 0.5 && b[2] <= r.x + r.w + 0.5 && b[3] <= r.y + r.h + 0.5); });

describe("every radial kind draws", () => {
  for (const s of [PIE, DOUGHNUT, POLAR, RADAR, DOTS6, UNITS, UNITS_PANEL, SPANS])
    for (const [name, r, phone] of [["wide", WIDE, false], ["phone", PHONE, true]] as const)
      test(`${s.kind} ${s.series.length > 1 && s.kind === "units" ? "panel " : ""}${name}: primitives with unique keys, marks inside the rect`, () => {
        const p = draw(s, vals(s), r, phone);
        expect(p.length).toBeGreaterThan(3);
        expect(new Set(keys(p)).size).toBe(p.length);
        expect(inside(p, r)).toBe(true);
        expect(CHART[s.kind].llm(s, vals(s)).join(" ").length).toBeGreaterThan(10);
      });
});

describe("keys and shapes stay put when numbers change (so the renderer glides)", () => {
  const same = (a: Prim[], b: Prim[], kind: string) => {
    const bk = new Map(b.map((x) => [x.key, x]));
    for (const x of a) if (x.k === "path" && kind && !x.key.startsWith("ring")) { const y = bk.get(x.key); expect(y).toBeDefined(); expect(shape((y as any).d)).toBe(shape(x.d)); expect(nums((y as any).d).length).toBe(nums(x.d).length); }
  };
  test("pie: the same slices, the same commands, different numbers", () => {
    const a = draw(PIE), b = draw(PIE, [[9, 1, 12, 5]]);
    same(a, b, "pie");
    expect(keys(a).filter((k) => k.startsWith("slice"))).toEqual(keys(b).filter((k) => k.startsWith("slice")));
    expect(a.find((p) => p.key === "slice:0:0")).not.toEqual(b.find((p) => p.key === "slice:0:0"));
  });
  test("a slice that goes to zero keeps its path", () => { const p = draw(PIE, [[0, 5, 12, 5]]); expect(p.some((x) => x.key === "slice:0:0" && x.k === "path")).toBe(true); });
  test("doughnut and polar keep slices too", () => { same(draw(DOUGHNUT), draw(DOUGHNUT, [[1, 9]]), "d"); same(draw(POLAR), draw(POLAR, [[10, 20, 30, 40, 50]]), "p"); });
  test("radar: outlines and points keep keys", () => { const a = draw(RADAR), b = draw(RADAR, [[1, 1, 1, 1, 1], [5, 5, 5, 5, 5]]); same(a, b, "r"); expect(keys(a).filter((k) => k.startsWith("pt"))).toEqual(keys(b).filter((k) => k.startsWith("pt"))); });
  test("dots: a dot that stays has the same key and place when columns are added", () => {
    const a = draw(DOTS6, undefined, WIDE, false, DOTS_CTX), b = draw(DOTS6, [DOTS12V], WIDE, false, DOTS12_CTX);
    for (const x of a.filter((p) => p.k === "dot")) { const y = b.find((p) => p.key === x.key); expect(y).toBeDefined(); expect((y as any).x).toBeCloseTo((x as any).x, 5); expect((y as any).y).toBeCloseTo((x as any).y, 5); }
    expect(b.filter((p) => p.key.startsWith("col:")).length).toBe(12);
    expect(a.filter((p) => p.key.startsWith("col:")).length).toBe(6);
  });
  test("units: one square per unit, keys by place", () => {
    const a = draw(UNITS), cells = a.filter((p) => p.key.startsWith("u:"));
    expect(cells.length).toBe(64);
    const b = draw(UNITS, [[20, 8, 4]]);
    expect(keys(b).filter((k) => k.startsWith("u:"))).toEqual(keys(a).filter((k) => k.startsWith("u:")));
  });
});

describe("the numbers are right", () => {
  test("pie slices add up to a full turn", () => {
    const p = draw(PIE).filter((x) => x.k === "path" && x.key.startsWith("slice")) as Extract<Prim, { k: "path" }>[];
    expect(p.length).toBe(4);
    const labels = draw(PIE).filter((x) => x.k === "text").flatMap((x: any) => x.lines).join("|");
    expect(labels).toContain("Generate  12 (46%)");
  });
  // charts2: the review saw 15+19+46+19 = 99%
  test("pie shares add up to 100% (largest remainder), in the key, in the slices and for an LLM", () => {
    expect(wholeShares([4, 5, 12, 5])).toEqual([16, 19, 46, 19]);
    expect(wholeShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholeShares([0, 0])).toEqual([0, 0]);
    expect(wholeShares([0, 3])).toEqual([0, 100]);
    const texts = draw(PIE).filter((x) => x.k === "text").flatMap((x: any) => x.lines as string[]);
    const key = texts.map((t) => /\((\d+)%\)$/.exec(t)?.[1]).filter(Boolean).map(Number);
    expect(key.reduce((x, y) => x + y, 0)).toBe(100);
    const inSlice = texts.filter((t) => /^\d+%$/.test(t)).map((t) => parseInt(t));
    expect(inSlice.reduce((x, y) => x + y, 0)).toBe(100);
    const llm = CHART.pie.llm(PIE, vals(PIE)).join(" ");
    expect((llm.match(/\((\d+)%\)/g) ?? []).map((t) => parseInt(t.slice(1))).reduce((x, y) => x + y, 0)).toBe(100);
  });
  test("radar ring numbers sit off the spokes and over the outlines (the review saw them hidden under the points)", () => {
    const p = draw(RADAR), ticks = p.filter((x) => x.key.startsWith("tick")) as Extract<Prim, { k: "text" }>[];
    expect(ticks.length).toBeGreaterThan(1);
    const lastArea = Math.max(...p.map((x, i) => (x.key.startsWith("area") || x.key.startsWith("pt") ? i : -1)));
    for (const t of ticks) expect(p.indexOf(t)).toBeGreaterThan(lastArea);
    const dots = p.filter((x) => x.k === "dot") as Extract<Prim, { k: "dot" }>[];
    for (const t of ticks) for (const d of dots) expect(Math.hypot(t.x - d.x, t.y - 4 - d.y)).toBeGreaterThan(d.r + 2);
  });
  test("dots: counts per column, warm dots only in lit columns and only the new ones", () => {
    const p = draw(DOTS6, [DOTS12V], WIDE, false, DOTS12_CTX), dots = p.filter((x) => x.k === "dot") as Extract<Prim, { k: "dot" }>[];
    expect(dots.length).toBe(DOTS12V.reduce((a, b) => a + b, 0));
    expect(dots.filter((d) => d.tone === "warn").length).toBe(DOTS12V.slice(6).reduce((a, b) => a + b, 0));
    const jan = dots.filter((d) => d.key.startsWith("dot:0:"));
    expect(jan.length).toBe(24);
  });
  test("units: group counts and the remainder", () => {
    const cells = draw(UNITS).filter((p) => p.k === "rect" && p.key.startsWith("u:")) as Extract<Prim, { k: "rect" }>[]; // eng-stagebars: a unit is a square (a rect), not a box
    expect(cells.filter((c) => c.tone === "good").length).toBe(16);
    expect(cells.filter((c) => c.tone === "accent").length).toBe(8);
    expect(cells.filter((c) => c.tone === "bad").length).toBe(4);
    expect(cells.filter((c) => c.fill === "band" && /ps-scn-faint-edge/.test(c.cls ?? "")).length).toBe(36); // eng-polish: a remaining unit is the stage's own: surface-2 fill, the faint edge
  });
  test("units panel: a row per series, leaving squares lit", () => {
    const cells = draw(UNITS_PANEL).filter((p) => p.k === "rect" && p.key.startsWith("u:")) as Extract<Prim, { k: "rect" }>[];
    expect(cells.length).toBe(24);
    expect(cells.filter((c) => /xy-thick/.test(c.cls ?? "")).length).toBe(6);
    expect(draw(UNITS_PANEL).filter((p) => p.k === "chip").length).toBe(2);
  });
  test("spans: a bar per row, a marker when start is end", () => {
    const p = draw(SPANS);
    expect(p.filter((x) => x.key.startsWith("span:") && x.k === "rect").length).toBe(3);
    expect(p.filter((x) => x.key.startsWith("span:") && x.k === "dot").length).toBe(1);
  });
  test("radar draws a ring set and a polygon per series", () => { const p = draw(RADAR); expect(p.filter((x) => x.key.startsWith("area")).length).toBe(2); expect(p.filter((x) => x.key.startsWith("pt:")).length).toBe(10); });
});

describe("words on the drawing", () => {
  test("no label wider than a phone is cut off the rect (x inside)", () => {
    for (const s of [PIE, RADAR, POLAR]) for (const x of draw(s, vals(s), PHONE, true)) if (x.k === "text") {
      const w = Math.max(...x.lines.map((l) => ctx(true).measure(l, x.font)));
      const lo = x.anchor === "start" ? x.x : x.anchor === "end" ? x.x - w : x.x - w / 2;
      expect(lo).toBeGreaterThanOrEqual(-1); expect(lo + w).toBeLessThanOrEqual(PHONE.w + 1);
    }
  });
});
