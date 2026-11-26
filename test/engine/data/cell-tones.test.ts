// render3: a cell's own tone (`tone a.3 good`; the graph engine's `set a.3 tone=good`). A part has no ThingState, so the
// tone was dropped and "the engine" (format 47) never showed its sorted cells good. The data layout reads the facts that
// name its cells; a tone holds from its step on, by slot, until `tone a.3 off`.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { atSizes } from "../../../src/engine/render/font";
import type { EngineSrc, Prim } from "../../../src/engine/types";

const FILE = "fixtures/format/47-animation-the-engine.dh.md";
const tones = (f: Prim[]) => ["a.0", "a.1", "a.2", "a.3"].map((id) => (f.find((q) => q.k === "box" && q.id === id) as Extract<Prim, { k: "box" }> | undefined)?.tone ?? null);

describe("a cell's own tone", () => {
  const text = readFileSync(join(ROOT, FILE), "utf8");
  for (const [form, page] of [["old", text], ["format 12", migrate(text)]] as const) test(form, () => {
    const c = compile(fencesOf(join(ROOT, FILE), page, form)[0].src);
    for (const w of [1178, 356]) atSizes(w < 480, () => {
      const p = c.plan(w);
      expect(tones(p.frame(3))).toEqual([null, null, null, null]);
      expect(tones(p.frame(4))).toEqual([null, null, null, "good"]);
      expect(tones(p.frame(5))).toEqual(["good", "good", "good", "good"]);
    });
  });
  test("off ends it, dim dims one cell, the array's own tone stays under", () => {
    const body = "s [array]: 1 2 3\n@step One\ntone s.1 bad\ndim s.2\n@step Two\ntone s.1 off\ndim s.2 off\n@step Three\ntone s warn";
    const src: EngineSrc = { body: `layout: graph\nplain ${body}`, line0: 1, fence: {}, roles: {}, format12: true };
    const c = compile(src);
    const p = c.plan(800);
    const cell = (k: number, id: string) => p.frame(k).find((q) => q.k === "box" && q.id === id) as Extract<Prim, { k: "box" }>;
    expect([cell(1, "s.1").tone, cell(1, "s.2").dim, cell(1, "s.0").tone]).toEqual(["bad", true, null]);
    expect([cell(2, "s.1").tone, cell(2, "s.2").dim]).toEqual([null, false]);
    expect([cell(3, "s.0").tone, cell(3, "s.1").tone]).toEqual(["warn", "warn"]);
  });
});
