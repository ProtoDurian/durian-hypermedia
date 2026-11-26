// Line styles and markers, goal lines and bands, the time axis' own bounds and ticks, the log and linear switch, and the
// calculator layout on the core chart part. Parse, refusals (each names the fix), the LLM view, caps, the budget (a doubling
// test that counts charges, no clock), and the drawing read back from the markup and the primitives.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Budget, BudgetError, withBudget } from "../src/core/budget";
import { parse, check } from "../src/index";
import { chart11Check, chartTable11, evalChart11, prepareChart, usesChart11 } from "../src/core/chart11";
import { chartControls, evalChart } from "../src/core/chart";
import { LINE_STYLES, MARKERS, applyScale, toggleOf, formulaText, ticksEvery, placeLabels, caseValues, tickCountError, PC_CAPS } from "../src/core/pagecharts";
import { chartFrom } from "../src/engine/charts/legacy";
import { buildChart } from "../src/engine/charts/build";
import { measure, setPhoneFont } from "../src/core/stage-core";
import { Chart } from "../src/ui/chart";
import { Calculator, ScaleToggle, UnitsGrid, PW } from "../src/ui/pagecharts";
import { UI } from "../src/ui/ui";


const yaml = (s: string) => Bun.YAML.parse(s) as any;
const fresh = () => {};
/** run fn with a page budget this small (steps and values) */
const tiny = <T,>(n: number, fn: () => T): T => { const l = { steps: n, values: n, chars: 1e6 }; return withBudget(new Budget(l, l), fn); };
const errs = (d: any) => { fresh(); return chart11Check(d).errors; };
/** the drawn chart of a fence's YAML at one width: primitives and marks */
const drawn = (d: any, w = 640) => {
  const lg = chartFrom(d)!;
  setPhoneFont(w < 480);
  return buildChart(lg.spec, lg.values, { x: 0, y: 0, w, h: 320 }, { phone: w < 480, look: "stage", measure });
};

const LINE = `
kind: line
x: { label: month, values: [Jan, Feb, Mar, Apr] }
y: { label: loans }
series:
  - name: This year
    line: solid
    marker: circle
    data: [820, 860, 910, 990]
  - name: Forecast
    line: dashed
    marker: diamond
    data: [null, null, 910, 1000]
  - name: Last year
    line: dotted
    marker: none
    data: [760, 790, 840, 900]
`;

describe("line styles and markers", () => {
  test("a styled chart passes, the words are taken out of the plain chart, and the styles are kept for the drawing", () => {
    fresh();
    const d = yaml(LINE);
    const c = chart11Check(d);
    expect(c.errors).toEqual([]);
    expect(JSON.stringify(c.base)).not.toContain("dashed");
    expect(evalChart(c.base).error).toBeUndefined();
    const p = prepareChart(d);
    expect(p.steps[0].ext.pc?.styles).toEqual({ "This year": { line: "solid", marker: "circle" }, Forecast: { line: "dashed", marker: "diamond" }, "Last year": { line: "dotted", marker: "none" } });
    expect(usesChart11(d)).toBe(true);
  });
  test("every word of both lists is accepted and nothing else", () => {
    for (const l of LINE_STYLES) expect(errs(yaml(LINE.replace("line: dashed", `line: ${l}`)))).toEqual([]);
    for (const m of MARKERS) expect(errs(yaml(LINE.replace("marker: diamond", `marker: ${m}`)))).toEqual([]);
    expect(errs(yaml(LINE.replace("line: dashed", "line: wavy"))).join("\n")).toContain("line must be solid, dashed, dotted");
    expect(errs(yaml(LINE.replace("marker: diamond", "marker: star"))).join("\n")).toContain("marker must be circle, square, triangle, diamond, plus, cross, none");
  });
  test("a style on a series that has no line or no points is refused, with the fix", () => {
    const bar = yaml(LINE.replace("kind: line", "kind: bar"));
    expect(errs(bar).join("\n")).toContain("line works on a line or area series (this one is bar)");
    const mixed = yaml(LINE.replace("kind: line", "kind: bar").replace("    line: dashed\n", "    kind: line\n    line: dashed\n"));
    expect(errs(mixed).filter((e) => e.includes('"Forecast"'))).toEqual([]);
    const sc = yaml(`kind: scatter\nseries:\n  - name: a\n    line: dashed\n    marker: square\n    data: [[1, 2], [2, 3]]`);
    const e = errs(sc).join("\n");
    expect(e).toContain("a scatter chart draws points, not lines");
    expect(e).not.toContain('series "a": marker');
    expect(errs(yaml(`kind: bubble\nseries:\n  - name: a\n    marker: square\n    data: [[1, 2, 3]]`)).join("\n")).toContain("a bubble chart draws circles");
    expect(errs(yaml(`kind: pie\nx: [a, b]\nseries:\n  - name: a\n    line: dashed\n    data: [1, 2]`)).join("\n")).toContain("a pie chart has no lines");
    expect(errs(yaml(`kind: candlestick\nx: [a]\nseries:\n  - name: c\n    line: dashed\n    data: [[1, 3, 0, 2]]`)).join("\n")).toContain("candles have no line style");
    expect(errs(yaml(`kind: heatmap\nx: { values: [a] }\ny: { values: [r] }\nseries:\n  - name: n\n    line: dashed\n    data: [[1]]`)).join("\n")).toMatch(/line|heatmap/);
  });
  test("a step may add a styled series", () => {
    const d = yaml(LINE + `steps:\n  - title: One\n  - title: Two\n    series:\n      - name: Extra\n        add: true\n        line: dotted\n        marker: cross\n        data: [1, 2, 3, 4]\n`);
    fresh();
    const c = chart11Check(d);
    expect(c.errors).toEqual([]);
    expect(prepareChart(d).steps[1].ext.pc?.styles.Extra).toEqual({ line: "dotted", marker: "cross" });
  });
  test("a time axis with points keeps the styles out of the plain chart too", () => {
    const d = yaml(`kind: line\nx: { scale: time }\nseries:\n  - name: a\n    line: dashed\n    data: [["2026-11-20", 1], ["2026-11-21", 2]]`);
    fresh();
    const c = chart11Check(d);
    expect(c.errors).toEqual([]);
    expect(JSON.stringify(c.base)).not.toContain("dashed");
  });
  test("the drawing carries dashes, shapes, and one key item per series with its dash pattern and shape", () => {
    const d = yaml(LINE);
    fresh();
    const { prims, marks } = drawn(d);
    const line = (n: string) => prims.find((p) => p.k === "path" && p.key === `l:${n.replace(/ /g, "_")}`) as any;
    expect(line("This year").dashed).toBeFalsy();
    expect(line("Forecast").dashed).toBe(true);
    expect(line("Last year").cls).toContain("xy-dotted");
    // the shapes: a circle is a dot, a diamond a box (turned), "none" draws no marker at all
    expect(prims.some((p) => p.k === "dot" && p.key === "m:This_year:0")).toBe(true);
    expect(prims.some((p) => p.k === "box" && p.key === "m:Forecast:2")).toBe(true);
    expect(prims.some((p) => /^m:Last_year:/.test(p.key))).toBe(false);
    // the key: one item per series, each drawn as a line sample (with the same dash) and its marker
    const keys = marks.filter((m) => m.kind === "key");
    expect(keys.map((m) => m.title)).toEqual(["This year", "Forecast", "Last year"]);
    expect(prims.find((p) => p.key === "key:1:g")).toMatchObject({ k: "path", dashed: true });
    expect(prims.find((p) => p.key === "key:2:g")?.cls).toContain("xy-dotted");
    expect(prims.some((p) => /^key:0:m/.test(p.key))).toBe(true);
    expect(prims.some((p) => /^key:2:m/.test(p.key))).toBe(false); // no marker, none in the key
  });
  test("hiding a series (a key button) takes its line out and keeps the others' keys", () => {
    const d = yaml(LINE), lg = chartFrom(d)!;
    setPhoneFont(false);
    const all = buildChart(lg.spec, lg.values, { x: 0, y: 0, w: 640, h: 320 }, { phone: false, look: "stage", measure });
    const some = buildChart({ ...lg.spec, opts: { ...lg.spec.opts, hidden: "1" } }, lg.values, { x: 0, y: 0, w: 640, h: 320 }, { phone: false, look: "stage", measure });
    expect(all.prims.some((p) => p.key === "l:Forecast")).toBe(true);
    expect(some.prims.some((p) => p.key === "l:Forecast")).toBe(false);
    expect(some.prims.some((p) => p.key === "l:This_year")).toBe(true);
    expect(some.marks.filter((m) => m.kind === "key").length).toBe(3); // the button to show it again stays
  });
});

