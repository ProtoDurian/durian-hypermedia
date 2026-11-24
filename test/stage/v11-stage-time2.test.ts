// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// the time axis under named lanes (axis: A..B), a span drawn as a bar ([bar]) with its tag as the chip at
// its left end, and titled row bands (band role id "Title": r1..r2). Public sample words only.
import { beforeEach, expect, test } from "bun:test";
import { tiedToCell } from "./v11-tied-helper";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { type Item } from "../../src/core/stage-core";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";

const roles = { job: 1, server: 2, a: 3, b: 4 };
beforeEach(() => beginDocument());
const on = (i: Item, s: number) => (!i.on || i.on.includes(s)) && (!i.from || i.from <= s) && (!i.to || i.to >= s);
type Box = Extract<Item, { k: "box" }>;
const boxes = (items: Item[]) => items.filter((i): i is Box => i.k === "box");

// ---- 1. axis: First..Last (scene shape: a client lane, two worker lanes' column, a collector; a time block under them)
const lanesHead = (axisLine: string) => `## Clients
job c: client | sends work
## Workers
a wa: worker a | first copy
b wb: worker b | second copy
## Collector
server m: collector | counts once
time: 0..15 | one window, 0 to 15 s
ticks: 0 0 s, 5 5 s, 10 10 s, 15 15 s
${axisLine}ruler: below
row labels: beside
row a ta "a copy": +arrives 3.9..4.1 [dot]
row b tb "b copy": +arrives 4.2..4.4 [dot]`;
const lanesSteps = [{ title: "One", raw: "c --> wa", line: 20 }, { title: "Two", raw: "keep at 4.8 [solid] [good]: closes here: all in\nkeep at 13.5 [bad]: 13.5 s: the newest", line: 21 }];
const axisPath = (items: Item[]) => items.find((i) => i.k === "path" && !!i.bar?.axis) as Extract<Item, { k: "path" }>;
const lane = (items: Item[], label: string) => boxes(items).find((b) => b.cls === "stg-region" && b.bar?.label === label)!;

test("axis: First..Last puts 0 under the first lane's left edge and the end under the last lane's right edge", () => {
  const c = compileStage(lanesHead("axis: Workers..Collector\n"), lanesSteps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), ax = axisPath(p.items), w = lane(p.items, "Workers"), col = lane(p.items, "Collector");
  expect(Math.abs(ax.pts[0][0] - w.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(ax.pts[1][0] - (col.x + col.w))).toBeLessThanOrEqual(2);
  // a tick sits at its true place on the indented axis (5 of 15 = one third)
  const tick5 = p.items.find((i) => i.k === "path" && i.bar?.track && i.bar?.value === 5) as Extract<Item, { k: "path" }>;
  expect(Math.abs(tick5.pts[0][0] - (w.x + (col.x + col.w - w.x) / 3))).toBeLessThanOrEqual(1);
  // the row labels stay at the axis's left, under the first lane (right-aligned to the axis)
  const label = p.items.find((i) => i.k === "text" && i.s === "a copy") as Extract<Item, { k: "text" }>;
  expect(label.x).toBeLessThanOrEqual(w.x);
  expect(label.x).toBeGreaterThan(lane(p.items, "Clients").x);
  // without the word the axis keeps its old place (control)
  beginDocument();
  const c0 = compileStage(lanesHead(""), lanesSteps, 1, {}, roles), p0 = layoutStage(c0.model, 1000);
  expect(axisPath(p0.items).pts[0][0]).toBeLessThan(w.x - 100);
});

test("axis: is ignored on a phone, refuses an unknown lane, a reversed range and a second axis line", () => {
  const c = compileStage(lanesHead("axis: Workers..Collector\n"), lanesSteps, 1, {}, roles);
  const phone = layoutStage(c.model, 390), ax = axisPath(phone.items);
  expect(phone.narrow).toBe(true);
  expect(ax.pts[1][0] - ax.pts[0][0]).toBeGreaterThan(390 * 0.5);
  for (const bad of ["axis: Workers..Nowhere\n", "axis: Collector..Workers\n", "axis: Workers\n", "axis: Workers..Collector\naxis: Clients..Workers\n"]) {
    beginDocument();
    const e = compileStage(lanesHead(bad), lanesSteps, 1, {}, roles).errors;
    expect(e.length).toBeGreaterThan(0);
  }
  beginDocument();
  const e = compileStage(lanesHead("axis: Workers..Nowhere\n"), lanesSteps, 1, {}, roles).errors;
  expect(JSON.stringify(e)).toContain("Nowhere");
  beginDocument();
  expect(stageLlm(compileStage(lanesHead("axis: Workers..Collector\n"), lanesSteps, 1, {}, roles))).toContain("under the lanes Workers to Collector");
});

test("axis: keeps every persistent thing still between steps", () => {
  const c = compileStage(lanesHead("axis: Workers..Collector\n"), lanesSteps, 1, {}, roles), p = layoutStage(c.model, 1000);
  const place = (s: number) => new Map(p.items.filter((i) => on(i, s) && (i.k === "box" || i.k === "path") && typeof i.id === "string").map((i) => [i.id as string, i.k === "box" ? [i.x, i.y, i.w, i.h] : (i as Extract<Item, { k: "path" }>).pts.flat()]));
  const one = place(1), two = place(2);
  for (const [id, v] of one) if (two.has(id)) expect(two.get(id)).toEqual(v);
});

// ---- 2. span [bar] and the tag on its range: a chip at the bar's left end, on the bar's own line
const barHead = `time: 0..20 | seconds
ticks: 0, 5, 10, 15, 20
row job r0 "writer": +up 0..6
row server a0 "prints": +prints 6..16 @2`;
const barSteps = [0, 2, 4, 6].map((v) => `span r0 ${v}..${v + 10} [bar]\ntag r0 ${v}..${v + 10}: R`).join("\n");
const barStepList = [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: barSteps, line: 11 }, { title: "Three", raw: "", line: 20 }];

test("a span [bar] draws a filled bar; a tag on the same row and range draws as a chip at its left end on that line", () => {
  const c = compileStage(barHead, barStepList, 1, {}, roles);
  expect(c.errors).toEqual([]);
  for (const w of [1000, 390]) {
    beginDocument();
    const p = layoutStage(compileStage(barHead, barStepList, 1, {}, roles).model, w);
    const bars = boxes(p.items).filter((b) => b.cls?.includes("stg-span-bar") && on(b, 2)).sort((a, b) => a.x - b.x);
    const chips = boxes(p.items).filter((b) => b.bar?.kind === "chip" && b.bar?.label === "R" && on(b, 2)).sort((a, b) => a.x - b.x);
    expect(bars.length).toBe(4);
    expect(chips.length).toBe(4);
    const ax = axisPath(p.items), X = (v: number) => ax.pts[0][0] + (v / 20) * (ax.pts[1][0] - ax.pts[0][0]);
    bars.forEach((bar, i) => {
      // the bar covers its true range (within 1% of the axis)
      const tol = (ax.pts[1][0] - ax.pts[0][0]) / 100;
      expect(Math.abs(bar.x - X(i * 2))).toBeLessThanOrEqual(tol);
      expect(Math.abs(bar.x + bar.w - X(i * 2 + 10))).toBeLessThanOrEqual(tol);
      // its chip is centred on the bar's left end, on the bar's line
      const chip = chips[i];
      expect(Math.abs(chip.x + chip.w / 2 - Math.max(bar.x, ax.pts[0][0] + chip.w / 2))).toBeLessThanOrEqual(2);
      expect(Math.abs(chip.y + chip.h / 2 - (bar.y + bar.h / 2))).toBeLessThanOrEqual(1);
      // and every chip's word is drawn, at least 11 px
      expect(p.items.some((t) => t.k === "text" && t.s === "R" && on(t, 2) && Math.abs(t.x - (chip.x + chip.w / 2)) < 1)).toBe(true);
    });
    // staggered: four bars on four lines, under the row, none overlapping another
    expect(new Set(bars.map((b) => Math.round(b.y))).size).toBe(4);
    for (let i = 1; i < bars.length; i++) expect(bars[i].y).toBeGreaterThanOrEqual(bars[i - 1].y + bars[i - 1].h);
    // no chip floats in a lane above the row (control of the old place)
    const row = boxes(p.items).find((b) => b.cls?.includes("stg-seg") && b.bar?.label === "up")!;
    for (const chip of chips) expect(chip.y).toBeGreaterThan(row.y + row.h - 1);
  }
});

test("bars and chips keep their places on every step; the chip stays after its bar's step like any tag", () => {
  const p = layoutStage(compileStage(barHead, barStepList, 1, {}, roles).model, 1000);
  const ids = (s: number) => new Map(boxes(p.items).filter((b) => on(b, s) && typeof b.id === "string").map((b) => [b.id as string, [b.x, b.y, b.w, b.h]]));
  const two = ids(2), three = ids(3), one = ids(1);
  for (const [id, v] of two) { if (three.has(id)) expect(three.get(id)).toEqual(v); if (one.has(id)) expect(one.get(id)).toEqual(v); }
  expect(boxes(p.items).filter((b) => b.bar?.label === "R" && on(b, 3)).length).toBe(4);
  expect(boxes(p.items).filter((b) => b.cls?.includes("stg-span-bar") && on(b, 3)).length).toBe(0);
  expect(boxes(p.items).filter((b) => b.bar?.label === "R" && on(b, 1)).length).toBe(0);
  // the stage is as tall on every step: its height counts the bar lines from the start
  const rows = boxes(p.items).filter((b) => b.cls?.includes("stg-time-rows"));
  expect(new Set(rows.map((b) => b.h)).size).toBe(1);
});

