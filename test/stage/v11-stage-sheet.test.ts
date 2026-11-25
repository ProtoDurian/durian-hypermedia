// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "ssheet": the worksheet block (tools/stage-sheet.ts): one kind per thing and its own title as data-bar-label,
// rows of up to 24 cells, empty cells and fill, dim, tones per result and per cell, a later thing replacing an earlier
// one in its place, chips in the partial card, pass, tiles, a strip and wrapped totals in the outcome column, every
// refusal, the facts, a layout at 1000 and 340 (inside the box, no word under 11, no words over words), linear work and
// hostile input.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm, type Compiled } from "../../src/core/stage";
import { FONT, measure, type Item } from "../../src/core/stage-core";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { checkDoc } from "../../src/core/doccheck";
import { jsonOf, parseDoc } from "../../src/core/dh-lib";
import { readFileSync } from "node:fs";
import { pageRoles } from "../../src/core/stage-roles";
import { join } from "node:path";

beforeEach(() => { beginDocument(); });

const ROLES = { hub: 1, desk: 2, plain: 0 };
function scene(src: string): Compiled {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^@step (.*)$/);
    if (m) steps.push({ title: m[1], raw: "", line: i + 1 });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return compileStage(head.join("\n"), steps, 1, {}, ROLES);
}
const msgs = (c: Compiled) => c.errors.map((e) => e.msg).join(" | ");
const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const texts = (items: Item[], k: number) => items.filter((it): it is Extract<Item, { k: "text" }> => it.k === "text" && shown(it, k));
const boxes = (items: Item[], k: number) => items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && shown(it, k));
const textBox = (t: Extract<Item, { k: "text" }>) => { const w = measure(t.s, t.f), x0 = t.anchor === "middle" ? t.x - w / 2 : t.anchor === "end" ? t.x - w : t.x, h = FONT[t.f].size; return { x0, x1: x0 + w, y0: t.y - h * 0.8, y1: t.y + h * 0.2 }; };
/** words over words in any step (the same words twice at one place count too: the bar sees two texts) */
function overlaps(items: Item[], steps: number): string[] {
  const out: string[] = [];
  for (let k = 1; k <= steps; k++) {
    const ts = texts(items, k).map((t) => ({ t, b: textBox(t) }));
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i], b = ts[j];
      if (a.b.x0 < b.b.x1 - 1 && b.b.x0 < a.b.x1 - 1 && a.b.y0 < b.b.y1 - 1 && b.b.y0 < a.b.y1 - 1) out.push(`step ${k}: "${a.t.s}" over "${b.t.s}"`);
    }
  }
  return out;
}

// invented: rain gauges in valleys, a regional office (no real system's words)
const RAIN = `title: Mean rainfall | gauges by valley
sheet: valleys, each with its own gauges | 3 of 9 valleys
labels: dawn, noon, dusk
hub v0: valley north | owns 2 gauges
  plain ga "gauge A": 4 6 _
  plain gb "gauge B": 3 5 _
hub v1: valley south | owns 1 gauge
  plain gc "gauge C": 8 9 _
=> desk out: the office | adds the partials
@step Readings: dawn and noon arrive.
dim ga gb gc 1
@step Dusk: the dusk cells fill.
fill ga gb gc 3: 7, 2, 10
mark gb 3: bad a broken funnel reads low, so the office checks it
tile out t1: week 1 | 24 | 6+5+7+6
tile out t2: week 2 (now) | 7 | 7
tile out more: … 50 more
@step Per gauge: each gauge's mean.
value ga gb gc: mean | 5.7, 3.3 (bad struck), 9.0
@step Partials: sum and count.
sum v0: partial of this valley | a = 5.7 | n = 1 -> (5.7, 1)
sum v1: partial of this valley | a = 9.0 | n = 1 -> (9.0, 1)
pass v1
tile out t2: week 2 (now) | 13 | 7+6
@step Office: the office adds.
value ga gb gc: kept | 5.7, dropped (bad), 9.0
strip out r1: the office keeps the last 12 sums | 10 11 12 13 14 15 16 17 18 19 20 21 | oldest, this tick
keep mark r1 1: accent
keep mark r1 12: accent
total out: a = 5.7 + 9.0 = 14.7 | n = 2 => mean | 14.7 ÷ 2 = 7.35
@step Later: the result changes.
total out: a = 14.7 => mean of the week | 7.35 mm
aside out: the dropped gauge is fixed next week.`;
const twenty = (a: number) => Array.from({ length: 20 }, (_, i) => a + i * 3).join(" ");
const WIDE = `sheet: kilns | 2 of 9
hub k0: kiln east | 2 probes
  plain pa "probe A": ${twenty(40)}
  plain pb "probe B": ${twenty(50)}
=> desk out: the yard | adds
@step One: x
mark pb 19: bad a restart: the count falls back to near zero
value pa pb: last − first | 57, -34
@step Two: y
value pa pb: kept | 60.00, -35.79 (bad struck)
sum k0: partial | a = 60.00 | n = 1 -> (60.00, 1)
@step Three: z
total out: a = 60.00 => written | 60.00`;

describe("sheet: kinds and labels", () => {
  test("a group is a lane, a row a worksheet-row, a cell a chip, the outcome column a card; each with its own title", () => {
    const c = scene(RAIN); expect(msgs(c)).toBe("");
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w), bars = p.items.filter((it) => it.bar?.kind);
      const byId = (id: string) => bars.filter((it) => (it as any).id === id).map((it) => it.bar!);
      expect(byId("group:v0")[0]).toMatchObject({ kind: "lane", label: "valley north" });
      expect(byId("row:ga")[0]).toMatchObject({ kind: "worksheet-row", label: "gauge A" });
      expect(byId("out:out")[0]).toMatchObject({ kind: "card", label: "the office" });
      expect(byId("sum:v0")[0]).toMatchObject({ kind: "card" });
      expect(byId("cell:ga:0")[0]).toMatchObject({ kind: "chip", column: "v0", label: "dawn" });
      // one kind per thing on every step: no worksheet row is ever a card, no group ever anything but a lane
      const kinds = new Map<string, Set<string>>();
      for (const it of bars) { const id = String(it.bar!.id ?? ""); if (!id) continue; kinds.set(id, (kinds.get(id) ?? new Set()).add(String(it.bar!.kind))); }
      for (const [id, ks] of kinds) expect([id, ks.size]).toEqual([id, 1]);
      expect(bars.filter((it) => it.bar!.kind === "card" && String((it as any).id ?? "").startsWith("row:"))).toHaveLength(0);
    }
  });
});

