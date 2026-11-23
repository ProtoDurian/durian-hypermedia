// mermaid left the package in 0.7.0: a ```mermaid block is a plain code block, doccheck refuses it with one message
// that names the part to use, and nothing the package ships (code, styles, fixtures, the built example) still has it.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse, check, PART_NAMES, LIMITS } from "../src/index";
import { DhDocument } from "../src/react/index";
import { DhDocument as StrictDocument } from "../src/react/strict";

const PKG = resolve(import.meta.dir, "..");
const F = "```";
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });

describe("a mermaid block", () => {
  const attack = `# T\n\n${F}mermaid\n%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B\n${F}\n`;
  test("is a plain code block: no mermaid part, its text escaped", () => {
    const d = parse(attack);
    expect(d.blocks.map((b) => b.type)).toEqual(["markdown"]);
    for (const Doc of [DhDocument, StrictDocument]) {
      const h = renderToString(<Doc doc={d} />);
      expect(h).not.toContain("data-mermaid");
      expect(h).not.toContain("<img");
      expect(h).toContain("&lt;img src=x onerror=alert(1)&gt;");
    }
  });
  test("doccheck gives one message for each, at the fence's line, naming the animation part", () => {
    const text = `---\ntitle: x\n---\n\n# T\n\nSome text.\n\n${F}mermaid\nflowchart LR\n  A --> B\n${F}\n\n:::human llm=none\n~~~mermaid\nsequenceDiagram\n  A->>B: hi\n~~~\n:::\n`;
    const ms = check(text, { path: "a.dh.md" }).filter((p) => p.message.includes("mermaid"));
    expect(ms.map((p) => [p.line, p.level])).toEqual([[9, "error"], [15, "error"]]);
    expect(ms[0].message).toContain("```mermaid was removed in 0.7.0");
    expect(ms[0].message).toContain("```animation");
    expect(ms[1].message).toContain("```sequence");
  });
  test("a fence whose word only starts with mermaid, or a mermaid word in text, is not one", () => {
    const ms = check(`# T\n\nWe used to write mermaid here.\n\n${F}mermaidish\nx\n${F}\n`, { path: "a.dh.md" }).filter((p) => p.message.includes("was removed"));
    expect(ms).toEqual([]);
  });
});

test("an issue in Markdown after a plain code block points at the Markdown's first line, not past the block", () => {
  const ms = check(`# T\n\n${F}ts\nconst a = 1;\n${F}\n\n> **Bad:** x\n`, { path: "a.dh.md" }).filter((p) => p.message.includes("callout marker"));
  expect(ms.map((p) => p.line)).toEqual([1]);
});

describe("nothing the package ships has mermaid", () => {
  test("no part name, no limit, no dependency", () => {
    expect((PART_NAMES as readonly string[]).includes("mermaid")).toBe(false);
    expect(Object.keys(LIMITS).filter((k) => /mermaid/i.test(k))).toEqual([]);
    const pkg = readFileSync(join(PKG, "package.json"), "utf8");
    expect(pkg.match(/mermaid|dompurify/gi)).toBeNull();
  });
  test("no source file, style sheet or fixture names it (doccheck's migration message aside)", () => {
    const hits = [...files(join(PKG, "src")), ...files(join(PKG, "fixtures")), ...files(join(PKG, "example")).filter((f) => !f.includes("/dist/"))]
      .filter((f) => !f.endsWith("src/core/doccheck.ts"))
      .filter((f) => /mermaid/i.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => f.slice(PKG.length + 1))).toEqual([]);
  });
  test("the built example site has none", () => {
    const out = mkdtempSync(join(tmpdir(), "dh-no-mermaid-"));
    try {
      const r = Bun.spawnSync(["bun", join(PKG, "example/build.tsx"), out], { cwd: PKG, stdout: "pipe", stderr: "pipe", env: { ...process.env } });
      expect(r.exitCode).toBe(0);
      const hits = files(out).filter((f) => /mermaid|dompurify/i.test(readFileSync(f, "utf8")));
      expect(hits.map((f) => f.slice(out.length + 1))).toEqual([]);
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 240_000);
});
