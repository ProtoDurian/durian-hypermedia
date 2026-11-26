// Lane render: the renderer draws real models (fixtures through the pipeline), server side, step 1 whole.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import { EngineStage } from "../../../src/engine/render/svg";
import { UI } from "../../../src/ui/ui";
import { fencesOf, ROOT } from "../parse/fixtures";
import { useStandin } from "./standin";

let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
const FIX = [
  "format/48-animation-binary-search-tree-insert", "format/50-animation-sharding-then-rebalancing", "format/51-animation-replicas-and-failover",
  "stage/01-animation-a-composed-stage", "stage/15-animation-cards-inside-cards",
];
const ui = (UI as any).en ?? Object.values(UI as any)[0];
describe("render: fixtures draw through the engine", () => {
  for (const f of FIX) test(f, () => {
    const fences = fencesOf(join(ROOT, "fixtures", f + ".dh.md"));
    expect(fences.length).toBeGreaterThan(0);
    for (const fe of fences) {
      const c = compile(fe.src);
      for (const w of [1180, 390]) { const p = c.plan(w); for (let k = 0; k < c.states.length; k++) expect(Array.isArray(p.frame(k))).toBe(true); }
      const html = renderToString(<EngineStage compiled={c} ui={ui} />);
      expect(html).toContain('data-engine="12"');
      expect(html).toContain("stg-plan-ssr");
      expect(html).toContain('data-step="1"');
    }
  });
});

test("fixture 93: marks in captions, speech and notes draw as code, bold and italic, never raw", () => {
  const fe = fencesOf(join(ROOT, "fixtures/format/93-animation-inline-marks.dh.md"))[0];
  const html = renderToString(<EngineStage compiled={compile(fe.src)} ui={UI.en} />);
  expect(html).toContain("<code>task gen</code>");
  expect(html).toContain("<strong>never</strong>");
  expect(html).not.toContain("`task gen`");
});
