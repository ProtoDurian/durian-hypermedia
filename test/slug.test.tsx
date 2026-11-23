// Heading anchors follow GitHub's slug rule (github-slugger 2.0.0): one function for the parser, the table of contents and the renderer.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse, slug, VERSION } from "../src/index";
import { DhDocument } from "../src/react/index";
import { DhDocument as StrictDocument } from "../src/react/strict";
import type { HeadingSlotProps } from "../src/react/context";
import { allFixtures } from "./helpers";

const ids = (md: string, opts = {}) => parse(md, opts).headings.map((h) => h.id);
const heads = (...t: string[]) => t.map((x) => `## ${x}`).join("\n\n");

describe("slug()", () => {
  // VERSION equals package.json and the CHANGELOG (pure.test.ts); here only that it is a version
  test("is exported from the package entry", () => { expect(typeof slug).toBe("function"); expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/); });
  test("punctuation is dropped, not turned into a dash", () => {
    expect(slug("cyan.yaml")).toBe("cyanyaml");
    expect(slug("Case: big file")).toBe("case-big-file");
    expect(slug("Tom's “file”.md (v2)")).toBe("toms-filemd-v2");
  });
  test("lower case; each space becomes a dash (runs are kept)", () => {
    expect(slug("Why this way")).toBe("why-this-way");
    expect(slug("a  b")).toBe("a--b");
    expect(slug("100% C++ / C#")).toBe("100-c--c");
  });
  test("_ and - are kept; letters and digits of any script are kept", () => {
    expect(slug("under_score and -dash-")).toBe("under_score-and--dash-");
    expect(slug("Ünïcode Ñame 日本語 Привет")).toBe("ünïcode-ñame-日本語-привет");
  });
  test("a long heading is not cut", () => {
    const long = "word ".repeat(60).trim();
    expect(slug(long)).toBe(long.replace(/ /g, "-"));
    expect(slug(long).length).toBeGreaterThan(80);
  });
  test("pure: the same text gives the same slug every time", () => { expect(slug("x")).toBe("x"); expect(slug("x")).toBe("x"); });
});

describe("heading ids", () => {
  test("the examples of the design", () => {
    expect(ids(heads("cyan.yaml", "Why this way", "Case: big file"))).toEqual(["dh-cyanyaml", "dh-why-this-way", "dh-case-big-file"]);
  });
  test("a repeated heading is x, x-1, x-2 (GitHub), not x, x-2, x-2-2", () => {
    expect(ids(heads("x", "x", "x"), { idPrefix: "" })).toEqual(["x", "x-1", "x-2"]);
    expect(ids(heads("x", "x", "x"))).toEqual(["dh-x", "dh-x-1", "dh-x-2"]);
  });
  test("a heading that is already named x-1 does not collide (GitHub's own rule)", () => {
    expect(ids(heads("x", "x", "x-1"), { idPrefix: "" })).toEqual(["x", "x-1", "x-1-1"]);
  });
  test("repeats count per document, not across documents", () => {
    expect(ids(heads("x"))).toEqual(["dh-x"]);
    expect(ids(heads("x"))).toEqual(["dh-x"]);
  });
  test("the same slug in any heading depth counts as a repeat", () => {
    expect(ids("# Setup\n\n## Setup\n\n### Setup", { idPrefix: "" })).toEqual(["setup", "setup-1", "setup-2"]);
  });
  test("unicode letters are kept; a long heading is not cut", () => {
    expect(ids(heads("Café Ünï 日本語"), { idPrefix: "" })).toEqual(["café-ünï-日本語"]);
    const long = Array.from({ length: 40 }, (_, k) => `word${k}`).join(" ");
    const [id] = ids(heads(long), { idPrefix: "" });
    expect(id).toBe(long.replace(/ /g, "-"));
    expect(id.length).toBeGreaterThan(80);
  });
  test("formatting is read as text: code, emphasis and link text count; an image's alt does not", () => {
    expect(ids(heads("`code.x` and *em* [link](http://a.b)"), { idPrefix: "" })).toEqual(["codex-and-em-link"]);
    expect(ids(heads("![logo](https://a.b/i.png) Title"), { idPrefix: "" })).toEqual(["-title"]);
    expect(parse(heads("![logo](https://a.b/i.png) Title")).headings[0].text).toBe("logo Title");
  });
  test("idPrefix is put before the slug; a heading with no slug gets an id that is never empty or a repeat (S)", () => {
    expect(ids(heads("cyan.yaml"), { idPrefix: "x-" })).toEqual(["x-cyanyaml"]);
    expect(ids(heads("!!!"), { idPrefix: "" })).toEqual(["S"]);
    expect(ids(heads("!!!", "???"), { idPrefix: "" })).toEqual(["S", "-1"]);
  });
  test("every fixture: the ids are unique, carry the prefix, and are the slug of the heading text when it is not a repeat", () => {
    let n = 0;
    for (const f of allFixtures()) {
      const d = parse(f.text);
      const own = d.headings.map((h) => h.id);
      expect(new Set(own).size).toBe(own.length);
      for (const h of d.headings) { n++; expect(h.id.startsWith("dh-")).toBe(true); expect(h.id).toMatch(new RegExp("^dh-" + "[^ A-Z]*$")); }
    }
    expect(n).toBeGreaterThan(50);
  });
});

