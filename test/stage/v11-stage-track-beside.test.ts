// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
//: 'place: beside where' under a chips track puts the where words at the left and the phases, one
// line each, at the right of the same line on a wide stage; when both do not fit, and on a phone, the track keeps its
// usual place. Opt-in: without it nothing changes. Done / lit / faded as in the chips; nothing moves between steps.
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import { measure, type Item } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const PHASES = ["1 Pending", "2 Signalled", "3 Allocated", "4 Rerouted", "5 Done"];
const WHERE = "yard main-pickers · status.season.stage";
const src = (place: string, where = WHERE) => `track: op ${PHASES.join(", ")}\nform: chips\n${place}where: ${where}`;
const steps = [null, null, 2, 4].map((a, i) => ({ title: `S${i + 1}: step ${i + 1}`, raw: a === null ? "" : `at ${PHASES[a]}`, line: 20 + 3 * i }));
const compile = (place = "place: beside where\n", where = WHERE) => compileStage(src(place, where), steps, 1, {}, { op: 1 });
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const chips = (items: Item[]) => items.filter((i): i is Box => i.k === "box" && i.bar?.kind === "track" && !i.bar?.tone);
const whereText = (items: Item[]) => items.find((i): i is Text => i.k === "text" && i.s === WHERE)!;

test("wide: the where words at the left, the five one-line chips right-aligned on the same line", () => {
  const c = compile(); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), cs = chips(p.items), wt = whereText(p.items);
  expect(cs.length).toBe(5);
  for (const b of cs) { expect(b.y).toBe(cs[0].y); expect(b.h).toBe(28); expect(wt.y).toBeGreaterThan(b.y); expect(wt.y).toBeLessThan(b.y + b.h); }
  expect(cs[4].x + cs[4].w).toBeCloseTo(1000 - 14, 0); // the stage's right edge (inside its 14 px padding)
  expect(wt.x + measure(WHERE, "sub")).toBeLessThan(cs[0].x - 20);
  for (let i = 1; i < 5; i++) expect(cs[i].x).toBeGreaterThan(cs[i - 1].x + cs[i - 1].w); // never overlap
  // one line each: the number and the rest on the chip's middle line
  for (const [i, b] of cs.entries()) { const ws = p.items.filter((t): t is Text => t.k === "text" && shownAt(t, 1) && t.x > b.x && t.x < b.x + b.w && t.y > b.y && t.y < b.y + b.h); expect(ws.map((t) => t.s).join(" ")).toBe(PHASES[i]); expect(new Set(ws.map((t) => t.y)).size).toBe(1); }
});
test("done before the place, lit at it, not reached after (dashed); one place on every step (nothing moves)", () => {
  const p = layoutStage(compile().model, 1000), cs = chips(p.items);
  const done = (k: number) => p.items.filter((i): i is Box => i.k === "box" && i.bar?.tone === "good" && shownAt(i, k)).map((b) => b.bar!.id);
  expect(done(3)).toEqual(["phase:0", "phase:1"]); expect(done(4).length).toBe(4); expect(done(1)).toEqual([]);
  expect(cs[2].hot).toEqual([3]); expect(cs[4].hot).toEqual([4]);
  // not reached: a dashed outline over the chip; in a step with no place (1, 2) every phase, after the place the later ones
  const later = (i: number) => p.items.find((b): b is Box => b.k === "box" && !!b.cls?.includes("stg-phase-later") && b.x === cs[i].x && b.y === cs[i].y);
  expect(later(0)!.on).toEqual([1, 2]); expect(later(3)!.on).toEqual([1, 2, 3]); expect(later(4)!.on).toEqual([1, 2, 3]); expect(later(3)!.dash).toBe(true);
  const words = (i: number, k: number) => p.items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && t.x > cs[i].x && t.x < cs[i].x + cs[i].w && t.y > cs[i].y && t.y < cs[i].y + cs[i].h);
  for (const t of words(3, 3)) expect(t.ink).toBe("muted"); for (const t of words(0, 1)) expect(t.ink).toBe("muted");
  expect(cs[4].hot?.includes(1)).toBe(false); // the last phase is not lit before its step
  for (const b of cs) expect(b.on).toBeUndefined(); // the same chip on every step
});
test("falls back to the usual place on a phone, when where and the chips do not fit, and without the line", () => {
  const plain = layoutStage(compile("").model, 1000), ph = layoutStage(compile().model, 340), tight = layoutStage(compile("place: beside where\n", WHERE + " · " + WHERE).model, 1000);
  const under = (p: ReturnType<typeof layoutStage>, s = WHERE) => { const t = p.items.find((i): i is Text => i.k === "text" && i.s.startsWith(s.slice(0, 20)))!; return t.y > Math.max(...chips(p.items).map((b) => b.y + b.h)); };
  expect(under(plain)).toBe(true); expect(under(ph)).toBe(true); expect(under(tight)).toBe(true);
  // without the line the layout is the chips' own, unchanged
  expect(JSON.stringify(layoutStage(compile("").model, 1000).items)).toBe(JSON.stringify(plain.items));
});
test("doccheck: one spelling", () => {
  expect(compile("place: beside the where\n").errors.map((e) => e.msg).join()).toContain('place: beside where');
});
test("a phone: rows of the same one-line chips (never two-line, never past the stage), the where words under them; never taller than plain chips", () => {
  for (const w of [356, 326]) {
    const p = layoutStage(compile().model, w), cs = chips(p.items), wt = whereText(p.items);
    for (const b of cs) { expect(b.h).toBe(24); expect(b.w).toBe(cs[0].w); expect(b.x + b.w).toBeLessThanOrEqual(w - 14 + 0.01); expect(wt.y).toBeGreaterThan(b.y + b.h); }
    expect(p.h).toBeLessThanOrEqual(layoutStage(compile("").model, w).h);
  }
});
test("'form: chips | arrows' beside the where words: a small arrow in each gap, wide and on a phone; the chips keep one width", () => {
  const c = compileStage(src("place: beside where\n").replace("form: chips", "form: chips | arrows"), steps, 1, {}, { op: 1 }); expect(c.errors).toEqual([]);
  for (const w of [1000, 356]) {
    const p = layoutStage(c.model, w), cs = chips(p.items), tris = p.items.filter((i) => i.k === "tri");
    const rowsOf = new Set(cs.map((b) => b.y)).size;
    expect(tris.length).toBe(cs.length - rowsOf); // one before every chip but each row's first
    for (const t of tris) expect(cs.some((b) => Math.abs(t.x - (b.x - 10 - 3)) < 1 && t.y > b.y && t.y < b.y + b.h)).toBe(true);
  }
});

