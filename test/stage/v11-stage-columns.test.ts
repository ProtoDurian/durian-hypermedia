// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { FONT, measure, type Item } from "../../src/core/stage-core";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
const roles = { store: 1, job: 2 };
const head = `columns 12 store: books returned each month, one dot each | books
  every 3
  labels: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec`;
const steps = [
  { title: "First half: Six months.", raw: "counts 6: 24, 19, 31, 22, 27, 12", line: 10 },
  { title: "The year: Six more.", raw: "counts 12: 24, 19, 31, 22, 27, 12, 9, 11, 28, 30, 26, 35\nlight Jul..Dec", line: 12 },
  { title: "December: The busiest.", raw: "light Dec", line: 15 },
];
const compile = (h = head, ss = steps) => compileStage(h, ss, 1, {}, roles);
beforeEach(() => beginDocument());
function bounded(items: Item[], w: number, h: number) {
  for (const it of items) {
    const pts = it.k === "path" ? it.pts : it.k === "text" ? (() => { const tw = measure(it.s, it.f), left = it.x - (it.anchor === "middle" ? tw / 2 : it.anchor === "end" ? tw : 0); expect(FONT[it.f].size).toBeGreaterThanOrEqual(11); return [[left, it.y - FONT[it.f].size], [left + tw, it.y]]; })() : it.k === "box" ? [[it.x, it.y], [it.x + it.w, it.y + it.h]] : [[it.x, it.y]];
    for (const [x, y] of pts) { expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); expect(x).toBeGreaterThanOrEqual(-0.01); expect(x).toBeLessThanOrEqual(w + 0.01); expect(y).toBeGreaterThanOrEqual(-0.01); expect(y).toBeLessThanOrEqual(h + 0.01); }
  }
}
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const dots = (items: Item[], k: number) => items.filter((i) => i.k === "box" && i.cls === "stg-dot-u" && shownAt(i, k));

