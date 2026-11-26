// Lane core2: when the one engine draws a block, the page's LLM view, texts and doccheck come from the engine.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, llmView, check, animationTexts } from "../../../src/index";
import { TRY_WIDTHS } from "../../../src/engine/bridge";
import { renderToString } from "react-dom/server";
import React from "react";
import { DhDocument } from "../../../src/react/index";

const ROOT = join(import.meta.dir, "../../..");
const rebase = readFileSync(join(ROOT, "test/engine/parse/design/a-rebase.dh.md"), "utf8");
const old = readFileSync(join(ROOT, "fixtures/stage/01-animation-a-composed-stage.dh.md"), "utf8");

describe("a format 12 page", () => {
  test("its LLM view is the core's llm() lines, not two step titles", () => {
    const v = llmView(rebase, { path: "x.dh.md" });
    expect(v).toContain("Starts with: circle a \"A\"");
    expect(v).toContain("Now shown: circle c2 \"C'\", good; circle d2 \"D'\", good."); // fmt12: the rebase copies C and D
    expect(v).toContain("topic moves to d2.");
  });
  test("block.texts are the model's words", () => {
    const b: any = parse(rebase, { path: "x.dh.md" }).blocks.find((x: any) => x.type === "animation");
    expect(b.texts).toContain("moving a branch");
    expect(b.texts).toContain("D'");
    expect(b.texts).toContain("The topic branch starts from B."); // fmt12: the design examples' captions start with a capital
  });
  test("a correct page has no animation problem (the old compiler's garbage errors are gone)", () => {
    expect(check(rebase, { path: "x.dh.md" })).toEqual([]);
  });
  test("a mistake is found by the doccheck, with its line and the new spelling", () => {
    const bad = rebase.replace("tone c2, d2 good", "tag d2: good");
    const p = check(bad, { path: "x.dh.md" });
    expect(p).toHaveLength(1);
    expect(p[0].level).toBe("error");
    expect(p[0].message).toMatch(/animation: "tag" is not a word of a step in format 12; write "ids is words"/);
    expect(p[0].line).toBe(bad.split("\n").findIndex((l) => l.startsWith("tag d2")) + 1);
  });
  test("the drawing carries the LLM view for screen readers (srText)", () => {
    const doc = parse(rebase, { path: "x.dh.md" });
    const html = renderToString(React.createElement(DhDocument, { doc, engine: "new" } as any));
    expect(html).toContain("sr-only");
    expect(html).toContain("Starts with: circle a");
  });
});

describe("the page's engine mode", () => {
  test("old: an old page keeps its old LLM view", () => {
    const a = llmView(old, { path: "x.dh.md", engine: "old" });
    expect(a).not.toContain("Animation, ");
  });
  test("new (the default): every block's view comes from the engine", () => {
    expect(llmView(old, { path: "x.dh.md" })).toContain("Animation, 4 steps");
    const a = llmView(old, { path: "x.dh.md", engine: "new" });
    expect(a).toContain("Animation, 4 steps");
  });
  test("auto: a block the engine draws reads from it", () => {
    const a = llmView(old, { path: "x.dh.md", engine: "auto" });
    expect(a).toContain("Animation, 4 steps");
  });
  test("the old page's texts under new still name its captions", () => {
    const b: any = parse(old, { path: "x.dh.md", engine: "new" }).blocks.find((x: any) => x.type === "animation");
    expect(b.texts).toContain("Each browser asks one server.");
    expect(animationTexts(b)).toContain("Each browser asks one server.");
  });
});

describe("the doccheck says what the layout got wrong", () => {
  // render2: gt 10 has none left since a line's words keep off titles and tags (lanes/chips.ts); gt 08 still has crossings
  const gt = readFileSync(join(ROOT, "fixtures/gt/08-restaurant-order.dh.md"), "utf8");
  test("layout findings are warnings with the step's line, at the page's own widths", () => {
    const p = check(gt, { path: "x.dh.md", engine: "new" }).filter((x) => /step \d+, at/.test(x.message));
    expect(p.length).toBeGreaterThan(0);
    for (const x of p) { expect(x.level).toBe("warn"); expect(x.line).toBeGreaterThan(1); expect(x.message).toMatch(new RegExp(`at (${TRY_WIDTHS.join("|")})( and (${TRY_WIDTHS.join("|")}))? px`)); }
  });
  test("under the old engines the page has none of them", () => {
    expect(check(gt, { path: "x.dh.md", engine: "old" }).filter((x) => /step \d+, at/.test(x.message))).toEqual([]);
  });
  test("parse() does not make them (they stay off the render path)", () => {
    const t = performance.now();
    parse(gt, { path: "x.dh.md", engine: "new" });
    expect(performance.now() - t).toBeLessThan(2000);
  });
});