describe("sheet: rows and cells", () => {
  test("rows of 20 cells build; 25 are refused", () => {
    const c = scene(WIDE); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000);
    expect(p.items.filter((it) => it.k === "box" && it.id?.startsWith("cell:pa:"))).toHaveLength(20);
    expect(msgs(scene(`sheet: s\nhub g: G\n  plain r "R": ${Array.from({ length: 25 }, (_, i) => i).join(" ")}`))).toMatch(/at most 24 values \(this one has 25\)/);
  });
  test("an empty cell is dashed until its fill; then it holds the value", () => {
    const p = layoutStage(scene(RAIN).model, 1000), cell = p.items.filter((it) => it.k === "box" && it.id === "cell:ga:2") as Extract<Item, { k: "box" }>[];
    expect(cell).toHaveLength(2);
    expect(cell[0]).toMatchObject({ dash: true, to: 1 });
    expect(cell[1]).toMatchObject({ from: 2 });
    expect([cell[0].x, cell[0].y]).toEqual([cell[1].x, cell[1].y]);
    expect(texts(p.items, 1).some((t) => t.s === "7")).toBe(false);
    expect(texts(p.items, 2).some((t) => t.s === "7")).toBe(true);
  });
  test("dim: faint and dashed from its step on; dim none clears", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain r "R": 1 2 3 4\n@step A: a\n@step B: b\ndim r 1..2\n@step C: c\n@step D: d\ndim r off`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), cell0 = p.items.filter((it) => it.k === "box" && it.id === "cell:r:0") as Extract<Item, { k: "box" }>[];
    expect(cell0.map((b) => [b.on?.join(), !!b.dash])).toEqual([["1,4", false], ["2,3", true]]); // the solid box swaps for a dashed one, in one place
    expect([cell0[0].x, cell0[0].y]).toEqual([cell0[1].x, cell0[1].y]);
    expect(p.items.filter((it) => it.k === "box" && it.id === "cell:r:2")).toHaveLength(1);
    const one = texts(p.items, 2).filter((x) => x.s === "1"); expect(one).toHaveLength(1); expect(one[0].dim).toEqual([2, 3]); // one text, faint
  });
  test("a result keeps its tone and strike, stays to the end, and a later result on the row replaces it in place", () => {
    const c = scene(WIDE), p = layoutStage(c.model, 1000);
    const v = p.items.filter((it) => it.k === "box" && it.id === "value:pb") as Extract<Item, { k: "box" }>[];
    expect(v.map((b) => [b.from, b.to])).toEqual([[1, 1], [2, 0]]);
    expect(v[1].fill).toBe("bad:soft");
    expect([v[0].x, v[0].y]).toEqual([v[1].x, v[1].y]);
    expect(texts(p.items, 3).find((t) => t.s === "-35.79")).toMatchObject({ strike: true, ink: "bad:ink" });
    expect(texts(p.items, 3).some((t) => t.s === "-34")).toBe(false);
  });
  test("a mark is in its step only, a keep stays until a later keep on that cell; a mark's words wrap", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain r "R": 1 2 3\n@step A: a\nmark r 2: bad these words are long enough to need a second line here\nkeep mark r 3: good\n@step B: b\n@step C: c\nkeep mark r 3: warn`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), tone = (k: number) => boxes(p.items, k).filter((b) => b.thick).map((b) => b.fill).sort();
    expect(tone(1)).toEqual(["bad:soft", "good:soft"]);
    expect(tone(2)).toEqual(["good:soft"]);
    expect(tone(3)).toEqual(["warn:soft"]);
    expect(texts(p.items, 1).filter((t) => t.ink === "bad:ink" && t.s !== "2").length).toBeGreaterThan(1);
  });
  test("a mark's one amount (+N) is a pill in its tone under the cell holding N, its note from the first cell, beside it when it fits; else under the marked cell", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain r "R": 10 20 30 3 5\n@step A: a\nkeep mark r 4: bad +30 | 3 < 30: low\n@step B: b\nmark r 5: good +7`);
    expect(msgs(c)).toBe("");
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w) as any, cell = (v: string) => p.items.find((i: any) => i.k === "text" && i.s === v && shown(i, 1) && i.anchor === "middle");
      const pill = p.items.find((i: any) => i.k === "box" && i.bar?.label === "+30");
      expect(pill.fill).toBe("bad:soft"); expect(pill.r).toBe(9); expect(pill.to).toBe(1);
      expect(Math.abs(pill.x + pill.w / 2 - cell("30").x)).toBeLessThan(w > 500 ? 2 : 40);
      const note = p.items.find((i: any) => i.k === "text" && i.s === "3 < 30: low"), amt = p.items.find((i: any) => i.k === "text" && i.s === "+30");
      expect(note.y === amt.y || note.y > amt.y).toBe(true); // beside the pill when it fits, else under it
      expect(note.x + measure("3 < 30: low", "sub") <= pill.x || note.y > pill.y + pill.h).toBe(true);
      const p7 = p.items.find((i: any) => i.k === "box" && i.bar?.label === "+7");
      expect(Math.abs(p7.x + p7.w / 2 - cell("5").x)).toBeLessThan(w > 500 ? 2 : 40);
    }
  });
  test("light on a row lights its result box when one shows then, else the row; a lit partial keeps its role colour", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain r "R": 1 2 3\n  plain q "Q": 4 5 6\n@step A: a\nlight r\n@step B: b\nvalue r q: per | 2 /s, 5 /s\nlight r\n@step C: c\nsum g: partial | a = 7 -> (7, 2)`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000) as any, lit = (k: number) => p.items.filter((i: any) => i.k === "box" && i.hot?.includes(k)).map((i: any) => i.id);
    expect(lit(1)).toEqual(["row:r"]);
    expect(lit(2)).toEqual(["value:r"]);
    expect(p.items.find((i: any) => i.id === "sum:g").stroke).toBe("role:hub:line");
  });
  test("a partial is lit in the step it is written, and only there", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain r "R": 1 2 3\n@step A: a\n@step B: b\nsum g: partial | a = 6 -> (6, 1)\n@step C: c`);
    expect(msgs(c)).toBe("");
    const b = (layoutStage(c.model, 1000) as any).items.find((i: any) => i.k === "box" && i.id === "sum:g");
    expect(b.hot).toEqual([2]);
  });
  test("cols: a label under each cell of every row", () => {
    const p = layoutStage(scene(RAIN).model, 1000);
    expect(texts(p.items, 1).filter((t) => t.s === "noon")).toHaveLength(3);
  });
});

describe("sheet: partials and the outcome column", () => {
  test("a partial card holds chips (+ a; b); its sent chip leaves the card in the step it reaches the outcome; a group's short name labels it there", () => {
    const c = scene(`sheet: s\nhub g "east": the east group | 2 rows\n  plain a "A": 12\n  plain b "B": 7\n=> desk out: O\n@step One: x\n@step Two: y\nsum g: partial | + A 12; B 7 | a = 19 | n = 2 -> (19, 2)\n@step Three: z\n@step Four: w`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), chip = (s: string) => p.items.filter((it) => it.k === "box" && it.bar?.kind === "chip" && it.bar.label === s);
    expect(chip("A 12")).toHaveLength(1); expect(chip("A 12")[0].from).toBe(2);
    const sent = chip("(19, 2)").map((b) => b.on?.join() ?? `${b.from}..`);
    expect(sent.sort()).toEqual(["2", "3.."]); // in the card in step 2 only, in the outcome column from step 3
    expect(texts(p.items, 3).some((x) => x.s === "← east")).toBe(true);
    expect(overlaps(p.items, 4)).toEqual([]);
  });
  test("the partial's chip is in its card from its step, and in the outcome column from the next step (or at pass)", () => {
    const p = layoutStage(scene(RAIN).model, 1000);
    const chips = (s: string) => p.items.filter((it) => it.k === "box" && it.bar?.kind === "chip" && it.bar.label === s).map((b) => b.from);
    expect(chips("(5.7, 1)").sort()).toEqual([4, 5]);
    expect(chips("(9.0, 1)").sort()).toEqual([4, 4]); // pass v1 in the same step
  });
  test("tiles sit in one row and a later tile replaces its own; a strip shows its cells and ends; totals replace", () => {
    const p = layoutStage(scene(RAIN).model, 1000);
    const t2 = p.items.filter((it) => it.k === "box" && it.id === "tile:t2") as Extract<Item, { k: "box" }>[];
    expect(t2.map((b) => [b.from, b.to])).toEqual([[2, 3], [4, 0]]);
    expect(t2[0].y).toBe(p.items.find((it) => it.k === "box" && it.id === "tile:t1")!.y as number);
    expect(texts(p.items, 5).some((t) => t.s === "oldest")).toBe(true);
    expect(p.items.filter((it) => it.k === "box" && it.id?.startsWith("cell:r1:"))).toHaveLength(12);
    const tot = p.items.filter((it) => it.k === "box" && it.id === "total") as Extract<Item, { k: "box" }>[];
    expect(tot.map((b) => [b.from, b.to])).toEqual([[5, 5], [6, 0]]);
    expect(tot[0].y).toBe(tot[1].y);
  });
  test("a long total line keeps the outcome column at its base 25% of the stage (as the original) and wraps inside it", () => {
    const long = "a line in the outcome column that is long enough to want more than half of the stage";
    const p = layoutStage(scene(`sheet: s\nhub g: G\n  plain r "R": 1 2\n=> desk out: O\n@step A: a\n@step B: b\ntotal out: ${long} => r | ${long}`).model, 1000);
    const col = p.items.find((it) => it.k === "box" && it.id === "out:out") as Extract<Item, { k: "box" }>;
    expect(col.w).toBeGreaterThan(230); expect(col.w).toBeLessThanOrEqual(1000 * 0.25 + 1); expect(overlaps(p.items, 2)).toEqual([]);
    for (const t of texts(p.items, 2)) if (t.x >= col.x) expect(textBox(t).x1).toBeLessThanOrEqual(col.x + col.w + 0.5);
  });
});

describe("sheet: layout at 1000 and 340", () => {
  test("on a phone, long rows put their cells under the label and the result beside it; short rows keep the wide form", () => {
    const wide = layoutStage(scene(WIDE).model, 340), res = wide.items.find((it) => it.k === "box" && it.id === "value:pa") as Extract<Item, { k: "box" }>;
    const row = wide.items.find((it) => it.k === "box" && it.id === "row:pa") as Extract<Item, { k: "box" }>;
    expect(res.y).toBeLessThan(row.y + 10); // on the label line, not under the cells
    const short = layoutStage(scene(`sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\nsum g: partial | a = 12 -> (12, 1)\n@step Two: y`).model, 340);
    const card = short.items.find((it) => it.k === "box" && it.id === "sum:g") as Extract<Item, { k: "box" }>, ra = short.items.find((it) => it.k === "box" && it.id === "row:a") as Extract<Item, { k: "box" }>;
    expect(card.x).toBeGreaterThan(ra.x + ra.w); // the partial card beside the row
  });
  for (const [name, src] of [["rain", RAIN], ["twenty cells", WIDE]] as const) for (const w of [1000, 340]) test(`${name} at ${w}: inside, 11 and up, no words over words`, () => {
    const c = scene(src), p = layoutStage(c.model, w), n = c.model.steps.length;
    for (const it of p.items) {
      if (it.k === "text") { expect(FONT[it.f].size).toBeGreaterThanOrEqual(11); const b = textBox(it); expect(b.x0).toBeGreaterThanOrEqual(-0.5); expect(b.x1).toBeLessThanOrEqual(p.w + 0.5); }
      if (it.k === "box") { expect(it.x).toBeGreaterThanOrEqual(-0.5); expect(it.x + it.w).toBeLessThanOrEqual(p.w + 0.5); expect(it.y + it.h).toBeLessThanOrEqual(p.h + 0.5); }
    }
    expect(overlaps(p.items, n)).toEqual([]);
    // a thing with an id has one place for the whole scene (the 0 px check reads data-id)
    const place = new Map<string, string>();
    for (const it of p.items) if (it.k === "box" && it.id) { const at = [it.x, it.y, it.w, it.h].map((v) => Math.round(v * 10)).join(","); expect([it.id, place.get(it.id) ?? at]).toEqual([it.id, at]); place.set(it.id, at); }
  });
});

describe("sheet: facts", () => {
  test("the setup and each step read as sentences", () => {
    const llm = stageLlm(scene(RAIN));
    for (const s of ["columns: dawn, noon, dusk", "gauge A: 4, 6, (empty)", "gauge A, gauge B, gauge C: value 1 is left out.", "gauge A value 3: 7, gauge B value 3: 2, gauge C value 3: 10.",
      "gauge B, value 3 (2): bad, a broken funnel reads low, so the office checks it.", "the office, week 1: 24 (6+5+7+6).", "mean: gauge A 5.7, gauge B 3.3 (struck out), gauge C 9.0.",
      "valley south sends its partial to the office.", "the office keeps the last 12 sums: 10, 11, 12", "(oldest to this tick)", "the office: a = 14.7; mean of the week; 7.35 mm."]) expect(llm).toContain(s);
  });
});

describe("sheet: refusals name the line and the fix", () => {
  const base = `sheet: s\nhub g: G\n  plain r "R": 1 2 3\n=> desk out: O\n@step One: x\n`;
  const cases: [string, string, RegExp][] = [
    ["a cell past the row", "mark r 9: bad", /mark names a row and a cell from 1 to 3/],
    ["a bad range", "keep mark r 3..2: good", /mark names a row and a cell/],
    ["an unknown tone", "mark r 1: purple", /a mark is good, bad, warn, accent/],
    ["an unknown row", "dim q 1", /"q" is not a row or strip of the sheet \(r\)/],
    ["dim with words", "dim r 1: why", /dim takes no words/],
    ["fill two cells", "fill r 1,2: 4", /fill names one cell/],
    ["fill counts", "fill r 1: 4, 5", /one value per row: 1 rows, 2 values/],
    ["value counts", "value r: x | 1, 2", /one result per row: 1 rows, 2 results/],
    ["pass with no chip", "pass g", /write "sum g: \.\.\. -> chip" first/],
    ["tile shape", "tile out: a | 1", /tile names the outcome column and a tile/],
    ["strip with no cells", "strip out s1: heading", /a strip lists its cells/],
    ["strip too long", `strip out s1: h | ${Array.from({ length: 49 }, (_, i) => i).join(" ")}`, /at most 48 cells \(this one has 49\)/],
    ["strip on a row's name", "strip out r: h | 1 2", /"r" is already a row or strip/],
    ["total on no column", "total zz: a => b | c", /"zz" is not a outcome column/],
  ];
  for (const [name, line, re] of cases) test(name, () => { const c = scene(base + line + "\n@step Two: y"); expect(msgs(c)).toMatch(re); expect(c.errors[0].line).toBeGreaterThan(0); });
  test("group and row caps", () => {
    expect(msgs(scene(`sheet: s\n${Array.from({ length: 13 }, (_, i) => `hub g${i}: G\n  plain r${i} "R": 1`).join("\n")}`))).toMatch(/at most 12 groups/);
    expect(msgs(scene(`sheet: s\nhub g: G\n${Array.from({ length: 121 }, (_, i) => `  plain r${i} "R": 1`).join("\n")}`))).toMatch(/at most 120 rows/);
  });
});

describe("sheet: work is linear and bounded", () => {
  const big = (n: number) => `sheet: s\n${Array.from({ length: 6 }, (_, g) => `hub g${g}: G${g}\n${Array.from({ length: n }, (_, i) => `  plain r${g}x${i} "row ${i}": ${twenty(i)}`).join("\n")}`).join("\n")}\n=> desk out: O\n@step One: x\n${Array.from({ length: n }, (_, i) => `mark r0x${i} 1..20: bad\nvalue r1x${i}: v | ${i}\ndim r2x${i} 1..10\nkeep mark r3x${i} 2: good`).join("\n")}\n@step Two: y\n${Array.from({ length: n }, (_, i) => `value r1x${i}: w | ${i}\nkeep mark r3x${i} 2: warn`).join("\n")}\n@step Three: z`;
  const work = (src: string) => { const b = beginDocument(newBudget(1e9, 1e9)); const c = scene(src); expect(msgs(c)).toBe(""); layoutStage(c.model, 1000); stageLlm(c); return 1e9 - b.left().work; };
  test("doubling the rows and step words at most about doubles the work", () => { const a = work(big(8)), b = work(big(16)); expect(b / a).toBeLessThan(2.4); });
  test("a small budget refuses a big sheet with BudgetError", () => { beginDocument(newBudget(800, 800)); expect(() => { const c = scene(big(16)); layoutStage(c.model, 1000); }).toThrow(BudgetError); });
  test("hostile input ends quickly", () => {
    const t0 = performance.now();
    const c1 = scene(`sheet: s\nhub g: G\n  plain r "R": ${"9".repeat(5000)} 1\n=> desk out: O\n@step A: a\nmark r 1..999999999: bad\naside out: ${"w".repeat(20000)}\n@step B: b\ntotal out: ${"x ".repeat(5000)} => ${"y".repeat(3000)} | ${"z".repeat(3000)}`);
    expect(msgs(c1)).toMatch(/mark names a row and a cell/);
    layoutStage(c1.model, 1000); layoutStage(c1.model, 340);
    const c2 = scene(`sheet: s\nhub g: G\n  plain r "R": 1 2\n=> desk out: O\n@step A: a\n${"value r: v | 1\n".repeat(500)}@step B: b`);
    expect(msgs(c2)).toMatch(/at most 400 step words/);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("sheet: doccheck", () => {
  const page = (body: string) => parseDoc("t.dh.md", `---\ntitle: T\nroles:\n  hub: c2\n  desk: c3\n  plain: c0\n---\n\n# T\n\n${body}\n`);
  test("the public samples pass; a sheet refusal is a doccheck error on its line", () => {
    const issues: any[] = []; checkDoc(parseDoc("sheet.dh.md", readFileSync(join(import.meta.dir, "samples/sheet.dh.md"), "utf8")), undefined, issues);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const bad: any[] = []; checkDoc(page("```animation\nsheet: s\nhub g: G\n  plain r \"R\": 1 2 _\n=> desk out: O\n@step One: x\nfill r 3: 4, 5\n@step Two: y\npass g\n```"), undefined, bad);
    expect(bad.filter((i) => i.level === "error").map((i) => i.msg).join(" | ")).toMatch(/one value per row: 1 rows, 2 values.*write "sum g: \.\.\. -> chip" first/);
  });
});

