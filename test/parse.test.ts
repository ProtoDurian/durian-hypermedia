// parse(), llmView() and check() on every fixture: no throw, the LLM view matches the format's own, the tree is JSON.
import { describe, expect, test } from "bun:test";
import { parse, llmView, check, FORMAT_VERSION } from "../src/index";
import { parseDoc, llmView as dhLlmView } from "../src/core/dh-lib";
import { fixtures, allFixtures, taskBlock } from "./helpers";

describe("parse", () => {
  for (const f of allFixtures()) {
    test(`${f.name}: parses, JSON round trip`, () => {
      const d = parse(f.text, { blocks: [taskBlock] });
      expect(d.ast).toBe(1);
      expect(d.format).toBe(FORMAT_VERSION);
      expect(Array.isArray(d.blocks)).toBe(true);
      expect(d.blocks.length).toBeGreaterThan(0);
      expect(JSON.parse(JSON.stringify(d)).blocks.length).toBe(d.blocks.length);
    });
  }
  test("the format fixtures parse with no problems", () => {
    const bad = fixtures("format").map((f) => ({ f: f.name, p: parse(f.text).problems })).filter((x) => x.p.length);
    expect(bad).toEqual([]);
  });
});

describe("llmView", () => {
  for (const f of fixtures("format")) {
    test(`${f.name}: the same as the format's own LLM view`, () => {
      const d = parse(f.text, { path: "page.dh.md" });
      expect(llmView(d)).toBe(dhLlmView(parseDoc("page.dh.md", f.text.replace(/\r\n?/g, "\n")), "page.dh.md"));
    });
  }
  test("a string works too", () => { expect(llmView("# Hi\n\n:kbd[Left]\n")).toContain("Left arrow"); });
});

describe("check", () => {
  test("returns doccheck's findings as a list", () => {
    const p = check("---\ntitle: x\n---\n\n> **Nope:** not a callout\n", { path: "page.md" });
    expect(p.some((x) => x.message.includes("not a callout marker"))).toBe(true);
  });
  // One test per fixture (this was one test over all 73, 4 to 7 s against bun's 5 s limit): parse() runs the
  // animation engine for every step, so a big 3D fixture alone takes about 0.5 s. Each fixture now has its own
  // test and a real limit, and a slow fixture is named when it fails.
  for (const f of fixtures("format")) {
    test(`format fixture ${f.name}: no errors from the checks`, () => {
      const errors = check(parse(f.text)).filter((x) => x.level === "error").map((p) => p.message);
      expect(errors).toEqual([]);
    }, 15000);
  }
  test("a Document sent over the wire (no cache) is checked from its source", () => {
    const d = JSON.parse(JSON.stringify(parse("> **Nope:** x\n", { path: "page.md" })));
    expect(check(d).some((x) => x.message.includes("not a callout marker"))).toBe(true);
  });
});
