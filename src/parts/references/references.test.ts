// The citations part: the `references` block and the `[@key]` marks: parse, the numbering and order, the LLM view, every refusal, its
// caps in both sets, the doubling test (budget charges counted at n and 2n, never time), the views, and the fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget } from "../../core/budget";
import refs, { type RefsData } from "./part";
import cite, { type CiteMark } from "./inline";
import ReferencesView from "./view";
import ReferencesInline from "./inline-view";
import { citeGroups, citeLabel, formatRef, isDoi, parseRefs, plainRef, quoteScalars, refDoc, urlOk, withoutCode, capsOf } from "./format";

const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const LIST = `- id: smith2020
  author: Smith, Jane; Lee, Kim
  title: A study of marks
  in: Journal of Studies
  year: 2020
  volume: 12
  issue: 3
  pages: 10-20
  doi: 10.1234/jbs.2020.4
- id: lee2019
  author: Lee, Kim
  title: Notes on lists
  type: web
  publisher: Example Press
  year: 2019
  url: https://example.com/notes
  accessed: 2026-11-20`;
const page = (text: string, style = "apa", list = LIST) => `# Page\n\n${text}\n\n\`\`\`references style=${style}\n${list}\n\`\`\`\n`;
const doc = (src: string, limits?: Record<string, number>) => parse(src, { path: "p.dh.md", ...(limits ? { limits: limits as any } : {}) });
const msgs = (d: ReturnType<typeof parse>, level?: "error" | "warn") => check(d).filter((p) => !level || p.level === level).map((p) => p.message);
function marks(d: ReturnType<typeof parse>): { text: string; data: CiteMark }[] {
  const out: { text: string; data: CiteMark }[] = [];
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (o.t === "ref" && o.name === "references") out.push({ text: String(o.text), data: o.data as CiteMark });
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  for (const b of d.blocks) walk(b);
  return out;
}
const block = (d: ReturnType<typeof parse>): RefsData => { const b = d.blocks.find((x) => x.type === "references"); if (!b || b.type !== "references") throw new Error("no references block"); return b.data as RefsData; };

describe("references: parse and numbering", () => {
  test("marks are ref nodes with their label, and a group is one node", () => {
    const d = doc(page("See [@smith2020, p. 12] and [@smith2020; @lee2019]."));
    const m = marks(d);
    expect(m.map((x) => x.text)).toEqual(["[@smith2020, p. 12]", "[@smith2020; @lee2019]"]);
    expect(m[0].data.cites.map((c) => c.label)).toEqual(["Smith & Lee, 2020, p. 12"]);
    expect(m[1].data.cites.map((c) => c.label)).toEqual(["Smith & Lee, 2020", "Lee, 2019"]);
    expect(m[1].data.cites.map((c) => c.id)).toEqual(["dh-cite-smith2020-2", "dh-cite-lee2019-1"]);
    expect(check(d)).toEqual([]);
    expect(JSON.parse(JSON.stringify(m[0].data))).toEqual(m[0].data);
  });
  test("the list is sorted for apa, with its uses, and the anchors carry the id prefix", () => {
    const d = doc(page("[@smith2020] [@smith2020] [@lee2019]"));
    const b = block(d);
    expect(b.entries.map((e) => [e.id, e.uses])).toEqual([["lee2019", 1], ["smith2020", 2]]);
    expect(b.idPrefix).toBe("dh-");
  });
  test("ieee numbers by first cite, in the text and in the list", () => {
    const d = doc(page("first [@smith2020] then [@lee2019] then [@smith2020]", "ieee"));
    expect(marks(d).map((x) => x.data.cites.map((c) => c.label))).toEqual([["1"], ["2"], ["1"]]);
    expect(block(d).entries.map((e) => [e.id, e.num])).toEqual([["smith2020", 1], ["lee2019", 2]]);
    expect(marks(d)[0].data.style).toBe("ieee");
  });
  test("chicago labels", () => {
    const d = doc(page("[@smith2020, pp. 3-5]", "chicago"));
    expect(marks(d)[0].data.cites[0].label).toBe("Smith and Lee 2020, 3-5");
  });
  test("a cite in code, a link or a heading is left alone; a cite before the list still works", () => {
    const d = doc(`# Title [@smith2020]\n\nBefore [@lee2019] and \`[@x]\` and [a link](http://example.com) [@smith2020](http://example.com).\n\n${"```references\n" + LIST + "\n```"}\n`);
    expect(marks(d).map((x) => x.text)).toEqual(["[@lee2019]"]);
    expect(msgs(d, "error")).toEqual([]);
  });
  test("a mark in a list item, a quote and a table cell", () => {
    const d = doc(page("- item [@smith2020]\n\n> quote [@lee2019]\n\n| a |\n| --- |\n| [@smith2020] |"));
    expect(marks(d).length).toBe(3);
  });
  test("every value is text: 10-20, 2020 and a date stay as written", () => {
    expect(quoteScalars("- id: a\n  pages: 10-20\n  year: 2020\n  accessed: 2026-11-20\n  title: \"Q: x\"\n  note: it's # comment")).toBe("- id: 'a'\n  pages: '10-20'\n  year: '2020'\n  accessed: '2026-11-20'\n  title: \"Q: x\"\n  note: 'it''s'");
    const r = parseRefs(LIST, {}, 1, capsOf(LIMITS), big());
    expect(r.problems).toEqual([]);
    expect(r.refs[0].pages).toBe("10-20");
    expect(r.refs[0].year).toBe("2020");
  });
});

