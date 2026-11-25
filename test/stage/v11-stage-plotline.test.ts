// 0.7.0-rc.3 (rc.3 review, row 5: layer 1 as a visible signal): "plot: a..b | unit | line" draws each role's points
// as one plain line (a signal): no dot on a point, words only where a point has its own label; the LLM view says each
// line as runs of one value. The layers story draws copper's levels, fibre's light and radio's phase under scene 4.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
import { measure } from "../../src/core/stage-core";
import { parseDoc, llmView } from "../../src/core/dh-lib";

const SRC = "title: A lamp | on and off\ntime: 0..4 | seconds\nplot: 0..1 | light | line\npoint signal a at 0: 1 | on\npoint signal b at 0.99: 1\npoint signal c at 1: 0\npoint signal d at 3.99: 0\npoint signal e at 4: 1\n";
const lay = (src: string, w: number) => { beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const c = compileStage(src, [], 1, {}, { signal: 6 }); expect(c.errors).toEqual([]); beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); return layoutStage(c.model, w); };

for (const w of [1180, 390]) test(`a line plot at ${w}: no dots, no id words; the written label stays; the line runs through every point`, () => {
  const p = lay(SRC, w), dots = p.items.filter((it) => it.k === "box" && String((it as { id?: string }).id).includes(":point:"));
  expect(dots).toEqual([]);
  const words = p.items.filter((it) => it.k === "text").map((it) => (it as { s: string }).s);
  expect(words).toContain("on"); for (const id of ["a", "b", "c", "d", "e"]) expect(words).not.toContain(id);
  expect(p.items.filter((it) => it.k === "path" && (it as { ink?: string }).ink === "role:signal:line" && !String((it as { id?: string }).id).includes(":point-label:")).length).toBe(4);
  const dotted = lay(SRC.replace(" | line\n", "\n"), w); expect(dotted.items.filter((it) => it.k === "box" && String((it as { id?: string }).id).includes(":point:")).length).toBe(5);
});

test("the LLM view says a line plot as runs of one value", () => {
  const v = llmView(parseDoc("t.dh.md", "---\ntitle: T\nroles: { signal: c6 }\n---\n# T\n\n```animation\n" + SRC + "```\n"), "t.dh.md");
  expect(v).toContain("The signal line: 1 from 0 to 0.99 (on), 0 from 1 to 3.99, 1 at 4.");
});

test("the layers story draws layer 1 as signals under scene 4: copper's levels, fibre's light, radio's phase", () => {
  const page = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
  const s4 = page.slice(page.indexOf("\n## 4. "), page.indexOf("\n## 5. ")), fences = [...s4.matchAll(/^```animation\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
  expect(fences.length).toBe(4);
  expect(fences.slice(1).map((f) => f.match(/^title: ([^|]+)/)![1].trim())).toEqual(["Copper: pair A over five bytes", "Fibre: brighter and dimmer light", "Radio: the phase of a wave"]);
  for (const f of fences.slice(1)) { expect(f).toMatch(/^plot: .* \| line$/m); const p = lay(f, 1180); expect(p.items.filter((it) => it.k === "path" && (it as { ink?: string }).ink === "role:signal:line").length).toBeGreaterThan(6); }
});

// the rc.3 review of the copper still: a line of whole-number levels gets a grid line at every level, and a plain line's labels
// keep off the line (the radio wave ran through '10: 315°' at 390)
const FIX = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8"), stills = [...FIX.matchAll(/^```animation[^\n]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]).filter((x) => /^plot: .* \| line$/m.test(x));
const STILL = stills.find((x) => x.startsWith("title: Copper"))!, RADIO = stills.find((x) => x.startsWith("title: Radio"))!;
test("the copper still: pair A, five symbols, one grid line at each of the five levels", () => {
  expect(STILL).toMatch(/^title: Copper: pair A over five bytes/);
  const p = lay(STILL, 1180), grid = p.items.filter((it) => it.k === "path" && (it as { dash?: boolean }).dash && (it as { ink?: string }).ink === "line");
  expect(new Set(grid.map((g) => Math.round((g as { pts: number[][] }).pts[0][1]))).size).toBe(5);
});
for (const w of [1180, 390]) test(`the radio still at ${w}: no label lies on the wave`, () => {
  const p = lay(RADIO, w), wave = p.items.filter((it) => it.k === "path" && (it as { ink?: string }).ink === "role:signal:line" && !String((it as { id?: string }).id).includes(":point-label:")) as { pts: number[][] }[];
  const labels = p.items.filter((it) => it.k === "text" && /°$/.test((it as { s: string }).s)) as { x: number; y: number; s: string; f: "sub" }[];
  expect(labels.length).toBe(4);
  for (const l of labels) { const x0 = l.x, x1 = l.x + measure(l.s, "sub"), y0 = l.y - 12, y1 = l.y + 3;
    expect(wave.filter((s) => { const [[ax, ay], [bx, by]] = s.pts; return Math.max(ax, bx) > x0 && Math.min(ax, bx) < x1 && Math.max(ay, by) > y0 && Math.min(ay, by) < y1; }).length).toBe(0); }
});