describe("stage: hide (setup cards and their connectors end at a step)", () => {
  const SRC = `## Terms\nhub t1..t3: one; two; three\n## Bound\ndesk bd: the bound\n@step One: a\nt1,t2,t3 --> bd\n@step Two: b\nhide t1..t3, bd\n@step Three: c\n@step Four: d\nshow bd`;
  test("a hidden card shows until its hide and again from a later show, in one place; its connectors end with it", () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), card = (id: string) => p.items.filter((it) => it.k === "box" && it.id === id) as Extract<Item, { k: "box" }>[];
    expect(card("t1")[0].on).toEqual([1]);
    expect(card("bd")[0].on).toEqual([1, 4]);
    const edges = p.items.filter((it) => it.k === "path" && it.id?.endsWith(">bd"));
    expect(edges.length).toBe(3); for (const e of edges) expect(e.on).toEqual([1]);
    expect(stageLlm(c)).toContain("Gone: one, two, three, the bound.");
    const plain = layoutStage(scene(`## A\nhub a: A\n## B\ndesk b: B\n@step One: x\na -> b\n@step Two: y`).model, 1000);
    expect(plain.items.find((it) => it.k === "box" && it.id === "a")!.on).toBeUndefined(); // no hide, no change
  });
  test("hide names known cards", () => { expect(msgs(scene(`## A\nhub a: A\n@step One: x\n@step Two: y\nhide zz`))).toMatch(/zz/); });
});

