// The log's key: it names the level words, author highlights, search marks and folded repeats that occur in that log, and nothing else.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "../../index";
import LogView from "./view";

const fence = (attrs: string, body: string) => `# Page\n\n\`\`\`log ${attrs}\n${body}\n\`\`\`\n`;
const html = (body: string, attrs = "", st?: string | false) => {
  const b = parse(fence(attrs, body), { path: "p.dh.md" }).blocks.find((x) => x.type === "log")!;
  if (b.type !== "log") throw Error("no log");
  return renderToStaticMarkup(React.createElement(LogView as any, { data: b.data, block: { id: "x", line: 1, attrs: {}, llm: "" }, ui: {}, static: st }));
};
const key = (h: string) => h.match(/<div class="lg-key"[\s\S]*?<\/ul><\/div>/)?.[0] ?? "";
const items = (k: string) => [...k.matchAll(/<li class="lg-key-i">([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, ""));

const LOG = `2026-11-20T10:00:00Z info start version=1.4
2026-11-20T10:00:01Z warn cache miss rate high
2026-11-20T10:00:02Z error timeout status=504
@highlight |= "timeout" [bad] "the request timed out"
@highlight line 2 [warn] "the first sign"`;

describe("log: the key", () => {
  test("names each level that occurs, with its meaning, and no other level", () => {
    const k = key(html(LOG));
    expect(k).toContain('aria-label="Key"');
    const it = items(k);
    expect(it.slice(0, 3)).toEqual(["info|normal progress", "warn|worth a look", "error|something failed"]);
    expect(k).not.toContain("lv-debug"); expect(k).not.toContain("detail for developers");
  });
  test("names each author highlight with its colour and its reason", () => {
    const k = key(html(LOG));
    expect(k).toContain("lg-key-edge tone-bad"); expect(k).toContain("lg-key-edge tone-warn");
    expect(items(k)).toContain("Marked by the author|: the request timed out");
    expect(items(k)).toContain("Marked by the author|: the first sign");
  });
  test("a log with no highlights and one level names only that level, and the search mark", () => {
    const it = items(key(html("info a\ninfo b")));
    expect(it).toEqual(["info|normal progress", "words|the words your search matched"]);
  });
  test("a folded repeat adds the ×N entry; no repeat, no entry", () => {
    expect(items(key(html("info same\ninfo same\ninfo same\ninfo other"))).some((x) => x.includes("repeated that many times"))).toBe(true);
    expect(key(html("info a\ninfo b"))).not.toContain("repeated");
  });
  test("a static log has a key without the search mark (it has no search)", () => {
    const k = key(html(LOG, "static", ""));
    expect(k).not.toContain("your search matched"); expect(k).toContain("worth a look"); expect(k).toContain("the request timed out");
  });
  test("a debug-only log names debug alone", () => expect(items(key(html("debug one\ndebug two"))).slice(0, 1)).toEqual(["debug|detail for developers"]));
});
