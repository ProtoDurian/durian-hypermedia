// Showcase feedback, charts: compact numbers, the funnel's look and the new fixtures. Pure checks (a number function, a layout
// function, server markup); the compact axes, the glide and the popovers of the drawn chart are in test/engine/chwire/page.test.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse, check } from "../src/index";
import { compactNum } from "../src/core/compact-num";
import { evalChart11 } from "../src/core/chart11";
import { fmtValue } from "../src/parts/chart-kinds/fmt";
import { stageLabel } from "../src/engine/charts/kinds/funnel";
import { DhDocument } from "../src/react/index";

const ROOT = join(import.meta.dir, "..");

describe("compact numbers", () => {
  test("1000 is 1k, 1500 is 1.5k, 2000000 is 2M; below 1000 the number is as it is", () => {
    expect(compactNum(1000)).toBe("1k");
    expect(compactNum(1500)).toBe("1.5k");
    expect(compactNum(2_000_000)).toBe("2M");
    expect(compactNum(1_250_000)).toBe("1.25M");
    expect(compactNum(12_000)).toBe("12k");
    expect(compactNum(120_000)).toBe("120k");
    expect(compactNum(3_000_000_000)).toBe("3B");
    expect(compactNum(999)).toBe("999");
    expect(compactNum(0)).toBe("0");
    expect(compactNum(2.5)).toBe("2.5");
    expect(compactNum(-1500)).toBe("-1.5k");
  });
  test("a number that rounds up to the next unit says so: 999950 is 1M, not 1000k", () => {
    expect(compactNum(999_950)).toBe("1M");
    expect(compactNum(999_400)).toBe("999k");
  });
  test("not a number: left as the JS word, never thrown", () => {
    expect(compactNum(Number.NaN)).toBe("NaN");
    expect(() => compactNum(Infinity)).not.toThrow();
  });
});

describe("compact axes on a narrow chart (the value formats)", () => {
  test("a plain tick is compact only when narrow and compact are both asked; the card and the table keep the whole number", () => {
    expect(fmtValue(1500, "number", "USD", true, true)).toBe("1.5k");
    expect(fmtValue(1500, "number", "USD", true, false)).toBe("1,500");
    expect(fmtValue(1500, "number", "USD", false, true)).toBe("1,500");
    expect(fmtValue(1500, undefined, undefined, true, true)).toBe("1.5k");
  });
  test("the unit formats keep their words when narrow", () => {
    expect(fmtValue(2_000_000, "money", "USD", true, true)).toBe("$2M");
    expect(fmtValue(40, "percent", "USD", true, true)).toBe("40%");
    expect(fmtValue(2048, "bytes", "USD", true, true)).toBe("2 KiB");
    expect(fmtValue(90, "duration", "USD", true, true)).toBe("1m 30s");
    expect(fmtValue(1500, "duration-ms", "USD", true, true)).toBe("1.5s");
  });
});

describe("the funnel", () => {
  test("words go inside a wide band on one line, with the share on a wide chart", () => {
    const l = stageLabel("Visited", "1,000", "100%", 600, 560, 640);
    expect(l).toMatchObject({ name: "Visited", value: "1,000", share: "100%", anchor: "middle", x: 320 });
    expect(l.stack).toBeUndefined();
  });
  test("a narrow chart has no share; a band too thin for its words puts them beside it, the name over the count", () => {
    const inside = stageLabel("Visited", "1,000", "", 350, 300, 366);
    expect(inside.anchor).toBe("middle");
    const beside = stageLabel("Created", "8,700", "", 90, 40, 366);
    expect(beside).toMatchObject({ anchor: "start", stack: true, name: "Created", value: "8,700" });
    expect(beside.x).toBeGreaterThan(183 + 45);
  });
  test("a name too long for one line beside the band takes two, broken at a space; the second is cut only past the room, the count never is", () => {
    const two = stageLabel("Created an account", "8,700", "", 90, 40, 366);
    expect(two).toMatchObject({ stack: true, anchor: "start", name: "Created an", name2: "account", value: "8,700" });
    const l = stageLabel("A very long stage name that cannot fit anywhere near here", "48,200", "", 40, 20, 366);
    expect(l.stack).toBe(true);
    expect(l.name2?.endsWith("…")).toBe(true);
    expect(l.value).toBe("48,200");
  });
  test("a wide band with a long name keeps it inside with the name cut when there is no room beside", () => {
    const l = stageLabel("A very long stage name that is longer than the band", "48,200", "", 340, 330, 366);
    expect(l.anchor).toBe("middle"); expect(l.name.endsWith("…")).toBe(true); expect(l.value).toBe("48,200");
  });
  const SRC = "# P\n\n```chart\nkind: funnel\ntitle: From visit to paid\ndata:\n  - [Visited the site, 48200]\n  - [Created an account, 8700]\n  - [Paid, 1350]\n```\n";
  const markup = () => renderToString(React.createElement(DhDocument, { doc: parse(SRC, { path: "f.dh.md" }) as any }));
  test("the drawing: one band per stage, the drop in the gap between stages in words, every name and count as text", () => {
    const h = markup();
    expect((h.match(/class="kd-fun /g) ?? []).length).toBe(3);
    expect((h.match(/class="kd-drop"/g) ?? []).length).toBe(2);
    expect(h).toContain("−82%"); // 8,700 of 48,200 fell 82%
    for (const w of ["Visited the site", "48,200", "Created an account", "8,700", "Paid", "1,350"]) expect(h).toContain(w);
  });
  test("a percent never carries a stray decimal (82%, not 82.0%)", () => { expect(markup()).not.toMatch(/\.0%/); });
});

describe("the new fixtures", () => {
  for (const f of ["82-chart-pie-radar-controls", "83-chart-large-numbers-on-a-phone"]) {
    test(`${f} has no doccheck issue`, () => {
      const d = parse(readFileSync(join(ROOT, `fixtures/format/${f}.dh.md`), "utf8"), { path: `format/${f}.dh.md` });
      expect(check(d)).toEqual([]);
    });
  }
  test("the pie and the radar of fixture 82 have a control that changes their numbers", () => {
    const d = parse(readFileSync(join(ROOT, "fixtures/format/82-chart-pie-radar-controls.dh.md"), "utf8"), { path: "x.dh.md" });
    const charts = d.blocks.filter((b: any) => b.type === "chart") as any[];
    expect(charts.map((c) => c.chart.kind)).toEqual(["pie", "radar"]);
    for (const c of charts) {
      const lo = evalChart11(c.chart, { ...Object.fromEntries(c.controls.filter((x: any) => x.kind !== "button").map((x: any) => [x.name, x.value])) }, 0);
      const slider = c.controls.find((x: any) => x.kind === "slider");
      const hi = evalChart11(c.chart, { ...Object.fromEntries(c.controls.filter((x: any) => x.kind !== "button").map((x: any) => [x.name, x.value])), [slider.name]: slider.max }, 0);
      expect(lo.error).toBeUndefined(); expect(hi.error).toBeUndefined();
      expect(JSON.stringify(hi.series[0].data)).not.toBe(JSON.stringify(lo.series[0].data));
    }
  });
});
