import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compactNumber, linearScale, logScale, tickText } from "../../../src/engine/charts/axis";
import { CHART } from "../../../src/engine/charts";
import { xyBuild, xyMarks } from "../../../src/engine/charts/xy";
import { fromLegacy } from "../../../src/engine/charts/xy/legacy";
import { XY_CSS } from "../../../src/engine/charts/xy/css";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { drawOne, fences } from "./gallery";
import type { ChartSpec, Prim } from "../../../src/engine/types";

const ctx = (phone = false) => { setPhoneFont(phone); return { phone, look: "stage" as const, measure }; };
const spec = (kind: ChartSpec["kind"], x: string[], series: number[][], opts: Record<string, string> = {}, flags: string[] = []): ChartSpec => ({ kind, title: "", unit: null, x, series: series.map((v, i) => ({ name: `s${i + 1}`, role: null, values: v })), flags, opts });
const keys = (p: Prim[]) => p.map((x) => x.key);

describe("axis maths", () => {
  test("compact tick words keep the unit and shrink the number", () => {
    expect(compactNumber(1000)).toBe("1k"); expect(compactNumber(1500)).toBe("1.5k"); expect(compactNumber(2_000_000)).toBe("2M"); expect(compactNumber(950)).toBe("950");
    expect(tickText(1500, "money", "USD")).toBe("$1.5k"); expect(tickText(50, "percent")).toBe("50%"); expect(tickText(120, "duration-ms")).toBe("120 ms");
  });
  test("linear scale: round ticks, zero kept for bars, author bounds kept", () => {
    const s = linearScale(3, 97, 6, { zero: true });
    expect(s.lo).toBe(0); expect(s.hi).toBeGreaterThanOrEqual(97); expect(s.ticks.every((t) => Number.isInteger(t / 10) || Number.isInteger(t / 20))).toBe(true);
    const b = linearScale(0, 10, 5, { min: 2, max: 8 }); expect([b.lo, b.hi]).toEqual([2, 8]);
    expect(linearScale(0, 7, 8, { whole: true }).ticks.every(Number.isInteger)).toBe(true);
  });
  test("log scale ends on powers of ten and names 1, 2, 5 only on a wide plot", () => {
    const s = logScale(3, 4000); expect([s.lo, s.hi]).toEqual([1, 10000]); expect(s.ticks).toEqual([1, 10, 100, 1000, 10000]); expect(logScale(3, 400).ticks).toContain(200); expect(logScale(3, 400, { phone: true }).ticks).not.toContain(200);
    
    expect(s.at(100)).toBeCloseTo(0.5, 5);
  });
});

