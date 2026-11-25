import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decodeHTML } from "entities";
import { expect, test } from "bun:test";
import { parse } from "../../index";
import { UI } from "../../ui/ui";
import type { PartBlock, PartViewProps } from "../types";
import type { SankeySpec } from "./part";
import View from "./view";
import { labelledLayout, labelLines } from "./labels";
const source = '# Flows\n\n```sankey static title="A request"\na -> b: 12\nb -> c: 12\nnode a "Request preparation and application processing service" [c1]\nnode b "Business processing" [c2]\nnode c "Response assembly and delivery to the waiting client" [c3]\n```';
const block = parse(source, { path: "flows.dh.md" }).blocks.find(b => b.type === "sankey") as PartBlock<SankeySpec>;
const draw = (width: number, theme: "light" | "dark") => renderToStaticMarkup(<View {...({ block, data: block.data, static: "", ui: UI.en, stage: { width, theme, motion: "off", report() {} } } satisfies PartViewProps<SankeySpec>)} />);
test("visible Sankey labels keep every word at wide and narrow widths", () => {
  for (const width of [1180, 390]) for (const theme of ["light", "dark"] as const) {
    const html = draw(width, theme), labels = [...html.matchAll(/<text[^>]*data-dh-slot="node-label"[^>]*>([\s\S]*?)<\/text>/g)].map(m => decodeHTML(m[1].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim());
    expect(labels).toEqual(block.data.nodes.map(n => n.label));
    expect(labels.some(s => s.includes("…"))).toBe(false);
  }
});
test("each Sankey label has a backing plate and static has no player or live hint", () => {
  const html = draw(1180, "dark");
  expect([...html.matchAll(/class="sk-plate"/g)]).toHaveLength(block.data.nodes.length);
  expect(html).not.toContain('class="ctl"');
  expect(html).not.toContain('class="sankey-hint"');
});
test("labels stay inside the drawing and keep whole words in both layout directions", () => {
  const measure = (s: string) => s.length * 7.2;
  const vertical = parse('# Flows\n\n```sankey\na -> b: 12\nb -> c: 12\nc -> d: 8\nc -> e: 4\nnode a "Incoming application request"\nnode b "Authentication and authorization"\nnode c "Database processing"\nnode d "Response assembly for the client"\nnode e "Response cache update"\n```').blocks.find(b => b.type === "sankey") as PartBlock<SankeySpec>;
  for (const spec of [block.data, vertical.data]) for (const width of [1180, 390, 360, 300]) {
    const { layout, labels } = labelledLayout(spec, width, measure);
    const all = [...labels.values()];
    for (const [id, p] of labels) {
      expect(p.lines.join(" ")).toBe(spec.nodes.find(n => n.id === id)!.label);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(layout.width);
      expect(p.y + p.h).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  }
  expect(labelLines("one unbreakableword three", 20, measure)).toEqual(["one", "unbreakableword", "three"]);
});
test("many words in a label do not overflow the JavaScript argument stack", () => {
  const label = "word ".repeat(140_000).trim();
  const spec = { ...block.data, nodes: block.data.nodes.map((n, i) => i ? n : { ...n, label }) };
  const { labels } = labelledLayout(spec, 1180, s => s.length * 7.2);
  expect(labels.get(spec.nodes[0].id)!.lines.join(" ")).toBe(label);
});
test("on a phone every label is tied to its own node: right over it, or by a line that crosses no other label", () => {
  const measure = (s: string) => s.length * 7.2;
  const text = readFileSync(join(import.meta.dir, "../../../fixtures/format/00-sankey.dh.md"), "utf8");
  const spec = (parse(text, { path: "00-sankey.dh.md" }).blocks.find(b => b.type === "sankey") as PartBlock<SankeySpec>).data;
  for (const width of [420, 390, 360, 320]) {
    const { layout, labels } = labelledLayout(spec, width, measure);
    expect(layout.vertical).toBe(true);
    for (const n of layout.nodes) {
      const p = labels.get(n.id)!, cx = n.x + n.w / 2;
      const over = cx >= p.x + 6 && cx <= p.x + p.w - 6 && p.y + p.h + 6 >= n.y;
      if (!over) {
        expect(p.lead).toBeDefined();
        expect(p.lead!.x).toBeGreaterThanOrEqual(n.x - 0.5);
        expect(p.lead!.x).toBeLessThanOrEqual(n.x + n.w + 0.5);
        expect(p.lead!.y1).toBeCloseTo(n.y, 3);
        for (const [id, q] of labels) {
          if (labels.get(n.id) === q) continue;
          const crosses = !(q.y + q.h <= p.lead!.y0 || q.y >= p.lead!.y1 || p.lead!.x < q.x - 2 || p.lead!.x > q.x + q.w + 2);
          expect(crosses).toBe(false);
        }
      }
    }
    // the label of the 5 ms node, far right and tiny, is the one a reader mistook for the node beside it: it is tied by a line
    expect(labels.get("cache")!.lead).toBeDefined();
  }
});
