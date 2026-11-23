// The glossary: the block (parse, LLM view, every refusal, caps in both sets), the terms in the text (where they are marked, the
// first use in each section, the LLM view), the matcher, the doubling test (budget charges counted at n and 2n, and time) and
// the fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import glossary from "./part";
import inline from "./inline";
import { allTerms, defPlain, defSegs, glossaryLlm, matcher, parseGlossaryBlock, parseGlossaryFront, slug, termLine, type Term } from "./terms";
import GlossaryView from "./view";
import GlossaryInline from "./inline-view";
import { DhContext, DEFAULT_SLOTS } from "../../react/context";
import { UI } from "../../ui/ui";

const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const L = LIMITS;
const fence = (body: string, info = "") => `# Page\n\n\`\`\`glossary ${info}\n${body}\n\`\`\`\n`;
const GOOD = 'term "UL" also "ubiquitous language": the words a team agrees on\nterm bc "bounded context": one part of the system';
const errorsOf = (src: string, limits: any = LIMITS) => check(parse(src, { path: "p.dh.md", limits })).filter((p) => p.level === "error").map((p) => p.message);
const warnsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "warn").map((p) => p.message);
/** every glossary ref node of the page's Markdown, in order */
function marks(doc: ReturnType<typeof parse>): { text: string; id: string }[] {
  const out: { text: string; id: string }[] = [];
  const inl = (c: any[]) => { for (const x of c) { if (x.t === "ref" && x.name === "glossary") out.push({ text: x.text, id: x.data.id }); if (x.c) inl(x.c); } };
  const blk = (b: any) => { if (["p", "text", "h"].includes(b.t) && Array.isArray(b.c)) inl(b.c); else if (Array.isArray(b.c)) b.c.forEach(blk); if (b.items) b.items.forEach((it: any) => it.c.forEach(blk)); if (b.head) b.head.forEach(inl); if (b.rows) b.rows.forEach((r: any[]) => r.forEach(inl)); };
  for (const b of doc.blocks) if (b.type === "markdown") b.md.forEach(blk);
  return out;
}
const term = (label: string, o: Partial<Term> = {}): Term => ({ id: slug(label), label, also: [], def: "d", segs: [{ t: "d" }], line: 1, from: "block", ...o });

