// The sparkline in a sentence: parse, the LLM view, every refusal, its caps in both sets, the doubling test (budget charges
// counted at n and 2n, never time) and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, pageBudget, withBudget } from "../../core/budget";
import { inlineToLlm } from "../../core/dh-lib";
import { mdBlocks } from "../../markdown";
import { prepareInlines } from "../inline-runtime";
import GithubSlugger from "github-slugger";
import spark, { parseSpark, type Spark } from "./inline";
import SparkInline, { sparkShapes } from "./inline-view";

const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const page = (body: string) => `# Page\n\n${body}\n`;
/** every ref node of the page's Markdown, in order */
function refs(doc: ReturnType<typeof parse>): { name: string; text: string; data: any }[] {
  const out: { name: string; text: string; data: any }[] = [];
  const inl = (c: any[]) => { for (const x of c) { if (x.t === "ref") out.push({ name: x.name, text: x.text, data: x.data }); if (x.c) inl(x.c); } };
  const blk = (b: any) => { if (b.c && Array.isArray(b.c)) { if (b.c[0]?.t && b.t !== "list") { if (["p", "text", "h"].includes(b.t)) inl(b.c); else b.c.forEach(blk); } else b.c.forEach(blk); } if (b.items) b.items.forEach((it: any) => it.c.forEach(blk)); if (b.head) b.head.forEach(inl); if (b.rows) b.rows.forEach((r: any[]) => r.forEach(inl)); };
  for (const b of doc.blocks) if (b.type === "markdown") b.md.forEach(blk);
  return out;
}
const errorsOf = (src: string, limits = LIMITS) => check(parse(src, { path: "p.md", limits })).filter((p) => p.level === "error").map((p) => p.message);

describe("spark: parse and the LLM view", () => {
  test("numbers, a style and a colour", () => {
    expect(parseSpark("3,5,2,8,9", 200).spark).toEqual({ values: [3, 5, 2, 8, 9], style: "line", colour: "acc" });
    expect(parseSpark("3, 5, 2 bar good", 200).spark).toEqual({ values: [3, 5, 2], style: "bar", colour: "good" });
    expect(parseSpark("1.5,-2,3e2 warn", 200).spark!.values).toEqual([1.5, -2, 300]);
  });
  test("the page's Markdown holds a ref node with plain data, and no problems", () => {
    const doc = parse(page("Visits :spark[3,5,2,8,9 bar good] today."), { path: "p.md" });
    const r = refs(doc);
    expect(r).toEqual([{ name: "spark", text: ":spark[3,5,2,8,9 bar good]", data: { values: [3, 5, 2, 8, 9], style: "bar", colour: "good" } }]);
    expect(JSON.parse(JSON.stringify(r[0].data))).toEqual(r[0].data);
    expect(check(doc)).toEqual([]);
  });
  test("the LLM view is the numbers, and the page's LLM view carries it", () => {
    expect(inlineToLlm("up :spark[3,5,2,8,9] now")).toBe("up (3, 5, 2, 8, 9) now");
    expect(parse(page("up :spark[3,4] now"), { path: "p.md" }).llm).toContain("up (3, 4) now");
    expect(spark.llm!({ values: [3, 4], style: "line", colour: "acc" }, ":spark[3,4]")).toBe("(3, 4)");
  });
  test("a wrong sparkline stays as written, in the LLM view too", () => {
    expect(inlineToLlm("a :spark[3,x] b")).toBe("a :spark[3,x] b");
    expect(refs(parse(page("a :spark[3,x] b"), { path: "p.md" }))).toEqual([]);
  });
  test("read in a list item, a quote, a callout and a table cell; never in code, a link, an image or a heading", () => {
    const src = page([
      "- item :spark[1,2]", "", "> quote :spark[3,4]", "", "> **Tip:** callout :spark[5,6]", "",
      "| a | b |", "| --- | --- |", "| :spark[7,8] | x |", "",
      "`:spark[9,9]` and [link :spark[1,1]](https://example.com) and ![alt :spark[2,2]](https://example.com/a.png)", "",
      "## Heading :spark[4,4]", "", "<span title=\":spark[5,5]\">x</span>",
    ].join("\n"));
    expect(refs(parse(src, { path: "p.md" })).map((r) => r.text)).toEqual([":spark[1,2]", ":spark[3,4]", ":spark[5,6]", ":spark[7,8]"]);
  });
  test("two on one line, and one before and after a bracket", () => {
    expect(refs(parse(page("[a] :spark[1,2] [b] :spark[3,4 bar] c"), { path: "p.md" })).map((r) => r.text)).toEqual([":spark[1,2]", ":spark[3,4 bar]"]);
  });
});

describe("spark: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["one number", ":spark[3]", /needs at least 2 numbers joined by commas/],
    ["a word that is not a number", ":spark[3,x]", /"x" is not a number/],
    ["a word that is not a style or colour", ":spark[3,4 pie]", /"pie" is not a style or colour/],
    ["an empty last number", ":spark[3,]", /"" is not a number/],
    ["too many numbers", `:spark[${Array.from({ length: 201 }, () => 1).join(",")}]`, /at most 200/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(page(`text ${body} more`));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.startsWith("spark:"))).toBe(true);
    const p = check(parse(page(`text ${body} more`), { path: "p.md" })).find((x) => /^spark:/.test(x.message))!;
    expect(p.line).toBe(3);
  });
});

