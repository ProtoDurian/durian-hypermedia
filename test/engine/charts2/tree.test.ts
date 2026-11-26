// charts2: the sunburst and the calendar fill their frame (the sample charts of the showcase page)
import { describe, expect, test } from "bun:test";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { Budget } from "../../../src/core/budget";
import { LIMITS } from "../../../src/safety";
import { parseChartKinds } from "../../../src/parts/chart-kinds/part";
import type { View } from "../../../src/parts/chart-kinds/compute";
import { kindBuild, kindHeight, specOfView } from "../../../src/engine/charts/kinds";
import type { Prim } from "../../../src/engine/types";

const viewOf = (yaml: string): View => {
  const d = parseChartKinds(yaml, 1, 1, LIMITS, new Budget({ steps: 1e12, values: 1e12, chars: 1e12 }));
  if (d.errors.length) throw new Error(JSON.stringify(d.errors));
  return d.steps[0].view;
};
const draw = (v: View, w: number) => {
  const phone = w < 480; setPhoneFont(phone);
  const { spec } = specOfView(v), h = kindHeight(spec, w), rect = { x: 0, y: 0, w, h };
  return { rect, ...kindBuild(spec, rect, { phone, look: "stage" as const, measure, step: 0, prev: null, max: [], lit: [] }) };
};
const SUN = `kind: sunburst
title: Lines of code by team and area (thousands)
y: { label: lines of code }
data:
  - name: Platform
    children:
      - { name: Runtime, value: 93 }
      - { name: Storage, value: 66 }
  - name: Product
    children:
      - { name: Web, value: 95 }
      - { name: Mobile, value: 69 }
  - { name: Docs, value: 18 }`;
const CAL = `kind: calendar
title: Commits, September to November
y: { label: commits }
tone: good
from: 2026-09-01
to: 2026-11-30
data: [["2026-09-01", 7], ["2026-09-02", 6], ["2026-09-03", 5], ["2026-09-07", 4], ["2026-09-09", 2], ["2026-09-12", 2], ["2026-09-14", 4], ["2026-09-15", 10], ["2026-09-16", 1], ["2026-09-17", 3], ["2026-09-18", 5], ["2026-09-21", 8], ["2026-09-23", 9], ["2026-09-24", 5], ["2026-09-25", 3], ["2026-09-26", 2], ["2026-09-27", 1], ["2026-09-28", 9], ["2026-09-29", 8], ["2026-09-30", 7], ["2026-10-01", 8], ["2026-10-02", 9], ["2026-10-04", 1], ["2026-10-05", 5], ["2026-10-06", 9], ["2026-10-11", 2], ["2026-10-12", 9], ["2026-10-13", 9], ["2026-10-15", 5], ["2026-10-16", 6], ["2026-10-17", 1], ["2026-10-18", 1], ["2026-10-20", 8], ["2026-10-21", 3], ["2026-10-22", 6], ["2026-10-23", 6], ["2026-10-24", 1], ["2026-10-25", 1], ["2026-10-26", 2], ["2026-10-29", 7], ["2026-10-30", 7], ["2026-10-31", 1], ["2026-11-01", 0], ["2026-11-04", 4], ["2026-11-06", 5], ["2026-11-07", 0], ["2026-11-08", 0], ["2026-11-09", 2], ["2026-11-11", 2], ["2026-11-12", 6], ["2026-11-13", 8], ["2026-11-14", 2], ["2026-11-15", 0], ["2026-11-16", 8], ["2026-11-17", 6], ["2026-11-18", 3], ["2026-11-19", 1], ["2026-11-21", 2], ["2026-11-22", 2], ["2026-11-23", 3], ["2026-11-24", 8], ["2026-11-26", 7], ["2026-11-27", 10], ["2026-11-28", 0], ["2026-11-29", 1], ["2026-11-30", 7]]
`;

describe("sunburst", () => {
  for (const w of [390, 1280]) test(`the ring fills the frame: its marks reach nearly the top and bottom, and the frame is no taller than it is wide (${w})`, () => {
    const b = draw(viewOf(SUN), w);
    const arcs = b.marks.filter((m) => m.kind === "arc");
    const top = Math.min(...arcs.map((m) => m.rect.y)), bot = Math.max(...arcs.map((m) => m.rect.y + m.rect.h));
    expect(top).toBeLessThan(b.rect.h * 0.04); expect(b.rect.h - bot).toBeLessThan(b.rect.h * 0.04);
    expect(b.rect.h).toBeLessThanOrEqual(Math.max(240, w));
  });
  test("every name is on a phone, Docs too", () => {
    const names = draw(viewOf(SUN), 390).prims.flatMap((p) => (p.k === "text" && /^arc:\d+:n$/.test(p.key) ? p.lines : []));
    expect(names).toContain("Docs");
    expect(names.length).toBe(7);
  });
});

describe("calendar", () => {
  test("on a desktop the grid takes most of the width, centred, and grows no further than 41 px a cell", () => {
    const b = draw(viewOf(CAL), 766), days = b.prims.filter((p): p is Extract<Prim, { k: "rect" }> => p.k === "rect" && p.key.startsWith("day:"));
    const l = Math.min(...days.map((d) => d.rect.x)), r = Math.max(...days.map((d) => d.rect.x + d.rect.w));
    expect((r - l) / 766).toBeGreaterThan(0.7);
    expect(days[0].rect.w).toBeLessThanOrEqual(41);
    expect(Math.abs(l - 34 - (766 - r))).toBeLessThan(6); // the words column (34 px) is left of the grid
  });
  test("on a phone the cells keep their size and every day is inside the room", () => {
    const b = draw(viewOf(CAL), 330), days = b.prims.filter((p): p is Extract<Prim, { k: "rect" }> => p.k === "rect" && p.key.startsWith("day:"));
    for (const d of days) { expect(d.rect.x).toBeGreaterThanOrEqual(0); expect(d.rect.x + d.rect.w).toBeLessThanOrEqual(330); }
    expect(days[0].rect.w).toBeLessThanOrEqual(24);
  });
});
