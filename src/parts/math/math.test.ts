// The maths part: formulas in a sentence, `$$` blocks and the `math` fence: parse, the TeX staying the author's, the LLM view, every
// refusal, its caps in both sets, the doubling test (budget charges counted at n and 2n, never time), the view, and the fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget } from "../../core/budget";
import math from "./inline";
import mathPart from "./part";
import { mathSource, readMarkup, MathError, bannedIn, renderMath } from "./render";
import { closeBlock, closeInline, newSearches, type MathData } from "./scan";
import { MathFormula } from "./view";
import MathInline from "./inline-view";

const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const page = (body: string) => `# Page\n\n${body}\n`;
// a page with a math fence holds a part (.dh.md); a page of text only is .md
const doc = (body: string, limits?: Record<string, number>) => parse(page(body), { path: body.includes("```math") ? "p.dh.md" : "p.md", ...(limits ? { limits: limits as any } : {}) });
/** every maths ref node of the page's Markdown, in order (a table cell, a list item and a quote included) */
function refs(d: ReturnType<typeof parse>): { text: string; data: MathData }[] {
  const out: { text: string; data: MathData }[] = [];
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (o.t === "ref" && o.name === "math") out.push({ text: String(o.text), data: o.data as MathData });
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  for (const b of d.blocks) walk(b);
  return out;
}
const msgs = (d: ReturnType<typeof parse>, level?: "error" | "warn") => check(d).filter((p) => !level || p.level === level).map((p) => p.message);

describe("maths: parse", () => {
  test("a formula in a sentence is a ref node with its tree, and the TeX is kept", () => {
    const d = doc("The area is $A = \\pi r^2$.");
    const r = refs(d);
    expect(r.length).toBe(1);
    expect(r[0].text).toBe("$A = \\pi r^2$");
    expect(r[0].data.display).toBe(false);
    expect(mathSource(r[0].data.tree!)).toBe("A = \\pi r^2");
    expect(check(d)).toEqual([]);
    expect(JSON.parse(JSON.stringify(r[0].data))).toEqual(r[0].data);
  });
  test("the author's backslashes, underscores and stars are TeX, not Markdown", () => {
    const d = doc("Set $\\{x \\mid x_1 * y_2 > 0\\}$ and $a_1 + b_2 + c_3$.");
    const r = refs(d);
    expect(r.map((x) => mathSource(x.data.tree!))).toEqual(["\\{x \\mid x_1 * y_2 > 0\\}", "a_1 + b_2 + c_3"]);
  });
  test("a $$ block on its own lines is a paragraph holding one display formula, whatever its lines look like", () => {
    // a line that is `=` or `-` or `#` or `>` would be a heading, a list or a quote to the Markdown reader
    const d = doc("$$\na = b_1 \\\\\n= c_2\n- d\n> e\n+ f\n$$\n\nafter");
    const r = refs(d);
    expect(r.length).toBe(1);
    expect(r[0].data.display).toBe(true);
    expect(mathSource(r[0].data.tree!)).toContain("= c_2");
    const kinds = d.blocks.flatMap((b) => (b.type === "markdown" ? b.md.map((m: any) => m.t) : []));
    expect(kinds).toEqual(["h", "p", "p"]);
    expect(check(d)).toEqual([]);
  });
  test("$$ around a run of text inside a paragraph is a display formula too", () => {
    const r = refs(doc("so $$x^2$$ it is"));
    expect(r.length).toBe(1);
    expect(r[0].data.display).toBe(true);
  });
  test("a math fence is a block with its tree", () => {
    const d = doc("```math\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n```");
    const b = d.blocks.find((x) => x.type === "math")!;
    if (!b || b.type !== "math") throw new Error("not a math block");
    expect(b.data.display).toBe(true);
    expect(mathSource(b.data.tree!)).toContain("\\frac{1}{3}");
    expect(check(d)).toEqual([]);
  });
  test("prices stay text; \\$ is a dollar sign; code is left alone", () => {
    const d = doc("It costs $5 and $10, and \\$x\\$ is text, and `$x$` too.");
    expect(refs(d)).toEqual([]);
    expect(msgs(d, "warn").some((m) => /look like prices/.test(m))).toBe(true);
    expect(msgs(d, "error")).toEqual([]);
  });
  test("a lone price does not warn", () => {
    expect(msgs(doc("It costs $5."))).toEqual([]);
  });
  test("a formula in a list item, a quote and a table cell", () => {
    const d = doc("- item $x^2$\n\n> quote $y^2$\n\n| a |\n| --- |\n| $z^2$ |");
    expect(refs(d).map((x) => mathSource(x.data.tree!))).toEqual(["x^2", "y^2", "z^2"]);
  });
  test("the same formula twice is drawn once (one tree)", () => {
    const r = refs(doc("$x^2$ and $x^2$"));
    expect(r[0].data.tree).toBe(r[1].data.tree);
  });
});

