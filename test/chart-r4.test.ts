// Round four of the chart core review: the reviewer's exact inputs. Distinct long names stay distinct, the schema pass is charged by
// the keys it walks, a zone with a second offset gets whole wall minutes, and every schema problem of every step is reported.
import { describe, expect, test } from "bun:test";
import { parse, check } from "../src/index";
import { Budget, withBudget } from "../src/core/budget";
import { chart11Check } from "../src/core/chart11";
import { ticksEvery } from "../src/core/pagecharts";
import { partsOf, MIN } from "../src/core/chart-time";

const BIG = { steps: 1e9, values: 1e9, chars: 1e9 };
const charges = (f: () => void) => { const b = new Budget(BIG, BIG); withBudget(b, f); return b.steps + b.values + b.chars; };
const run = (src: string) => check(parse("```chart\n" + src + "\n```\n", { path: "a.dh.md" })).filter((i: any) => i.level === "error").map((i: any) => i.message);

describe("A: long names that differ only at the end stay distinct", () => {
  test("a step naming 11 missing series of 60 a's and a number shows 10 and 'and 1 more'", () => {
    const d: any = { kind: "line", x: ["a"], series: [{ name: "s", data: [1] }], steps: [{ title: "a", series: Array.from({ length: 11 }, (_, i) => ({ name: "a".repeat(60) + i, data: [2] })) }, { title: "b" }] };
    const e = withBudget(new Budget(BIG, BIG), () => chart11Check(d).errors).filter((m) => m.startsWith("step 1:"));
    expect(e.filter((m) => /is not in the chart \(entry \d+\); add/.test(m))).toHaveLength(10);
    expect(new Set(e).size).toBe(e.length);
    expect(e[e.length - 1]).toBe("step 1: and 1 more series are not in the chart");
  });
});

describe("C: the schema pass is charged by the keys it walks, and not run twice", () => {
  test("one series with 1,000 extra keys costs more than a clean one", () => {
    const mk = (extra: number) => { const s: any = { name: "s", data: [1] }; for (let i = 0; i < extra; i++) s["k" + i] = i; return { kind: "line", x: ["a"], series: [s], steps: [{ title: "a" }, { title: "b" }] }; };
    const clean = charges(() => chart11Check(mk(0))), dirty = charges(() => chart11Check(mk(1_000)));
    expect(dirty - clean).toBeGreaterThan(6_000); // 1,000 keys: about 4,250 before the schema pass was charged by its keys, about 8,250 after
  });
  test("doccheck reuses the first schema result: no problem is said twice", () => {
    const e = run(`kind: line\nx: [a]\ny: { scale: typo }\nseries:\n  - { name: s, data: [1] }\nsteps:\n  - title: one\n  - title: two\n`);
    expect(e.filter((m) => /y\.scale/.test(m))).toHaveLength(1);
  });
});

describe("D: a zone whose own offset has seconds", () => {
  test("Europe/Paris in 1900 (+00:09:21): 00:00:39Z to 00:05:39Z is 6 ticks at local :00", () => {
    const min = Date.parse("1900-01-01T00:00:39Z"), max = Date.parse("1900-01-01T00:05:39Z");
    const t = ticksEvery(min, max, "minute", 1, "Europe/Paris");
    expect(t).toHaveLength(6);
    for (const x of t) { const p = partsOf(x, "Europe/Paris"); expect(p.s).toBe(0); }
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBe(MIN);
  });
});

describe("E: every schema problem of every step", () => {
  test("step 1 with a typo scale and a missing series says both", () => {
    const e = run(`kind: line\nx: [a]\ny: { scale: typo }\nseries:\n  - { name: s, data: [1] }\nsteps:\n  - title: one\n    series: [{ name: nope, data: [1] }]\n  - title: two\n`).join("\n");
    expect(e).toMatch(/not in the chart/);
    expect(e).toMatch(/chart: y\.scale must be linear or log/); // step 1's own, not only the copy a later step carries
  });
  test("an annotation problem and a typo scale are both said", () => {
    const e = run(`kind: line\nx: [a, b]\ny: { scale: typo }\nseries:\n  - { name: s, data: [1, 2] }\nannotations:\n  - { at: nowhere }\nsteps:\n  - title: one\n  - title: two\n`).join("\n");
    expect(e).toMatch(/annotation 1/);
    expect(e).toMatch(/y\.scale must be linear or log/);
  });
  test("scale typo, linear, typo over three steps: step 1 and step 3 both", () => {
    const e = run(`kind: line\nx: [a]\ny: { scale: typo }\nseries:\n  - { name: s, data: [1] }\nsteps:\n  - title: one\n  - title: two\n    y: { scale: linear }\n  - title: three\n    y: { scale: typo }\n`).join("\n");
    expect(e).toMatch(/y\.scale must be linear or log/);
    expect(e).toMatch(/step 3: .*y\.scale/);
  });
  test("a chart with very many problems says 20 and how many more", () => {
    const steps = Array.from({ length: 30 }, (_, i) => `  - title: t${i}\n    series: [{ name: s, bogus${i}: 1 }]`).join("\n");
    const e = withBudget(new Budget(BIG, BIG), () => chart11Check(Bun.YAML.parse(`kind: line\nx: [a]\nseries:\n  - { name: s, data: [1] }\nsteps:\n${steps}\n`) as any).errors);
    expect(e.length).toBeLessThanOrEqual(21);
    expect(e[e.length - 1]).toMatch(/^and \d+ more problems/);
  });
});
