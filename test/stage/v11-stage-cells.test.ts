// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// a wordless cell row in a panel ("cells a: 32, +4 new", then an optional indented "labels: 0..31 | 32-35 new").
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { FONT, PHONE_FONT, measure, type Item } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
const ROLES = { a: 1, b: 2, job: 3 };
type Step = { title: string; raw: string; line: number };
const steps = (...raws: string[]): Step[] => raws.map((raw, i) => ({ title: `Step ${i + 1}`, raw, line: 10 * (i + 1) }));
const compile = (raws: string[], roles: Record<string, number> = ROLES) => compileStage("", steps(...raws), 1, {}, roles);
const ROW = "cells a: 32, +4 new\n  labels: 0..31 | 32-35 new";
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const cellsAt = (items: Item[], step: number) => items.filter((i): i is Box => i.k === "box" && !!i.cls?.includes("stg-cell") && i.from === step);
const textsAt = (items: Item[], step: number) => items.filter((i): i is Text => i.k === "text" && i.from === step);
// the painted size of a font: the phone size inside a narrow layout (stage.css --stg-phone-<font>), else the stage's own
const painted = (f: keyof typeof FONT, narrow: boolean) => (narrow ? PHONE_FONT[f] : undefined) ?? FONT[f].size;

test("a row of 32 plain cells, then 4 in the accent tone, one line at 1000, with the badge in role a", () => {
  const c = compile([ROW, "list Next\n  a: b"]); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), cells = cellsAt(p.items, 1);
  expect(cells.length).toBe(36);
  expect(cells.slice(0, 32).every((x) => x.fill === "surface-2" && x.stroke === "stg-cell-line" && !x.thick)).toBe(true);
  expect(cells.slice(32).every((x) => x.fill === "acc:soft" && x.stroke === "acc:line" && x.thick)).toBe(true);
  expect(new Set(cells.map((x) => x.y)).size).toBe(1); // one line on a wide stage
  for (let i = 1; i < 36; i++) expect(cells[i].x).toBeGreaterThan(cells[i - 1].x + cells[i - 1].w); // left to right, apart
  const badge = p.items.find((i) => i.k === "badge" && i.from === 1);
  expect(badge?.k === "badge" && badge.s === "a" && badge.role === "a").toBe(true);
  if (badge?.k !== "badge") throw new Error("no badge");
  expect(badge.x + 17).toBeLessThan(cells[0].x); // the badge stands at the row's left
  expect(cells.every((x) => x.bar?.kind === "chip" && !x.bar?.label)).toBe(true); // wordless cells, each a measurement hook
  expect(new Set(cells.map((x) => x.bar?.id)).size).toBe(36);
});

test("a badge with no role of that name is a plain letter chip (no role colour)", () => {
  const c = compile([ROW, "list Next\n  a: b"], { job: 1 }); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000);
  expect(p.items.some((i) => i.k === "badge" && i.from === 1)).toBe(false);
  const t = textsAt(p.items, 1).find((i) => i.s === "a"); expect(t?.ink).toBe("ink");
  const box = p.items.find((i) => i.k === "box" && i.from === 1 && i.bar?.kind === "chip" && i.bar?.label === "a");
  expect(box?.k === "box" && box.fill === "surface-2").toBe(true);
});

