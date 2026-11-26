// A composed stage keeps room for its tallest caption from the first step (0.7.0-rc.3, rc.2 review SHOULD-FIX 2): on a phone
// a caption that wraps to one more line made the stage 18 px taller on that step, so everything under it moved.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "../../src/index";
import { DhDocument } from "../../src/react/index";
import { beginDocument, endDocument } from "../../src/core/stage-budget";

afterEach(() => { endDocument(); beginDocument(); });
const SRC = "---\nroles: { client: c1, server: c3 }\n---\n# T\n\n```animation\n## Clients\nclient c1: the browser\n## Servers\nserver s1: the API\n@step Ask: Short.\nc1 -> s1: GET\n@step Answer: A much longer caption that wraps to a second line on a phone, and would have moved the page under the stage.\ns1 -> c1: 200\n```\n";

test("every step's caption is in the caption box, the shown one first, the others hidden and kept from screen readers", () => {
  const html = renderToStaticMarkup(React.createElement(DhDocument, { doc: parse(SRC, { path: "t.dh.md" }) }));
  const box = html.match(/<div class="stg-capbox">([\s\S]*?)<\/div>/)?.[1] ?? "";
  expect(box).toContain('<p class="stg-cap" data-bar-caption=""><strong class="eng-step-title">Ask.</strong> Short.</p>'); // the step's title leads (one engine)
  expect([...box.matchAll(/<p class="stg-cap stg-cap-room" aria-hidden="true">(.*?)<\/p>/g)].map((m) => m[1].replace(/<strong[^>]*>[^<]*<\/strong> /, ""))).toEqual(["Short.", "A much longer caption that wraps to a second line on a phone, and would have moved the page under the stage."]);
});

test("the stylesheet stacks the captions in one grid cell and hides the room copies", () => {
  const css = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8");
  expect(css).toContain(".stg-capbox { display: grid; }");
  expect(css).toContain(".stg-capbox > .stg-cap { grid-area: 1 / 1; }");
  expect(css).toContain(".stg-cap-room { visibility: hidden; }");
});
