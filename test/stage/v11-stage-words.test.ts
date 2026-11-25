// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "words": one language for the composed stage (1.7; 1.8). Old words say the new one;
// show and light reach a block's own ids; two blocks may own one step word; "keep" makes a mark stay.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, type Compiled } from "../../src/core/stage";
import { registerBlock, StageError, type StageBlock } from "../../src/core/stage-core";
import { oldWord } from "../../src/core/stage-words";
import { beginDocument } from "../../src/core/stage-budget";

beforeEach(() => { beginDocument(); });

const ROLES = { client: 1, server: 2, store: 3, job: 4 };
function scene(src: string): Compiled {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^@step (.*)$/);
    if (m) steps.push({ title: m[1], raw: "", line: i + 1 });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return compileStage(head.join("\n"), steps, 1, {}, ROLES);
}
const msgs = (c: Compiled) => c.errors.map((e) => e.msg).join(" | ");

// a test head block with ids of its own ("pots"), owning show, light and at
type Pots = { ids: string[]; got: string[] };
registerBlock({
  word: "pots", kind: "head", ops: ["show", "light", "at"],
  parse: (inp): Pots => ({ ids: inp.arg.split(",").map((x) => x.trim()).filter(Boolean), got: [] }),
  op(p: Pots, op) {
    const id = op.arg.split(":")[0].trim();
    if (op.word === "at" && !/^\d+$/.test(id)) return false;
    if (op.word !== "at" && !p.ids.includes(id)) return false;
    p.got.push(`${op.word}${op.keep ? "+keep" : ""} ${op.arg}`);
  },
  layout: () => ({ h: 0, items: [] }),
  facts: () => [],
} satisfies StageBlock<Pots>);
const pots = (c: Compiled) => (c.model.head.find((h) => h.block.word === "pots")!.node as Pots).got;

describe("old words say the new one", () => {
  const cases: [string, "step" | "setup" | "under", string[], string][] = [
    ["ghost w1", "step", [], `say "dim w1"`],
    ["dash r2 off", "step", [], `say "dashed r2 off"`],
    ["chip q tok, #2: bad | too wide", "step", [], `say "mark q tok, #2: bad too wide"`],
    ["tmark 30 [bad]: check", "step", [], `say "keep at 30 [bad]: check"`],
    ["tspan draft 0..2: held", "step", [], `say "keep span draft 0..2: held"`],
    ["tdot 30: newest", "step", [], `say "dot 30: newest"`],
    ["tarrow a -> b at 1.5: saved", "step", [], `say "arrow a -> b at 1.5: saved"`],
    ["enter t4", "step", ["matrix"], `say "show t4"`],
    ["spot t3", "step", ["matrix"], `say "light t3"`],
    ["cell d.in: two wait", "step", ["matrix"], `say "light d.in: two wait"`],
    ["new 7..12", "step", ["columns"], `say "light 7..12"`],
    ["bar Fri: busiest", "step", ["bars"], `say "light Fri: busiest"`],
    ["head: cups by day | March", "step", ["bars"], `say "heading: cups by day | March"`],
    ["move Fri -> Mon (2), Fri -> Tue (1)", "step", ["bars"], `say "move 2 from Fri to Mon; 1 from Fri to Tue"`],
    ["keep t1 3: good", "step", ["sheet"], `say "keep mark t1 3: good"`],
    ["dim t1 none", "step", ["sheet"], `say "dim t1 off"`],
    ["tone sb acc", "step", [], `say "tone sb accent"`],
    ["mark t1 2: acc +15", "step", ["sheet"], `say "mark t1 2: accent +15"`],
    ["marker 31: ready", "setup", ["time"], `say "at 31: ready"`],
    ["zoomrow job r \"R\": +w 39..41", "setup", ["time"], `say "zoom row job r`],
    ["zoomticks: 40 check", "setup", ["time"], `say "zoom ticks: 40 check"`],
    ["ruler: lines", "setup", ["time"], "drop this line"],
    ["values: 0..100 | percent", "setup", ["time"], `say "plot: 0..100 | percent"`],
    ["band in: Intake | arrives", "setup", ["matrix"], `say "column in: Intake | arrives"`],
    ["cols: morning, noon", "setup", ["sheet"], `say "labels: morning, noon"`],
    ["bin job c \"Odd\" from 3: needs a form", "setup", ["bins"], `write "show c" in step 3`],
    ["row job d \"D\": +a 0..1 [focus]", "setup", ["time"], `say "row job d "D": +a 0..1 [lit]"`],
    ["row job d \"D\": hold 1..2 [idle]", "setup", ["time"], `[dashed]`],
  ];
  for (const [t, where, heads, want] of cases)
    test(t, () => { expect(oldWord(t, where, { heads: new Set(heads), roles: new Set(Object.keys(ROLES)) }) ?? "").toContain(want); });
  test("switch under bars", () => {
    expect(oldWord("mark leaving", "under", { heads: new Set(["columns"]), roles: new Set() }, "columns 12 job: x | y")).toContain(`say "leaving: darker"`);
    expect(oldWord("ruler: none", "setup", { heads: new Set(["time"]), roles: new Set() })).toBeNull();
    expect(oldWord("switch Before: 1..2; After: 3", "under", { heads: new Set(["bars"]), roles: new Set() }, "bars 7 job: cups | x")).toContain(`say "tabs Before: 1..2; After: 3"`);
    expect(oldWord("switch Before: 1..2", "under", { heads: new Set(["bars"]), roles: new Set() }, "job h: a card")).toBeNull();
  });
  test("a word is old only where its block is: new, cell, band and marker are plain words elsewhere", () => {
    const none = { heads: new Set<string>(), roles: new Set<string>() };
    for (const t of ["new 7..12", "cell d.in", "band in: x", "marker 31: x", "cols: a"]) expect(oldWord(t, t.includes(":") && !t.startsWith("cell") ? "setup" : "step", none)).toBeNull();
  });
  test("a card line of a role named like an old word is a card", () => {
    expect(oldWord("band b1: the brass band", "setup", { heads: new Set(["matrix"]), roles: new Set(["band"]) })).toBeNull();
  });
  test("current words are not old", () => {
    const sc = { heads: new Set(["sheet", "time", "matrix", "bars", "columns", "bins"]), roles: new Set<string>() };
    for (const t of ["move p3 to w", "move 2 from Fri to Mon", "heading: a", "dim w1", "dashed r2", "mark t1 2: bad +15", "keep mark t1 3: good", "keep at 30: check", "dot 5", "light d.in: two", "show t4", "tone sb accent", "dim t1 off", "at 31: ready"])
      expect(oldWord(t, "step", sc)).toBeNull();
    for (const t of ["column in: Intake", "labels: a, b", "zoom row job r \"R\": +w 1..2", "at 31: ready", "bin job c \"Odd\": a form"]) expect(oldWord(t, "setup", sc)).toBeNull();
  });
});

