// Lane core2: the wrap form of `set`, gone words with their new spelling, the widths tryEngine plans.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine, TRY_WIDTHS } from "../../../src/engine/bridge";
import { compile } from "../../../src/engine/pipeline";
import { isKeysSet } from "../../../src/engine/core/states";
import { GONE_WORDS, goneMessage } from "../../../src/engine/core/gone";
import { SSR_W, screenPlanWidth } from "../../../src/ui/stage";
import { ENG_SSR_W } from "../../../src/engine/render/svg"; // hydrate

const ROOT = join(import.meta.dir, "../../..");
const blocksOf = (file: string): any[] => {
  const doc: any = parse(readFileSync(join(ROOT, "fixtures", file), "utf8"), { path: file });
  const all: any[] = []; const walk = (bs: any[]) => { for (const b of bs ?? []) { all.push(b); walk(b.children ?? b.blocks ?? []); } }; walk(doc.blocks);
  return all.filter((b) => b.type === "animation");
};
const problems = (body: string) => compile({ body, line0: 1, fence: {}, roles: { node: 1 }, format12: true }).problems.map((p) => p.msg);
const HEAD = "node a: A\nnode b: B\n@step S: x\n";

describe("`set`: the graph form and the wrap form", () => {
  test("`set id k=v` is the graph form; `set box: a => b` is the wrap layout's", () => {
    const f = (arg: string) => ({ k: "layout", word: "set", arg, body: [], src: { line: 1 } }) as any;
    expect(isKeysSet(f("a tone=warn"))).toBe(true);
    expect(isKeysSet(f("box: status: packed => status: out"))).toBe(false);
    expect(isKeysSet(f("pk: TTL 64 => TTL 63"))).toBe(false);
    expect(isKeysSet({ ...f("a tone=warn"), word: "tag" })).toBe(false);
  });
  test("the 4 fences that read the wrap form as the graph form now compile", () => {
    const fences: [string, number][] = [["stage/example-layers.dh.md", 8], ["stage/example-layers.dh.md", 9], ["stage/example-layers.dh.md", 11], ["stage/20-animation-boxes-inside-boxes.dh.md", 1]];
    for (const [file, n] of fences) {
      const t = tryEngine(blocksOf(file)[n - 1]);
      expect(t.err).toBeNull();
      expect(t.c).not.toBeNull();
    }
  });
});

describe("a gone word is refused with its new spelling in format 12", () => {
  const cases: [string, RegExp][] = [
    ["tag a: hi", /"tag" is not a word of a step in format 12; write "ids is words"/],
    ["move a to b", /"move".*write "id at place".*"id in container"/],
    ["swap a b", /"swap".*"id = v1 v2 v3"/],
    ["add a", /"add".*show id/],
    ["remove a", /"remove".*"hide id"/],
    ["highlight a", /"highlight".*"light ids"/],
    ["push a 5", /"push".*"id = v1 v2 v3"/],
    ["send a b: hi", /"send".*"a -> b: words"/],
    ["hush", /"hush".*lasts until it is changed/],
  ];
  for (const [line, re] of cases) test(`${line.split(" ")[0]}`, () => {
    const p = problems(HEAD + line);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(re);
  });
  test("a word of a layout the scene does not use is refused, naming the layout", () => {
    const p = problems(HEAD + "unwrap a");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/"unwrap" is a word of the wrap layout, and this scene does not use it/);
  });
  test("every gone word has a spelling", () => { for (const w of GONE_WORDS) expect(goneMessage(w)).toMatch(new RegExp(`^"${w}" is not a word of a step in format 12; .{10,}`)); });
  test("a word that is not an old word keeps the nearest-word hint", () => {
    expect(problems(HEAD + "ligth a")[0]).toMatch(/"ligth" is not a word of a step/);
    expect(goneMessage("ligth")).toBeNull();
  });
  test("an old block with a word no layout owns still only warns (the lanes adapter reads it from the block's text)", () => {
    const t = tryEngine(blocksOf("stage/15-animation-cards-inside-cards.dh.md")[0]);
    expect(t.err).toBeNull();
  });
});

describe("tryEngine plans only widths the page draws", () => {
  test("a desktop and a phone width from the page's own plan widths", () => {
    expect(TRY_WIDTHS).toHaveLength(2);                       // a desktop and a phone width
    for (const w of TRY_WIDTHS) expect((SSR_W as readonly number[]).includes(w)).toBe(true);
    // hydrate: the widths a desktop page and a 390 px phone keep (their stage boxes, 1178 and 356), both drawn by the server
    expect([...TRY_WIDTHS]).toEqual([screenPlanWidth(1178), screenPlanWidth(390 - 34)]);
    for (const w of TRY_WIDTHS) expect((ENG_SSR_W as readonly number[]).includes(w)).toBe(true);
    const t = tryEngine(blocksOf("stage/01-animation-a-composed-stage.dh.md")[0]);
    expect(t.err).toBeNull();
    expect(t.widths).toEqual([...TRY_WIDTHS]);
    expect(t.widths.includes(1000) || t.widths.includes(390)).toBe(false);
  });
});