describe("glossary: the block", () => {
  test("a good block is a block with its terms and no problems; the data is plain JSON", () => {
    const doc = parse(fence(GOOD, 'title="Words"'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "glossary")!;
    if (!b || b.type !== "glossary") throw new Error("not a glossary");
    expect(b.data.title).toBe("Words");
    expect(b.data.terms.map((t) => [t.id, t.label, t.also, t.def, t.line])).toEqual([["ul", "UL", ["ubiquitous language"], "the words a team agrees on", 4], ["bc", "bounded context", [], "one part of the system", 5]]);
    expect(b.llmKind).toBe("own");
    expect(check(doc).filter((p) => p.level === "error")).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
  });
  test("the LLM view lists the glossary once; a :::llm replaces it", () => {
    const want = "Glossary:\n- **UL** (also: ubiquitous language): the words a team agrees on\n- **bounded context**: one part of the system";
    expect(parse(fence(GOOD), { path: "p.dh.md" }).llm).toContain(want);
    expect(glossary.llm!(parse(fence(GOOD), { path: "p.dh.md" }).blocks.find((x) => x.type === "glossary")!.data as any, {} as any)).toBe(want);
    const doc = parse(fence(GOOD) + "\n:::llm\nTwo terms.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Two terms.");
    expect(doc.llm).not.toContain("Glossary:\n");
  });
  test("a term line: an id, other names, a continuation line, a comment, small Markdown", () => {
    const r = parseGlossaryBlock('// a comment\nterm ul-id "UL" also "a", "b" : the **words**\n  that `we` use\n\nterm "Two":  x', 10, L);
    expect(r.errors).toEqual([]);
    expect(r.terms.map((t) => [t.id, t.also, t.def, t.line])).toEqual([["ul-id", ["a", "b"], "the **words** that `we` use", 11], ["two", [], "x", 14]]);
    expect(r.terms[0].segs).toEqual([{ t: "the " }, { t: "words", b: true }, { t: " that " }, { t: "we", code: true }, { t: " use" }]);
  });
  test("termLine reads what the prototype's pattern read, and nothing else", () => {
    expect(termLine('term "A": b')).toEqual({ id: null, label: "A", also: [], rest: "b" });
    expect(termLine('term x.y_z-1 "A" also "B":b')).toEqual({ id: "x.y_z-1", label: "A", also: ["B"], rest: "b" });
    for (const bad of ['terms "A": b', 'term "A" b', 'term "A" also B: c', 'term "A" also "B" "C": d', 'term "A" also "B",: d', 'term "A', 'term x"A": b', 'term "A"also "B": c', "term", 'term "A"']) expect(termLine(bad)).toBeNull();
  });
  test("defSegs: code, bold, italic, an https link; anything else stays text", () => {
    expect(defSegs("a `b` **c** *d* [e](https://example.com/x) [f](ftp://x) *g")).toEqual([{ t: "a " }, { t: "b", code: true }, { t: " " }, { t: "c", b: true }, { t: " " }, { t: "d", i: true }, { t: " " }, { t: "e", href: "https://example.com/x" }, { t: " [f](ftp://x) *g" }]);
    expect(defPlain(defSegs("a `b` **c**"))).toBe("a b c");
    expect(defSegs("[x](https://a b)")).toEqual([{ t: "[x](https://a b)" }]);
  });
  test("the view draws a list with an anchor for each term, as React elements", () => {
    const doc = parse(fence(GOOD + "\nterm \"Z\": a [l](https://example.com)", 'title="Words"'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "glossary") as any;
    const h = renderToStaticMarkup(React.createElement(GlossaryView, { data: b.data, block: b, ui: {} as any, static: undefined, stage: { width: 600, theme: "light", motion: "on", report() {} } }));
    expect(h).toContain('id="dh-term-ul"'); expect(h).toContain("Words"); expect(h).toContain("also ubiquitous language"); expect(h).toContain('<a href="https://example.com"');
  });
});

describe("glossary: meaning links go through the host urlPolicy", () => {
  const data = () => { const doc = parse(fence("term \"Z\": a [l](https://example.com/x)"), { path: "p.dh.md" }); return (doc.blocks.find((x) => x.type === "glossary") as any).data; };
  const view = (urlPolicy?: (u: string, k: string) => string | null) => renderToStaticMarkup(React.createElement(DhContext.Provider, { value: { ui: UI.en, slots: DEFAULT_SLOTS, components: {}, hostBlocks: new Map(), hostInlines: new Map(), llmPeek: false, demoteHeadings: 0, urlPolicy: urlPolicy as any } }, React.createElement(GlossaryView, { data: data(), block: {} as any, ui: {} as any, static: undefined, stage: { width: 600, theme: "light", motion: "on", report() {} } })));
  test("a policy that refuses links leaves the text without a link", () => {
    const h = view(() => null);
    expect(h).not.toContain("<a ");
    expect(h).toContain("l");
  });
  test("a policy that rewrites a link is applied; the policy is asked for a link", () => {
    const asked: string[] = [];
    const h = view((u, k) => { asked.push(k + ":" + u); return u + "?r=1"; });
    expect(h).toContain(`href="https://example.com/x?r=1"`);
    expect(asked).toEqual(["link:https://example.com/x"]);
  });
});

describe("glossary: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["a line that is not a term", "just words", /a line is: term "UL": the meaning/],
    ["an empty meaning", 'term "UL":', /has no meaning after the colon/],
    ["no name", 'term "": x', /needs a name in the quotes/],
    ["a name with no letter or digit, so no id", 'term "!!!": x', /the id "" is letters, digits/],
    ["too many other names", 'term "UL" also "a", "b", "c", "d", "e", "f": x', /has 6 other names; the most is 5/],
    ["a long name", `term "${"n".repeat(61)}": x`, /a term is at most 60 characters/],
    ["a long meaning", `term "UL": ${"x".repeat(700)}`, /meaning of "UL" is at most 600 characters/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.includes("glossary:"))).toBe(true);
    expect(check(parse(fence(body), { path: "p.dh.md" })).find((p) => /glossary:/.test(p.message))!.line).toBe(4);
  });
  test("an unknown key", () => { expect(errorsOf(fence(GOOD, "colour=red")).some((m) => /unknown key "colour"/.test(m))).toBe(true); });
  test("a term defined twice (in two blocks, or a block and front matter) names the first line; so does a repeated id", () => {
    const two = `# P\n\n\`\`\`glossary\nterm "UL": a\n\`\`\`\n\n\`\`\`glossary\nterm "ul": b\n\`\`\`\n\nUL`;
    expect(errorsOf(two).some((m) => /the term "ul" is defined twice: "ul" is already defined \(first at line 4\)/.test(m))).toBe(true);
    const fm = `---\nglossary:\n  UL: a\n---\n# P\n\n\`\`\`glossary\nterm "UL": b\n\`\`\`\n\nUL`;
    expect(errorsOf(fm).some((m) => /is defined twice/.test(m))).toBe(true);
    const id = `# P\n\n\`\`\`glossary\nterm x "A": a\nterm x "B": b\n\`\`\`\n\nA B`;
    expect(errorsOf(id).some((m) => /the id "x" is already used/.test(m))).toBe(true);
  });
  test("front matter glossary: not a map, a meaning that is not text", () => {
    expect(errorsOf("---\nglossary: [a]\n---\n# P\n").some((m) => /front matter glossary: is a map/.test(m))).toBe(true);
    expect(errorsOf("---\nglossary:\n  UL: 12\n---\n# P\n\nUL").some((m) => /"UL" needs its meaning as text/.test(m))).toBe(true);
  });
  test("a term the text never uses is a warning", () => {
    expect(warnsOf(fence(GOOD) + "\nUL only\n")).toEqual(['glossary: the term "bounded context" is never used in the text']);
    expect(warnsOf(fence(GOOD) + "\nUL and a bounded context\n")).toEqual([]);
  });
});