describe("the stage reports old words (doccheck errors)", () => {
  test("a step's old word is an error naming the new one; the line is not read", () => {
    const c = scene(`job a: one\njob b: two\n@step One: x\nghost a\n@step Two: y\nshow b`);
    expect(msgs(c)).toContain(`"ghost" is now "dim": say "dim a" instead`);
    expect(c.errors[0].line).toBe(4);
  });
  test("an old setup word is an error on its line", () => {
    const c = scene(`job a: one\n@step One: x\nshow a\n@step Two: y\ntmark 3: z`);
    expect(msgs(c)).toContain(`"tmark" is now "keep at"`);
  });
});

describe("show and light reach a block's own ids; two owners of one word", () => {
  test("ids that are not cards go to the block that owns them", () => {
    const c = scene(`pots: k1, k2\njob a: card a\n@step One: x\nshow k1\nlight k2: hot\n@step Two: y\nshow a\nlight a`);
    expect(msgs(c)).toBe("");
    expect(pots(c)).toEqual(["show k1", "light k2: hot"]);
    expect(c.model.steps[1].show).toEqual(["a"]);
  });
  test("an id nobody owns is refused as before", () => {
    const c = scene(`pots: k1\njob a: card a\n@step One: x\nshow zz\n@step Two: y\nshow a`);
    expect(msgs(c)).toContain(`"zz" is not a card of this scene`);
  });
  test("a card takes no words on light", () => {
    const c = scene(`job a: card a\n@step One: x\nlight a: hot\n@step Two: y\nshow a`);
    expect(msgs(c)).toContain(`a card takes no words on "light"`);
  });
  test("keep at goes to the owner with keep set; a declined at is offered to the next owner", () => {
    const c = scene(`track: job plan, build | job ship\npots: k1\n@step One: x\nat build\n@step Two: y\nat 30: check\nkeep at 40: later`);
    expect(msgs(c)).toBe("");
    expect(pots(c)).toEqual(["at 30: check", "at+keep 40: later"]);
  });
  test("keep before a word no block of the scene owns is refused", () => {
    const c = scene(`job a: card a\n@step One: x\nkeep at 30: z\n@step Two: y\nshow a`);
    expect(msgs(c)).toContain(`"keep at" works on a block that owns "at"`);
  });
});
