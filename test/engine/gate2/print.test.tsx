// Lane gate2: print and static through the NEW engine (review M1, blind spot "Print and static"): a page that says
// `static: true` (or a part whose fence says `static`) draws one step whole and flat, with every caption listed (open in
// print), and the server also plans the print width (ui/stage PRINT_W) so a sheet needs no re-layout. Server rendering only.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { DhDocument } from "../../../src/react/index";
import { tryEngine } from "../../../src/engine/bridge";
import { layoutFindings } from "../../../src/engine/core/check-layout";
import { PRINT_W } from "../../../src/ui/stage";
import { ROOT } from "../parse/fixtures";

const fixture = (f: string) => readFileSync(join(ROOT, "fixtures", f + ".dh.md"), "utf8");
/** the fixture's first animation fence alone, under the fixture's own front matter (its roles), with the fence's own
 *  words after `animation` and, when asked, `static: true` in the front matter */
const page = (f: string, word = "", pageStatic = false) => {
  const text = fixture(f);
  const open = text.search(/^```animation/m);
  const fence = text.slice(open).replace(/^```animation[^\n]*/, (m) => m + word).split(/^```$/m)[0] + "```\n";
  const fm = text.startsWith("---\n") ? text.slice(4, text.indexOf("\n---", 4)) : "";
  return `---\n${fm}${pageStatic ? "\nstatic: true" : ""}\n---\n\n${fence}`;
};
const draw = (md: string) => renderToString(React.createElement(DhDocument, { doc: parse(md, { path: "print.dh.md" }) as any, engine: "new" }));

describe("print and static through the new engine", () => {
  for (const f of ["format/48-animation-binary-search-tree-insert", "stage/01-animation-a-composed-stage", "gt/05-dns-lookup"]) {
    test(`${f}: a static page draws the last step whole, lists every caption (open in print), and plans the print width`, () => {
      const withFm = page(f, "", true);
      const html = draw(withFm);
      expect(html).toContain('data-engine="12"');                 // the new engine drew it
      expect(html).toContain("dh-static-steps");                  // one step whole + the list of steps
      expect(html).not.toContain("stg-foot");                      // no player, no control row
      expect(html).not.toContain("stg-btn");                       // no zoom or fit buttons
      expect(html).toMatch(/data-print/);                          // the print plan (PRINT_W) is in the page
      const blocks = (parse(withFm, { path: "print.dh.md" }) as any).blocks.filter((b: any) => b.type === "animation");
      const c = tryEngine(blocks[0]).c!;
      const n = c.states.length - 1;
      expect(html).toContain(`data-step="${n}"`);                  // the last step is the one drawn
    });
  }

  test("the print plan draws every step at PRINT_W with the words never under 11 px", () => {
    for (const f of ["format/48-animation-binary-search-tree-insert", "stage/01-animation-a-composed-stage", "gt/05-dns-lookup"]) {
      const blocks = (parse(page(f), { path: "print.dh.md" }) as any).blocks.filter((b: any) => b.type === "animation");
      const c = tryEngine(blocks[0]).c!;
      const p = c.plan(PRINT_W);
      for (let k = 0; k < c.states.length; k++) expect(p.frame(k).length).toBeGreaterThan(0);
      expect(layoutFindings(c, [PRINT_W]).filter((x) => x.kind === "small")).toEqual([]);
    }
  });

  test("a fence that says static draws one step in a live page; static=false keeps the player", () => {
    const f = "format/48-animation-binary-search-tree-insert";
    const st = draw(page(f, " static")), live = draw(page(f, " static=false"));
    expect(st).toContain("dh-static-steps");
    expect(st).not.toContain("stg-foot");
    expect(live).not.toContain("dh-static-steps");
    expect(live).toContain("stg-foot");
  });
});

describe("a static still scene (no steps)", () => {
  test("draws its one state: stage/example-layers fence 13 threw 'reading things' (the static step index 1 of a story with no step 1)", () => {
    const md = "```animation static\nbox a \"first\"\nbox b \"second\"\na -> b\n```\n";
    const html = draw(md);
    expect(html).toContain('data-engine="12"');
    expect(html).not.toContain("dh-error");
  });
});
