// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11, helper "slanes": the swimlane matrix (stage block "matrix", tools/stage-slanes.ts).
// parse, every refusal, the facts, layout at 1000 and 340 (nothing outside its box, no word under 11), the doubling test
// (budget charges at n and 2n), a hostile input, and the stage's own checks on it (public sample, no private words).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { compileStage, layoutStage, stageLlm, type Compiled } from "../../src/core/stage";
import { FONT, type Item } from "../../src/core/stage-core";
import { MATRIX_LIMITS } from "../../src/core/stage-slanes";

const ROLES = { desk: 1, eng: 2, ship: 3 };
const split = (src: string) => {
  const parts = src.split(/^@step /m), head = parts[0];
  return { head, steps: parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl < 0 ? undefined : nl), raw: nl < 0 ? "" : s.slice(nl + 1), line: 1 + i } as { title: string; raw: string; line: number }; }) };
};
const build = (src: string, roles: Record<string, number> = ROLES): Compiled => { const { head, steps } = split(src); return compileStage(head, steps, 1, {}, roles); };
const errs = (src: string) => build(src).errors.map((e) => e.msg);
const BASE = `matrix: Tickets | by team
column in: Intake | arrives
column tr: Triage
column fx: Fix
desk d: Front desk | first contact
  in: [t1] New ticket | by email; [t2] Chat ask; + urgent
  tr: [t3] Tag it | priority
eng e: Engineering | owns the fix
  fx: [t4] Patch | with a test; + hotfix; ... about 40 more
`;
const STEPS = `@step One: first.
light d.in: two wait
light t1
@step Two: second.
light d.tr
show t4
`;
const FULL = BASE + STEPS;

describe("parse", () => {
  test("the full sample reads with no problem", () => { const c = build(FULL); expect(c.errors).toEqual([]); expect(c.model.head.length).toBe(1); });
  test("a title and note are optional", () => { expect(build(BASE.replace("matrix: Tickets | by team", "matrix:") + STEPS).errors).toEqual([]); expect(build(BASE.replace("matrix: Tickets | by team", "matrix") + STEPS).errors).toEqual([]); });
  test("a card may name another role in its bracket", () => { expect(build(BASE.replace("[t3] Tag it", "[t3 ship] Tag it") + STEPS).errors).toEqual([]); });
  test("cell targets: lane.band, lane.*, *.band, lane, lists", () => {
    for (const t of ["d.in", "d.*", "*.tr", "d", "d.in, e.fx", "*.*"]) expect(build(BASE + `@step A: a.\nlight ${t}\n@step B: b.\nlight d.in\n`).errors).toEqual([]);
  });
  test("ranges and prefixes in enter and spot", () => { expect(build(BASE + `@step A: a.\nshow t1..t2\n@step B: b.\nlight t*\n`).errors).toEqual([]); });
  test("the stage's own words still work beside the matrix", () => { expect(build(BASE + `@step A: a.\nfoot: made up\n@step B: b.\nlight d.in: x\nnote: n | line\n`).errors).toEqual([]); });
});

