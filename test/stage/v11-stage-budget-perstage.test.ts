// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Each stage compiles and lays out on a budget of its own (site/src/stage.tsx fresh, tools/stage.ts STAGE_WORK): a page
// of many stages, laid out again and again (every resize), never drains one budget; a runaway source is still refused.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Stage, stageWork as fresh } from "../../src/ui/stage";
import { UI } from "../../src/ui/ui";
import { parseDoc, allParts } from "../../src/core/dh-lib";
import { isStagePart, stageSrc } from "../../src/core/stage-part";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, docBudget, newBudget, BudgetError, DOC_WORK } from "../../src/core/stage-budget";

const draw = (p: any) => renderToStaticMarkup(React.createElement(Stage, { src: stageSrc(p), roles: (p as any).stageRoles?.roles ?? {}, ui: UI.en }));
const formatStages = () => allParts(parseDoc("parts.dh.md", readFileSync(join(import.meta.dir, "samples/format-stages.dh.md"), "utf8")).body).filter(isStagePart);

const W7 = [326, 341, 356, 380, 734, 990, 1178];
describe("a page of many stages", () => {
  test("the Format page lays every stage out at 7 widths six times over (as many resizes) in one module: more work than one page's budget, and no stage is refused", () => {
    const stages = formatStages();
    expect(stages.length).toBeGreaterThan(30);
    const models = stages.map((p) => { const s = stageSrc(p); return fresh(() => compileStage(s.head, s.steps, s.base, s.info, (p as any).stageRoles?.roles ?? {}).model); });
    beginDocument(newBudget());
    const before = docBudget().left().work;
    let spent = 0;
    for (let round = 0; round < 6; round++) for (const m of models) spent += fresh(() => { for (const w of W7) layoutStage(m, w); return STAGE_WORK - docBudget().left().work; });
    expect(spent).toBeGreaterThan(DOC_WORK); // the same layouts on one shared page budget would run out
    expect(docBudget().left().work).toBe(before); // and none of it came out of the page's budget
  }, 120_000);
  test("the server draws every stage of the Format page, none refused, spending nothing of the page's budget", () => {
    beginDocument(newBudget());
    const before = docBudget().left().work;
    for (const p of formatStages()) { const html = draw(p); expect(html).not.toContain("stg-over"); expect(html).toContain("stg-plan"); }
    expect(docBudget().left().work).toBe(before);
  }, 120_000);
});

describe("a runaway stage", () => {
  test("work over one stage's cap is refused inside that stage's own budget, and the page's budget is untouched", () => {
    beginDocument(newBudget());
    const before = docBudget().left().work;
    expect(() => fresh(() => docBudget().charge("stage layout", STAGE_WORK + 1))).toThrow(BudgetError);
    expect(() => fresh(() => docBudget().charge("stage items", 1, STAGE_MEMORY + 1))).toThrow(BudgetError);
    expect(fresh(() => { docBudget().charge("stage layout", STAGE_WORK); return docBudget().left().work; })).toBe(0);
    expect(docBudget().left().work).toBe(before);
  });
  test("the caps hold the heaviest measured stage four times over", () => {
    expect(STAGE_WORK).toBeGreaterThanOrEqual(4 * 770_018);
    expect(STAGE_MEMORY).toBeGreaterThanOrEqual(4 * 728_240);
  });
});