describe("glossary: terms in the text", () => {
  const page = (text: string, block = GOOD) => `# Page\n\n\`\`\`glossary\n${block}\n\`\`\`\n\n${text}\n`;
  test("a whole word, the first letter's case free, the longest name wins, an other name is the term", () => {
    const doc = parse(page("Each UL; a uL, ULs and ULx are not; a Bounded context and a ubiquitous language."), { path: "p.dh.md" });
    expect(marks(doc)).toEqual([{ text: "UL", id: "ul" }, { text: "Bounded context", id: "bc" }]);
    const longest = parse(page("a bounded context map here", 'term bc "bounded context": a\nterm map "bounded context map": b'), { path: "p.dh.md" });
    expect(marks(longest)).toEqual([{ text: "bounded context map", id: "map" }]);
  });
  test("another inline part's text is not read: a term inside :spark[...] is left to the sparkline, a word outside it is marked", () => {
    const doc = parse(page("A :spark[1,2 bar] and a bar and :spark[3,4 bar good].", 'term "bar": a chart of bars'), { path: "p.dh.md" });
    expect(marks(doc)).toEqual([{ text: "bar", id: "bar" }]);
    const refs = (doc.blocks.find((b) => b.type === "markdown" && (b as any).md.some((x: any) => x.t === "p")) as any).md[0].c.filter((x: any) => x.t === "ref").map((x: any) => x.name);
    expect(refs).toEqual(["spark", "glossary", "spark"]);
  });
  test("the first use in each section; a heading of level 1 or 2 starts a new section, a level 3 does not", () => {
    const doc = parse(page("UL one UL two\n\n### Level 3\n\nUL three\n\n## Two\n\nUL four UL five\n\n# Three\n\nUL six"), { path: "p.dh.md" });
    expect(marks(doc).map((m) => m.text)).toEqual(["UL", "UL", "UL"]);
  });
  test("never inside code, a link, an image, a heading, a table's rule row, an HTML tag; read in a list, a quote, a callout, a table cell", () => {
    const text = ["`UL`", "", "[UL](https://example.com) ![UL](https://example.com/a.png)", "", "## UL heading", "", "<span title=\"UL\">x</span>", "", "```", "UL", "```", "", "| a | UL |", "| --- | --- |", "| x | y |", ""].join("\n");
    const doc = parse(page(text, 'term "UL": a'), { path: "p.dh.md" });
    expect(marks(doc).map((m) => m.text)).toEqual(["UL"]);   // only the table's header cell
    const spots = parse(page("- item UL\n\n## R\n\n> quote UL\n\n## S\n\n> **Tip:** callout UL\n\n## T\n\n| a | b |\n| --- | --- |\n| UL | x |", 'term "UL": a'), { path: "p.dh.md" });
    expect(marks(spots).length).toBe(4);
  });
  test("terms from front matter work without a block, and have no 'All terms' link", () => {
    const doc = parse("---\nglossary:\n  SLO: a target\n---\n# P\n\nThe SLO is met.\n", { path: "p.md" });
    const m = (doc.blocks[0] as any).md.flatMap((b: any) => (b.c ?? []).filter((x: any) => x.t === "ref"));
    expect(m.map((x: any) => [x.text, x.data.id, x.data.link, x.data.plain])).toEqual([["SLO", "slo", "", "a target"]]);
    expect(check(doc)).toEqual([]);
    const withBlock = parse(page("UL"), { path: "p.dh.md" });
    expect((withBlock.blocks.find((b) => b.type === "markdown" && (b as any).md.some((x: any) => x.t === "p")) as any).md[0].c[0].data.link).toBe("#dh-term-ul");
  });
  test("the LLM view: front matter terms stay at the top, the block lists them once, the marks are plain text", () => {
    const doc = parse(`---\ntitle: T\nglossary:\n  SLO: a target\n---\n# P\n\n\`\`\`glossary\nterm "UL": words\n\`\`\`\n\nUL and SLO.\n`, { path: "p.dh.md" });
    expect(doc.llm).toContain("glossary:\n  SLO: a target");
    expect(doc.llm.match(/Glossary:/g)?.length).toBe(1);
    expect(doc.llm).toContain("UL and SLO.");
  });
  test("a page with no term is not offered any text", () => {
    expect(inline.prepare!({ frontMatter: {}, blocks: [], limits: L, budget: big(), idPrefix: "dh-", options: {} })).toBeNull();
  });
  test("over the page's work budget: the text stays plain, the page says so, no hang", () => {
    const doc = parse(page(`${"filler words ".repeat(300)}\n\nUL`), { path: "p.dh.md", limits: { maxPageEvalSteps: 800 } as any });
    expect(doc.problems.some((p) => /^glossary: .*do too much work/.test(p.message))).toBe(true);
    expect(marks(doc)).toEqual([]);
  });
  test("the term's button is a real <button> that opens a dialog", () => {
    const h = renderToStaticMarkup(React.createElement(GlossaryInline, { text: "UL", data: { id: "ul", label: "UL", also: [], segs: [{ t: "w" }], plain: "w", link: "#term-ul" }, ui: {} as any, static: undefined }));
    expect(h).toContain('<button type="button" class="glossary-term"'); expect(h).toContain('aria-haspopup="dialog"'); expect(h).toContain('aria-expanded="false"');
  });
});