describe("references: the formatter", () => {
  const r = parseRefs(LIST, {}, 1, capsOf(LIMITS), big()).refs;
  test("apa, chicago and ieee entries", () => {
    expect(plainRef(r[0], "apa")).toBe("Smith, J., & Lee, K. (2020). A study of marks. Journal of Studies, 12(3), 10-20. https://doi.org/10.1234/jbs.2020.4");
    expect(plainRef(r[0], "chicago")).toBe("Smith, Jane, and Kim Lee. 2020. “A study of marks.” Journal of Studies 12 (3): 10-20. https://doi.org/10.1234/jbs.2020.4");
    expect(plainRef(r[0], "ieee")).toBe("J. Smith and K. Lee, “A study of marks,” Journal of Studies, vol. 12, no. 3, pp. 10-20, 2020, doi: 10.1234/jbs.2020.4.");
    expect(plainRef(r[1], "apa")).toContain("Retrieved November 20, 2026, from https://example.com/notes");
  });
  test("journals and books are italic segments; the link is its own segment; page ranges take an en dash on screen", () => {
    const segs = formatRef(r[0], "apa");
    expect(segs.some((s) => s.i && s.t === "Journal of Studies")).toBe(true);
    expect(segs.some((s) => s.href === "https://doi.org/10.1234/jbs.2020.4")).toBe(true);
    expect(segs.map((s) => s.t).join("")).toContain("10–20");
  });
  test("labels", () => {
    expect(citeLabel(r[0], "apa", 1, "p. 12")).toBe("Smith & Lee, 2020, p. 12");
    expect(citeLabel(r[0], "ieee", 3, "")).toBe("3");
    expect(citeLabel(r[0], "ieee", 3, "p. 4")).toBe("3, p. 4");
  });
  test("the hand scans", () => {
    expect(isDoi("10.1234/jbs.2020.4")).toBe(true);
    expect(isDoi("https://doi.org/10.1234/x")).toBe(false);
    expect(urlOk("https://example.com/a")).toBe(true);
    expect(urlOk("javascript:alert(1)")).toBe(false);
    expect(urlOk("data:text/html,x")).toBe(false);
    expect(citeGroups("a [@x] b [@y, p. 2; @z] c [@w](u) d [@q]: e [@r][s] [@ ] [@x;] ").map((g) => g.cites.map((c) => `${c.key}|${c.locator}`).join(";"))).toEqual(["x|", "y|p. 2;z|"]);
    expect(withoutCode("a `[@x]` b ```\n[@y]\n``` [@z]")).toContain("[@z]");
    expect(withoutCode("a `[@x]` b")).not.toContain("[@x]");
  });
});

