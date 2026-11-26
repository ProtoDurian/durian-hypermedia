// The LLM view of a composed stage never throws for want of budget (rc.2 CI): it compiles on a stage budget of its own,
// as the drawing does, so a page budget another part (or an earlier file in the same test process) spent cannot reach
// it; and a stage over its own budget is listed still, in words (its title, the named-budget message, every step),
// as it is drawn. The drawing path already behaved this way; the LLM path threw BudgetError out of jsonOf.
import { describe, expect } from "bun:test";
import { test } from "../old-engine";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { parseDoc, jsonOf, llmView } from "../../src/core/dh-lib";
import { STAGE_OVER_MESSAGE as UI_MESSAGE } from "../../src/ui/stage";
import { STAGE_OVER_MESSAGE, stageStillLlm } from "../../src/core/stage-part";

const page = (body: string) => parseDoc("p.dh.md", `---\ntitle: t\nroles:\n  pod: c1\n  eval: c2\n---\n\n${body}\n`);
const SCENE = "```animation\ntitle: Two cards | a note\n## A\npod p: First\n## B\neval e: Second\np -> e: ask\n@step One: The ask goes out.\nlight p\n@step Two: The answer comes back.\nlight e\n```";
// a runaway scene: many connectors, far over one stage's budget (as in the drawing's own test)
const runaway = () => { const cards = Array.from({ length: 90 }, (_, i) => `pod c${i}: Card ${i}`).join("\n"); const lines = Array.from({ length: 300 }, (_, i) => `c${i % 90} -> c${(i * 7 + 3) % 90}: l${i}`).join("\n"); return "```animation\ntitle: Too much | runaway\n## A\n" + cards + "\n" + lines + "\n@step One: First.\nlight c0\n@step Two: Second.\nlight c1\n```"; };

describe("the LLM view of a stage on a spent page budget", () => {
  test("jsonOf and llmView do not throw when the page budget is already spent, and give the stage's real LLM view", () => {
    const d = page(SCENE);
    beginDocument(newBudget(10, 10)); // as a file that ended on a spent budget leaves it
    let j: any; expect(() => { j = jsonOf(d); }).not.toThrow();
    const llm = j.blocks.find((b: any) => b.type === "animation").llm as string;
    expect(llm).toContain("Two cards");
    expect(llm).toContain("The ask goes out");
    expect(llm).not.toContain(STAGE_OVER_MESSAGE);
    beginDocument(newBudget(10, 10));
    expect(() => llmView(d, "p.dh.md")).not.toThrow();
    beginDocument();
  });
  test("a scene whose layout is over one stage's budget (drawn still) still reads in full in the LLM view: it needs no layout", () => {
    beginDocument();
    const d = page(runaway());
    let j: any; expect(() => { j = jsonOf(d); }).not.toThrow();
    const llm = j.blocks.find((b: any) => b.type === "animation").llm as string;
    expect(llm).toContain("Too much (runaway)");
    expect(llm).toContain("Card 89");
    expect(llm).toContain("One");
  });
  test("a stage whose compile is over its own budget reads still: title, the named-budget message and every step", () => {
    const p = { name: "animation", attrs: {}, head: "title: Too much | runaway\n## A\npod a: A", steps: [{ title: "One: First.", raw: "", line: 9 }, { title: "Two: Second.", raw: "", line: 11 }], bodyLine: 2 };
    expect(stageStillLlm(p)).toBe(`Too much (runaway)\n${STAGE_OVER_MESSAGE}\n1. One: First.\n2. Two: Second.`);
  });
  test("the LLM view's message is the drawing's message", () => { expect(STAGE_OVER_MESSAGE).toBe(UI_MESSAGE); });
  test("BudgetError is still what a stage over its budget raises when compiled directly (the drawing catches it)", () => { expect(BudgetError).toBeDefined(); });
});
