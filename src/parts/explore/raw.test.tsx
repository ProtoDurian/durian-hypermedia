// The explore part's raw view and its TOML reader: the source as plain text, line numbers, the switch, and every TOML form.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check } from "../../index";
import { Budget } from "../../core/budget";
import ExploreView, { RawView } from "./view";
import { readToml } from "./toml";

const fence = (lang: string, body: string, attrs = "") => `# Page\n\n\`\`\`${lang} explore ${attrs}\n${body}\n\`\`\`\n`;
const data = (lang: string, body: string) => { const b = parse(fence(lang, body), { path: "p.dh.md" }).blocks.find((x) => x.type === "explore")!; if (b.type !== "explore") throw Error("no explore"); return b.data; };
const errs = (s: string) => check(parse(s, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const html = (d: ReturnType<typeof data>, st?: string | false) => renderToStaticMarkup(React.createElement(ExploreView as any, { data: d, block: { id: "x", line: 1, attrs: {}, llm: "" }, ui: {}, static: st }));

describe("explore: the raw source", () => {
  test("JSON is pretty-printed with 2 spaces, whatever the author wrote", () => expect(data("json", '{"a":[1,{"b":2}],"c":"x"}').raw).toBe('{\n  "a": [\n    1,\n    {\n      "b": 2\n    }\n  ],\n  "c": "x"\n}'));
  test("YAML, TOML and CSV stay as written (trailing blank lines cut)", () => {
    expect(data("yaml", "a: 1\nb:\n  - x\n\n").raw).toBe("a: 1\nb:\n  - x");
    expect(data("toml", "# note\n[t]\nk = 'v'\n").raw).toBe("# note\n[t]\nk = 'v'");
    expect(data("csv", 'a,b\n1,"x, y"\n').raw).toBe('a,b\n1,"x, y"');
  });
  test("the rich view is the default; the switch has two keyboard-reachable buttons", () => {
    const h = html(data("json", '{"a":1}'));
    expect(h).toContain('class="dx-switch"');
    expect(h).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Rich<\/button>/);
    expect(h).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Raw<\/button>/);
    expect(h).toContain("dx-tree");
    expect(h).not.toContain("dx-raw");
  });
  test("the raw view: a read-only region, one numbered line each, no search, no query", () => {
    const h = renderToStaticMarkup(<RawView text={'{\n  "a": 1\n}'} lang="json" />);
    expect(h).toContain('role="region"'); expect(h).toContain('tabindex="0"'); expect(h).toContain("Raw json source, 3 lines");
    expect(h.match(/<li class="dx-raw-li">/g)?.length).toBe(3);
    expect(h).not.toMatch(/<input|dx-search|dx-q"/);
    expect(h).toContain("&quot;a&quot;: 1");
  });
  test("a long source shows 1000 lines, then asks for more", () => {
    const h = renderToStaticMarkup(<RawView text={Array.from({ length: 2500 }, (_, i) => `line ${i}`).join("\n")} lang="csv" />);
    expect(h.match(/<li class="dx-raw-li">/g)?.length).toBe(1000);
    expect(h).toContain("Show 1000 more of 1500 lines");
  });
});

describe("explore: the TOML reader", () => {
  const T = (s: string) => JSON.parse(JSON.stringify(readToml(s, big())));
  test("tables, dotted keys, arrays of tables", () => {
    expect(T('title = "x"\n[a.b]\nn = 1\n[a]\nm = 2\n[[p]]\nk = 1\n[[p]]\nk = 2\n[p.sub]\nz = true\n')).toEqual({ title: "x", a: { b: { n: 1 }, m: 2 }, p: [{ k: 1 }, { k: 2, sub: { z: true } }] });
    expect(T("a.b.c = 1\na.b.d = 2")).toEqual({ a: { b: { c: 1, d: 2 } } });
    expect(T('"a b" = 1\n\'c.d\' = 2')).toEqual({ "a b": 1, "c.d": 2 });
  });
  test("strings: basic escapes, literal, multi line", () => {
    expect(T('a = "t\\tq\\"\\u00e9"\nb = \'C:\\x\'')).toEqual({ a: 't\tq"é', b: "C:\\x" });
    expect(T('a = """\nx\ny\\\n   z"""\nb = \'\'\'\nr\\n\'\'\'')).toEqual({ a: "x\nyz", b: "r\\n" });
  });
  test("numbers, booleans, dates, arrays, inline tables, comments", () => {
    expect(T("i = 1_000\nh = 0xff\no = 0o17\nb = 0b101\nf = -1.5e2\nt = true\nf2 = false\ni2 = +7")).toEqual({ i: 1000, h: 255, o: 15, b: 5, f: -150, t: true, f2: false, i2: 7 });
    expect(T("d = 2026-11-20T10:00:00Z\nd2 = 2026-11-20 10:00:00\nt = 10:00:00")).toEqual({ d: "2026-11-20T10:00:00Z", d2: "2026-11-20 10:00:00", t: "10:00:00" });
    expect(T("a = [1,\n  2, # two\n  3,\n]\nb = { x = 1, y = { z = [] } } # tail\nc = []")).toEqual({ a: [1, 2, 3], b: { x: 1, y: { z: [] } }, c: [] });
  });
  test("a key named __proto__ is data, never the prototype", () => {
    const v = readToml("[__proto__]\npolluted = 1\n__proto__ = 2", big()) as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(["__proto__"]); expect(({} as any).polluted).toBeUndefined();
  });
  const bad: [string, string][] = [["a = ", "a value is expected"], ["a = 1\na = 2", "written twice"], ["[t]\n[t]", "written twice"], ["a = 1\n[a]", "already a value"], ['a = "x', "never closed"], ["a = [1, 2", "never closed"], ["a = 1 2", "same line"], ["a b = 1", "= is expected"], ["a = nope", "is not a value"], ["a = 01", "is not a value"], ['a = "\\q"', "bad escape"], ["= 1", "a key is expected"], ["[a", "closes a table header"]];
  for (const [src, msg] of bad) test(`refuses ${JSON.stringify(src)}`, () => expect(() => readToml(src, big())).toThrow(msg));
  test("a syntax error names the line, through check()", () => expect(errs(fence("toml", "a = 1\nb = nope")).join()).toContain("toml line 2"));
  test("deep nesting is refused, not recursed", () => { expect(() => readToml("a = " + "[".repeat(70) + "]".repeat(70), big())).toThrow("nested too deep"); expect(errs(fence("toml", "a = " + "[".repeat(70) + "]".repeat(70))).join()).toContain("nested too deep");});
  test("work is linear: 2n text costs about twice n", () => { const cost = (n: number) => { const b = big(); readToml(Array.from({ length: n }, (_, i) => `k${i} = "v${i}"`).join("\n"), b); return b.steps; }; expect(cost(2000) / cost(1000)).toBeLessThan(2.2); });
  test("explore reads TOML, runs a query, and the LLM view keeps the text", () => {
    const s = fence("toml", '[server]\nport = 8443', 'query=".server.port"'); const d = data("toml", "[server]\nport = 8443");
    expect(d.value).toEqual({ server: { port: 8443 } }); expect(errs(s)).toEqual([]); expect(parse(s).llm).toContain("8443");
  });
});