test("a tag on a span's range needs no declared state there; a tag with neither still refuses; [bar] with words keeps them", () => {
  // the row covers 0..6 only; 6..16 is covered by the span written first in the same step
  const ok = compileStage(barHead, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "span r0 6..16 [bar]\ntag r0 6..16: R", line: 11 }], 1, {}, roles);
  expect(ok.errors).toEqual([]);
  beginDocument();
  const bad = compileStage(barHead, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "tag r0 6..16: R", line: 11 }], 1, {}, roles);
  expect(bad.errors.length).toBeGreaterThan(0);
  beginDocument();
  const worded = compileStage(barHead, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "span r0 0..10 [bar]: may print for 10 s", line: 11 }], 1, {}, roles);
  expect(worded.errors).toEqual([]);
  const p = layoutStage(worded.model, 1000);
  expect(p.items.some((t) => t.k === "text" && t.s === "may print for 10 s" && on(t, 2))).toBe(true);
  expect(stageLlm(worded)).toContain("writer, 0 to 10: may print for 10 s.");
  // a span without [bar] keeps its bracket (control)
  beginDocument();
  const bracket = layoutStage(compileStage(barHead, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "span r0 0..10: ten", line: 11 }], 1, {}, roles).model, 1000);
  expect(boxes(bracket.items).some((b) => b.cls?.includes("stg-span-bar"))).toBe(false);
});

// ---- 3. band role id "Title": r1..r2 (regions inside the time block)
const bandHead = `time: 0..20 | seconds
row job r0 "writer": +up 0..6
row job a0 "prints": +prints 6..16
row server r1 "reader": waits 0..20
row server w1 "wait": +wait 7..20
row job e "printer": +work 0..20
band job b0 "Desk 0": r0..a0
band server b1 "Desk 1": r1..w1`;
const bandSteps = [{ title: "One", raw: "", line: 12 }, { title: "Two", raw: "", line: 13 }];

test("band draws a titled region in its role behind the rows it names, on a desktop and a phone", () => {
  const c = compileStage(bandHead, bandSteps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  for (const w of [1000, 390]) {
    beginDocument();
    const p = layoutStage(compileStage(bandHead, bandSteps, 1, {}, roles).model, w);
    const band = (label: string) => boxes(p.items).find((b) => b.bar?.kind === "band" && b.bar?.label === label)!;
    const row = (label: string) => boxes(p.items).find((b) => b.bar?.kind === "worksheet-row" && b.bar?.label === label)!;
    const b0 = band("Desk 0"), b1 = band("Desk 1");
    expect(b0.fill).toBe("role:job:soft");
    expect(b1.fill).toBe("role:server:soft");
    for (const [b, inside] of [[b0, ["writer", "prints"]], [b1, ["reader", "wait"]]] as const)
      for (const l of inside) { const r = row(l); expect(r.y).toBeGreaterThanOrEqual(b.y); expect(r.y + r.h).toBeLessThanOrEqual(b.y + b.h); }
    const eng = row("printer");
    expect(eng.y).toBeGreaterThanOrEqual(b1.y + b1.h);
    expect(b1.y).toBeGreaterThanOrEqual(b0.y + b0.h);
    // its title is inside it: on a desktop beside its rows in a left gutter (level with the first row, left of the row
    // labels;, a scene), on a phone on its own line above the first row
    const title = p.items.find((t) => t.k === "text" && t.s === "Desk 0") as Extract<Item, { k: "text" }>;
    const writerLabel = p.items.find((t) => t.k === "text" && t.s === "writer") as Extract<Item, { k: "text" }>;
    expect(title.y).toBeGreaterThan(b0.y);
    if (w < 480) expect(title.y).toBeLessThanOrEqual(row("writer").y + 1);
    else { expect(Math.abs(title.y - writerLabel.y)).toBeLessThanOrEqual(6); expect(title.x + measure("Desk 0", "sub")).toBeLessThan(writerLabel.x); expect(row("writer").y - b0.y).toBeLessThanOrEqual(6); }
    // the band sits under its rows' cells (drawn before them)
    const bi = p.items.indexOf(b0), ci = p.items.findIndex((i) => i.k === "box" && i.bar?.label === "up");
    expect(bi).toBeLessThan(ci);
  }
  expect(stageLlm(c)).toContain('Band "Desk 0": writer to prints.');
});

test("band refuses unknown rows, a reversed range, overlapping bands, an unknown role; the budget counts its work", () => {
  for (const bad of ['band job b0 "Desk 0": r0..zz', 'band job b0 "Desk 0": a0..r0', 'band job b0 "Desk 0": r0..r1\nband server b1 "Desk 1": a0..w1', 'band job b0 "": r0..a0', 'band job b0 "Desk 0" r0..a0']) {
    beginDocument();
    const e = compileStage(bandHead.split("\nband")[0] + "\n" + bad, bandSteps, 1, {}, roles).errors;
    expect(e.length).toBeGreaterThan(0);
  }
  beginDocument();
  const unknownRole = compileStage(bandHead.replace("band job b0", "band nobody b0"), bandSteps, 1, {}, roles);
  expect(unknownRole.errors.length + unknownRole.warnings.length).toBeGreaterThan(0);
});

// budget: band and bar work is charged to the document budget, and it grows at most linearly (double in, about double work)
const counted = (src: string, steps: typeof bandSteps) => {
  let band = 0;
  const inner = newBudget();
  beginDocument({ charge(what, w, m) { if (/^time (band|bar)/.test(what)) band += w; inner.charge(what, w, m); }, left: inner.left });
  const c = compileStage(src, steps, 1, {}, roles); expect(c.errors).toEqual([]); layoutStage(c.model, 1000); layoutStage(c.model, 390);
  return band;
};
const bandsOf = (n: number) => `time: 0..20\n${Array.from({ length: 2 * n }, (_, i) => `row job q${i} "q${i}": +x 0..1`).join("\n")}\n${Array.from({ length: n }, (_, i) => `band job g${i} "G${i}": q${i * 2}..q${i * 2 + 1}`).join("\n")}`;
const barsOf = (n: number) => [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: Array.from({ length: n }, (_, i) => `span r0 ${i}..${i + 4} [bar]\ntag r0 ${i}..${i + 4}: R`).join("\n"), line: 11 }];

test("bands and bars charge the budget, linearly; a tiny budget stops them with BudgetError", () => {
  const b4 = counted(bandsOf(4), bandSteps), b8 = counted(bandsOf(8), bandSteps);
  expect(b4).toBeGreaterThan(0);
  expect(b8).toBeLessThanOrEqual(b4 * 2.5);
  const r4 = counted(barHead.replace("+up 0..6", "+up 0..20"), barsOf(4)), r8 = counted(barHead.replace("+up 0..6", "+up 0..20"), barsOf(8));
  expect(r4).toBeGreaterThan(0);
  expect(r8).toBeLessThanOrEqual(r4 * 2.5);
  beginDocument(newBudget(60));
  expect(() => { const c = compileStage(bandsOf(8), bandSteps, 1, {}, roles); layoutStage(c.model, 1000); }).toThrow(BudgetError);
});

// ---- 4. marker labels by their own lines under "ruler: below"
import { measure } from "../../src/core/stage-core";
const labelSteps = (green: string, red: string) => [{ title: "One", raw: "c --> wa", line: 20 }, { title: "Two", raw: `keep at 4.8 [solid] [good]${green}: closes here: all in\nkeep at 13.5 [bad]${red}: 13.5 s: the newest it closes`, line: 21 }];
const text = (items: Item[], s: string) => items.find((i) => i.k === "text" && i.s === s) as Extract<Item, { k: "text" }>;
const texts = (items: Item[], part: string) => items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s.includes(part));
const markerLine = (items: Item[], v: number) => items.find((i) => i.k === "path" && i.bar?.track && i.bar?.value === v && !!i.bar?.edge) as Extract<Item, { k: "path" }>;
const rowFrame = (items: Item[], label: string) => boxes(items).find((b) => b.bar?.kind === "worksheet-row" && b.bar?.label === label)!;

