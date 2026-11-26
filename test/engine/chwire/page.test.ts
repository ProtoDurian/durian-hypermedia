// The chart part on our renderer (src/engine/charts/page.tsx): what the page hands the drawing and what comes back. Compact ticks
// on a phone, a moved control keeps every primitive's key (so the chart glides, pie and radar too), an annotation is a mark with
// its words, and the server's markup of a page with charts. Pure checks: no browser here (the glide itself is looked at in one).
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse, check } from "../../../src/index";
import { chartFrom } from "../../../src/engine/charts/legacy";
import { reach } from "../../../src/engine/charts/page";
import { chartControls } from "../../../src/core/chart";
import { buildChart } from "../../../src/engine/charts/build";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { DhDocument } from "../../../src/react/index";
import type { Prim } from "../../../src/engine/types";

const yaml = (s: string) => Bun.YAML.parse(s) as any;
/** the chart of a fence's YAML at the reader's control values, drawn at one width */
const drawn = (src: string, w: number, controls?: Record<string, any>, max?: number[][]) => {
  const lg = chartFrom(yaml(src), controls);
  if (!lg || lg.error) throw new Error(`no chart: ${lg?.error}`);
  const phone = w < 480;
  setPhoneFont(phone);
  return { ...buildChart(lg.spec, lg.values, { x: 0, y: 0, w, h: phone ? 300 : 340 }, { phone, look: "stage", measure, ...(max ? { max } : {}) }), lg };
};
const words = (prims: Prim[], re: RegExp): string[] => prims.filter((p) => p.k === "text" && re.test(p.key)).map((p: any) => p.lines[0]);
const bars = (data: number[], extra = "") => `kind: bar\n${extra}x: [${data.map((_, i) => `c${i}`).join(", ")}]\nseries:\n  - { name: s, data: [${data.join(", ")}] }\n`;

describe("compact value axes on a phone", () => {
  test("a bar chart's value axis: 1.5k, 2k, 2.5k, never 1,500", () => {
    const t = words(drawn(bars([150, 1500, 2250]), 390).prims, /^t:y:/);
    expect(t).toContain("1.5k");
    expect(t).toContain("2.5k");
    expect(t.some((w) => w.includes(","))).toBe(false);
  });
  test("a horizontal bar's value axis is x and compact too; its category words are the names", () => {
    const { prims } = drawn(bars([150, 1500, 2250], "horizontal: true\n"), 390);
    expect(words(prims, /^t:/).some((w) => /\dk$/.test(w))).toBe(true);
    expect(words(prims, /^c:/)).toEqual(["c0", "c1", "c2"]);
  });
  test("a log axis names its powers of ten compactly", () => {
    const t = words(drawn("kind: line\nx: [a, b]\ny: { scale: log }\nseries:\n  - { name: s, data: [10, 100000] }\n", 390).prims, /^t:y:/);
    expect(t).toEqual(["10", "100", "1k", "10k", "100k"]);
  });
  test("scatter has both axes compact; the second axis of a bar chart is compact", () => {
    const sc = drawn("kind: scatter\nseries:\n  - { name: p, data: [[1000, 2000], [1500, 2500]] }\n", 390).prims;
    expect(words(sc, /^t:x:/).every((w) => /^\d+(\.\d+)?k$/.test(w) || /^\d{1,3}$/.test(w))).toBe(true);
    expect(words(sc, /^t:y:/).every((w) => /^\d+(\.\d+)?k$/.test(w))).toBe(true);
    const y2 = drawn("kind: bar\nx: [a, b]\ny2: { label: v }\nseries:\n  - { name: a, data: [1, 2] }\n  - { name: b, axis: y2, data: [5000, 9000] }\n", 390).prims;
    expect(words(y2, /^t:y2:/).some((w) => /k$/.test(w))).toBe(true);
  });
  test("a declared format keeps its words: money, percent, bytes, duration", () => {
    const t = (fmt: string, data: number[]) => words(drawn(bars(data, `y: { format: ${fmt} }\n`), 390).prims, /^t:y:/);
    expect(t("money", [1_500_000, 2_500_000])).toContain("$1.5M");
    expect(t("percent", [10, 40])).toContain("40%");
    expect(t("bytes", [1024, 3072])).toContain("2 KiB");
    expect(t("duration", [30, 90])).toContain("1m 40s");
  });
  test("the same number is whole in the popover: the tick says 1.5k, the card says 1,500", () => {
    const { marks } = drawn(bars([150, 1500, 2250]), 390);
    expect(marks.find((m) => m.key === "cat:c1")!.text).toBe("s: 1,500");
  });
});

