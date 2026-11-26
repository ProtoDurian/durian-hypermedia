// eng-stagebars: the stage's bar words in the chart system (charts/xy/stagebars.ts, lowered by parse/lower-stage.ts), and a hash
// table's box as wide as its widest row (graph/legacy.ts).
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { beginDocument } from "../../../src/core/stage-budget";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { CHART } from "../../../src/engine/charts";
import type { ChartSpec, Prim } from "../../../src/engine/types";

const ROOT = join(import.meta.dir, "../../..");
beforeEach(() => { beginDocument(); });
const compiled = (file: string) => {
  const p = parse(readFileSync(join(ROOT, file), "utf8"), { path: "x.dh.md" });
  return tryEngine((p as any).blocks.find((b: any) => b.type === "animation")).c!;
};
const frame = (file: string, width: number, step: number) => { setPhoneFont(width < 480); return compiled(file).plan(width).frame(step); };
const byKey = (ps: Prim[], k: string) => ps.find((p) => p.key === k);
const words = (ps: Prim[]) => ps.flatMap((p) => (p.k === "text" ? p.lines : p.k === "chip" ? [p.words] : []));
const F22 = "fixtures/stage/22-animation-a-bar-chart-in-a-scene.dh.md";

describe("lowering: the bars block becomes one chart thing with the stage's own words", () => {
  const c = compiled(F22), t = Object.values(c.model.things).find((x) => x.chart)!;
  test("kind bar, drawn as the stage's bars, the labels as categories, the role from the block", () => {
    expect(t.chart!.kind).toBe("bar"); expect(t.chart!.opts.stage).toBe("bars"); expect(t.chart!.x).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]); expect(t.chart!.series[0].role).toBe("server");
  });
  test("every step's bar words travel as opts and no layout word is left unowned", () => {
    const s = JSON.parse(t.chart!.opts["bar-steps"]);
    expect(s["1"].peak).toBe("busiest 1.4×"); expect(s["1"].big).toEqual(["1.4×", "busiest ÷ average"]); expect(s["2"].limit).toEqual({ v: 1.2, s: "cap 1.2×" });
    expect(s["3"].moves).toEqual([{ from: 4, to: 0, k: 2 }, { from: 5, to: 1, k: 1 }]); expect(s["4"].bar.i).toBe(5);
    expect(c.problems.filter((p) => /is a word no layout owns/.test(p.msg))).toEqual([]);
  });
  test("the scale's top comes from the whole story, so it never changes between steps", () => {
    expect(+t.chart!.opts["bar-most"]).toBe(1.4);
  });
});

