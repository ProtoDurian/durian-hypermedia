// Every fixture renders to HTML in Bun, plain and highlighted, with React 18.
import { describe, expect, test } from "bun:test";
import React from "react";
import { parse } from "../src/index";
import { highlight } from "../src/server";
import { allFixtures, html, taskBlock } from "./helpers";

test("React 18 is the React under test", () => { expect(React.version.startsWith("18.")).toBe(true); });

describe("render", () => {
  for (const f of allFixtures()) {
    test(`${f.name}: renders plain and highlighted`, async () => {
      const d = parse(f.text, { blocks: [taskBlock] });
      const a = html(d);
      expect(a).toContain('class="dh-doc"');
      const h = html(await highlight(d));
      expect(h).toContain('class="dh-doc"');
    }, 15_000); // it checks the render, not speed: a page of stages draws ten screen plans each (about 5 s on a loaded machine)
  }
});

describe("every block kind is covered by a fixture", () => {
  test("kinds", () => {
    const seen = new Set<string>();
    const walk = (bs: any[]) => bs.forEach((b) => { seen.add(b.type === "host" ? "host" : b.type); if (b.type === "tabs" || b.type === "accordion") b.items.forEach((it: any) => walk(it.body)); if (b.body && Array.isArray(b.body)) walk(b.body); });
    for (const f of allFixtures()) walk(parse(f.text, { blocks: [taskBlock] }).blocks);
    for (const k of ["markdown", "toc", "terminal", "filetree", "editor", "codewalk", "chart", "animation", "tierlist", "alignment", "tabs", "accordion", "human", "error", "host"]) expect(seen.has(k)).toBe(true);
  });
  test("chart kinds", () => {
    const kinds = new Set<string>();
    for (const f of allFixtures()) for (const b of parse(f.text).blocks) if (b.type === "chart") kinds.add(String(b.chart?.kind));
    for (const k of ["bar", "line", "area", "scatter", "bubble", "radar", "pie", "doughnut", "polar"]) expect(kinds.has(k)).toBe(true);
  });
});