describe("spark: caps in both sets", () => {
  test("its cap is in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.sparkValues).toBe(200);
    expect(UNTRUSTED_LIMITS.sparkValues).toBeLessThanOrEqual(LIMITS.sparkValues);
  });
  const nums = (n: number) => Array.from({ length: n }, () => 5).join(",");
  test("over the cap: refused, at the host's own cap too, and the strict set has fewer", () => {
    expect(errorsOf(page(`:spark[${nums(150)}]`))).toEqual([]);
    expect(errorsOf(page(`:spark[${nums(150)}]`), UNTRUSTED_LIMITS as any).some((m) => /at most 100/.test(m))).toBe(true);
    expect(check(parse(page(`:spark[${nums(30)}]`), { path: "p.md", limits: { sparkValues: 20 } })).some((p) => /at most 20/.test(p.message))).toBe(true);
  });
  test("over the page's work budget: reported with the part's name, the text stays plain, never a hang", () => {
    const text = page(`${"word ".repeat(400)} :spark[1,2]`);
    const doc = parse(text, { path: "p.md", limits: { maxPageEvalSteps: 300 } });
    expect(doc.problems.some((p) => /^spark: .*do too much work/.test(p.message))).toBe(true);
    expect(refs(doc)).toEqual([]);
  });
});

describe("spark: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => `${"some words :spark[1,2,3 bar] and ".repeat(n)}`;
  const cost = (n: number, f: (t: string, b: Budget) => void) => { const b = big(); f(body(n), b); return b.steps + b.values + b.chars; };
  test("scan: twice the text costs at most about twice, at three sizes", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n, (t, b) => spark.scan(t, { cap: 200 }, b)) / cost(n, (t, b) => spark.scan(t, { cap: 200 }, b));
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("one long sparkline and one long run of digits", () => {
    const a = big(), b = big();
    parseSpark(Array.from({ length: 80 }, () => 5).join(","), 200, a); parseSpark(Array.from({ length: 160 }, () => 5).join(","), 200, b);
    expect(b.steps / a.steps).toBeLessThan(2.3);
    expect(parseSpark("1,2" + "9".repeat(60) + "x", 200).error).toMatch(/is not a number/);
    expect(parseSpark("1," + "9".repeat(30), 200).spark?.values.length).toBe(2);
  });
  test("through the core: the page's budget is charged one step per character offered, so twice the page costs twice", () => {
    const steps = (n: number) => {
      const pb = pageBudget(LIMITS);
      const ctx = { policy: undefined, idPrefix: "dh-", slugger: new GithubSlugger(), maxDepth: 20, problems: [], line: 1, heads: [], inlineParts: prepareInlines({}, [], LIMITS) } as any;
      withBudget(pb, () => mdBlocks(("some words :spark[1,2,3] and ".repeat(n) + "\n\n").repeat(3), ctx));
      expect(ctx.problems).toEqual([]);
      return pb.steps;
    };
    for (const n of [20, 80, 320]) { const r = steps(2 * n) / steps(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("time: near-matches (openers with no closer, openers with a bad number) take at most about twice as long at twice the size", () => {
    const best = (t: string) => { let m = Infinity; for (let k = 0; k < 5; k++) { const t0 = performance.now(); spark.scan(t, { cap: 200 }, big()); m = Math.min(m, performance.now() - t0); } return m; };
    for (const unit of [":spark[", ":spark[1,2,x ", ":spark[1,2 "]) {
      const n = 60_000, small = best(unit.repeat(n)), large = best(unit.repeat(2 * n));
      expect(large / Math.max(small, 0.5)).toBeLessThan(3.5);
    }
  });
});

describe("spark: the view", () => {
  const el = (d: Spark) => renderToStaticMarkup(React.createElement(SparkInline, { text: "t", data: d, ui: {} as any, static: undefined }));
  test("a line has a polyline and a dot; bars have rects; the numbers are in the label", () => {
    const h = el({ values: [3, 5, 2, 8, 9], style: "line", colour: "acc" });
    expect(h).toContain("<polyline"); expect(h).toContain("<circle"); expect(h).toContain('aria-label="Trend: 3, 5, 2, 8, 9"'); expect(h).toContain("var(--spark-ink)");
    const b = el({ values: [3, 5, 2], style: "bar", colour: "good" });
    expect((b.match(/<rect/g) ?? []).length).toBe(3); expect(b).toContain("var(--good)");
  });
  test("a flat series does not divide by zero", () => {
    expect(el({ values: [5, 5, 5], style: "line", colour: "acc" })).not.toContain("NaN");
    expect(sparkShapes({ values: [5, 5, 5], style: "bar", colour: "acc" }).bars.every((r) => Number.isFinite(r.y) && r.h > 0)).toBe(true);
  });
  test("no HTML string reaches the DOM: the markup is React's own", () => {
    expect(el({ values: [1, 2], style: "line", colour: "acc" })).not.toContain("&lt;");
  });
});

describe("spark: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every sparkline drawn`, () => {
      const doc = parse(text, { path: f.replace(".dh.md", ".md") });
      expect(check(doc)).toEqual([]);
      expect(refs(doc).length).toBe(5);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, in both sets, never a hang`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f.replace(".dh.md", ".md"), limits: limits as any });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
    });
  }
});

test("the definition matches its folder", () => {
  expect(spark.name).toBe("spark");
  expect(spark.rank).toBe(-1);
});