describe("glossary: the matcher", () => {
  const find = (names: Term[], text: string) => matcher(names)!.find(text, big()).map((f) => [text.slice(f.from, f.to), f.term.label]);
  test("names made of punctuation and regular expression characters are literal text", () => {
    expect(find([term("C++"), term("(a+)+"), term("a.b")], "C++ and (a+)+ but not axb; a.b is")).toEqual([["C++", "C++"], ["(a+)+", "(a+)+"], ["a.b", "a.b"]]);
  });
  test("a word touching a letter, a digit, _ or - on either side is not a match; other scripts count as letters", () => {
    expect(find([term("UL")], "UL_x x_UL UL-x UL2 éUL ULé UL. (UL) UL")).toEqual([["UL", "UL"], ["UL", "UL"], ["UL", "UL"]]);
    expect(find([term("café")], "café, un café, cafés, 🙂café")).toEqual([["café", "café"], ["café", "café"], ["café", "café"]]);
  });
  test("leftmost then longest: a name inside a longer one at the same start loses; the next search starts after a match", () => {
    expect(find([term("a b"), term("b c"), term("a")], "a b c")).toEqual([["a b", "a b"]]);
    expect(find([term("b"), term("a b c")], "a b c b")).toEqual([["a b c", "a b c"], ["b", "b"]]);
  });
  test("host terms are replaced by the page's; the page wins", () => {
    const r = allTerms([], [term("UL", { def: "page" })], [term("ul", { def: "host" }), term("Other", { def: "host" })]);
    expect(r.terms.map((t) => [t.label, t.def, t.from])).toEqual([["UL", "page", "block"], ["Other", "host", "host"]]);
  });
  test("front matter reads a map", () => {
    const r = parseGlossaryFront({ glossary: { "Bounded context": "a", X: "" } }, L);
    expect(r.terms.map((t) => [t.id, t.from])).toEqual([["bounded-context", "front"]]);
    expect(r.errors.length).toBe(1);
  });
  test("glossaryLlm", () => { expect(glossaryLlm([term("A", { def: "x", also: ["B"] })])).toBe("Glossary:\n- **A** (also: B): x"); });
});

