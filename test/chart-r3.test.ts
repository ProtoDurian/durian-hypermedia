// Round three of the chart core review: missing step series named once and capped, the schema pass of every step charged,
// one step's schema problem independent of another's, minute ticks inside a repeated hour, a bounds warning that keeps its step.
import { describe, expect, test } from "bun:test";
import { parse, check } from "../src/index";
import { Budget, withBudget } from "../src/core/budget";
import { chart11Check } from "../src/core/chart11";
import { parseTime, MIN } from "../src/core/chart-time";
import { ticksEvery } from "../src/core/pagecharts";

const BIG = { steps: 1e9, values: 1e9, chars: 1e9 };
const charges = (f: () => void) => { const b = new Budget(BIG, BIG); withBudget(b, f); return b.steps + b.values + b.chars; };
const run = (src: string) => { const doc = parse("```chart\n" + src + "\n```\n", { path: "a.dh.md" }); const all = check(doc); return { errors: all.filter((i: any) => i.level === "error").map((i: any) => i.message), warnings: all.filter((i: any) => i.level === "warning").map((i: any) => i.message) }; };

describe("A: names a step does not have", () => {
  test("a step naming 100 missing series reports the first 10 and a count, each with the same short list", () => {
    const d: any = { kind: "line", x: ["a"], series: Array.from({ length: 50 }, (_, i) => ({ name: "s" + i, data: [1] })),
      steps: [{ title: "a", series: Array.from({ length: 100 }, (_, i) => ({ name: "missing" + i, data: [2] })) }, { title: "b" }] };
    const e = withBudget(new Budget(BIG, BIG), () => chart11Check(d).errors);
    const mine = e.filter((m) => m.startsWith("step 1:"));
    expect(mine.length).toBe(11);
    expect(mine.filter((m) => /is not in the chart/.test(m)).length).toBe(10);
    expect(mine[10]).toBe("step 1: and 90 more series are not in the chart");
    expect(mine[0].length).toBeLessThan(400); // the list of the chart's names is cut short
  });
});

describe("C: the schema pass of every step, the first included, is charged", () => {
  test("charges grow with the series, for 2 steps and for 10", () => {
    const mk = (series: number, steps: number) => ({ kind: "line", x: ["a"], series: Array.from({ length: series }, (_, i) => ({ name: "s" + i, data: [1] })), steps: Array.from({ length: steps }, (_, i) => ({ title: "t" + i })) });
    const a = charges(() => chart11Check(mk(40, 2))), b = charges(() => chart11Check(mk(80, 2)));
    expect(b / a).toBeGreaterThan(1.5);
    expect(b / a).toBeLessThan(2.3);
    expect(charges(() => chart11Check(mk(200, 2)))).toBeGreaterThan(3_450); // 200 series, 2 steps: 3,265 without the first step's schema charge, about 3,680 with it
  });
  test("many repeated problems are looked through once each (a set), not once per problem", () => {
    // 300 series with a typo each, in 2 steps: the diagnostics are 300 per step; checking must stay about linear
    const mk = (n: number) => ({ kind: "line", x: ["a"], series: Array.from({ length: n }, (_, i) => ({ name: "s" + i, data: [1], bogus: 1 })), steps: [{ title: "a" }, { title: "b", series: [{ name: "s0", data: [2] }] }] });
    const a = charges(() => chart11Check(mk(150))), b = charges(() => chart11Check(mk(300)));
    expect(b / a).toBeLessThan(2.4);
  });
});
const THRESH_C = 0;

describe("D: minute ticks inside a repeated hour", () => {
  const at = (s: string) => parseTime(s, "UTC")!;
  const window = (from: string, to: string, every = 1) => ticksEvery(at(from), at(to), "minute", every, "UTC");
  test("Paris 2026-10-25 02:05 to 02:10 happens twice: 6 ticks in each", () => {
    const first = ticksEvery(Date.parse("2026-10-25T02:05:00+02:00"), Date.parse("2026-10-25T02:10:00+02:00"), "minute", 1, "Europe/Paris");
    const second = ticksEvery(Date.parse("2026-10-25T02:05:00+01:00"), Date.parse("2026-10-25T02:10:00+01:00"), "minute", 1, "Europe/Paris");
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    expect(second[0] - first[0]).toBe(60 * MIN);
    for (const t of [first, second]) for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBe(MIN);
  });
  test("Los Angeles 2026-11-01 01:05 to 01:10: both occurrences, and aligned fives (01:03 to 01:17 gives :05 :10 :15)", () => {
    expect(ticksEvery(Date.parse("2026-11-01T01:05:00-07:00"), Date.parse("2026-11-01T01:10:00-07:00"), "minute", 1, "America/Los_Angeles")).toHaveLength(6);
    expect(ticksEvery(Date.parse("2026-11-01T01:05:00-08:00"), Date.parse("2026-11-01T01:10:00-08:00"), "minute", 1, "America/Los_Angeles")).toHaveLength(6);
    const t = ticksEvery(Date.parse("2026-11-01T01:03:00-08:00"), Date.parse("2026-11-01T01:17:00-08:00"), "minute", 5, "America/Los_Angeles");
    expect(t).toEqual([Date.parse("2026-11-01T01:05:00-08:00"), Date.parse("2026-11-01T01:10:00-08:00"), Date.parse("2026-11-01T01:15:00-08:00")]);
    expect(window("2026-01-01T00:05", "2026-01-01T00:10")).toHaveLength(6);
  });
});

describe("E: one step's schema problem does not hide another's", () => {
  test("step 1 has a mistyped scale; step 2 fixes it and has a data error: both are reported", () => {
    const src = `kind: line\nx: [a, b, c]\ny: { scale: typo }\nseries:\n  - { name: s, data: [1, 2, 3] }\nsteps:\n  - title: one\n  - title: two\n    y: { scale: linear }\n    series: [{ name: s, data: [1, 2] }]\n`;
    const e = run(src).errors.join("\n");
    expect(e).toMatch(/y\.scale must be linear or log/);
    expect(e).toMatch(/step 2: /);
  });
});

describe("F: a bounds warning keeps its step", () => {
  test("the same warning in step 1 and step 2 is said for both", () => {
    const src = `kind: line\nx: { scale: time, min: 2026-12-05 }\nseries:\n  - { name: p, data: [["2026-12-01", 1], ["2026-12-02", 2]] }\nsteps:\n  - title: one\n  - title: two\n    series: [{ name: p, data: [["2026-12-01", 5], ["2026-12-02", 6]] }]\n`;
    const w = chart11Check(Bun.YAML.parse(src) as any).warnings;
    expect(w.filter((m) => m.startsWith("step 1: x.min")).length).toBe(1);
    expect(w.filter((m) => m.startsWith("step 2: x.min")).length).toBe(1);
  });
});