test("[below] under ruler: below sits between the last row and the ruler, right of a short tick; [beside] sits at the rows' top left of its line", () => {
  const c = compileStage(lanesHead("axis: Workers..Collector\n"), labelSteps(" [below]", " [beside]"), 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), ax = axisPath(p.items), rulerY = ax.pts[0][1];
  const a = rowFrame(p.items, "a copy"), b = rowFrame(p.items, "b copy");
  // green: one line, between b's row and the ruler, starting just right of its line, and its line runs only in that gap
  const green = texts(p.items, "closes here");
  expect(green.length).toBe(1);
  const g = green[0], gl = markerLine(p.items, 4.8);
  expect(g.y - 11).toBeGreaterThanOrEqual(b.y + b.h - 1);
  expect(g.y).toBeLessThanOrEqual(rulerY);
  expect(g.x).toBeGreaterThan(gl.pts[0][0]);
  expect(g.x - gl.pts[0][0]).toBeLessThanOrEqual(10);
  expect(Math.min(gl.pts[0][1], gl.pts[1][1])).toBeGreaterThanOrEqual(b.y + b.h - 1);
  expect(Math.max(gl.pts[0][1], gl.pts[1][1])).toBe(rulerY);
  // red: at the top of the rows, level with the first row, right-aligned left of its full-height line
  const red = texts(p.items, "13.5 s").concat(texts(p.items, "newest")).filter((t, i, all) => all.indexOf(t) === i);
  const rl = markerLine(p.items, 13.5), first = red.sort((x, y) => x.y - y.y)[0];
  expect(first.y - 11).toBeGreaterThanOrEqual(a.y - 1);
  expect(first.y).toBeLessThanOrEqual(a.y + a.h + 2);
  for (const t of red) expect(t.x + measure(t.s, "sub")).toBeLessThanOrEqual(rl.pts[0][0] - 2);
  expect(Math.min(rl.pts[0][1], rl.pts[1][1])).toBeLessThan(a.y);
  // nothing shelved above the rows any more: the rows start higher than with the default labels (control)
  beginDocument();
  const p0 = layoutStage(compileStage(lanesHead("axis: Workers..Collector\n"), labelSteps("", ""), 1, {}, roles).model, 1000);
  expect(a.y).toBeLessThan(rowFrame(p0.items, "a copy").y);
  // zero movement between steps
  const place = (s: number) => new Map(p.items.filter((i) => on(i, s) && (i.k === "box" || i.k === "path") && typeof i.id === "string").map((i) => [i.id as string, i.k === "box" ? [i.x, i.y, i.w, i.h] : (i as Extract<Item, { k: "path" }>).pts.flat()]));
  const one = place(1), two = place(2);
  for (const [id, v] of one) if (two.has(id)) expect(two.get(id)).toEqual(v);
});

test("[beside] falls back to the shelf above the rows when row words are in the way; refusals", () => {
  const busy = lanesHead("").replace('row a ta "a copy": +arrives 3.9..4.1 [dot]', 'row a ta "a copy": +busy all the time 0..15');
  const c = compileStage(busy, labelSteps("", " [beside]"), 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), a = rowFrame(p.items, "a copy");
  for (const t of texts(p.items, "newest")) expect(t.y).toBeLessThan(a.y);
  for (const bad of [" [beside] [below]", " [beside] [caption]"]) {
    beginDocument();
    expect(compileStage(lanesHead(""), labelSteps("", bad), 1, {}, roles).errors.length).toBeGreaterThan(0);
  }
  beginDocument();
  expect(compileStage(lanesHead("") + "\nat 2 [beside]: setup", labelSteps("", ""), 1, {}, roles).errors).toEqual([]);
});

// ---- 5. numbered cells on a phone: never closer than 3 px, never under 11 px, on end only when the turned digits fit
import { fontSize, setPhoneFont } from "../../src/core/stage-core";
const readsHead = `job a: the planner | reads once a minute
time reads: 0..31 | reads, one a minute
cells: 1
ruler: none
row labels: beside
row job rd "reads (min)": _ 0..1 [good] [numbered] @1..2; _ 1..30 [good] [numbered] @2..2; _ 30..31 [accent] [lit] [numbered] @2..2; _ 0..1 [dashed] [numbered] @3; _ 1..30 [dashed] [numbered] @3; _ 30..31 [dashed] [numbered] @3
time ticks: 924..956 | ticks of the change · last 3 digits
cells: 1
ruler: none
row labels: beside
row server tk "": _ 924..932 [plain] [numbered]; _ 932..933 [plain] [numbered]; _ 933..953 [plain] [numbered]; _ 953..954 [plain] [numbered]; _ 954..956 [plain] [numbered]
row job s32 "crate 32 · leaving": +_ 924..953 @3; _ 953..956 [dashed] @3`;
const readsSteps = [1, 2, 3, 4].map((i) => ({ title: "S" + i, raw: i === 1 ? "show reads" : i === 3 ? "show ticks" : "", line: 20 + i }));
/** the painted box of a number: a turned one (rotate -90 in the renderer) spans its digits' cap height left of x */
const painted = (t: Extract<Item, { k: "text" }>) => { const len = measure(t.s, t.f), em = fontSize(t.f); if (t.rotate) return { x: t.x - em * 0.72, y: t.y - len / 2, w: em * 0.72, h: len }; const x = t.anchor === "middle" ? t.x - len / 2 : t.anchor === "end" ? t.x - len : t.x; return { x, y: t.y - em * 0.72, w: len, h: em * 0.72 }; };

test("phone numbered cells: no two numbers closer than 3 px, 11 px or more, each range's first number kept", () => {
  for (const w of [390, 360, 1000]) {
    beginDocument();
    const p = layoutStage(compileStage(readsHead, readsSteps, 1, {}, { job: 1, server: 2 }).model, w);
    setPhoneFont(w < 480);
    try {
      for (const s of [1, 2, 3, 4]) {
        const nums = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && on(i, s) && /^\d+$/.test(i.s));
        for (const t of nums) expect(fontSize(t.f)).toBeGreaterThanOrEqual(11);
        const rs = nums.map(painted);
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j], apart = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
          if (apart < 3) throw new Error(`${w} step ${s}: "${nums[i].s}" and "${nums[j].s}" are ${apart.toFixed(1)} px apart`);
        }
        // the first number of each authored range is drawn (0, 1, 30 on the reads; 924, 932, 933, 953, 954 on the ticks)
        const shown = new Set(nums.map((t) => t.s));
        if (s === 2) for (const v of ["0", "1", "30"]) expect(shown.has(v)).toBe(true);
        if (s === 4) for (const v of ["924", "932", "933", "953", "954"]) expect(shown.has(v)).toBe(true);
        // a single digit never stands on end (it fits level)
        for (const t of nums) if (t.s.length === 1) expect(t.rotate).toBeUndefined();
      }
    } finally { setPhoneFont(false); }
  }
});

test("a very dense numbered row on a phone shows fewer numbers, level, 3 px apart, every range's first kept", () => {
  const head = `time: 0..90 | minutes\ncells: 1\nruler: none\nrow labels: beside\nrow job m "m": _ 0..40 [numbered]; _ 40..41 [numbered] [good]; _ 41..90 [numbered]`;
  const steps = [{ title: "One", raw: "", line: 8 }, { title: "Two", raw: "", line: 9 }];
  for (const w of [390, 360]) {
    beginDocument();
    const p = layoutStage(compileStage(head, steps, 1, {}, { job: 1 }).model, w);
    setPhoneFont(true);
    try {
      const nums = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^\d+$/.test(i.s));
      expect(nums.length).toBeLessThan(90);
      for (const v of ["0", "40", "41"]) expect(nums.some((t) => t.s === v)).toBe(true);
      for (const t of nums) { expect(t.rotate).toBeUndefined(); expect(fontSize(t.f)).toBeGreaterThanOrEqual(11); }
      const rs = nums.map(painted);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        expect(Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h))).toBeGreaterThanOrEqual(3);
      }
    } finally { setPhoneFont(false); }
  }
});

test("phone cells NAMED with numbers take the same one-mode-per-row choice as [numbered] cells", () => {
  const names = Array.from({ length: 31 }, (_, i) => `${i} ${i}..${i + 1}`).join("; ");
  const head = `time reads: 0..31 | reads\nruler: none\nrow labels: beside\ncells: 1\nrow server readings "reads": ${names}`;
  const steps = [{ title: "One", raw: "", line: 8 }, { title: "Two", raw: "", line: 9 }];
  for (const w of [390, 360]) {
    beginDocument();
    const p = layoutStage(compileStage(head, steps, 1, {}, { server: 2 }).model, w);
    setPhoneFont(true);
    try {
      const nums = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^\d+$/.test(i.s));
      expect(new Set(nums.map((t) => t.s)).size).toBe(31);
      for (const t of nums) { expect(fontSize(t.f)).toBeGreaterThanOrEqual(11); if (t.s.length === 1) expect(t.rotate).toBeUndefined(); }
      const rs = nums.map(painted);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j], apart = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
        if (apart < 3) throw new Error(`${w}: "${nums[i].s}" and "${nums[j].s}" are ${apart.toFixed(1)} px apart`);
      }
    } finally { setPhoneFont(false); }
  }
});

