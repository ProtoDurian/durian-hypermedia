// Bare links (0.6.2): www. as GFM reads it; http://, https:// and ftp:// after any character that is not a letter or a
// digit (but "<"), as 0.6.1 read them; a domain judged without its trailing punctuation; brackets of a written link first. And the
// two places the tree keeps 0.6.1's shape: a callout's first text, an escaped bracket in a link's text.
import { describe, expect, test } from "bun:test";
import { parse } from "../src/index";

const inl = (s: string) => ((parse(s, { frontMatter: false }).blocks[0] as any).md[0].c) as any[];
const links = (s: string) => {
  const out: string[] = [];
  const walk = (v: any) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if (v.t === "link") out.push(v.href); Object.values(v).forEach(walk); } };
  walk(parse(s, { frontMatter: false }).blocks);
  return out;
};

describe("bare links", () => {
  test("a scheme after punctuation is a link, as in 0.6.1", () => {
    for (const s of ["url=https://x.com/a b", "key:https://x.com/a", "say 'https://x.com/a' now", '"https://x.com/a"', "a/http://x.com/a", "(https://x.com/a)", "=ftp://x.com/a"])
      expect(links(s).length).toBe(1);
    expect(links("url=https://x.com/a b")).toEqual(["https://x.com/a"]);
  });
  test("not after a letter or a digit, nor after a < that opens no autolink (CommonMark, GFM)", () => {
    for (const s of ["xhttps://x.com", "éhttps://x.com", "1https://x.com", "<http://foo.bar/baz bim>"]) expect(links(s)).toEqual([]);
    expect(links("<http://foo.bar/baz>")).toEqual(["http://foo.bar/baz"]);
  });
  test("www. only after white space, a line start or * _ ~ ( (GFM)", () => {
    expect(links("see www.x.com")).toEqual(["http://www.x.com"]);
    expect(links("=www.x.com")).toEqual([]);
    expect(links("www.x")).toEqual(["http://www.x"]);
  });
  test("the domain is judged without its trailing punctuation (GFM)", () => {
    expect(links("_https://b.c_")).toEqual(["https://b.c"]);
    expect(links("_www.b.c_")).toEqual(["http://www.b.c"]);
    expect(links("https://b.c_")).toEqual(["https://b.c"]);
    expect(links("www.a._")).toEqual(["http://www.a"]);
    // an underscore in either of the last two parts of the domain itself: no link
    for (const s of ["www.a_.b", "www.a.b_c", "https://a_.b", "https://a.b_c/x"]) expect(links(s)).toEqual([]);
  });
  test("a written link's brackets come first", () => {
    expect(links("[https://a.b](https://c.d)")).toEqual(["https://c.d"]);
    expect(links("[see https://a.b](https://c.d)")).toEqual(["https://c.d"]);
    expect(links("[www.a.b](https://c.d)")).toEqual(["https://c.d"]);
  });
  test("trailing punctuation and an unbalanced ) stay outside", () => {
    expect(links("(see https://a.b/c_(d))!")).toEqual(["https://a.b/c_(d)"]);
    expect(links("https://a.b/c&amp;")).toEqual(["https://a.b/c"]);
  });
});

describe("the tree keeps 0.6.1's shape", () => {
  test("a callout's text before a code span starts with an empty text node", () => {
    const c = (parse("> **Tip:** `x` is y", { frontMatter: false }).blocks[0] as any).md[0];
    expect(c.t).toBe("callout");
    expect(c.c[0].c).toEqual([{ t: "text", v: "" }, { t: "code", v: "x" }, { t: "text", v: " is y" }]);
    expect((parse("> **Note:** foo", { frontMatter: false }).blocks[0] as any).md[0].c[0].c).toEqual([{ t: "text", v: "foo" }]);
  });
  test("an escaped bracket joins the text of a link; elsewhere an escape is a node of its own", () => {
    expect(inl("[a \\[b\\] c](x)")[0].c).toEqual([{ t: "text", v: "a [b] c" }]);
    expect(inl("[a \\* b](x)")[0].c).toEqual([{ t: "text", v: "a " }, { t: "text", v: "*" }, { t: "text", v: " b" }]);
    expect(inl("a \\[b\\] c")).toEqual([{ t: "text", v: "a " }, { t: "text", v: "[" }, { t: "text", v: "b" }, { t: "text", v: "]" }, { t: "text", v: " c" }]);
  });
});