describe("every refusal says what and where", () => {
  const msg = (src: string, part: string) => { const e = errs(src); expect(e.some((m) => m.includes(part))).toBe(true); return e; };
  test("no bands, no lanes", () => {
    msg(`matrix: x\ndesk d: Lane\n  in: a\n`, "needs columns");
    msg(`matrix: x\ncolumn in: Intake\n`, "needs lanes");
  });
  test("a second matrix", () => { msg(BASE + "matrix: again\n", "one matrix"); });
  test("band: duplicate, bad id, no title, too many, not one line", () => {
    msg(BASE.replace("column tr: Triage", "column in: Triage"), "declared twice");
    msg(BASE.replace("column tr: Triage", "column 9x: Triage"), "is not an id");
    msg(BASE.replace("column tr: Triage", "column tr:"), "needs a title");
    msg(BASE + Array.from({ length: 9 }, (_, i) => `column b${i}: B${i}\n`).join(""), `at most ${MATRIX_LIMITS.bands} columns`);
    msg(BASE.replace("column tr: Triage", "column tr: Triage\n  stray"), "column is one line");
  });
  test("lane: duplicate, bad id, no title, no cells, too many, undeclared role", () => {
    msg(BASE + "desk d: Again\n  in: x\n", "declared twice");
    msg(BASE + "desk 1d: Again\n  in: x\n", "is not an id");
    msg(BASE + "desk x:\n  in: x\n", "needs a title");
    msg(BASE + "desk x: X\n", "lists its cells");
    msg(BASE + Array.from({ length: 17 }, (_, i) => `desk l${i}: L\n  in: x\n`).join(""), `at most ${MATRIX_LIMITS.lanes} lanes`);
    msg(BASE.replace("desk d:", "ghost d:"), `"ghost" is not a role`);
  });
  test("cell: not a band, twice, empty, too many, malformed, unknown band named with the known ones", () => {
    const e = msg(BASE.replace("  in: [t1]", "  zz: [t1]"), `"zz" is not a column of the matrix (in, tr, fx)`); expect(e.length).toBe(1);
    msg(BASE.replace("  tr: [t3] Tag it | priority", "  in: [t3] Tag it\n  in: x"), "twice");
    msg(BASE.replace("  tr: [t3] Tag it | priority", "  tr: ;"), "at least one item");
    msg(BASE.replace("  tr: [t3] Tag it | priority", `  tr: ${Array.from({ length: 13 }, (_, i) => `[c${i}] c`).join("; ")}`), `at most ${MATRIX_LIMITS.perCell} items`);
    msg(BASE.replace("  tr: [t3] Tag it | priority", "  just words here"), "a cell is");
  });
  test("items: bracket, id, extra role, chip with a second line, too many lines, '...' without words, duplicate id", () => {
    msg(BASE.replace("[t3] Tag it", "[t3 Tag it"), "written in brackets");
    msg(BASE.replace("[t3] Tag it", "[] Tag it"), "an id and at most one role");
    msg(BASE.replace("[t3] Tag it", "[3t] Tag it"), "is not an id");
    msg(BASE.replace("[t3] Tag it", "[t3 ghost] Tag it"), `"ghost" is not a role`);
    msg(BASE.replace("+ urgent", "+ urgent | more"), "a chip is one line");
    msg(BASE.replace("[t3] Tag it | priority", "[t3] Tag it | " + Array.from({ length: 8 }, (_, i) => "l" + i).join(" | ")), "second lines");
    msg(BASE.replace("... about 40 more", "..."), "needs words");
    msg(BASE.replace("[t3] Tag it", "[t1] Tag it"), `"t1" is used twice`);
    msg(BASE.replace("[t3] Tag it | priority", "[t3]"), "an item needs words");
  });
  test("a matrix holds at most the item limit", () => {
    const lanes = Array.from({ length: 11 }, (_, i) => `desk l${i}: L\n  in: ${Array.from({ length: 11 }, (_, j) => `[c${i}x${j}] c`).join("; ")}\n`).join("");
    msg(`matrix: x\ncolumn in: In\n${lanes}`, `at most ${MATRIX_LIMITS.items} items`);
  });
  test("steps: unknown lane, band, card, empty targets, words on many cells", () => {
    msg(BASE + "@step A: a.\nlight q.in\n@step B: b.\nlight d.in\n", `"q.in" is not a card of this scene`);
    msg(BASE + "@step A: a.\nlight d.zz\n@step B: b.\nlight d.in\n", `"zz" is not a column of the matrix (in, tr, fx)`);
    msg(BASE + "@step A: a.\nlight\n@step B: b.\nlight d.in\n", "names what to light");
    msg(BASE + "@step A: a.\nlight d.*: words\n@step B: b.\nlight d.in\n", "one cell");
    msg(BASE + "@step A: a.\nshow nope\n@step B: b.\nlight d.in\n", `"nope" is not a card of this scene`);
    msg(BASE + "@step A: a.\nlight\n@step B: b.\nlight d.in\n", "names what to light");
    msg(BASE.replace("[t1] ", "").replace("[t2] ", "").replace("[t3] ", "").replace("[t4] ", "") + "@step A: a.\nshow t1\n@step B: b.\nlight d.in\n", `"t1" is not a card of this scene`);
  });
  test("a step word of the matrix without a matrix", () => { msg("desk d: x\n@step A: a.\nlight d.in\n@step B: b.\n", `"d.in" is not a card of this scene`); });
  test("a pixel size or a colour value is refused by the stage on a matrix line", () => {
    msg(BASE.replace("priority", "12px wide") + STEPS, "pixel size");
    msg(BASE.replace("priority", "#3366ff") + STEPS, "colour value");
  });
});

