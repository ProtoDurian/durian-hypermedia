// A still or static scene's stage height is in the server's HTML (nothing moves on load): its heights, one per layout it
// takes, are custom properties in the part's style attribute (React's style prop: no <style> element, no HTML string,
// strict Trusted Types stays 0), and a fixed stylesheet picks the one for the stage's width with container queries.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Animation } from "../src/ui/anim";
import { UI } from "../src/ui/ui";
import { compileScene } from "../src/core/scene";
import { WHOLE_WS, wholeAspect, wholeHeightCss as wholeHeightCss0, wholeHeightPx, wholeHeightVars, wholeLayout, wholeSize, layoutWidth } from "../src/core/whole";

const ROOT = join(import.meta.dir, "..");
// six boxes side by side: one row on a laptop, too wide for a phone (it turns there), so two heights
const ROW = Array.from({ length: 6 }, (_, k) => `box b${k} "service ${k}"`).join("\n");
const draw = (head: string, st?: string) => renderToString(React.createElement(Animation, { src: { head, steps: [], base: 1, info: {} }, ui: UI.en, srText: null, static: st }));
const varsOf = (html: string) => {
  const m = html.match(/<div[^>]*class="scn[^"]*"[^>]*style="([^"]*)"/);
  return m ? Object.fromEntries(m[1].split(/;(?![^(]*\))/).map((d) => d.split(/:(.*)/s).map((x) => x.trim())).filter(([k]) => k)) : {};
};

describe("a still scene's height is in the server's HTML", () => {
  test("its heights are custom properties on the part, and there is no <style> element", () => {
    // Arrange, Act
    const h = draw(ROW);
    const v = varsOf(h);
    // Assert
    expect(h).not.toContain("<style");
    expect(h).toContain("data-wq");
    expect(v["--wh"]).toMatch(/^clamp\(/);
  });
  test("each layout width takes the layout the browser takes there (core/whole.ts wholeLayout of layoutWidth)", () => {
    const wide = compileScene(ROW, [], 1, {}), vars = wholeHeightVars(wide);
    const at = (b: number) => { const k = vars[`--wh${b}`] ?? "var(--wh)"; const m = k.match(/^var\((--wh-\w)\)$/) ?? k.match(/^var\((--wh)\)$/); return vars[m![1]]; };
    const layouts = new Set<string>();
    for (const b of WHOLE_WS) {
      const c = wholeLayout(wide, layoutWidth(b)), want = wholeHeightCss0(wholeSize(c));
      expect(at(b)).toBe(want);
      layouts.add(want);
      // the CSS height at the stage's width is the browser's own stage height (wholeAspect), to the pixel
      expect(Math.abs(wholeHeightPx(wholeSize(c), b) - b / wholeAspect(c, b))).toBeLessThan(0.5);
    }
    // the row is too wide for a phone: it lays out top to bottom there, so there are two heights
    expect(layouts.size).toBeGreaterThan(1);
  });
  test("static draws the chosen step's height", () => {
    const steps = `${ROW}\n@step one\nhighlight b0\n@step two\nadd box z "z"\nb5 -> z`;
    const [head, ...rest] = steps.split(/^@step /m);
    const src = { head, steps: rest.map((r, k) => { const [t, ...b] = r.split("\n"); return { title: t, raw: b.join("\n"), line: 10 * (k + 1) }; }), base: 1, info: {} };
    const one = renderToString(React.createElement(Animation, { src, ui: UI.en, srText: null, static: "1" }));
    const two = renderToString(React.createElement(Animation, { src, ui: UI.en, srText: null, static: "2" }));
    expect(varsOf(one)["--wh"]).toBeDefined();
    expect(varsOf(one)["--wh"]).not.toBe(varsOf(two)["--wh"]);
  });
  test("the stylesheet has one container rule per layout width, and the part is a size container", () => {
    const css = readFileSync(join(ROOT, "src/ui/parts.css"), "utf8");
    expect(css).toContain(".scn[data-wq] { container-type: inline-size; }");
    for (const b of WHOLE_WS) expect(css).toContain(`@container (min-width: ${b}px) { .scn[data-wq]:not(.is-swipe):not(.is-tall) > .scn-stage { height: var(--wh${b}, var(--wh)); } }`);
  });
  test("on a phone the part is edge to edge before any script runs (it was its column's width until anim.tsx set --page-w)", () => {
    const css = readFileSync(join(ROOT, "src/ui/parts.css"), "utf8");
    expect(css).toContain("width: var(--page-w, 100vw); max-width: var(--page-w, 100vw); margin-left: calc(-1 * var(--bleed-l, calc(50vw - 50% + var(--col-skew, 0px))));");
    // a human-only segment adds its rule and padding on the left only: half of it moves a centred column
    expect(css).toContain(".human { --col-skew: 10.5px; }");
    expect(css.indexOf("@media (max-width: 520px) { .human { --col-skew: 7.5px; } }")).toBeGreaterThan(css.indexOf(".human { --col-skew: 10.5px; }"));
  });
});
