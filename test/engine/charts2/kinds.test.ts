// charts2: the axis kinds on a phone and on a desktop: a waterfall's cut axis and values, a histogram's x words, durations on round steps
import { describe, expect, test } from "bun:test";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { Budget } from "../../../src/core/budget";
import { LIMITS } from "../../../src/safety";
import { parseChartKinds } from "../../../src/parts/chart-kinds/part";
import type { View } from "../../../src/parts/chart-kinds/compute";
import { kindBuild, kindHeight, specOfView } from "../../../src/engine/charts/kinds";
import type { Prim } from "../../../src/engine/types";

export const viewOf = (yaml: string): View => {
  const d = parseChartKinds(yaml, 1, 1, LIMITS, new Budget({ steps: 1e12, values: 1e12, chars: 1e12 }));
  if (d.errors.length) throw new Error(JSON.stringify(d.errors));
  return d.steps[0].view;
};
export const draw = (v: View, w: number) => {
  const phone = w < 480; setPhoneFont(phone);
  const { spec } = specOfView(v), h = kindHeight(spec, w), rect = { x: 0, y: 0, w, h };
  return { rect, ...kindBuild(spec, rect, { phone, look: "stage" as const, measure, step: 0, prev: null, max: [], lit: [] }) };
};
export const texts = (ps: Prim[], re: RegExp): string[] => ps.flatMap((p) => (p.k === "text" && re.test(p.key) ? p.lines : []));

const BRIDGE = `kind: waterfall
title: Monthly revenue bridge
x: { label: driver, values: [October, New, Churn, Refunds, Subtotal, Price rise, November] }
y: { label: revenue, format: money, currency: EUR }
data: [84000, 12500, -9100, -2300, "=", 4800, "="]`;

describe("waterfall", () => {
  for (const w of [390, 1280]) {
    test(`a bridge that stays high starts its axis near the lowest total, keeps every step value, and breaks the base bars (${w})`, () => {
      const b = draw(viewOf(BRIDGE), w);
      expect(texts(b.prims, /^wf:.*:v$/).length).toBe(7);
      const ticks = b.prims.filter((p) => p.k === "text" && p.key.startsWith("t:y:"));
      const lowest = Math.min(...ticks.map((p) => p.k === "text" ? Number(/[\d.]+/.exec(p.lines[0])![0]) : 0));
      expect(lowest).toBeGreaterThan(50); // no tick of 0: it starts at 75k
      expect(b.prims.filter((p) => p.key.endsWith(":brk")).length).toBe(3); // October, Subtotal, November
      const base = b.prims.find((p) => p.k === "path" && p.key === "axis:base") as Extract<Prim, { k: "path" }>;
      const by = Number(/L[\d.]+ ([\d.]+)/.exec(base.d)![1]);
      for (const p of b.prims) if (p.k === "rect" && p.key.startsWith("wf:")) expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(by + 0.01);
    });
  }
  test("a bridge whose totals are small next to its changes keeps the axis at 0 and has no break marks", () => {
    const b = draw(viewOf(`kind: waterfall\ntitle: t\nx: { values: [A, B, C, D] }\ny: { label: v }\ndata: [10, 50, -20, "="]`), 390);
    expect(b.prims.some((p) => p.key.endsWith(":brk"))).toBe(false);
    expect(texts(b.prims, /^t:y:/)).toContain("0");
  });
});

const HIST = `kind: histogram
title: How long a request takes
x: { label: latency, format: duration-ms }
y: { label: requests }
bins: 12
marks: [p50, p95]
data: [74, 88, 109, 110, 86, 88, 122, 87, 132, 140, 93, 50, 99, 127, 56, 69, 80, 114, 67, 66, 89, 95, 125, 102, 120, 73, 91, 107, 42, 78, 75, 99, 155, 115, 25, 54, 113, 82, 84, 85, 94, 121, 168, 191]`;
const BOX = `kind: boxplot
title: Checkout time by day
x: { label: day, values: [Mon, Tue, Wed] }
y: { label: seconds to pay, format: duration }
tone: c4
data:
  - [120, 100, 121, 110, 106, 125, 169, 146, 134, 102, 132, 128, 114, 152]
  - [173, 121, 152, 144, 132, 143, 153, 117, 130, 134, 146, 176, 149, 166]
  - [118, 116, 162, 140, 161, 166, 136, 170, 158, 138, 126, 160, 154, 260]`;
