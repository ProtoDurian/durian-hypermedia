// 0.7.0-rc.4 (the measure refit): the stage font's widths as a browser draws them. The old estimate read regular lines up to
// a fifth short, so a card line it kept could run past its border (the layers story's copper card at 1280, 5 px; its
// cards at 860, up to 12 px). Now a line whose drawn width (Poppins, poppinsW) would reach a card's border breaks again;
// lines that stay inside keep their place. Public layers.dh.md.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
import * as core from "../../src/core/stage-core";
import type { Item } from "../../src/core/stage-core";

const SRC = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
const fm = SRC.slice(0, SRC.indexOf("\n---\n", 4)), roles: Record<string, number> = {};
for (const m of fm.slice(Math.max(0, fm.indexOf("\nroles:\n"))).matchAll(/^  ([a-z][\w-]*): (?:c(\d)|\{[^}]*colour: c(\d)[^}]*\})/gm)) roles[m[1]] = +(m[2] ?? m[3]);
const blocks = [...SRC.matchAll(/^```animation[^\n]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
const lay = (src: string, w: number) => {
  const parts = src.split(/^@step /m), steps = parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: i + 1 }; });
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const c = compileStage(parts[0], steps, 1, {}, roles); expect(c.errors).toEqual([]);
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); return layoutStage(c.model, w).items;
};
type Text = Extract<Item, { k: "text" }>; type Box = Extract<Item, { k: "box" }>;
const drawn = (s: string, f: core.Font) => (core as unknown as { poppinsW?: (s: string, f: core.Font) => number }).poppinsW?.(s, f) ?? NaN;

test("browser widths: whole-pixel Poppins advances at the stage sizes, never under the font's own widths", () => {
  // as Chrome draws them (Linux, hinting on): 'm' 13 px and 'i' 3 px in light 12 px; 'W' 13 px in medium 13.5 px (Chrome 13, the font 13.49)
  expect(drawn("m", "sub")).toBe(13); expect(drawn("i", "sub")).toBe(3); expect(drawn("W", "title")).toBeCloseTo(13.49, 1); // the larger: its own width is 13.49
  for (const s of ["copper pair", "seq 2001", "a → b · c", "Ünïcode"]) for (const f of ["sub", "body", "title", "chip"] as const) expect(drawn(s, f)).toBeGreaterThan(0);
});
for (const w of [1178, 800, 766]) test(`layers story at ${w}: no card line drawn past its card's border`, () => {
  const out: string[] = []; let seen = 0;
  for (const [b, src] of blocks.entries()) {
    const its = lay(src, w), boxes = its.filter((i): i is Box => i.k === "box" && i.bar?.kind === "card" && i.w > 40 && i.h > 26);
    for (const t of its.filter((i): i is Text => i.k === "text" && (i.anchor ?? "start") === "start" && i.f === "sub" /* a card's lines */ && !i.rotate && !i.size)) {
      const box = boxes.filter((q) => t.x >= q.x && t.x <= q.x + q.w && t.y - 6 >= q.y && t.y - 6 <= q.y + q.h).sort((p, q) => p.w * p.h - q.w * q.h)[0];
      if (box) seen++;
      if (box && !(t.x + drawn(t.s, t.f) <= box.x + box.w)) out.push(`block ${b}: ${JSON.stringify(t.s)} ${(t.x + drawn(t.s, t.f) - box.x - box.w).toFixed(1)} px`);
    }
  }
  expect(seen).toBeGreaterThan(50); // card lines checked
  expect(out).toEqual([]);
});
