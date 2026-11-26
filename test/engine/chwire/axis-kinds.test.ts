// histogram, boxplot, violin, funnel, waterfall as primitives: every sample chart at 390 and 1280 wide, no NaN, the same keys at another
// step, every mark inside the chart, no two value labels on top of each other, the LLM text unchanged, the popover words unchanged.
import { describe, expect, test } from "bun:test";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { llmText, type View } from "../../../src/parts/chart-kinds/compute";
import { KINDS, kindBuild, kindHeight, specOfView } from "../../../src/engine/charts/kinds";
import { numbersOf } from "../../../src/engine/charts/kinds/common";
import { stageLabel } from "../../../src/engine/charts/kinds/funnel";
import { nameWords } from "../../../src/engine/charts/kinds/axisframe";
import type { Prim } from "../../../src/engine/types";
import { fences, MINE } from "./axis-kinds-fences";

const WIDTHS = [390, 1280];
const ctxOf = (w: number, view?: View, all?: View[]) => {
  const phone = w < 480; setPhoneFont(phone);
  const max = all ? all.map((v) => numbersOf(v)).reduce((a, b) => a.map((row, i) => row.map((x, j) => Math.max(x, b[i]?.[j] ?? -Infinity)))) : [];
  return { phone, look: "stage" as const, measure, step: 0, prev: null, max, lit: [] as string[], view };
};
const build = (v: View, w: number, all?: View[]) => {
  const { spec } = specOfView(v), h = kindHeight(spec, w), c = ctxOf(w, v, all);
  const rect = { x: 0, y: 0, w, h };
  return { rect, ...kindBuild(spec, rect, c) };
};
const nums = (p: Prim): number[] => {
  switch (p.k) {
    case "text": case "chip": case "dot": return [p.x, p.y, ...(p.k === "dot" ? [p.r] : [])];
    case "rect": case "box": return [p.rect.x, p.rect.y, p.rect.w, p.rect.h];
    case "path": return [...(p.d.match(/-?\d+\.?\d*(?:e-?\d+)?/g) ?? [])].map(Number);
  }
};
const all = fences();

describe("the sample charts of the five kinds", () => {
  test("there are samples of every kind", () => { for (const k of MINE) expect(all.some((f) => f.kind === k)).toBe(true); });
  for (const f of all) for (const w of WIDTHS) for (let s = 0; s < f.views.length; s++) {
    const v = f.views[s];
    test(`${f.name} step ${s + 1} at ${w}: drawn, no NaN, unique keys, marks inside, words at least 11 px`, () => {
      const b = build(v, w, f.views);
      expect(b.prims.length).toBeGreaterThan(3);
      const keys = b.prims.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const p of b.prims) {
        for (const x of nums(p)) expect(Number.isFinite(x)).toBe(true);
        expect(JSON.stringify(p)).not.toContain("NaN");
        if (p.k === "text") expect(["sub", "body", "title", "small-b", "chip", "lane"]).toContain(p.font);
      }
      expect(b.marks.length).toBeGreaterThan(0);
      const mk = b.marks.map((m) => m.key);
      expect(new Set(mk).size).toBe(mk.length);
      for (const m of b.marks) {
        expect(m.rect.x).toBeGreaterThanOrEqual(b.rect.x - 0.5); expect(m.rect.y).toBeGreaterThanOrEqual(b.rect.y - 0.5);
        expect(m.rect.x + m.rect.w).toBeLessThanOrEqual(b.rect.x + b.rect.w + 0.5); expect(m.rect.y + m.rect.h).toBeLessThanOrEqual(b.rect.y + b.rect.h + 0.5);
        expect(m.rect.w).toBeGreaterThan(0); expect(m.rect.h).toBeGreaterThan(0);
        if (!m.skip) expect(m.title.length).toBeGreaterThan(0);
      }
    });
    test(`${f.name} step ${s + 1} at ${w}: nothing but a chip and a mark's own words sits outside the rect`, () => {
      const b = build(v, w, f.views);
      for (const p of b.prims) {
        if (p.k === "rect" || p.k === "box") { expect(p.rect.x).toBeGreaterThanOrEqual(-1); expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(w + 1); expect(p.rect.y).toBeGreaterThanOrEqual(-1); expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(b.rect.h + 1); }
        if (p.k === "text") { const tw = measure(p.lines[0], p.font), l = p.anchor === "start" ? p.x : p.anchor === "end" ? p.x - tw : p.x - tw / 2; expect(l).toBeGreaterThanOrEqual(-1); expect(l + tw).toBeLessThanOrEqual(w + 1); }
      }
    });
    test(`${f.name} step ${s + 1} at ${w}: no two value labels overlap`, () => {
      const b = build(v, w, f.views);
      const boxes = b.prims.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text" && /:v$|:val$|:share$|:name2?$|:drop$/.test(p.key)).map((p) => {
        const tw = measure(p.lines[0], p.font), l = p.anchor === "start" ? p.x : p.anchor === "end" ? p.x - tw : p.x - tw / 2;
        return { key: p.key, l, r: l + tw, t: p.y - 10, b: p.y + 3 };
      });
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        const hit = a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5;
        if (hit) throw new Error(`${a.key} and ${c.key} overlap`);
      }
    });
  }
  for (const f of all) for (const s of f.views.keys()) test(`${f.name} step ${s + 1}: the LLM text is the old one`, () => {
    const { spec, values } = specOfView(f.views[s]);
    const draw = KINDS.find((k) => k.kind === f.kind)!;
    expect(draw.llm(spec, values).join("\n")).toBe(llmText(f.kind, f.title, [{ errors: [], warnings: [], view: f.views[s] }]));
  });
  for (const f of all) test(`${f.name}: the height is the same at every width of a class`, () => {
    const { spec } = specOfView(f.views[0]);
    expect(kindHeight(spec, 350)).toBe(kindHeight(spec, 479)); expect(kindHeight(spec, 640)).toBe(kindHeight(spec, 1280));
    expect(kindHeight(spec, 390)).toBe(kindHeight(spec, 1280));
  });
});