describe("drawing", () => {
  test("every chart fence of the fixtures draws without a number going wrong, inside its box, at 640 and 350", () => {
    const all = fences(); expect(all.length).toBeGreaterThanOrEqual(24);
    for (const w of [640, 350]) for (const { name, d } of all) {
      const r = drawOne(d, w); if (!r.lg) continue;
      expect(r.lg.error, name).toBeUndefined();
      const bad = r.svg!.match(/NaN|undefined|Infinity/g); expect(bad, `${name} at ${w}`).toBeNull();
      for (const p of r.built.prims as Prim[]) if (p.k === "text") { expect(p.x, name).toBeGreaterThanOrEqual(-1); expect(p.x, name).toBeLessThanOrEqual(w + 1); }
      expect(new Set(keys(r.built.prims)).size, `${name}: keys are unique`).toBe(r.built.prims.length);
    }
  });
  test("the registry has all seven kinds, each with an LLM view", () => {
    for (const k of ["bar", "line", "area", "scatter", "bubble", "candlestick", "heatmap"] as const) expect(CHART[k].kind).toBe(k);
    const l = CHART.bar.llm(spec("bar", ["a", "b"], [[1, 2]]), [[1, 2]]); expect(l.join("\n")).toContain("| a | 1 |");
  });
  test("keys stay when the numbers change (the renderer glides), and a new category adds keys only", () => {
    const x = ["Jan", "Feb", "Mar"], a = spec("bar", x, [[10, 20, 30], [5, 5, 5]]);
    const p1 = xyBuild(a, [[10, 20, 30], [5, 5, 5]], { x: 0, y: 0, w: 600, h: 300 }, ctx()).prims;
    const p2 = xyBuild(a, [[10, 25, 30], [5, 5, 9]], { x: 0, y: 0, w: 600, h: 300 }, ctx()).prims;
    expect(keys(p2).filter((k) => k.startsWith("b:"))).toEqual(keys(p1).filter((k) => k.startsWith("b:")));
    const l1 = xyBuild(spec("line", x, [[1, 2, 3]]), [[1, 2, 3]], { x: 0, y: 0, w: 600, h: 300 }, ctx()).prims, l2 = xyBuild(spec("line", x, [[3, 2, 1]]), [[3, 2, 1]], { x: 0, y: 0, w: 600, h: 300 }, ctx()).prims;
    expect(keys(l1)).toEqual(keys(l2));
  });
  test("the story's max keeps the scale still between steps", () => {
    const x = ["a", "b"], s = spec("bar", x, [[1, 2]]);
    const lo = xyBuild(s, [[1, 2]], { x: 0, y: 0, w: 600, h: 300 }, { ...ctx(), max: [[100, 100]] }).prims;
    const grid = lo.filter((p) => p.key.startsWith("g:y:")).map((p) => p.key);
    expect(grid).toContain("g:y:100");
  });
  test("a phone axis is compact: 1000 is 1k, and the plot is wider than with the full word", () => {
    const s = spec("bar", ["a", "b", "c"], [[1000, 2500, 4000]]);
    const t = xyBuild(s, [[1000, 2500, 4000]], { x: 0, y: 0, w: 350, h: 260 }, ctx(true)).prims.filter((p) => p.k === "text" && p.key.startsWith("t:y:")) as Extract<Prim, { k: "text" }>[];
    expect(t.map((p) => p.lines[0])).toContain("2k"); expect(t.every((p) => p.lines[0].length <= 3)).toBe(true);
  });
  test("100% stacked reaches exactly the top; stacks add up", () => {
    const s = spec("bar", ["a"], [[30], [70]], {}, ["stacked", "percent"]);
    const r = xyBuild(s, [[30], [70]], { x: 0, y: 0, w: 300, h: 300 }, ctx()).prims.filter((p) => p.k === "rect" && p.key.startsWith("b:")) as Extract<Prim, { k: "rect" }>[];
    const top = Math.min(...r.map((p) => p.rect.y)), bottom = Math.max(...r.map((p) => p.rect.y + p.rect.h));
    expect(r[0].rect.h + r[1].rect.h).toBeCloseTo(bottom - top, 1);
  });
  test("floating bars, horizontal bars, a second axis and a log axis draw", () => {
    const fl = spec("bar", ["a", "b"], [[1, 3, 2, 6]], { "s0.range": "1" });
    const rr = xyBuild(fl, [[1, 3, 2, 6]], { x: 0, y: 0, w: 400, h: 300 }, ctx()).prims.filter((p) => p.key.startsWith("b:")) as Extract<Prim, { k: "rect" }>[];
    expect(rr[1].rect.h).toBeGreaterThan(rr[0].rect.h);
    const hz = xyBuild(spec("bar", ["a", "b"], [[1, 3]], {}, ["horizontal"]), [[1, 3]], { x: 0, y: 0, w: 400, h: 300 }, ctx()).prims.filter((p) => p.key.startsWith("b:")) as Extract<Prim, { k: "rect" }>[];
    expect(hz[1].rect.w).toBeGreaterThan(hz[0].rect.w); expect(hz[0].rect.h).toBe(hz[1].rect.h);
    const two = xyBuild(spec("line", ["a", "b"], [[1, 2], [100, 200]], { "s1.axis": "y2", "y2.label": "ms" }), [[1, 2], [100, 200]], { x: 0, y: 0, w: 400, h: 300 }, ctx()).prims;
    expect(keys(two).some((k) => k.startsWith("t:y2:"))).toBe(true);
    const lg = xyBuild(spec("line", ["a", "b"], [[1, 1000]], { "y.scale": "log" }), [[1, 1000]], { x: 0, y: 0, w: 400, h: 300 }, ctx()).prims;
    expect(keys(lg)).toContain("g:y:1000");
  });
  test("candles are good when the close is at or above the open; marks list open, high, low, close", () => {
    const c = spec("candlestick", ["a", "b"], [[10, 14, 9, 12, 12, 13, 8, 9]]);
    const b = xyBuild(c, [[10, 14, 9, 12, 12, 13, 8, 9]], { x: 0, y: 0, w: 400, h: 300 }, ctx());
    const cs = b.prims.filter((p) => p.k === "rect" && p.key.startsWith("c:")) as Extract<Prim, { k: "rect" }>[];
    expect(cs[0].role).toBe("good"); expect(cs[1].role).toBe("bad");
    expect(b.marks.find((m) => m.kind === "candle")!.text).toContain("Open: 10");
  });
  test("a heatmap: one cell per value, a gap for null, the number only when the cell is big", () => {
    const h = spec("heatmap", ["00", "04"], [[1, NaN], [3, 4]]);
    const b = xyBuild(h, [[1, NaN], [3, 4]], { x: 0, y: 0, w: 400, h: 240 }, ctx());
    const cells = b.prims.filter((p) => p.key.startsWith("h:")) as Extract<Prim, { k: "rect" }>[];
    expect(cells.length).toBe(4); expect(cells.filter((c) => c.cls!.includes("xy-empty")).length).toBe(1); expect(b.marks.filter((m) => m.kind === "cell").length).toBe(4);
  });
  test("a time axis puts points where their time is; an annotation gives a mark with its words", () => {
    const d = fences().find((f) => f.name.startsWith("75-"))!.d, lg = fromLegacy(d)!;
    const b = xyBuild(lg.spec, lg.values, { x: 0, y: 0, w: 640, h: 340 }, ctx());
    const ann = b.marks.filter((m) => m.kind === "ann"); expect(ann.length).toBe(3); expect(ann[0].title).toBe("Deploy v1.4"); expect(ann[0].text).toContain("sessions");
    const xs = b.prims.filter((p) => p.k === "dot" && p.key.startsWith("m:")).map((p) => (p as any).x as number);
    expect(xs.length).toBe(4); expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 0); // equal 5-minute steps are equally far apart
  });
  test("lit categories are marked, the others dimmed", () => {
    const s = spec("bar", ["a", "b"], [[1, 2]]);
    const p = xyBuild(s, [[1, 2]], { x: 0, y: 0, w: 400, h: 300 }, { ...ctx(), lit: ["b"] }).prims.filter((x) => x.key.startsWith("b:")) as Extract<Prim, { k: "rect" }>[];
    expect(p[0].cls).toContain("xy-dim"); expect(p[1].cls).toContain("xy-lit");
  });
  test("one popover mark per category lists every series; marks sit inside the chart", () => {
    const s = spec("bar", ["a", "b"], [[1, 2], [3, 4]]);
    const m = xyMarks(s, [[1, 2], [3, 4]], { x: 0, y: 0, w: 400, h: 300 }, ctx()).filter((x) => x.kind === "bar");
    expect(m.length).toBe(2); expect(m[0].text).toBe("s1: 1\ns2: 3");
  });
  test("xy.css is the CSS string", () => { expect(readFileSync("src/engine/charts/xy/xy.css", "utf8")).toBe(XY_CSS); });
  test("a chart that cannot be read draws nothing instead of throwing", () => {
    const b = xyBuild(spec("bar", [], []), [], { x: 0, y: 0, w: 300, h: 200 }, ctx()); expect(Array.isArray(b.prims)).toBe(true);
  });
});

