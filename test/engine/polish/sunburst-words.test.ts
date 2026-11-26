// eng-polish: the words on a sunburst's arcs on a phone. Every name drawn lies wholly inside its own arc (so no word crosses the
// centre or the next arc) and is the whole name or ends with "…"; the rule is the old chart-kinds one (along the ring, else along the
// arc, else cut with an ellipsis, else left out). The test works the geometry out itself from the layout, not from the code under test.
import { describe, expect, test } from "bun:test";
import { Budget } from "../../../src/core/budget";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { parseChartKinds } from "../../../src/parts/chart-kinds/part";
import { LIMITS } from "../../../src/parts/chart-kinds/limits";
import { sunburstLayout } from "../../../src/parts/chart-kinds/layout";
import { KINDS, kindBuild, kindHeight, specOfView } from "../../../src/engine/charts/kinds";
import { arcWord } from "../../../src/engine/charts/kinds/sunburst";
import { rotOf } from "../../../src/engine/charts/rot";
import type { Prim, Rect } from "../../../src/engine/types";

void KINDS;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const FENCES: Record<string, string> = {
  names: `kind: sunburst
title: Lines of code by team and area
data:
  - name: Platform
    children:
      - { name: Runtime, value: 93 }
      - { name: Storage, value: 66 }
  - name: Product
    children:
      - { name: Web, value: 95 }
      - { name: Mobile, value: 69 }
  - { name: Docs, value: 18 }
`,
  long: `kind: sunburst
depth: 3
data:
  - name: Infrastructure services
    children:
      - { name: Storage engine team, value: 40 }
      - { name: Observability, value: 25 }
      - { name: Scheduler, value: 9 }
  - name: Customer facing products
    children:
      - { name: Checkout, value: 55 }
      - { name: Recommendations, value: 12 }
  - { name: Documentation, value: 18 }
  - { name: Q, value: 3 }
`,
};
const draw = (src: string, w: number, zoom = 0) => {
  setPhoneFont(w < 480);
  const d = parseChartKinds(src, 1, 1, LIMITS, big());
  const v = d.steps[0].view;
  if (v.kind !== "sunburst") throw new Error("kind");
  const { spec } = specOfView(v, { zoom });
  const h = kindHeight(spec, w), rect: Rect = { x: 10, y: 7, w, h };
  const ctx = { phone: w < 480, look: "stage" as const, measure, step: 0, prev: null, max: [], lit: [], zoom };
  return { v, rect, built: kindBuild(spec, rect, ctx) };
};

/** is the point inside the slice (radii r0..r1, angles a0..a1 clockwise from the top)? */
function inSlice(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, x: number, y: number): boolean {
  const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
  if (r < r0 || r > r1) return false;
  if (a1 - a0 >= Math.PI * 2 - 1e-3) return true;
  const d = (((Math.atan2(dx, -dy) - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return d <= a1 - a0;
}

for (const [name, src] of Object.entries(FENCES)) for (const w of [320, 360, 390, 430, 1280]) describe(`sunburst words: ${name} at ${w}`, () => {
  test("every name is whole inside its own arc or ends with an ellipsis; nothing is cut by the centre or the next arc", () => {
    const { v, rect, built } = draw(src, w);
    const size = Math.max(40, Math.min(rect.w, rect.h, 460)), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, R = size / 2 - 4;
    const r0 = R * 0.26;
    const arcs = sunburstLayout(v.nodes, 0, v.depth, new Budget({ steps: 1e12, values: 1e12, chars: 1e12 }));
    const ring = (R - r0) / Math.max(1, Math.min(v.depth, Math.max(...arcs.map((a) => a.ring)))); // charts2: the rings the tree really has
    let drawn = 0;
    for (const a of arcs) {
      const p = built.prims.find((q) => q.key === `arc:${a.id}:n`) as Extract<Prim, { k: "text" }> | undefined;
      if (!p) continue;
      drawn++;
      const full = v.nodes[a.id].name, text = p.lines[0];
      expect(text === full || (text.endsWith("…") && full.startsWith(text.slice(0, -1)) && text.length >= 3)).toBe(true);
      const rin = r0 + (a.ring - 1) * ring, rout = r0 + a.ring * ring;
      // the letters as a box (cap height above the baseline, descenders below it) in the word's own frame, turned about the anchor as it is drawn
      const tw = measure(text, "small-b"), t = (rotOf(p.cls) * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t);
      for (let i = 0; i <= 16; i++) for (const oy of [-9, -3, 2.5]) {
        const ox = (i / 16 - 0.5) * tw;
        const x = p.x + ox * co - oy * si, y = p.y + ox * si + oy * co;
        expect(inSlice(cx, cy, rin, rout, a.a0, a.a1, x, y)).toBe(true);
      }
    }
    expect(drawn).toBeGreaterThan(0);
  });
});

test("the sample sunburst on a phone: every name is drawn, whole (the v0.7.0 phone case: Platform and Product)", () => {
  const { v, built } = draw(FENCES.names, 390);
  for (const n of v.nodes.slice(1)) {
    const p = built.prims.find((q) => q.key === `arc:${n.id}:n`) as Extract<Prim, { k: "text" }> | undefined;
    expect(p?.lines[0]).toBe(n.name);
  }
});

describe("arcWord, the rule itself", () => {
  const m = (s: string) => measure(s, "small-b");
  const at = (name: string, rin: number, rout: number, a0: number, a1: number) => { setPhoneFont(true); return arcWord(name, m, 200, 200, rin, rout, a0, a1); };
  test("a word that fits level or along the ring is whole; a short ring with a long arc lays the word along the arc", () => {
    expect(at("Web", 90, 170, 0.3, 1.4)?.text).toBe("Web");
    // a ring 38 px wide and an arc 160 px long at the right of the chart: "Platform" cannot go along the ring, but fits along the arc
    const w = at("Platform", 60, 98, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9);
    expect(w?.text).toBe("Platform");
  });
  test("a word that fits neither way is cut with an ellipsis, and one with no room is left out", () => {
    const cut = at("Infrastructure services", 60, 98, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5);
    expect(cut === null || cut.text.endsWith("…")).toBe(true);
    expect(at("Docs", 60, 70, 0.1, 0.12)).toBeNull();
  });
  test("a word along the arc is turned the way that reads upright (never upside down)", () => {
    for (let a = 0.2; a < 6.2; a += 0.4) {
      const r = at("Platform", 60, 98, a - 0.6, a + 0.6);
      if (r) expect(Math.abs(r.turn)).toBeLessThanOrEqual(180);
      if (r && r.turn) expect(Math.cos((r.turn * Math.PI) / 180)).toBeGreaterThan(-1e-9);
    }
  });
});
