// The parser is pure: it bundles for a browser with no node: module and no file access, and runs without Bun's YAML.
import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

describe("version", () => {
  test("VERSION, package.json and the CHANGELOG agree", async () => {
    const { VERSION } = await import("../src/index");
    const pkg = await Bun.file(resolve(import.meta.dir, "../package.json")).json();
    expect(VERSION).toBe(pkg.version);
    expect(await Bun.file(resolve(import.meta.dir, "../CHANGELOG.md")).text()).toContain(`## ${VERSION}`);
  });
});

describe("pure core", () => {
  test("src/index.ts bundles for the browser with no node: import", async () => {
    const r = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../src/index.ts")], target: "browser", minify: false });
    expect(r.success).toBe(true);
    const text = await r.outputs[0].text();
    expect(text).not.toMatch(/from\s*["']node:/);
    expect(text).not.toMatch(/require\(["'](fs|child_process|node:)/);
  });
  test("no eval or new Function in the parser bundle", async () => {
    const r = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../src/index.ts")], target: "browser", minify: true });
    const text = await r.outputs[0].text();
    expect(text).not.toMatch(/\beval\(|new Function\(/);
  });
  test("setYamlParser replaces Bun's YAML", async () => {
    const { setYamlParser, parse } = await import("../src/index");
    let used = 0;
    setYamlParser((t) => { used++; return (globalThis as any).Bun.YAML.parse(t); });
    parse("---\ntitle: x\n---\n\nhi\n");
    setYamlParser(null);
    expect(used).toBeGreaterThan(0);
  });
});