describe("sheet: spacing: roomy, tones on tiles", () => {
  test("spacing: roomy makes one-line rows taller with the cells and label centred; a tile takes a tone after its value", () => {
    const c = scene(`sheet: s\nspacing: roomy\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\ntile out w: the wrong way | 7.50 (bad) | (10 + 5) ÷ 2\n@step Two: y`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), row = p.items.find((it) => it.k === "box" && it.id === "row:a") as Extract<Item, { k: "box" }>, cell = p.items.find((it) => it.k === "box" && it.id === "cell:a:0") as Extract<Item, { k: "box" }>;
    expect(row.h).toBe(56); expect(Math.abs(cell.y + cell.h / 2 - (row.y + row.h / 2))).toBeLessThan(1);
    expect(p.items.find((it) => it.k === "box" && it.id === "tile:w")).toMatchObject({ fill: "bad:soft", thick: true });
    expect(msgs(scene(`sheet: s\nspacing: huge\nhub g: G\n  plain a "A": 1`))).toMatch(/takes one word: spacing: roomy/);
  });
});

describe("sheet: a second, named result", () => {
  test("total out wrong:... is its own result row beside the total, in its tone; each is replaced only by its own name", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\ntotal out: 12 => right | 12\n@step Two: y\ntotal out wrong: 6 + 6 => wrong | 6 (bad struck)\n@step Three: z\ntotal out: 13 => right | 13`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), box = (id: string) => p.items.filter((it) => it.k === "box" && it.id === id) as Extract<Item, { k: "box" }>[];
    expect(box("total").map((b) => [b.from, b.to])).toEqual([[1, 2], [3, 0]]);
    expect(box("total:wrong")).toHaveLength(1); expect(box("total:wrong")[0]).toMatchObject({ fill: "bad:soft", from: 2, to: 0, bar: { kind: "worksheet-row" } });
    expect(box("total:wrong")[0].y).toBeGreaterThan(box("total")[0].y + box("total")[0].h);
    expect(texts(p.items, 2).find((x) => x.s === "6")).toMatchObject({ strike: true });
    expect(overlaps(p.items, 3)).toEqual([]);
    expect(msgs(scene(`sheet: s\nhub g: G\n  plain a "A": 1\n=> desk out: O\n@step One: x\ntotal out a b: 1 => r | 1\n@step Two: y`))).toMatch(/for a second result, a name/);
  });
});

describe("sheet: the outcome column ends with the groups (the outcome card is level with the last group)", () => {
  test("with notes in the sheet's slot, the outcome column still ends level with the groups, above the notes; the same without notes", () => {
    const base = `sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\n`;
    const withNote = layoutStage(scene(base + `note: a note | its second line | a third\n@step Two: y`).model, 1000);
    const col = withNote.items.find((it) => it.k === "box" && it.id === "out:out") as Extract<Item, { k: "box" }>;
    const noteBottom = Math.max(...withNote.items.filter((it) => it.k === "box" && it.from === 1 && it.to === 1).map((b: any) => b.y + b.h));
    const g = withNote.items.find((it) => it.k === "box" && it.id === "group:g") as Extract<Item, { k: "box" }>;
    expect(Math.abs(col.y + col.h - (g.y + g.h))).toBeLessThan(6); expect(col.y + col.h).toBeLessThan(noteBottom);
    const plain = layoutStage(scene(base + `@step Two: y`).model, 1000), col2 = plain.items.find((it) => it.k === "box" && it.id === "out:out") as Extract<Item, { k: "box" }>;
    expect(Math.abs(col2.h - col.h)).toBeLessThan(1);
    const tall = layoutStage(scene(`sheet: s\nspacing: roomy\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\n@step Two: y`).model, 340);
    expect((tall.items.find((it) => it.k === "box" && it.id === "row:a") as any).h).toBeLessThan(56); // tall rows on a wide stage only
  });
});

describe("sheet: the note zone, one-line rows, the sent chip beside its line, tall rows that grow", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => String(100 + i)).join(" ");
  test("a note in the sheet's slot is a band, as every note band is", () => {
    const p = layoutStage(scene(`sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\nnote: the rule | its line\n@step Two: y`).model, 1178);
    expect(p.items.find((it) => it.k === "box" && (it as any).bar?.label === "the rule")).toMatchObject({ bar: { kind: "band" } });
  });
  test("twenty three-digit cells beside a result and a partial card stay on one line on a wide stage, the cells inside the row", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain a "A": ${twenty}\n  plain b "B": ${twenty}\n=> desk out: O\n@step One: x\nvalue a b: v | 1, 2\nsum g: partial | a = 3 | n = 2 -> (3, 2)\n@step Two: y`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1178), row = p.items.find((it) => it.k === "box" && it.id === "row:a") as Extract<Item, { k: "box" }>;
    const cells = p.items.filter((it) => it.k === "box" && it.id?.startsWith("cell:a:")) as Extract<Item, { k: "box" }>[];
    expect(new Set(cells.map((b) => b.y)).size).toBe(1);
    expect(Math.max(...cells.map((b) => b.x + b.w))).toBeLessThanOrEqual(row.x + row.w);
    for (const b of cells) expect(b.w).toBeGreaterThanOrEqual(measure("119", "sub"));
  });
  test("a short sent chip sits beside the card's last line; a long one keeps its own row under the lines", () => {
    const at = (sum: string) => { const p = layoutStage(scene(`sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\nsum g: ${sum}\n@step Two: y`).model, 1178); return { p, card: p.items.find((it) => it.k === "box" && it.id === "sum:g") as Extract<Item, { k: "box" }> }; };
    const short = at(`partial | a = 4 | n = 1 -> (4, 1)`), long = at(`partial | a = 4 | n = 1 because ${"every kiln keeps its own probes ".repeat(16).trim()} -> (4.00, 1, from kiln north)`);
    const chip = short.p.items.find((it) => it.k === "box" && (it as any).bar?.label === "(4, 1)") as Extract<Item, { k: "box" }>;
    const last = texts(short.p.items, 1).find((t) => t.s === "n = 1")!;
    expect(Math.abs(chip.y + 15 - last.y)).toBeLessThan(1); expect(chip.x).toBeGreaterThan(last.x + measure("n = 1", "sub"));
    const lchip = long.p.items.find((it) => it.k === "box" && (it as any).bar?.label === "(4.00, 1, from kiln north)") as Extract<Item, { k: "box" }>, lbody = texts(long.p.items, 1).filter((t) => t.x === long.card.x + 12 && t.y < lchip.y);
    expect(lbody.length).toBeGreaterThan(0); expect(lchip.y).toBeGreaterThan(Math.max(...lbody.map((t) => t.y))); expect(Math.abs(lchip.x + lchip.w - (long.card.x + long.card.w - 12))).toBeLessThan(1); expect(Math.abs(lchip.y + lchip.h - (long.card.y + long.card.h - 8))).toBeLessThan(1);
    expect(overlaps(short.p.items, 2)).toEqual([]);
  });
  test("tall rows grow with a wide stage (a drawing scaled to the page), never under 56", () => {
    const h = (w: number) => (layoutStage(scene(`sheet: s\nspacing: roomy\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x`).model, w).items.find((it) => it.k === "box" && it.id === "row:a") as any).h;
    expect(h(1000)).toBe(56); expect(h(1178)).toBeGreaterThan(60); expect(h(1280)).toBeGreaterThan(h(1178));
  });
});

