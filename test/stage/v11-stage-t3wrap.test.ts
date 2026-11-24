// 0.7.0-rc.3 review MUST 4: the layers example's routing table T3 at 1280: a card line of addresses ran past the card's
// border (digits draw wider than the measure says). Off a phone, a card line whose drawn width would cross the border
// breaks again by drawn width; a line that fits keeps its place. Public fixtures/stage/example-layers.dh.md.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import { drawnW, type Item } from "../../src/core/stage-core";

const SRC = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
const fm = SRC.slice(0, SRC.indexOf("\n---\n", 4)), roles: Record<string, number> = {};
for (const m of fm.slice(fm.indexOf("\nroles:\n")).matchAll(/^  ([a-z][\w-]*): (?:c(\d)|\{[^}]*colour: c(\d)[^}]*\})/gm)) roles[m[1]] = +(m[2] ?? m[3]);
const section = (title: string, w: number) => {
  const at = SRC.indexOf(`\n## ${title}\n`); expect(at).toBeGreaterThan(0);
  const src = SRC.slice(at).match(/^```animation[^\n]*\n([\s\S]*?)^```$/m)![1];
  const parts = src.split(/^@step /m), steps = parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: i + 1 }; });
  beginDocument(); const c = compileStage(parts[0], steps, 1, {}, roles); expect(c.errors).toEqual([]);
  beginDocument(); return layoutStage(c.model, w);
};
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;

for (const w of [1280, 1180]) test(`6 at ${w}: every line of routing tables T3 and T4 stays inside its card, drawn`, () => {
  const p = section("6. Two internet routers: how they know the way", w);
  for (const id of ["t3", "t4"]) {
    const card = p.items.filter((it): it is Box => it.k === "box" && (it as { id?: string }).id === id); expect(card.length).toBeGreaterThan(0);
    for (const b of card) {
      const lines = p.items.filter((it): it is Text => it.k === "text" && (!it.anchor || it.anchor === "start") && it.x > b.x && it.x < b.x + b.w && it.y > b.y + 20 && it.y < b.y + b.h);
      expect(lines.length).toBeGreaterThan(5);
      for (const t of lines) expect({ id, s: t.s, past: Math.round(t.x + drawnW(t.s, t.f) - (b.x + b.w - 4)) > 0 }).toEqual({ id, s: t.s, past: false });
    }
  }
});
