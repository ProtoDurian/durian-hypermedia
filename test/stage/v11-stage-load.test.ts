// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// The server and client use the same plan across the screen-width range.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Stage, SSR_W, screenPlanWidth, PRINT_FLOOR, PRINT_W } from "../../src/ui/stage";
import { UI } from "../../src/ui/ui";
import { beginDocument, BudgetError, docBudget, newBudget } from "../../src/core/stage-budget";

const ROLES = { pod: 1, eval: 2, store: 3 };
const renderStage = (head: string, steps: [string, string][]) => renderToString(React.createElement(Stage, { src: { head, steps: steps.map(([title, raw], i) => ({ title, raw, line: 20 + i })), base: 1, info: {} }, roles: ROLES, ui: UI.en }));
const html = (head: string, steps: [string, string][]) => { beginDocument(); return renderStage(head, steps); };
const HEAD = "title: Merger | x\n## Pods\npod p1, p2: pod 1; pod 2 | pushes\n## Eval\neval ev: evaluator | runs rules\n## Store\nstore db: store | keeps\n";
const STEPS: [string, string][] = [["One", "p1 --> ev\np2 --> ev"], ["Two", "ev -> db: writes"]];

test("the phone reference sizes, the 800 px drawing box and the desktop keep their native plan", () => {
  const widths = [286, 326, 341, 356, 380, 800, 1178];
  expect(widths.map(screenPlanWidth)).toEqual(widths);
});

const switchWidth = (narrow: number, wide: number) => (wide <= 380 || (wide >= 730 && wide <= 968)) ? wide : Math.round(2 * narrow * wide / (narrow + wide));

test("a phone between 320 and 430 px never shrinks its drawing", () => {
  // The drawing box has 32 px of gutters and a 2 px border.
  for (let viewport = 320; viewport <= 430; viewport++) {
    const boxWidth = viewport - 34;
    expect(screenPlanWidth(boxWidth)).toBeLessThanOrEqual(boxWidth);
  }
});

test("the screen plan always scales between 0.90 and 1.10 from 286 to 1280 px", () => {

  const check = (width: number, plan: number) => {
    expect(width * 100).toBeGreaterThanOrEqual(plan * 90);
    expect(width * 100).toBeLessThanOrEqual(plan * 110);
  };
  for (let width = 286; width <= 1280; width++) check(width, screenPlanWidth(width));
  for (let i = 1; i < SSR_W.length; i++) {
    const narrow = SSR_W[i - 1], wide = SSR_W[i];
    const boundary = switchWidth(narrow, wide);
    // Check both limits at the switch, including fractional widths just before it.
    check(boundary, narrow);
    check(boundary, wide);
    expect(screenPlanWidth(boundary - 0.01)).toBe(narrow);
    expect(screenPlanWidth(boundary)).toBe(wide);
  }
});

