// Lane blocks2: the timeline, sheet, wrap, track and grid's ported words draw from the Model (layouts/parts.ts).
import { describe, expect, test } from "bun:test";
import { fences, partIds, planOf, withoutParts } from "./helpers";
import { Timeline } from "../../../src/engine/layouts/time";
import { states as stepStates } from "../../../src/engine/core/states";
import { measure, wrap } from "../../../src/core/stage-core";
import type { LayoutCtx } from "../../../src/engine/types";

const ALL = fences(["timeline", "sheet", "wrap", "track", "grid"]).filter((f) => f.compiled.model.steps.length > 0);

describe("every visible thing has a rect", () => {
  for (const fx of ALL) test(fx.name, () => {
    const c = fx.compiled, n = c.model.steps.length;
    for (const w of [1280, 390]) {
      const p = c.plan(w);
      for (let k = 0; k <= n; k++) {
        const r = p.rects(k);
        // a chart thing lowered from a block's head (units, bars, columns) is still drawn by the block: no rect, or the chart system would draw it twice
        for (const [id, st] of Object.entries(c.states[k].things)) if (st.visible && !c.model.things[id].chart) {
          expect(r[id], `${fx.name} ${w} step ${k}: ${id}`).toBeDefined();
          expect(r[id].w * r[id].h).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("the Model draws what the blocks' own windows drew", () => {
  for (const fx of ALL) test(fx.name, () => {
    const c = fx.compiled, plain = withoutParts(c.model), n = c.model.steps.length;
    expect(partIds(c).length).toBeGreaterThan(0);
    for (const w of [1280, 390, 800]) {
      const a = c.plan(w), b = planOf(plain, w);
      for (let k = 0; k <= n; k++) expect(JSON.stringify(a.frame(k)), `${fx.name} ${w} step ${k}`).toBe(JSON.stringify(b.frame(k)));
      expect([a.w, a.h]).toEqual([b.w, b.h]);
    }
  });
});

describe("the Model decides", () => {
  test("a hide fact on a part takes its drawing away, a show brings it", () => {
    const fx = ALL.find((f) => f.name === "05#0")!, m = structuredClone(fx.compiled.model);
    const id = partIds(fx.compiled).find((p) => fx.compiled.states[1].things[p].visible)!;
    const before = fx.compiled.plan(1280).frame(1).length;
    m.steps[0].facts.push({ k: "hide", ids: [id], src: { line: 1 } });
    const st = stepStates(m); expect(st[1].things[id].visible).toBe(false);
    expect(planOf(m, 1280).frame(1).length).toBeLessThan(before);
  });
  test("the camera frames what a step shows", () => {
    const fx = ALL.find((f) => f.name === "05#0")!, p = fx.compiled.plan(1280);
    const r = p.focus(2); expect(r.w * r.h).toBeGreaterThan(0);
    expect(fx.compiled.motions[2].touched.length).toBeGreaterThan(0);
  });
  test("a part is never named to a reader", () => {
    for (const fx of ALL) {
      const text = fx.compiled.llm();
      for (const id of partIds(fx.compiled)) expect(text.includes(id), `${fx.name} ${id}`).toBe(false);
      expect(fx.compiled.problems.filter((p) => partIds(fx.compiled).some((id) => p.msg.includes(id)))).toEqual([]);
    }
  });
  test("the timeline is as wide as its parent gives it", () => {
    const fx = ALL.find((f) => f.name === "05#0")!, m = fx.compiled.model;
    const ctx: LayoutCtx = { width: 1280, phone: false, look: "stage", measure: (t, f) => measure(t, f), wrap: (t, w, f, x) => wrap(t, w, f, x), child: () => { throw new Error("none"); }, problem: () => {} };
    const placed = Timeline.place({ model: m, states: fx.compiled.states, container: null, members: [], regions: [], avail: 520 }, ctx);
    expect(placed.w).toBe(520);
    const maxX = Math.max(...placed.decor(1).filter((p) => p.k === "rect").map((p) => (p.k === "rect" ? p.rect.x + p.rect.w : 0)));
    expect(maxX).toBeLessThanOrEqual(520);
  });
});

describe("no two primitives of a frame share a key (React draws keys once)", () => {
  for (const fx of fences(["timeline", "sheet", "wrap", "track", "grid"])) test(fx.name, () => {
    for (const w of [1280, 390]) {
      const p = fx.compiled.plan(w);
      for (let k = 0; k <= fx.compiled.model.steps.length; k++) {
        const keys = p.frame(k).map((x) => x.key);
        expect(keys.filter((x, i) => keys.indexOf(x) !== i), `${fx.name} ${w} step ${k}`).toEqual([]);
      }
    }
  });
});
