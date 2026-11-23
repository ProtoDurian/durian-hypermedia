// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// EVERY track form draws each phase's label as ONE text run (one text node:
// "2 Signalled"), never the number and the name as two; a lone number run pairs with other numbers of a scene in the bar's
// stale check. Walks every form (strip, chips, chips with arrows, beside where) at wide and phone widths, every step.
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const PHASES = ["1 Pending", "2 Signalled", "3 Allocated", "4 Rerouted", "5 Done"];
const WHERE = "yard main-pickers · status.season.stage";
const AT = [null, null, 2, 2, 4, 1];
const FORMS: Record<string, string> = {
  strip: "", chips: "form: chips\n", "chips | arrows": "form: chips | arrows\n",
  "beside where": "form: chips\nplace: beside where\n", "beside where | arrows": "form: chips | arrows\nplace: beside where\n",
};
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
for (const [form, lines] of Object.entries(FORMS)) for (const w of [1000, 340]) test(`${form} at ${w}: one text run per phase label, every step`, () => {
  const c = compileStage(`track: op ${PHASES.join(", ")}\n${lines}where: ${WHERE}`, AT.map((a, i) => ({ title: `S${i + 1}: step ${i + 1}`, raw: a === null ? "" : `at ${PHASES[a]}`, line: 20 + 3 * i })), 1, {}, { op: 1 });
  expect(c.errors).toEqual([]);
  const items = layoutStage(c.model, w).items, chips = items.filter((i): i is Box => i.k === "box" && i.bar?.kind === "track" && !i.bar?.tone);
  expect(chips.length).toBe(5);
  const lone = new Set(PHASES.flatMap((p) => p.split(" ")));
  for (let k = 1; k <= AT.length; k++) {
    chips.forEach((b, i) => {
      const ts = items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && t.x > b.x && t.x < b.x + b.w && t.y > b.y && t.y < b.y + b.h);
      expect([form, w, k, i, ts.length]).toEqual([form, w, k, i, 1]);            // one run in the chip
      expect(ts[0].tip ?? ts[0].s).toBe(PHASES[i]);                              // its whole label (a strip may cut it, with the name as its tip)
    });
    expect(items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && lone.has(t.s)).map((t) => t.s)).toEqual([]); // never a lone number or name
  }
});
