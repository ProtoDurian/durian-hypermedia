// 0.7.0-rc.3 (the rc.3 review, the layers story): a break by drawn width pushed a word down and a 2-line card cut ':443' and
// 'protocol 6' ("…"); a card line now takes the lines it needs, so no fact is cut in 'The server unwraps' at any width
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, newBudget } from "../../src/core/stage-budget";

const SRC = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
const fm = SRC.slice(0, SRC.indexOf("\n---\n", 4)), roles: Record<string, number> = {};
for (const m of fm.slice(fm.indexOf("\nroles:\n")).matchAll(/^  ([a-z][\w-]*): (?:c(\d)|\{[^}]*colour: c(\d)[^}]*\})/gm)) roles[m[1]] = +(m[2] ?? m[3]);
const scene = [...SRC.matchAll(/^```animation[^\n]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]).find((x) => x.includes("tcp: layer 4 | connection 198.51.100.7:40001 to :443"))!;
const lines = (src: string, w: number) => {
  const parts = src.split(/^@step /m), steps = parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: i + 1 }; });
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const c = compileStage(parts[0], steps, 1, {}, roles); expect(c.errors).toEqual([]);
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); return layoutStage(c.model, w).items.filter((i) => i.k === "text").map((i) => (i as { s: string }).s);
};
for (const w of [1280, 800, 390]) test(`'The server unwraps' at ${w}: no card line is cut short`, () => {
  const ls = lines(scene, w);
  expect(ls.filter((l) => l.endsWith("…") && !l.startsWith("sealed "))).toEqual([]);
  expect(ls.join(" ")).toContain(":443");
  expect(ls.join(" ")).toContain("protocol 6");
});

// cut words are a clip; the layers story at 800 had 5 card lines cut by the 3-line card clamp (sections 2, 4, 5)
test("the layers story at 800: no card line is cut short", () => {
  const all = [...SRC.matchAll(/^```animation[^\n]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]).filter((s) => !/^plot: .* \| line$/m.test(s)); // the ten scenes (the signal stills apart)
  expect(all.length).toBe(10);
  expect(all.flatMap((s) => lines(s, 800)).filter((l) => l.endsWith("…") && !l.startsWith("sealed "))).toEqual([]);
});
