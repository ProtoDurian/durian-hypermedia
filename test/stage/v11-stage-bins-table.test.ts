// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Bins, table form (`form: table`): every thing is a row, every bin a tall column, a chip sits in its own row.
import { expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { FONT, measure, type Item } from "../../src/core/stage-core";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
const ROLES = { ops: 1, api: 2 };
const compile = (src: string) => {
  const i = src.indexOf("@step "), head = src.slice(0, i);
  const steps = src.slice(i).split(/^@step /m).slice(1).map((s, k) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: 20 + k * 5 }; });
  beginDocument(newBudget());
  return compileStage(head, steps, 1, {}, ROLES);
};
const SRC = `bins: Parcels by weight | parcels
items p1..p4: parcel one; parcel two; parcel three; parcel four
bin ops a "Light"
bin api b "Heavy"
bin api c "Odd"
ledger: two scales, then three | Bin from 0
form: table
@step First: two bins
into a: p1, p3
into b: p2, p4
@step Second: a third bin
show c
into c: p1, p4
light c: the odd ones
`;
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const texts = (it: Item[]) => it.filter((i): i is Text => i.k === "text"), boxes = (it: Item[]) => it.filter((i): i is Box => i.k === "box");
test("parses and lays every thing in its own row, chips level with their row label", () => {
  const c = compile(SRC); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), T = texts(p.items), B = boxes(p.items);
  for (const [id, label] of [["p1", "parcel one"], ["p2", "parcel two"], ["p3", "parcel three"], ["p4", "parcel four"]]) {
    const row = T.find((t) => t.s === label && t.x < 400)!, chips = B.filter((b) => b.id?.startsWith(`unit:${id}@`));
    expect(chips.length).toBeGreaterThan(0);
    for (const ch of chips) expect(Math.abs(ch.y + ch.h / 2 - (row.y - 4))).toBeLessThan(8);
  }
  expect(T.some((t) => /^Total:/.test(t.s))).toBe(false); // no running total, no counts: the rows are the inventory
});
test("one '→ bin' column per step, shown from its step; a move is in the warn tone", () => {
  const p = layoutStage(compile(SRC).model, 1000), T = texts(p.items).filter((t) => t.s.startsWith("→ "));
  const s1 = T.filter((t) => t.from === 1), s2 = T.filter((t) => t.from === 2);
  expect(s1.map((t) => t.s).sort()).toEqual(["→ 0", "→ 0", "→ 1", "→ 1"]);
  expect(s2.filter((t) => t.ink === "warn:ink").map((t) => t.s)).toEqual(["→ 2", "→ 2"]);
  expect(Math.min(...s2.map((t) => t.x))).toBeGreaterThan(Math.max(...s1.map((t) => t.x)));
});
test("a moved chip keeps its bin's colour (thick, no warn paint); its old chip ends the step before; a shown bin comes in at its step", () => {
  const p = layoutStage(compile(SRC).model, 1000), B = boxes(p.items);
  const moved = B.find((b) => b.id === "unit:p1@c")!, old = B.find((b) => b.id === "unit:p1@a")!;
  expect(moved.thick).toBe(true); expect(moved.stroke).toBe("role:api:line"); expect(moved.from).toBe(2);
  expect(old.to).toBe(1);
  expect(B.find((b) => b.id === "bin:c")!.from).toBe(2);
  expect(B.some((b) => String(b.stroke).startsWith("warn"))).toBe(false);
  const note = texts(p.items).find((t) => t.s === "the odd ones")!; expect(note.from).toBe(2); expect(note.to).toBe(2);
});
test("at 1000 and 340: inside the box, no word under 11 px; a phone draws its chips in words, stacked under the rows", () => {
  for (const w of [1000, 340]) {
    const p = layoutStage(compile(SRC).model, w);
    for (const it of p.items) {
      if (it.k === "box") { expect(it.x).toBeGreaterThanOrEqual(-0.01); expect(it.x + it.w).toBeLessThanOrEqual(w + 0.01); }
      if (it.k === "text") { expect(FONT[it.f].size).toBeGreaterThanOrEqual(11); const tw = measure(it.s, it.f), left = it.anchor === "middle" ? it.x - tw / 2 : it.anchor === "end" ? it.x - tw : it.x; expect(left).toBeGreaterThanOrEqual(-1); expect(left + tw).toBeLessThanOrEqual(w + 1); }
    }
    if (w === 340) expect(boxes(p.items).filter((b) => b.id?.startsWith("unit:")).every((b) => b.w > 100)).toBe(true);
  }
});
test("without a ledger the form falls back to the usual bins", () => {
  const c = compile(SRC.replace("ledger: two scales, then three | Bin from 0\n", "")); expect(c.errors).toEqual([]);
  expect(texts(layoutStage(c.model, 1000).items).some((t) => /^Total:/.test(t.s))).toBe(true);
});
test("on a phone the rows keep the width and every bin follows as a full-width box of chips in words: no word is cut", () => {
  const src = SRC.replace('bin ops a "Light"', 'bin ops a "the light parcels shelf": up to two kilos').replace("light c: the odd ones", "light c: the odd ones go to the back");
  const c = compile(src); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 356), T = texts(p.items), B = boxes(p.items);
  expect(T.some((t) => t.s.includes("…"))).toBe(false);
  const words = T.map((t) => t.s).join(" ");
  for (const w of ["the light parcels shelf", "up to two kilos", "Heavy", "Odd", "the odd ones go to the back"]) expect(words).toContain(w);
  const bins = B.filter((b) => b.bar?.kind === "bin"), rows = T.filter((t) => t.s === "parcel one" && t.x === 0);
  expect(bins.length).toBe(3);
  for (const b of bins) { expect(b.w).toBeGreaterThan(300); expect(b.y).toBeGreaterThan(Math.max(...rows.map((r) => r.y))); } // under the rows, full width
  expect(bins.find((b) => b.id === "bin:c")?.from).toBe(2);
  // every stay is a chip in words inside its bin: p1 is in Light at step 1, then in Odd from step 2 (thick: a move)
  const chip = (id: string) => B.find((b) => b.id === id)!;
  const p1a = chip("unit:p1@a"), p1c = chip("unit:p1@c"), inBox = (ch: Box, bin: string) => { const f = bins.find((b) => b.id === bin)!; return ch.y > f.y && ch.y + ch.h < f.y + f.h; };
  expect(p1a).toMatchObject({ from: 1, to: 1 }); expect(p1c).toMatchObject({ from: 2, thick: true });
  expect(inBox(p1a, "bin:a") && inBox(p1c, "bin:c")).toBe(true);
  expect(T.filter((t) => t.s === "parcel one").length).toBe(3); // its row and its two chips
  expect(T.find((t) => t.s.includes("the odd ones"))).toMatchObject({ from: 2, to: 2 }); // a note only in its step
});
test("on a desktop the bins keep their names at the column tops (no key)", () => {
  const p = layoutStage(compile(SRC).model, 1000), T = texts(p.items), B = boxes(p.items);
  const bottom = Math.max(...B.filter((b) => b.bar?.kind === "bin").map((b) => b.y + b.h));
  expect(T.some((t) => t.s === "Light" && t.y < bottom)).toBe(true);
  expect(T.some((t) => t.y > bottom && /·/.test(t.s))).toBe(false);
});