describe("maths: the LLM view", () => {
  test("the TeX as written, between its signs", () => {
    const d = doc("The area is $A = \\pi r^2$.\n\n$$\nx_1\n$$");
    expect(d.llm).toContain("The area is $A = \\pi r^2$.");
    expect(d.llm).toContain("$$\nx_1\n$$");
  });
  test("a math fence reads as a $$ block", () => {
    const d = doc("```math\n\\frac{a}{b}\n```");
    expect(d.llm).toContain("$$\n\\frac{a}{b}\n$$");
    expect(mathPart.llm!({ tex: "x", display: true }, {} as any)).toBe("$$\nx\n$$");
  });
});

describe("maths: refusals", () => {
  test("TeX KaTeX cannot read: its message, with the line and column of the formula", () => {
    const d = doc("Bad: $\\frac{1}{$ here.");
    const m = msgs(d, "error");
    expect(m.length).toBe(1);
    expect(m[0]).toMatch(/^math: /);
    expect(m[0]).toMatch(/line 1, column \d+ of the formula/);
    expect(refs(d)[0].data.error).toBeTruthy();
    expect(refs(d)[0].data.tree).toBeUndefined();
  });
  test("a column on the second line of a block formula names the line", () => {
    const m = msgs(doc("$$\nx = \\frac{1}{\n$$"), "error");
    expect(m.some((x) => /line [12], column \d+ of the formula/.test(x))).toBe(true);
  });
  test.each(["href", "url", "htmlClass", "htmlData", "htmlId", "htmlStyle", "includegraphics"])("\\%s is refused by name", (name) => {
    const m = msgs(doc(`A $\\${name}{x}{y}$ formula.`), "error");
    expect(m.some((x) => x.includes(`\\${name}`) && /link or HTML/.test(x))).toBe(true);
    expect(refs(doc(`A $\\${name}{x}{y}$ formula.`))[0].data.tree).toBeUndefined();
  });
  test("a command that only starts with a banned name is not banned", () => {
    expect(bannedIn("\\hrefx")).toBeNull();
    expect(bannedIn("a \\url b")?.name).toBe("url");
  });
  test("a formula over the character cap, in both sets and with a host's lower cap", () => {
    const tex = "x+".repeat(800) + "x";   // 1,601 characters
    expect(msgs(doc(`$${tex}$`, LIMITS as any), "error")).toEqual([]);
    expect(msgs(doc(`$${tex}$`, UNTRUSTED_LIMITS as any), "error").some((m) => /1601 characters; the most is 1500/.test(m))).toBe(true);
    expect(msgs(doc("$x + y + z$", { ...LIMITS, mathChars: 4 }), "error").some((m) => /the most is 4/.test(m))).toBe(true);
  });
  test("more formulas than the page cap: the rest stay as written", () => {
    const d = doc("$a$ $b$ $c$ $d$", { ...LIMITS, mathFormulas: 2 });
    expect(refs(d).length).toBe(2);
    expect(msgs(d, "error").some((m) => /more than 2 formulas/.test(m))).toBe(true);
  });
  test("a page over its work budget: an error that names the part, the rest stays as written", () => {
    const d = doc(Array.from({ length: 40 }, (_, i) => `$x_{${i}}^{2} + y_{${i}}$`).join(" "), { ...LIMITS, maxPageEvalSteps: 3000 });
    expect(msgs(d, "error").some((m) => /^math: .*too much work/.test(m))).toBe(true);
    expect(refs(d).length).toBeLessThan(40);
  });
  test("a fence over the budget is an error block named for the part", () => {
    const d = doc("```math\nx^2 + budgetcase_{1}\n```", { ...LIMITS, maxEvalSteps: 2 });
    expect(d.llm).toContain("[math not shown:");
  });
});

