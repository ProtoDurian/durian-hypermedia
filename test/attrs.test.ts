import { describe, expect, test } from "bun:test";
import { parseAttrs } from "../src/core/dh-lib";

describe("attributes in an info string", () => {
  test("a backslash-quote inside a double-quoted value is a quote", () => {
    const { attrs } = parseAttrs(String.raw`filter="{level=~\"warn|error\"}" id=x`);
    expect(attrs.filter).toBe(`{level=~"warn|error"}`);
    expect(attrs.id).toBe("x");
  });
  test("a double backslash is one backslash; other escapes stay as written", () => {
    expect(parseAttrs(String.raw`a="c:\\dir" b="\n"`).attrs).toEqual({ a: String.raw`c:\dir`, b: String.raw`\n` });
  });
  test("plain, single-quoted and bare values read as before", () => {
    expect(parseAttrs(`{#top title="A b" alt='c d' w=3 loop}`)).toEqual({ attrs: { id: "top", title: "A b", alt: "c d", w: "3" }, words: ["loop"] });
  });
  test("unclosed and escaped quotes stay linear (double the text, about double the time)", () => {
    const time = (n: number) => { const s = `a="` + "\\\" a=\"".repeat(n); const t = performance.now(); for (let i = 0; i < 20; i++) parseAttrs(s); return performance.now() - t; };
    time(2000);
    const small = time(20000), big = time(40000);
    expect(big).toBeLessThan(small * 3 + 5);
  });
});
