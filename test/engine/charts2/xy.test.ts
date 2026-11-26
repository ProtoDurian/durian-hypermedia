// charts2: the xy defects the showcase review found (format/16, 44, 48)
import { describe, expect, test } from "bun:test";
import { chartFrom } from "../../../src/engine/charts/legacy";
import { buildChart } from "../../../src/engine/charts/build";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import type { Prim } from "../../../src/engine/types";

const drawn = (src: string, w: number) => {
  const lg = chartFrom(Bun.YAML.parse(src) as any);
  if (!lg || lg.error) throw new Error(`no chart: ${lg?.error}`);
  const phone = w < 480; setPhoneFont(phone);
  return buildChart(lg.spec, lg.values, { x: 0, y: 0, w, h: phone ? 300 : 340 }, { phone, look: "stage", measure });
};
/** the y tick words as numbers ("1k" is 1000) */
const ticks = (p: Prim[]) => p.filter((x) => x.k === "text" && /^t:y:/.test(x.key)).map((x: any) => { const w = String(x.lines[0]); return +w.replace(/[^\d.-]/g, "") * (/k$/.test(w) ? 1000 : 1); });
const LINES = `kind: line
x: { label: month, values: [Jan, Feb, Mar, Apr] }
y: { label: loans }
series:
  - { name: This year, line: solid, marker: circle, data: [820, 860, 910, 990] }
  - { name: Forecast, line: dashed, marker: diamond, data: [null, null, 910, 1000] }
  - { name: Last year, line: dotted, marker: none, data: [760, 790, 840, 900] }
`;
describe("a chart of lines only does not start its axis at 0", () => {
  for (const w of [390, 1280]) test(`at ${w}: loans of 760 to 1000 get an axis near them`, () => {
    const t = ticks(drawn(LINES, w).prims);
    expect(Math.min(...t)).toBeGreaterThan(500);
    expect(Math.min(...t)).toBeLessThanOrEqual(760);
  });
  test("bars and areas still start at 0", () => {
    const plain = LINES.replace(/, line: \w+, marker: \w+/g, "");
    expect(Math.min(...ticks(drawn(plain.replace("kind: line", "kind: bar"), 1280).prims))).toBe(0);
    expect(Math.min(...ticks(drawn(plain.replace("kind: line", "kind: area"), 1280).prims))).toBe(0);
  });
});

const TIME = `kind: line
title: Latency
x: { scale: time }
y: { label: latency, format: duration-ms }
tz: America/Los_Angeles
series:
  - name: p95
    data: [["2026-11-20T10:00", 120], ["2026-11-20T10:05", 130], ["2026-11-20T10:10", 410], ["2026-11-20T10:15", 150]]
annotations:
  - { at: 2026-11-20T10:08, label: Deploy v1.4, tone: acc }
  - { from: 2026-11-20T10:09, to: 2026-11-20T10:13, label: Incident 42, tone: bad }
  - { y: 300, label: SLO, tone: warn, fill: above }
`;
describe("event and range tags sit above the plot, never on the data", () => {
  for (const w of [390, 1280]) test(`at ${w}: every event and range chip is above the highest point`, () => {
    const p = drawn(TIME, w).prims;
    const dots = p.filter((x) => x.k === "dot") as Extract<Prim, { k: "dot" }>[];
    const line = p.filter((x) => x.k === "path" && /^l:|^line:|^s:/.test(x.key)) as any[];
    const ys = [...dots.map((d) => d.y - d.r), ...line.flatMap((l) => (l.d.match(/-?\d+\.?\d*/g) ?? []).map(Number).filter((_: number, i: number) => i % 2 === 1))];
    const top = Math.min(...ys);
    const chips = p.filter((x) => x.k === "chip" && /^ann:[01]:c$/.test(x.key)) as any[];
    expect(chips.length).toBe(2);
    for (const c of chips) expect(c.y - 13 + 18).toBeLessThanOrEqual(top); // a chip's bottom (its top is 13 px over y, 18 px tall)
    expect(chips[0].y).not.toBe(chips[1].y); // two rows
  });
});

describe("an area's key swatch looks like the area", () => {
  test("a soft fill with the series' line round it, as faint as the area", () => {
    const p = drawn("kind: area\nstacked: true\nx: [1, 2, 3]\nseries:\n  - { name: a, data: [1, 2, 3] }\n  - { name: b, data: [0, 1, 2] }\n", 1280).prims;
    const sw = p.filter((x) => /^key:\d+:g$/.test(x.key)) as any[];
    expect(sw.length).toBe(2);
    for (const s of sw) { expect(s.k).toBe("rect"); expect(s.fill).toBe("soft"); expect(s.edge).toBe("role"); expect(s.cls).toContain("xy-key-area"); }
  });
});

describe("a bubble chart has a size key", () => {
  test("its key names the smallest and the largest size, with a small and a large circle", () => {
    const p = drawn("kind: bubble\nx: { label: questions }\ny: { label: seconds }\nseries:\n  - name: templates\n    data: [[3, 8, 120], [6, 14, 480], [9, 30, 60]]\n", 1280).prims;
    const t = p.filter((x) => x.k === "text" && /^key:1000:t$/.test(x.key)) as any[];
    expect(t.length).toBe(1);
    expect(t[0].lines[0]).toBe("Size: 60 to 480");
    const g = p.filter((x) => /^key:1000:[gm]$/.test(x.key)) as any[];
    expect(g.map((d) => d.r).sort((a, b) => a - b)).toEqual([2.5, 5]);
  });
  test("a scatter chart has none", () => {
    const p = drawn("kind: scatter\nseries:\n  - name: s\n    data: [[1, 2], [3, 4]]\n", 1280).prims;
    expect(p.some((x) => x.key.startsWith("key:1000"))).toBe(false);
  });
});

describe("a log axis does not add an empty decade", () => {
  test("points from 1 start the x axis at 1, not 0.1 (format/24)", () => {
    const p = drawn("kind: scatter\nx: { label: questions, scale: log }\ny: { label: milliseconds, scale: log }\nseries:\n  - name: runs\n    data: [[1, 12], [3, 35], [10, 120], [30, 340], [100, 1200], [300, 3500]]\n", 1280).prims;
    const xt = p.filter((x) => x.k === "text" && /^t:x:/.test(x.key)).map((x: any) => x.lines[0]);
    expect(xt).not.toContain("0.1");
    expect(xt[0]).toBe("1");
  });
});

describe("the page hands no max to a chart that never moves", () => {
  test("the server's markup of a lines-only chart has an axis near its numbers, not from 0", async () => {
    const React = (await import("react")).default, { renderToString } = await import("react-dom/server");
    const { parse } = await import("../../../src/index"), { DhDocument } = await import("../../../src/react/index");
    const page = "# P\n\n```chart\n" + LINES + "```\n";
    const html = renderToString(React.createElement(DhDocument, { doc: parse(page, { path: "p.dh.md" }) as any }));
    const svg = html.slice(html.indexOf('data-dh-slot="chart-svg"'));
    const words = [...svg.slice(0, svg.indexOf("</svg>")).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(words).toContain("800");
    expect(words).not.toContain("0");
  });
});