test("parses columns, keeps counts until changed and lists the facts", () => {
  const c = compile(); expect(c.errors).toEqual([]);
  const llm = stageLlm(c);
  for (const s of ["Columns: books returned each month, one dot each (one dot per book), up to 12 columns.", "6 columns, 135 books in all (12 to 31 a column): Jan 24, Feb 19", "12 columns, 274 books in all", "New: Jul, Aug, Sep, Oct, Nov, Dec (139 in them).", "New: Dec."]) expect(llm).toContain(s);
});
for (const w of [1000, 340]) test(`columns lay out inside ${w}, one dot per counted thing, places kept for every step`, () => {
  const plan = layoutStage(compile().model, w); bounded(plan.items, w, plan.h);
  expect(dots(plan.items, 1).length).toBe(135); expect(dots(plan.items, 2).length).toBe(274); expect(dots(plan.items, 3).length).toBe(274);
  // lit columns: their new dots in the warning tone, the frame thick; a lit step with no new dots warms none
  expect(dots(plan.items, 2).filter((d) => d.k === "box" && d.fill === "warn:line").length).toBe(139);
  expect(dots(plan.items, 3).filter((d) => d.k === "box" && d.fill === "warn:line").length).toBe(0);
  expect(plan.items.some((i) => i.k === "box" && i.id === "new:11" && shownAt(i, 3))).toBe(true);
  // a column keeps one place in every step
  const frames = plan.items.filter((i) => i.k === "box" && i.id?.startsWith("col:"));
  for (const id of new Set(frames.map((f) => f.k === "box" && f.id))) { const fs = frames.filter((f) => f.k === "box" && f.id === id); expect(new Set(fs.map((f) => f.k === "box" && `${f.x},${f.y},${f.w},${f.h}`)).size).toBe(1); }
  // the category axis: every column's centre at its true place
  for (const f of frames) {
    if (f.k !== "box") continue;
    const ax = plan.items.find((a) => a.bar?.axis === f.bar!.track)!; expect(ax.k).toBe("box");
    if (ax.k !== "box") continue;
    const want = ax.x + ((+f.bar!.value - +ax.bar!.min) / (+ax.bar!.max - +ax.bar!.min)) * ax.w;
    expect(Math.abs(f.x + f.w / 2 - want)).toBeLessThan(0.001);
  }
  // only the first 6 columns show in step 1
  expect(frames.filter((f) => shownAt(f, 1)).length).toBe(6);
});
test("defaults: numbered columns, no role, labels as often as they fit", () => {
  const c = compile("columns 40: caption", [{ title: "a", raw: "counts 33: " + Array(33).fill(3).join(","), line: 5 }, { title: "b", raw: "light 32", line: 6 }]);
  expect(c.errors).toEqual([]);
  const plan = layoutStage(c.model, 1000); bounded(plan.items, 1000, plan.h);
  const labels = plan.items.filter((i) => i.k === "text" && /^\d+$/.test(i.s)).map((i) => i.k === "text" && i.s);
  expect(labels).toContain("0"); expect(labels).toContain("32");
});
const refusals: [string, string[] | null, string][] = [
  ["columns 0: x", null, "1 to 64"], ["columns 65: x", null, "1 to 64"], ["columns x: y", null, "how many columns"], ["columns 3 a b: y", null, "how many columns"],
  ["columns 3 nobody: y", null, "not a role"], ["columns 3: y\n  every 0", null, "every names"], ["columns 3: y\n  every 4", null, "every names"],
  ["columns 3: y\n  every 1\n  every 2", null, "once"], ["columns 3: y\n  labels: a, b", null, "one label per column"], ["columns 3: y\n  labels: a, a, b", null, "used twice"],
  ["columns 3: y\n  labels: a, b, c\n  labels: a, b, c", null, "once"], ["columns 3: y\n  other", null, "under columns"],
  ["columns 3: y", ["counts 2: 1, x"], "whole numbers"], ["columns 3: y", ["counts 4: 1, 2, 3, 4"], "keep 3"], ["columns 3: y", ["counts 3: 1, 2"], "lists 2"],
  ["columns 3: y", ["counts 1: 501"], "at most 500"], ["columns 3: y", ["counts 1: 1\ncounts 1: 2"], "once a step"], ["columns 3: y", ["light 9"], "not a card"],
  ["columns 3: y", ["light 2..1"], "not a range"], ["columns 3: y", ["light ,"], "light"], ["counts 1: 1", null, "declare one"],
];
for (const [h, ops, match] of refusals) test(`refuses ${h.replaceAll("\n", " / ")}${ops ? " then " + ops.join(" / ").replaceAll("\n", " / ") : ""}`, () => {
  const ss = ops ? [{ title: "one", raw: ops[0], line: 20 }, { title: "two", raw: "", line: 22 }] : h.startsWith("counts") ? [{ title: "one", raw: h, line: 20 }, { title: "two", raw: "", line: 22 }] : [];
  const c = compile(h.startsWith("counts") ? "title: t" : h, ss);
  expect(c.errors.some((e) => e.msg.includes(match) && e.line > 0)).toBe(true);
});
test("hostile input: huge counts and a long list are refused or stop on the document budget", () => {
  expect(compile("columns 64: y", [{ title: "a", raw: "counts: " + Array(5000).fill(9).join(","), line: 3 }, { title: "b", raw: "", line: 4 }]).errors.length).toBeGreaterThan(0);
  expect(compile("columns 3: y", [{ title: "a", raw: "counts: 99999999999", line: 3 }, { title: "b", raw: "", line: 4 }]).errors.length).toBeGreaterThan(0);
  beginDocument(newBudget(200)); expect(() => { const c = compile("columns 64: y", [{ title: "a", raw: "counts: " + Array(64).fill(500).join(","), line: 3 }, { title: "b", raw: "", line: 4 }]); layoutStage(c.model, 1000); }).toThrow(BudgetError);
});
test("columns work doubles linearly with the dots", () => {
  const work = (n: number) => { const b = beginDocument(newBudget()), c = compile("columns 64: y", [{ title: "a", raw: "counts: " + Array(64).fill(n).join(","), line: 3 }, { title: "b", raw: "", line: 4 }]); layoutStage(c.model, 1000); stageLlm(c); return 2_000_000 - b.left().work; };
  const a = work(100), b = work(200); expect(b).toBeGreaterThan(a * 1.6); expect(b).toBeLessThan(a * 2.2);
});
test("dots that leave keep their places empty; a dot that stays never moves; leaving: darker darkens them first", () => {
  const c = compile("columns 2: y\n  leaving: darker", [{ title: "a", raw: "counts: 6, 2", line: 3 }, { title: "b", raw: "counts: 4 [1 3], 2", line: 4 }]);
  expect(c.errors).toEqual([]);
  const plan = layoutStage(c.model, 1000), d1 = dots(plan.items, 1), d2 = dots(plan.items, 2);
  expect(d1.length).toBe(8); expect(d2.length).toBe(6);
  const at = (ds: Item[]) => new Set(ds.map((d) => d.k === "box" && `${d.x},${d.y}`));
  const s1 = at(d1); for (const p of at(d2)) expect(s1.has(p)).toBe(true);
  // the two leavers are drawn darker in step 1
  expect(d1.filter((d) => d.k === "box" && d.fill.endsWith(":ink")).length).toBe(2);
  expect(d2.filter((d) => d.k === "box" && d.fill.endsWith(":ink")).length).toBe(0);
});
for (const [raw, match] of [["counts: 3 [5]", "inside its column"], ["counts: 3 [1 1]", "whole numbers"], ["counts: 3 [x]", "whole numbers"], ["counts: 3 [1", "whole numbers"], ["counts: 499 [1 2]", "at most 500"]]) test(`refuses ${raw}`, () => {
  expect(compile("columns 3: y", [{ title: "a", raw, line: 3 }, { title: "b", raw: "", line: 4 }]).errors.some((e) => e.msg.includes(match))).toBe(true);
});
test("a lit column warms only the dots new since the step before; the dots it already had keep their tone and place", () => {
  const ss = [
    { title: "One: a start.", raw: "counts 3: 4, 5, 2", line: 10 },
    { title: "Two: one grows, one shrinks, one stays.", raw: "counts 3: 7, 3 [1 3], 2\nlight 0..2", line: 12 },
  ];
  const plan = layoutStage(compile("columns 3 store: things | things", ss).model, 1000);
  const col = (i: number, k: number) => { const f = plan.items.find((b) => b.k === "box" && (b.id === `new:${i}` || b.id === `col:${i}`) && shownAt(b, k)) as Extract<Item, { k: "box" }>; return dots(plan.items, k).filter((d) => d.k === "box" && d.x >= f.x && d.x < f.x + f.w) as Extract<Item, { k: "box" }>[]; };
  const warm = (i: number) => col(i, 2).filter((d) => d.fill === "warn:line");
  expect(warm(0).length).toBe(3); // 4 → 7: the three on top are new
  expect(warm(1).length).toBe(0); // 5 → 3 with places 1 and 3 empty: nothing new
  expect(warm(2).length).toBe(0); // 2 → 2: nothing new
  // the old dots of a grown column are in their normal tone, at the places they had
  const before = col(0, 1).map((d) => `${d.x},${d.y}`), kept = col(0, 2).filter((d) => d.fill !== "warn:line").map((d) => `${d.x},${d.y}`);
  expect(new Set(kept)).toEqual(new Set(before));
  // in its lit step the column's old dots are the stronger "dot-new"
  expect(col(0, 2).filter((d) => d.fill !== "warn:line").every((d) => d.fill === "role:store:dot-new")).toBe(true);
  expect(col(0, 1).every((d) => d.fill === "role:store:dot")).toBe(true);
});
test("a lit column's label takes the accent in its lit steps even when it is an every-K label; same place, muted otherwise", () => {
  const p = layoutStage(compile().model, 1000);
  const at = (s: string, k: number) => p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s === s && (i.on ? i.on.includes(k) : k >= (i.from ?? 1)));
  // Jul (every 3: an axis label) is lit in step 2 only; Dec (not an every-3 label) lit in steps 2 and 3
  expect(at("Jul", 2).map((t) => t.ink)).toEqual(["acc:ink"]);
  expect(at("Jul", 3).map((t) => t.ink)).toEqual(["muted"]);
  expect(at("Jan", 2).map((t) => t.ink)).toEqual(["muted"]);
  expect(at("Dec", 3).map((t) => t.ink)).toEqual(["acc:ink"]);
  const jul = [...at("Jul", 2), ...at("Jul", 3)]; expect(new Set(jul.map((t) => `${t.x},${t.y}`)).size).toBe(1); // nothing moves
});
test("plain dots take the 'dot' paint (pale in light, the role colour in dark), a lit column's the stronger 'dot-new', never dimmed", () => {
  const p = layoutStage(compile().model, 1000), dots = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.cls === "stg-dot-u");
  expect(dots.some((d) => d.dim)).toBe(false);
  for (const d of dots) expect(["role:store:dot", "role:store:dot-new", "role:store:ink", "warn:line"]).toContain(d.fill!);
  expect(dots.some((d) => d.fill === "role:store:dot" && shownAt(d, 3))).toBe(true); // step 3 lights Dec: the others stay pale, not dimmed
});
test("a phone: a lit run of narrow columns keeps one row of labels (every k-th, none under another) and its frames apart", () => {
  const ss = [
    { title: "One.", raw: "counts 32: " + Array.from({ length: 32 }, () => 20).join(", "), line: 10 },
    { title: "Two.", raw: "counts 40: " + Array.from({ length: 40 }, () => 20).join(", ") + "\nlight 32..39", line: 12 },
  ];
  const p = layoutStage(compile("columns 40 store: things | things\n  every 4", ss).model, 356);
  const labels = p.items.filter((t): t is Extract<Item, { k: "text" }> => t.k === "text" && shownAt(t, 2) && /^3\d$/.test(t.s) && t.ink === "acc:ink");
  expect(new Set(labels.map((t) => t.y)).size).toBe(1);
  const xs = labels.map((t) => t.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual((measure("39", "sub") + 3) - 0.01);
  const frames = p.items.filter((b): b is Extract<Item, { k: "box" }> => b.k === "box" && /^new:3\d$/.test(b.id ?? "")).sort((a, b) => a.x - b.x);
  expect(frames.length).toBe(8);
  for (let i = 1; i < frames.length; i++) expect(frames[i].x - (frames[i - 1].x + frames[i - 1].w)).toBeGreaterThanOrEqual(3);
  expect(p.items.some((b) => b.k === "box" && b.cls === "stg-glow stg-glow-s")).toBe(true);
});
test("a lit column glows in a step that counts again; lit again with no new count: the plain lit outline", () => {
  const p = layoutStage(compile().model, 1000), glow = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.cls === "stg-glow");
  expect(glow.length).toBe(6); // Jul..Dec in step 2 (counts 12); Dec lit again in step 3 with no counts: no glow
  for (const g of glow) { expect(g.on).toEqual([2]); expect(g).toMatchObject({ fill: "none", stroke: "acc:line", bar: { ignore: 1 } }); }
  const css = require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../src/ui/stage.css"), "utf8") as string;
  expect(css).toContain(".stg-glow { filter: drop-shadow(0 0 5px var(--acc)); }");
});