describe("drawing: every word of the old block is a primitive with a key that stays for the whole story", () => {
  test("step 1 at 1280: bars, peak line and words, readout, tabs, reference line, axis words", () => {
    const f = frame(F22, 1280, 1);
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) expect(byKey(f, `b:${d}:s0`)).toBeDefined();
    expect(byKey(f, "peak:line")).toBeDefined(); expect(byKey(f, "limit:line")).toBeUndefined();
    const w = words(f);
    for (const s of ["One barista", "Two baristas", "busiest 1.4×", "1.4×", "busiest ÷ average", "cups by day", "the week of 3 March", "average", "1×", "day of the week · bar = cups sold ÷ the weekly average"]) expect(w.some((x) => x.includes(s))).toBe(true);
    expect(byKey(f, "tabline")).toBeDefined();
  });
  test("the peak bar is the bad tone, the others the page's role; Friday is the highest", () => {
    const f = frame(F22, 1280, 1), fri = byKey(f, "b:Fri:s0") as any, mon = byKey(f, "b:Mon:s0") as any;
    expect(fri.tone).toBe("bad"); expect(mon.tone).toBeNull(); expect(mon.role).toBe("server"); expect(fri.rect.h).toBeGreaterThan(mon.rect.h);
  });
  test("step 2: a dashed limit with its words; Saturday is over it (warn)", () => {
    const f = frame(F22, 1280, 2), lim = byKey(f, "limit:line") as any;
    expect(lim.dashed).toBe(true); expect(words(f)).toContain("cap 1.2×"); expect((byKey(f, "b:Sat:s0") as any).tone).toBe("warn");
  });
  test("step 3: two moves as dashed arrows, the takers' growth as stacked blocks, takers good, givers warn", () => {
    const f = frame(F22, 1280, 3);
    expect(byKey(f, "move:4:0")).toBeDefined(); expect(byKey(f, "move:5:1")).toBeDefined();
    expect((byKey(f, "move:4:0") as any).arrow).toBe("end");
    expect(f.filter((p) => p.key.startsWith("blk:Mon:")).length).toBe(2); expect(f.filter((p) => p.key.startsWith("blk:Tue:")).length).toBe(1);
    expect((byKey(f, "b:Mon:s0") as any).tone).toBe("good");
  });
  test("step 4: the second tab is lit, the underline moved to it, a chip over Saturday", () => {
    const f3 = frame(F22, 1280, 3), f4 = frame(F22, 1280, 4);
    expect((byKey(f4, "tab:1") as any).tone).toBe("accent"); expect((byKey(f4, "tab:0") as any).tone ?? null).toBeNull();
    expect((byKey(f4, "tabline") as any).rect.x).toBeGreaterThan((byKey(f3, "tabline") as any).rect.x);
    const chip = byKey(f4, "lit:chip") as any; expect(chip.words).toBe("the busiest");
    expect((byKey(f4, "b:Sat:s0") as any).tone).toBe("accent");
  });
  test("the plot keeps its place in every step (the frame never moves, only heights and paint)", () => {
    for (const w of [1280, 390]) {
      const base = frame(F22, w, 1);
      for (let k = 2; k <= 4; k++) {
        const f = frame(F22, w, k);
        for (const key of ["g:y:0", "g:y:1", "g:y:1.5", "x:0", "x:6", "ref:0"]) {
          const a = byKey(base, key) as any, b = byKey(f, key) as any;
          expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // same place, same words
        }
        for (const key of ["tab:0", "tab:1"]) expect([(byKey(f, key) as any).x, (byKey(f, key) as any).y]).toEqual([(byKey(base, key) as any).x, (byKey(base, key) as any).y]);
        for (const d of ["Mon", "Sun"]) expect((byKey(f, `b:${d}:s0`) as any).rect.x).toBe((byKey(base, `b:${d}:s0`) as any).rect.x);
      }
    }
  });
  test("at 390 the reference line's name sits inside the part", () => {
    const f = frame(F22, 390, 1), t = byKey(f, "refl:0") as any, pl = compiled(F22).plan(390);
    expect(t.x + measure("average", "sub")).toBeLessThanOrEqual(pl.w + 1);
  });
  test("gt/09: the majority line's words stay inside the part at 390 (the stage's own drawing is no longer needed)", () => {
    const c = compiled("fixtures/gt/09-election-count.dh.md"), pl = c.plan(390), f = pl.frame(2);
    setPhoneFont(true);
    const t = byKey(f, "refl:0") as any;
    expect(t.lines[0]).toBe("majority of all 150"); expect(t.x + measure("majority of all 150", "sub")).toBeLessThanOrEqual(pl.w + 1);
  });
});

describe("a bar kind without the stage's words is untouched", () => {
  test("opts.stage absent: the generic bar drawing", () => {
    setPhoneFont(false);
    const spec: ChartSpec = { kind: "bar", title: "", unit: null, x: ["a", "b"], series: [{ name: "s", role: null, values: [1, 2] }], flags: [], opts: {} };
    const ps = CHART.bar.draw(spec, [[1, 2]], { x: 0, y: 0, w: 400, h: 200 }, { phone: false, look: "stage", measure, step: 1, prev: null, max: [[1, 2]], lit: [] });
    expect(ps.some((p) => p.key === "b:a:s1" || p.key.startsWith("b:a"))).toBe(true); expect(byKey(ps, "tabline")).toBeUndefined();
  });
});

