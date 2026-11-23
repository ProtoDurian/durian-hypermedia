// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// rows heads and the plain table, cards beside a card panel, notes counted as cards (for the bar).
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { FONT, measure, type Item } from "../../src/core/stage-core";
import { beginDocument } from "../../src/core/stage-budget";
const roles = { client: 1, server: 2, ops: 3 };
const compile = (raw1: string, raw2 = "foot: done") => compileStage("title: t", [{ title: "One: a", raw: raw1, line: 2 }, { title: "Two: b", raw: raw2, line: 20 }], 1, {}, roles);
beforeEach(() => beginDocument());
function inside(items: Item[], w: number, h: number) {
  for (const it of items) {
    if (it.k === "text") { expect(FONT[it.f].size).toBeGreaterThanOrEqual(11); const tw = measure(it.s, it.f), l = it.x - (it.anchor === "middle" ? tw / 2 : it.anchor === "end" ? tw : 0); expect(l).toBeGreaterThanOrEqual(-0.5); expect(l + tw).toBeLessThanOrEqual(w + 0.5); }
    if (it.k === "box") { expect(it.x).toBeGreaterThanOrEqual(-0.01); expect(it.x + it.w).toBeLessThanOrEqual(w + 0.01); expect(it.y + it.h).toBeLessThanOrEqual(h + 0.01); }
  }
}
const at1 = (items: Item[]) => items.filter((i) => i.from === 1 && i.to === 1);
const plain = `rows plain
  ^ address | first | second | what
  203.0.113.1 ; web-a | => server: 11 | => server: 32 | => ops: moves
  203.0.113.2 ; web-b | => server: 28 | => server: 28 | ~ stays`;

test("rows plain: column heads, one line per row, no box per row, chips as words in their role's ink", () => {
  const c = compile(plain); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000); inside(p.items, 1000, p.h);
  const its = at1(p.items);
  expect(its.filter((i) => i.k === "box" && i.bar?.kind === "worksheet-row").length).toBe(0);
  const texts = its.filter((i) => i.k === "text") as Extract<Item, { k: "text" }>[];
  expect(texts.map((t) => t.s)).toEqual(["address", "first", "second", "what", "203.0.113.1 web-a", "11", "32", "moves", "203.0.113.2 web-b", "28", "28", "stays"]);
  expect(texts.find((t) => t.s === "moves")!.ink).toBe("role:ops:ink");
  expect(texts.find((t) => t.s === "stays")!.ink).toBe("muted");
  // heads and cells share their column's left edge; rows are one line apart
  expect(texts.find((t) => t.s === "first")!.x).toBe(texts.find((t) => t.s === "11")!.x);
  const ys = [...new Set(texts.map((t) => t.y))]; expect(ys.length).toBe(3); expect(ys[2] - ys[1]).toBe(24);
  expect(stageLlm(c)).toContain("Columns: address | first | second | what");
});
test("rows plain on a phone: heads on one line, each row joined and wrapped", () => {
  const p = layoutStage(compile(plain).model, 340); inside(p.items, 340, p.h);
  const texts = at1(p.items).filter((i) => i.k === "text").map((i) => i.k === "text" && i.s);
  expect(texts[0]).toBe("address · first · second · what");
});
test("boxed rows take heads too", () => {
  const c = compile("rows\n  ^ a | b\n  x | y"); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000); expect(at1(p.items).filter((i) => i.k === "text").map((i) => i.k === "text" && i.s)).toEqual(["a", "b", "x", "y"]);
});
for (const [raw, match] of [["rows wide\n  a | b", "plain"], ["rows\n  ^ a | b | c\n  x | y", "column heads"], ["rows\n  x | y\n  ^ a | b", "first line"], ["rows\n  ^ a | b", "lists its rows"]]) test(`refuses ${raw.replaceAll("\n", " / ")}`, () => {
  expect(compile(raw).errors.some((e) => e.msg.includes(match) && e.line > 0)).toBe(true);
});

const beside = `card ops: config | read by every worker
  replicas: 3
  beside:
  server: worker 1 | reads it
  server: worker 2 | reads it
  server: worker 3 | reads it`;