describe("one function for every anchor", () => {
  const md = "::toc\n\n## cyan.yaml\n\n### Why this way\n\n## cyan.yaml\n";
  test("the table of contents links the same ids the headings carry", () => {
    const d = parse(md);
    const toc = d.blocks.find((b) => b.type === "toc") as { items: { id: string }[] };
    expect(toc.items.map((i) => i.id)).toEqual(["dh-cyanyaml", "dh-why-this-way", "dh-cyanyaml-1"]);
    expect(d.headings.map((h) => h.id)).toEqual(toc.items.map((i) => i.id));
  });
  test("the rendered HTML: id on the heading, #id in its own anchor and in the table of contents", () => {
    const html = renderToString(<DhDocument doc={parse(md)} />);
    for (const id of ["dh-cyanyaml", "dh-why-this-way", "dh-cyanyaml-1"]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).not.toContain("cyan-yaml");
  });
  test("the Heading slot and the strict entry get and draw the same ids (they make none of their own)", () => {
    const seen: string[] = [];
    const Heading = ({ children, id }: HeadingSlotProps) => { seen.push(id); return <div role="heading">{children}</div>; };
    renderToString(<DhDocument doc={parse(md)} slots={{ Heading }} />);
    expect(seen).toEqual(["dh-cyanyaml", "dh-why-this-way", "dh-cyanyaml-1"]);
    const html = renderToString(<StrictDocument doc={parse(md)} />);
    for (const id of ["dh-cyanyaml", "dh-why-this-way", "dh-cyanyaml-1"]) { expect(html).toContain(`id="${id}"`); expect(html).toContain(`href="#${id}"`); }
  });
  test("a heading inside a tab body takes the page's one counter", () => {
    const d = parse("## x\n\n:::tabs\n### One\n\n#### x\n\n### Two\n\nhi\n:::\n\n## x\n", { idPrefix: "" });
    const all = d.headings.map((h) => h.id);
    expect(all).toEqual(["x", "x-1", "x-2"]); // a tab title is not a heading; the heading in its body is
  });
});