describe("sheet: the outcome column's note on a phone", () => {
  test("a column title and note too long for one line put the note under the title, no words over words", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: the harbour office | adds, then takes the change\n@step One: x\ntotal out: 1 => r | 1`);
    const p = layoutStage(c.model, 340), t = texts(p.items, 1), title = t.find((x) => x.s === "the harbour office")!, note = t.find((x) => x.s.startsWith("adds"))!;
    expect(note.y).toBeGreaterThan(title.y); expect(overlaps(p.items, 1)).toEqual([]);
    const wide = texts(layoutStage(c.model, 1178).items, 1);
    expect(wide.find((x) => x.s.startsWith("adds"))!.y).toBe(wide.find((x) => x.s === "the harbour office")!.y);
  });
});

describe("sheet: hide (the stage's one word for go away) and the old rows: tall", () => {
  test("hide ends a row's result, a partial, a tile and the total from its step; a later result comes back; cards still hide; other ids are refused", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\nvalue a: v | 1\nsum g: p | a = 1\ntile out t: T | 2\ntotal out: l => r | 3\n@step Two: y\nhide a g t out\n@step Three: z\nvalue a: v | 4`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), b = (id: string) => (p.items.filter((it) => it.k === "box" && it.id === id) as any[]).map((x) => [x.from, x.to]);
    expect(b("value:a")).toEqual([[1, 1], [3, 0]]); expect(b("sum:g")).toEqual([[1, 1]]); expect(b("tile:t")).toEqual([[1, 1]]); expect(b("total")).toEqual([[1, 1]]);
    expect(msgs(scene(`sheet: s\nhub g: G\n  plain a "A": 12\n=> desk out: O\n@step One: x\nhide nothere`))).toMatch(/nothere/);
  });
  test("the old setup line rows: tall is told the new one", () => {
    expect(msgs(scene(`sheet: s\nrows: tall\nhub g: G\n  plain a "A": 12`))).toMatch(/"rows" is now "spacing": say "spacing: roomy" instead/);
  });
});

