// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "ssheet2": three worksheet fixes from a cold phone critic.
// 1. A box is as tall as its wrapped lines plus padding: no line of a result box, tile or partial touches its border
// (the phone's side-by-side result box in the title size was 30 px tall with its baseline 1 px off the bottom).
// 2. On a phone a column's notes stay with their column: the step notes sit straight under the groups, and the
// outcome column comes after them (it used to come first, the notes last).
// 3. The outcome column's place order follows the reference layout: the arriving partials at the top (each group's
// sent chip, then the asides written in the step they arrive), then every other place in source order.
// The checks read the drawn items and compare them with rules worked out here (glyph boxes from the font sizes,
// places from the source), never with the engine's own lists.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, layoutStage, type Compiled } from "../../src/core/stage";
import { FONT, PHONE_FONT, measure, type Item } from "../../src/core/stage-core";
import { beginDocument } from "../../src/core/stage-budget";

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
type Box = Extract<Item, { k: "box" }>;
type Text = Extract<Item, { k: "text" }>;
const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const texts = (items: Item[], k: number) => items.filter((it): it is Text => it.k === "text" && shown(it, k));
const boxes = (items: Item[], k: number) => items.filter((it): it is Box => it.k === "box" && shown(it, k));
const PHONE_W = [358, 328]; // the stage at a 390 and a 360 window (16 px gutters)
const size = (f: Text["f"], phone: boolean) => (phone ? PHONE_FONT[f] : undefined) ?? FONT[f].size;
/** a text's glyph box: from its ascent (0.8 of the size) to its descent (0.22), as painted */
const glyph = (t: Text, phone: boolean) => {
  const w = measure(t.s, t.f), x0 = t.anchor === "middle" ? t.x - w / 2 : t.anchor === "end" ? t.x - w : t.x, h = size(t.f, phone);
  return { x0, x1: x0 + w, y0: t.y - h * 0.8, y1: t.y + h * 0.22 };
};

// invented: rain gauges in valleys and a regional office that keeps a week of daily sums (no real system's words)
const WEEK = `notes: roomy
sheet: valleys, each with its own gauges | 3 of 9 valleys
labels: before, now
spacing: roomy
hub v0 "north": valley north | owns 2 gauges
  plain ga "gauge A": 5211 _
  plain gb "gauge B": 18 _
hub v1 "south": valley south | owns 1 gauge
  plain gc "gauge C": 3410 _
=> desk out: the office | keeps the week, per region
@step A week is long: the gauges keep only the last value.
aside out: ring of daily sums: 7 days, 4 readings a day
tile out b1: day 1 | 22 | 5+6+6+5
tile out b2: day 2 | 27 | 7+6+8+6
tile out b3: day 3 (now) | 7 | 7 (1 reading)
tile out more: … 4 more
note: a gauge cannot hold a whole week | 1 week = 28 readings; a gauge keeps 8 at the most | so each gauge sends its last value alone; | the office keeps the week, once per region
@step This reading: each gauge sends this reading's rise.
fill ga gb gc 2: 5214, 2, 3411
value ga gc: now − before | +3, +1
value gb: reset | +2 (bad)
note: this reading's rise | gauge A: 5214 − 5211 = 3 | gauge B: 2 − 18 goes under zero: reset
@step The office keeps the week: seven daily sums.
sum v0: partial of this valley | a = 3 + 2 = 5 | n = 2 -> (5, 2)
sum v1: partial of this valley | a = 1 | n = 1 -> (1, 1)
pass v0
pass v1
tile out b3: day 3 (now) | 13 | 7+6 (2 readings)
aside out: a = 5 + 1 = 6
@step Rate: the sum over the time.
total out: Σ ring = 22 + 27 + 13 = 62 | covered = 10 readings = 150 h => rate | 62 ÷ 150 h = 0.41 /h
@step A week later: the oldest day drops.
total out: Σ ring = the rises of the last week | covered = 27 to 28 readings => rate | Σ ring ÷ (about 604,800 s)`;
const STEPS = 5;

