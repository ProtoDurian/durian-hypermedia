// Lane sheet: stacking, refusals and the LLM lines.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { beginDocument, endDocument } from "../../../src/core/stage-budget";
import { measure, wrap } from "../../../src/core/stage-core";
import { LAYOUT } from "../../../src/engine/layouts";
import type { LayoutCtx, Placed, Prim, Thing } from "../../../src/engine/types";
import { modelOf, scenes, statesOf } from "./helpers";

beforeEach(() => beginDocument());
afterEach(() => { endDocument(); });
const fake = (h: number): Placed => ({ w: 300, h, at: () => ({}), decor: () => [] });
const ctxOf = (child: LayoutCtx["child"], problems: string[] = []): LayoutCtx => ({ width: 1000, phone: false, look: "stage", measure, wrap, child, problem: (p) => problems.push(p.msg) });
const thing = (id: string, line: number): Thing => ({ id, role: null, title: id, lines: [], flags: [], shape: "box", layout: "grid", container: true, parent: null, region: null, order: 0, values: null, keys: {}, chart: null, src: { line } });

test("containers under the strip: those never on screen together share one place, a later overlap starts a new one", () => {
  const m = modelOf(scenes("13-test-a-late-timeline.dh.md")[0]);
  for (const [id, line] of [["p1", 90], ["p2", 91], ["p3", 92]] as const) { m.things[id] = thing(id, line); m.order.push(id); }
  const states = statesOf(m).map((s, k) => ({ ...s, things: { p1: vis(k === 1), p2: vis(k === 2), p3: vis(k === 1 || k === 3) } }));
  const placed = LAYOUT.track.place({ model: m, states, container: null, members: ["p1", "p2", "p3"], regions: [] }, ctxOf((id) => fake(id === "p2" ? 70 : 40)));
  const r1 = placed.at(1), r2 = placed.at(2), r3 = placed.at(3);
  expect(r1.p1.y).toBe(r2.p2.y);              // p1 and p2 never show together: one place
  expect(r3.p3.y).toBeGreaterThanOrEqual(r1.p1.y + 70 + 12); // p3 shows with p1 in step 1: under their place (as tall as the tallest)
  expect(placed.h).toBeGreaterThanOrEqual(r3.p3.y + 40);
});
function vis(v: boolean) { return { visible: v, at: null, in: null, side: null, is: null, text: null, tone: null, dim: false, values: null, lifted: false, open: false }; }

test("what a block refuses is reported once, with its line, by the layout's step hook", () => {
  const m = modelOf(scenes("20-animation-boxes-inside-boxes.dh.md")[0]);
  m.steps[0].facts.push({ k: "layout", word: "unwrap", arg: "nothing", body: [], src: { line: 77 } });
  const seen: { line: number; msg: string }[] = [];
  const s1 = LAYOUT.wrap.step!(m, undefined, [], (p) => seen.push(p));
  LAYOUT.wrap.step!(m, s1, [], (p) => seen.push(p));
  expect(seen.length).toBe(1);
  expect(seen[0].line).toBe(77);
});

test("the LLM lines say each block's facts per step", () => {
  const m = modelOf(scenes("24-animation-a-package-journey.dh.md")[0]);
  const lines = LAYOUT.track.llm!(m, statesOf(m));
  expect(lines.some((l) => l.startsWith("Phases:"))).toBe(true);
  expect(lines.some((l) => /^Step 2: At: .*cache lookup|^Step 2: At: lookup/.test(l))).toBe(true);
});
test("the words each layout owns", () => {
  expect(LAYOUT.track.words?.setup).toContain("carry");
  expect(LAYOUT.sheet.words?.step).toContain("sum");
  expect(LAYOUT.wrap.words?.step).toContain("unwrap");
});