describe("sheet: a row too long for one line wraps evenly", () => {
  test("twenty four four-digit cells at 1000 wrap into lines of near-equal length, never one cell alone", () => {
    const v = Array.from({ length: 24 }, (_, i) => String(1000 + i)).join(" ");
    const p = layoutStage(scene(`sheet: s\nhub g: G\n  plain a "A": ${v}\n=> desk out: O\n@step One: x\nvalue a: v | 1\nsum g: partial | a = 3 -> (3, 1)`).model, 1000);
    const ys = new Map<number, number>(); for (const it of p.items) if (it.k === "box" && it.id?.startsWith("cell:a:")) ys.set(it.y, (ys.get(it.y) ?? 0) + 1);
    const n = [...ys.values()]; expect(n.length).toBeGreaterThan(1); expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1);
  });
});

describe("sheet: a mark's note (ported)", () => {
  test("mark r 2: bad +1 | 2 < 3: odd: the words under the cell, the note under the row at its left, and the fact ends '; note'", () => {
    const c = scene(`sheet: s\nhub g: G\n  plain r "R": 1 2 3\n  plain q "Q": 4 5 6\n=> desk out: O\n@step One: x\nmark r 2: bad +1 | 2 < 3: odd\n@step Two: y`);
    expect(msgs(c)).toBe("");
    expect(stageLlm(c)).toContain("R, value 2 (2): bad, +1; 2 < 3: odd.");
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w), t = texts(p.items, 1), add = t.find((x) => x.s === "+1")!, note = t.find((x) => x.s === "2 < 3: odd")!;
      const row = p.items.find((it) => it.k === "box" && it.id === "row:r") as Extract<Item, { k: "box" }>, cell0 = p.items.find((it) => it.k === "box" && it.id === "cell:r:0") as Extract<Item, { k: "box" }>;
      expect(note.y).toBeGreaterThan(add.y); expect(note.y).toBeLessThan(row.y + row.h); expect(note.x).toBeLessThanOrEqual(cell0.x + 1);
      expect(texts(p.items, 2).some((x) => x.s === "2 < 3: odd")).toBe(false);
      expect(overlaps(p.items, 2)).toEqual([]);
    }
  });
});

describe("sheet: notes at their step's height, notes: roomy, a short row column, a wrapping outcome column", () => {
  const base = `sheet: s\nhub g: G\n  plain a "A": 12\n  plain b "B": 7\n=> desk out: O\n`;
  const note = (p: any, label: string) => p.items.find((it: any) => it.k === "box" && it.bar?.label === label);
  test("each step's note in the sheet's slot is as tall as it needs (and a little room), not the tallest step's", () => {
    const p = layoutStage(scene(base + `@step One: x\nnote: short | one line\n@step Two: y\nnote: long | one | two | three | four`).model, 1178);
    expect(note(p, "short").h).toBeLessThan(note(p, "long").h); expect(note(p, "long").h).toBeLessThan(165);
    const col = p.items.find((it: any) => it.k === "box" && it.id === "out:out") as any;
    expect(col.y + col.h).toBeLessThan(note(p, "long").y + note(p, "long").h); // the column ends with the groups, not at the notes' foot
  });
  test("notes: roomy gives the worksheet a tall note zone every step's note fills", () => {
    const c = scene(`notes: roomy\n` + base + `@step One: x\nnote: short | one line\n@step Two: y\nnote: other | two lines | here`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1178);
    expect(note(p, "short").h).toBe(note(p, "other").h); expect(note(p, "short").h).toBeGreaterThanOrEqual(160);
    expect(msgs(scene(`notes: huge\n` + base + `@step One: x`))).toMatch(/notes: roomy/);
  });
  test("a one-cell row column is at least 15% of a wide stage before its partial; a long total line wraps in the column's base 25%", () => {
    const p = layoutStage(scene(base + `@step One: x\nsum g: partial | a = 19 -> (19, 2)\ntotal out: ${"a long line of the yard ".repeat(6)}=> r | 19`).model, 1178);
    const sum = p.items.find((it: any) => it.k === "box" && it.id === "sum:g") as any, col = p.items.find((it: any) => it.k === "box" && it.id === "out:out") as any;
    expect(sum.x).toBeGreaterThan(1178 * 0.15); expect(col.w).toBeLessThanOrEqual(Math.ceil(1150 * 0.25) + 1);
    expect(overlaps(p.items, 1)).toEqual([]);
  });
});

describe("sheet: echo chips in a partial add no height", () => {
  test("a partial with an echo chip beside its title and its sent chip beside its last line is no taller than its lines (and 4 px off its borders)", () => {
    const mk = (sum: string) => layoutStage(scene(`sheet: s\nhub g: G\n  plain d "D": 5\n=> desk out: O\n@step One: x\nsum g: ${sum}\n@step Two: y`).model, 1178);
    const plain = mk(`partial of this kiln | a = 5 | n = 1`), echo = mk(`partial of this kiln | + D 5 | a = 5 | n = 1 -> (5, 1)`);
    const h = (p: any) => (p.items.find((it: any) => it.k === "box" && it.id === "group:g") as any).h;
    expect(h(echo)).toBeLessThanOrEqual(h(plain) + 8); // at most the chips' 4 px off each border
    const card = echo.items.find((it: any) => it.k === "box" && it.id === "sum:g") as any;
    for (const c of echo.items.filter((it: any) => it.k === "box" && it.bar?.kind === "chip" && it.x >= card.x && it.x < card.x + card.w && it.y < card.y + card.h) as any[]) { expect(c.y - card.y).toBeGreaterThanOrEqual(4); expect(card.y + card.h - c.y - c.h).toBeGreaterThanOrEqual(4); }
    const t = texts(echo.items, 1), title = t.find((x) => x.s === "partial of this kiln")!, d = t.find((x) => x.s === "D 5")!;
    expect(Math.abs(d.y - title.y)).toBeLessThan(10); expect(d.x).toBeGreaterThan(title.x + measure(title.s, "sub"));
    expect(overlaps(echo.items, 2)).toEqual([]);
  });
});

