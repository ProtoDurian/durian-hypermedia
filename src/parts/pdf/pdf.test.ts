// The PDF part: parse, LLM view, every refusal, its caps in both sets, the doubling test (charges counted, never time) and the
// hostile fixtures. The viewer itself (pdf.js) is checked in the browser by scripts/part-check.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import pdf, { parsePdf, pdfLlm } from "./part";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`pdf${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string, opts: Record<string, unknown> = {}) => check(parse(src, { path: "p.dh.md", ...opts })).filter((p) => p.level === "error").map((p) => p.message);
const has = (list: string[], re: RegExp) => list.some((m) => re.test(m));
const p = (body: string, attrs: Record<string, string> = { src: "a.pdf" }, lim: any = LIMITS) => parsePdf(body, 2, attrs, 1, lim, big());

describe("pdf: parse and the LLM view", () => {
  test("parse, the block, the plain JSON data and no problems", () => {
    const s = p("", { src: "media/q3.pdf", title: "Q3 report", page: "3", view: "scroll", height: "l" });
    expect(s.errors).toEqual([]); expect(s.page).toBe(3); expect(s.view).toBe("scroll"); expect(s.caps).toEqual({ bytes: 20 * 1024 * 1024, pages: 500 });
    const doc = parse(fence("", 'src="media/q3.pdf" title="Q3 report" page=3'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "pdf")!;
    if (!b || b.type !== "pdf") throw new Error("not pdf");
    expect(b.llmKind).toBe("own");
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
    expect(check(doc)).toEqual([]);
  });
  test("the LLM view, and the page's LLM view carries it", () => {
    expect(pdfLlm(p("", { src: "media/q3.pdf", title: "Q3 report" }))).toBe("PDF: Q3 report, media/q3.pdf.");
    expect(pdfLlm(p(""))).toBe("PDF: a.pdf, a.pdf.");
    expect(parse(fence("", 'src="media/q3.pdf" title="Q3 report"'), { path: "p.dh.md" }).llm).toContain("PDF: Q3 report, media/q3.pdf.");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence("", 'src="a.pdf"') + "\n:::llm\nThe Q3 report: revenue grew.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("The Q3 report: revenue grew.");
  });
});

describe("pdf: every refusal names the line and the fix", () => {
  const run = (info: string, b = "") => errorsOf(fence(b, info));
  test("refusals", () => {
    expect(has(run('src="a.docx"'), /is not a \.pdf file/)).toBe(true);
    expect(has(run('src="javascript:1"'), /not allowed/)).toBe(true);
    expect(has(run('src="a.pdf" page=0'), /page= is a page number from 1/)).toBe(true);
    expect(has(run('src="a.pdf" page=x'), /page= is a page number from 1/)).toBe(true);
    expect(has(run('src="a.pdf" view=wall'), /view="wall" is page or scroll/)).toBe(true);
    expect(has(run('src="a.pdf" height=xl'), /height="xl" is s, m or l/)).toBe(true);
    expect(has(run('src="a.pdf"', "some body"), /a PDF viewer has no body lines/)).toBe(true);
    expect(has(run('src="a.pdf" colour=c1'), /unknown option "colour"/)).toBe(true);
    expect(has(run(""), /no src/)).toBe(true);
    expect(run('src="a.pdf" page=3 height=s').length).toBe(0);
  });
  test("every message carries the real line of the fence's lines", () => {
    const m = check(parse(fence("\nsome body", 'src="a.pdf"'), { path: "p.dh.md" })).find((x) => /no body lines/.test(x.message))!;
    expect(m.line).toBe(5);
  });
});

describe("pdf: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, and the data carries the set parse was given", () => {
    expect([LIMITS.pdfPages, LIMITS.pdfBytes]).toEqual([500, 20 * 1024 * 1024]);
    for (const k of Object.keys(LIMITS).filter((x) => x.startsWith("pdf"))) expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
    const b = parse(fence("", 'src="a.pdf"'), { path: "p.dh.md", limits: UNTRUSTED_LIMITS }).blocks.find((x) => x.type === "pdf")!;
    if (b.type !== "pdf") throw new Error("not pdf");
    expect(b.data.caps).toEqual({ bytes: UNTRUSTED_LIMITS.pdfBytes, pages: UNTRUSTED_LIMITS.pdfPages });
    expect(parse(fence("", 'src="a.pdf"'), { path: "p.dh.md", limits: { pdfPages: 7 } }).blocks.find((x) => x.type === "pdf")).toMatchObject({ data: { caps: { pages: 7 } } });
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = Array.from({ length: 4000 }, () => "a body line that is refused").join("\n");
    const doc = parse(fence(body, 'src="a.pdf"'), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the pdf part does too much work/);
    expect(doc.llm).toContain("[pdf not shown: the pdf part does too much work");
  });
});

describe("pdf: linear (the doubling test, charges counted)", () => {
  test("body lines: twice the input costs at most about twice", () => {
    const cost = (n: number) => { const b = big(); parsePdf(Array.from({ length: n }, (_, i) => `a body line number ${i}`).join("\n"), 1, { src: "a.pdf" }, 1, LIMITS, b); return b.steps + b.values + b.chars; };
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once", () => {
    const b1 = big(), b2 = big();
    parsePdf("x".repeat(20_000), 1, { src: "a.pdf" }, 1, LIMITS, b1);
    parsePdf("x".repeat(40_000), 1, { src: "a.pdf" }, 1, LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
  });
});

describe("pdf: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every viewer drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((x) => x.type === "pdf").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((q) => q.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((q) => q.line >= 1)).toBe(true);
      }
      expect(() => parsePdf(text, 1, { src: "a.pdf" }, 1, LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the pdf part"))).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(pdf.name).toBe("pdf");
  expect(pdf.steps).toBe(false);
  expect(pdf.dependencies).toEqual(["pdfjs-dist"]);
});
