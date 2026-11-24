// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
const roles = { eval: 1, warm: 2 };
const compile = (head: string, ...raw: string[]) => compileStage(head, raw.map((raw, i) => ({ title: "Step " + (i + 1), raw, line: 20 + i * 3 })), 1, {}, roles);
const boxes = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.bar && (i.bar.kind === "time-bar" || !!i.cls?.includes("stg-time-cell")));

for (const flags of ["[dashed] [warn]", "[warn] [dashed]", "[dashed] [good]", "[dashed] [accent]"]) test("a coloured preview keeps its tone in either flag order: " + flags, () => {
  const tone = flags.includes("warn") ? "warn" : flags.includes("good") ? "good" : "acc";
  const c = compile('time: 0..4\ncells: 1\nrow eval copies "Copies": preview 0..4 [wide] ' + flags + ' @1; live 0..4 [wide] [warn] @2', "", "");
  expect(c.errors).toEqual([]);
  for (const width of [1178, 356, 326]) {
    const p = layoutStage(c.model, width), cells = boxes(p.items), preview = cells.find(i => i.from === 1)!, live = cells.find(i => i.from === 2)!;
    expect(preview.fill).toBe(tone + ":soft"); expect(preview.stroke).toBe(tone + ":line"); expect(preview.dash).toBe(true);
    expect(preview.dim).toEqual([1, 2]); expect(live.dim).toBeUndefined(); expect(live.dash).toBe(false);
    expect([preview.x, preview.y, preview.w, preview.h]).toEqual([live.x, live.y, live.w, live.h]);
    const text = p.items.find(i => i.k === "text" && i.s === "preview")!;
    expect(text.k === "text" && text.ink).toBe(tone + ":ink"); expect(text.dim).toBeUndefined();
  }
});
test("a bare dashed state keeps its existing neutral paint", () => {
  const c = compile("time: 0..4\ncells: 1\nrow eval copies: wait 0..4 [wide] [dashed]", "", "");
  expect(c.errors).toEqual([]); const b = boxes(layoutStage(c.model, 1000).items)[0];
  expect(b.fill).toBe("surface-2"); expect(b.stroke).toBe("scn-faint-edge"); // the neutral faint-state edge (0.7.0-rc.3), 3:1 expect(b.dash).toBe(true); expect(b.dim).toBeUndefined();
});
test("each ordinary tick cell receives the preview paint without changing its words or place", () => {
  const c = compile('time: 0..4\ncells: 1\nrow eval copies: _ 0..4 [dashed] [warn]', "", "");
  const plain = compile('time: 0..4\ncells: 1\nrow eval copies: _ 0..4 [warn]', "", "");
  expect(c.errors).toEqual([]); expect(plain.errors).toEqual([]);
  for (const width of [1178, 356, 326]) {
    const p = layoutStage(c.model, width), q = layoutStage(plain.model, width), cells = boxes(p.items);
    expect(cells).toHaveLength(4); expect(p.h).toBe(q.h);
    expect(cells.every(i => i.fill === "warn:soft" && i.stroke === "warn:line" && i.dash && i.dim?.length === 2)).toBe(true);
    expect(cells.map(i => [i.x, i.y, i.w, i.h])).toEqual(boxes(q.items).map(i => [i.x, i.y, i.w, i.h]));
  }
});
test("any counted group can declare a role without changing its count or geometry", () => {
  const raw = "cells a: 32 (eval), +4 new (warm)\n  labels: 0..31 | new";
  const c = compile("", raw, raw), legacy = compile("", raw.replace(" (eval)", "").replace(" (warm)", ""), "");
  expect(c.errors).toEqual([]); expect(legacy.errors).toEqual([]);
  for (const width of [1178, 356, 326]) {
    const p = layoutStage(c.model, width), q = layoutStage(legacy.model, width);
    const cells = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.cls?.includes("stg-cell") && i.from === 1);
    const old = q.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.cls?.includes("stg-cell") && i.from === 1);
    expect(cells).toHaveLength(36); expect(p.h).toBe(q.h);
    expect(cells.map(i => [i.x, i.y, i.w, i.h])).toEqual(old.map(i => [i.x, i.y, i.w, i.h]));
    for (const [i, cell] of cells.entries()) { const role = i < 32 ? "eval" : "warm"; expect(cell.fill).toBe("role:" + role + ":soft"); expect(cell.stroke).toBe("role:" + role + ":line"); expect(cell.bar?.role).toBe(role); expect(cell.bar?.kind).toBe("chip"); }
    expect(p.items.some(i => i.k === "text" && i.s === "new" && i.ink === "role:warm:ink")).toBe(true);
    expect(p.items.some(i => i.k === "text" && i.s.includes("(warm)"))).toBe(false);
  }
  expect(stageLlm(c)).toContain("(eval)"); expect(stageLlm(c)).toContain("(warm)");
});
for (const group of ["4 (unknown)", "4 (eval) (warm)"]) test("refuse an invalid counted-group role: " + group, () => {
  expect(compile("", "cells a: " + group, "").errors.length).toBeGreaterThan(0);
});