test("[bar] spans inside their row (none of its states in their range): their chips on one line at the row's top, the bars thin and 7 px apart under it (the original); a phone whose chips would touch keeps a line per bar", () => {
  const head = `time: -0.5..27 | seconds
ticks: 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26
row job r0 "writer": _ -0.4..-0.3 @3
row server a0 "prints": +open until 16 6..16 @3`;
  const raw = [0, 2, 4, 6].map((v) => `span r0 ${v}..${v + 10} [bar]\ntag r0 ${v}..${v + 10}: R`).join("\n");
  const steps = [{ title: "One", raw: "", line: 10 }, { title: "Two", raw, line: 11 }, { title: "Three", raw: "", line: 20 }];
  for (const w of [1280, 1000, 390]) {
    beginDocument();
    const p = layoutStage(compileStage(head, steps, 1, {}, { job: 1, server: 2 }).model, w);
    const row = boxes(p.items).find((b) => b.bar?.kind === "worksheet-row" && b.bar?.label === "writer" && on(b, 2))!;
    const bars = boxes(p.items).filter((b) => b.cls?.includes("stg-span-bar") && on(b, 2)).sort((x, y) => x.y - y.y);
    const chips = boxes(p.items).filter((b) => b.bar?.label === "R" && on(b, 2)).sort((x, y) => x.x - y.x);
    expect(bars.length).toBe(4); expect(chips.length).toBe(4);
    for (const b of bars) expect(b.bar?.kind).toBe("time-bar"); // a bar is stamped as a time-bar
    for (const b of [...bars, ...chips]) { expect(b.y).toBeGreaterThanOrEqual(row.y - 1); expect(b.y + b.h).toBeLessThanOrEqual(row.y + row.h + 1); }
    for (let k = 0; k < 4; k++) for (let l = k + 1; l < 4; l++) { const c = chips[k], d = chips[l]; expect(c.x + c.w + 2 <= d.x || d.x + d.w + 2 <= c.x || c.y + c.h <= d.y || d.y + d.h <= c.y).toBe(true); } // chips never touch
    const xs = [...bars].sort((x, y) => x.x - y.x);
    for (let k = 0; k < 4; k++) { const c = chips[k]; if (Math.abs(c.x + c.w / 2 - xs[k].x) > 1) expect(c.x <= xs[k].x && c.x + c.w >= xs[k].x && (k > 0 || c.x <= xs[0].x)).toBe(true); } // each chip centred on its bar's start (or held inside the block, still over it)
    if (w >= 1000) {
      expect(new Set(chips.map((c) => c.y)).size).toBe(1);                      // one chip line
      for (const b of bars) { expect(b.y).toBeGreaterThanOrEqual(chips[0].y + chips[0].h + 2); expect(b.h).toBeLessThanOrEqual(6); }
      for (let k = 1; k < 4; k++) { expect(bars[k].y - bars[k - 1].y).toBeGreaterThanOrEqual(6); expect(bars[k].y - bars[k - 1].y).toBeLessThanOrEqual(8); }
      expect(row.h).toBeLessThanOrEqual(chips[0].h + 4 + 4 * 7 + 8);
    } else for (let k = 1; k < 4; k++) expect(bars[k].y - bars[k - 1].y).toBeGreaterThanOrEqual(6);
    const prints = boxes(p.items).find((b) => b.bar?.kind === "worksheet-row" && b.bar?.label === "prints" && on(b, 3))!;
    expect(prints.y - (row.y + row.h)).toBeLessThanOrEqual(16);
  }
});

test("phone, ruler below: a [beside] label on the shelf sits under the block's caption, and no marker line crosses a [below] label", () => {
  const steps = [{ title: "One", raw: "c --> wa", line: 20 }, { title: "Two", raw: "keep at 4.8 [solid] [good] [below]: closes here: every counter is in\nkeep at 13.5 [bad] [beside]: 13.5 s = 80%: the newest it closes", line: 21 }];
  for (const w of [390, 360]) {
    beginDocument();
    const p = layoutStage(compileStage(lanesHead("axis: Workers..Collector\n"), steps, 1, {}, roles).model, w);
    setPhoneFont(true);
    try {
      const caption = text(p.items, "one window, 0 to 15 s"), a = rowFrame(p.items, "a copy");
      const red = texts(p.items, "newest").concat(texts(p.items, "13.5 s")).filter((t, i, all) => all.indexOf(t) === i);
      expect(red.length).toBeGreaterThan(0);
      for (const t of red) { expect(t.y - 11).toBeGreaterThanOrEqual(caption.y); expect(t.y).toBeLessThanOrEqual(a.y + 1); }
      // every [below] word stays clear of every marker line
      const lines = [4.8, 13.5].map((v) => { const l = markerLine(p.items, v); return { x: l.pts[0][0], top: Math.min(l.pts[0][1], l.pts[1][1]), bottom: Math.max(l.pts[0][1], l.pts[1][1]) }; });
      for (const g of texts(p.items, "").filter((t) => /closes|every|counter|newest|^in$/.test(t.s) && on(t, 2))) {
        const r = painted(g);
        for (const l of lines) if (l.top < r.y + r.h && l.bottom > r.y) expect(l.x <= r.x - 2 || l.x >= r.x + r.w + 2).toBe(true);
      }
    } finally { setPhoneFont(false); }
  }
});

test("hush span retires a kept span's words from its step, alone or with a marker on one hush line; its line and place stay", () => {
  const head = `time: 0..60 | seconds\nrow job j1 "build": queued 0..4; +running 4..31; done 31..60\nrow server j2 "test": waiting 0..31; +running 31..52; done 52..60`;
  const mk = (third: string) => [{ title: "One", raw: "keep span j1 4..31: 27 s of building\nkeep at 31: handoff", line: 10 }, { title: "Two", raw: "", line: 12 }, { title: "Three", raw: third, line: 14 }];
  for (const third of ["hush span j1 4..31", "hush at 31, span j1 4..31"]) {
    beginDocument();
    const c = compileStage(head, mk(third), 1, {}, { job: 1, server: 2 });
    expect(c.errors).toEqual([]);
    for (const w of [1000, 390]) {
      const p = layoutStage(c.model, w);
      const words = (s: number) => p.items.filter((i) => i.k === "text" && i.s === "27 s of building" && on(i, s));
      expect(words(1).length).toBe(1); expect(words(2).length).toBe(1); expect(words(3).length).toBe(0);
      const line = (s: number) => p.items.filter((i) => i.k === "path" && typeof i.id === "string" && i.id.includes(":span:") && on(i, s)).map((i) => JSON.stringify((i as Extract<Item, { k: "path" }>).pts));
      expect(line(3)).toEqual(line(2));
      expect(line(3).length).toBe(1);
      const handoff = (s: number) => p.items.filter((i) => i.k === "text" && i.s === "handoff" && on(i, s)).length;
      expect(handoff(3)).toBe(third.includes("at 31") ? 0 : 1);
    }
    expect(stageLlm(c)).toContain("Span caption build 4 to 31 hidden; its line stays.");
  }
  for (const bad of ["hush span j1 4..30", "hush span zz 4..31", "hush span j1", "hush at 31, span j1 0..4"]) {
    beginDocument();
    expect(compileStage(head, mk(bad), 1, {}, { job: 1, server: 2 }).errors.length).toBeGreaterThan(0);
  }
});

test("phone: a shelved [beside] label has its line run up beside its words, clear of them; a dot's long words wrap beside the dot on its own row", () => {
  const head = lanesHead("axis: Workers..Collector\n").replace('+arrives 4.2..4.4 [dot]', '+arrives 4.2..4.4 @1..1 [dot]; +arrives: labels kept, values dropped 4.2..4.4 @2 [dot]');
  const steps = [{ title: "One", raw: "c --> wa", line: 20 }, { title: "Two", raw: "keep at 4.8 [solid] [good] [below]: closes here: every counter is in\nkeep at 13.5 [bad] [beside]: 13.5 s = 80%: the newest it closes", line: 21 }];
  for (const w of [390, 360, 1280]) {
    beginDocument();
    const c = compileStage(head, steps, 1, {}, roles);
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    setPhoneFont(w < 480);
    try {
      const red = markerLine(p.items, 13.5), rx = red.pts[0][0], rTop = Math.min(red.pts[0][1], red.pts[1][1]);
      const b = rowFrame(p.items, "b copy"), words = texts(p.items, "").filter((t) => on(t, 2) && /labels|values|dropped/.test(t.s));
      expect(words.map((t) => t.s).join(" ")).toBe("arrives: labels kept, values dropped");
      for (const t of words) { const r = painted(t); expect(r.y).toBeGreaterThanOrEqual(b.y - 1); expect(r.y + r.h).toBeLessThanOrEqual(b.y + b.h + 1); expect(r.x + r.w).toBeLessThanOrEqual(rx - 4); }
      if (w < 480) {
        // (1) the shelved label: its line reaches up beside its words, the words end 4+ px left of it
        const redWords = texts(p.items, "").filter((t) => on(t, 2) && /13\.5 s|newest|closes$/.test(t.s) && !/every/.test(t.s));
        expect(redWords.length).toBeGreaterThan(0);
        for (const t of redWords) { const r = painted(t); expect(rTop).toBeLessThanOrEqual(r.y + 2); expect(r.x + r.w).toBeLessThanOrEqual(rx - 4); }
        // no two words of step 2 overlap
        const all = texts(p.items, "").filter((t) => on(t, 2)).map(painted);
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const A = all[i], B = all[j]; expect(A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h).toBe(false); }
      } else expect(words.length).toBe(1); // a desktop keeps the one line beside the dot
    } finally { setPhoneFont(false); }
  }
});

