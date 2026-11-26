// Lane sheet: the three layouts draw what the old stage drew (same words, same places, same steps), from the model the
// parse lane makes of the real fixtures.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { beginDocument, endDocument } from "../../../src/core/stage-budget";
import { measure, wrap } from "../../../src/core/stage-core";
import { LAYOUT } from "../../../src/engine/layouts";
import { buildHeads } from "../../../src/engine/layouts/sheet/blocks";
import type { LayoutCtx, Prim } from "../../../src/engine/types";
import { mineOf, modelOf, oldPlan, scenes, statesOf } from "./helpers";

beforeEach(() => beginDocument());
afterEach(() => { endDocument(); });

const ctxAt = (width: number): LayoutCtx => ({ width, phone: width < 480, look: "stage", measure, wrap, child: () => { throw new Error("no child"); }, problem: (p) => { throw new Error(p.msg); } });
type Text = Extract<Prim, { k: "text" }>;
const FILES = {
  sheet: "03-animation-a-worksheet.dh.md",
  nest: "20-animation-boxes-inside-boxes.dh.md",
  journey: "24-animation-a-package-journey.dh.md",
  strip: "02-animation-a-phase-strip-and-swapped-panels.dh.md",
  late: "13-test-a-late-timeline.dh.md",
};
const shown = (it: { on?: number[]; from?: number; to?: number }, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const same = (a: string, b: string) => a.replace(/\s+/g, " ").startsWith(b.replace(/\s+/g, " "));
const root = (m: ReturnType<typeof modelOf>) => ({ model: m, states: statesOf(m), container: null, members: [], regions: [] });

for (const [what, file] of Object.entries(FILES)) for (const width of what === "sheet" ? [1000] : [1000, 390]) { // (the sheet at 390 has its own test below)
  test(`${what}: every word the layout draws is where the old stage drew it, at ${width}`, () => {
    const f = scenes(file)[0], model = modelOf(f);
    const built = buildHeads(model, ["sheet", "wrap", "track"]);
    expect(built.problems).toEqual([]);
    expect(built.heads.length).toBeGreaterThan(0);
    const old = oldPlan(model, f, width);
    expect(old.errors).toEqual([]);
    const placed = LAYOUT[mineOf(model)].place(root(model), ctxAt(width));
    expect(placed.w).toBe(width);
    for (let k = 1; k <= model.steps.length; k++) {
      const mine = placed.decor(k).filter((p): p is Text => p.k === "text");
      expect(mine.length).toBeGreaterThan(0);
      const oldTexts = old.plan.items.filter((it) => it.k === "text" && shown(it, k)) as { x: number; y: number; s: string }[];
      for (const p of mine) if (!oldTexts.some((it) => Math.abs(it.x - p.x) < 0.01 && Math.abs(it.y - p.y) < 0.01 && same(it.s, p.lines[0]))) throw new Error(`step ${k}: "${p.lines.join(" ")}" at ${p.x},${p.y} is not drawn there by the old stage`);
    }
  });
}

// the old stage put a phone worksheet's step notes under its groups and moved the outcome column down by their height
// (slot.under); the notes are the renderer's now, so there the column sits right under the groups: same words, same x, at or above the old place
test("sheet at 390: the outcome column is at or above where the old stage put it under the step notes", () => {
  const f = scenes(FILES.sheet)[0], model = modelOf(f), old = oldPlan(model, f, 390);
  const placed = LAYOUT.sheet.place(root(model), ctxAt(390));
  for (let k = 1; k <= model.steps.length; k++) for (const p of placed.decor(k)) {
    if (p.k !== "text") continue;
    expect(old.plan.items.some((it) => it.k === "text" && shown(it, k) && Math.abs(it.x - p.x) < 0.01 && it.y >= p.y - 0.01 && same(it.s, p.lines[0]))).toBe(true);
  }
});

// scenes with lanes: the heads sit under (or over) the lanes, so each block's words are one vertical offset from the old place
describe("example-layers", () => {
  scenes("example-layers.dh.md").forEach((f, i) => {
    const model = modelOf(f);
    if (!(["sheet", "wrap", "track"] as const).some((l) => model.layoutWords[l]?.length)) return;
    test(`scene ${i + 1}: the heads' words keep their places to one offset`, () => {
      const old = oldPlan(model, f, 1000);
      const placed = LAYOUT[mineOf(model)].place(root(model), ctxAt(1000));
      expect(buildHeads(model, ["sheet", "wrap", "track"]).problems).toEqual([]);
      for (let k = 1; k <= model.steps.length; k++) {
        const oldTexts = old.plan.items.filter((it) => it.k === "text" && shown(it, k)) as { x: number; y: number; s: string }[];
        const byBlock = new Map<string, Text[]>();
        for (const p of placed.decor(k)) if (p.k === "text") { const b = p.key.split(":").slice(0, 3).join(":"); byBlock.set(b, [...(byBlock.get(b) ?? []), p]); }
        for (const [b, ps] of byBlock) {
          let dys = null as Set<number> | null;
          for (const p of ps) {
            const ds = new Set<number>(oldTexts.filter((it) => Math.abs(it.x - p.x) < 0.01 && same(it.s, p.lines[0])).map((it) => Math.round(it.y - p.y)));
            dys = dys ? new Set<number>([...dys].filter((d) => ds.has(d))) : ds;
          }
          if (!dys || dys.size === 0) throw new Error(`scene ${i + 1} step ${k}: block ${b}: no one offset places its ${ps.length} words like the old stage`);
        }
      }
    });
  });
});
