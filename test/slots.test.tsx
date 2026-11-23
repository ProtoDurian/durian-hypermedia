// The host draws Markdown elements through slots (Code, InlineCode, Link, Table, Heading), demotes headings,
// and turns front matter off. Without a slot the renderer draws the element exactly as before.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { parse, llmView } from "../src/index";
import { DhDocument } from "../src/react/index";
import { DhDocument as StrictDocument } from "../src/react/strict";
import type { CodeSlotProps, LinkSlotProps, TableSlotProps, HeadingSlotProps } from "../src/react/context";
import { allFixtures, taskBlock } from "./helpers";

const PAGE = `# Title

Some \`inline\` code and a [link](https://example.com "Example") and a [local](#title) one.

\`\`\`ts title="a.ts" {2}
const a = 1;
\`\`\`

| Name | Size |
| :--- | ---: |
| **a** | 1 |
| b | 2 |

## Sub
`;
const render = (el: React.ReactElement) => renderToString(el);

describe("slots", () => {
  const doc = parse(PAGE);
  test("Code gets lang, text and meta", () => {
    const seen: CodeSlotProps[] = [];
    const Code = (p: CodeSlotProps) => { seen.push(p); return <pre data-host-code={p.lang}>{p.text}</pre>; };
    const h = render(<DhDocument doc={doc} slots={{ Code }} />);
    expect(seen).toHaveLength(1);
    expect(seen[0].lang).toBe("ts");
    expect(seen[0].meta).toBe('title="a.ts" {2}');
    expect(seen[0].text).toBe("const a = 1;");
    expect(h).toContain('data-host-code="ts"');
    expect(h).not.toContain("code-block");
  });
  test("InlineCode gets the text", () => {
    const h = render(<DhDocument doc={doc} slots={{ InlineCode: ({ text }) => <kbd data-host-inline="1">{text}</kbd> }} />);
    expect(h).toContain("<kbd data-host-inline=\"1\">inline</kbd>");
  });
  test("Link gets href, title and children; no target is hard-coded", () => {
    const seen: Omit<LinkSlotProps, "children">[] = [];
    const Link = ({ children, ...p }: LinkSlotProps) => { seen.push(p); return <a href={p.href} data-host-link={p.external ? "ext" : "in"}>{children}</a>; };
    const h = render(<DhDocument doc={doc} slots={{ Link }} />);
    expect(seen.map((s) => s.href)).toContain("https://example.com");
    expect(seen.find((s) => s.href === "https://example.com")).toMatchObject({ title: "Example", external: true });
    expect(seen.find((s) => s.href.startsWith("#"))?.external).toBe(false);
    expect(h).not.toContain("_blank");
    expect(h).toContain('data-host-link="ext"');
  });
  test("without the Link slot, external links still open in a new tab (unchanged default)", () => {
    expect(render(<DhDocument doc={doc} />)).toContain('target="_blank"');
  });
  test("Table gets the parsed header and rows as React children, with header text", () => {
    const seen: TableSlotProps[] = [];
    const Table = (p: TableSlotProps) => { seen.push(p); return <div data-host-table>{p.rows.map((r, k) => <div key={k}>{r.map((c, j) => <span key={j} data-label={p.headText[j]}>{c}</span>)}</div>)}</div>; };
    const h = render(<DhDocument doc={doc} slots={{ Table }} />);
    expect(seen).toHaveLength(1);
    expect(seen[0].headText).toEqual(["Name", "Size"]);
    expect(seen[0].align).toEqual(["left", "right"]);
    expect(seen[0].rows).toHaveLength(2);
    expect(h).toContain('<span data-label="Name"><strong>a</strong></span>');
    expect(h).not.toContain("<table");
  });
  test("Heading gets depth, level, id and text", () => {
    const seen: Omit<HeadingSlotProps, "children">[] = [];
    const Heading = ({ children, ...p }: HeadingSlotProps) => { seen.push(p); return <div role="heading" aria-level={p.level}>{children}</div>; };
    render(<DhDocument doc={doc} slots={{ Heading }} demoteHeadings={2} />);
    expect(seen.map((s) => [s.depth, s.level, s.text])).toEqual([[1, 3, "Title"], [2, 4, "Sub"]]);
    expect(seen[0].id).toBe("dh-title");
  });
});

describe("demoteHeadings", () => {
  test("adds to every heading's level, at most h6", () => {
    const h = render(<DhDocument doc={parse("# One\n\n###### Six\n")} demoteHeadings={2} />);
    expect(h).toContain("<h3 id=\"dh-one\"");
    expect(h).toContain("<h6 id=\"dh-six\"");
    expect(h).not.toContain("<h1");
  });
  test("0 or absent keeps the levels", () => {
    expect(render(<DhDocument doc={parse("# One\n")} />)).toContain("<h1 id=\"dh-one\"");
  });
});

describe("frontMatter: false", () => {
  const text = "---\ntitle: x\nbanner: { kind: draft, text: hi }\n---\n\nBody text.\n";
  test("default: the leading block is front matter", () => {
    const d = parse(text);
    expect(d.title).toBe("x");
    expect(d.frontMatter.title).toBe("x");
  });
  test("off: the leading block stays visible Markdown, with the same line numbers", () => {
    const d = parse(text, { frontMatter: false });
    expect(d.title).toBeNull();
    expect(d.frontMatter).toEqual({});
    const h = render(<DhDocument doc={d} />);
    expect(h).toContain("<hr/>");
    expect(h).toContain("title: x");
    expect(h).toContain("Body text.");
    expect(llmView(d)).toContain("title: x");
    expect(llmView(text, { frontMatter: false })).toContain("title: x");
  });
  test("off: a message that starts with a rule keeps it", () => {
    const d = parse("---\n\nHello\n", { frontMatter: false });
    expect(render(<DhDocument doc={d} />)).toContain("<hr/>");
  });
  test("off: YAML that would not parse is not reported as broken front matter", () => {
    const d = parse("---\n: : [\n---\n\ntext\n", { frontMatter: false });
    expect(d.problems.filter((p) => /front matter/.test(p.message))).toEqual([]);
  });
});

describe("code walk notes are React children", () => {
  test("a note's inline code, bold and a link render as elements, HTML in a note stays text", () => {
    const d = parse("```codewalk\n@file a.ts\nconst a = 1;\n@step a.ts#L1-L1\nUse `a` and **b**, see [x](https://example.com). <img src=x onerror=alert(1)>\n```\n");
    const h = render(<DhDocument doc={d} />);
    expect(h).toContain("<code>a</code>");
    expect(h).toContain("<strong>b</strong>");
    expect(h).toContain('href="https://example.com"');
    expect(h).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(h).not.toContain("<img src=");
  });
  test("the Link and InlineCode slots reach a note too", () => {
    const d = parse("```codewalk\n@file a.ts\nconst a = 1;\n@step a.ts#L1-L1\nUse `a`, see [x](https://example.com).\n```\n");
    const h = render(<DhDocument doc={d} slots={{ InlineCode: ({ text }) => <i data-ic="1">{text}</i>, Link: ({ href, children }) => <a href={href} data-l="1">{children}</a> }} />);
    expect(h).toContain("<i data-ic=\"1\">a</i>");
    expect(h).toContain("data-l=\"1\"");
  });
});

describe("the strict entry renders every fixture", () => {
  for (const f of allFixtures()) test(f.name, () => {
    const h = render(<StrictDocument doc={parse(f.text, { blocks: [taskBlock] })} blocks={[taskBlock]} />);
    expect(h).toContain('class="dh-doc"');
  });
});