test("phone numbers: every cell's number drawn (never fewer): level in its cell, on end only inside its own cell, else level on 2 or 3 staggered rows, else on end staggered", () => {
  for (const w of [390, 360]) {
    beginDocument();
    const p = layoutStage(compileStage(readsHead, readsSteps, 1, {}, { job: 1, server: 2 }).model, w);
    setPhoneFont(true);
    try {
      const cells = boxes(p.items).filter((b) => /:cell:/.test(b.id || ""));
      for (const st of [1, 2, 3, 4]) {
        // the reader's facts: every visible cell's number is drawn in that step
        const shown = new Set(p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && on(i, st) && /^\d+$/.test(i.s)).map((t) => t.s));
        for (const c of cells.filter((c) => on(c, st) && /^\d+$/.test(String(c.bar?.label)))) expect(shown.has(String(c.bar?.label))).toBe(true);
      }
      const nums = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^\d+$/.test(i.s));
      for (const t of nums) expect(fontSize(t.f)).toBeGreaterThanOrEqual(11);
      // rc.2 MUST 7: every number is tied to its own cell: on end inside it when the turned digits fit (the reads, cells about 9 px at 390),
      // else level on staggered rows with a leader to its cell (the ticks, cells about 7.4 px)
      for (const t of nums) expect(tiedToCell(p.items, t, cells)).toBe("");
      if (w === 390) { expect(nums.filter((t) => t.s.length === 2).every((t) => t.rotate)).toBe(true); expect(nums.filter((t) => t.s.length === 3).some((t) => t.rotate)).toBe(false); }
      for (const t of nums.filter((n) => n.rotate)) { const r = painted(t); expect(r.w).toBeLessThanOrEqual(fontSize("chip")); }
    } finally { setPhoneFont(false); }
  }
});

test("a band spans the whole block width (the original's zone regions), with the ruler above or below", () => {
  for (const ruler of ["", "ruler: below\n"]) for (const w of [1280, 390]) {
    beginDocument();
    const src = `time: 0..20 | seconds\nticks: 0, 10, 20\n${ruler}row job r0 "writer": +work 0..10\nrow server a0 "prints": +prints 5..15\nrow job e "printer": +run 0..20\nband job b0 "Desk 0": r0..a0`;
    const c = compileStage(src, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }], 1, {}, { job: 1, server: 2 });
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), b = boxes(p.items).find((i) => i.bar?.kind === "band" && i.bar?.label === "Desk 0")!;
    const rows = boxes(p.items).filter((i) => i.bar?.kind === "worksheet-row");
    expect(b.x).toBeLessThanOrEqual(Math.min(...rows.map((r) => r.x)) + 2); expect(b.w).toBeGreaterThanOrEqual(p.w - 2 * 16 - 4); // the whole block width
    expect(b.x + b.w).toBeGreaterThanOrEqual(Math.max(...rows.map((r) => r.x + r.w)) - 2);
  }
});

test("phone numbers at the real phone stage (about 340 px at a 390 px screen): level on up to 4 staggered rows, 3 px apart even when the browser's digits run 12% wider; no sideways number; the block no taller", () => {
  for (const w of [340, 338]) {
    beginDocument();
    const p = layoutStage(compileStage(readsHead, readsSteps, 1, {}, { job: 1, server: 2 }).model, w);
    setPhoneFont(true);
    try {
      const nums = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^\d+$/.test(i.s));
      expect(nums.some((t) => t.rotate)).toBe(false);
      const wide = (t: Extract<Item, { k: "text" }>) => { const r = painted(t), extra = r.w * 0.12; return { ...r, x: r.x - extra / 2, w: r.w + extra }; };
      for (const st of [1, 2, 3, 4]) {
        const vis = nums.filter((t) => on(t, st)), rs = vis.map(wide);
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j], apart = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
          if (apart < 3) throw new Error(`${w} step ${st}: "${vis[i].s}" and "${vis[j].s}" ${apart.toFixed(1)} px apart`);
        }
      }
      const tk = boxes(p.items).find((b) => b.bar?.kind === "worksheet-row" && /:row:tk:/.test(b.id || ""))!;
      expect(tk.h).toBeLessThanOrEqual(56); // four level rows of digits: no taller than the two turned rows they replace
    } finally { setPhoneFont(false); }
  }
});

test("a phone number crossed by a marker line gets a backing in its cell's colour, so the line passes behind it", () => {
  const head = readsHead.replace('row job s32 "crate 32 · leaving"', 'at 932 [solid]: warm\nat 953 [bad]: switch\nrow job s32 "crate 32 · leaving"');
  for (const w of [340, 390]) {
    beginDocument();
    const c = compileStage(head, readsSteps, 1, {}, { job: 1, server: 2 });
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    setPhoneFont(true);
    try {
      const lines = [932, 953].map((v) => markerLine(p.items, v)).filter(Boolean).map((l) => l.pts[0][0]);
      expect(lines.length).toBe(2);
      const nums = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^9\d\d$/.test(i.s) && !i.rotate);
      let crossed = 0;
      for (const t of nums) {
        const r = painted(t);
        for (const x of lines) if (x > r.x - 1 && x < r.x + r.w + 1) {
          crossed++;
          const k = p.items.indexOf(t), mask = p.items.slice(0, k).reverse().find((i) => i.k === "box" && i.cls === "stg-time-word-mask" && i.x <= x && i.x + i.w >= x && i.y <= r.y && i.y + i.h >= r.y + r.h - 1);
          if (!mask) throw new Error(`${w}: "${t.s}" crossed by the line at ${x.toFixed(1)} has no backing`);
        }
      }
      expect(crossed).toBeGreaterThan(0);
    } finally { setPhoneFont(false); }
  }
});

test("phone: a [wide] cell's number that cannot fit inside it (with 12% room for browser glyphs) go to a caption under the row, never clipped at its edge", () => {
  const src = `time ticks: 924..956 | ticks\ncells: 1\nruler: none\nrow labels: beside\nrow job s32 "crate 32 · leaving": +_ 924..953; _ 953..956 [dashed]\nrow server s7 "crate 7 · gets it": _ 924..932 [dashed]; _ 932..953 [warn]; +_ 953..956\nrow job sts "Workbenches": +36 bins each, until every bin reports switched 924..953 [wide]; 32 953..956 [good] [wide]`;
  for (const w of [319, 340, 1280]) {
    beginDocument();
    const c = compileStage(src, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }], 1, {}, { job: 1, server: 2 });
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    setPhoneFont(w < 480);
    try {
      const cell = boxes(p.items).find((b) => /:seg:sts:953:/.test(b.id || ""))!;
      const word = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^32( |$)/.test(i.s))[0];
      expect(word).toBeDefined();
      const r = painted(word), extra = r.w * 0.12;
      const inside = r.x - extra / 2 >= cell.x + 2 && r.x + r.w + extra / 2 <= cell.x + cell.w - 2 && r.y >= cell.y && r.y + r.h <= cell.y + cell.h;
      const under = r.y >= cell.y + cell.h;
      expect(inside || under).toBe(true);
      if (w === 1280) expect(inside).toBe(true);
    } finally { setPhoneFont(false); }
  }
});

test("phone staggered numbers sit on a backing over the cell borders, drawn after every cell of their row (a lit cell never hides a neighbour's number), and never poke past the table (955)", () => {
  for (const w of [340, 319]) {
    beginDocument();
    const p = layoutStage(compileStage(readsHead, readsSteps, 1, {}, { job: 1, server: 2 }).model, w);
    setPhoneFont(true);
    try {
      for (const row of ["rd", "tk"]) {
        const cells = p.items.map((it, k) => ({ it, k })).filter(({ it }) => it.k === "box" && new RegExp(`:cell:${row}:`).test(it.id || ""));
        const lastCell = Math.max(...cells.map((c) => c.k));
        const frame = boxes(p.items).find((b) => new RegExp(`:row:${row}:`).test(b.id || ""))!;
        const nums = p.items.map((it, k) => ({ it, k })).filter(({ it }) => it.k === "text" && /^\d+$/.test(it.s) && !it.rotate && it.y > frame.y && it.y <= frame.y + frame.h);
        if (w === 340 || row === "rd") expect(nums.length).toBeGreaterThan(10); // at 319 the ticks (5.5 px cells) still stand on end
        for (const { it, k } of nums) {
          const t = it as Extract<Item, { k: "text" }>, r = painted(t), extra = r.w * 0.12;
          expect(k).toBeGreaterThan(lastCell);
          const mask = p.items.slice(0, k).reverse().find((m) => m.k === "box" && m.cls === "stg-time-word-mask" && m.x <= r.x - extra / 2 + 0.5 && m.x + m.w >= r.x + r.w + extra / 2 - 0.5 && m.y <= r.y + 0.5 && m.y + m.h >= r.y + r.h - 0.5);
          if (!mask) throw new Error(`${w} ${row}: "${t.s}" has no backing`);
          expect(r.x - extra / 2).toBeGreaterThanOrEqual(frame.x);
          expect(r.x + r.w + extra / 2).toBeLessThanOrEqual(frame.x + frame.w);
        }
      }
    } finally { setPhoneFont(false); }
  }
});