const VIOLIN = `kind: violin
title: Response time by service
x: { label: service, values: [api, search, checkout] }
y: { label: response, format: duration-ms }
tone: c2
data:
  - [57, 69, 117, 111, 105, 83, 98, 105, 124, 101, 88, 102, 117, 83, 99, 101, 101, 99]
  - [141, 198, 207, 164, 144, 149, 163, 206, 121, 232, 154, 227, 237, 119, 174, 148, 195, 192]
  - [243, 242, 239, 262, 246, 212, 247, 222, 252, 201, 213, 203, 204, 248, 234, 261, 258, 213]`;
const num = (p: Prim): number => (p.k === "text" ? Number(/[\d.]+/.exec(p.lines[0])?.[0]) : NaN);

describe("histogram x words", () => {
  for (const w of [390, 1280]) test(`a latency histogram keeps at least three x ticks on round steps, never touching (${w})`, () => {
    const b = draw(viewOf(HIST), w);
    const xs = b.prims.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text" && p.key.startsWith("t:x:"));
    expect(xs.length).toBeGreaterThanOrEqual(3);
    const v = xs.map(num), step = v[1] - v[0];
    expect([10, 20, 25, 50]).toContain(step);
    for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1]).toBeCloseTo(step, 6);
    for (let i = 1; i < xs.length; i++) expect(xs[i].x - xs[i - 1].x).toBeGreaterThan(24);
  });
  test("on a phone the unit moves to the axis title", () => {
    const b = draw(viewOf(HIST), 390);
    expect(texts(b.prims, /^title:x$/)).toEqual(["latency (ms)"]);
    expect(texts(b.prims, /^t:x:/).every((t) => /^\d+$/.test(t))).toBe(true);
    expect(texts(draw(viewOf(HIST), 1280).prims, /^title:x$/)).toEqual(["latency"]);
  });
});

describe("durations on a value axis", () => {
  for (const w of [390, 1280]) test(`a box plot in seconds steps on round units of time and its lowest whisker is off the axis line (${w})`, () => {
    const b = draw(viewOf(BOX), w);
    const ticks = b.prims.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text" && p.key.startsWith("t:y:")).map((p) => p.lines[0]);
    for (const t of ticks) expect(t).toMatch(/^(\d+s|\d+m|\d+m(15|30|45)s|\d+h)$/);
    expect(ticks.join()).not.toMatch(/1m40s|2m30s|3m20s|4m10s/);
    const base = b.prims.find((p) => p.key === "axis:base") as Extract<Prim, { k: "path" }>, by = Number(/L[\d.]+ ([\d.]+)/.exec(base.d)![1]);
    const cap = b.prims.find((p) => p.key.endsWith(":cap")) as Extract<Prim, { k: "path" }>;
    expect(Math.max(...[...cap.d.matchAll(/ ([\d.]+)/g)].map((m) => Number(m[1])))).toBeLessThan(by - 6);
  });
  test("a millisecond violin on a phone: bare tick numbers, the unit in the axis title; on a desktop each tick names its unit", () => {
    const p = draw(viewOf(VIOLIN), 390), d = draw(viewOf(VIOLIN), 1280);
    expect(texts(p.prims, /^title:y$/)).toEqual(["response (ms)"]);
    expect(texts(p.prims, /^t:y:/).every((t) => /^\d+$/.test(t))).toBe(true);
    expect(texts(d.prims, /^title:y$/)).toEqual(["response"]);
    expect(texts(d.prims, /^t:y:/).some((t) => t.endsWith("ms"))).toBe(true);
    expect(texts(d.prims, /^t:y:/).every((t) => !t.includes(" "))).toBe(true);
  });
});
