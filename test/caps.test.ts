// The caps: going over one gives an error block and a problem, never a crash or a hang.
import { describe, expect, test } from "bun:test";
import { parse, LIMITS } from "../src/index";

describe("caps", () => {
  test("input size", () => {
    const d = parse("a".repeat(LIMITS.maxInputBytes + 1));
    expect(d.blocks).toHaveLength(1);
    expect(d.blocks[0].type).toBe("error");
  });
  test("input size counts UTF-8 bytes", () => { expect(parse("é".repeat(600_000)).blocks[0].type).toBe("error"); });
  test("block count", () => {
    const t = Array.from({ length: 3000 }, (_, i) => `\`\`\`terminal\n$ echo ${i}\n\`\`\`\n\ntext ${i}\n`).join("\n");
    const d = parse(t);
    expect(d.blocks.at(-1)!.type).toBe("error");
    expect(d.problems.some((p) => /more than 2000 blocks/.test(p.message))).toBe(true);
  });
  test("a lower cap from the host", () => {
    const d = parse("```terminal\n$ a\n$ b\n$ c\n```\n\n```animation\nbox a\n@step one\nhighlight a\n@step two\nhighlight a\n```\n", { limits: { maxAnimSteps: 1 } });
    expect(d.blocks.some((b) => b.type === "terminal")).toBe(true);
    expect(d.blocks.some((b) => b.type === "error" && b.part === "animation")).toBe(true);
  });
  test("mermaid length", () => {
    const d = parse("```mermaid\nflowchart LR\n" + Array.from({ length: 2000 }, (_, i) => `  n${i} --> n${i + 1}`).join("\n") + "\n```\n");
    expect(d.blocks.some((b) => b.type === "error" && b.part === "mermaid")).toBe(true);
  });
  test("animation source length", () => {
    const d = parse("```animation\n" + Array.from({ length: 3000 }, (_, i) => `box b${i} "a box with a long label number ${i}"`).join("\n") + "\n```\n");
    expect(d.blocks.some((b) => b.type === "error" && b.part === "animation")).toBe(true);
  });
  test("steps of a stepped part", () => {
    const d = parse("```filetree\n" + Array.from({ length: 300 }, (_, i) => `@step s${i}\na.ts`).join("\n") + "\n```\n");
    expect(d.blocks.some((b) => b.type === "error" && b.part === "filetree")).toBe(true);
  });
  test("tier list items", () => {
    const d = parse("```tierlist\nS: " + Array.from({ length: 700 }, (_, i) => `i${i}`).join(", ") + "\n```\n");
    expect(d.blocks.some((b) => b.type === "error" && b.part === "tierlist")).toBe(true);
  });
  test("a huge single line is fine", () => {
    const t0 = performance.now();
    const d = parse("word ".repeat(150_000));
    expect(d.blocks[0].type).toBe("markdown");
    expect(performance.now() - t0).toBeLessThan(5000);
  });
  test("expression limits hold in charts", () => {
    const d = parse("```chart\nkind: line\nlet:\n  xs: range(1, 100000)\nx: xs\nseries:\n  - name: y\n    data: xs\n```\n");
    expect(JSON.stringify(d)).toMatch(/limit/);
  });
});