describe("glossary: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, the strict set no higher", () => {
    expect([LIMITS.glossaryTerms, LIMITS.glossaryLabel, LIMITS.glossaryDef, LIMITS.glossaryAliases]).toEqual([200, 60, 600, 5]);
    for (const k of ["glossaryTerms", "glossaryLabel", "glossaryDef", "glossaryAliases"] as const) expect(UNTRUSTED_LIMITS[k]).toBeLessThanOrEqual(LIMITS[k]);
  });
  const terms = (n: number) => Array.from({ length: n }, (_, i) => `term "T${i}": m`).join("\n");
  test("over the term cap: refused, at the host's own cap too, and the strict set has fewer", () => {
    expect(errorsOf(fence(terms(150))).filter((m) => /more than/.test(m))).toEqual([]);
    expect(errorsOf(fence(terms(150)), UNTRUSTED_LIMITS).some((m) => /more than 100 terms/.test(m))).toBe(true);
    expect(check(parse(fence(terms(30)), { path: "p.dh.md", limits: { glossaryTerms: 20 } as any })).some((p) => /more than 20 terms/.test(p.message))).toBe(true);
  });
  test("over the part's work budget: the block is an error block with the part's name, the LLM view says so", () => {
    const doc = parse(fence(Array.from({ length: 4000 }, () => "not a term line at all").join("\n")), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } as any });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the glossary part does too much work/);
    expect(doc.llm).toContain("[glossary not shown: the glossary part does too much work");
  });
});

describe("glossary: linear (the doubling test, charges counted; and time)", () => {
  const lim = { glossaryTerms: 1e9, glossaryLabel: 60, glossaryDef: 600, glossaryAliases: 5 };
  const block = (n: number) => Array.from({ length: n }, (_, k) => `term "Name ${k}" also "alias ${k}": the meaning of number ${k} with \`code\`, **bold** and a [link](https://example.com/${k})`).join("\n");
  test("a block: twice the lines cost at most about twice, at three sizes", () => {
    const cost = (n: number) => { const b = big(); parseGlossaryBlock(block(n), 1, lim, b); return b.steps + b.values + b.chars; };
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once (no scan per start)", () => {
    const l2 = { ...lim, glossaryTerms: 200, glossaryDef: 1e9 };
    for (const f of [(n: number) => `term "A": ${"*a ".repeat(n)}`, (n: number) => `term "A": ${"[a](http://".repeat(n)}`, (n: number) => `term "A": ${"`a ".repeat(n)}`, (n: number) => `term "A"${" ".repeat(n)}x`]) {
      const a = big(), b = big();
      parseGlossaryBlock(f(100), 1, l2, a);
      parseGlossaryBlock(f(200), 1, l2, b);
      expect(b.steps / a.steps).toBeLessThan(2.3);
    }
  });
  test("the segments of one long meaning: time at n and 2n (best of five)", () => {
    for (const unit of ["*a ", "[a](http://", "`a ", "**a *a "]) {
      const best = (n: number) => { let m = Infinity; for (let k = 0; k < 5; k++) { const t0 = performance.now(); defSegs(unit.repeat(n)); m = Math.min(m, performance.now() - t0); } return m; };
      expect(best(40_000) / Math.max(best(20_000), 0.3)).toBeLessThan(3.5);
    }
  });
  const names = (n: number) => Array.from({ length: n }, (_, k) => term(`name ${k} x`, { id: `n${k}` }));
  const text = (n: number) => "name 1 x name 12 x name 5 xx name 199 x nam name  ".repeat(n);
  test("the matcher: twice the text costs at most about twice (steps), at three sizes", () => {
    const m = matcher(names(200))!;
    const cost = (n: number) => { const b = big(); m.find(text(n), b); return b.steps; };
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.8); expect(r).toBeLessThan(2.3); }
  });
  test("the matcher: twice the names do not make the same text cost twice as much (one walk, whatever the names)", () => {
    const cost = (k: number) => { const b = big(); matcher(names(k))!.find(text(200), b); return b.steps; };
    expect(cost(200) / cost(100)).toBeLessThan(1.5);
  });
  test("the matcher in time: twice the text takes at most about twice as long, near-matches and many names", () => {
    const m = matcher(names(200))!;
    const best = (n: number) => { let t = Infinity; for (let k = 0; k < 5; k++) { const t0 = performance.now(); m.find(text(n), big()); t = Math.min(t, performance.now() - t0); } return t; };
    expect(best(4000) / Math.max(best(2000), 0.5)).toBeLessThan(3.5);
  });
  test("hostile: names that are suffixes of each other cannot cost more than the scan's budget; the page says so and the text stays plain", () => {
    const hostile = Array.from({ length: 60 }, (_, k) => `term x${k} "${"+".repeat(k + 1)}": m`).join("\n");
    const doc = parse(`# P\n\n\`\`\`glossary\n${hostile}\n\`\`\`\n\n${"+".repeat(5000)}\n`, { path: "p.dh.md" });
    expect(doc.problems.some((p) => /^glossary: the glossary part does too much work/.test(p.message))).toBe(true);
  });
});