// the review's C (bar point 4; d83115e): a beside chip's label is ONE text run in one style, the
// phase's whole name ("2 Signalled", as the original's label), centred in its chip; never a lone number run
for (const w of [1000, 340]) test(`a beside chip's label is one run, centred, inside its chip (${w})`, () => {
  const p = layoutStage(compile().model, w), cs = chips(p.items), words = PHASES.flatMap((x) => x.split(" "));
  expect(cs.length).toBe(5);
  for (let k = 1; k <= 4; k++) {
    cs.forEach((b, i) => {
      const ws = p.items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && t.x > b.x && t.x < b.x + b.w && t.y > b.y && t.y < b.y + b.h);
      expect(ws.map((t) => t.s)).toEqual([PHASES[i]]); const t = ws[0];
      expect(t.anchor).toBe("middle"); expect(Math.abs(t.x - (b.x + b.w / 2))).toBeLessThan(0.01);
      expect(t.x - measure(t.s, t.f) / 2).toBeGreaterThanOrEqual(b.x + 2); expect(t.x + measure(t.s, t.f) / 2).toBeLessThanOrEqual(b.x + b.w - 2);
    });
    expect(p.items.some((t) => t.k === "text" && shownAt(t, k) && words.includes(t.s))).toBe(false); // no lone number or name run
  }
});