test("phone widths 326/341/356/380 (window - 34): staggered numbers stay inside the grid's last cell edge; a long [below] label sits under its own line (30; openFromTick/shiftTick)", () => {
  const head = readsHead;
  const steps = readsSteps.map((s, i) => i === 2 ? { ...s, raw: s.raw + "\nkeep at ticks 932 [guide] [below]: openFromTick …932 · 10:20:00\nkeep at ticks 953 [bad] [guide] [below]: shiftTick …953 · 10:25:15" } : s);
  for (const w of [326, 341, 356, 380]) {
    beginDocument();
    const c = compileStage(head, steps, 1, {}, { job: 1, server: 2 });
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    setPhoneFont(true);
    try {
      for (const row of ["rd", "tk"]) {
        const cells = boxes(p.items).filter((b) => new RegExp(`:cell:${row}:`).test(b.id || "")), right = Math.max(...cells.map((b) => b.x + b.w));
        const frame = boxes(p.items).find((b) => new RegExp(`:row:${row}:`).test(b.id || ""))!;
        for (const t of p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^\d+$/.test(i.s) && !i.rotate && i.y > frame.y && i.y <= frame.y + frame.h)) {
          const r = painted(t);
          if (r.x + r.w * 1.06 > right + 0.5) throw new Error(`${w} ${row}: "${t.s}" ends ${(r.x + r.w * 1.06 - right).toFixed(1)} px past the grid`);
        }
      }
      const shelf = new Set<number>();
      for (const [v, word, time] of [[932, "openFromTick", "10:20:00"], [953, "shiftTick", "10:25:15"]] as const) {
        const line = p.items.find((i) => i.k === "path" && i.bar?.kind === "guide" && i.bar?.value === v) as Extract<Item, { k: "path" }>, lx = line.pts[0][0];
        const own = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && (i.s.startsWith(word) || i.s === time || i.s.endsWith(time)));
        expect(own.length).toBeGreaterThan(0);
        for (const t of own) { const r = painted(t); shelf.add(t.y); expect(t.anchor).toBe("end"); expect(Math.abs(r.x + r.w - lx)).toBeLessThanOrEqual(0.5); } // each line ends on its own dashed line (anchored there, whatever the font's width)
      }
      expect(shelf.size).toBeLessThanOrEqual(2); // not stacked: both share one shelf
    } finally { setPhoneFont(false); }
  }
});


// ---- "time: a..b | caption | beside" and "band... | compact"
const pairHead = (timeLine: string, compact: string) => `job s: sender | sends
server r: receiver | counts
${timeLine}
ticks: 0, 5, 10, 15, 20
row job a1 "first · leader": +go 0..4; +go 5..9
row job a2 "first prints": +prints 2..12
row server b1 "second · follower": _ 1..1.4 [dot]; _ 6..6.4 [dot]
row server b2 "second waits": +waits 3..18
row job z "after": +done 18..20
band job ba "first · leader": a1..a2${compact}
band server bb "second · follower": b1..b2${compact}`;
const pairSteps = [{ title: "One", raw: "s --> r", line: 30 }, { title: "Two", raw: "", line: 31 }];
const textsOf = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text");

test("time: a..b | caption | beside: on desktop the caption sits on the tick-number line in the gutter left of the axis, and the block is one caption line shorter; a phone keeps it above", () => {
  const plain = compileStage(pairHead("time: 0..20 | seconds", ""), pairSteps, 1, {}, roles), beside = compileStage(pairHead("time: 0..20 | seconds | beside", ""), pairSteps, 1, {}, roles);
  expect(plain.errors).toEqual([]); expect(beside.errors).toEqual([]);
  const p0 = layoutStage(plain.model, 1000), p1 = layoutStage(beside.model, 1000);
  const cap = textsOf(p1.items).find((t) => t.s === "seconds")!, tick = textsOf(p1.items).find((t) => t.s === "5")!, axis = axisPath(p1.items);
  expect(cap.y).toBe(tick.y); // on the tick-number line
  expect(cap.x + measure("seconds", "sub") * 1.12).toBeLessThanOrEqual(axis.pts[0][0]); // left of the axis
  expect(p1.h).toBe(p0.h - 18);
  const rows0 = boxes(p0.items).filter((b) => b.bar?.kind === "band").map((b) => b.y), rows1 = boxes(p1.items).filter((b) => b.bar?.kind === "band").map((b) => b.y);
  rows1.forEach((y, i) => expect(y).toBe(rows0[i] - 18));
  // phone: no gutter for it, so the caption stays above, exactly as without the word
  for (const w of [356, 390]) { beginDocument(); const a = layoutStage(compileStage(pairHead("time: 0..20 | seconds", ""), pairSteps, 1, {}, roles).model, w); beginDocument(); const b = layoutStage(compileStage(pairHead("time: 0..20 | seconds | beside", ""), pairSteps, 1, {}, roles).model, w); expect(JSON.stringify(b.items)).toBe(JSON.stringify(a.items)); }
  // a caption is the second field; "beside" alone is a caption
  beginDocument(); const lone = compileStage(pairHead("time: 0..20 | beside", ""), pairSteps, 1, {}, roles);
  expect(textsOf(layoutStage(lone.model, 1000).items).some((t) => t.s === "beside")).toBe(true);
});

test("band... | compact: its rows pack under the band's title (name, then sub, split at ' · '), without their own labels and 2 px apart; rows outside keep theirs; nothing changes without the word", () => {
  const plain = compileStage(pairHead("time: 0..20 | seconds", ""), pairSteps, 1, {}, roles), packed = compileStage(pairHead("time: 0..20 | seconds", " | compact"), pairSteps, 1, {}, roles);
  expect(plain.errors).toEqual([]); expect(packed.errors).toEqual([]);
  for (const w of [1000, 390]) {
    beginDocument(); const p0 = layoutStage(compileStage(pairHead("time: 0..20 | seconds", ""), pairSteps, 1, {}, roles).model, w);
    beginDocument(); const p1 = layoutStage(compileStage(pairHead("time: 0..20 | seconds", " | compact"), pairSteps, 1, {}, roles).model, w);
    const T = textsOf(p1.items).map((t) => t.s);
    for (const own of ["first prints", "second waits"]) { expect(textsOf(p0.items).some((t) => t.s === own)).toBe(true); expect(T).not.toContain(own); }
    expect(T).toContain("after"); // a row outside the bands keeps its label
    const name = textsOf(p1.items).find((t) => t.s === "first")!, sub = textsOf(p1.items).find((t) => t.s === "leader")!;
    expect(name.ink).toBe("role:job:ink"); expect(sub.ink).toBe("muted"); expect(sub.y).toBeGreaterThan(name.y);
    const band = (p: typeof p1, id: string) => boxes(p.items).find((b) => b.id?.endsWith(`:band:${id}`))!;
    expect(band(p1, "ba").h).toBeLessThan(band(p0, "ba").h);
    expect(band(p1, "ba").bar?.label).toBe("first · leader");
    const rowsIn = boxes(p1.items).filter((b) => b.bar?.kind === "worksheet-row" && ["first · leader", "first prints"].includes(b.bar?.label ?? "")).sort((a, b) => a.y - b.y);
    if (rowsIn.length === 2) expect(rowsIn[1].y - (rowsIn[0].y + rowsIn[0].h)).toBeLessThanOrEqual(2.01);
    expect(p1.h).toBeLessThan(p0.h);
  }
  const bad = compileStage(pairHead("time: 0..20 | seconds", " | compacted"), pairSteps, 1, {}, roles);
  expect(bad.errors.map((e) => e.msg).join(" ")).toContain("optionally ending | compact");
});

test("phone cell words too wide for their cell are tied to it: on end inside it (rc.2, sample 29), or under the row with a leader in its ink from its bottom edge (rc.2 MUST 7)", () => {
  const head = `job s: sender | sends
time: 0..12 | hours
cells: 1
row job b "batch": waiting 0..3; +working 3..9; finished 9..12`;
  for (const w of [356, 326]) {
    beginDocument();
    const c = compileStage(head, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }], 1, {}, roles);
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    setPhoneFont(true);
    try {
      const cells = boxes(p.items).filter((b) => /:cell:b:/.test(b.id || ""));
      const words = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^(waiting|working|finished)$/.test(i.s));
      expect(words.length).toBe(12); // one word per cell
      const leaders = p.items.filter((i): i is Extract<Item, { k: "path" }> => i.k === "path" && i.cls === "stg-time-leader");
      for (const t of words) {
        if (t.rotate) { const own = cells.find((c) => t.x - fontSize(t.f) * 0.72 >= c.x - 1 && t.x <= c.x + c.w + 1); expect(own).toBeDefined(); continue; } // on end inside its own cell
        const top = t.y - fontSize(t.f) * 0.72, half = measure(t.s, t.f) / 2;
        const lead = leaders.find((l) => Math.abs(l.pts[1][1] - top) <= 2 && l.pts[0][0] >= t.x - half && l.pts[0][0] <= t.x + half && cells.some((c) => Math.abs(c.x + c.w / 2 - l.pts[0][0]) < 0.6 && Math.abs(c.y + c.h - l.pts[0][1]) < 0.6));
        if (!lead) throw new Error(`${w}: "${t.s}" at ${t.x.toFixed(1)},${t.y} has no leader from its cell`);
        expect(lead.ink).toBe(t.s === "working" ? "role:job:line" : "line-2");
      }
      expect(words.filter((t) => !t.rotate).length).toBe(new Set(leaders.map((l) => Math.round(l.pts[0][0] * 10))).size); // one leader per word under the row
    } finally { setPhoneFont(false); }
  }
});