describe("glossary: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, the block drawn, terms marked`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "glossary").length).toBeGreaterThan(0);
      expect(marks(doc).length).toBeGreaterThan(3);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, in both sets, within its budget`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits: limits as any });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the glossary part");
      expect(() => parseGlossaryBlock(text, 1, L, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(glossary.name).toBe("glossary");
  expect(glossary.steps).toBe(false);
  expect(inline.name).toBe("glossary");
});

describe("glossary: a host's word list (ParseOptions.glossary)", () => {
  const HOST = [{ term: "SLA", aliases: ["service level agreement"], def: "what we promise a customer" }, { term: "UL", def: "the host's meaning" }];
  const page = (text: string, block = "") => `# Page\n\n${block ? `\`\`\`glossary\n${block}\n\`\`\`\n\n` : ""}${text}\n`;
  test("the host's terms are marked in the text, the page's own definition wins, and a host-only page has no link", () => {
    const doc = parse(page("The SLA and a service level agreement; UL too.", 'term "UL": the page\'s meaning'), { path: "p.dh.md", glossary: HOST });
    expect(marks(doc)).toEqual([{ text: "SLA", id: "sla" }, { text: "UL", id: "ul" }]);
    const refs: any[] = []; for (const b of (doc.blocks.find((x) => x.type === "markdown" && (x as any).md.some((m: any) => m.t === "p")) as any).md[0].c) if (b.t === "ref") refs.push(b.data);
    expect(refs.map((d) => [d.id, d.plain, d.link])).toEqual([["sla", "what we promise a customer", ""], ["ul", "the page's meaning", "#dh-term-ul"]]);
    expect(check(doc).filter((p) => p.level === "error")).toEqual([]);
  });
  test("a host term that meets a page term by an other name is left out without a problem", () => {
    const doc = parse(page("SLA and UL", 'term x "SLA": the page'), { path: "p.dh.md", glossary: [{ term: "Other", aliases: ["sla"], def: "host" }] });
    expect(marks(doc)).toEqual([{ text: "SLA", id: "x" }]);
    expect(check(doc).filter((p) => p.level === "error")).toEqual([]);
  });
  test("the LLM view lists the host's terms once, after the front matter, and not the ones the page defines", () => {
    const doc = parse(`---\ntitle: T\n---\n${page("SLA UL", 'term "UL": mine')}`, { path: "p.dh.md", glossary: HOST });
    expect(doc.llm.match(/- \*\*SLA\*\*/g)?.length).toBe(1);
    expect(doc.llm).toContain("Glossary (from the site):\n- **SLA** (also: service level agreement): what we promise a customer");
    expect(doc.llm).not.toContain("the host's meaning");
    expect(doc.llm.indexOf("Glossary (from the site)")).toBeLessThan(doc.llm.indexOf("# Page"));
    expect(doc.llm.match(/- \*\*UL\*\*/g)?.length).toBe(1);
    expect(parse("# P\n\nno list", { path: "p.md" }).llm).not.toContain("from the site");
  });
  test("an unused host term is no warning (a site list is long)", () => {
    expect(check(parse("# P\n\nSLA only\n", { path: "p.md", glossary: HOST })).filter((p) => p.level === "warn")).toEqual([]);
  });
  const errs = (g: unknown, limits: any = LIMITS) => check(parse("# P\n\nSLA\n", { path: "p.md", glossary: g as any, limits })).filter((p) => p.level === "error").map((p) => p.message);
  test("checked like the page's own terms, with the same caps; each refusal names the fix", () => {
    expect(errs("x").some((m) => /the host's glossary: is a list of \{ term, aliases, def \}/.test(m))).toBe(true);
    expect(errs([3]).some((m) => /entry 1 is not/.test(m))).toBe(true);
    expect(errs([{ def: "x" }]).some((m) => /entry 1 needs a term as text/.test(m))).toBe(true);
    expect(errs([{ term: "A" }]).some((m) => /"A" needs its meaning as text/.test(m))).toBe(true);
    expect(errs([{ term: "n".repeat(61), def: "x" }]).some((m) => /at most 60 characters/.test(m))).toBe(true);
    expect(errs([{ term: "A", def: "x".repeat(601) }]).some((m) => /at most 600 characters/.test(m))).toBe(true);
    expect(errs([{ term: "A", def: "x".repeat(401) }], UNTRUSTED_LIMITS).some((m) => /at most 400 characters/.test(m))).toBe(true);
    expect(errs([{ term: "A", aliases: "b", def: "x" }]).some((m) => /other names of "A" are a list of text/.test(m))).toBe(true);
    expect(errs([{ term: "A", aliases: ["a", "b", "c", "d", "e", "f"], def: "x" }]).some((m) => /more than 5 other names/.test(m))).toBe(true);
    expect(errs([{ term: "A", def: "x" }, { term: "a", def: "y" }]).some((m) => /the term "a" is defined twice/.test(m))).toBe(true);
    const many = Array.from({ length: 30 }, (_, i) => ({ term: `T${i}`, def: "m" }));
    expect(check(parse("# P\n\nT1\n", { path: "p.md", glossary: many, limits: { glossaryTerms: 20 } as any })).some((p) => /more than 20 terms/.test(p.message))).toBe(true);
    expect(errs(many, UNTRUSTED_LIMITS)).toEqual([]);
    expect(errs(Array.from({ length: 120 }, (_, i) => ({ term: `T${i}`, def: "m" })), UNTRUSTED_LIMITS).some((m) => /more than 100 terms/.test(m))).toBe(true);
  });
  test("the host's list is part of the work: a spent budget stops the glossary, not the page", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ term: `Term number ${i}`, def: "m" }));
    const doc = parse("# P\n\ntext\n", { path: "p.md", glossary: many, limits: { maxEvalSteps: 50 } as any });
    expect(doc.problems.some((p) => /^glossary: the glossary part does too much work/.test(p.message))).toBe(true);
  });
});