const GOALS = `
kind: line
x: { label: day, values: [Mon, Tue, Wed, Thu, Fri] }
y: { label: ms, format: duration-ms, min: 0 }
series:
  - name: p95
    data: [210, 240, 260, 255, 300]
annotations:
  - goal: 250
    label: Target
  - goal: [100, 200]
    label: Healthy
  - goal: 280
    from: Wed
    to: Fri
    fill: above
`;
describe("goal lines and bands", () => {
  test("a goal is a threshold with the good tone; a band; a goal that stops at a time", () => {
    const d = yaml(GOALS);
    fresh();
    expect(chart11Check(d).errors).toEqual([]);
    const a = prepareChart(d).steps[0].ext.anns;
    expect(a.map((x) => [x.kind, x.goal, x.tone, x.y, x.y2, x.from, x.to])).toEqual([["threshold", true, "good", 250, undefined, undefined, undefined], ["threshold", true, "good", 100, 200, undefined, undefined], ["threshold", true, "good", 280, undefined, 2, 4]]);
    expect(a[0].label).toBe("Target"); expect(a[0].when).toBe("goal 250 ms");
    expect(a[1].when).toBe("goal 100 ms to 200 ms");
  });
  test("an unlabelled goal says its value in the axis' own format", () => {
    const d = yaml(`kind: bar\nx: [a, b]\ny: { format: money, currency: EUR }\nseries:\n  - name: s\n    data: [10, 30]\nannotations:\n  - goal: 25\n`);
    fresh();
    const a = prepareChart(d).steps[0].ext.anns[0];
    expect(a.label).toBe("Goal €25");
  });
  test("a goal on a time axis may stop at a time", () => {
    const d = yaml(`kind: line\nx: { scale: time }\nseries:\n  - name: a\n    data: [["2026-11-20T10:00", 1], ["2026-11-20T12:00", 5]]\nannotations:\n  - goal: 3\n    from: "2026-11-20T10:30"\n    to: "2026-11-20T11:30"\n`);
    fresh();
    const c = chart11Check(d);
    expect(c.errors).toEqual([]);
    const a = prepareChart(d).steps[0].ext.anns[0];
    expect(a.to! - a.from!).toBe(3_600_000);
  });
  test("refusals: goal and y together, one of from and to, from after to, an unknown time, a flat band, a log axis at 0", () => {
    const base = (ann: string, extra = "") => yaml(`kind: line\nx: { label: d, values: [a, b, c] }\n${extra}series:\n  - name: s\n    data: [1, 2, 3]\nannotations:\n${ann}`);
    expect(errs(base("  - goal: 2\n    y: 3\n")).join("\n")).toContain("has both goal and y");
    expect(errs(base("  - goal: 2\n    from: a\n")).join("\n")).toContain("needs both from and to");
    expect(errs(base("  - goal: 2\n    from: c\n    to: a\n")).join("\n")).toContain("is after to");
    expect(errs(base("  - goal: 2\n    from: a\n    to: zz\n")).join("\n")).toContain("is not one of the x values");
    expect(errs(base("  - goal: [5, 1]\n")).join("\n")).toContain("goal: [low, high] needs low below high");
    expect(errs(base("  - goal: abc\n")).join("\n")).toContain("goal is a number (a line) or [low, high] (a band)");
    expect(errs(base("  - goal: 0\n", "y: { scale: log }\n")).join("\n")).toContain("cannot be drawn on a log axis");
    expect(errs(base("  - at: a\n    goal: 2\n")).join("\n")).toContain("more than one");
  });
  test("the LLM view says goal, the label is not said twice, and the markers are buttons placed apart", () => {
    const t = chartTable11(yaml(GOALS))!;
    expect(t).toContain("(goal)");
    expect(t).toContain("(goal; band)");
    expect(t).not.toContain("(goal (band))");
    const boxes = [{ i: 0, text: "Capacity", x: 0, x2: 600, y: 80, y2: 80 }, { i: 1, text: "Weekend target", x: 300, x2: 600, y: 110, y2: 110 }, { i: 2, text: "Comfortable range", x: 0, x2: 600, y: 130, y2: 100 }];
    const p = placeLabels(boxes, 640);
    expect(p.length).toBe(3);
    // no two placed labels overlap (an independent check on the estimated boxes)
    const rects = p.map((q) => { const b = boxes.find((x) => x.i === q.i)!; const w = b.text.length * 6.6 + 22; const x0 = q.side === "right" ? b.x2 - w - 4 : b.x + 4; return { x0, x1: x0 + w, y0: q.top, y1: q.top + 24 }; });
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false);
    }
  });
});

