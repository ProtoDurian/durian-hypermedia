// The size of YAML before any parser reads it (0.6.2): a parser may take time growing with the square of one map's
// keys, so one text's characters and keys, and a page's, are capped from the text alone. Counts only, never time.
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, check, setYamlParser, LIMITS } from "../src/index";
import { yamlNodeCount, yamlSizeCheck, YamlTooBig } from "../src/host/yaml";

const F = "```";
const chart = (rows: string[]) => [`${F}chart`, "kind: line", ...rows, F, ""].join("\n");
const plain = ["x: [1, 2]", "series:", "  - name: y", "    data: [1, 2]"];
const blocksOf = (d: ReturnType<typeof parse>) => d.blocks.filter((b) => b.type !== "markdown") as any[];
const msgOf = (b: any): string => String(b?.initial?.error ?? b?.message ?? "");
afterEach(() => setYamlParser(null));

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
/** every node of a parsed value: each list and map, each key, each value (a collection held twice counts once) */
function nodesIn(v: unknown, seen = new Set<object>()): number {
  if (v === null || typeof v !== "object") return 1;
  if (seen.has(v)) return 1;
  seen.add(v);
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + nodesIn(x, seen), 1);
  return Object.keys(v).reduce((n, k) => n + 1 + nodesIn((v as any)[k], seen), 1);
}
/** keys of every map in a parsed value (a map held twice counts once, as the parser builds it once) */
function keysIn(v: unknown, seen = new Set<object>()): number {
  if (v === null || typeof v !== "object" || seen.has(v)) return 0;
  seen.add(v);
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + keysIn(x, seen), 0);
  return Object.keys(v).reduce((n, k) => n + 1 + keysIn((v as any)[k], seen), 0);
}

describe("the node count from the text bounds the keys and the nodes the parser builds", () => {
  test("every way to write a key", () => {
    const n = 50, ks = Array.from({ length: n }, (_, i) => "k" + i);
    const spellings = [
      ks.map((k) => `${k}: 1`).join("\n"),                         // block map
      "m:\n" + ks.map((k) => `  ${k}: 1`).join("\n"),             // nested block map
      `{${ks.map((k) => `${k}: 1`).join(", ")}}`,                  // flow map
      `{${ks.join(", ")}}`,                                        // flow map, keys alone
      `{${ks.map((k) => `"${k}":1`).join(",")}}`,                 // JSON keys
      ks.map((k) => `? ${k}\n: 1`).join("\n"),                     // explicit keys
      ks.map((k) => `? ${k}`).join("\n"),                          // explicit keys alone
      `[${ks.map((k) => `${k}: 1`).join(", ")}]`,                  // one-pair maps in a list
      `a: !!set {${ks.join(", ")}}`,                               // a set
    ];
    for (const t of spellings) {
      let v: unknown; try { v = (Bun as any).YAML.parse(t); } catch { continue; }
      expect(keysIn(v)).toBeGreaterThanOrEqual(n);
      expect(yamlNodeCount(t)).toBeGreaterThanOrEqual(keysIn(v));
    }
  });
  test("on seeded random YAML punctuation (100,000 texts): keys ≤ count, nodes ≤ 2 × count + 2", () => {
    const P = ["{", "}", "[", "]", ",", ", ", ":", ": ", "? ", "- ", "\n", "\n  ", "\n    ", "  ", "a", "b1", "\"", "'", "\"x\":", "\"}\"", "\"]\"", "\"[\"", "'}'", "# }", "# c", "|", ">", "|-", "!!set ", "!!map ", "!!omap ", "!!pairs ", "!t ", "!<x}> ", "&a ", "*a ", "null", "\\", "\t", "1", "x y", "a{b", "a}b", "a]b", "---\n", "%YAML 1.1\n---\n", "=", "~", "<<: ", "{? a}"];
    let parsed = 0;
    for (let seed = 1; seed <= 100_000; seed++) {
      const r = rng(seed); let t = "";
      const len = 4 + Math.floor(r() * 40);
      for (let i = 0; i < len; i++) t += P[Math.floor(r() * P.length)];
      let v: unknown; try { v = (Bun as any).YAML.parse(t); } catch { continue; }
      parsed++;
      const k = keysIn(v);
      const c = yamlNodeCount(t), all = nodesIn(v);
      if (c < k) throw new Error(`count ${c} < keys ${k} for ${JSON.stringify(t)}`);
      if (all > 2 * c + 2) throw new Error(`nodes ${all} > 2 × count ${c} + 2 for ${JSON.stringify(t)}`);
    }
    expect(parsed).toBeGreaterThan(5_000);
  });
  test("long lists count too", () => {
    const t = "x: [" + Array(5000).fill("1").join(",") + "]";
    expect(nodesIn((Bun as any).YAML.parse(t))).toBeLessThanOrEqual(2 * yamlNodeCount(t) + 2);
    expect(yamlNodeCount(t)).toBeGreaterThan(LIMITS.maxYamlNodes);
  });
  test("a quoted or commented mark counts too; escapes never do", () => {
    expect(yamlNodeCount('a: "b: c"')).toBe(3); // two ":" and one line
    expect(yamlNodeCount("a: 1 # b: c")).toBe(3);
    expect(yamlNodeCount('a: "\\x3a\\u003a"')).toBe(2);
    expect(yamlNodeCount("x: [1, 2, 3]\n")).toBe(6); // every item counts: the parser's work grows with them
    expect(yamlNodeCount("x: {a, b}")).toBe(4);
    expect(yamlNodeCount("!!map a")).toBe(3);
    expect(yamlNodeCount("")).toBe(0);
  });
});