describe("references: the LLM view", () => {
  test("the marks as written and the list as References", () => {
    const d = doc(page("See [@smith2020, p. 12]."));
    expect(d.llm).toContain("See [@smith2020, p. 12].");
    expect(d.llm).toContain("References:\n- [lee2019] Lee, K. (2019).");
    expect(d.llm).toContain("- [smith2020] Smith, J., & Lee, K. (2020).");
  });
});

describe("references: refusals", () => {
  test("a key not in the list: the nearest key is named, the text stays as written", () => {
    const d = doc(page("Bad [@smithe2020] here."));
    expect(msgs(d, "error")).toContain("references: [@smithe2020] is not in the references list (did you mean smith2020?)");
    expect(marks(d)).toEqual([]);
  });
  test("a cite with no references block", () => {
    const d = doc("# P\n\nSee [@smith2020].\n");
    expect(msgs(d, "error").some((m) => /has no references block|no references block/.test(m))).toBe(true);
  });
  test("two references blocks", () => {
    const d = doc(page("[@smith2020]") + "\n```references\n- id: z\n  title: Z\n  author: Zed\n  year: 2020\n```\n");
    expect(msgs(d, "error").some((m) => /two references blocks/.test(m))).toBe(true);
  });
  const bad = (list: string, style = "apa") => msgs(doc(page("x", style, list)), "error");
  test.each([
    ["- id: a\n  author: A\n  year: 2020", /reference a has no title/],
    ["- id: a\n  title: T\n  year: 2020", /reference a has no author/],
    ["- id: a\n  title: T\n  author: A\n  year: 20x", /year is four digits/],
    ["- id: a\n  title: T\n  author: A\n  year: 2020\n  type: film", /unknown type "film"/],
    ["- id: a\n  title: T\n  author: A\n  year: 2020\n  colour: red", /unknown key "colour"/],
    ["- id: a\n  title: T\n  author: A\n  year: 2020\n- id: a\n  title: U\n  author: B\n  year: 2020", /used twice/],
    ["- id: a\n  title: T\n  author: A\n  year: 2020\n  doi: https://doi.org/10.1234/x", /bare DOI/],
    ["- id: a\n  title: T\n  author: A\n  year: 2020\n  url: javascript:alert(1)", /not an http or https link/],
    ["- id: a\n  title: T\n  author: A\n  year: 2020\n  url: data:text/html,x", /not an http or https link/],
    ["- id: a\n  title: T\n  author: A\n  year: 2020\n  accessed: yesterday", /accessed is a date/],
    ["- id: a b\n  title: T\n  author: A\n  year: 2020", /no spaces/],
    ["just words", /needs entries/],
  ])("%s", (list, want) => { expect(bad(list).some((m) => (want as RegExp).test(m))).toBe(true); });
  test("an unknown style", () => { expect(bad(LIST, "mla").some((m) => /unknown style "mla"/.test(m))).toBe(true); });
  test("a web page may give a publisher instead of an author; a missing year warns", () => {
    const d = doc(page("x", "apa", "- id: a\n  type: web\n  title: T\n  publisher: P\n  url: https://example.com"));
    expect(msgs(d, "error")).toEqual([]);
    expect(msgs(d, "warn").some((m) => /no year; it shows as "n\.d\."/.test(m))).toBe(true);
  });
  test("a reference never cited warns", () => {
    expect(msgs(doc(page("[@smith2020]")), "warn").some((m) => /"lee2019" is never cited/.test(m))).toBe(true);
  });
});