describe("sheet: light (the stage's halo on the sheet's boxes)", () => {
  const base = `sheet: s\nhub k0: K0\n  plain a "A": 12\nhub k1: K1\n  plain b "B": 7\n=> desk out: the yard\n@step One: x\nlight k0\n@step Two: y\nsum k0: partial | a = 12 -> (12, 1)\nsum k1: partial | a = 7 -> (7, 1)\nlight k0, k1\n@step Three: z\ntotal out: 12 + 7 => sum | 19\nlight out\n@step Four: w\nlight a`;
  test("light on groups lights their partials (or the lane when none shows), on the outcome column its box, on a row its row, in that step only", () => {
    const c = scene(base);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), box = (id: string) => p.items.filter((it) => it.k === "box" && it.id === id) as any[];
    expect(box("group:k0")[0].hot).toEqual([1]);
    expect(box("sum:k0")[0].hot).toEqual([2]); expect(box("sum:k1")[0].hot).toEqual([2]); expect(box("group:k1")[0].hot ?? []).toEqual([]);
    expect(box("out:out")[0].hot).toEqual([3]);
    expect(box("row:a")[0].hot).toEqual([4]);
    expect(stageLlm(c)).not.toContain("undefined");
  });
  test("light on a card still works, words on a sheet light and unknown ids are refused", () => {
    expect(msgs(scene(`sheet: s\nhub k0: K0\n  plain a "A": 12\n=> desk out: O\n@step One: x\nlight nothere`))).toMatch(/nothere/);
    expect(msgs(scene(`sheet: s\nhub k0: K0\n  plain a "A": 12\n=> desk out: O\n@step One: x\nlight k0: words`)).length).toBeGreaterThan(0);
  });
});

describe("sheet: on a phone, a result on the row's label line keeps clear of the cells", () => {
  test("eight four-digit cells and a result at 356: the result and the cells keep clear (cells under the result, or in the phone type sizes the cells on the label line and the result under them)", () => {
    const v = Array.from({ length: 8 }, (_, i) => String(1100 + 15 * i)).join(" ");
    const c = scene(`sheet: s\nhub g: G\n  plain a "A": ${v}\n=> desk out: O\n@step One: x\nvalue a: ÷ 15 s | 1.00 /s (good)\n@step Two: y`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 356), res = p.items.find((it) => it.k === "box" && it.id === "value:a") as any, cell = p.items.find((it) => it.k === "box" && it.id === "cell:a:0") as any;
    if (res.y < cell.y) expect(cell.y - (res.y + res.h)).toBeGreaterThanOrEqual(4);
    else expect(res.y).toBeGreaterThanOrEqual(cell.y + cell.h + 4); // phone type sizes fit the cells beside the label
    expect(overlaps(p.items, 1)).toEqual([]);
  });
});

describe("sheet: the outcome column's height is a page token (theme: sheet-outcome)", () => {
  const src = `sheet: s\nhub k0: K0\n  plain a "A": 1\n  plain b "B": 2\nhub k1: K1\n  plain d "D": 3\n=> desk out: O\n@step One: x\nnote: n | one | two | three\n@step Two: y`;
  const withTheme = (theme: Record<string, string>) => { const ps = src.split(/^@step /m), steps = ps.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: nl < 0 ? s : s.slice(0, nl), raw: nl < 0 ? "" : s.slice(nl + 1), line: i + 1 }; }); return compileStage(ps[0], steps, 1, Object.fromEntries(Object.entries(theme).map(([k, v]) => ["theme:" + k, v])), ROLES); };
  test("by default the column ends level with the last group; a page token never changes the source", () => {
    const p = layoutStage(withTheme({}).model, 1178), box = (id: string) => p.items.find((it) => it.k === "box" && it.id === id) as any;
    expect(Math.abs(box("out:out").y + box("out:out").h - (box("group:k1").y + box("group:k1").h))).toBeLessThan(6);
  });
  test("the page's front matter theme reaches the stage source, and an unknown token or value is refused", () => {
    const doc = jsonOf(parseDoc("t.dh.md", "---\ntitle: T\ntheme:\n  sheet-outcome: panel\n---\n\n# T\n\n```animation\n" + src + "\n```\n"));
    expect(JSON.stringify(doc)).toContain("theme:sheet-outcome");
    expect(pageRoles({ theme: { "sheet-outcome": "tall" } }).errors.join(" ")).toMatch(/level or panel/);
    expect(pageRoles({ theme: { wobble: 1 } }).errors.join(" ")).toMatch(/not a stage token/);
    expect(pageRoles({ theme: { "sheet-outcome": "panel" } }).theme).toEqual({ "sheet-outcome": "panel" });
  });
  test("theme fill-cN: a role's fill on the page's stages, light then dark; the default is unchanged; a bad value is refused by doccheck", () => {
    expect(pageRoles({ theme: { "fill-c1": "#EEF0FF #1E2340" } }).theme).toEqual({ "fill-c1": "#EEF0FF #1E2340" });
    expect(pageRoles({ theme: { "fill-c1": "lavender" } }).errors.join(" ")).toMatch(/two colours, light then dark/);
    expect(pageRoles({ theme: { "fill-c9": "#EEF0FF #1E2340" } }).errors.join(" ")).toMatch(/not a stage token/);
    expect(layoutStage(withTheme({}).model, 1178).fills).toBeUndefined();
    expect(layoutStage(withTheme({ "fill-c1": "#EEF0FF #1E2340", "fill-c0": "#F2F4F7 #20262F" }).model, 390).fills).toEqual({ c1: ["#EEF0FF", "#1E2340"], c0: ["#F2F4F7", "#20262F"] });
    const bad: any[] = []; checkDoc(parseDoc("t.dh.md", "---\ntitle: T\ntheme:\n  fill-c2: pink\n---\n\n# T\n\n```animation\n" + src + "\n```\n"), undefined, bad);
    expect(JSON.stringify(bad)).toMatch(/two colours, light then dark/);
  });
  test("sheet-outcome: panel is for the wide stage only: on a phone the stacked column is as tall as its content, the same as level", () => {
    const col = (theme: Record<string, string>, w: number) => (layoutStage(withTheme(theme).model, w).items.find((it: any) => it.k === "box" && it.id === "out:out") as any);
    const lv = col({}, 390), pn = col({ "sheet-outcome": "panel" }, 390);
    expect(pn.h).toBe(lv.h);
    expect(pn.h).toBeLessThan(Math.round((390 - 28) * 0.312) + 200);
    expect(col({ "sheet-outcome": "panel" }, 1178).h).toBeGreaterThan(col({}, 1178).h);
  });
  test("sheet-outcome: panel: short groups: the column is a fixed panel 0.312 of the width tall, past the last group and not to the notes; taller groups still win", () => {
    const at = (c: any) => { const p = layoutStage(c.model, 1178), box = (id: string) => p.items.find((it) => it.k === "box" && it.id === id) as any; return { g1: box("group:k1"), col: box("out:out"), notes: p.items.filter((it: any) => it.k === "box" && /note/.test(it.cls ?? "")) }; };
    const { g1, col } = at(withTheme({ "sheet-outcome": "panel" }));
    expect(col.y + col.h).toBeGreaterThan(g1.y + g1.h + 20);
    expect(Math.abs(col.h - Math.round((1178 - 28) * 0.312))).toBeLessThan(30);
    const big = (() => { const s = src.replace(`  plain d "D": 3`, ["d", "e", "f", "g", "h", "i"].map((x, i) => `  plain ${x} "${x.toUpperCase()}": ${i}`).join("\n")); const ps = s.split(/^@step /m), steps = ps.slice(1).map((q, i) => { const nl = q.indexOf("\n"); return { title: nl < 0 ? q : q.slice(0, nl), raw: nl < 0 ? "" : q.slice(nl + 1), line: i + 1 }; }); return compileStage(ps[0], steps, 1, { "theme:sheet-outcome": "panel" }, ROLES); })();
    const b = at(big);
    expect(Math.abs(b.col.y + b.col.h - (b.g1.y + b.g1.h))).toBeLessThan(6);
  });
});