test("a bar too narrow for its name: the name sits under the row tied to its bar by a leader, never with the source range ('R 0..1') (24 lane, gap g)", () => {
  const head = `job s: sender | sends
time: -0.5..27 | seconds
row job r "writer": +R -0.3..0.3; +R 1.7..2.3; +open until 6 + 10 = 16 6.3..16
row job e "printer": +print, fold, pack 0..6.5; paused 0.5 s 6.5..7; +work 23..27`;
  for (const w of [356, 326, 1000]) {
    beginDocument();
    const c = compileStage(head, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }], 1, {}, roles);
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    const texts = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text");
    for (const t of texts) expect(/-?\d+(\.\d+)?\.\.-?\d/.test(t.s)).toBe(false); // author syntax never reaches the reader
    const segs = boxes(p.items).filter((b) => /:seg:/.test(b.id || ""));
    const leaders = p.items.filter((i): i is Extract<Item, { k: "path" }> => i.k === "path" && i.cls === "stg-time-leader");
    for (const s of segs) {
      const name = String(s.bar?.label);
      const inside = texts.find((t) => t.s === name && t.y > s.y && t.y < s.y + s.h);
      if (inside) continue;
      const under = texts.filter((t) => t.s === name && t.y > s.y + s.h);
      const tied = under.some((t) => leaders.some((l) => Math.abs(l.pts[0][1] - (s.y + s.h)) < 0.6 && l.pts[0][0] >= s.x - 0.5 && l.pts[0][0] <= s.x + s.w + 0.5 && Math.abs(l.pts[1][1] - (t.y - fontSize(t.f) * 0.72)) <= 2 && Math.abs(l.pts[1][0] - t.x) <= measure(t.s, t.f) / 2));
      if (!tied) throw new Error(`${w}: "${name}" (${s.x.toFixed(1)}..${(s.x + s.w).toFixed(1)}) is neither inside its bar nor tied to it`);
    }
  }
});

test("'time: a..b | caption | waits': a block whose rows all start at a later step shows only its caption before then: no empty grid (24 lane, gap f); without the word nothing waits", () => {
  for (const [flag, waits] of [[" | waits", true], ["", false]] as const) {
  const head = `job s: sender | sends
time: 0..27 | seconds${flag}
ticks: 0, 10, 20
row job r "writer": +R 0..1 @2; +R 2..3 @2
row job e "printer": +work 0..6.5 @3`;
  const steps = [1, 2, 3].map((n) => ({ title: `S${n}`, raw: "", line: 10 + n }));
  for (const w of [1000, 356]) {
    beginDocument();
    const c = compileStage(head, steps, 1, {}, roles);
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    const on = (i: Item, st: number) => (!i.from || i.from <= st) && (!i.to || i.to >= st) && (!(i as any).on || (i as any).on.includes(st));
    const step1 = p.items.filter((i) => on(i, 1) && !(i.k === "text" && i.s === "s") && !/^(s|sender|sends)$/.test(String((i as any).s ?? "")) && !String((i as any).id || "").startsWith("s"));
    const timeItems = step1.filter((i) => i.k !== "text" || i.s !== "seconds");
    // at step 1 the block draws its unit label and nothing else of its own (no frame, rows, ruler or row labels)
    expect(step1.some((i) => i.k === "text" && i.s === "seconds")).toBe(true);
    const own = timeItems.filter((i) => i.cls !== "stg-region" /* an invisible layout region */ && /time|stg-/.test(String(i.cls || "") + String((i as any).id || "")) || (i.k === "text" && /^(writer|printer|0|10|20)$/.test(i.s)));
    if (!waits) { expect(own.some((i) => i.k === "text" && i.s === "writer")).toBe(true); continue; } // unchanged without the word
    if (own.length) throw new Error(`${w}: step 1 draws ${own.map((i) => i.k + ":" + ((i as any).s || i.cls || (i as any).id)).slice(0, 6).join(", ")}`);
    // from step 2 the grid and both rows are there
    expect(p.items.some((i) => on(i, 2) && i.k === "text" && i.s === "writer")).toBe(true);
  }
  }
});

test("phone cell and header words too wide for their column stand on end inside it, never in tiers or under the row (rc.2; sample 29)", () => {
  const head = `job s: sender | sends
time: 0..8
cells: 1 | headers
ticks: 0.5 first, 1.5 receiptTick, 2.5 third, 3.5 fourth, 4.5 fifth, 5.5 sixth, 6.5 seventh, 7.5 eighth
row job archive "": operators 0..4; /receipt 4..5; archived 5..6; payload 6..7 @2; paused 7..8 @2`;
  for (const w of [356, 326]) {
    beginDocument();
    const c = compileStage(head, [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }], 1, {}, roles);
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    setPhoneFont(true);
    try {
      const cells = boxes(p.items).filter((b) => /:cell:/.test(b.id || "")), heads = boxes(p.items).filter((b) => /:header:/.test(b.id || ""));
      const texts = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text");
      const inside = (t: Extract<Item, { k: "text" }>, b: Extract<Item, { k: "box" }>) => {
        const half = t.rotate ? fontSize(t.f) * 0.72 : measure(t.s, t.f) / 2, long = t.rotate ? measure(t.s, t.f) / 2 : fontSize(t.f) * 0.72;
        const cx = t.rotate ? t.x - fontSize(t.f) * 0.36 : t.x, cy = t.rotate ? t.y : t.y - long / 2;
        return cx - half / (t.rotate ? 2 : 1) >= b.x - 1 && cx + half / (t.rotate ? 2 : 1) <= b.x + b.w + 1 && cy - long >= b.y - 1 && cy + long <= b.y + b.h + 1;
      };
      for (const word of ["first", "receiptTick", "third", "fourth", "fifth", "sixth", "seventh", "eighth"]) {
        const t = texts.find((x) => x.s === word); if (!t) throw new Error(`${w}: header "${word}" not drawn`);
        if (!heads.some((h) => inside(t, h))) throw new Error(`${w}: header "${word}" at ${t.x.toFixed(1)},${t.y.toFixed(1)} is not inside a header column`);
      }
      for (const word of ["operators", "/receipt", "archived", "payload", "paused"]) {
        const drawn = texts.filter((x) => x.s === word); expect(drawn.length).toBeGreaterThan(0);
        for (const t of drawn) if (!cells.some((b) => inside(t, b))) throw new Error(`${w}: "${word}" at ${t.x.toFixed(1)},${t.y.toFixed(1)} is not inside a cell`);
      }
      expect(p.items.some((i) => i.k === "path" && i.cls === "stg-time-leader")).toBe(false); // nothing needs a leader any more
    } finally { setPhoneFont(false); }
  }
});

test("'role id below time: title' puts a band of one card under the time block, across every lane; what lay below it moves up; its place stays when it is hidden (24 lane)", () => {
  const src = (place: string) => `## Left
job a: left card
## Right
server b: right card
time: 0..10 | seconds
row job r "work": +run 0..10
job d ${place}: the copy line keeps going | only folding waits`;
  const steps = [{ title: "One", raw: "", line: 20 }, { title: "Two", raw: "hide d", line: 21 }];
  for (const w of [1000, 356]) {
    beginDocument();
    const c = compileStage(src("below time"), steps, 1, {}, roles);
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    const card = boxes(p.items).find((b) => b.bar?.kind === "card" && String(b.bar?.label).startsWith("the copy line"))!;
    const row = boxes(p.items).find((b) => /:seg:r:/.test(b.id || ""))!;
    const left = boxes(p.items).find((b) => b.bar?.kind === "card" && b.bar?.label === "left card")!;
    expect(card).toBeDefined(); expect(row).toBeDefined();
    expect(card.y).toBeGreaterThan(row.y + row.h); // under the time block
    expect(row.y).toBeGreaterThan(left.y + left.h); // the time block right under the lanes (nothing reserved between)
    expect(card.w).toBeGreaterThan(w * 0.8); // across the lanes
    expect(p.h).toBeGreaterThanOrEqual(card.y + card.h); // inside the stage
    beginDocument();
    const under = layoutStage(compileStage(src("under Left..Right"), steps, 1, {}, roles).model, w);
    expect(under.h).toBe(p.h); // the same height as "under": only the order changes
  }
  beginDocument();
  expect(compileStage(src("below lanes"), steps, 1, {}, roles).errors.map((e) => e.msg).join()).toContain("below time");
});

