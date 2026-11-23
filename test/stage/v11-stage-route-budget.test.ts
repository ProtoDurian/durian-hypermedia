// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// The router's work counts on the stage budget (tools/stage.ts gridRoute, the scans for a free place, each try of a wider
// gap): a scene of a few hundred connectors is refused, and shows its still form, in seconds, instead of keeping a build
// or a browser tab busy for minutes. Real pages draw as before (every plan of the 28-scene page and the Format page at the
// seven server widths is byte-identical to the layout before the router was charged).
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Stage } from "../../src/ui/stage";
import { UI } from "../../src/ui/ui";
import { compileStage, layoutStage, STAGE_WORK } from "../../src/core/stage";
import { beginDocument, docBudget, newBudget } from "../../src/core/stage-budget";
import type { StageSrc } from "../../src/ui/stage";

// 90 cards and 200 connectors in 4 steps (the same runaway as v11-stage-still.test.ts)
const runaway = (connectors: number): StageSrc => {
  const head = ["title: Runaway | too much for one stage"];
  for (let l = 0; l < 6; l++) { head.push(`## Lane ${l}`); for (let i = 0; i < 15; i++) head.push(`client c${l}x${i}: card ${l} ${i} | a line`); }
  const ids = Array.from({ length: 90 }, (_, k) => `c${Math.floor(k / 15)}x${k % 15}`), per = Math.ceil(connectors / 4);
  return { head: head.join("\n"), base: 1, info: {}, steps: [1, 2, 3, 4].map((s) => ({ title: `Round ${s}: messages fly in round ${s}.`, line: 200 + s,
    raw: Array.from({ length: per }, (_, e) => [ids[(s * 7 + e * 13) % 90], ids[(s * 11 + e * 17 + 5) % 90]]).filter(([x, y]) => x !== y).map(([x, y], e) => `${x} -> ${y}: m${e}`).join("\n") })) } as StageSrc;
};

test("a scene of 200 connectors is refused well under 5 s and shows its still form", () => {
  beginDocument(newBudget());
  const t0 = performance.now();
  const html = renderToStaticMarkup(React.createElement(Stage, { src: runaway(200), roles: { client: 1 }, ui: UI.en }));
  const ms = performance.now() - t0;
  expect(html).toContain("data-stage-over");
  expect(html).not.toContain("stg-i");
  expect(ms).toBeLessThan(5000);
}, 60_000);

test("routing counts: a phone plan of 100 connectors charges more than one plan's budget", () => {
  const src = runaway(100);
  beginDocument(newBudget(1e12, 1e12));
  const m = compileStage(src.head, src.steps, 1, {}, { client: 1 }).model;
  beginDocument(newBudget(1e15, 1e15));
  const before = docBudget().left().work;
  layoutStage(m, 326);
  expect(before - docBudget().left().work).toBeGreaterThan(STAGE_WORK);
}, 120_000);
