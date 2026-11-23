// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// A stage over its budget never leaves the page blank: it shows its still form (its title, a message naming the stage
// layout budget and the fix, every step in words) and every other stage on the page draws (site/src/stage.tsx StageOver).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Stage, STAGE_OVER_MESSAGE, type StageSrc } from "../../src/ui/stage";
import { UI } from "../../src/ui/ui";
import { parseDoc, allParts } from "../../src/core/dh-lib";
import { isStagePart, stageSrc } from "../../src/core/stage-part";
import { beginDocument, newBudget } from "../../src/core/stage-budget";

// a runaway: 90 cards and 200 connectors (every card and line cap holds), 4 steps; its first phone plan needs far more
// than one plan's budget (STAGE_WORK) for routing and is refused in about a second
const runaway = (connectors: number): StageSrc => {
  const head = ["title: Runaway | too much for one stage"];
  for (let l = 0; l < 6; l++) { head.push(`## Lane ${l}`); for (let i = 0; i < 15; i++) head.push(`client c${l}x${i}: card ${l} ${i} | a line`); }
  const ids = Array.from({ length: 90 }, (_, k) => `c${Math.floor(k / 15)}x${k % 15}`), per = Math.ceil(connectors / 4);
  return { head: head.join("\n"), base: 1, info: {}, steps: [1, 2, 3, 4].map((s) => ({ title: `Round ${s}: messages fly in round ${s}.`, line: 200 + s,
    raw: Array.from({ length: per }, (_, e) => [ids[(s * 7 + e * 13) % 90], ids[(s * 11 + e * 17 + 5) % 90]]).filter(([x, y]) => x !== y).map(([x, y], e) => `${x} -> ${y}: m${e}`).join("\n") })) } as StageSrc;
};
const RUNAWAY = runaway(200);

const island = (src: StageSrc, roles: Record<string, number>) => renderToStaticMarkup(React.createElement(Stage, { src, roles, ui: UI.en }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

describe("a stage over its budget", () => {
  test("a page with a runaway stage among Format page stages has no empty island: the runaway one shows its still form, every other one draws", () => {
    beginDocument(newBudget());
    // one runaway among four neighbours (every tenth Format page stage): the runaway alone costs a whole stage budget
    const stages = allParts(parseDoc("parts.dh.md", readFileSync(join(import.meta.dir, "samples/format-stages.dh.md"), "utf8")).body).filter(isStagePart).filter((_, i) => i % 10 === 0);
    const page = stages.map((p) => ({ src: stageSrc(p), roles: (p as any).stageRoles?.roles ?? {} }));
    page.splice(2, 0, { src: RUNAWAY, roles: { client: 1 } });
    const html = page.map((s) => island(s.src, s.roles));
    const empty = html.filter((h) => !h.includes("stg-i") && !h.includes("data-stage-over"));
    expect(empty).toEqual([]);
    const over = html.filter((h) => h.includes("data-stage-over"));
    expect(over.length).toBe(1);
    expect(html.filter((h) => h.includes("stg-i")).length).toBe(stages.length);
    // its still form: the title, the message that names the budget, every step in words
    const words = text(over[0]);
    expect(words).toContain("Runaway");
    expect(words).toContain(STAGE_OVER_MESSAGE);
    expect(STAGE_OVER_MESSAGE).toContain("stage layout budget");
    expect(STAGE_OVER_MESSAGE).toContain("38,000,000");
    expect((over[0].match(/<li>/g) ?? []).length).toBe(4);
    expect(words).toContain("Round 1: messages fly in round 1.");
    expect(words).toContain("Round 4: messages fly in round 4.");
  }, 60_000);
});