test("card beside: the card at the left (a card, not a lane), its cards in a row to its right, a dashed arrow to the first", () => {
  const c = compile(beside); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1180); inside(p.items, 1180, p.h);
  const boxes = at1(p.items).filter((i) => i.k === "box" && i.bar?.kind === "card") as Extract<Item, { k: "box" }>[];
  const outer = boxes.find((b) => b.bar?.label === "config")!, ws = boxes.filter((b) => String(b.bar?.label).startsWith("worker"));
  expect(outer.w).toBeLessThan(1180 * 0.35); expect(ws.length).toBe(3);
  for (const w of ws) { expect(w.x).toBeGreaterThan(outer.x + outer.w); expect(w.y).toBeGreaterThanOrEqual(outer.y); expect(w.y + w.h).toBeLessThanOrEqual(outer.y + outer.h + 0.01); }
  expect(new Set(ws.map((w) => w.y)).size).toBe(1);
  const arrow = at1(p.items).find((i) => i.k === "path" && i.arrow && i.dash)!; expect(arrow).toBeTruthy();
  if (arrow.k === "path") { expect(arrow.pts[0][0]).toBeCloseTo(outer.x + outer.w + 2); expect(arrow.pts[1][0]).toBeLessThan(ws[0].x); }
  expect(stageLlm(c)).toContain("beside it: worker 1 (reads it); worker 2 (reads it); worker 3 (reads it)");
});
test("card beside on a phone: the cards under it, two a row, a short arrow down to them", () => {
  const p = layoutStage(compile(beside).model, 340); inside(p.items, 340, p.h);
  const its = at1(p.items), outer = its.find((i) => i.k === "box" && !i.bar?.ignore && i.bar?.label === "config")! as Extract<Item, { k: "box" }>;
  const ws = its.filter((i) => i.k === "box" && !i.bar?.ignore && String(i.bar?.label).startsWith("worker")) as Extract<Item, { k: "box" }>[];
  for (const w of ws) expect(w.y).toBeGreaterThan(outer.y + outer.h);
  const ar = its.filter((i) => i.k === "path" && i.arrow) as Extract<Item, { k: "path" }>[];
  expect(ar.length).toBe(1);
  const [[x0, y0], [x1, y1]] = ar[0].pts;
  expect(x0).toBe(x1); expect(y0).toBeGreaterThanOrEqual(outer.y + outer.h); expect(y1).toBeLessThan(Math.min(...ws.map((w) => w.y)));
  const first = ws.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a)); expect(x0).toBeGreaterThan(first.x + 8); expect(x0).toBeLessThan(first.x + first.w - 8); // into the first card, not the gap
});
for (const [raw, match] of [["card ops: c\n  beside:", "lists cards"], ["card ops: c\n  beside:\n  beside:\n  server: w | x", "once"], ["card ops: c\n  beside:\n  just words", "starts with a card"], ["card ops: c\n  in: a\n  beside:\n  server: w | x", "not both"], ["card ops: c\n  beside:\n  nobody: w | x", "not a role"], ["card ops: c\n  beside:\n" + Array.from({ length: 9 }, (_, i) => `  server: w${i} | x`).join("\n"), "at most 8"]]) test(`refuses ${raw.replaceAll("\n", " / ").slice(0, 70)}`, () => {
  expect(compile(raw).errors.some((e) => e.msg.includes(match) && e.line > 0)).toBe(true);
});
test("a full-width card panel is the step's panel (journey step 6 in the reference design); a note is a band for the bar", () => {
  const p = layoutStage(compile("card ops: c\n  line one", "note: a note | its line").model, 1000);
  expect(p.items.find((i) => i.k === "box" && i.bar?.label === "c")!.bar!.kind).toBe("panel");
  expect(p.items.find((i) => i.k === "box" && i.bar?.label === "a note")!.bar!.kind).toBe("band"); // the review 23 Nov: the originals draw these strips as bands
});
test("a head written _ leaves its column unheaded", () => {
  const c = compile("rows plain\n  ^ a | _\n  x | y"); expect(c.errors).toEqual([]);
  expect(at1(layoutStage(c.model, 1000).items).filter((i) => i.k === "text").map((i) => i.k === "text" && i.s)).toEqual(["a", "x", "y"]);
});
test("a plain line after the cards beside is a small line under their row", () => {
  const c = compile(beside + "\n  one config for all of them"); expect(c.errors).toEqual([]);
  const its = at1(layoutStage(c.model, 1180).items);
  const w1 = its.find((i) => i.k === "box" && i.bar?.label === "worker 1")! as Extract<Item, { k: "box" }>, line = its.find((i) => i.k === "text" && i.s === "one config for all of them")!;
  expect(line.k === "text" && line.y).toBeGreaterThan(w1.y + w1.h); expect(line.k === "text" && line.x).toBe(w1.x);
  expect(stageLlm(c)).toContain("one config for all of them");
});
test("notes: above puts the note band over the swapped panels", () => {
  const src = (above: boolean) => compileStage(`title: t${above ? "\nnotes: above" : ""}`, [{ title: "One: a", raw: "note: the note\nrows\n  x | y", line: 3 }, { title: "Two: b", raw: "rows\n  x | y\n  x | y", line: 6 }], 1, {}, roles);
  const y = (above: boolean) => { const p = layoutStage(src(above).model, 1000); const note = p.items.find((i) => i.k === "box" && i.bar?.label === "the note")!, row = p.items.find((i) => i.k === "box" && i.bar?.kind === "worksheet-row" && i.from === 1)!; return [note.k === "box" && note.y, row.k === "box" && row.y] as number[]; };
  const [n0, r0] = y(false), [n1, r1] = y(true);
  expect(n0).toBeGreaterThan(r0); expect(n1).toBeLessThan(r1);
  expect(src(true).errors).toEqual([]);
});
for (const [h, match] of [["notes: below", "one place"], ["notes: above\nnotes: above", "once"]]) test(`refuses ${h.replace("\n", " / ")}`, () => expect(compileStage("title: t\n" + h, [], 1, {}, roles).errors.some((e) => e.msg.includes(match))).toBe(true));