test("wordless [bar] spans in one step stack 7 px apart, 5 px tall (the engine's compact packing); a bar with words keeps its own line (24 lane)", () => {
  const head = `job s: sender | sends
time: 0..20 | seconds
row job r "writer": +R 0..1; +R 2..3; +R 4..5`;
  const steps = [{ title: "One", raw: "span r 0..10 [bar]\nspan r 2..12 [bar]\nspan r 4..14 [bar]\nspan r 6..16 [bar]: open until 16", line: 10 }, { title: "Two", raw: "", line: 12 }];
  for (const w of [1000, 356]) {
    beginDocument();
    const c = compileStage(head, steps, 1, {}, roles);
    expect(c.errors).toEqual([]);
    const bars = boxes(layoutStage(c.model, w).items).filter((b) => b.cls?.includes("stg-span-bar")).sort((a, b) => a.y - b.y);
    expect(bars.length).toBe(4);
    const bare = bars.filter((b) => b.bar?.label !== "open until 16");
    for (const b of bare) expect(b.h).toBe(5);
    for (let i = 1; i < bare.length; i++) expect(bare[i].y - bare[i - 1].y).toBe(7);
    expect(bars.find((b) => b.bar?.label === "open until 16")!.h).toBe(10); // its words sit beside it on their own line
  }
});

test("in a '| waits' block each row (frame, label, words) waits for its own first step; without the word rows show from the block's first step (24 lane)", () => {
  const src = (waits: string) => `job s: sender | sends
time: 0..20 | seconds${waits}
row job r "writer": +R 0..1 @1
row job e "printer work": +run 0..20 @3`;
  const steps = [1, 2, 3].map((n) => ({ title: "S" + n, raw: "", line: 10 + n }));
  for (const w of [1000, 356]) {
    beginDocument();
    const c = compileStage(src(" | waits"), steps, 1, {}, roles);
    expect(c.errors).toEqual([]);
    const its = layoutStage(c.model, w).items;
    const label = its.find((it) => it.k === "text" && it.s === "printer work")!;
    expect(label).toBeDefined();
    expect(label.from).toBe(3);
    expect(its.find((it) => it.k === "text" && it.s === "writer")!.from).toBe(1);
    beginDocument();
    const plain = layoutStage(compileStage(src(""), steps, 1, {}, roles).model, w).items;
    expect(plain.find((it) => it.k === "text" && it.s === "printer work")!.from ?? 1).toBe(1);
  }
});

test("'hush tag <row> a..b' ends a row tag's chip from that step; its fact says so; a range with no tag is refused (24 lane)", () => {
  const head = `job s: sender | sends
time: 0..30 | seconds
row job r "reader": _ 6.8..7.2 [dot]; _ 22.8..23.2 [dot]`;
  const steps = [{ title: "One", raw: "tag r 22.8..23.2: starts: 23", line: 10 }, { title: "Two", raw: "hush tag r 22.8..23.2\ntag r 6.8..7.2: starts: 7", line: 12 }];
  beginDocument();
  const c = compileStage(head, steps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  const its = layoutStage(c.model, 1000).items;
  const t23 = its.find((it) => it.k === "text" && it.s === "starts: 23")!, t7 = its.find((it) => it.k === "text" && it.s === "starts: 7")!;
  expect([t23.from, t23.to]).toEqual([1, 1]);
  expect([t7.from, t7.to ?? 0]).toEqual([2, 0]);
  expect(stageLlm(c)).toContain("Tag reader 22.8 to 23.2 hidden.");
  beginDocument();
  const bad = compileStage(head, [steps[0], { title: "Two", raw: "hush tag r 6.8..7.2", line: 12 }], 1, {}, roles);
  expect(bad.errors.map((e) => e.msg).join()).toContain("hush tag names a tag");
});

test("'time: a..b | caption | tight' sits 24 px higher under the lanes on a wide stage (8 px less room over the tick numbers, 8 px less gap under the lanes, 8 px less under the ruler), 8 px on a phone (only the gap; its ruler room is already tight); nothing else changes (24 lane)", () => {
  const src = (tight: string) => `## _
layout: row
job s: sender | sends
job t: target | takes
time: 0..20 | seconds | beside${tight}
row job r "writer": +R 0..1; +R 2..3`;
  const steps = [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }];
  for (const [w, d] of [[1000, 24], [356, 8]] as const) {
    const lay = (tight: string) => { beginDocument(); const c = compileStage(src(tight), steps, 1, {}, roles); expect(c.errors).toEqual([]); return layoutStage(c.model, w); };
    const a = lay(""), b = lay(" | tight");
    const seg = (p: ReturnType<typeof layoutStage>) => boxes(p.items).find((x) => /:seg:r:0:/.test(x.id || ""))!;
    expect(seg(a).y - seg(b).y).toBe(d);
    expect(a.h - b.h).toBe(d);
    expect(seg(b).x).toBe(seg(a).x);
  }
});

test("when no row inside a band has a label, band titles and the other rows' labels share one column, so the time axis starts further left; a labelled row in a band keeps both columns (24 lane)", () => {
  const src = (inner: string) => `job s: sender | sends
time: 0..20 | seconds
row job r0 "${inner}": +R 0..1
row job e "printer": +work 0..20
band job b0 "desk 0 · writer": r0..r0`;
  const steps = [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }];
  const lay = (inner: string) => { beginDocument(); const c = compileStage(src(inner), steps, 1, {}, roles); expect(c.errors).toEqual([]); return layoutStage(c.model, 1000); };
  const shared = lay(""), both = lay("writer row");
  const segX = (p: ReturnType<typeof layoutStage>) => boxes(p.items).find((x) => /:seg:e:0:/.test(x.id || ""))!.x;
  expect(segX(shared)).toBeLessThan(segX(both) - 30);
  const label = (p: ReturnType<typeof layoutStage>) => p.items.find((it) => it.k === "text" && it.s === "printer")! as { x: number };
  expect(label(shared).x).toBeLessThan(24); // at the stage edge
  expect(label(both).x).toBeGreaterThan(60); // right of the band titles
});


test("phone: a cell word up to 104 px stands on end in its cell, so one long word no longer staggers its whole row under leaders (rc.3)", () => {
  const src = `job s: sender | sends
time: 0..7 | sheets
cells: 1
row job o "desks 0, 1 · old": +print all 0..2; +sort, envelopes 2..3; +fold, new sheet 3..4; sorted: stopped 4..7 [dashed]`;
  const steps = [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }];
  beginDocument();
  const c = compileStage(src, steps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  const its = layoutStage(c.model, 356).items;
  expect(its.filter((it) => (it as { cls?: string }).cls === "stg-time-leader")).toEqual([]);
  const snap = its.find((it) => it.k === "text" && it.s === "sort, envelopes") as { rotate?: number };
  expect(snap?.rotate).toBe(90);
  expect(its.filter((it) => it.k === "text" && /^(print|all|fold,|new|sheet)$/.test(String(it.s))).length).toBeGreaterThan(0); // the others wrap level inside their cells
});

test("phone: a big X over a cell's words stays within 24 px and 10 px clear of them (rc.3)", () => {
  const src = (row: string) => `job s: sender | sends
time: 0..7 | sheets
cells: 1
row job o "desk 2": ${row}`;
  const steps = [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }];
  const xs = (row: string) => { beginDocument(); const c = compileStage(src(row), steps, 1, {}, roles); expect(c.errors).toEqual([]); const its = layoutStage(c.model, 390).items; return { its, x: its.filter((it) => it.k === "path" && (it as { ink?: string }).ink === "bad:line") as unknown as { pts: number[][] }[] }; };
  const tall = xs("no sheets 0..2 [dashed]; sort, envelopes 2..3; copy fails 3..4; JAMMED tray 4..5 [bad]; JAMMED tray 5..7"); // the on-end word makes the row tall
  expect(tall.x.length).toBe(2);
  const size = Math.abs(tall.x[0].pts[1][0] - tall.x[0].pts[0][0]), lower = Math.max(...tall.x[0].pts.map((p) => p[1]));
  expect(size).toBeLessThanOrEqual(24);
  const words = tall.its.filter((it) => it.k === "text" && (it.s === "JAMMED" || it.s === "JAMMED tray")) as { y: number }[];
  expect(Math.min(...words.map((w) => w.y)) - 9 - lower).toBeGreaterThanOrEqual(9); // the first word's cap top keeps ~10 px under the X
});

test("phone: in a row whose longer phrases sit under it, a phrase that fits its cell (on end or level) stays in it; only the phrases that need it go under the row (rc.3; Parcel receipts)", () => {
  const src = `server s: sender | sends
time: 0..7 | shifts
cells: 1
row server r "Receiver": +save, payload 0..2; +to two operators 2..7`;
  const steps = [{ title: "One", raw: "", line: 10 }, { title: "Two", raw: "", line: 11 }];
  beginDocument();
  const c = compileStage(src, steps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  const its = layoutStage(c.model, 390).items;
  // the short phrase stays in its cells (on end, or level on two lines), never under the row: only the 5 cells of the long one get leaders
  for (const it of its) if (it.k === "text" && it.s === "save, payload") expect((it as { rotate?: number }).rotate).toBe(90);
  expect(its.filter((it) => it.k === "text" && (it.s === "save, payload" || it.s === "payload")).length).toBe(2);
  expect(its.filter((it) => (it as { cls?: string }).cls === "stg-time-leader").length).toBe(5);
});
