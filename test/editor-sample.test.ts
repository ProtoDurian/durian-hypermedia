// The editor sample (fixtures/format/42-editor.dh.md) is a made-up project that is big enough to show an editor at work:
// folders three or more levels deep, 12 or more files, some of 60 to 150 lines, and steps that edit files in different
// folders. Every step must apply to its file exactly (the editor's own diff reader), and a phone must be able to read it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../src/index";
import { applyDiff, editorSpec, parseDoc } from "../src/core/dh-lib";

const path = "format/42-editor.dh.md";
const text = readFileSync(join(import.meta.dir, "..", "fixtures", path), "utf8");
const doc = parse(text, { path });
const tree = parseDoc(path, text);
const part = tree.body.find((n: any) => n.kind === "part" && n.name === "editor") as any;
const spec = editorSpec(tree, part);

describe("the editor sample", () => {
  test("has no problem, in both sets of caps", () => {
    for (const limits of [LIMITS, UNTRUSTED_LIMITS]) expect(check(parse(text, { path, limits })).filter((i: any) => i.level === "error")).toEqual([]);
  });
  test("12 or more files in folders three levels deep or more", () => {
    const files = spec.files.map((f: any) => f.path);
    expect(files.length).toBeGreaterThanOrEqual(12);
    expect(Math.max(...files.map((f: string) => f.split("/").length - 1))).toBeGreaterThanOrEqual(3);
    expect(new Set(files.map((f: string) => dirname(f))).size).toBeGreaterThanOrEqual(6);
  });
  test("some files have 60 to 150 lines", () => {
    const long = spec.files.filter((f: any) => f.text.split("\n").length >= 60 && f.text.split("\n").length <= 150);
    expect(long.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...spec.files.map((f: any) => f.text.split("\n").length))).toBeLessThanOrEqual(150);
  });
  test("steps edit files in different folders, and every step applies exactly", () => {
    expect(spec.steps.length).toBeGreaterThanOrEqual(8);
    expect(new Set(spec.steps.map((s: any) => dirname(s.file))).size).toBeGreaterThanOrEqual(5);
    const now = new Map<string, string[]>(spec.files.map((f: any) => [f.path, f.text.split("\n")]));
    for (const s of spec.steps) {
      const r = applyDiff(now.get(s.file)!, s.diff);
      expect(r.err, s.title).toBeUndefined();
      expect(r.added.length + r.removed.length, s.title).toBeGreaterThan(0);
      now.set(s.file, r.after);
    }
  });
  test("a phone can read it: code lines are short, titles are short", () => {
    const code = spec.files.flatMap((f: any) => f.text.split("\n")).concat(spec.steps.flatMap((s: any) => s.diff.map((d: string) => d.slice(1))));
    expect(code.filter((l: string) => l.length > 60)).toEqual([]);
    expect(Math.max(...spec.steps.map((s: any) => s.title.length))).toBeLessThanOrEqual(40);
  });
  test("the LLM view is a short summary, not the whole project", () => {
    expect(doc.llm.length).toBeLessThan(2500);
    expect(doc.llm).toContain("pantry");
  });
});