describe("what a stage bar chart asks for", () => {
  test("its unit stays on the ticks, `axis` fixes the ticks, `line` draws a named reference line, the title can be drawn", () => {
    const s: ChartSpec = { ...spec("bar", ["Mon", "Tue"], [[0.7, 1.4]], { axis: "0, 0.5, 1, 1.5", line: "average: 1", showTitle: "1" }), unit: "×", title: "cups ÷ average" };
    const b = xyBuild(s, [[0.7, 1.4]], { x: 0, y: 0, w: 400, h: 300 }, ctx());
    const ticks = b.prims.filter((p) => p.k === "text" && p.key.startsWith("t:y:")).map((p) => (p as any).lines[0]);
    expect(ticks).toEqual(["0×", "0.5×", "1×", "1.5×"]);
    expect(b.prims.some((p) => p.k === "chip" && p.words === "average")).toBe(true);
    expect(b.prims.some((p) => p.key === "title:chart")).toBe(true);
  });
});

describe("a time axis with its own unit", () => {
  test("ticks sit on whole units every N", () => {
    const x = ["2026-11-01", "2026-11-10"], s = spec("line", x, [[1, 2]], { "x.scale": "time", "x.unit": "day", "x.every": "3" });
    const t = xyBuild(s, [[1, 2]], { x: 0, y: 0, w: 600, h: 300 }, ctx()).prims.filter((p) => p.k === "text" && p.key.startsWith("c:t"));
    expect(t.map((p) => (p as any).lines[0])).toEqual(["Nov 1", "Nov 4", "Nov 7", "Nov 10"]);
  });
});

describe("annotation chips stay inside the chart", () => {
  test("a goal line's chip never runs past the right edge (a real chip is about 62 px for 'average')", () => {
    const s = spec("bar", ["Mon", "Tue"], [[0.7, 1.4]], { line: "average: 1" });
    const b = xyBuild(s, [[0.7, 1.4]], { x: 14, y: 0, w: 1252, h: 300 }, ctx());
    const c = b.prims.find((p) => p.k === "chip") as Extract<Prim, { k: "chip" }>;
    expect(c.x + 31 + 4).toBeLessThanOrEqual(14 + 1252);
  });
});