describe("glossary: anchors carry the page's id prefix", () => {
  const src = `# Page\n\n\`\`\`glossary\nterm "UL": the words\n\`\`\`\n\nUL here\n`;
  const html = (idPrefix: string) => {
    const doc = parse(src, { path: "p.dh.md", idPrefix });
    const b = doc.blocks.find((x) => x.type === "glossary") as any;
    const list = renderToStaticMarkup(React.createElement(GlossaryView, { data: b.data, block: b, ui: {} as any, static: undefined, stage: { width: 600, theme: "light", motion: "on", report() {} } }));
    const m = marks(doc); expect(m.length).toBe(1);
    const ref = (doc.blocks.find((x) => x.type === "markdown" && (x as any).md.some((y: any) => y.t === "p")) as any).md.find((y: any) => y.t === "p").c.find((y: any) => y.t === "ref");
    return { list, link: ref.data.link as string };
  };
  test("two documents on one page, each with its own prefix, share no anchor id, and the card's link points at its own", () => {
    const a = html("a-"), b = html("b-");
    expect(a.list).toContain('id="a-term-ul"'); expect(b.list).toContain('id="b-term-ul"');
    expect(a.list).not.toContain("b-term"); expect(b.list).not.toContain("a-term");
    expect([a.link, b.link]).toEqual(["#a-term-ul", "#b-term-ul"]);
  });
  test("the default prefix is dh-, an empty one is allowed", () => {
    expect(html("dh-").link).toBe("#dh-term-ul");
    expect(html("").link).toBe("#term-ul");
  });
  test("check() reads the same prefix as parse()", () => {
    const doc = parse(src, { path: "p.dh.md", idPrefix: "z-" });
    expect(check(doc).filter((p) => p.level === "error")).toEqual([]);
    expect((doc.blocks.find((x) => x.type === "glossary") as any).data.idPrefix).toBe("z-");
  });
});
