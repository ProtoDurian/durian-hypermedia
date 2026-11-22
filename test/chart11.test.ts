// Chart steps, the time axis, annotations, value formats and heatmaps on the core chart part: the time library, parse, the
// LLM view, every refusal, the caps, the budget, and the config the browser hands Chart.js.
import { describe, expect, test } from "bun:test";
import { parse, check } from "../src/index";
import { Budget, BudgetError, pageBudget, withBudget } from "../src/core/budget";
import { LIMITS, UNTRUSTED_LIMITS } from "../src/safety";
import { ticksEvery, MAX_TICKS } from "../src/core/pagecharts";
import { specAt, chart11Check, chartTable11, evalChart11, fmtValue, durationText, bytesText, unitOf } from "../src/core/chart11";
import { parseTime, fmtTime, timeTicks, startOf, add, partsOf, isDateOnly, MIN, HOUR, DAY } from "../src/core/chart-time";
import { installTimeAdapter, TIME_FORMATS } from "../src/ui/chart-time-adapter";
import { heatRamp, mix, parseColour, chartConfig11 } from "../src/ui/chart-config11";

const yaml = (s: string) => Bun.YAML.parse(s) as any;
const fresh = () => {};
/** run fn with a page budget this small (steps, values) */
const tiny = <T,>(steps: number, values: number, fn: () => T): T => { const l = { steps, values, chars: 1e6 }; return withBudget(new Budget(l, l), fn); };
describe("time library", () => {
  test("a time without an offset is wall-clock in the zone; with Z it is an instant", () => {
    expect(parseTime("2026-11-20T10:00", "UTC")).toBe(Date.UTC(2026, 10, 20, 10, 0));
    expect(parseTime("2026-11-20T10:00", "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 20, 18, 0)); // PST, UTC-8
    expect(parseTime("2026-07-01T10:00", "America/Los_Angeles")).toBe(Date.UTC(2026, 6, 1, 17, 0)); // PDT, UTC-7
    expect(parseTime("2026-11-20T10:00Z", "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 20, 10, 0));
    expect(parseTime("2026-11-20T10:00+01:00", "UTC")).toBe(Date.UTC(2026, 10, 20, 9, 0));
    expect(parseTime("2026-02-30", "UTC")).toBeNull();
    expect(parseTime("10:00", "UTC")).toBeNull();
    expect(parseTime("tomorrow", "UTC")).toBeNull();
  });
  test("showing an instant in a zone reads back the wall time", () => {
    const t = Date.UTC(2026, 10, 20, 18, 5);
    expect(fmtTime(t, "yyyy-MM-dd HH:mm", "America/Los_Angeles")).toBe("2026-11-20 10:05");
    expect(fmtTime(t, "MMM d", "Asia/Tokyo")).toBe("Nov 21");
    expect(partsOf(t, "America/Los_Angeles").h).toBe(10);
  });
  test("days across a clock change are whole days in the zone", () => {
    const a = parseTime("2026-03-07", "America/Los_Angeles")!, b = add(a, 2, "day", "America/Los_Angeles");
    expect(fmtTime(b, "yyyy-MM-dd HH:mm", "America/Los_Angeles")).toBe("2026-03-09 00:00");
    expect(b - a).toBe(2 * DAY - HOUR); // the 8th of March has 23 hours
    expect(startOf(parseTime("2026-03-08T15:30", "America/Los_Angeles")!, "day", "America/Los_Angeles")).toBe(parseTime("2026-03-08", "America/Los_Angeles")!);
  });
  test("ticks fall on whole units and are few", () => {
    fresh();
    const tz = "America/Los_Angeles";
    const r = timeTicks(parseTime("2026-11-20T10:00", tz)!, parseTime("2026-11-20T12:55", tz)!, tz, 8);
    expect(r.unit === "minute" || r.unit === "hour").toBe(true);
    expect(r.t.length).toBeLessThanOrEqual(8);
    for (const t of r.t) { const p = partsOf(t, tz); expect(p.s).toBe(0); if (r.unit === "hour") expect(p.mi).toBe(0); }
    const y = timeTicks(Date.UTC(2020, 0, 1), Date.UTC(2026, 5, 1), "UTC", 8);
    expect(y.unit).toBe("year");
    for (const t of y.t) expect(partsOf(t).mo).toBe(1);
  });
  test("a time axis charges the page's budget", () => {
    expect(() => tiny(3, 1000, () => timeTicks(0, 10 * DAY, "UTC", 8))).toThrow(BudgetError);
  });
  test("a date alone, and times that are not times (read by a scan)", () => {
    expect(isDateOnly("2026-11-20")).toBe(true);
    expect(isDateOnly("2026-11-20T10:00")).toBe(false);
    expect(parseTime("2026-11-20 10:00:30.5Z", "UTC")).toBe(Date.UTC(2026, 10, 20, 10, 0, 30, 500));
    expect(parseTime("2026-11-20T10:00+0100", "UTC")).toBe(Date.UTC(2026, 10, 20, 9, 0));
    for (const bad of ["2026-11-20T25:00", "2026-13-01", "2026-11-20T10", "2026-11-20x", "2026-11-20T10:00 +", "20261120", "x".repeat(10_000)]) expect(parseTime(bad, "UTC")).toBeNull();
  });
  test("the Chart.js adapter answers with our code and the scale's zone", () => {
    let members: any = null;
    installTimeAdapter({ _date: { override: (m: any) => { members = m; } } } as any);
    const a = { options: { tz: "America/Los_Angeles" } };
    expect(members.formats()).toBe(TIME_FORMATS);
    const t = members.parse.call(a, "2026-11-20T10:00");
    expect(t).toBe(Date.UTC(2026, 10, 20, 18, 0));
    expect(members.format.call(a, t, "HH:mm")).toBe("10:00");
    expect(members.startOf.call(a, t + 7 * MIN, "hour")).toBe(t);
    expect(members.add.call(a, t, 1, "day")).toBe(Date.UTC(2026, 10, 21, 18, 0));
    expect(members.diff.call(a, t + 3 * HOUR, t, "hour")).toBe(3);
  });
});

describe("chart steps", () => {
  const A = `kind: line
title: Requests per second
x: { label: time, values: ["10:00", "10:05", "10:10"] }
series:
  - name: api
    data: [120, 130, 125]
steps:
  - title: A normal morning.
  - title: The deploy doubles the load.
    series:
      - name: api
        data: [120, 130, 260]
  - title: A worker joins.
    series:
      - name: worker
        add: true
        data: [1, 2, 3]`;
  test("valid", () => { fresh(); const c = chart11Check(yaml(A)); expect(c.errors).toEqual([]); });
  test("each step shows its own data, on top of the one before", () => {
    const d = yaml(A);
    expect(evalChart11(d, undefined, 0).series[0].data).toEqual([120, 130, 125]);
    expect(evalChart11(d, undefined, 1).series[0].data).toEqual([120, 130, 260]);
    const e = evalChart11(d, undefined, 2);
    expect(e.series.map((s) => s.name)).toEqual(["api", "worker"]);
    expect(e.series[0].data).toEqual([120, 130, 260]); // step 2's change stays
    expect(e.ext.steps).toBe(3);
    expect(e.ext.stepTitle).toBe("A worker joins.");
  });
  test("the LLM view: the first table, then what each step changed", () => {
    fresh();
    const t = chartTable11(yaml(A))!;
    expect(t).toContain("Step 1: A normal morning.");
    expect(t).toContain("Step 2: The deploy doubles the load.");
    const s2 = t.split("Step 2:")[1].split("Step 3:")[0];
    expect(s2).toContain("| 10:10 | 260 |");
    expect(s2).not.toContain("worker");
    const s3 = t.split("Step 3:")[1];
    expect(s3).toContain("| time | worker |");
    expect(s3).not.toContain("| api |");
  });
  test("refusals", () => {
    fresh();
    const bad = (extra: string, re: RegExp) => { const r = chart11Check(yaml(A.split("steps:")[0] + extra)).errors.join("\n"); expect(r).toMatch(re); };
    bad(`steps:\n  - title: only one\n`, /at least 2/);
    bad(`controls:\n  - slider: n\n    min: 1\n    max: 3\nsteps:\n  - title: a\n  - title: b\n`, /steps or controls, not both/);
    bad(`steps:\n  - title: a\n  - title: b\n    series:\n      - name: nope\n        data: [1, 2, 3]\n`, /series "nope" is not in the chart.*add: true/);
    bad(`steps:\n  - title: a\n  - title: b\n    series:\n      - name: api\n        data: [1, 2]\n`, /step 2: series "api" has 2 values, x has 3/);
    bad(`steps:\n  - title: a\n  - title: b\n    colour: red\n`, /unknown key "colour"/);
    bad(`steps:\n  - title: a\n  - title: b\n    series:\n      - name: api\n        add: true\n        data: [1, 2, 3]\n`, /already exists/);
  });
  test("a cap on the number of steps", () => {
    fresh();
    const steps = Array.from({ length: 41 }, (_, i) => `  - title: s${i}`).join("\n");
    expect(chart11Check(yaml(A.split("steps:")[0] + "steps:\n" + steps)).errors.join()).toMatch(/at most 40 steps/);
  });
});

describe("chart time axis, annotations, formats", () => {
  const T = (extra = "", head = "x: { scale: time }") => `kind: line
title: Latency
${head}
y: { label: ms, format: duration-ms }
tz: America/Los_Angeles
series:
  - name: p95
    data: [["2026-11-20T10:00", 120], ["2026-11-20T10:05", 130], ["2026-11-20T10:10", 410], ["2026-11-20T10:15", 150]]
${extra}`;
  const ANN = `annotations:
  - at: 2026-11-20T10:08
    label: Deploy v1.4
    text: Moved sessions to the new cache.
    tone: acc
  - from: 2026-11-20T10:09
    to: 2026-11-20T10:13
    label: Incident 42
    tone: bad
  - y: 300
    label: SLO
    tone: warn
    fill: above
`;
  test("points become a table; annotations are read back in order", () => {
    fresh();
    const d = yaml(T(ANN));
    expect(chart11Check(d).errors).toEqual([]);
    const e = evalChart11(d);
    expect(e.error).toBeUndefined();
    expect(e.ext.time).toBe(true);
    expect(e.ext.timesMs.length).toBe(4);
    expect(e.ext.anns.map((a) => a.kind)).toEqual(["event", "range", "threshold"]);
    expect(e.ext.anns[0].from).toBe(Date.UTC(2026, 10, 20, 18, 8)); // 10:08 in Los Angeles
    const t = chartTable11(d)!;
    expect(t).toContain("Time axis, shown in America/Los_Angeles.");
    expect(t).toContain("| time | p95 (ms) |");
    expect(t).toContain("- 2026-11-20 10:08 Deploy v1.4 (event): Moved sessions to the new cache.");
    expect(t).toContain("- 2026-11-20 10:09 to 10:13 Incident 42 (range)");
    expect(t).toContain("- y = 300 SLO (threshold; above it is marked)");
  });
  test("values on a time axis, in order", () => {
    fresh();
    const v = `kind: bar\nx: { scale: time, values: ["2026-11-18", "2026-11-19", "2026-11-20"] }\nseries:\n  - name: n\n    data: [1, 2, 3]\n`;
    expect(chart11Check(yaml(v)).errors).toEqual([]);
    expect(chart11Check(yaml(v.replace('"2026-11-19", "2026-11-20"', '"2026-11-17", "2026-11-20"'))).errors.join()).toMatch(/is not after the one before it/);
    expect(chart11Check(yaml(v.replace('"2026-11-19"', '"yesterday"'))).errors.join()).toMatch(/not an ISO time/);
  });
  test("time axis refusals", () => {
    fresh();
    expect(chart11Check(yaml(T("", "x: { scale: time, values: [a] }"))).errors.join()).toMatch(/not both/);
    expect(chart11Check(yaml(T().replace("tz: America/Los_Angeles", "tz: Mars/Olympus"))).errors.join()).toMatch(/IANA zone/);
    expect(chart11Check(yaml(`kind: scatter\nx: { scale: time }\nseries:\n  - name: a\n    data: [[1, 2]]\n`)).errors.join()).toMatch(/scatter chart's x is a number/);
    expect(chart11Check(yaml(T().replace("2026-11-20T10:05", "tea time"))).errors.join()).toMatch(/not an ISO time/);
  });
  test("annotation refusals, one each", () => {
    fresh();
    const one = (a: string) => chart11Check(yaml(T(`annotations:\n${a}`))).errors.join("\n");
    expect(one(`  - label: none\n`)).toMatch(/needs one of at/);
    expect(one(`  - at: 2026-11-20T10:08\n    y: 5\n`)).toMatch(/more than one of at/);
    expect(one(`  - at: 2026-11-20T09:00\n`)).toMatch(/outside the x axis/);
    expect(one(`  - at: 2026-11-20T10:30\n`)).toMatch(/outside the x axis/);
    expect(one(`  - from: 2026-11-20T10:12\n    to: 2026-11-20T10:09\n`)).toMatch(/from .* is after to/);
    expect(one(`  - at: 2026-11-20T10:08\n    tone: purple\n`)).toMatch(/tone must be/);
    expect(one(`  - y: 5\n    axis: y2\n`)).toMatch(/axis: y2 needs a second axis/);
    expect(one(`  - y: 5\n    fill: left\n`)).toMatch(/fill must be above or below/);
    expect(one(`  - at: 2026-11-20T10:08\n    colour: red\n`)).toMatch(/unknown key "colour"/);
    expect(chart11Check(yaml(`kind: pie\nx: [a, b]\nseries:\n  - name: s\n    data: [1, 2]\nannotations:\n  - y: 1\n`)).errors.join()).toMatch(/annotations are drawn on kind/);
    expect(chart11Check(yaml(T(ANN).replace("kind: line", "kind: bar\nhorizontal: true"))).errors.join()).toMatch(/horizontal/);
  });
  test("a label over 40 characters is a warning, not a refusal", () => {
    fresh();
    const c = chart11Check(yaml(T(`annotations:\n  - at: 2026-11-20T10:08\n    label: ${"long ".repeat(10)}\n`)));
    expect(c.errors).toEqual([]);
    expect(c.warnings.join()).toMatch(/is 49 characters; keep it to 40/);
  });
  test("a category axis names its x value", () => {
    fresh();
    const c = `kind: line\nx: ["10:00", "10:05", "10:10"]\nseries:\n  - name: a\n    data: [1, 2, 3]\nannotations:\n  - at: "10:05"\n    label: deploy\n`;
    expect(chart11Check(yaml(c)).errors).toEqual([]);
    expect(evalChart11(yaml(c)).ext.anns[0].from).toBe(1);
    expect(chart11Check(yaml(c.replace('"10:05"\n    label', '"11:00"\n    label'))).errors.join()).toMatch(/is not one of the x values/);
  });
  test("formats", () => {
    expect(fmtValue(12, "percent")).toBe("12%");
    expect(fmtValue(12.5, "percent")).toBe("12.5%");
    expect(fmtValue(1234.5, "money", "EUR")).toBe("€1,234.50");
    expect(fmtValue(18900, "money", "USD")).toBe("$18,900");
    expect(fmtValue(410, "duration-ms")).toBe("410 ms");
    expect(fmtValue(1500, "duration-ms")).toBe("1.5s");
    expect(durationText(90)).toBe("1m 30s");
    expect(durationText(3700)).toBe("1h 1m");
    expect(durationText(0.4)).toBe("400 ms");
    expect(bytesText(2048)).toBe("2 KiB");
    expect(bytesText(520_000_000)).toBe("495.9 MiB");
    expect(fmtValue(1200, "number")).toBe("1,200");
    expect(unitOf({ format: "duration-ms" })).toBe("ms");
    expect(unitOf({ format: "money", currency: "EUR" })).toBe("EUR");
  });
  test("format refusals and the unit in the table header", () => {
    fresh();
    expect(chart11Check(yaml(T().replace("duration-ms", "furlongs"))).errors.join()).toMatch(/format must be one of/);
    expect(chart11Check(yaml(T().replace("format: duration-ms", "currency: EUR"))).errors.join()).toMatch(/currency goes with format: money/);
    expect(chart11Check(yaml(T().replace("format: duration-ms", "format: money, currency: euro"))).errors.join()).toMatch(/ISO 4217/);
    expect(chart11Check(yaml(`kind: bar\nx: { format: bytes, values: [a] }\nseries:\n  - name: s\n    data: [1]\n`)).errors.join()).toMatch(/x.format works on a scatter/);
    expect(chartTable11(yaml(`kind: bar\nx: [a, b]\ny: { format: money, currency: EUR }\nseries:\n  - name: cost\n    data: [1, 2]\n`))).toContain("| cost (EUR) |");
  });
  test("budget: a chart with annotations and a time axis charges the page", () => {
    expect(tiny(5, 1000, () => chart11Check(yaml(T(ANN))).errors.join())).toMatch(/too much work|too many values/);
  });
  test("the reader's evaluation is its own part budget, drawn from nothing when there is no page", () => {
    for (let i = 0; i < 20; i++) expect(evalChart11(yaml(T(ANN)), undefined, 0).error).toBeUndefined();
  });
  test("a time chart's config uses a time scale, the zone, formats and the annotation plugin", () => {
    fresh();
    const d = yaml(T(ANN)), e = evalChart11(d);
    const tok = (n: string) => ({ "--font-sans": "sans", "--muted": "#444", "--grid": "#eee" } as any)[n] ?? "#888";
    const cfg = chartConfig11(d, e, { tok, narrow: false, reduce: true }, 150_000);
    expect(cfg.options.scales.x.type).toBe("time");
    expect(cfg.options.scales.x.adapters.date.tz).toBe("America/Los_Angeles");
    expect(cfg.options.scales.y.ticks.callback(410)).toBe("410 ms");
    expect(cfg.plugins.some((p: any) => p.id === "dhAnn")).toBe(true);
    expect(cfg.data.datasets[0].spanGaps).toBe(true);
  });
});

describe("heatmap", () => {
  const H = `kind: heatmap
title: Errors
x: { label: hour, values: ["00", "04", "08"] }
y: { label: day, values: [Mon, Tue] }
series:
  - name: errors
    data:
      - [0, 1, 4]
      - [null, 2, 12]
`;
  test("valid, with a null cell, and the LLM table has the y values down", () => {
    fresh();
    expect(chart11Check(yaml(H)).errors).toEqual([]);
    const t = chartTable11(yaml(H))!;
    expect(t).toContain("| day \\ hour | 00 | 04 | 08 |");
    expect(t).toContain("| Tue |  | 2 | 12 |");
    const e = evalChart11(yaml(H));
    expect(e.series.map((s) => s.name)).toEqual(["Mon", "Tue"]);
  });
  test("refusals", () => {
    fresh();
    const bad = (s: string, re: RegExp) => expect(chart11Check(yaml(s)).errors.join("\n")).toMatch(re);
    bad(H.replace("[Mon, Tue]", "[Mon, Tue, Wed]"), /one row of data per y value: y has 3, data has 2 rows/);
    bad(H.replace("[0, 1, 4]", "[0, 1]"), /row 1 \(Mon\) has 2 values, x has 3/);
    bad(H + "  - name: more\n    data: [[1, 2, 3], [4, 5, 6]]\n", /draws one series; this one has 2/);
    bad(H + "stacked: true\n", /takes no stacked/);
    bad(H + "horizontal: true\n", /takes no horizontal/);
    bad(H + "annotations:\n  - y: 1\n", /no annotations/);
    bad(H.replace("y: { label: day, values: [Mon, Tue] }", "y: { label: day }"), /needs y.values/);
    expect(evalChart11(yaml(H.replace("[0, 1, 4]", "[0, a, 4]"))).error).toMatch(/not a number/);
  });
  test("a cap on the cells and a charge for them", () => {
    expect(tiny(5, 100, () => chart11Check(yaml(H)).errors.join())).toMatch(/too much work|too many values/);
    fresh();
    const big = `kind: heatmap\nx: { values: [${Array.from({ length: 150 }, (_, i) => i).join(",")}] }\ny: { values: [${Array.from({ length: 100 }, (_, i) => `r${i}`).join(",")}] }\nseries:\n  - name: v\n    data: [${Array.from({ length: 100 }, () => `[${Array.from({ length: 150 }, () => 1).join(",")}]`).join(",")}]\n`;
    expect(chart11Check(yaml(big)).errors.join()).toMatch(/at most 10000 cells/);
  });
  test("the ramp runs from lo to hi, and two-sided around diverge", () => {
    const tok = (n: string) => ({ "--heat-lo": "#ffffff", "--heat-hi": "#0000ff", "--heat-mid": "#ffffff", "--heat-neg": "#ff0000" } as any)[n];
    const r = heatRamp(tok, undefined, undefined, 0, 10);
    expect(parseColour(r(0).fill)).toEqual([255, 255, 255]);
    expect(parseColour(r(10).fill)).toEqual([0, 0, 255]);
    const m = parseColour(r(5).fill); expect(m[0]).toBeGreaterThan(0); expect(m[0]).toBeLessThan(255);
    const d = heatRamp(tok, undefined, 0, -10, 10);
    expect(parseColour(d(-10).fill)).toEqual([255, 0, 0]);
    expect(parseColour(d(0).fill)).toEqual([255, 255, 255]);
    expect(parseColour(d(10).fill)).toEqual([0, 0, 255]);
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)[0]).toBeGreaterThan(90);
  });
});

const BIG = { steps: 1e9, values: 1e9, chars: 1e9 };
const withLimits = <T,>(l: Partial<typeof LIMITS>, fn: () => T): T => { const b = new Budget(BIG, BIG); b.lim = { ...LIMITS, ...l }; return withBudget(b, fn); };
/** what a call charges, in steps and values and chars together */
const charges = (f: () => void) => { const b = new Budget(BIG, BIG); withBudget(b, f); return b.steps + b.values + b.chars; };
const hour = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString().slice(0, 16);

describe("caps and work", () => {
  test("the five new caps are lower for text nobody reviewed, and the heat cap fits under the point limit", () => {
    for (const k of ["maxChartAnnotations", "maxChartSteps", "maxChartHeatCells", "maxCalcRows", "maxCalcInputs"] as const) {
      expect(Number.isInteger(LIMITS[k]) && LIMITS[k] > 0).toBe(true);
      expect(UNTRUSTED_LIMITS[k]).toBeLessThan(LIMITS[k]);
    }
    expect(UNTRUSTED_LIMITS.maxChartHeatCells).toBe(2_500);
  });
  test("a host's lower caps are read when the chart is checked", () => {
    const steps = Array.from({ length: 6 }, (_, i) => `  - title: s${i}`).join("\n");
    const src = `kind: line\nx: [a, b]\nseries:\n  - { name: s, data: [1, 2] }\nsteps:\n${steps}`;
    expect(chart11Check(yaml(src)).errors).toEqual([]);
    expect(withLimits({ maxChartSteps: 5 }, () => chart11Check(yaml(src)).errors.join())).toMatch(/at most 5 steps/);
  });
  test("annotations and a time axis: twice the input costs about twice, on the whole path", () => {
    const mk = (n: number) => yaml(`kind: line\nx: { scale: time, values: [${Array.from({ length: n }, (_, i) => `"${hour(i)}"`).join(", ")}] }\nseries:\n  - { name: s, data: [${Array.from({ length: n }, (_, i) => i).join(", ")}] }\nannotations:\n${Array.from({ length: 20 }, () => "  - { y: 5 }").join("\n")}`);
    for (const n of [200, 400]) expect(chart11Check(mk(n)).errors).toEqual([]); // the full path runs: no early error
    const a = charges(() => chart11Check(mk(200))), b = charges(() => chart11Check(mk(400)));
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeGreaterThan(1.5);
    expect(b / a).toBeLessThan(2.4);
  });
  const stepped = (n: number) => yaml(`kind: line\nx: [a, b, c]\nseries:\n  - { name: s, data: [1, 2, 3] }\n  - { name: t, data: [3, 2, 1] }\nsteps:\n${Array.from({ length: n }, (_, i) => `  - { title: s${i}, series: [{ name: s, data: [${i}, 2, 3] }] }`).join("\n")}`);
  test("steps: n steps and 2n steps cost about n and 2n (each step is built from the one before, once)", () => {
    for (const n of [10, 20]) expect(chart11Check(stepped(n)).errors).toEqual([]);
    const a = charges(() => chart11Check(stepped(10))), b = charges(() => chart11Check(stepped(20)));
    expect(b / a).toBeGreaterThan(1.6);
    expect(b / a).toBeLessThan(2.4);
    const c = charges(() => chart11Check(stepped(10))), e = charges(() => { for (let k = 0; k < 10; k++) evalChart11(stepped(10), undefined, k); });
    expect(e / c).toBeLessThan(25); // the reader's replays are bounded by the cap
  });
  test("steps past the cap are refused without reading them, in the check and for the reader", () => {
    const over = stepped(5_000);
    const err = withLimits({ maxChartSteps: 40 }, () => chart11Check(over).errors.join());
    expect(err).toMatch(/at most 40 steps/);
    const small = charges(() => withLimits({ maxChartSteps: 40 }, () => chart11Check(over)));
    const ok = charges(() => chart11Check(stepped(40)));
    expect(small).toBeLessThan(ok * 3);
    const r = withLimits({ maxChartSteps: 40 }, () => evalChart11(over, undefined, 4_000));
    expect(r.error).toMatch(/at most 40 steps/);
  });
  test("a time table of points: the union is counted before it is built", () => {
    const pts = (s: number, n: number) => Array.from({ length: n }, (_, i) => `[${JSON.stringify(hour(s * 100_000 + i))}, ${i}]`).join(", ");
    const src = (n: number, k: number) => yaml(`kind: line\nx: { scale: time }\nseries:\n${Array.from({ length: k }, (_, s) => `  - { name: s${s}, data: [${pts(s, n)}] }`).join("\n")}`);
    // 2 series of 2,000 points at different times: 4,000 times, 12,000 cells on one axis, past the 5,000 point limit
    const e = chart11Check(src(2_000, 2)).errors.join();
    expect(e).toMatch(/different times/);
    expect(chart11Check(src(2_000, 3)).errors.join()).toMatch(/points together/);
    expect(chart11Check(src(300, 2)).errors).toEqual([]);
    // refused before anything is allocated: the refusal charges far less than building the table would
    const refused = charges(() => chart11Check(src(2_000, 2)));
    const small = charges(() => chart11Check(src(300, 2)));
    expect(refused).toBeLessThan(small * 12);
  });
  test("two points at one time in one series are refused with both points and their values", () => {
    const e = chart11Check(yaml(`kind: line\nx: { scale: time }\nseries:\n  - name: p\n    data: [["2026-11-20T10:00", 1], ["2026-11-20T10:05", 2], ["2026-11-20T10:00", 9]]`)).errors.join();
    expect(e).toMatch(/series "p": points 1 and 3 are both at 2026-11-20T10:00 \(values 1 and 9\)/);
  });
  test("a time min or max beyond the data is a warning", () => {
    const src = (extra: string) => yaml(`kind: line\nx: { scale: time, ${extra} }\nseries:\n  - name: p\n    data: [["2026-12-01", 1], ["2026-12-02", 2]]`);
    const w = chart11Check(src("min: 2026-12-05"));
    expect(w.errors).toEqual([]);
    expect(w.warnings.join()).toMatch(/x\.min 2026-12-05 is after the last time in the data \(2026-12-02\)/);
    expect(chart11Check(src("max: 2026-11-20")).warnings.join()).toMatch(/x\.max .* before the first time/);
    expect(chart11Check(src("min: 2026-12-01")).warnings).toEqual([]);
  });
  test("a heatmap: one rule, the heat cap (4,000 cells pass; 11,000 are refused with the heat cap's words)", () => {
    const heat = (nx: number, ny: number) => `kind: heatmap\nx: { values: [${Array.from({ length: nx }, (_, i) => i).join(",")}] }\ny: { values: [${Array.from({ length: ny }, (_, i) => `r${i}`).join(",")}] }\nseries:\n  - name: v\n    data: [${Array.from({ length: ny }, () => `[${Array.from({ length: nx }, () => 1).join(",")}]`).join(",")}]`;
    const page = (src: string, limits?: any) => parse("```chart\n" + src + "\n```\n", limits ? { limits } : undefined);
    const ok = page(heat(100, 60), { ...LIMITS, maxYamlNodes: 1e6, maxYamlChars: 1e7, maxPageYamlNodes: 1e6, maxPageYamlChars: 1e7 }); // 6,000 cells, over half of the point limit
    expect(ok.problems.filter((p: any) => p.level === "error").map((p: any) => p.message)).toEqual([]);
    expect(ok.blocks[0].type).toBe("chart");
    const big = { ...LIMITS, maxYamlNodes: 1e6, maxYamlChars: 1e7, maxPageYamlNodes: 1e6, maxPageYamlChars: 1e7 };
    expect(chart11Check(yaml(heat(110, 100))).errors.join()).toMatch(/at most 10000 cells/);
    { const lowered = page(heat(60, 50), { ...big, maxChartHeatCells: 2_500 }); expect(check(lowered).filter((i: any) => i.level === "error").map((i: any) => i.message).join()).toMatch(/at most 2500 cells/); } // 3,000 cells: past the lowered cap
    expect(withLimits({ maxChartHeatCells: 2_500 }, () => chart11Check(yaml(heat(60, 50))).errors.join())).toMatch(/at most 2500 cells/);
  });
  test("a heatmap's axis keys: an unknown key is refused with the fix", () => {
    const e = chart11Check(yaml(`kind: heatmap\nx: { lable: hour, values: [a, b] }\ny: { label: day, values: [m] }\nseries:\n  - name: v\n    data: [[1, 2]]`)).errors.join();
    expect(e).toMatch(/heatmap x: unknown key "lable" \(keys: label, values\)/);
  });
});

describe("time: a clock change", () => {
  test("a wall time that happens twice is the earlier one; one that is skipped moves forward by the gap", () => {
    // Europe/Paris, 2026-10-25: 03:00 summer time goes back to 02:00, so 02:30 happens twice (00:30Z, then 01:30Z)
    expect(parseTime("2026-10-25T02:30", "Europe/Paris")).toBe(Date.UTC(2026, 9, 25, 0, 30));
    expect(parseTime("2026-10-25T01:59", "Europe/Paris")).toBe(Date.UTC(2026, 9, 24, 23, 59));
    expect(parseTime("2026-10-25T03:00", "Europe/Paris")).toBe(Date.UTC(2026, 9, 25, 2, 0));
    // 2026-03-29: 02:00 summer time starts, so 02:30 does not exist: it reads as 03:30 (01:30Z)
    expect(parseTime("2026-03-29T02:30", "Europe/Paris")).toBe(Date.UTC(2026, 2, 29, 1, 30));
    expect(parseTime("2026-03-29T01:30", "Europe/Paris")).toBe(Date.UTC(2026, 2, 29, 0, 30));
    // America/Los_Angeles: 2026-11-01 01:30 happens twice (08:30Z first); 2026-03-08 02:30 is skipped
    expect(parseTime("2026-11-01T01:30", "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 1, 8, 30));
    expect(parseTime("2026-03-08T02:30", "America/Los_Angeles")).toBe(Date.UTC(2026, 2, 8, 10, 30));
    // a day with no change in the zone is the offset it has
    expect(parseTime("2026-07-01T12:00", "Europe/Paris")).toBe(Date.UTC(2026, 6, 1, 10, 0));
  });
});

describe("doccheck checks every step", () => {
  const run = (src: string) => { const doc = parse("```chart\n" + src + "\n```\n", { path: "a.dh.md" }); return check(doc).filter((i: any) => i.level === "error").map((i: any) => i.message); };
  test("a mistake in a later step is refused like one in the first chart", () => {
    const base = `kind: line\nx: [a, b]\nseries:\n  - { name: s, data: [1, 2] }\n`;
    expect(run(base + `steps:\n  - title: one\n  - title: two\n`)).toEqual([]);
    expect(run(base + `steps:\n  - title: one\n  - title: two\n    y: { scale: typo }\n`).join()).toMatch(/step 2: .*scale/);
    expect(run(base.replace("y:", "y:") + `y: { scale: typo }\nsteps:\n  - title: one\n  - title: two\n`).join()).toMatch(/scale/);
  });
});

describe("step traversal and ticks are charged", () => {
  const stepped = (n: number) => yaml(`kind: line\nx: [a, b, c]\nseries:\n  - { name: s, data: [1, 2, 3] }\n  - { name: t, data: [3, 2, 1] }\nsteps:\n${Array.from({ length: n }, (_, i) => `  - { title: s${i}, series: [{ name: s, data: [${i}, 2, 3] }] }`).join("\n")}`);
  test("walking the steps charges, and 2n steps cost about twice n steps (not four times)", () => {
    const a = charges(() => specAt(stepped(20), 19)), b = charges(() => specAt(stepped(40), 39));
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeGreaterThan(1.7);
    expect(b / a).toBeLessThan(2.3);
  });
  test("explicit ticks: the iterations are bounded by the tick cap, and the call is charged before it makes them", () => {
    expect(ticksEvery(0, 1e15, "minute", 1, "UTC").length).toBeLessThanOrEqual(MAX_TICKS);
    expect(ticksEvery(0, 1e15, "day", 1, "UTC").length).toBeLessThanOrEqual(MAX_TICKS);
    expect(() => tiny(20, 1000, () => ticksEvery(0, 1e15, "hour", 1, "UTC"))).toThrow(BudgetError);
  });
});