for (const w of [1000, 340]) test(`labels: "x..y" names the first and last cell, one word is centred under its group (${w})`, () => {
  const c = compile([ROW, "list Next\n  a: b"]); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, w), cells = cellsAt(p.items, 1), ts = textsAt(p.items, 1), narrow = w < 600;
  const t0 = ts.find((t) => t.s === "0"), t31 = ts.find((t) => t.s === "31"), tn = ts.find((t) => t.s === "32-35 new");
  if (!t0 || !t31 || !tn) throw new Error("missing labels");
  // under its own cell: left edge of "0" at cell 0's left, right edge of "31" at cell 31's right, each on the line under that cell
  const left = (t: Text) => (t.anchor === "end" ? t.x - measure(t.s, t.f) : t.anchor === "middle" ? t.x - measure(t.s, t.f) / 2 : t.x);
  expect(Math.abs(left(t0) - cells[0].x)).toBeLessThan(1.5);
  expect(Math.abs(left(t31) + measure("31", t31.f) - (cells[31].x + cells[31].w))).toBeLessThan(1.5);
  const under = (t: Text, cell: Box) => { expect(t.y).toBeGreaterThan(cell.y + cell.h); expect(t.y - (cell.y + cell.h)).toBeLessThan(22); };
  under(t0, cells[0]); under(t31, cells[31]);
  // the word centred under its group's cells on the group's last line
  const g = cells.slice(32).filter((x) => x.y === cells[35].y), mid = (g[0].x + g.at(-1)!.x + g.at(-1)!.w) / 2;
  expect(Math.abs(left(tn) + measure(tn.s, tn.f) / 2 - mid)).toBeLessThan(1.5); under(tn, cells[35]);
  expect(tn.ink).toBe("acc:ink"); expect(t0.ink).toBe("muted");
  for (const t of ts) { expect(painted(t.f, narrow)).toBeGreaterThanOrEqual(11); expect(left(t)).toBeGreaterThanOrEqual(0); expect(left(t) + measure(t.s, t.f)).toBeLessThanOrEqual(w); }
  // no label on another label or on a cell
  const lbl = [t0, t31, tn].map((t) => ({ x: left(t), w: measure(t.s, t.f), y: t.y - painted(t.f, narrow), h: painted(t.f, narrow) + 3 }));
  for (let i = 0; i < lbl.length; i++) for (let j = i + 1; j < lbl.length; j++) { const a = lbl[i], b = lbl[j]; expect(a.x + a.w <= b.x + 2 || b.x + b.w <= a.x + 2 || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true); }
  for (const a of lbl) for (const x of cells) expect(a.x + a.w <= x.x || x.x + x.w <= a.x || a.y + a.h <= x.y || x.y + x.h <= a.y).toBe(true);
  for (const x of cells) { expect(x.x).toBeGreaterThanOrEqual(0); expect(x.x + x.w).toBeLessThanOrEqual(w); expect(x.y + x.h).toBeLessThanOrEqual(p.h); }
});

test("a phone wraps the row (never past the stage), cells keep their order", () => {
  const c = compile([ROW, "list Next\n  a: b"]); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 340), cells = cellsAt(p.items, 1);
  expect(cells.length).toBe(36);
  expect(new Set(cells.map((x) => x.y)).size).toBeGreaterThan(1);
  for (let i = 1; i < 36; i++) expect(cells[i].y > cells[i - 1].y || (cells[i].y === cells[i - 1].y && cells[i].x > cells[i - 1].x)).toBe(true);
});

for (const w of [1000, 340]) test(`one place for every step: a cell stays put when the groups or labels change (${w})`, () => {
  const c = compile(["cells a: 36", ROW, "cells a: 32, +4 new", "cells a: 30, +6 spare\n  labels: _ | spare"]); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, w), at = [1, 2, 3, 4].map((k) => cellsAt(p.items, k).map((x) => [x.x, x.y, x.w, x.h].join()));
  for (const k of [1, 2, 3]) expect(at[k]).toEqual(at[0]);
  const badges = p.items.filter((i) => i.k === "badge").map((i) => (i.k === "badge" ? [i.x, i.y].join() : ""));
  expect(new Set(badges).size).toBe(1);
});