// charts2: the review saw format/31 ("per call", 6 questions: bars 0-6) drawn on a 0-250 axis
describe("the scale a control holds still (page.tsx reach)", () => {
  const F31 = yaml(`kind: bar
controls:
  - slider: questions
    min: 1
    max: 20
    value: 6
  - select: view
    options: [per call, running total]
let:
  calls: range(1, questions + 1)
  carried: calls - 1
x: calls
series:
  - name: answers
    data: "view == 'per call' ? carried : cumsum(carried)"
`);
  const ctls = chartControls(F31).controls;
  const top = (vals: Record<string, any>) => { const now = chartFrom(F31, vals)!.values; return Math.max(...reach(F31, ctls, vals, 0, now).flat()); };
  test("a dropdown is another view with its own scale; a slider that adds categories does not flatten the bars", () => {
    expect(top({ questions: 6, view: "per call" })).toBe(6); // range() is inclusive: 7 calls, 0..6 carried
    expect(top({ questions: 6, view: "running total" })).toBe(21);
  });
  test("a slider that only changes the numbers still holds the scale at its largest", () => {
    const src = yaml("kind: bar\nx: [a, b, c]\ncontrols:\n  - slider: k\n    min: 1\n    max: 9\n    value: 2\nseries:\n  - { name: h, data: '[k * 10, 20, 30]' }\n");
    const now = chartFrom(src, { k: 2 })!.values;
    expect(reach(src, chartControls(src).controls, { k: 2 }, 0, now)[0][0]).toBe(90);
  });
  test("drawn: the 'per call' axis tops near the bars, not at 250", () => {
    const lg = chartFrom(F31, { questions: 6, view: "per call" })!;
    setPhoneFont(false);
    const max = reach(F31, ctls, { questions: 6, view: "per call" }, 0, lg.values);
    const t = words(buildChart(lg.spec, lg.values, { x: 0, y: 0, w: 600, h: 340 }, { phone: false, look: "stage", measure, max }).prims, /^t:y:/).map((w) => +w.replace(/,/g, ""));
    expect(Math.max(...t)).toBeLessThanOrEqual(10);
  });
});

describe("a moved control keeps the primitives' keys (the chart glides)", () => {
  const keys = (prims: Prim[]) => prims.map((p) => p.key).sort();
  const num = (p: Prim): number[] => (p.k === "rect" ? [p.rect.x, p.rect.y, p.rect.w, p.rect.h] : p.k === "path" ? [p.d.length, ...(p.d.match(/-?\d+\.?\d*/g) ?? []).map(Number)] : p.k === "dot" ? [p.x, p.y, p.r] : []);
  const same = (a: Prim[], b: Prim[]) => JSON.stringify(a.map(num)) === JSON.stringify(b.map(num));
  const ctl = (kind: string, data: string, extra = "") => `kind: ${kind}\n${extra}x: [a, b, c]\ncontrols:\n  - slider: k\n    min: 1\n    max: 9\n    value: 2\nseries:\n  - { name: h, data: '${data}' }\n`;
  for (const [kind, extra] of [["bar", ""], ["line", ""], ["area", ""], ["pie", ""], ["doughnut", ""], ["radar", ""], ["bar", "stacked: true\n"]] as const) {
    test(`${kind}${extra ? " (stacked)" : ""}: the slider changes the numbers, not one key`, () => {
      const src = ctl(kind, "[k * 10, 20, 30]", extra);
      // the page hands the drawing the largest numbers of every state the controls reach (page.tsx reach()), so scales stay still
      const max = [[90, 20, 30]];
      const lo = drawn(src, 600, { k: 2 }, max), hi = drawn(src, 600, { k: 9 }, max);
      expect(lo.lg.values[0][0]).toBe(20); expect(hi.lg.values[0][0]).toBe(90);
      expect(keys(hi.prims)).toEqual(keys(lo.prims));
      expect(same(lo.prims, hi.prims)).toBe(false); // something moved
      expect(lo.marks.map((m) => m.key)).toEqual(hi.marks.map((m) => m.key));
    });
  }
  test("a step of the chart's own steps does the same", () => {
    const src = `kind: bar\nx: [a, b]\nseries:\n  - { name: s, data: [1, 2] }\nsteps:\n  - title: one\n  - title: two\n    series:\n      - { name: s, data: [4, 2] }\n`;
    const lo = chartFrom(yaml(src), undefined, 0)!, hi = chartFrom(yaml(src), undefined, 1)!;
    setPhoneFont(false);
    const draw = (l: typeof lo) => buildChart(l.spec, l.values, { x: 0, y: 0, w: 600, h: 340 }, { phone: false, look: "stage", measure, max: [[4, 2]] }).prims;
    expect(keys(draw(hi))).toEqual(keys(draw(lo)));
    expect(same(draw(lo), draw(hi))).toBe(false);
  });
  test("with a fixed `max` the scale does not move when the numbers do (bars grow, the axis stays)", () => {
    const src = ctl("bar", "[k * 10, 20, 30]");
    const a = chartFrom(yaml(src), { k: 2 })!, b = chartFrom(yaml(src), { k: 9 })!;
    setPhoneFont(false);
    const run = (l: typeof a) => buildChart(l.spec, l.values, { x: 0, y: 0, w: 600, h: 340 }, { phone: false, look: "stage", measure, max: [[90, 20, 30]] }).prims;
    expect(words(run(a), /^t:y:/)).toEqual(words(run(b), /^t:y:/));
  });
});

