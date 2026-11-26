// The one engine's drawing never turns an author's word into CSS (the same rule as test/css-sinks.test.tsx, on the
// engine's path): its colours come from closed lists (tones, roles c1..c8) and the old stage's paint() guard, so every
// style the engine writes is a plain variable, a number or a fixed word. Each stage, graph and gt fixture is drawn by
// the engine on the server, plus a page whose role names and paint words are hostile.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "../../src/index";
import { DhDocument } from "../../src/react/index";

const ROOT = join(import.meta.dir, "../../fixtures");
const draw = (text: string, path: string) => renderToStaticMarkup(React.createElement(DhDocument, { doc: parse(text, { path, engine: "new" }), engine: "new" } as any));
// every style="..." on the page: after taking out var(--word) (with one var fallback), nothing may load or end a value
const bad = (html: string) => [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'"))
  .filter((s) => /url\(|\/\/|expression\(|@import|\\/.test(s.replace(/var\(--[a-z0-9-]+(, ?var\(--[a-z0-9-]+\))?\)/g, "")));

describe("the one engine writes no author word into CSS", () => {
  test("every stage, gt and animation fixture: styles hold only variables, numbers and fixed words", () => {
    const files = ["stage", "gt", "format"].flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith(".dh.md")).map((f) => join(d, f)));
    const found: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), "utf8");
      if (!/```animation/.test(text)) continue;
      for (const s of bad(draw(text, f))) found.push(`${f}: ${s.slice(0, 120)}`);
    }
    expect(found).toEqual([]);
  }, 180_000);
  test("hostile role names and paint words draw as plain variables", () => {
    const words = ['x), url(//h.example/p)', 'x; background:url(//h.example/p)', 'x"', "x\\"];
    for (const w of words) {
      const page = `---\nroles: { "${w.replace(/["\\]/g, "")}": c2 }\n---\n# T\n\n\`\`\`animation\ntitle: T\ntime: 0..4\nrow job a "A": sent 1..2 [dot]\n@step One: a.\nfill a\n\`\`\`\n\n\`\`\`animation\nbox a "A" fill=${JSON.stringify(w)}\nbox b "B"\na -> b\n@step One: go.\nsend "x" a -> b\n\`\`\`\n`;
      const html = draw(page, "t.dh.md");
      expect(bad(html)).toEqual([]);
      // a word the engine refuses is shown as text in the error box (escaped), never inside a style
      for (const m of html.matchAll(/style="([^"]*)"/g)) expect(m[1]).not.toContain("h.example");
    }
  });
});