describe("the facts (the LLM view)", () => {
  const view = stageLlm(build(FULL));
  test("setup: columns, then each lane with its cells; later items are not there yet", () => {
    expect(view).toContain("Columns: Intake (arrives), Triage, Fix.");
    expect(view).toContain("Front desk (first contact): Intake: New ticket (by email); Chat ask; chip urgent. Triage: Tag it (priority).");
    expect(view).toContain("Engineering (owns the fix): Fix: chip hotfix; and more: about 40 more.");
    expect(view.split("\n").slice(0, 8).join("\n")).not.toContain("Patch");
  });
  test("steps: lit cells with their words, focus, entering cards", () => {
    expect(view).toContain("Lit: Front desk, Intake (two wait).");
    expect(view).toContain("In focus: New ticket (by email) [Front desk, Intake].");
    expect(view).toContain("Now in the matrix: Patch (with a test) [Engineering, Fix].");
    expect(view).toContain("Lit: Front desk, Triage.");
  });
  test("every word of the source reaches the view", () => { for (const w of ["New ticket", "Chat ask", "urgent", "Tag it", "Patch", "hotfix", "about 40 more", "first contact", "owns the fix", "arrives"]) expect(view).toContain(w); });
});

// ---------------------------------------------------------------- layout
const bounds = (it: Item): [number, number, number, number] | null => {
  if (it.k === "box") return [it.x, it.y, it.x + it.w, it.y + it.h];
  if (it.k === "text") return [it.x, it.y, it.x, it.y];
  return null;
};
const laidOut = (src: string, w: number, narrow: boolean) => {
  const c = build(src), h = c.model.head[0], steps = c.model.steps.length;
  return h.block.layout(h.node, { w, narrow, steps, stepTitles: c.model.steps.map((s) => s.title) });
};
const bigScene = (nb: number, nl: number) => `matrix: Big | many cells\n${Array.from({ length: nb }, (_, j) => `column b${j}: Band number ${j} | a note\n`).join("")}${Array.from({ length: nl }, (_, i) => `${["desk", "eng", "ship"][i % 3]} l${i}: Lane ${i} | the lane's note, a longer one\n${Array.from({ length: nb }, (_, j) => `  b${j}: [c${i}x${j}] Card ${i}.${j} with a long title here | a second line that wraps | and a third; + chip ${i}; + another chip`).join("\n")}\n`).join("")}@step A: a.\nlight l0.b0: words under the cell that go on for a while\n@step B: b.\nlight l1.*\n`;
describe("layout: 1000 wide and 340 wide", () => {
  for (const [name, src] of [["the sample", FULL], ["a big matrix", bigScene(6, 5)], ["8 bands", bigScene(8, 3)]] as const) for (const [w, narrow] of [[972, false], [320, true]] as const) {
    test(`${name} at ${w}: nothing outside the box, no word under 11, columns aligned`, () => {
      const out = laidOut(src, w, narrow);
      expect(out.items.length).toBeGreaterThan(10);
      for (const it of out.items) {
        const b = bounds(it); if (!b) continue;
        expect(b[0]).toBeGreaterThanOrEqual(-0.01); expect(b[1]).toBeGreaterThanOrEqual(-0.01);
        if (it.k === "box") { expect(b[2]).toBeLessThanOrEqual(w + 0.01); expect(b[3]).toBeLessThanOrEqual(out.h + 0.01); }
        else expect(b[0]).toBeLessThanOrEqual(w + 0.01);
        if (it.k === "text") expect(FONT[it.f].size).toBeGreaterThanOrEqual(11);
      }
      // a text sits inside the box of its cell, card or chip
      const boxes = out.items.filter((i) => i.k === "box") as Extract<Item, { k: "box" }>[];
      for (const it of out.items) if (it.k === "text" && it.anchor !== "end") {
        const inside = boxes.some((bx) => it.x >= bx.x - 0.5 && it.x <= bx.x + bx.w + 0.5 && it.y <= bx.y + bx.h + 0.5 && it.y >= bx.y);
        if (!(it.x === 0 && it.y < 40)) expect(inside).toBe(true); // the caption row above the matrix has no box
      }
      // shared columns align: every cell of a band starts at one x with one width (wide form)
      if (!narrow) {
        const cols = new Map<string, Set<string>>();
        for (const it of out.items) if (it.k === "box" && it.bar?.kind === "panel") { const k = String(it.bar.column); (cols.get(k) ?? cols.set(k, new Set()).get(k)!).add(`${it.x.toFixed(2)}:${it.w.toFixed(2)}`); }
        expect(cols.size).toBeGreaterThan(1);
        for (const v of cols.values()) expect(v.size).toBe(1);
      }
    });
    test(`${name} at ${w}: the whole scene's geometry is one for every step (no item depends on the step but its show/hide)`, () => {
      const out = laidOut(src, w, narrow), ids = out.items.filter((i) => i.k === "box" && i.id).map((i) => (i as any).id);
      expect(new Set(ids).size).toBe(ids.length); // one place per id: a thing has one box
    });
  }
  test("wide at 972 stays wide; at 340 it stacks by lane (the narrow form has lane frames and band labels, no column heads)", () => {
    const wide = laidOut(FULL, 972, false), narrow = laidOut(FULL, 340, true);
    expect(wide.items.some((i) => i.k === "box" && i.bar?.kind === "band")).toBe(true);
    expect(narrow.items.some((i) => i.k === "box" && i.bar?.kind === "band")).toBe(false);
    expect(narrow.items.filter((i) => i.k === "box" && i.bar?.kind === "lane").length).toBe(2);
    const ys = narrow.items.filter((i) => i.k === "box" && i.bar?.kind === "lane").map((i) => (i as any).y);
    expect(ys[0]).toBeLessThan(ys[1]);
  });
  test("a card enters in its step but its place was reserved from the first: its box exists with from = the step", () => {
    const out = laidOut(FULL, 972, false), patch = out.items.find((i) => i.k === "box" && (i as any).id === "mx:t4") as any;
    expect(patch.from).toBe(2); expect(patch.to).toBe(0);
    const cell = out.items.find((i) => i.k === "box" && (i as any).id === "mx:cell:e.fx") as any;
    expect(patch.y + patch.h).toBeLessThanOrEqual(cell.y + cell.h);
  });
  test("a lit cell: a frame and its words shown in that step only, inside the cell", () => {
    const out = laidOut(FULL, 972, false), frames = out.items.filter((i) => i.k === "box" && (i as any).cls === "stg-sel") as any[];
    expect(frames.map((f) => [f.from, f.to])).toEqual([[1, 1], [2, 2]]);
    const cell = out.items.find((i) => i.k === "box" && (i as any).id === "mx:cell:d.in") as any, cap = out.items.find((i) => i.k === "text" && (i as any).s.startsWith("two wait")) as any;
    expect(cap.from).toBe(1); expect(cap.y).toBeLessThanOrEqual(cell.y + cell.h);
    // the words do not cover the cell's cards
    const cards = out.items.filter((i) => i.k === "box" && ["mx:t1", "mx:t2"].includes((i as any).id)) as any[];
    expect(Math.max(...cards.map((c) => c.y + c.h))).toBeLessThanOrEqual(cap.y - 10);
  });
  test("the stage lays the whole scene out at 1000 and at 340", () => {
    const c = build(FULL);
    for (const w of [1000, 340]) { const p = layoutStage(c.model, w); expect(p.h).toBeGreaterThan(100); for (const it of p.items) if (it.k === "text") expect(FONT[it.f].size).toBeGreaterThanOrEqual(11); }
  });
  test("long words and hover: a title that cannot fit ends in an ellipsis with the full text as a tip", () => {
    // ten long words: a word this long makes the matrix take its narrow form, where a card is nearly the stage's width;
    // since the stage text grew one step, six such words fit in a card's two title lines there, so the
    // title needs ten to overflow and end in an ellipsis
    const src = BASE.replace("[t3] Tag it | priority", "[t3] " + "Supercalifragilisticexpialidocious ".repeat(10));
    const out = laidOut(src + STEPS, 972, false), t = out.items.filter((i) => i.k === "text" && (i as any).tip && (i as any).s.endsWith("…"));
    expect(t.length).toBeGreaterThan(0);
  });
});

