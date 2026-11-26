// The sankey's first drawing (the server's HTML, before the browser has measured the card): both a wide and a phone
// drawing are in it and CSS shows the one that fits, so a phone's first paint is not a 726 px drawing in a 330 px card.
// After the first measure exactly one drawing is made, at the card's width.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../index";
import { UI } from "../../ui/ui";
import type { PartBlock, PartViewProps } from "../types";
import type { SankeySpec } from "./part";
import View from "./view";
const source = '# Flows\n\n```sankey title="A request"\na -> b: 12\nb -> c: 7\nb -> d: 5\nc -> e: 7\nnode a "Request"\nnode b "Handler"\nnode c "Database"\nnode d "Cache"\nnode e "Response"\n```';
const block = parse(source, { path: "flows.dh.md" }).blocks.find((b) => b.type === "sankey") as PartBlock<SankeySpec>;
const draw = (width: number) => renderToStaticMarkup(<View {...({ block, data: block.data, static: "", ui: UI.en, stage: { width, theme: "light", motion: "off", report() {} } } satisfies PartViewProps<SankeySpec>)} />);
const widthsOf = (html: string) => [...html.matchAll(/<svg width="(\d+)"/g)].map((m) => +m[1]);

test("before the first measure: a wide drawing and a phone drawing, the phone one narrow enough for a 390 px page", () => {
  const html = draw(0);
  expect(html).toContain("is-pre-wide");
  expect(html).toContain("is-pre-phone");
  const [wide, phone] = widthsOf(html);
  expect(wide).toBeGreaterThan(600);
  expect(phone).toBeLessThanOrEqual(390 - 2 * 16 - 2);   // the card inside a 390 px page
});
test("after the first measure: one drawing, at the card's width (phone and wide)", () => {
  for (const [stage, want] of [[358, 332], [328, 302], [1180, 1146]] as const) {
    const html = draw(stage);
    expect(html).not.toContain("is-pre-");
    expect(widthsOf(html)).toHaveLength(1);
    expect(widthsOf(html)[0]).toBeGreaterThanOrEqual(want);
  }
});
test("the style picks the phone drawing under 600 px and hides it above", () => {
  const css = readFileSync(join(import.meta.dir, "style.css"), "utf8");
  expect(css).toMatch(/\.sankey-box\.is-pre-phone\s*\{\s*display:\s*none/);
  expect(css).toMatch(/@container \(max-width: 600px\)\s*\{[^}]*\.is-pre-wide\s*\{\s*display:\s*none[^}]*\}[^}]*\.is-pre-phone\s*\{\s*display:\s*block/);
  expect(css).toMatch(/\.sankey-box\.is-pre-phone svg\s*\{[^}]*width:\s*100%/);
});