describe("annotations and marks", () => {
  const SRC = `kind: line\nx: [Mon, Tue, Wed]\nseries:\n  - { name: s, data: [1, 3, 2] }\nannotations:\n  - { y: 2.5, label: SLO, text: The promise to users., tone: warn }\n  - { at: Tue, label: Deploy }\n`;
  test("an xy chart's annotation gives a mark with its label (a goal line, an event)", () => {
    const { marks, prims } = drawn(SRC, 600);
    const ann = marks.filter((m) => m.kind === "ann");
    expect(ann.map((m) => m.title)).toEqual(["SLO", "Deploy"]);
    expect(ann[0].text ?? "").toContain("The promise to users.");
    for (const m of ann) { expect(m.rect.w).toBeGreaterThan(0); expect(m.rect.h).toBeGreaterThan(0); }
    expect(prims.some((p) => /^ann:0/.test(p.key))).toBe(true); // and a drawn line under the mark
  });
  test("a time axis chart's annotation is placed by its time", () => {
    const src = `kind: line\ntz: UTC\nx: { scale: time }\nseries:\n  - name: s\n    data: [["2026-11-20T10:00", 1], ["2026-11-20T11:00", 3]]\nannotations:\n  - { at: "2026-11-20T10:30", label: Deploy }\n`;
    const { marks } = drawn(src, 600);
    const m = marks.find((x) => x.kind === "ann")!;
    expect(m.title).toBe("Deploy");
    expect(m.rect.x).toBeGreaterThan(0); expect(m.rect.x).toBeLessThan(600); // half way along the hour, inside the chart
  });
  test("a slice, a heat cell and a bar each answer with their own words", () => {
    const pie = drawn("kind: pie\nx: [a, b, c]\nseries:\n  - { name: h, data: [1, 2, 3] }\n", 400).marks;
    expect(pie.map((m) => [m.key, m.title, m.text])).toEqual([["slice:0:0", "a", "1 · 17%"], ["slice:0:1", "b", "2 · 33%"], ["slice:0:2", "c", "3 · 50%"]]);
    const heat = drawn("kind: heatmap\nx: { values: [a, b] }\ny: { values: [r, s] }\nseries:\n  - name: v\n    data: [[1, 2], [3, null]]\n", 400).marks;
    expect(heat.map((m) => m.text)).toEqual(["1", "2", "3", "no value"]);
    expect(drawn(bars([5, 6]), 400).marks.map((m) => m.title)).toEqual(["c0", "c1"]);
  });
});

describe("the server's markup of a page with charts", () => {
  const PAGE = "# P\n\n```chart\nkind: line\ntitle: Visits\nx: [Mon, Tue, Wed]\ncontrols:\n  - slider: k\n    label: Growth\n    min: 1\n    max: 5\n    value: 2\nseries:\n  - { name: visits, data: '[10, 10 * k, 30]' }\n```\n\n```chart\nkind: pie\ntitle: Share\nx: [a, b]\nseries:\n  - { name: s, data: [1, 2] }\n```\n";
  const html = () => renderToString(React.createElement(DhDocument, { doc: parse(PAGE, { path: "p.dh.md" }) as any }));
  test("each chart is an SVG drawing (no canvas), with its title, the control and the table under it", () => {
    const h = html();
    expect(check(parse(PAGE, { path: "p.dh.md" }))).toEqual([]);
    expect((h.match(/data-dh-slot="chart-svg"/g) ?? []).length).toBe(2);
    expect(h).not.toContain("<canvas");
    expect(h).toContain("Visits"); expect(h).toContain("Growth");
    expect(h).toContain('type="range"');
    expect(h).toContain("chart-table");
    expect(h).toContain("xy-line"); // the line's class, from the shared token CSS
    expect(h).toContain("ch-slice");
  });
  test("a page with a chart has no chart.js: the part never asks for it", async () => {
    const src = await Bun.file("src/engine/charts/page.tsx").text();
    expect(src).not.toMatch(/chart\.js|chartjs/i);
    const pkg = JSON.parse(await Bun.file("package.json").text());
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies })).not.toContain("chart.js");
  });
});