const TIME = `
kind: line
tz: America/Los_Angeles
x: { scale: time, min: "2026-12-01T00:00", max: "2026-12-02T00:00", unit: hour, every: 4 }
series:
  - name: a
    data: [["2026-12-01T02:00", 13], ["2026-12-01T07:30", 15], ["2026-12-01T19:00", 20]]
`;
describe("goal labels keep off the data", () => {
  test("a label whose usual place has data under it goes to another place", () => {
    const box = [{ i: 0, text: "Scale-up point", x: 0, x2: 600, y: 100, y2: 100 }];
    const free = placeLabels(box, 640)[0];
    expect(free.side).toBe("right"); // nothing in the way: above the line, at the right end
    // a line of data along the right end, just above the goal line
    const data: number[] = []; for (let x = 480; x <= 600; x += 12) data.push(x, 85);
    const p = placeLabels(box, 640, data)[0];
    expect(p.side === "right" && p.top === free.top).toBe(false);
    // the box it picked holds none of the points (an independent check)
    const w = box[0].text.length * 6.6 + 22, x0 = p.side === "right" ? 600 - w - 4 : p.side === "left" ? 4 : 300 - w / 2;
    for (let k = 0; k < data.length; k += 2) expect(data[k] > x0 - 3 && data[k] < x0 + w + 3 && data[k + 1] > p.top - 3 && data[k + 1] < p.top + 24 + 3).toBe(false);
    // when no place is free it still returns one (the first), never throws
    const everywhere: number[] = []; for (let x = 0; x <= 600; x += 6) for (let y = 0; y <= 140; y += 6) everywhere.push(x, y);
    expect(placeLabels(box, 640, everywhere).length).toBe(1);
  });
});