describe("maths: caps", () => {
  test("the keys are in both sets, and the strict set is never higher", () => {
    for (const k of ["mathChars", "mathFormulas", "mathNodes"] as const) {
      expect(typeof (LIMITS as any)[k]).toBe("number");
      expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
    }
  });
});

describe("maths: linear (the doubling test, charges counted)", () => {
  /** the core's loop: ask for a mark at every `$` of one source text */
  const run = (src: string): number => {
    const b = big(), st = math.prepare!({ frontMatter: {}, blocks: [], limits: LIMITS, budget: b, idPrefix: "", options: {} })!;
    for (let i = src.indexOf("$"); i >= 0; i = src.indexOf("$", i + 1)) math.raw!.match(src, i, src.length, st, b, false);
    return b.steps + b.values + b.chars;
  };
  test("openers with no closer: twice the text costs about twice (no repeated search)", () => {
    for (const n of [200, 800, 3200]) {
      const r = run("$a ".repeat(2 * n)) / run("$a ".repeat(n));
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("$$ openers with no closer: twice the text costs about twice", () => {
    for (const n of [200, 800, 3200]) {
      
      // every opener sits before a blank line, so none has a closer
      const r = run("$$a\n\n".repeat(2 * n)) / run("$$a\n\n".repeat(n));
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("many short formulas: twice the text costs about twice", () => {
    let tag = 0;
    for (const n of [20, 80, 280]) {   // twice 280 is under the 600-formula cap
      // different formulas in each run (the same formula twice is drawn once, and charged once)
      const body = (k: number) => { tag++; return Array.from({ length: k }, (_, i) => `$x_{${tag}${i}}$`).join(" "); };
      const r = run(body(2 * n)) / run(body(n));
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("the closer searches: the memo means one scan of a long line", () => {
    const memo = newSearches(), src = "$a ".repeat(5000);
    let calls = 0;
    const probe = new Proxy([] as string[], {});
    void probe;
    for (let i = src.indexOf("$"); i >= 0; i = src.indexOf("$", i + 1)) { calls++; closeInline(src, i + 1, src.length, memo); }
    expect(calls).toBe(5000);
    expect(memo.inline!.res).toBe(-1);
    expect(closeBlock("$$a\n\nb$$", 2, 8, newSearches())).toBe(-1);   // a blank line ends the search
  });
  test("one long single line of TeX is read in one pass", () => {
    const b = big();
    math.raw!.match("$" + "x+".repeat(1500) + "x$", 0, 3002, math.prepare!({ frontMatter: {}, blocks: [], limits: LIMITS, budget: b, idPrefix: "", options: {} })!, b, false);
    expect(b.steps).toBeLessThan(3002 * 40);
  });
});

describe("maths: the markup reader accepts only what KaTeX writes", () => {
  test.each([
    ["<script>x</script>", /not allowed/],
    ["<span onclick=\"x\">a</span>", /not allowed/],
    ["<span style=\"background:url(x)\">a</span>", /style it should not/],
    ["<span href=\"x\">a</span>", /not allowed/],
    ["<span class=\"a<b\">a</span>", /./],
    ["<span>a", /cut off/],
  ])("%s is refused", (html, why) => {
    expect(() => readMarkup(html, 1000)).toThrow(why as RegExp);
    expect(() => readMarkup(html, 1000)).toThrow(MathError);
  });
  test("a tree over the node cap is refused", () => {
    expect(() => readMarkup("<span>" + "<span>a</span>".repeat(20) + "</span>", 10)).toThrow(/too large/);
  });
});

describe("maths: KaTeX's own output for common TeX is accepted by the reader", () => {
  const corpus = [
    "a \\\\ b", "\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}", "\\begin{cases} x & x>0 \\\\ -x & \\text{else} \\end{cases}", "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
    "\\sqrt[3]{x}", "\\overline{AB}", "\\underbrace{a+b}_{n}", "\\boxed{x}", "\\cancel{x}", "\\color{red}{x}", "\\binom{n}{k}", "\\xrightarrow{abc}",
    "\\mathbb{R}\\mathcal{L}\\mathbf{x}\\mathrm{d}", "\\sum_{i=1}^n\\prod_{j}\\int_a^b\\lim_{x\\to0}", "\\left( \\frac{a}{b} \\right]", "\\text{a b } x",
    "\\begin{array}{c|c} a & b \\\\ \\hline c & d\\end{array}", "\\fbox{a}", "\\frac{\\partial f}{\\partial x}", "\\Bigg( x \\Bigg)", "\\mathrm{e}^{i\\pi}+1=0",
  ];
  test(`${corpus.length} formulas`, () => {
    for (const t of corpus) expect(() => renderMath(t, false, { chars: 4000, nodes: 60000 }, big())).not.toThrow();
  });
  test("\\tag numbers a display formula", () => {
    expect(msgs(doc("$$\\tag{1} x = y$$"), "error")).toEqual([]);
  });
});

describe("maths: the view", () => {
  const data = (d: ReturnType<typeof parse>) => refs(d)[0].data;
  test("an inline formula is a span of MathML elements; a display formula in a paragraph is a block-level span", () => {
    const inline = renderToStaticMarkup(React.createElement(MathInline, { text: "$x$", data: data(doc("$x^2$")), ui: {} as any, static: undefined }));
    expect(inline).toContain("<math");
    expect(inline).toContain('class="math math-inline"');
    expect(inline.startsWith("<span")).toBe(true);
    const display = renderToStaticMarkup(React.createElement(MathInline, { text: "$$x$$", data: data(doc("so $$x^2$$ it")), ui: {} as any, static: undefined }));
    expect(display.startsWith("<span")).toBe(true);
    expect(display).toContain("math-block");
  });
  test("the block is a div; no HTML string and no script reach the page", () => {
    const html = renderToStaticMarkup(React.createElement(MathFormula, { data: { ...data(doc("$x^2$")), display: true } }));
    expect(html.startsWith("<div")).toBe(true);
    expect(html).not.toMatch(/<script|onclick|javascript:/);
  });
  test("a formula KaTeX cannot read shows its TeX in a code box with the reason", () => {
    const d = data(doc("$\\frac{1}{$"));
    const html = renderToStaticMarkup(React.createElement(MathFormula, { data: d }));
    expect(html).toContain("math-fail");
    expect(html).toContain("<code>");
    expect(html).toContain("\\frac{1}{");
  });
});

describe("maths: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every formula drawn`, () => {
      const d = parse(text, { path: f });
      expect(check(d)).toEqual([]);
      expect(refs(d).length).toBe(8);   // plus the math fence, a block
      expect(refs(d).every((r) => r.data.tree)).toBe(true);
      expect(d.blocks.filter((b) => b.type === "math").length).toBe(1);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, in both sets, never a hang`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const d = parse(text, { path: f.replace(".dh.md", ".md"), limits: limits as any });
        const errs = check(d).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
    });
  }
});

test("the definitions match their folder", () => {
  expect(math.name).toBe("math");
  expect(mathPart.name).toBe("math");
  expect(mathPart.dependencies).toEqual(["katex"]);
});
