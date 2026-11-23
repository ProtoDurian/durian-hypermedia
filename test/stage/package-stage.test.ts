// The composed stage through the package's public API (0.7.0): every Format page stage sample parses, checks with
// no error, carries its stage source, draws on the server and reads in the LLM view; the stage's own budget is one
// per page and its refusal is an error block, as for every other part.
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, llmView, animationTexts } from "../../src/index";
import { DhDocument } from "../../src/react/index";
import { compileStage } from "../../src/core/stage";
import { beginDocument, docBudget, endDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { BudgetError as PageBudgetError, pageBudget, withBudget } from "../../src/core/budget";

const FIX = join(import.meta.dir, "../../fixtures/stage");
const pages = readdirSync(FIX).filter((f) => f.endsWith(".dh.md")).sort();
afterEach(() => { endDocument(); beginDocument(); });

describe("the stage samples (fixtures/stage)", () => {
  test("there is one page per Format page stage section", () => { expect(pages.length).toBeGreaterThanOrEqual(38); });
  for (const f of pages) test(f, () => {
    const text = readFileSync(join(FIX, f), "utf8"), doc = parse(text, { path: f });
    const stages = doc.blocks.filter((b) => b.type === "animation" && b.stage);
    expect(stages.length).toBeGreaterThan(0);
    expect(check(doc).filter((p) => p.level === "error")).toEqual([]);
    for (const b of stages) if (b.type === "animation") {
      expect(b.anim).toBeDefined(); // the graph engine's source stays on the block: the change to the JSON is additive
      expect(b.texts).toEqual(animationTexts(b));
    }
    expect(llmView(doc).length).toBeGreaterThan(100);
    const html = renderToStaticMarkup(React.createElement(DhDocument, { doc }));
    expect(html).toContain('class="stg');
  });
});

describe("an animation that asks for the graph engine keeps it", () => {
  test("layout=graph is not a stage", () => {
    const doc = parse("# T\n\n```animation layout=graph\nbox a \"A\"\nbox b \"B\"\na -> b\n```\n", { path: "t.dh.md" });
    const b = doc.blocks.find((x) => x.type === "animation");
    expect(b && b.type === "animation" && b.stage).toBeFalsy();
  });
});

describe("the stage's budget", () => {
  const page = "---\nroles: { client: c1, server: c3 }\n---\n# T\n\n```animation\n## Clients\nclient c1: the browser\n## Servers\nserver s1: the API\n@step Ask: asks.\nc1 -> s1: GET\n@step Answer: answers.\ns1 -> c1: 200\n```\n";
  test("each page budget has a stage budget of its own", () => {
    const a = pageBudget(), b = pageBudget();
    const ba = withBudget(a, () => docBudget()), bb = withBudget(b, () => docBudget());
    expect(ba).not.toBe(bb);
    expect(withBudget(a, () => docBudget())).toBe(ba);
  });
  test("a stage over the budget is an error block and an error, not a hung page", () => {
    beginDocument(newBudget(5));
    const doc = parse(page, { path: "t.dh.md" });
    const err = doc.blocks.find((x) => x.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/needs more work than a page may use/);
    expect(doc.problems.some((p) => p.level === "error" && /animation: /.test(p.message))).toBe(true);
  });
  test("its error is the package's BudgetError", () => {
    beginDocument(newBudget(3));
    expect(() => compileStage("## A\nclient a: A", [{ title: "One", raw: "", line: 3 }, { title: "Two", raw: "", line: 4 }], 1, {}, { client: 1 })).toThrow(PageBudgetError);
    expect(new BudgetError("x", "work")).toBeInstanceOf(PageBudgetError);
  });
  test("a [caption] marker's charge counts, so the budget still refuses after it", () => {
    beginDocument(newBudget(100_000));
    const c = compileStage("time: 0..4", [{ title: "One", raw: "keep at 2 [caption]: words in the caption", line: 5 }, { title: "Two", raw: "", line: 7 }], 1, {}, { job: 1 });
    expect(c.errors).toEqual([]);
    const left = docBudget().left().work;
    expect(Number.isFinite(left)).toBe(true);
    expect(() => docBudget().charge("more", left + 1)).toThrow(BudgetError);
  });
});

describe("the stage draws on a budget of its own", () => {
  test("rendering a page spends nothing of the stage budget a parse or a direct call uses", () => {
    const doc = parse(readFileSync(join(FIX, pages[0]), "utf8"), { path: pages[0] });
    beginDocument();
    const before = docBudget().left().work;
    for (let i = 0; i < 3; i++) expect(renderToStaticMarkup(React.createElement(DhDocument, { doc }))).toContain('class="stg');
    expect(docBudget().left().work).toBe(before);
  });
  test("a scene within its budget draws its stage, not the over-budget note", () => {
    const doc = parse(readFileSync(join(FIX, pages[0]), "utf8"), { path: pages[0] });
    const html = renderToStaticMarkup(React.createElement(DhDocument, { doc }));
    expect(html).not.toContain("stg-over");
  });
});