describe("columns: the dots' columns keep their height in every step", () => {
  test("stage/21 gives the most places any column holds", () => {
    const t = Object.values(compiled("fixtures/stage/21-animation-counted-columns.dh.md").model.things).find((x) => x.chart)!;
    expect(+t.chart!.opts.max).toBe(35);
  });
});

describe("a hash table's box holds its widest row (format/49)", () => {
  for (const w of [1280, 390]) test(`at ${w}`, () => {
    setPhoneFont(w < 480);
    const c = compiled("fixtures/format/49-animation-hash-table-with-a-collision.dh.md"), pl = c.plan(w);
    for (let k = 1; k < c.states.length; k++) {
      const box = pl.rects(k).h, rows = pl.frame(k).filter((p: any) => p.k === "rect" && /^h:b\d$/.test(p.key)) as any[];
      expect(box).toBeDefined(); expect(rows.length).toBe(5);
      for (const r of rows) { expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(box.x + box.w); expect(r.rect.x).toBeGreaterThanOrEqual(box.x); }
    }
  });
});

describe("columns and units draw as the stage's did", () => {
  const F21 = "fixtures/stage/21-animation-counted-columns.dh.md", F07 = "fixtures/stage/07-animation-counted-units.dh.md";
  test("columns: the caption stands above the columns; a lit column's frame is the thick accent; the plot keeps its place", () => {
    const f1 = frame(F21, 1280, 1), f2 = frame(F21, 1280, 2);
    expect(words(f1).some((w) => w.startsWith("books returned each month"))).toBe(true);
    const lit = f2.find((p) => p.key === "col:6") as any; expect(lit.cls).toContain("ch-lit"); expect(f2.find((p) => p.key === "col:0")).toBeDefined();
    const a = f1.find((p) => p.key === "col:0") as any, b = f2.find((p) => p.key === "col:0") as any;
    expect(b.rect).toEqual(a.rect);
  });
  test("units: each unit is a small square (a rect), 64 of them", () => {
    const f = frame(F07, 1280, 0).filter((p) => p.k === "rect" && p.key.startsWith("u:"));
    expect(f.length).toBe(64);
  });
});

describe("charts keep their words still and whole (eng-stagebars)", () => {
  const bar = (x: string[], v: number[], opts: Record<string, string> = {}): ChartSpec => ({ kind: "bar", title: "", unit: null, x, series: [{ name: "s", role: null, values: v }], flags: [], opts });
  const cx = (max: number[][]) => ({ phone: false, look: "stage" as const, measure, step: 0, prev: null, max, lit: [] as string[] });
  test("the scale reaches the numbers of categories past this state's own count (a slider that adds bars)", () => {
    setPhoneFont(false);
    const few = CHART.bar.draw(bar(["a", "b"], [1, 2]), [[1, 2]], { x: 0, y: 0, w: 400, h: 200 }, cx([[1, 2]]));
    const more = CHART.bar.draw(bar(["a", "b"], [1, 2]), [[1, 2]], { x: 0, y: 0, w: 400, h: 200 }, cx([[1, 2, 3, 400]]));
    const top = (ps: Prim[]) => Math.max(...ps.filter((p) => p.key.startsWith("t:y:") && p.k === "text").map((p) => +(p as any).lines[0].replace(/[^\d.]/g, "")));
    expect(top(few)).toBeLessThan(10); expect(top(more)).toBeGreaterThanOrEqual(400);
  });
  test("a log and linear toggle keeps the plot's left edge in both scales", () => {
    setPhoneFont(false);
    const mk = (log: boolean) => ({ ...bar(["2020", "2021", "2022"], [30, 8100, 410000], { "y.toggle": "1", ...(log ? { "y.scale": "log" } : {}) }) });
    const left = (s: ChartSpec) => (CHART.bar.draw(s, [[30, 8100, 410000]], { x: 0, y: 0, w: 400, h: 200 }, cx([[30, 8100, 410000]])).find((p) => p.key.startsWith("b:2020:")) as any).rect.x;
    expect(left(mk(true))).toBe(left(mk(false)));
  });
});