describe("over a cap, the YAML is refused before any parser runs", () => {
  const big = (n: number) => `m: {${Array.from({ length: n }, (_, i) => "k" + i).join(", ")}}`;
  test("a chart: an error block naming the cap; the parser is never called", () => {
    let calls = 0; setYamlParser((t) => { calls++; return (Bun as any).YAML.parse(t); });
    const d = parse(chart([big(LIMITS.maxYamlNodes), ...plain]));
    expect(blocksOf(d)[0].type).toBe("error");
    expect(msgOf(blocksOf(d)[0])).toMatch(/too many keys/);
    expect(calls).toBe(0);
  });
  test("front matter: ignored with a problem", () => {
    const d = parse(`---\ntitle: t\n${big(LIMITS.maxYamlNodes)}\n---\n\n# t\n\ntext\n`);
    expect(d.title).toBe(null);
    expect(d.problems.some((p) => /front matter/.test(p.message) && /too many keys/.test(p.message))).toBe(true);
  });
  test("characters of one text", () => {
    const d = parse(chart([`note: "${"z".repeat(LIMITS.maxYamlChars)}"`, ...plain]));
    expect(msgOf(blocksOf(d)[0])).toMatch(/YAML is too long/);
  });
  test("the page's total: the charts after it are error blocks, the ones before draw", () => {
    const per = Math.floor(LIMITS.maxYamlNodes * 0.9), need = Math.ceil(LIMITS.maxPageYamlNodes / per) + 1;
    const src = Array.from({ length: need }, () => chart([big(per), ...plain])).join("\n");
    const bs = blocksOf(parse(src));
    expect(bs.length).toBe(need);
    expect(bs[0].type).not.toBe("error");
    expect(msgOf(bs[need - 1])).toMatch(/page's YAML has too many keys/);
  });
  test("check() reads the same page without new errors from the YAML totals", () => {
    const per = Math.floor(LIMITS.maxYamlNodes * 0.9), fit = Math.floor(LIMITS.maxPageYamlNodes / per);
    const src = Array.from({ length: fit }, () => chart([big(per), ...plain])).join("\n");
    expect(blocksOf(parse(src)).every((b) => !/YAML/.test(msgOf(b)))).toBe(true);
    expect(check(src).filter((p) => /YAML/.test(p.message))).toEqual([]);
  });
  test("the caps given to parse() apply", () => {
    const src = chart(["m: {a: 1, b: 2, c: 3}", ...plain]);
    expect(blocksOf(parse(src))[0].type).not.toBe("error");
    expect(msgOf(blocksOf(parse(src, { limits: { maxYamlNodes: 5 } }))[0])).toMatch(/too many keys/);
    expect(() => yamlSizeCheck("a: 1\nb: 2", { ...LIMITS, maxYamlNodes: 1 })).toThrow(YamlTooBig);
  });
});

describe("real pages fit with room", () => {
  test("every fixture's YAML is under a fifth of each cap", () => {
    const root = join(import.meta.dir, "../fixtures");
    const files: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".md") && files.push(join(d, e.name)); };
    walk(root);
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      if (f.includes("hostile")) continue;
      const s = readFileSync(f, "utf8"), texts: string[] = [];
      const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(s); if (fm) texts.push(fm[1]);
      for (const m of s.matchAll(/^(`{3,}|~{3,})chart[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm)) texts.push(m[2]);
      let c = 0, k = 0;
      for (const t of texts) { expect(t.length * 5).toBeLessThan(LIMITS.maxYamlChars); expect(yamlNodeCount(t) * 5).toBeLessThan(LIMITS.maxYamlNodes); c += t.length; k += yamlNodeCount(t); }
      expect(c * 5).toBeLessThan(LIMITS.maxPageYamlChars);
      expect(k * 5).toBeLessThan(LIMITS.maxPageYamlNodes);
    }
  });
});