test("two cells lines one under the other are one panel: two rows, aligned, tight", () => {
  const c = compile(["cells a: 32, +4 new\ncells b: 32, +4 new\n  labels: 0..31 | 32-35 new", "list Next\n  a: b"]); expect(c.errors).toEqual([]);
  expect(c.model.steps[0].panels.length).toBe(1);
  for (const w of [1000, 340]) {
    const p = layoutStage(c.model, w), cells = cellsAt(p.items, 1); expect(cells.length).toBe(72);
    const a = cells.slice(0, 36), b = cells.slice(36);
    for (let i = 0; i < 36; i++) expect(b[i].x).toBe(a[i].x); // columns line up
    expect(b[0].y).toBeGreaterThan(a[35].y + a[35].h);
    if (w === 1000) expect(b[0].y - a[0].y).toBeLessThan(44); // tight, as the original's two rows
    const bs = p.items.filter((i) => i.k === "badge" && i.from === 1); expect(bs.map((i) => (i.k === "badge" ? i.role : ""))).toEqual(["a", "b"]);
    const labels = textsAt(p.items, 1).filter((t) => ["0", "31", "32-35 new"].includes(t.s)); expect(labels.length).toBe(3);
    for (const t of labels) expect(t.y).toBeGreaterThan(b[0].y); // the labels are row b's
  }
  // a line between them makes two panels
  expect(compile(["cells a: 4\nlist X\n  k: v\ncells b: 4", "list Next\n  a: b"]).model.steps[0].panels.length).toBe(3);
});

test("the LLM view says each row once: its groups, their words and labels", () => {
  const c = compile(["cells a: 32, +4 new\ncells b: 32, +4 new\n  labels: 0..31 | 32-35 new", "cells: 3 old, +1\ncells a: 32\n  labels: 0..31"]); expect(c.errors).toEqual([]);
  const llm = stageLlm(c);
  expect(llm).toContain("Row a: 32 cells, then 4 new cells.");
  expect(llm).toContain("Row b: 32 cells (0 to 31), then 4 new cells (32-35 new).");
  expect(llm).toContain("Row: 3 old cells, then 1 accent cell.");
  expect(llm).toContain("Row a: 32 cells (0 to 31).");
  expect(llm).not.toMatch(/cells \w*: \d+ cells/); // the count is said once
});

const BAD: [string, number, RegExp][] = [
  ["cells a: 0", 11, /positive whole/], ["cells a: 3.5", 11, /positive whole/], ["cells a: x", 11, /positive whole/], ["cells a: 32, +0 new", 11, /positive whole/],
  ["cells a:", 11, /cells a: 32, \+4 new/], ["cells a 32", 11, /cells a: 32, \+4 new/], ["cells a: 65", 11, /at most 64/], ["cells a: 40, +30 new", 11, /at most 64/],
  ["cells abcd: 3", 11, /badge/], ["cells a b: 3", 11, /badge/], ["cells a: 1, 1, 1, 1, 1, 1, 1, 1, 1", 11, /at most 8 groups/],
  ["cells a: 32, +4 new\n  labels: 0..31", 12, /one entry per group \(2\)/], ["cells a: 32, +4 new\n  labels: 0..31 | 32 | 33", 12, /one entry per group \(2\)/],
  ["cells a: 1, +4 new\n  labels: 0..0 | new", 12, /one-cell/], ["cells a: 32, +4 new\n  labels: 0..31 | 32-35 new\n  labels: x | y", 13, /once/],
  ["cells a: 32\n  words", 12, /labels/], ["cells a: 32\n  labels: 0.. | x", 12, /one entry per group \(1\)/], ["cells a: 4\n  labels: ..3", 12, /x\.\.y/],
];
for (const [raw, line, re] of BAD) test(`refuses ${JSON.stringify(raw)}`, () => {
  const c = compile([raw, "list Next\n  a: b"]);
  expect(c.errors.length).toBeGreaterThan(0); expect(c.errors[0].line).toBe(line); expect(c.errors[0].msg).toMatch(re);
});
test("cells is a panel: refused in the setup, a time block's own cells: line still reads", () => {
  const c = compileStage("cells a: 4", steps("list A\n  a: b", "list B\n  a: b"), 1, {}, ROLES);
  expect(c.errors.some((e) => /panel/.test(e.msg))).toBe(true);
  expect(compileStage('time: 0..10 | seconds\ncells: 1\nrow job a "x": +on 0..2', steps("list A\n  a: b", "list B\n  a: b"), 1, {}, ROLES).errors).toEqual([]);
});

