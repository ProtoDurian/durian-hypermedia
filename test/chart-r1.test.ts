import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { parse, check } from "../src/index";
import { Budget, BudgetError, withBudget } from "../src/core/budget";
import { chart11Check, evalChart11, prepareChart, specAt } from "../src/core/chart11";
import { parseTime, DAY, HOUR } from "../src/core/chart-time";
import { ticksEvery, MAX_TICKS } from "../src/core/pagecharts";
import { LIMITS, UNTRUSTED_LIMITS, type Limits } from "../src/safety";
import { chartSnapshot } from "./legacy/chart-snapshot";
import baseline from "./legacy/chart-base.snap.json";

const basic = () => ({ kind: "line", x: ["a"], series: [{ name: "s", data: [1] }] });
const under = <T,>(limits: Partial<Limits>, f: (b: Budget) => T) => {
  const caps = { steps: 1e9, values: 1e9, chars: 1e9 };
  const b = new Budget(caps, caps); b.lim = { ...LIMITS, ...limits };
  return withBudget(b, () => f(b));
};
const cost = (n: number) => under({ maxChartSteps: 1000 }, b => {
  const d = { ...basic(), steps: Array.from({ length: n }, (_, i) => ({ title: String(i), series: [{ name: "s", data: [i] }] })) };
  expect(chart11Check(d).errors).toEqual([]);
  return b.steps + b.values + b.chars;
});
describe("chart review regressions", () => {
  test("steps are applied once, stop at the cap, and reader evaluation enforces the cap", () => {
    let visits = 0;
    const steps = Array.from({ length: 20 }, () => ({ title: "step", get series() { visits++; return [{ name: "s", data: [2] }]; } }));
    expect(prepareChart({ ...basic(), steps }).errors).toEqual([]);
    expect(visits).toBeLessThanOrEqual(120);
    const bomb = { get title() { throw new Error("visited a step after the cap"); } };
    under({ maxChartSteps: 2 }, () => {
      const d = { ...basic(), steps: [{ title: "one" }, { title: "two" }, bomb] };
      expect(prepareChart(d).errors.join()).toMatch(/at most 2 steps/);
      expect(evalChart11(d, undefined, 2).error).toMatch(/at most 2 steps/);
    });
  });
  test("series lookup and step traversal pay before reading author data", () => {
    const b = new Budget({ steps: 0, values: 1000, chars: 1000 }, { steps: 0, values: 1000, chars: 1000 });
    expect(() => withBudget(b, () => specAt({ ...basic(), steps: [{ title: "a" }, { title: "b" }] }, 1))).toThrow(BudgetError);
  });
  test("sparse time tables refuse union times series before allocating the dense table", () => {
    const d = { kind: "line", x: { scale: "time" }, series: [
      { name: "a", data: [["2026-12-01", 1], ["2026-12-03", 2], ["2026-12-05", 3]] },
      { name: "b", data: [["2026-12-02", 1], ["2026-12-04", 2], ["2026-12-06", 3]] },
    ] };
    under({ maxChartPoints: 10 }, b => {
      expect(chart11Check(d).errors.join()).toMatch(/18.*cells.*10|10.*points.*12/);
      expect(b.values).toBeLessThan(100);
    });
  });
  test("explicit ticks stop at 200 in both paths and charge before date work", () => {
    for (const unit of ["hour", "day"]) expect(ticksEvery(0, 500 * DAY, unit, 1)).toHaveLength(MAX_TICKS);
    const b = new Budget({ steps: 0, values: 1e6, chars: 1e6 }, { steps: 0, values: 1e6, chars: 1e6 });
    expect(() => withBudget(b, () => ticksEvery(0, DAY, "hour", 1, "invalid/zone"))).toThrow(BudgetError);
  });
  test("the five caps are strictly smaller for untrusted text", () => {
    for (const key of ["maxChartSteps", "maxChartAnnotations", "maxChartHeatCells", "maxCalcRows", "maxCalcInputs"] as const)
      expect(UNTRUSTED_LIMITS[key]).toBeLessThan(LIMITS[key]);
    expect(UNTRUSTED_LIMITS.maxChartHeatCells).toBe(2500);
  });
  test("every legacy fixture chart retains baseline doccheck issues and evalChart output", async () => {
    expect(Object.keys(baseline).length).toBeGreaterThan(25);
    expect(await chartSnapshot(resolve("."))).toEqual(baseline);
  });
  test("every later step is schema checked", () => {
    const d = { ...basic(), steps: [{ title: "base" }, { title: "typo", y: { scale: "typo" } }] };
    const doc = parse("```chart\n" + JSON.stringify(d) + "\n```");
    expect(check(doc).some(p => /step 2:.*scale/.test(p.message))).toBe(true);
  });
  test("heatmap axes refuse unknown keys", () => {
    for (const axis of ["x", "y"]) {
      const d: any = { kind: "heatmap", x: { values: ["a"] }, y: { values: ["b"] }, series: [{ name: "s", data: [[1]] }] };
      d[axis].lable = "typo";
      const doc = parse("```chart\n" + JSON.stringify(d) + "\n```");
      expect(check(doc).some(p => new RegExp(axis + ".*unknown key.*lable").test(p.message))).toBe(true);
    }
  });
  test("duplicate instants refuse both values, their positions and their source line", () => {
    const d = { kind: "line", x: { scale: "time" }, series: [{ name: "s", data: [["2026-12-01T00:00Z", 7], ["2026-12-01T01:00+01:00", 9]] }] };
    const doc = parse("\n\n```chart\n" + JSON.stringify(d) + "\n```");
    const issue = check(doc).find(p => /same time|duplicate time|are both at/.test(p.message));
    expect(issue?.line).toBe(3);
    expect(issue?.message).toMatch(/points 1 and 2.*values 7 and 9/);
    expect(evalChart11(d).error).toMatch(/same time|duplicate time|are both at/);
  });
  test("time bounds outside the data warn, including a bound hiding all data", () => {
    const d = { kind: "line", x: { scale: "time", min: "2026-12-05" }, series: [{ name: "s", data: [["2026-12-01", 1], ["2026-12-02", 2]] }] };
    expect(chart11Check(d).warnings.join()).toMatch(/x.min.*after.*data/);
    d.x = { scale: "time", max: "2026-11-30" } as any;
    expect(chart11Check(d).warnings.join()).toMatch(/x.max.*before.*data/);
  });
  test("Paris repeated wall time uses the earlier instant; skipped wall time moves forward", () => {
    expect(parseTime("2026-10-25T02:30", "Europe/Paris")).toBe(Date.UTC(2026, 9, 25, 0, 30));
    expect(parseTime("2026-03-29T02:30", "Europe/Paris")).toBe(Date.UTC(2026, 2, 29, 1, 30));
  });
  test("heatmaps count cells against the heat cap only, with host and untrusted caps", () => {
    const d = { kind: "heatmap", x: { values: Array.from({ length: 100 }, (_, i) => String(i)) },
      y: { values: Array.from({ length: 60 }, (_, i) => "row" + i) },
      series: [{ name: "s", data: Array.from({ length: 60 }, () => Array(100).fill(1)) }] };
    const src = "```chart\n" + JSON.stringify(d) + "\n```\n:::llm\nA table of 6000 measured cells.\n:::\n";
    const yamlCaps = { maxYamlChars: 100000, maxYamlNodes: 20000, maxPageYamlNodes: 40000 };
    const doc = parse(src, { limits: yamlCaps });
    expect(doc.blocks[0].type).toBe("chart");
    expect((doc.blocks[0] as any).initial.error).toBeUndefined();
    expect(check(doc).filter(p => p.level === "error")).toEqual([]);
    const low = parse(src, { limits: { ...yamlCaps, maxChartHeatCells: 5500 } });
    expect(check(low).some(p => /5500 cells/.test(p.message))).toBe(true);
    const strict = parse(src, { limits: { ...UNTRUSTED_LIMITS, ...yamlCaps } });
    expect(check(strict).some(p => /2500 cells/.test(p.message))).toBe(true);
  });
  test("doubling steps costs about twice at three sizes", () => {
    for (const n of [8, 16, 32]) {
      const ratio = cost(2 * n) / cost(n);
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2.3);
    }
  });
});