/** a view with its numbers moved (a step or a control): same shape, other counts, middles and values */
function nudge(v: View): View {
  const j = JSON.parse(JSON.stringify(v)) as View;
  switch (j.kind) {
    case "histogram": for (const s of j.series) { s.counts = s.counts.map((c) => (c > 2 ? c - 1 : c + 3)); s.n = s.counts.reduce((a, b) => a + b, 0); } break;
    case "boxplot": case "violin": for (const s of j.stats) { s.median += 3; s.q1 -= 2; s.q3 += 5; s.mean += 1; s.hi += 4; s.max += 4; s.lo -= 1; s.outliers = s.outliers.map((o) => o + 2); } break;
    case "funnel": j.stages.forEach((s) => { s.value = Math.round(s.value * 1.2); }); break;
    case "waterfall": j.rows.forEach((r) => { r.change = r.change * 1.1; r.from = r.from * 1.1; r.to = r.to * 1.1; r.total = r.total * 1.1; }); break;
    default: break;
  }
  return j;
}
const keyset = (v: View, w: number, all?: View[]) => build(v, w, all).prims.map((p) => p.key);
describe("keys stay the same when the numbers change", () => {
  for (const f of all) for (const w of WIDTHS) test(`${f.name} at ${w}: a nudge of the numbers keeps every primitive key but a word that fits or not`, () => {
    const a = f.views[0], b = nudge(a), both = [a, b];
    // charts2: a waterfall whose totals stay high has its axis start under its own lowest total, so its y ticks follow the numbers
    const skip = f.kind === "waterfall" ? /:v$|:o:\d+$|^t:x:|:name2$|:share$|^[gt]:y:|:brk$/ : /:v$|:o:\d+$|^t:x:|:name2$|:share$/;
    const ka = keyset(a, w, both).filter((k) => !skip.test(k)), kb = keyset(b, w, both).filter((k) => !skip.test(k));
    expect(kb).toEqual(ka);
  });
  for (const f of all.filter((x) => x.views.length > 1)) for (const w of WIDTHS) test(`${f.name} at ${w}: the steps of the chart have the same keys (words that fit or not aside)`, () => {
    const sets = f.views.map((v) => keyset(v, w, f.views).filter((k) => !/:name2$|:share$/.test(k)));
    for (const k of sets.slice(1)) expect(k).toEqual(sets[0]);
  });
  test("a histogram scale stays still between steps: the largest count of the story sets it", () => {
    const h = all.find((f) => f.kind === "histogram")!.views[0] as Extract<View, { kind: "histogram" }>;
    const small: View = { ...h, series: h.series.map((s) => ({ ...s, counts: s.counts.map((c) => Math.round(c / 4)) })) };
    const ticks = (v: View, allv: View[]) => build(v, 1280, allv).prims.filter((p) => p.key.startsWith("t:y:")).map((p) => (p as any).lines[0]);
    expect(ticks(small, [h, small])).toEqual(ticks(h, [h, small]));
    expect(ticks(small, [small])).not.toEqual(ticks(h, [h]));
  });
  test("a box plot scale stays still between steps (the largest max of the story sets the top)", () => {
    const b: any = all.find((f) => (f.kind as string) === "boxplot")!.views[0];
    const low: View = { ...b, stats: b.stats.map((s: any) => ({ ...s, max: s.max / 2, hi: s.hi / 2, q3: s.q3 / 2, median: s.median / 2, q1: s.q1 / 2, min: s.min / 2, lo: s.lo / 2, mean: s.mean / 2, outliers: [] })) };
    // the top of the scale is the largest max of the story; the bottom follows each step's own smallest value (no number of the story gives a smallest)
    const top = (v: View, allv: View[]) => build(v, 1280, allv).prims.filter((p) => p.key.startsWith("t:y:")).map((p) => p.key).pop();
    expect(top(low, [b, low])).toBe(top(b, [b, low]));
    const tops = (v: View, allv: View[]) => build(v, 1280, allv).prims.filter((p) => p.key.startsWith("t:y:")).map((p) => (p as any).y);
    expect(Math.min(...tops(low, [b, low]))).toBe(Math.min(...tops(b, [b, low])));
  });
});