describe("sheet: the outcome column is as wide as its widest row, sized as the reference design sizes it", () => {
  const head = `sheet: s\nhub k0: K0\n  plain a "A": 1\nhub k1: K1\n  plain d "D": 3\n=> desk out: O\n`;
  const lay = (body: string) => layoutStage(scene(head + body).model, 1178).items as any[];
  test("boxed tiles share the widest tile's width; a '… more' tile keeps its own", () => {
    const its = lay(`@step One: x\ntile out b1: kiln 1 | 24 | 6+5\ntile out b2: kiln 2 | 25 | 6+8\ntile out b3: kiln 3 (the long one) | 7 | 7\ntile out more: … 40 more`);
    const w = (id: string) => its.find((it) => it.id === "tile:" + id)?.w;
    expect(w("b1")).toBe(w("b3")); expect(w("b2")).toBe(w("b3"));
    expect(its.some((it) => it.k === "text" && it.s === "… 40 more")).toBe(true);
  });
  test("a strip's cells sit tight: 2 px apart, four digits in about 31 px at the wide stage", () => {
    const its = lay(`@step One: x\nstrip out r1: the last sums | ${Array.from({ length: 20 }, (_, i) => 1000 + i * 7).join(" ")} | oldest, now`);
    const c0 = its.find((it) => it.id === "cell:r1:0"), c1 = its.find((it) => it.id === "cell:r1:1");
    expect(c1.x - (c0.x + c0.w)).toBe(2);
    expect(c0.w).toBeLessThan(34);
    const out = its.find((it) => it.id === "out:out");
    expect(out.w / 1150).toBeLessThan(0.62);
  });
});

describe("sheet: a total with no lines, and a '… more' tile on a phone", () => {
  const head = `sheet: s\nhub k0: K0\n  plain a "A": 1\n=> desk out: O\n`;
  test("'total out: => label | value' puts its label and value in the result box, which carries the stamp", () => {
    const its = layoutStage(scene(head + `@step One: x\ntotal out: => delta | 145 × 240/228 = 152.63\n@step Two: y`).model, 1178).items as any[];
    const box = its.find((it) => it.id === "total");
    expect(box.bar.label).toBe("delta");
    const inside = its.filter((it) => it.k === "text" && it.y > box.y && it.y < box.y + box.h).map((it) => it.s);
    expect(inside.join(" ")).toBe("delta 145 × 240/228 = 152.63");
    expect(its.some((it) => it.k === "text" && /^=>/.test(String(it.s)))).toBe(false);
  });
  test("on a phone a '… more' tile that does not fit beside the tiles is a short line under them, not a tile row", () => {
    const src = head + `@step One: x\ntile out b1: kiln 1 (oldest) | 24 | 6+5\ntile out b2: kiln 2 (middle) | 25 | 6+8\ntile out b3: kiln 3 (newest) | 7 | 7\ntile out more: … 1437 more buckets, one a minute\n@step Two: y`;
    const its = layoutStage(scene(src).model, 340).items as any[];
    const b1 = its.filter((it) => /^tile:b/.test(it.id ?? "")).sort((a, b) => b.y - a.y)[0], more = its.find((it) => it.k === "text" && /^… 1437 more/.test(it.s));
    expect(more.y - (b1.y + b1.h)).toBeLessThan(24);
    expect(more.y).toBeGreaterThan(b1.y + b1.h);
  });
});

describe("sheet on a phone: tiles keep their own widths, sent chips share a line, a long big value steps down a size", () => {
  const head = `sheet: s\nhub k0: K0\n  plain a "A": 1\nhub k1: K1\n  plain d "D": 3\n=> desk out: O\n`;
  const at = (body: string, w: number) => layoutStage(scene(head + body).model, w).items as any[];
  test("three tiles fit one line at 340 (each its own width); the wide stage gives them the widest one's width", () => {
    const body = `@step One: x\ntile out b1: kiln 1 | 24 | 6+5\ntile out b2: kiln 2 | 25 | 6+8\ntile out b3: kiln 3 (now) | 7 | 7\n@step Two: y`;
    const ph = at(body, 340), y = (id: string) => ph.find((it) => it.id === "tile:" + id).y;
    expect(y("b3")).toBe(y("b1"));
    const wd = at(body, 1178), w = (id: string) => wd.find((it) => it.id === "tile:" + id).w;
    expect(w("b1")).toBe(w("b3"));
  });
  test("two sent chips sit on one line on a phone, on two lines on the wide stage", () => {
    const body = `@step One: x\n@step Two: y\nsum k0: partial | a = 1 | n = 1 -> (1, 1)\nsum k1: partial | a = 3 | n = 1 -> (3, 1)\npass k0\npass k1`;
    const chips = (w: number) => { const its = at(body, w), out = its.find((it) => it.id === "out:out"); return its.filter((it) => it.k === "box" && it.bar?.kind === "chip" && /^\(/.test(it.bar.label) && it.y > out.y && it.x >= out.x); };
    const ph = chips(340); expect(ph.length).toBe(2); expect(ph[0].y).toBe(ph[1].y);
    const wd = chips(1178); expect(wd[1].y).toBeGreaterThan(wd[0].y);
  });
  test("a total's big value that would wrap on a phone takes the title size on one line", () => {
    const body = `@step One: x\ntotal out: Σ ring = the increases | covered = 5757 ticks => rate | Σ ring ÷ (about 86,400 s)\n@step Two: y`;
    const ph = at(body, 340), v = ph.filter((it) => it.k === "text" && /86,400|about/.test(String(it.s)));
    expect(v.length).toBe(1); expect(v[0].f).toBe("title");
    const wd = at(body, 1178).find((it) => it.k === "text" && /86,400/.test(String(it.s)));
    expect(wd.f).toBe("big");
  });
});

describe("sheet: an outcome column holding tiles or a strip takes at least half the stage", () => {
  const head = `sheet: s\nhub k0: K0\n  plain a "A": 1\n=> desk out: O\n`;
  const col = (body: string) => (layoutStage(scene(head + body + "\n@step Two: y").model, 1178).items as any[]).find((it) => it.id === "out:out");
  test("two small tiles: half the stage; no tiles: the narrow column", () => {
    expect(col(`@step One: x\ntile out b1: kiln 1 | 2 | 1+1\ntile out b2: kiln 2 | 3 | 1+2`).w).toBeGreaterThanOrEqual(Math.round(1150 * 0.5));
    expect(col(`@step One: x\naside out: a short line`).w).toBeLessThan(1150 * 0.3);
  });
  test("a long strip takes more than half when its cells need it", () => {
    expect(col(`@step One: x\nstrip out r1: sums | ${Array.from({ length: 20 }, (_, i) => 1000 + i).join(" ")} | old, new`).w).toBeGreaterThan(1150 * 0.55);
  });
});