test("the server paints one plan per width, in order, each laid out at its own width", () => {
  const h = html(HEAD, STEPS);
  const plans = [...h.matchAll(/<div class="stg-plan stg-plan-ssr" data-w="(\d+)"><svg[^>]*viewBox="0 0 (\d+) /g)];
  expect(plans.map((m) => +m[1])).toEqual([...SSR_W]);
  expect(plans.map((m) => +m[2])).toEqual([...SSR_W]);
});

test("stage.css switches server drawings at the same widths as the browser", () => {
  const css = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8");
  expect(css).toContain("container: stgbox / inline-size");
  expect(css).toContain(`.stg-plan-ssr[data-w="${SSR_W[0]}"] { display: block; }`);
  for (let i = 1; i < SSR_W.length; i++) expect(css).toContain(`@container stgbox (min-width: ${switchWidth(SSR_W[i - 1], SSR_W[i])}px) { .stg-plan-ssr[data-w="${SSR_W[i - 1]}"] { display: none; } .stg-plan-ssr[data-w="${SSR_W[i]}"] { display: block; } }`);
  expect(css).not.toMatch(/stg-plan-(wide|narrow)/);
});

test("weight: a stage's server markup stays under its cap", () => {
  const h = html(HEAD, STEPS);
  expect(h.length).toBeLessThan(6_000 * (SSR_W.length + 1));
  // each plan costs about the same: no plan is drawn twice
  const each = h.split('<div class="stg-plan stg-plan-ssr"').slice(1).map((p) => p.length);
  expect(each.length).toBe(SSR_W.length + 1); // and the print plan
});

// the package hydrates by drawing the server's plans again (no HTML-string sink in its strict entry)
test.skip("hydrating, the browser keeps the server's plans as drawn: no layout at the server's widths (one layout per stage, so the plans never charge the page's budget once per plan)", () => {
  const g = globalThis as { document?: unknown };
  const had = "document" in g, keep = g.document;
  g.document = {};
  try {
    beginDocument();
    const src = { head: HEAD, steps: STEPS.map(([title, raw], i) => ({ title, raw, line: 20 + i })), base: 1, info: {} };
    // the hydrating render: the screen and print plan boxes, each empty (React adopts the server's markup inside them), and no drawing made
    const h = renderToString(React.createElement(Stage, { src, roles: ROLES, ui: UI.en, hydrate: true }));
    const plans = [...h.matchAll(/<div class="stg-plan stg-plan-ssr" data-w="(\d+)"><\/div>/g)].map((m) => +m[1]);
    expect(plans).toEqual([...SSR_W]);
    expect(h).not.toContain("<svg");
    // a fresh render in the browser (print, an island with no server markup) still draws
    const fresh = renderToString(React.createElement(Stage, { src, roles: ROLES, ui: UI.en }));
    expect(fresh).toContain("<svg");
  } finally { if (had) g.document = keep; else delete g.document; }
});

test("stages on the server and in the browser neither inherit nor spend the page's document budget (each has its own, STAGE_WORK)", () => {
  const previous = docBudget();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    const page = beginDocument(newBudget(0, 0));
    expect(renderStage(HEAD, STEPS)).toContain("stg-plan-ssr");
    expect(page.left()).toEqual({ work: 0, memory: 0 });

    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    const outer = beginDocument(newBudget(0, 0));
    const sheet = 'sheet: Kilns\npod k0: kiln east | two probes\n  eval pa "Probe A": 1, 2\n  eval pb "Probe B": 3, 4\n=> store out: the yard | adds';
    expect(renderStage(sheet, [["One", "value pa pb: last first | 57, gone one (bad struck)"]])).toContain("stg-struck-line");
    expect(renderStage(HEAD, STEPS)).toContain("stg-plan-ssr");
    expect(docBudget()).toBe(outer);
    expect(outer.left()).toEqual({ work: 0, memory: 0 });
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    beginDocument(previous);
  }
});

test("a phone's stage buttons are 32 px tall, the control buttons and the step buttons (the phone rule comes after the base rule, so it wins)", () => {
  const css = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8");
  const h = (rule: string) => +(/min-height: (\d+)px/.exec(rule)?.[1] ?? NaN);
  // the phone block (max-width 560): its control-button rule
  const p560 = css.indexOf("@media (max-width: 560px) {"), ctl = css.indexOf("\n  .stg-btn {", p560);
  expect(p560).toBeGreaterThan(0); expect(ctl).toBeGreaterThan(p560);
  expect(h(css.slice(ctl, css.indexOf("}", ctl)))).toBeGreaterThanOrEqual(32);
  // the step buttons' phone rule, after their base rule (the same weight: the later one wins)
  const base = css.indexOf("\n.stg-stepbtn {"), step = css.indexOf("@media (max-width: 720px) { .stg-stepbtn {");
  expect(base).toBeGreaterThan(0); expect(step).toBeGreaterThan(base);
  expect(h(css.slice(step, css.indexOf("}", step + 30)))).toBeGreaterThanOrEqual(32);
});

test("print: a stage's drawing shrinks to fit its sheet no further than PRINT_FLOOR, which keeps an 11 px word at 8 pt (23 Nov); its box floor and its one-sheet need use it", () => {
  expect(11 * 0.75 * PRINT_FLOOR).toBeGreaterThanOrEqual(8);
  expect(PRINT_FLOOR).toBe(0.97);
  const tsx = readFileSync(join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8");
  expect(tsx).toContain('"--stg-boxmin": `${Math.ceil(pp.h * PRINT_FLOOR)}px`');
  expect(tsx).toContain('"--stg-need": `${Math.ceil(pp.h * PRINT_FLOOR) + 160}px`');
  expect(tsx).not.toContain("h * 0.935");
});

// 23 Nov: a stage printed before its turn to hydrate (the hydration order can keep it waiting for seconds), or with
// scripts off, printed from the server's HTML: no print height, the print rule capped it at the sheet, and its drawing
// ran over the text below. The server now draws a plan at PRINT_W too, shown only in print, and writes its sizes.
test("print before hydration: the server's PRINT_W plan, shown only on paper, sets the stage's print sizes and box shape", () => {
  const h = html(HEAD, STEPS);
  const m = h.match(/<div class="stg-plan stg-plan-ssr" data-w="(\d+)" data-print="true"><svg[^>]*viewBox="0 0 (\d+) (\d+)"/);
  expect(m).not.toBeNull();
  expect([+m![1], +m![2]]).toEqual([PRINT_W, PRINT_W]);
  const ph = +m![3];
  const style = h.match(/<div class="stg[^"]*" style="([^"]*)"/)![1];
  expect(style).toContain(`--stg-boxmin:${Math.ceil(ph * PRINT_FLOOR)}px`);
  expect(style).toContain(`--stg-need:${Math.ceil(ph * PRINT_FLOOR) + 160}px`);
  expect(h).toMatch(new RegExp(`class="stg-box-wrap stg-ratio-print"[^>]*style="--stg-ar:${PRINT_W} / ${ph}"`));
  expect(h).not.toContain("<style");
  const tsx = readFileSync(join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8");
  expect(tsx).toContain('cssVars({ "--stg-ar"'); // the shared helper (src/ui/css-vars.ts): custom properties through React's style prop
  // the package draws the server's plans again when it hydrates (no HTML-string placeholder): the print plan is the last one drawn
  expect(tsx).toContain("plans.map((p, i) => <div key={i} className=\"stg-plan stg-plan-ssr\" data-w={SSR_W[i] ?? PRINT_W} data-print={i === SSR_W.length || undefined}>");
  const css = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8");
  expect(css).toContain("@media not print { .stg-plan-ssr[data-print] { display: none !important; } }");
  expect(css).toContain("@media print { .stg-plan-ssr:not([data-print]) { display: none !important; } .stg-plan-ssr[data-print] { display: block !important; } }");
  expect(css).toContain(".stg > .stg-box-wrap.stg-ratio-print { aspect-ratio: var(--stg-ar); }");
});

test("a tablet between 768 and 1024 px never shrinks its stage drawing", () => {
  for (let viewport = 768; viewport <= 1024; viewport++) {
    const boxWidth = viewport - 34;
    expect(screenPlanWidth(boxWidth)).toBeLessThanOrEqual(boxWidth);
  }
});