test("a hostile count charges the document budget before any cell is made", () => {
  beginDocument(newBudget(400));
  let e: unknown; try { compile(["cells a: 60, +4 new\ncells b: 60, +4 new\ncells a: 60, +4 new\ncells b: 60, +4 new\ncells a: 60, +4 new\ncells b: 60, +4 new", "list Next\n  a: b"]); } catch (x) { e = x; }
  expect(e).toBeInstanceOf(BudgetError); expect((e as BudgetError).what).toMatch(/^cells/);
});
test("the work doubles with the cells (counted budget charges at n and 2n)", () => {
  const work = (n: number) => { const b = beginDocument(), c = compile([`cells a: ${n}\n  labels: ${n === 1 ? "x" : `0..${n - 1}`}`, "list Next\n  a: b"]); expect(c.errors).toEqual([]); layoutStage(c.model, 1000); return 2_000_000 - b.left().work; };
  const one = work(16), two = work(32), base = work(1);
  expect(two - base).toBeGreaterThan((one - base) * 1.6); expect(two - base).toBeLessThan((one - base) * 2.4);
});

// the review (23 Nov, 390 dark): every cell's outline at least 3:1 on the stage background, light and dark. Measured from the
// theme's own tokens (site/src/theme.css, stage.css), as the chips track's contrast test: the paint each cell names, resolved
// through the tokens, against --stg-bg.
test("every cell's outline is at least 3:1 on the stage background, light and dark", () => {
  const css = (f: string) => require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../src/ui", f), "utf8") as string;
  const vars = (src: string, sel: string) => { const out: Record<string, string> = {}; let i = 0; while ((i = src.indexOf(sel + " {", i)) >= 0) { const a = src.indexOf("{", i), b = src.indexOf("}", a); for (const m of src.slice(a + 1, b).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim(); i = b; } return out; };
  const theme = css("theme.css"), stage = css("stage.css");
  const light = { ...vars(theme, ":root"), ...vars(stage, ":root") }, dark = { ...light, ...vars(theme, ':root[data-theme="dark"]'), ...vars(stage, ':root[data-theme="dark"]') };
  const hex = (v: Record<string, string>, name: string) => { let s = v[name]; for (let n = 0; s && s.startsWith("var(") && n < 8; n++) s = v[s.slice(4, s.indexOf(")")).split(",")[0].trim()]; const m = /^#([0-9a-f]{6})$/i.exec(s ?? ""); if (!m) throw new Error(`${name} is not a colour: ${s}`); return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)); };
  const token = (p: string) => { const [a, b] = p.split(":"); return ["good", "bad", "warn", "acc"].includes(a) ? (b === "line" || !b ? `--${a}` : `--${a}-${b}`) : `--${a}`; }; // as site/src/stage.tsx paint
  const lum = (c: number[]) => { const l = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const c = compile(["cells a: 32, +4 new\ncells b: 30, +2 spare, +4 new", "list Next\n  a: b"]); expect(c.errors).toEqual([]);
  let seen = 0;
  for (const v of [light, dark]) for (const w of [1000, 340]) for (const x of cellsAt(layoutStage(c.model, w).items, 1)) {
    expect([x.stroke, Math.round(ratio(hex(v, token(x.stroke)), hex(v, "--stg-bg")) * 100) / 100 >= 3]).toEqual([x.stroke, true]); seen++;
  }
  expect(seen).toBe(4 * 72);
  expect(ratio(hex(dark, "--line-2"), hex(dark, "--stg-bg"))).toBeLessThan(3); // the old outline (line-2) fails here
});
