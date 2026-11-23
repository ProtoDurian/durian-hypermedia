// Long inputs stay quick: each case once took seconds (work grew with the square of the input) and now grows with its
// length. The bounds are loose on purpose (a slow machine passes); the old code took many times longer.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse, check, llmView } from "../src/index";
import { DhDocument } from "../src/react/index";
import { parseTree, parseTermLines, madeUpFiles, parseDoc, isDefinition } from "../src/core/dh-lib";
import { checkDoc } from "../src/core/doccheck";

const F = "```";
const quick = (ms: number, f: () => unknown) => { const t0 = performance.now(); f(); expect(performance.now() - t0).toBeLessThan(ms); };
const all = (text: string) => { const d = parse(text); check(d); llmView(text, { publicView: true }); renderToString(<DhDocument doc={d} />); return d; };

describe("the format's own reading", () => {
  test("a fence that never closes inside a container", () => {
    let d: any;
    quick(1500, () => { d = all(`:::human\n${"```a\n".repeat(20_000)}:::\n`); });
    expect(d.problems[0].message).toMatch(/never closed/);
  });
});

describe("file trees", () => {
  test("notes and marks read the same", () => {
    const rows = parseTree("a.ts  # the note\nb/ (new) (closed)\n# only a note\nc.ts (new)#x\nd #\ne\u2028x # y").rows;
    expect(rows.map((r) => [r.name, r.note, r.badges.join(","), r.closed])).toEqual([
      ["a.ts", "the note", "", false], ["b/", "", "new", true], ["", "only a note", "", false], ["c.ts#x", "", "new", false], ["d #", "", "", false], ["e\u2028x", "y", "", false],
    ]);
  });
  test("a long line with long runs of spaces", () => {
    quick(1500, () => all(`${F}filetree\na${" ".repeat(60_000)}b (new)\n${"a # x".repeat(5_000)}\u2028b\n${F}\n`));
  });
});

describe("terminals", () => {
  test("a page's own prompts, longest first", () => {
    const defs = { marks: {}, prefixes: { ">": { label: "a", colour: "c1", means: "" }, ">>>": { label: "b", colour: "c1", means: "" } } };
    expect(parseTermLines(">>> x\n> y\n>> z\n>>>\n$ w", defs).map((l) => [l.k, l.prompt ?? "", l.text])).toEqual([
      ["cmd", ">>>", "x"], ["cmd", ">", "y"], ["out", "", ">> z"], ["cmd", ">>>", ""], ["cmd", "$", "w"],
    ]);
  });
  test("many prompts and many lines", () => {
    const n = 2_000;
    const text = `---\nprefixes:\n${Array.from({ length: n }, (_, i) => `  "p${i}": { colour: c1 }`).join("\n")}\n---\n${F}terminal\n${Array.from({ length: n }, (_, i) => `p${i} x`).join("\n")}\n${F}\n`;
    let d: any;
    // 2,000 prompts in front matter pass the YAML key cap (test/yaml-size.test.ts): raised here, as a host may
    const limits = { maxYamlNodes: 1e6, maxPageYamlNodes: 1e7, maxYamlChars: 1e7, maxPageYamlChars: 1e8 };
    quick(1500, () => { d = parse(text, { limits }); check(d, { limits }); llmView(text, { publicView: true, limits }); renderToString(<DhDocument doc={d} />); });
    expect(Object.keys(d.blocks[0].prefixes).length).toBe(n);
  });
});

describe("made-up files", () => {
  test("an @file line reads the same", () => {
    expect(madeUpFiles("@file a.ts (open)\nx\n@file  b.ts\ny\n@filec\n@file d\u2028e", 1).files.map((f) => [f.path, f.open])).toEqual([["a.ts", true], ["b.ts", false]]);
  });
  test("a long @file line", () => {
    quick(1500, () => all(`${F}editor\n@file ${"a".repeat(60_000)}\u2028\nx\n${F}\n`));
  });
});

describe("checks of prose", () => {
  test("key, mouse and file:line rules read the same", () => {
    const msgs = check("Press :kbd[Ctrl+K , Ctrl+S] then :kbd[] and :mouse[click OK]{x} and :mouse[wave] at src/a.ts:12 or b.rs.\n").map((p) => p.message);
    expect(msgs.some((m) => m.includes(":kbd[]"))).toBe(true);
    expect(msgs.some((m) => m.includes("no {attributes}"))).toBe(true);
    expect(msgs.some((m) => m.includes('"wave" is not a mouse action'))).toBe(true);
    expect(msgs.some((m) => m.includes('"src/a.ts:12"'))).toBe(true);
  });
  // the rules alone (the Markdown reader of parse() has tests of its own)
  const rules = (t: string) => { const issues: any[] = []; checkDoc(parseDoc("page.dh.md", t), undefined, issues); return issues; };
  test("long prose with many openers and no closers", () => {
    quick(1500, () => rules(":kbd[".repeat(30_000)));
    quick(1500, () => rules(":mouse[a]{".repeat(20_000)));
    quick(1500, () => rules("www.a".repeat(30_000)));
    quick(1500, () => rules(`:kbd[a${" ".repeat(60_000)}b]`));
    quick(1500, () => rules("](code:".repeat(30_000)));
  });
});

describe("tier lists and alignment grids", () => {
  test("a long line with long runs of spaces", () => {
    const ls = String.fromCharCode(0x2028);
    quick(1500, () => all(`${F}alignment\nx: a${" ".repeat(60_000)}b .. c\ny: d .. e\na / d: q\n${F}\n`));
    quick(1500, () => all(`${F}alignment\nx:${" ".repeat(60_000)}a${ls}\ny: d .. e\n${F}\n`));
    quick(1500, () => all(`${F}alignment\nx: a .. b\ny: c .. d\nq @ ${"1".repeat(60_000)}x, 1\n${F}\n`));
    quick(1500, () => all(`${F}tierlist\ntiers: ${"[".repeat(60_000)}]\nS: a\n${F}\n`));
    quick(1500, () => all(`${F}tierlist\nS: "a"${" ".repeat(60_000)}b${ls}\n${F}\n`));
  });
  test("many names on an axis and many cells", () => {
    const n = 6_000;
    // far over the cell limit, so the page shows the grid's source; the code block it renders in is timed elsewhere
    const text = `${F}alignment\nx: ${Array.from({ length: n }, (_, i) => "a" + i).join(" .. ")}\ny: b .. c\n${Array.from({ length: n }, (_, i) => `a${n - 1 - i} / b: q${i}`).join("\n")}\n${F}\n`;
    let d: any;
    quick(1500, () => { d = parse(text); check(d); llmView(text, { publicView: true }); });
    expect(d.blocks[0]).toMatchObject({ type: "error", part: "alignment" });
  });
  test("a message names at most a short list", () => {
    const names = Array.from({ length: 400 }, (_, i) => "t" + i);
    const d: any = parse(`${F}tierlist\ntiers: ${names.join(", ")}\nnope: a\n${F}\n`);
    const msg = d.blocks[0].tier.errors.map((e: any) => e.msg).find((m: string) => m.includes("there is no tier"));
    expect(msg.length).toBeLessThan(500);
    expect(msg).toContain("(400 in all)");
  });
});

describe("tables of contents", () => {
  test("a section table lists the h3s under its h2", () => {
    const d: any = parse("## a\n\n### b\n\n::toc section=1\n\n### c\n\n## d\n\n### e\n");
    expect(d.blocks.find((b: any) => b.type === "toc").items.map((h: any) => h.text)).toEqual(["b", "c"]);
  });
  test("many tables on a page with many headings", () => {
    let d: any;
    quick(1500, () => { d = all("## h\n\n::toc\n\n### g\n\n".repeat(1_500)); });
    const tocs = d.blocks.filter((b: any) => b.type === "toc");
    expect(tocs.reduce((a: number, b: any) => a + b.items.length, 0)).toBeLessThanOrEqual(2_000);
    expect(d.problems.some((p: any) => /tables of contents on this page would list more than/.test(p.message))).toBe(true);
  });
});

describe("code walks", () => {
  const walk = (n: number, marks: string) => `${F}codewalk\n@file a.ts\n${"x\n".repeat(n)}@step a.ts#L1-L${n} mark=${marks}\n${F}\n`;
  test("many marks on many lines", () => {
    const n = 8_000;
    quick(2500, () => all(walk(n, Array.from({ length: n }, (_, i) => i + 1).join(","))));
  });
  test("a line marked many times shows the mark", () => {
    let html = "";
    quick(2500, () => { html = renderToString(<DhDocument doc={parse(walk(3, "2,".repeat(5_000) + "2"))} />); });
    const row = html.match(/class="([^"]*ch-mark[^"]*)"/)![1];
    expect(row.split(" ").filter((c) => c === "ch-mark").length).toBe(8);
  });
});

describe("steps that each carry a whole text", () => {
  const big = [
    ["editor", `${F}editor\n@file a.txt\n${"line\n".repeat(4_000)}${"@step s\n+x\n".repeat(150)}${F}\n`],
    ["codewalk", `${F}codewalk\n@file a.ts\n${"x\n".repeat(4_000)}${"@step a.ts\n".repeat(150)}${F}\n`],
    ["filetree", `${F}filetree\n${"x".repeat(20_000)}/\n${"  a\n".repeat(100)}${F}\n`],
  ];
  for (const [name, text] of big) test(`a ${name} whose steps would carry too much shows its source`, () => {
    const d: any = parse(text);
    expect(d.blocks[0]).toMatchObject({ type: "error", part: name });
    expect(d.blocks[1].type).toBe("markdown");
    expect(d.blocks[1].md[0]).toMatchObject({ t: "code", text: text.slice(text.indexOf("\n") + 1, text.lastIndexOf(F) - 1) });
    expect(d.llm).toContain(name === "filetree" ? "x".repeat(20_000) : "@step");
    expect(check(d).some((p) => p.message.includes("its steps would show"))).toBe(true);
  });
  test("the cap holds for the whole page", () => {
    const one = `${F}editor\n@file a.txt\n${"line\n".repeat(400)}${"@step s\n+x\n".repeat(150)}${F}\n\n`;
    const d: any = parse(one.repeat(20));
    expect(d.blocks.filter((b: any) => b.type === "editor").length).toBeGreaterThan(0);
    expect(d.blocks.some((b: any) => b.type === "error" && /for the whole page/.test(b.message))).toBe(true);
  });
});

describe("alignment grids, drawn", () => {
  test("a chip with a very long name", () => {
    quick(1500, () => all(`${F}alignment\nx: a .. b\ny: c .. d\na / c: ${"w ".repeat(20_000)}\n${F}\n`));
  });
  test("many regions", () => {
    const k = 20, n = 20_000;
    let d: any;
    quick(2500, () => { d = all(`${F}alignment\nx: ${Array.from({ length: k }, (_, i) => "a" + i).join(" .. ")}\ny: ${Array.from({ length: k }, (_, i) => "b" + i).join(" .. ")}\n${Array.from({ length: n }, (_, i) => `region: a${i % k} / b${Math.floor(i / k) % k} [c1]`).join("\n")}\n${F}\n`); });
    expect(d.blocks[0].align.regions.length).toBe(400);
    expect(d.blocks[0].align.errors.some((e: any) => /more than 400 regions/.test(e.msg))).toBe(true);
  });
});

describe("long lines with a line separator in them", () => {
  const ls = String.fromCharCode(0x2028);
  test("a fence line, a container line and a step line", () => {
    quick(1500, () => all(`\`\`\`${"a".repeat(60_000)}${ls}b\n`));
    quick(1500, () => all(`:::a${"a".repeat(60_000)}${ls}b\n`));
    quick(1500, () => all(`${F}terminal\n@step${" ".repeat(60_000)}a${ls}b\n${F}\n`));
  });
  test("an animation with many [ and no ]", () => {
    quick(1500, () => parse(`${F}animation\nbox a "a"\n${"[".repeat(39_000)}\n${F}\n`));
  });
});

describe("alignment grids far over the axis limit", () => {
  test("show their source instead of drawing every cell", () => {
    const n = 1_200;
    const text = `${F}alignment\nx: ${Array.from({ length: n }, (_, i) => "a" + i).join(" .. ")}\ny: ${Array.from({ length: n }, (_, i) => "b" + i).join(" .. ")}\na0 / b0: q\n${F}\n`;
    let d: any;
    quick(1500, () => { d = parse(text); check(d); llmView(text, { publicView: true }); });
    expect(d.blocks[0]).toMatchObject({ type: "error", part: "alignment" });
    expect(d.blocks[1].md[0].t).toBe("code");
  });
});

describe("headings, step lines and code references", () => {
  test("a tab heading with a long run of spaces", () => {
    const ls = String.fromCharCode(0x2028);
    quick(1500, () => all(`:::tabs\n## ${" ".repeat(60_000)}a${ls}b\n:::\n`));
    expect(parse(`:::tabs\n## One ##\nx\n## Two\ny\n:::\n`).blocks[0]).toMatchObject({ items: [{ title: "One" }, { title: "Two" }] });
  });
  test("a code walk step line with a long run of spaces", () => {
    quick(1500, () => all(`${F}codewalk\n@file a.ts\nx\n@step a.ts${" ".repeat(60_000)}x\nnote\n${F}\n`));
  });
  test("a symbol is looked for as written, in one pass over the file", () => {
    expect(isDefinition("const x[ = 1", "x[")).toBe(true);
    expect(isDefinition("x[0] + 1", "x[")).toBe(false);
    quick(500, () => isDefinition(`${"let ".repeat(60_000)}\nuse(foo)`, "foo"));
  });
});