describe("work: the doubling test and a hostile input", () => {
  const used = (n: number) => {
    const b = beginDocument(newBudget(1e9, 1e9)), start = b.left().work;
    const src = bigScene(4, n) , c = build(src); const p = layoutStage(c.model, 1000); expect(p.items.length).toBeGreaterThan(0);
    return start - b.left().work;
  };
  test("double the lanes, the work at most about doubles", () => { const a = used(4), b = used(8); expect(b / a).toBeLessThan(2.4); expect(b / a).toBeGreaterThan(1.3); });
  test("double the text in a card, the work at most about doubles", () => {
    const run = (k: number) => { const b = beginDocument(newBudget(1e9, 1e9)), s = b.left().work; const c = build(BASE.replace("priority", "word ".repeat(k)) + STEPS); layoutStage(c.model, 1000); return s - b.left().work; };
    const a = run(400), b = run(800); expect(b / a).toBeLessThan(2.4);
  });
  test("a tiny budget is refused with BudgetError, never a hang", () => {
    beginDocument(newBudget(50, 50));
    expect(() => build(bigScene(6, 12))).toThrow(BudgetError);
    beginDocument();
  });
  test("hostile text: a huge one-word title, brackets, separators, odd characters, nested colons; it ends and reads or refuses", () => {
    beginDocument();
    const t0 = performance.now();
    for (const bad of ["x".repeat(20000), "[[[[[[[[[[", "; ; ; ; ; ;", "| | | | |", "+ + + +", "... ... ...", ": : : :", "\u202e\u0000é😀".repeat(500), "[a b c d]", "a".repeat(3000) + " " + "b".repeat(3000)]) {
      const c = build(BASE.replace("[t3] Tag it | priority", bad) + STEPS); layoutStage(c.model, 1000); layoutStage(c.model, 340); stageLlm(c);
    }
    expect(performance.now() - t0).toBeLessThan(8000);
  });
  test("a matrix at its limits (8 bands, 16 lanes, 12 items a cell) lays out in both forms", () => {
    const lanes = Array.from({ length: 10 }, (_, i) => `desk l${i}: Lane ${i}\n${Array.from({ length: 8 }, (_, j) => `  b${j}: ${Array.from({ length: 12 }, (_, k) => `+ c${k}`).join("; ")}`).join("\n")}`).join("\n");
    const src = `matrix: x\n${Array.from({ length: 8 }, (_, j) => `column b${j}: B${j}`).join("\n")}\n${lanes}\n`;
    const c = build(src.replace(/(\d+)\.\.\./, "$1")); // 10 lanes x 8 cells x 12 chips = 960 > the item limit: refused, with the number
    expect(c.errors.some((e) => e.msg.includes(`at most ${MATRIX_LIMITS.items} items`))).toBe(true);
  });
});

describe("the public sample", () => {
  const sample = readFileSync(new URL("samples/support.scene", import.meta.url), "utf8");
  test("the prototype's notes reads with no problem and is at most 40 lines", () => {
    const c = build(sample.replace(/^roles: .*\n/m, ""), { desk: 1, eng: 2, ship: 3 }); expect(c.errors).toEqual([]);
    expect(sample.trim().split("\n").length).toBeLessThanOrEqual(40);
  });
  test("it holds no private address", () => { expect(sample).not.toMatch(/\b(?:10|192\.168)\.\d+\.\d+\.\d+\b/); });
});
