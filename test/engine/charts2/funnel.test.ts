// charts2: the funnel is one continuous shape and a small stage is still a band (the review saw 100% -> 70% -> 18% and a 10 px "Paid")
import { describe, expect, test } from "bun:test";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { kindBuild, kindHeight, specOfView } from "../../../src/engine/charts/kinds";
import { stageLabel, stageWidth } from "../../../src/engine/charts/kinds/funnel";
import { fences } from "../chwire/axis-kinds-fences";

const corners = (d: string): number[] => (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
const draw = (w: number) => {
  const f = fences().find((x) => x.kind === "funnel" && x.views[0].kind === "funnel" && (x.views[0] as any).stages.length === 4)!;
  const v = f.views[0], { spec } = specOfView(v), h = kindHeight(spec, w), phone = w < 480;
  setPhoneFont(phone);
  return { v: v as any, ...kindBuild(spec, { x: 0, y: 0, w, h }, { phone, look: "stage", measure, step: 0, prev: null, max: [], lit: [] } as any) };
};

describe("the funnel's shape", () => {
  test("a stage's width is the square root of its share", () => {
    expect(stageWidth(100, 100, 760)).toBe(760);
    expect(stageWidth(25, 100, 760)).toBe(380);
    expect(stageWidth(0, 100, 760)).toBe(6);
  });
  for (const w of [390, 1280]) test(`at ${w}: each band ends as wide as the next one starts, and the last stage is at least a sixth of the first`, () => {
    const { prims, v } = draw(w);
    const bands = v.stages.map((_: any, i: number) => prims.find((p) => p.key === `stage:${i}`) as any);
    const width = (d: string, row: "top" | "bot") => { const c = corners(d); return row === "top" ? c[2] - c[0] : c[3] - c[5]; }; // M x0 y0 H x1 L x2 y1 H x3 Z
    for (let i = 0; i + 1 < bands.length; i++) expect(Math.abs(width(bands[i].d, "bot") - width(bands[i + 1].d, "top"))).toBeLessThan(0.05);
    expect(width(bands[bands.length - 1].d, "top")).toBeGreaterThan(width(bands[0].d, "top") / 6.5);
  });
  test("at 390 the share of the first is shown where it fits", () => {
    const { prims } = draw(390);
    expect(prims.some((p) => /^stage:\d:share$/.test(p.key))).toBe(true);
  });
});

describe("a long name in a full-width band", () => {
  test("goes over its count inside the band before it is cut", () => {
    const l = stageLabel("Visited the site", "48,200", "100%", 330, 140, 340);
    expect(l.name).toBe("Visited the site");
    expect(l.value).toBe("48,200");
  });
});

describe("names under the bars stay inside the chart", () => {
  test("a staggered last name wider than its band slides in from the right edge (format/66 at 390: 'Novembe')", async () => {
    const { nameWords } = await import("../../../src/engine/charts/kinds/axisframe");
    const names = ["October", "New", "Churn", "Refunds", "Subtotal", "Price rise", "November"], keys = names.map((_, i) => `k${i}`), band = 44;
    const ctx = { measure: (s: string) => s.length * 6.5 } as any;
    const out = nameWords(names, keys, (i) => i * band + band / 2, 100, band, ctx, 2, [0, names.length * band]) as any[];
    for (const p of out) { const half = (Math.max(...p.lines.map((l: string) => l.length * 6.5)) * 1.12) / 2; expect(p.x - half).toBeGreaterThanOrEqual(0); expect(p.x + half).toBeLessThanOrEqual(names.length * band); }
    expect(out.some((p) => p.lines[0] === "November")).toBe(true);
  });
});
