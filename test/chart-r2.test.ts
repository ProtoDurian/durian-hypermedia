// Round two of the chart core review: a series look-up per name, points counted before they are scanned, the schema check of
// every step charged and independent of another step's data error, minute ticks on a clock-change day, a bound warning per step.
import { describe, expect, test } from "bun:test";
import { parse, check } from "../src/index";
import { Budget, withBudget } from "../src/core/budget";
import { LIMITS } from "../src/safety";
import { chart11Check } from "../src/core/chart11";
import { parseTime, partsOf, MIN, HOUR } from "../src/core/chart-time";
import { ticksEvery } from "../src/core/pagecharts";

const BIG = { steps: 1e9, values: 1e9, chars: 1e9 };
const charges = (f: () => void) => { const b = new Budget(BIG, BIG); withBudget(b, f); return b.steps + b.values + b.chars; };
const run = (src: string) => { const doc = parse("```chart\n" + src + "\n```\n", { path: "a.dh.md" }); const all = check(doc); return { errors: all.filter((i: any) => i.level === "error").map((i: any) => i.message), warnings: all.filter((i: any) => i.level === "warning").map((i: any) => i.message) }; };

describe("A: a step finds its series by name through one map", () => {
  test("a step that adds m series reads the names about m times, not m squared", () => {
    const reads = (m: number) => {
      let n = 0;
      const named = (i: number) => ({ get name() { n++; return "n" + i; }, data: [1] });
      const d: any = { kind: "line", x: ["a"], series: [{ name: "s", data: [1] }], steps: [{ title: "a", series: Array.from({ length: m }, (_, i) => ({ ...named(i), add: true })) }, { title: "b" }] };
      // the step's own entries are spread (add: true), so name is read once at the spread; count the reads on the chart's series instead
      d.steps[0].series = Array.from({ length: m }, (_, i) => Object.defineProperty({ add: true, data: [1] }, "name", { get() { n++; return "n" + i; }, enumerable: true }));
      withBudget(new Budget(BIG, BIG), () => chart11Check(d));
      return n;
    };
    const a = reads(100), b = reads(200);
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeLessThan(2.6);
    expect(a).toBeLessThan(100 * 12);
  });
});

describe("B: the points are counted before they are scanned", () => {
  test("a time chart with more points than the cap reads almost none of them", () => {
    let reads = 0;
    const data = (s: number) => new Proxy(Array.from({ length: 3_000 }, (_, i) => [new Date(Date.UTC(2026, 0, 1) + (s * 10_000 + i) * 3_600_000).toISOString().slice(0, 16), i]), {
      get(t, k, r) { if (typeof k === "string" && k.length > 0 && k.charCodeAt(0) >= 48 && k.charCodeAt(0) <= 57) reads++; return Reflect.get(t, k, r); },
    });
    const d = { kind: "line", x: { scale: "time" }, series: [{ name: "a", data: data(0) }, { name: "b", data: data(1) }] };
    const e = withBudget(new Budget(BIG, BIG), () => chart11Check(d).errors.join());
    expect(e).toMatch(/6000 points together/);
    expect(reads).toBeLessThan(100);
  });
});

describe("C and E: every step's schema is checked, charged, and not hidden by another step", () => {
  const base = `kind: line\nx: [a, b, c]\nseries:\n  - { name: s, data: [1, 2, 3] }\n`;
  test("a step 2 data error and a step 3 typo are both reported", () => {
    const e = run(base + `steps:\n  - title: one\n  - title: two\n    series: [{ name: s, data: [1, 2] }]\n  - title: three\n    y: { scale: typo }\n`).errors.join("\n");
    expect(e).toMatch(/step 2: /);
    expect(e).toMatch(/step 3: .*scale/);
  });
  test("the schema traversal of the steps is charged by the number of series", () => {
    const mk = (series: number) => ({ kind: "line", x: ["a"], series: Array.from({ length: series }, (_, i) => ({ name: "s" + i, data: [1] })), steps: Array.from({ length: 10 }, (_, i) => ({ title: "t" + i })) });
    const a = charges(() => chart11Check(mk(20))), b = charges(() => chart11Check(mk(40)));
    expect(b / a).toBeGreaterThan(1.5);
    expect(b / a).toBeLessThan(2.4);
    expect(charges(() => chart11Check(mk(40)))).toBeGreaterThan(3_400); // 10 steps of 40 series: the schema pass adds about 100 per step to the 2,900 the rest charges
  });
});

describe("D: minute and hour ticks on a clock-change day", () => {
  const at = (s: string, tz: string) => parseTime(s, tz)!;
  const minutes = (from: string, to: string, tz: string, every: number) => {
    const min = at(from, tz), max = at(to, tz), t = ticksEvery(min, max, "minute", every, tz);
    expect(t[0]).toBeGreaterThanOrEqual(min);
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBe(every * MIN); // neither a skipped nor a repeated minute
    expect(t[t.length - 1] + every * MIN).toBeGreaterThan(max); // the tail is there
    expect(t.length).toBe(Math.floor((max - t[0]) / (every * MIN)) + 1);
    return t;
  };
  test("Paris and Los Angeles, spring and fall: every real minute is a tick, the tail included", () => {
    expect(minutes("2026-03-29T01:30", "2026-03-29T04:10", "Europe/Paris", 1)).toHaveLength(101);
    expect(minutes("2026-10-25T02:00", "2026-10-25T04:10", "Europe/Paris", 1).length).toBeGreaterThan(150);
    expect(minutes("2026-03-08T01:30", "2026-03-08T04:10", "America/Los_Angeles", 1)).toHaveLength(101);
    expect(minutes("2026-11-01T01:00", "2026-11-01T03:10", "America/Los_Angeles", 1).length).toBeGreaterThan(150);
    minutes("2026-03-29T00:00", "2026-03-29T05:00", "Europe/Paris", 5);
  });
  test("hours stay on the wall clock: 06:00 is a tick after each change, none repeats", () => {
    for (const [from, to, tz] of [["2026-03-29T00:00", "2026-03-29T06:00", "Europe/Paris"], ["2026-10-25T00:00", "2026-10-25T06:00", "Europe/Paris"], ["2026-03-08T00:00", "2026-03-08T06:00", "America/Los_Angeles"], ["2026-11-01T00:00", "2026-11-01T06:00", "America/Los_Angeles"]]) {
      const t = ticksEvery(at(from, tz), at(to, tz), "hour", 1, tz);
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
      expect(t[t.length - 1]).toBe(at(to, tz));
      expect(partsOf(t[t.length - 1], tz).h).toBe(6);
    }
    expect(HOUR).toBe(3_600_000);
  });
});

describe("F: a time bound outside the data warns for the step it happens in", () => {
  test("step 2 replaces the data with times before x.min", () => {
    const src = `kind: line\nx: { scale: time, min: 2026-12-01 }\nseries:\n  - { name: p, data: [["2026-12-01", 1], ["2026-12-02", 2]] }\nsteps:\n  - title: one\n  - title: two\n    series: [{ name: p, data: [["2026-11-01", 1], ["2026-11-02", 2]] }]\n`;
    const w = chart11Check(JSON.parse(JSON.stringify(Bun.YAML.parse(src)))).warnings.join("\n");
    expect(w).toMatch(/step 2: x\.min .* is after the last time in the data/);
    expect(chart11Check(Bun.YAML.parse(src.replace("min: 2026-12-01", "min: 2026-11-01")) as any).warnings.join("\n")).not.toMatch(/step 1: |^x\.min/);
  });
});