describe("ssheet2 1: a box is as tall as its wrapped lines plus padding", () => {
  // every result box, tile and partial: each line whose baseline is in it (or just under it) clears its border by 2 px
  const owned = (b: Box) => !!b.id && /^(total|tile:|value:|sum:)/.test(b.id);
  for (const w of [...PHONE_W, 1000, 1178]) test(`at ${w}`, () => {
    const p = layoutStage(scene(WEEK).model, w), phone = w < 480, bad: string[] = [];
    for (let k = 1; k <= STEPS; k++) for (const b of boxes(p.items, k).filter(owned)) for (const t of texts(p.items, k)) {
      const g = glyph(t, phone);
      if (g.x0 < b.x || g.x0 > b.x + b.w || t.y < b.y || t.y > b.y + b.h + size(t.f, phone) * 0.6) continue;
      if (g.y0 < b.y + 2 || g.y1 > b.y + b.h - 2) bad.push(`step ${k} ${b.id}: "${t.s}" ${g.y0.toFixed(1)}..${g.y1.toFixed(1)} in ${b.y.toFixed(1)}..${(b.y + b.h).toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });
  test("the scene-22 shape: the week-later value steps down to the title size, beside its label, and its box holds it", () => {
    const p = layoutStage(scene(WEEK).model, 358);
    const v = texts(p.items, 5).find((t) => t.s === "Σ ring ÷ (about 604,800 s)")!, b = boxes(p.items, 5).find((x) => x.id === "total")!;
    expect(v.f).toBe("title"); // one line, the title size (it would wrap in the big size)
    expect(v.y + size("title", true) * 0.22).toBeLessThanOrEqual(b.y + b.h - 4);
  });
});

describe("ssheet2 2: on a phone the notes stay with the groups, the outcome column comes after them", () => {
  for (const w of PHONE_W) test(`at ${w}`, () => {
    const p = layoutStage(scene(WEEK).model, w);
    const all = p.items.filter((it): it is Box => it.k === "box");
    const groupFoot = Math.max(...all.filter((b) => b.id?.startsWith("group:")).map((b) => b.y + b.h));
    const out = all.find((b) => b.id === "out:out")!;
    for (let k = 1; k <= 2; k++) { // the steps with a note
      const band = boxes(p.items, k).find((b) => (b as { bar?: { kind?: string } }).bar?.kind === "band")!;
      expect(band).toBeDefined();
      expect(band.y).toBeGreaterThanOrEqual(groupFoot + 4); // under the groups
      expect(band.y + band.h).toBeLessThanOrEqual(out.y - 4); // before the outcome column
    }
    // every step's note starts at one place, and the column is at one place for the whole scene (zero movement)
    const bandTops = new Set(p.items.filter((it): it is Box => it.k === "box" && (it as { bar?: { kind?: string } }).bar?.kind === "band").map((b) => b.y));
    expect(bandTops.size).toBe(1);
    expect(all.filter((b) => b.id === "out:out").length).toBe(1);
    // the stage is no taller than the groups, the notes and the column stacked with their gaps
    expect(p.h).toBeLessThanOrEqual(out.y + out.h + 40);
  });
  test("the wide stage keeps the notes beside the column (under the groups, left of it)", () => {
    const p = layoutStage(scene(WEEK).model, 1178);
    const out = p.items.find((it): it is Box => it.k === "box" && it.id === "out:out")!;
    const band = boxes(p.items, 1).find((b) => (b as { bar?: { kind?: string } }).bar?.kind === "band")!;
    expect(band.x + band.w).toBeLessThanOrEqual(out.x);
    expect(band.y).toBeLessThan(out.y + out.h);
  });
});

describe("ssheet2 3: the outcome column's places follow the reference layout", () => {
  // arriving partials first (the sent chips, then the asides of the step they arrive in), then source order:
  // the ring's caption, the tiles, the total
  for (const w of [...PHONE_W, 1000, 1178]) test(`at ${w}`, () => {
    const p = layoutStage(scene(WEEK).model, w);
    const out = p.items.find((it): it is Box => it.k === "box" && it.id === "out:out")!;
    const inCol = (it: Item) => it.k !== "path" && (it as Text).x >= out.x && (it as Text).x <= out.x + out.w && (it as Text).y >= out.y;
    const ty = (s: string, k: number) => texts(p.items, k).filter(inCol).find((t) => t.s.startsWith(s))!.y;
    const chips = ["(5, 2)", "(1, 1)"].map((s) => ty(s, 4));
    const sum = ty("a = 5 + 1 = 6", 4), ring = ty("ring of daily sums", 4);
    const tile = boxes(p.items, 4).find((b) => b.id === "tile:b1")!.y, total = boxes(p.items, 4).find((b) => b.id === "total")!.y;
    expect(Math.max(...chips)).toBeLessThan(sum);
    expect(sum).toBeLessThan(ring);
    expect(ring).toBeLessThan(tile);
    expect(tile).toBeLessThan(total);
  });
  test("zero movement: a thing replaced in its place keeps its place; the places hold in every step", () => {
    for (const w of [358, 1178]) {
      const p = layoutStage(scene(WEEK).model, w);
      const at = new Map<string, string>();
      for (const b of p.items.filter((it): it is Box => it.k === "box" && !!it.id)) {
        const key = `${b.x.toFixed(1)},${b.y.toFixed(1)}`, was = at.get(b.id!);
        if (b.id!.startsWith("cell:")) continue; // a dim draws a cell's faint copy in its place too
        if (was) expect(`${b.id} ${key}`).toBe(`${b.id} ${was}`); else at.set(b.id!, key);
      }
    }
  });
  test("scenes that already read arrivals-first keep their order (asides after the chips, a total last)", () => {
    const src = `sheet: s\nhub v0 "north": V0\n  plain a "A": 1\nhub v1 "south": V1\n  plain b "B": 2\n=> desk out: O\n@step One: x\nsum v0: p | a = 1 -> (1, 1)\nsum v1: p | a = 2 -> (2, 1)\npass v0\npass v1\naside out: a = 1 + 2 = 3\n@step Two: y\nstrip out r: the last 4 sums | 1 2 3 4 | oldest, now\n@step Three: z\naside out: last − first = 3\ntotal out: => delta | 3`;
    const p = layoutStage(scene(src).model, 1000);
    const out = p.items.find((it): it is Box => it.k === "box" && it.id === "out:out")!;
    const y = (s: string) => p.items.find((it): it is Text => it.k === "text" && it.x >= out.x && it.s.startsWith(s))!.y; // the column's copy, not the partial card's
    expect(y("(2, 1)")).toBeLessThan(y("a = 1 + 2 = 3"));
    expect(y("a = 1 + 2 = 3")).toBeLessThan(y("the last 4 sums"));
    expect(y("the last 4 sums")).toBeLessThan(y("last − first = 3"));
    expect(y("last − first = 3")).toBeLessThan(y("delta"));
  });
});
