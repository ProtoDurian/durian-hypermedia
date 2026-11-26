// hydrate: the server draws a stage's plans (ENG_SSR_W, 6 of the SSR_W widths, and PRINT_W) inside a Suspense boundary; the browser's first render
// lays none of them out (the boundary stays dehydrated, React keeps the server's HTML) and draws its live plan once it
// has measured its width. A phone used to lay out and hydrate all 15 plans of every stage (87 stages: minutes).
import { afterAll, beforeAll, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import { EngineStage, ENG_SSR_W } from "../../../src/engine/render/svg";
import { buildCss } from "../../../scripts/build-css";
import { SSR_W, screenPlanWidth } from "../../../src/ui/stage";
import { UI } from "../../../src/ui/ui";
import { fencesOf, ROOT } from "../parse/fixtures";
import { useStandin } from "./standin";

let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());

const counted = () => {
  const c = compile(fencesOf(join(ROOT, "fixtures/stage/01-animation-a-composed-stage.dh.md"))[0].src);
  const plan = c.plan.bind(c), widths: number[] = [];
  c.plan = (w: number) => { widths.push(w); return plan(w); };
  return { c, widths };
};

test("the server draws each of its plan widths once (6 screen widths and print, not 15), inside one whole Suspense boundary", () => {
  const { c, widths } = counted();
  const html = renderToString(<EngineStage compiled={c} ui={UI.en} />);
  expect(widths.length).toBe(ENG_SSR_W.length + 1);
  expect(html.match(/stg-plan-ssr/g)?.length).toBe(ENG_SSR_W.length + 1);
  const box = html.slice(html.indexOf("stg-box-wrap"));
  expect(box).toMatch(/^[^>]*><!--\$--><div class="stg-plan stg-plan-ssr eng-plan-ssr" data-ew="286"/); // a boundary the client can keep as it is
  expect(box).toContain('data-print="true"');
});

test("the browser's first render lays out none of the server's plans (they stay the server's HTML)", () => {
  const { c, widths } = counted();
  const g = globalThis as any, had = "window" in g, old = g.window;
  g.window = g;
  try {
    const html = renderToString(<EngineStage compiled={c} ui={UI.en} />);
    expect(widths).toEqual([]);
    expect(html).not.toContain("stg-plan-ssr");
    expect(html).toContain('data-engine="12"');
  } finally { if (had) g.window = old; else delete g.window; }
});

test("the server's widths are plans the client picks itself (phones 320 to 430 px, a tablet, a desktop), and the CSS shows each from where the client picks it", () => {
  for (const w of ENG_SSR_W) expect(SSR_W as readonly number[]).toContain(w);
  // the stage box at a 320, 375, 390, 414 and 430 px phone (32 px gutters, 2 px border), a 768 px tablet, a desktop
  for (const box of [286, 341, 356, 380, 396, 734, 1178]) expect(ENG_SSR_W as readonly number[]).toContain(screenPlanWidth(box));
  const css = buildCss();
  expect(css).toContain('.dh-doc .eng-plan-ssr[data-ew="286"] { display: block; }');
  for (let i = 1; i < ENG_SSR_W.length; i++) {
    const at = ENG_SSR_W[i] === 1178 ? 1063 : ENG_SSR_W[i]; // where screenPlanWidth reaches the width
    expect(screenPlanWidth(at)).toBe(ENG_SSR_W[i]); expect(screenPlanWidth(at - 1)).toBeLessThan(ENG_SSR_W[i]);
    expect(css).toContain(`@container stgbox (min-width: ${at}px) {\n.dh-doc .eng-plan-ssr[data-ew="${ENG_SSR_W[i - 1]}"] { display: none; }\n.dh-doc .eng-plan-ssr[data-ew="${ENG_SSR_W[i]}"] { display: block; }\n}`);
  }
});

test("the server draws the camera buttons too, off until the live plan, so the bar keeps its height when the stage hydrates", () => {
  const { c } = counted();
  const html = renderToString(<EngineStage compiled={c} ui={UI.en} />);
  const ctl = html.match(/<span class="stg-ctl"[^]*?<\/span>/)?.[0] ?? "";
  expect(ctl.match(/<button[^>]*disabled=""/g)?.length).toBe(3);
});

test("before its plan the stage draws both hints and the CSS shows the phone's short one where the plan will be a phone plan", () => {
  const { c } = counted();
  const html = renderToString(<EngineStage compiled={c} ui={UI.en} />);
  expect(html).toContain(`<span class="eng-hint-wide">${UI.en.hintOff}</span><span class="eng-hint-phone">${UI.en.hintShort ?? UI.en.hintOff}</span>`);
  // a phone plan is a plan under 480 px: a drawing box under 500 px; the hint line is 24 px narrower than the box
  expect(screenPlanWidth(499)).toBeLessThan(480); expect(screenPlanWidth(500)).toBeGreaterThanOrEqual(480);
  expect(buildCss()).toContain("@container enghint (max-width: 475.9px) {\n.dh-doc .eng .eng-hint-wide { display: none; }");
});
