// The five xy drawing faults found on the page (lane chwire): the horizontal bar's two axis titles on one spot, a time axis'
// own tick unit and step, a plot that moved when a step added a series, a first time label over the value axis' words, and
// the value axis' title on its top tick. Each is pinned on the primitives (their words and places), no browser.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { chartFrom } from "../../../src/engine/charts/legacy";
import { buildChart } from "../../../src/engine/charts/build";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import type { Prim } from "../../../src/engine/types";

const fence = (file: string): any => Bun.YAML.parse(/```chart\n([\s\S]*?)^```/m.exec(readFileSync(`fixtures/format/${file}.dh.md`, "utf8"))![1]);
const draw = (d: any, w: number, step = 0, h = 340, max?: number[][]) => {
  const lg = chartFrom(d, {}, step)!;
  setPhoneFont(w < 480);
  return buildChart(lg.spec, lg.values, { x: 0, y: 0, w, h }, { phone: w < 480, look: "stage", measure, ...(max ? { max } : {}) }).prims;
};
type Box = { l: number; r: number; t: number; b: number; s: string };
/** the box a text primitive covers (12 px words: 11 above the baseline, 3 below) */
const box = (p: Prim): Box => {
  const t = p as Extract<Prim, { k: "text" }>, w = measure(t.lines[0], t.font);
  const l = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w : t.x - w / 2;
  return { l, r: l + w, t: t.y - 11, b: t.y + 3, s: t.lines[0] };
};
const hit = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const text = (prims: Prim[], re: RegExp): Extract<Prim, { k: "text" }>[] => prims.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text" && re.test(p.key));

describe("a horizontal bar chart's axis titles", () => {
  for (const w of [1280, 390]) test(`the category title (top) and the value title (bottom right) are apart at ${w}`, () => {
    const prims = draw(fence("15-chart-horizontal-bar"), w);
    const x = text(prims, /^title:x$/)[0], y = text(prims, /^title:y$/)[0];
    expect(x).toBeDefined(); expect(y).toBeDefined();
    expect(hit(box(x), box(y))).toBe(false);
    expect(box(x).t).toBeLessThan(box(y).t);
    for (const t of [x, y]) { const b = box(t); expect(b.l).toBeGreaterThanOrEqual(-0.5); expect(b.r).toBeLessThanOrEqual(w + 0.5); }
  });
});

describe("a time axis with its own tick unit and step", () => {
  const hours = (extra: string) => Bun.YAML.parse(`kind: line\nx: { scale: time, ${extra} }\ntz: UTC\nseries:\n  - name: s\n    data: [["2026-11-20T00:00", 1], ["2026-11-20T08:00", 3], ["2026-11-20T16:00", 2], ["2026-11-21T00:00", 4]]\n`);
  test("unit hour every 4 gives 7 ticks, 00:00 to 24:00", () => {
    const d = hours("unit: hour, every: 4"), lg = chartFrom(d, {}, 0)!;
    expect(lg.spec.opts["x.unit"]).toBe("hour");
    expect(lg.spec.opts["x.every"]).toBe("4");
    expect(draw(d, 1280).filter((p) => p.k === "path" && p.key.startsWith("g:x:")).length).toBe(7);
  });
  test("without a unit the ticks are chosen to fit, not seven four-hour ones", () => {
    const n = draw(hours(""), 390).filter((p) => p.k === "path" && p.key.startsWith("g:x:")).length;
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(7);
  });
});

describe("a story that adds a series", () => {
  const d = fence("74-chart-steps");
  test("the plot is where it was in every step (the key keeps its room)", () => {
    const n = d.steps.length, all = Array.from({ length: n }, (_, k) => chartFrom(d, {}, k)!.values), max = all[0].map((_, s) => all.reduce((m, v) => v[s] ? v[s].map((x, j) => Math.max(m[j] ?? 0, x)) : m, [] as number[]));
    for (let s = all[0].length; s < Math.max(...all.map((v) => v.length)); s++) max[s] = all.reduce((m, v) => (v[s] ? v[s].map((x, j) => Math.max(m[j] ?? 0, x)) : m), [] as number[]);
    const ys = Array.from({ length: n }, (_, k) => text(draw(d, 640, k, 340, max), /^t:y:/).map((t) => `${t.key}@${t.y}`).join(" "));
    expect(n).toBeGreaterThan(1);
    for (const y of ys) expect(y).toBe(ys[0]);
  });
  test("the key room is named in the spec only when a step adds a series", () => {
    expect(chartFrom(d, {}, 0)!.spec.opts["key.reserve"]).toBeDefined();
    expect(chartFrom(fence("17-chart-line"), {}, 0)!.spec.opts["key.reserve"]).toBeUndefined();
  });
});

describe("a time axis' first and last words", () => {
  test("the first word starts at its tick, clear of the value axis' words, at 1280 and 390", () => {
    for (const w of [1280, 390]) {
      const prims = draw(fence("75-chart-time-annotations"), w), ys = text(prims, /^t:y:/).map(box), xs = text(prims, /^c:t/).map(box);
      expect(xs.length).toBeGreaterThan(1);
      for (const a of xs) for (const b of ys) expect(hit(a, b)).toBe(false);
      for (const a of xs) { expect(a.l).toBeGreaterThanOrEqual(-0.5); expect(a.r).toBeLessThanOrEqual(w + 0.5); }
      for (let i = 1; i < xs.length; i++) expect(xs[i].l).toBeGreaterThanOrEqual(xs[i - 1].r - 0.5);
    }
  });
});

describe("the value axis' title", () => {
  for (const f of ["11-chart-bar", "17-chart-line", "18-chart-area", "20-chart-mixed-bars-and-line-two-axes"]) for (const w of [1280, 390]) test(`${f} at ${w}: clear of the top tick's word and the key`, () => {
    const prims = draw(fence(f), w), titles = text(prims, /^title:y2?$/).map(box), ticks = text(prims, /^t:y2?:/).map(box);
    expect(titles.length).toBeGreaterThan(0);
    for (const a of titles) for (const b of ticks) expect(hit(a, b)).toBe(false);
    const top = Math.min(...ticks.map((b) => b.t));
    for (const a of titles) expect(top - a.b).toBeGreaterThanOrEqual(2);
  });
});