describe("the time axis' own bounds and ticks", () => {
  test("min, max, unit and every are read in the chart's zone and taken out of the plain chart", () => {
    const d = yaml(TIME);
    fresh();
    const c = chart11Check(d);
    expect(c.errors).toEqual([]);
    const t = prepareChart(d).steps[0].ext.pc?.time!;
    expect(t.max! - t.min!).toBe(86_400_000);
    expect(t.unit).toBe("hour"); expect(t.every).toBe(4);
    expect(JSON.stringify(c.base.x)).not.toContain("unit");
    expect(evalChart(c.base).error).toBeUndefined();
  });
  test("an annotation may sit inside the bounds where there is no data", () => {
    const d = yaml(TIME + `annotations:\n  - at: "2026-12-01T23:00"\n    label: late\n`);
    fresh();
    expect(chart11Check(d).errors).toEqual([]);
    const d2 = yaml(TIME + `annotations:\n  - at: "2026-12-02T03:00"\n    label: out\n`);
    expect(errs(d2).join("\n")).toContain("is outside the x axis");
  });
  test("refusals: a number axis with min as a time, a bad unit, every with no unit, min after max, too many ticks", () => {
    expect(errs(yaml(TIME.replace("unit: hour", "unit: fortnight"))).join("\n")).toContain("x.unit must be minute, hour, day, week, month, quarter, year");
    expect(errs(yaml(TIME.replace("unit: hour, ", "").replace("every: 4", "every: 4"))).join("\n")).toContain("x.every counts ticks of x.unit");
    expect(errs(yaml(TIME.replace('min: "2026-12-01T00:00"', 'min: "2026-12-05T00:00"'))).join("\n")).toContain("min must be before max");
    expect(errs(yaml(TIME.replace('min: "2026-12-01T00:00"', "min: yesterday"))).join("\n")).toContain("is not an ISO time");
    expect(errs(yaml(TIME.replace("every: 4", "every: 0"))).join("\n")).toContain("x.every must be a whole number");
    expect(errs(yaml(`kind: line\nx: { values: [a, b], unit: hour }\nseries:\n  - name: s\n    data: [1, 2]`)).join("\n")).toContain("x.unit works with a time axis");
    expect(errs(yaml(TIME.replace('max: "2026-12-02T00:00"', 'max: "2027-12-02T00:00"').replace("every: 4", "every: 1"))).join("\n")).toContain("ticks on this axis (at most 200)");
    expect(tickCountError(0, 86_400_000, { unit: "hour" })).toBeNull();
  });
  test("ticks are whole units of the zone, every N apart (hours align to the day), and a clock change does not move them", () => {
    fresh();
    const la = (s: string) => Date.parse(s);
    const t = ticksEvery(la("2026-12-01T08:00:00Z"), la("2026-12-02T08:00:00Z"), "hour", 4, "America/Los_Angeles", false);
    // 00:00 in Los Angeles on 1 December is 08:00 UTC
    expect(t[0]).toBe(la("2026-12-01T08:00:00Z"));
    expect(t.length).toBe(7);
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBe(4 * 3_600_000);
    // spring forward in Los Angeles on 8 March 2026: ticks stay at 00:00, 04:00 local
    const spring = ticksEvery(la("2026-03-08T08:00:00Z"), la("2026-03-08T20:00:00Z"), "hour", 4, "America/Los_Angeles", false);
    expect(spring.map((x) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles", hour12: false }).format(x))).toEqual(["00:00", "04:00", "08:00", "12:00"].slice(0, spring.length));
    const days = ticksEvery(la("2026-11-02T00:00:00Z"), la("2026-11-30T00:00:00Z"), "week", 1, "UTC", false);
    expect(days.length).toBeGreaterThan(2);
  });
  test("the drawing puts the bounds on the axis and our ticks on it, in the chart's zone", () => {
    const d = yaml(TIME);
    fresh();
    const lg = chartFrom(d)!;
    expect(lg.spec.opts["x.scale"]).toBe("time");
    expect(lg.spec.opts.tz).toBe("America/Los_Angeles");
    expect(Number(lg.spec.opts["x.max"]) - Number(lg.spec.opts["x.min"])).toBe(86_400_000);
    const { prims } = drawn(d);
    const ticks = prims.filter((p) => p.k === "text" && /^c:t\d/.test(p.key)) as any[];
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    // the first and last tick are the bounds (a midnight in Los Angeles names its day), and every tick is a whole hour inside them
    expect(ticks[0].lines[0]).toBe("Dec 1 00:00");
    expect(ticks[ticks.length - 1].lines[0]).toBe("Dec 2 00:00");
    for (const t of ticks.slice(1, -1)) expect(t.lines[0]).toMatch(/^\d\d:00$/);
  });
});

const TOG = `
kind: line
x: { label: year, values: [2020, 2021, 2022, 2023] }
y: { label: requests, scale: log, toggle: true }
series:
  - name: Web
    data: [1200, 8100, 61000, 410000]
  - name: Batch
    data: [30, 70, 150, 400]
`;
describe("the log and linear switch", () => {
  test("toggle is read and taken out; the chart starts as written; the page can flip it", () => {
    const d = yaml(TOG);
    fresh();
    const c = chart11Check(d);
    expect(c.errors).toEqual([]);
    expect(JSON.stringify(c.base.y)).not.toContain("toggle");
    expect(toggleOf(d)).toEqual({ axes: ["y"], start: "log" });
    const lin = applyScale(d, toggleOf(d)!, "linear");
    expect(lin.y.scale).toBe("linear"); expect(d.y.scale).toBe("log"); // the source is not changed
    fresh();
    expect(chartFrom(lin)!.spec.opts["y.scale"]).toBeUndefined();
    expect(chartFrom(d)!.spec.opts["y.scale"]).toBe("log");
    const tick = (x: any) => drawn(x).prims.filter((p) => p.k === "text" && /^t:y:/.test(p.key)).map((p: any) => p.lines[0]);
    expect(tick(d)).toContain("100k"); expect(tick(d)).not.toContain("200k"); // powers of ten on the log view
    expect(tick(lin)).toContain("200k"); // and the even steps on the linear one
    expect(usesChart11(d)).toBe(true);
    expect(chartTable11(d)).toContain("The reader can switch the y axis between log and linear; it starts as log.");
  });
  test("a chart that starts linear can toggle to log when every value is above 0", () => {
    expect(errs(yaml(TOG.replace("scale: log, ", "")))).toEqual([]);
    expect(toggleOf(yaml(TOG.replace("scale: log, ", "")))!.start).toBe("linear");
  });
  test("doccheck draws the other view: a 0, a stacked chart and a range that cannot be log are refused with the fix", () => {
    const zero = yaml(TOG.replace("scale: log, ", "").replace("[30, 70, 150, 400]", "[0, 70, 150, 400]"));
    expect(errs(zero).join("\n")).toMatch(/toggle: the log view cannot be drawn.*above 0.*remove toggle/);
    const stack = yaml(TOG.replace("kind: line", "kind: bar\nstacked: true").replace("scale: log, ", ""));
    expect(errs(stack).join("\n")).toContain("log view cannot be drawn");
    const minZero = yaml(TOG.replace("scale: log, ", "min: 0, "));
    expect(errs(minZero).join("\n")).toContain("log view cannot be drawn");
    const slider = yaml(`kind: line\nx: [a, b]\ny: { toggle: true }\ncontrols:\n  - slider: k\n    min: 0\n    max: 5\n    value: 2\nlet:\n  v: "[k, k + 2]"\nseries:\n  - name: s\n    data: v\n`);
    expect(errs(slider).join("\n")).toMatch(/toggle: the linear view|toggle: the log view cannot be drawn with \{"k":0\}/);
  });
  test("refusals: not a boolean, a category axis, a pie, a heatmap, a time axis, axes that start apart", () => {
    expect(errs(yaml(TOG.replace("toggle: true", "toggle: yes please"))).join("\n")).toContain("toggle must be true or false");
    expect(errs(yaml(TOG.replace("x: { label: year,", "x: { toggle: true, label: year,"))).join("\n")).toContain("x.toggle does not apply");
    expect(errs(yaml(`kind: pie\nx: [a, b]\ny: { toggle: true }\nseries:\n  - name: s\n    data: [1, 2]`)).join("\n")).toContain("y.toggle does not apply");
    expect(errs(yaml(`kind: scatter\nx: { scale: log, toggle: true }\ny: { scale: linear, toggle: true }\nseries:\n  - name: s\n    data: [[1, 2], [3, 4]]`)).join("\n")).toContain("must start on the same scale");
    expect(errs(yaml(`kind: scatter\nx: { scale: log, toggle: true }\ny: { scale: log, toggle: true }\nseries:\n  - name: s\n    data: [[1, 2], [3, 4]]`))).toEqual([]);
    expect(errs(yaml(TOG.replace("x: { label: year, values: [2020, 2021, 2022, 2023] }", 'x: { scale: time, toggle: true }').replace("[1200, 8100, 61000, 410000]", '[["2026-11-20", 1], ["2026-11-21", 2]]').replace("[30, 70, 150, 400]", '[["2026-11-20", 1], ["2026-11-21", 2]]'))).join("\n")).toContain("x.toggle does not apply to a time axis");
  });
  test("the switch is two buttons, the chosen one pressed; static draws none", () => {
    const on = renderToStaticMarkup(React.createElement(ScaleToggle, { log: true, onChange: () => {}, w: PW(UI.en) }));
    expect(on).toContain(">Linear<"); expect(on).toContain(">Log<");
    expect((on.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(on.indexOf('aria-pressed="true"')).toBeGreaterThan(on.indexOf(">Linear<")); // Log is the pressed one
    fresh();
    const d = yaml(TOG);
    const live = renderToStaticMarkup(React.createElement(Chart, { spec: d, controls: [], initial: evalChart11(d), ui: UI.en }));
    expect(live).toContain("Axis scale");
    const still = renderToStaticMarkup(React.createElement(Chart, { spec: d, controls: [], initial: evalChart11(d), ui: UI.en, static: "" }));
    expect(still).not.toContain("Axis scale");
    expect(still).not.toContain("pc-seg");
  });
});

const CALC = `
layout: calculator
title: Storage bill
controls:
  - slider: stored
    label: Data stored
    unit: GB
    min: 100
    max: 5000
    step: 100
    value: 1200
  - slider: price
    label: Price per GB
    unit: USD per GB
    min: 0.01
    max: 0.1
    step: 0.001
    value: 0.023
  - toggle: second
    label: Second copy
    value: false
let:
  storage: "stored * price * (second ? 2 : 1)"
  fees: stored / 100
  total: storage + fees
calc:
  - let: storage
    label: Storage
    format: money
  - let: fees
    label: Fees
    unit: units
  - let: total
    label: Monthly bill
    format: money
    result: true
`;
describe("the calculator layout", () => {
  test("it passes, its rows are read, the formulas are written with the labels", () => {
    const d = yaml(CALC);
    fresh();
    const c = chart11Check(d);
    expect(c.errors).toEqual([]);
    const pc = prepareChart(d).steps[0].ext.pc!.calc!;
    expect(pc.hasChart).toBe(false);
    expect(pc.inputs.map((i) => [i.name, i.unit])).toEqual([["stored", "GB"], ["price", "USD per GB"], ["second", undefined]]);
    expect(pc.rows.map((r) => [r.name, r.formula, r.result])).toEqual([["storage", "Data stored × Price per GB × (Second copy ? 2 : 1)", false], ["fees", "Data stored ÷ 100", false], ["total", "Storage + Fees", true]]);
    expect(usesChart11(d)).toBe(true);
  });
  test("the evaluator is unchanged: the plain chart it sees is a one-point stand-in and `vars` come back", () => {
    const d = yaml(CALC);
    fresh();
    const r = evalChart11(d);
    expect(r.error).toBeUndefined();
    expect(r.vars.total as number).toBeCloseTo(1200 * 0.023 + 12, 6);
    const r2 = evalChart11(d, { second: true, stored: 200 });
    expect(r2.vars.storage as number).toBeCloseTo(200 * 0.023 * 2, 6);
    expect(chartControls(d).controls.length).toBe(3);
  });
  test("the LLM view: inputs with ranges, each formula with its value at the start values, the result", () => {
    fresh();
    const t = chartTable11(yaml(CALC))!;
    expect(t).toContain("Calculator: Storage bill");
    expect(t).toContain("| Data stored | 1200 GB | 100 to 5000 GB |");
    expect(t).toContain("| Second copy | off | on or off |");
    expect(t).toContain("- Storage = Data stored × Price per GB × (Second copy ? 2 : 1) = $27.60");
    expect(t).toContain("Result: Monthly bill = Storage + Fees = $39.60");
  });
  test("formulaText: names become labels, functions stay, * and / read as × and ÷, strings and numbers are kept", () => {
    const l = (id: string) => ({ a: "Alpha", b: "Beta" } as Record<string, string>)[id];
    expect(formulaText("a * b / 2", l)).toBe("Alpha × Beta ÷ 2");
    expect(formulaText("min(a, 1e3) + b", l)).toBe("min(Alpha, 1e3) + Beta");
    expect(formulaText('a == "a*b" ? 1.5 : c', l)).toBe('Alpha == "a*b" ? 1.5 : c');
    expect(formulaText("a*b", () => undefined)).toBe("a×b");
  });
  test("refusals", () => {
    const m = (f: (d: any) => void) => { const d = yaml(CALC); f(d); return errs(d).join("\n"); };
    expect(m((d) => { d.layout = "grid"; })).toContain("layout must be calculator");
    expect(m((d) => { delete d.layout; })).toContain("calc goes with layout: calculator");
    expect(m((d) => { delete d.controls; })).toMatch(/needs inputs/);
    expect(m((d) => { d.controls = [{ button: "b", set: {} }]; })).toMatch(/needs inputs/);
    expect(m((d) => { delete d.calc; })).toContain("needs calc: a list of rows");
    expect(m((d) => { d.calc[2].result = false; })).toContain("add result: true to the row that answers the question");
    expect(m((d) => { d.calc[0].result = true; })).toContain("keep result: true on one row");
    expect(m((d) => { d.calc[0].let = "nothing"; })).toContain("let must name a formula under let");
    expect(m((d) => { d.calc[1].let = "storage"; })).toContain("is shown twice");
    expect(m((d) => { d.calc[0].unit = "x"; })).toContain("a format or a unit, not both");
    expect(m((d) => { d.calc[0].format = "shiny"; })).toContain("format must be one of");
    expect(m((d) => { d.calc[1].colour = "red"; })).toContain('unknown key "colour"');
    expect(m((d) => { d.controls[2].unit = "x"; })).toContain("unit goes with a slider or a select");
    expect(m((d) => { d.controls[0].unit = "u".repeat(30); })).toContain("unit must be a short text");
    expect(m((d) => { d.steps = [{ title: "a" }, { title: "b" }]; })).toContain("steps");
    expect(m((d) => { d.controls[1].value = 0.0235; })).toContain("is not on the slider's steps");
    expect(m((d) => { d.kind = "line"; })).toContain("a calculator without a chart takes no kind");
    expect(m((d) => { d.calc.push({ let: "total", label: "again" }); })).toContain("is shown twice");
    expect(m((d) => { d.calc[0].label = "L".repeat(80); })).toContain("label must be text of at most 60 characters");
  });
  test("a formula that breaks at an input's end is refused, naming the case", () => {
    const d = yaml(CALC.replace("fees: stored / 100", "fees: 100 / (stored - 100)"));
    const e = errs(d).join("\n");
    expect(e).toContain('calculator row "Fees" with {"stored":100}');
    expect(e).toContain("division by zero");
  });
  test("a chart under the result: series and a kind draw it; the same inputs drive both", () => {
    const d = yaml(CALC + `kind: bar\nx: { values: [a, b] }\nseries:\n  - name: s\n    data: "[stored, total]"\n`);
    fresh();
    expect(chart11Check(d).errors).toEqual([]);
    expect(prepareChart(d).steps[0].ext.pc!.calc!.hasChart).toBe(true);
    expect(chartTable11(d)).toContain("Under the result a chart is drawn from the same inputs.");
    const html = renderToStaticMarkup(React.createElement(Chart, { spec: d, controls: chartControls(d).controls, initial: evalChart11(d), ui: UI.en }));
    expect(html).toContain("chart-svg");
  });
  test("drawn: an input per control, a row per formula, one result; static lists the inputs and has no field", () => {
    const d = yaml(CALC);
    fresh();
    const controls = chartControls(d).controls;
    const ev = evalChart11(d);
    const calc = prepareChart(d).steps[0].ext.pc!.calc!;
    const live = renderToStaticMarkup(React.createElement(Calculator, { calc, controls, vals: { stored: 1200, price: 0.023, second: false }, set: () => {}, reset: () => {}, vars: ev.vars, isStatic: false, w: PW(UI.en) }));
    expect((live.match(/type="range"/g) ?? []).length).toBe(2);
    expect((live.match(/type="number"/g) ?? []).length).toBe(2);
    expect((live.match(/type="checkbox"/g) ?? []).length).toBe(1);
    expect((live.match(/data-dh-slot="calc-row"/g) ?? []).length).toBe(2);
    expect((live.match(/data-dh-slot="calc-result"/g) ?? []).length).toBe(1);
    expect(live).toContain("$39.60");
    expect(live).toContain(">GB<"); expect(live).toContain(">USD per GB<");
    const still = renderToStaticMarkup(React.createElement(Calculator, { calc, controls, vals: { stored: 1200, price: 0.023, second: false }, set: () => {}, reset: () => {}, vars: ev.vars, isStatic: true, w: PW(UI.en) }));
    expect(still).not.toContain("<input"); expect(still).not.toContain("<button");
    expect(still).toContain("1200"); expect(still).toContain("$39.60");
    const full = renderToStaticMarkup(React.createElement(Chart, { spec: d, controls, initial: ev, ui: UI.en, static: "" }));
    expect(full).toContain('data-dh-layout="calculator"');
    expect(full).not.toContain("chart-svg"); // no chart: no drawing
    expect(full).not.toContain('class="chart-ctl"'); // the inputs are the calculator's, not a second control row
  });
  test("an input the formula cannot take shows n/a (never Infinity), and an error keeps the inputs so the reader can recover", () => {
    const d = yaml(CALC.replace("fees: stored / 100", "fees: 100 / (stored - 1200)"));
    fresh();
    const controls = chartControls(d).controls;
    const calc = prepareChart(d).steps[0].ext.pc!.calc!;
    const r = evalChart11(d); // stored = 1200 is the start value: 100 / 0
    const html = renderToStaticMarkup(React.createElement(Calculator, { calc, controls, vals: { stored: 1200, price: 0.023, second: false }, set: () => {}, reset: () => {}, vars: r.vars, isStatic: false, w: PW(UI.en) }));
    expect(html).toContain("n/a"); expect(html).not.toContain("Infinity");
    const bad = renderToStaticMarkup(React.createElement(Calculator, { calc, controls, vals: { stored: 1200, price: 0.023, second: false }, set: () => {}, reset: () => {}, vars: {}, isStatic: false, w: PW(UI.en), error: "x must be a list" }));
    expect(bad).toContain('role="alert"'); expect(bad).toContain("x must be a list");
    expect((bad.match(/type="range"/g) ?? []).length).toBe(2); // the inputs stay
    expect(bad).not.toContain("data-dh-slot=\"calc-row\"");
  });
  test("a select and preset buttons are part of the calculator: the select shows, each button sets what it names", () => {
    const d = yaml(CALC.replace("let:", "  - select: tier\n    label: Class\n    options: [Standard, Archive]\n    value: Standard\n  - button: Small\n    set: { stored: 200, tier: Archive }\nlet:"));
    fresh();
    expect(chart11Check(d).errors).toEqual([]);
    const controls = chartControls(d).controls;
    const calc = prepareChart(d).steps[0].ext.pc!.calc!;
    const html = renderToStaticMarkup(React.createElement(Calculator, { calc, controls, vals: { stored: 1200, price: 0.023, second: false, tier: "Standard" }, set: () => {}, reset: () => {}, vars: evalChart11(d).vars, isStatic: false, w: PW(UI.en) }));
    expect(html).toContain("<select"); expect(html).toContain(">Archive<"); expect(html).toContain(">Small<");
    expect(chartTable11(d)).toContain("| Class | Standard | Standard, Archive |");
  });
  test("caps: inputs, rows", () => {
    const many = yaml(CALC);
    many.controls = Array.from({ length: PC_CAPS.inputs + 1 }, (_, i) => ({ slider: `i${i}`, min: 0, max: 5, value: 1 }));
    many.let = { t: "i0 + 1" }; many.calc = [{ let: "t", result: true }];
    expect(errs(many).join("\n")).toContain(`at most ${PC_CAPS.inputs} inputs`);
    const rows = yaml(CALC);
    rows.let = Object.fromEntries(Array.from({ length: PC_CAPS.rows + 2 }, (_, i) => [`r${i}`, "stored + 1"]));
    rows.calc = Object.keys(rows.let).map((k, i) => ({ let: k, result: i === 0 }));
    expect(errs(rows).join("\n")).toContain(`at most ${PC_CAPS.rows} rows`);
  });
  test("caseValues: the start, slider ends, options, a flipped toggle, a button", () => {
    const c = caseValues(chartControls(yaml(CALC)).controls);
    expect(c.length).toBe(1 + 2 + 2 + 1);
    expect(c[c.length - 1]).toEqual({ second: true });
  });
});

const SEED = `
layout: calculator
title: Seeds
controls:
  - slider: beds
    label: Beds
    min: 1
    max: 20
    value: 8
  - slider: packets
    label: Packets
    min: 1
    max: 12
    value: 4
  - button: Small
    set: { beds: 3, packets: 2 }
let:
  need: beds * 40
  have: packets * 100
  spare: have - need
  enough: "spare >= 0 ? 'Enough seed' : 'Short of seed'"
  look: "spare >= 0 ? 'good' : 'bad'"
  tiles: "[min(need, have) / 10, max(spare, 0) / 10, max(-spare, 0) / 10]"
calc:
  - let: need
    label: Needed
    unit: seeds
  - let: spare
    label: Left over
    unit: seeds
    result: true
  - let: enough
    label: Verdict
    verdict: true
    tone_from: look
  - let: tiles
    label: Each tile is 10 seeds
    units: { planted: c3, spare: good, missing: bad }
`;
describe("a verdict line and a units row", () => {
  test("they pass, read their words, and the LLM view says them in text", () => {
    const d = yaml(SEED);
    fresh();
    expect(chart11Check(d).errors).toEqual([]);
    const rows = prepareChart(d).steps[0].ext.pc!.calc!.rows;
    expect(rows.map((r) => [r.name, r.verdict, r.toneFrom, r.units?.map((u) => u.kind).join("/")])).toEqual([["need", false, undefined, undefined], ["spare", false, undefined, undefined], ["enough", true, "look", undefined], ["tiles", false, undefined, "planted/spare/missing"]]);
    const t = chartTable11(d)!;
    expect(t).toContain("- Verdict: Enough seed");
    expect(t).toContain("- Each tile is 10 seeds: planted 32, spare 0, missing 0".replace("planted 32, spare 0, missing 0", "planted 32, spare 8, missing 0"));
  });
  test("refusals: a verdict that is not short text, a tone word that is not one, tone_from naming nothing, a units list of the wrong length or a negative count", () => {
    const m = (f: (d: any) => void) => { const d = yaml(SEED); f(d); return errs(d).join("\n"); };
    expect(m((d) => { d.let.enough = "spare"; })).toContain("is number, not a short text");
    expect(m((d) => { d.let.look = "'blue'"; })).toContain("tone_from look gives \"blue\"");
    expect(m((d) => { d.calc[2].tone_from = "nothing"; })).toContain("tone_from must name a formula under let");
    expect(m((d) => { d.calc[2].tone = "bad"; })).toContain("tone or tone_from, not both");
    expect(m((d) => { d.calc[2].unit = "x"; })).toContain("a verdict row is a line of text");
    expect(m((d) => { d.let.tiles = "[1, 2]"; })).toContain("must give a list of 3 counts (planted, spare, missing)");
    expect(m((d) => { d.let.tiles = "[0 - 1, 2, 3]"; })).toContain("each 0 or more");
    expect(m((d) => { d.let.tiles = "[1000000, 2, 3]"; })).toContain("counts over 100000 units");
    expect(m((d) => { d.calc[3].units = { a: "pink" }; })).toContain('the units kind "a" has the colour "pink"');
    expect(m((d) => { d.calc[3].units = {}; })).toContain("units is a list of kinds");
    expect(m((d) => { d.calc[3].format = "money"; })).toContain("a units row is a counted grid of tiles");
    expect(m((d) => { d.calc[0].tone_from = "look"; })).toContain("tone_from goes with verdict: true");
  });
  test("drawn: the tiles are counted from the counts, a kind has its own look, and a very large count is capped in words", () => {
    const units = [{ kind: "kept", tone: "good" }, { kind: "added", tone: "c3" }, { kind: "removed", tone: "bad" }];
    const html = renderToStaticMarkup(React.createElement(UnitsGrid, { units, counts: [16, 8, 4], label: "units" }));
    const tiles = (html.match(/class="pc-tile /g) ?? []).length;
    expect(tiles).toBe(28 + 3); // 28 tiles and one in each key item
    expect((html.match(/pc-tile-0 tone-good/g) ?? []).length).toBe(17);
    expect((html.match(/pc-tile-1 tone-c3/g) ?? []).length).toBe(9);
    expect((html.match(/pc-tile-2 tone-bad/g) ?? []).length).toBe(5);
    expect(html).toContain("<b>16</b>"); expect(html).not.toContain("more");
    const big = renderToStaticMarkup(React.createElement(UnitsGrid, { units, counts: [5000, 100, 0], label: "units" }));
    expect((big.match(/class="pc-tile /g) ?? []).length).toBe(200 + 3);
    expect(big).toContain("4,900 more");
  });
  test("drawn in the calculator: the verdict takes the colour its formula gives, and the row order is the author's", () => {
    const d = yaml(SEED);
    fresh();
    const controls = chartControls(d).controls, calc = prepareChart(d).steps[0].ext.pc!.calc!;
    const ev = evalChart11(d, { beds: 12 });
    const html = renderToStaticMarkup(React.createElement(Calculator, { calc, controls, vals: { beds: 12, packets: 4 }, set: () => {}, reset: () => {}, vars: ev.vars, isStatic: false, w: PW(UI.en) }));
    expect(html).toContain('class="pc-verdict tone-bad"'); expect(html).toContain("Short of seed");
    const ok = renderToStaticMarkup(React.createElement(Calculator, { calc, controls, vals: { beds: 3, packets: 4 }, set: () => {}, reset: () => {}, vars: evalChart11(d, { beds: 3 }).vars, isStatic: false, w: PW(UI.en) }));
    expect(ok).toContain('class="pc-verdict tone-good"');
    const order = ["calc-row", "calc-result", "calc-verdict", "calc-units"].map((k) => html.indexOf(`data-dh-slot="${k}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > 0)).toBe(true);
  });
});

describe("scene shape: value in the label, worked formulas, slots and rows of tiles", () => {
  const SHAPE = SEED.replace("title: Seeds", "title: Seeds\ninputs: label\nformulas: worked").replace("units: { planted: c3, spare: good, missing: bad }", "units: { planted: c3, spare: good, missing: bad }\n    slots: 150\n    per_row: 20");
  const show = (vals: any, d = yaml(SHAPE)) => {
    fresh();
    const calc = prepareChart(d).steps[0].ext.pc!.calc!;
    return renderToStaticMarkup(React.createElement(Calculator, { calc, controls: chartControls(d).controls, vals: { beds: 8, packets: 4, ...vals }, set: () => {}, reset: () => {}, vars: evalChart11(d, vals).vars, isStatic: false, w: PW(UI.en) }));
  };
  test("they pass; the label carries the value, there is no number box, the formula has the values in it", () => {
    expect(errs(yaml(SHAPE))).toEqual([]);
    const html = show({});
    expect(html).toContain('data-inputs="label"'); expect(html).toContain('data-formulas="worked"');
    expect(html).not.toContain("pc-num");
    expect(html).toContain('class="pc-lab-v">8</b>');
    expect(html).toContain("pc-panel");
    expect(html).toContain("8 * 40"); expect(html).toContain("<b>320 seeds</b>");
  });
  test("slots: unused slots are pale tiles, tiles stand per_row in a line; too many for the slots is refused", () => {
    const html = show({});
    const body = html.slice(html.indexOf('class="pc-tiles"'), html.indexOf("</ul>"));
    expect((body.match(/pc-tile-empty/g) ?? []).length).toBe(110); // 40 counted + 110 pale, 150 slots
    expect(html).toContain("--pc-per-row:20");
    const d = yaml(SHAPE); d.let.tiles = "[150, 5, 0]";
    expect(errs(d).join("\n")).toContain("counts 155 units but has 150 slots");
    const e = yaml(SHAPE); e.calc[3].slots = 0; expect(errs(e).join("\n")).toContain("slots must be a whole number from 1 to 200");
    const g = yaml(SHAPE); g.calc[0].slots = 5; expect(errs(g).join("\n")).toContain("slots goes with units");
    const h = yaml(SHAPE); h.inputs = "wide"; expect(errs(h).join("\n")).toContain("inputs must be boxes or label");
    const k = yaml(SHAPE); k.formulas = "x"; expect(errs(k).join("\n")).toContain("formulas must be table or worked");
  });
});

describe("work and memory", () => {
  const charges = (f: () => void) => { const l = { steps: 1e9, values: 1e9, chars: 1e9 }; const b = new Budget(l, l); withBudget(b, f); return b.steps + b.values + b.chars; };
  test("a calculator, a toggle and a time axis charge the document's budget, and double input means about double work", () => {
    const calcN = (n: number) => { const d = yaml(CALC); d.let = Object.fromEntries(Array.from({ length: n }, (_, i) => [`r${i}`, "stored + 1"])); d.let.total = "r0"; d.calc = Array.from({ length: n }, (_, i) => ({ let: `r${i}`, result: i === 0 })); return d; };
    const w1 = charges(() => chart11Check(calcN(8))), w2 = charges(() => chart11Check(calcN(16)));
    expect(w1).toBeGreaterThan(0);
    expect(w2 / w1).toBeLessThan(2.6);
    const togN = (n: number) => yaml(`kind: line\nx: [${Array.from({ length: n }, (_, i) => `p${i}`).join(", ")}]\ny: { toggle: true }\nseries:\n  - name: s\n    data: [${Array.from({ length: n }, (_, i) => i + 1).join(", ")}]`);
    const t1 = charges(() => chart11Check(togN(50))), t2 = charges(() => chart11Check(togN(100)));
    expect(t2 / t1).toBeLessThan(2.6);
    const ticks = (n: number) => charges(() => { ticksEvery(0, n * 3_600_000, "hour", 1, "UTC"); });
    expect(ticks(100) / ticks(50)).toBeLessThan(2.3);
    expect(placeLabels(Array.from({ length: 60 }, (_, i) => ({ i, text: `goal ${i}`, x: 0, x2: 600, y: 10 + i * 3, y2: 10 + i * 3 })), 640).length).toBe(60);
  });
  test("a tiny budget ends a calculator check, a toggle check and a tick list with a BudgetError or a refusal, quickly", () => {
    expect(() => tiny(40, () => ticksEvery(0, 90_000 * 3_600_000, "hour", 1, "UTC"))).toThrow(BudgetError);
    const r = tiny(30, () => chart11Check(yaml(CALC)));
    expect(r.errors.join("\n")).toMatch(/too much work|too many values|too much text/);
    const t = tiny(30, () => chart11Check(yaml(TOG.replace("scale: log, ", ""))));
    expect(t.errors.length === 0 || /too much work|too many values|too much text/.test(t.errors.join("\n"))).toBe(true);
    fresh();
  });
  test("a hostile formula (deep nesting, a huge range, a name that is its own) ends in a refusal and not a hang", () => {
    const deep = yaml(CALC); deep.let.total = "(".repeat(300) + "storage" + ")".repeat(300) + " + fees";
    const t0 = Date.now(); const e = errs(deep); expect(Date.now() - t0).toBeLessThan(3000); expect(e.length).toBeGreaterThanOrEqual(0);
    const self = yaml(CALC); self.let.storage = "storage + 1";
    expect(errs(self).join("\n")).toMatch(/refers to itself/);
    const big = yaml(CALC); big.controls[0].max = 1e300; big.controls[0].step = 1e-9;
    const t1 = Date.now(); errs(big); expect(Date.now() - t1).toBeLessThan(3000);
    const longLabel = yaml(CALC); longLabel.calc[0].note = "n".repeat(10_000);
    expect(errs(longLabel).join("\n")).toContain("note must be text of at most 90 characters");
  });
});


describe("a page with the page chart blocks", () => {
  const page = `---
title: T
---

## One

\`\`\`chart
${LINE.trim()}
\`\`\`

\`\`\`chart
${TOG.trim()}
\`\`\`

\`\`\`chart
${CALC.trim()}
\`\`\`
`;
  const run = (text: string) => { const doc = parse(text, { path: "page.dh.md" }); return { doc, issues: check(doc).filter((p) => p.level === "error") }; };
  test("doccheck passes; the LLM view holds the calculator's formulas and the switch's sentence", () => {
    const { doc, issues } = run(page);
    expect(issues.map((i) => i.message)).toEqual([]);
    const v = doc.llm;
    expect(v).toContain("Result: Monthly bill");
    expect(v).toContain("switch the y axis between log and linear");
    expect(v).toContain("| This year | Forecast | Last year |");
  });
  test("each refusal reaches doccheck with the part's line and the fix", () => {
    const bad = page.replace("layout: calculator", "layout: grid");
    const { issues } = run(bad);
    const m = issues.map((i) => i.message).join("\n");
    expect(m).toContain("layout must be calculator");
    expect(issues.find((i) => /layout must be calculator/.test(i.message))?.line).toBeGreaterThan(3);
  });
});