describe("references: caps", () => {
  test("the keys are in both sets, and the strict set is never higher", () => {
    for (const k of ["referencesEntries", "referencesAuthors", "referencesText", "referencesCites"] as const) {
      expect(typeof (LIMITS as any)[k]).toBe("number");
      expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
    }
  });
  test("entries over the cap are refused, also with a host's lower cap", () => {
    const many = Array.from({ length: 5 }, (_, i) => `- id: k${i}\n  title: T${i}\n  author: A\n  year: 2020`).join("\n");
    expect(msgs(doc(page("x", "apa", many), { ...LIMITS, referencesEntries: 4 }), "error").some((m) => /5 references; the most is 4/.test(m))).toBe(true);
    expect(msgs(doc(page("x", "apa", many)), "error")).toEqual([]);
  });
  test("cites over the cap stay as written", () => {
    const d = doc(page("[@smith2020] [@smith2020] [@smith2020]"), { ...LIMITS, referencesCites: 2 });
    expect(marks(d).length).toBe(2);
    expect(msgs(d).some((m) => /more than 2 cites/.test(m) || /more cites than the page allows/.test(m))).toBe(true);
  });
  test("a fence over the budget is an error block named for the part", () => {
    const d = doc(page("x"), { ...LIMITS, maxEvalSteps: 3 });
    expect(d.llm).toMatch(/\[references not shown:|references part|too much work/);
  });
});

describe("references: linear (the doubling test, charges counted)", () => {
  const run = (text: string): number => {
    const st = cite.prepare!({ frontMatter: {}, blocks: [{ body: LIST, bodyLine: 3, line: 2, attrs: {}, head: "", steps: [] }], limits: LIMITS, budget: big(), idPrefix: "dh-", options: {} })!;
    const b = big();
    cite.scan!(text, st, b);
    return b.steps + b.values + b.chars;
  };
  test("marks: twice the text costs about twice, at three sizes", () => {
    for (const n of [50, 200, 800]) {
      const body = (k: number) => "some words [@smith2020, p. 1] and ".repeat(k);
      const r = run(body(2 * n)) / run(body(n));
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("openers with no closer are read once", () => {
    for (const n of [200, 800, 3200]) {
      // no "]" anywhere: the one search finds none and the scan stops (it never grows faster than the text)
      expect(run("[@a ".repeat(2 * n)) / run("[@a ".repeat(n))).toBeLessThan(2.3);
    }
  });
  test("citeGroups on openers with no closer: one search", () => {
    const b = big();
    citeGroups("[@a ".repeat(5000), b);
    expect(b.steps).toBeLessThan(5000 * 12);
  });
  test("the list: twice the entries costs about twice", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => `- id: k${i}\n  title: T${i}\n  author: A, B\n  year: 2020`).join("\n");
    const cost = (n: number) => { const b = big(); const r = parseRefs(list(n), {}, 1, capsOf({ ...LIMITS, referencesEntries: 1e9 }), b); refDoc(r.refs, r.style, ["[@k1] [@k2]"], capsOf(LIMITS), b); return b.steps + b.values + b.chars; };
    for (const n of [20, 80, 320]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
});

describe("references: the views", () => {
  const d = doc(page("See [@smith2020, p. 12] and [@smith2020; @lee2019].", "ieee"));
  test("the list: entries with anchors, numbers in ieee, cited N times with links back", () => {
    const html = renderToStaticMarkup(React.createElement(ReferencesView, { data: block(d), block: {} as any, ui: {} as any, static: undefined, stage: { width: 600, theme: "light", motion: "on", report() {} } }));
    expect(html).toContain('id="dh-ref-smith2020"');
    expect(html).toContain("[1] ");
    expect(html).toContain("cited 2 times");
    expect(html).toContain('href="#dh-cite-smith2020-2"');
    expect(html).toContain('href="https://example.com/notes"');
    expect(html).not.toMatch(/<script|javascript:/);
  });
  test("a mark: buttons inside brackets (ieee) or parentheses (apa); the card is not drawn until opened", () => {
    const m = marks(d)[1];
    const html = renderToStaticMarkup(React.createElement(ReferencesInline, { text: m.text, data: m.data, ui: {} as any, static: undefined }));
    expect(html).toContain('id="dh-cite-smith2020-2"');
    expect(html).toContain("], [");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("dh-pop");
    const apa = marks(doc(page("[@smith2020; @lee2019]")))[0];
    expect(renderToStaticMarkup(React.createElement(ReferencesInline, { text: apa.text, data: apa.data, ui: {} as any, static: undefined }))).toContain("(<button");
  });
});

describe("references: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every mark drawn`, () => {
      const d = parse(text, { path: f });
      expect(check(d)).toEqual([]);
      expect(marks(d).length).toBe(5);
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
  expect(refs.name).toBe("references");
  expect(cite.name).toBe("references");
});