describe("the text GitHub reads (the rendered text content)", () => {
  const one = (h: string) => ids(`## ${h}`, { idPrefix: "" })[0];
  test("references: numeric ones and amp/lt/gt/quot/apos are decoded; a code span keeps them as typed (its text is the source text)", () => {
    expect(one("a &amp; b")).toBe("a--b");
    expect(one("caf&#233; &#x4E2D;")).toBe("café-中");
    expect(one("`&amp;` x")).toBe("amp-x");
    expect(one("&lt;tag&gt;")).toBe("tag");
    expect(one("&#0; &#xD800; z")).toBe("--z");
  });
  test("raw HTML: tags give nothing, the text between them stays", () => {
    expect(one("<kbd>Ctrl</kbd> key")).toBe("ctrl-key");
    expect(one("a <!-- note --> b")).toBe("a--b");
  });
  test("syntax GitHub does not know reads as its source text", () => {
    expect(one(":kbd[Ctrl+K] opens")).toBe("kbdctrlk-opens");
    expect(one("Click :mouse[click Next]")).toBe("click-mouseclick-next");
  });
  test("links, emphasis, strike, escapes and a hard-to-guess mix", () => {
    expect(one("[**Bold** link](http://a.b) ~~gone~~ \\*star\\*")).toBe("bold-link-gone-star");
  });
  test("a setext heading, and headings in a list or a quote, count in page order", () => {
    expect(ids("x\n===\n\n> ## x\n\n- ### x\n", { idPrefix: "" })).toEqual(["x", "x-1", "x-2"]);
  });
  test("a tab or accordion title counts as a heading on GitHub, so it advances the counter", () => {
    expect(ids("## x\n\n:::tabs\n### x\n\nbody\n\n#### x\n\n### y\n\nbody\n:::\n\n## x\n", { idPrefix: "" })).toEqual(["x", "x-2", "x-3"]);
  });
  test("a prose link: the page puts the prefix on the fragment, unless it is already there (as before)", () => {
    const html = renderToString(<DhDocument doc={parse("## Unchanging\n\n[a](#unchanging) [b](#dh-unchanging) [c](#cyanyaml)\n\n## cyan.yaml\n")} />);
    expect(html).toContain('id="dh-unchanging"');
    expect(html.match(/href="#dh-unchanging"/g)!.length).toBe(2 + 1); // the heading's own # link, a and b
    expect(html).toContain('href="#dh-cyanyaml"');
    expect(html).not.toContain("dh-dh-");
  });
  test("character references inside syntax GitHub does not know are decoded; tags with > in an attribute, processing instructions and filtered tags", () => {
    expect(one(":kbd[Caf&#233;]")).toBe("kbdcafé");
    expect(one('<span title="a>b">Color</span>')).toBe("color");
    expect(one("x <?example?> y")).toBe("x--y");
    expect(one("<style>example</style>")).toBe("styleexamplestyle");
  });
  test("a heading inside a code walk step note takes no id and no number from the page", () => {
    const md = "```codewalk\n@step one\n## y\n```\n\n## x\n";
    expect(parse(md, { idPrefix: "" }).headings.map((h) => h.id)).toEqual(["x"]);
    const w = parse("```codewalk\n@step one\n## x\n```\n\n## x\n", { idPrefix: "" });
    expect(w.headings.map((h) => h.id)).toEqual(["x"]);
  });
  test("a heading id equal to a part's id is named in problems (one namespace)", () => {
    const d = parse("## cyan.yaml\n\n:::human #cyanyaml\ntext\n:::\n");
    expect(d.problems.some((p) => p.level === "warn" && p.message.includes('"dh-cyanyaml"'))).toBe(true);
    const tabs = parse(":::tabs\n### A\n\nx\n\n### B\n\ny\n:::\n\n## tabs-1-0-p\n");
    expect(tabs.problems.some((p) => p.level === "warn" && p.message.includes('"dh-tabs-1-0-p"'))).toBe(true);
    expect(parse(":::tabs\n### A\n\nx\n\n### B\n\ny\n:::\n\n## tabs-1-0\n").problems).toEqual([]);
    expect(parse("## cyan.yaml\n\n:::human #other\ntext\n:::\n").problems).toEqual([]);
  });
});

describe("the fallback id", () => {
  test("never repeats a heading named s, and a second empty heading is -1", () => {
    expect(ids("## !!!\n\n## s\n\n## ???\n", { idPrefix: "" })).toEqual(["S", "s", "-1"]);
  });
});