describe("the popover words are the old ones", () => {
  test("a histogram bin: its range, its count and share; the marks with their text", () => {
    const f = all.find((x) => x.kind === "histogram" && (x.views[0] as any).marks.length)!, v = f.views[0] as Extract<View, { kind: "histogram" }>;
    const b = build(v, 1280);
    const bin = b.marks.find((m) => m.key === "bin:0")!;
    expect(bin.title).toMatch(/ to /); expect(bin.meta).toBe(`${v.series[0].counts[0]} of ${v.series[0].n} values · ${Math.round((v.series[0].counts[0] / v.series[0].n) * 1000) / 10}%`);
    const marks = b.marks.filter((m) => m.kind === "mark");
    expect(marks.map((m) => m.title)).toEqual(v.marks.map((m) => m.label));
    expect(marks.map((m) => m.text)).toEqual(v.marks.map((m) => m.text));
    expect(b.marks.filter((m) => m.skip).map((m) => m.key)).toEqual(["pick"]);
    expect(b.marks.filter((m) => m.kind === "bin").length).toBe(v.edges.length - 1);
    expect(b.marks.findIndex((m) => m.kind === "mark")).toBeGreaterThan(b.marks.findIndex((m) => m.key === `bin:${v.edges.length - 2}`));
  });
  test("a box: five numbers and the outliers; a stage: share of the first and the drop; a bar of a waterfall: the running total", () => {
    const bx = build(all.find((x) => x.kind === "boxplot")!.views[0], 1280).marks[0];
    expect(bx.meta).toMatch(/ values$/); expect(bx.text).toMatch(/^min .* · p25 .* · median .* · p75 .* · max /);
    const fu = build(all.find((x) => x.kind === "funnel")!.views[0], 1280).marks;
    expect(fu[0].meta).toMatch(/ · 100% of the first$/); expect(fu[0].text).toBeUndefined(); expect(fu[1].text).toMatch(/ of the stage before; .* dropped out\.$/);
    const wf = build(all.find((x) => x.kind === "waterfall")!.views[0], 1280).marks;
    expect(wf[0].meta).toMatch(/^Start /); expect(wf[1].meta).toMatch(/^\+.* → /); expect(wf[1].text).toMatch(/^Running total goes from /); expect(wf.find((m) => m.meta?.startsWith("Total"))).toBeDefined();
  });
  test("the dashed marks of a box plot are marks too", () => {
    const v: any = JSON.parse(JSON.stringify(all.find((x) => (x.kind as string) === "boxplot")!.views[0]));
    v.marks = [{ label: "p95", value: v.stats[0].q3, text: "95% of the values are at or below that." }];
    const m = build(v, 1280).marks.filter((x) => x.kind === "mark");
    expect(m.length).toBe(1); expect(m[0].title).toBe("p95"); expect(m[0].text).toBe("95% of the values are at or below that.");
  });
});

describe("the funnel's words (the stage label rule, as redesigned)", () => {
  test("inside when they fit, beside the band when not, the count never cut", () => {
    expect(stageLabel("Paid", "1,350", "2.8%", 400, 380, 640)).toMatchObject({ anchor: "middle", share: "2.8%" });
    const side = stageLabel("A name that is far too long for the narrow band", "1,350", "2.8%", 60, 40, 640);
    expect(side.stack).toBe(true); expect(side.value).toBe("1,350"); expect(side.anchor).toBe("start");
    expect(stageLabel("A name that is far too long for the narrow band", "1,350", "", 60, 40, 200).value).toBe("1,350");
  });
  test("a stage's words keep their keys: name, val, then share and the drop", () => {
    const k = build(all.find((x) => x.kind === "funnel")!.views[0], 1280).prims.map((p) => p.key);
    for (const s of ["stage:0", "stage:0:name", "stage:0:val", "stage:0:drop", "stage:3"]) expect(k).toContain(s);
  });
});

describe("names wider than their band stagger instead of being cut", () => {
  test("seven one-word names in 41 px bands: every second one a line lower, none cut or dropped, none over its neighbour", () => {
    const names = ["Start", "Launch", "Outage", "Press", "Subtotal", "Referral", "End"], keys = names.map((_, i) => `k${i}`), band = 41;
    const ctx = { measure: (s: string) => s.length * 6.2 } as any;
    const out = nameWords(names, keys, (i) => i * band + 20, 100, band, ctx, 2) as any[];
    expect(out.length).toBe(7);
    for (const p of out) expect(p.lines[0].includes("…")).toBe(false);
    expect(new Set(out.map((p) => p.y)).size).toBe(2);
    out.forEach((p, i) => { expect(p.y).toBe(100 + (i % 2) * 16); });
  });
  test("a name wider than two bands is still cut or thinned as before", () => {
    const out = nameWords(["Averyveryverylongname", "b"], ["a", "b"], (i) => i * 30 + 15, 0, 30, { measure: (s: string) => s.length * 6.2 } as any, 2) as any[];
    expect(out.every((p) => p.y === 0)).toBe(true);
  });
});
