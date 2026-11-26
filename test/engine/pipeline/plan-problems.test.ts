// What a layout refuses or warns about while it places things (ctx.problem) reaches the block's doccheck: the
// compiled block's problems gain each one once, with its line, when a plan is made; tryEngine refuses a block whose
// layout refused it.
import { afterAll, describe, expect, test } from "bun:test";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { compile } from "../../../src/engine/pipeline";
import { engineSrcOf } from "../../../src/engine/bridge";
import { LAYOUT } from "../../../src/engine/layouts/index";
import type { LayoutPlugin } from "../../../src/engine/types";

const free = LAYOUT.free as LayoutPlugin;
const says = (warn: boolean): LayoutPlugin => ({ ...free, place: (i, ctx) => { ctx.problem({ line: 6, msg: "the layout says so", ...(warn ? { warn: true } : {}) }); return free.place(i, ctx); } });
afterAll(() => { (LAYOUT as Record<string, LayoutPlugin>).free = free; });
const page = (n: number) => `---\ntitle: plan problems ${n}\n---\n\n\`\`\`animation layout=free\nbox a "A" pos=1,1\nbox b "B" pos=2,1\n@step One.\nhighlight a\n@step Two.\nhighlight b\n\`\`\`\n`;
const block = (n: number) => parse(page(n), { path: "p.dh.md" }).blocks.find((b: any) => b.type === "animation") as any;

describe("a layout's problems reach the doccheck", () => {
  test("a warning is added once, with its line, at any number of widths", () => {
    (LAYOUT as Record<string, LayoutPlugin>).free = says(true);
    const c = compile(engineSrcOf(block(1)));
    c.plan(1000); c.plan(390); c.plan(1000);
    expect(c.problems.filter((p) => p.msg === "the layout says so")).toEqual([{ line: 6, msg: "the layout says so", warn: true }]);
  });
  test("a refusal from a layout refuses the block", () => {
    (LAYOUT as Record<string, LayoutPlugin>).free = says(false);
    const t = tryEngine(block(2));
    expect(t.c).toBeNull();
    expect(t.err).toContain("line 6: the layout says so");
  });
});

describe("a step past either end", () => {
  test("frame, rects, caption and focus give the nearest real step", () => {
    (LAYOUT as Record<string, LayoutPlugin>).free = free;
    const c = compile(engineSrcOf(block(3)));
    const p = c.plan(1000), last = c.states.length - 1;
    expect(p.frame(last + 1)).toEqual(p.frame(last));
    expect(p.frame(-1)).toEqual(p.frame(0));
    expect(p.rects(last + 5)).toEqual(p.rects(last));
    expect(p.caption(last + 1)).toEqual(p.caption(last));
    expect(p.focus(99)).toEqual(p.focus(last));
  });
});
