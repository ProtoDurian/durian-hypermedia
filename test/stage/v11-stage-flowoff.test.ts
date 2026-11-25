// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 sfix: 'flow: off' changes only the moving dot on arrows, never a fill or a look (a scene: it dropped the
// connectors' class, so their lines and heads drew at full strength: a second fill for the role, palette point 7)
import { expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { Stage } from "../../src/ui/stage";
import { UI } from "../../src/ui/ui";
import { beginDocument } from "../../src/core/stage-budget";

const ROLES = { pod: 1, eval: 2, store: 3 };
const html = (head: string, steps: [string, string][]) => { beginDocument(); return renderToString(React.createElement(Stage, { src: { head, steps: steps.map(([title, raw], i) => ({ title, raw, line: 20 + i })), base: 1, info: {} }, roles: ROLES, ui: UI.en })); };
const HEAD = "title: Merger | x\n## Pods\npod p1, p2: pod 1; pod 2 | pushes\n## Eval\neval ev: evaluator | runs rules\n## Store\nstore db: store | keeps\n";
const STEPS: [string, string][] = [["One", "p1 --> ev\np2 --> ev"], ["Two", "ev -> db: writes"]];

test("the page is the same with and without 'flow: off', but for the moving dots", () => {
  const on = html(HEAD, STEPS), off = html(HEAD.replace("title: Merger | x\n", "title: Merger | x\nflow: off\n"), STEPS);
  expect(on).toMatch(/class="stg-dot"/);
  expect(off).not.toMatch(/class="stg-dot"/);
  expect(off).toBe(on.replace(/<circle class="stg-dot"[^>]*>(<\/circle>)?/g, ""));
});

test("every fill and stroke a role uses is the same set with and without 'flow: off'", () => {
  const paints = (s: string) => [...new Set([...s.matchAll(/(?:fill|stroke):([^;"]+)/g)].map((m) => m[1].trim()))].sort();
  const on = html(HEAD, STEPS).replace(/<circle class="stg-dot"[^>]*>(<\/circle>)?/g, ""), off = html(HEAD.replace("title: Merger | x\n", "title: Merger | x\nflow: off\n"), STEPS);
  expect(paints(off)).toEqual(paints(on));
  // each connector keeps the connectors' look (its idle strength) either way
  expect((off.match(/stg-edge stg-conn/g) ?? []).length).toBe((on.match(/stg-edge stg-conn/g) ?? []).length);
});
