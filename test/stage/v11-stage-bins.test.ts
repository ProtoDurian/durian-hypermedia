// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Bins block: parse, every refusal, facts, layout at 1000 and 340, doubling, hostile input.
import { describe, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { FONT, measure, type Item } from "../../src/core/stage-core";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
import { BINS_LIMITS } from "../../src/core/stage-bins";

const ROLES = { ops: 1, api: 2, job: 3 };
const compile = (src: string) => {
  const i = src.indexOf("@step "), head = i < 0 ? src : src.slice(0, i);
  const steps = i < 0 ? [] : src.slice(i).split(/^@step /m).slice(1).map((s) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl < 0 ? undefined : nl), raw: nl < 0 ? "" : s.slice(nl + 1), line: 0 }; });
  beginDocument(newBudget());
  return compileStage(head, steps, 1, {}, ROLES);
};
const SET = `bins: Sorting | parcels
items p1..p6: one; two; three; four; five; six
bin ops a "Light": under 1 kg | by letter
bin api b "Heavy": over 1 kg
`;
const GOOD = `${SET}@step First: light ones
into a: p1, p2
@step Second: heavy ones
into b: p3..p5
`;
const msgs = (src: string) => compile(src).errors.map((e: any) => e.msg ?? e.message ?? String(e));

describe("bins: parse and facts", () => {
  test("a good scene compiles and reads", () => {
    const c = compile(GOOD);
    expect(c.errors).toEqual([]);
    const llm = stageLlm(c);
    expect(llm).toContain("6 parcels in the inventory");
    expect(llm).toContain("Into Light: one, two (2 in it now).");
    expect(llm).toContain("Into Heavy: three, four, five (3 in it now).");
    expect(llm).toContain("Total: 5 of 6 in bins, 1 left.");
  });
  test("a count drops the next items left, unnamed items stay counts", () => {
    const c = compile(`bins: Stock | tins\nitems 40: tin\nbin ops a "A": x\nbin api b "B": y\n@step One: a\ninto a: 12\n@step Two: b\ninto b: 8\n`);
    expect(c.errors).toEqual([]);
    expect(stageLlm(c)).toContain("Into A: 12 tins (12 in it now).");
    expect(stageLlm(c)).toContain("Total: 20 of 40 in bins, 20 left.");
  });
});

describe("bins: every refusal", () => {
  const cases: [string, string, RegExp][] = [
    ["unknown bin", GOOD.replace("into b:", "into z:"), /"z" is not a bin of this scene \(a, b\)/],
    ["unknown item", GOOD.replace("p3..p5", "p3, q9"), /"q9" is not an item of this scene/],
    ["same bin again", GOOD.replace("into b: p3..p5", "into a: p2"), /"p2" is already in bin a: name another bin/],
    ["item written twice in a line", GOOD.replace("p3..p5", "p3, p3"), /written twice/],
    ["count too big", GOOD.replace("p3..p5", "9"), /asks for 9 but 4 are left/],
    ["no drop words", GOOD.replace("into b: p3..p5", "into b"), /into names a bin/],
    ["bad role", SET.replace('bin api b', 'bin nope b') + "@step A: x\ninto a: p1\n@step B: y\ninto b: p2\n", /"nope" is not a role/],
    ["bin without id", SET.replace('bin api b "Heavy"', 'bin api') + "@step A: x\ninto a: p1\n@step B: y\n", /a bin is: bin role id/],
    ["bin id twice", SET.replace('bin api b', 'bin api a') + "@step A: x\ninto a: p1\n@step B: y\n", /bin "a" is declared twice/],
    ["item twice declared", SET.replace("items p1..p6: one; two; three; four; five; six", "items p1..p6\nitems p3") + "@step A: x\n@step B: y\n", /item "p3" is declared twice/],
    ["labels mismatch", SET.replace("one; two; three; four; five; six", "one; two") + "@step A: x\n@step B: y\n", /6 ids but 2 labels/],
    ["too many items", SET.replace("items p1..p6: one", "items 150\nitems 60\nitems p1..p6: one") + "@step A: x\n@step B: y\n", /at most 200 items/],
    ["bad id", SET.replace("items p1..p6: one; two; three; four; five; six", "items 9x, p1") + "@step A: x\n@step B: y\n", /not an id/],
    ["indented body", SET + "  stray\n@step A: x\n@step B: y\n", /nothing is indented|does not read/],
    ["into with no bins", `bins: x | y\n@step A: a\ninto a: p1\n@step B: b\n`, /into needs bins/],
  ];
  for (const [name, src, re] of cases) test(name, () => { const m = msgs(src); expect(m.some((x: string) => re.test(x))).toBe(true); });
  test("too many bins", () => {
    const many = Array.from({ length: 9 }, (_, i) => `bin ops b${i} "B${i}": r`).join("\n");
    expect(msgs(`bins: x | y\nitems p1..p3\n${many}\n@step A: a\n@step B: b\n`).some((x: string) => /at most 8 bins/.test(x))).toBe(true);
  });
});

const extent = (it: Item): [number, number, number, number] => {
  if (it.k === "box") return [it.x, it.y, it.x + it.w, it.y + it.h];
  if (it.k === "text") { const w = measure(it.s, it.f), a = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x; return [a, it.y - FONT[it.f].size, a + w, it.y + 3]; }
  if (it.k === "path") { const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
  return [it.x, it.y, it.x, it.y];
};
describe("bins: layout", () => {
  for (const w of [1000, 340]) {
    for (const [name, src] of [["named", GOOD], ["many", `bins: Many | tins\nitems 120: tin\nbin ops a "A very long bin name that has to wrap in a narrow box": a rule that is also long and wraps\nbin api b "B": y\nbin job c "C": z\n@step One: a\ninto a: 70\n@step Two: b\ninto b: 30\n`]] as const) {
      test(`${name} at ${w}: nothing outside the box, no word under 11`, () => {
        const c = compile(src); expect(c.errors).toEqual([]);
        const p = layoutStage(c.model, w);
        for (const it of p.items) {
          const [x0, y0, x1, y1] = extent(it);
          expect(x0).toBeGreaterThanOrEqual(-0.5); expect(x1).toBeLessThanOrEqual(p.w + 0.5);
          expect(y0).toBeGreaterThanOrEqual(-6); expect(y1).toBeLessThanOrEqual(p.h + 0.5);
          if (it.k === "text") expect(FONT[it.f].size).toBeGreaterThanOrEqual(11);
        }
      });
      test(`${name} at ${w}: a slot never overlaps another slot`, () => {
        const c = compile(src), p = layoutStage(c.model, w);
        const units = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.id?.startsWith("unit:"));
        for (let a = 0; a < units.length; a++) for (let b = a + 1; b < units.length; b++) {
          const A = units[a], B = units[b];
          expect(A.x + A.w <= B.x + 0.01 || B.x + B.w <= A.x + 0.01 || A.y + A.h <= B.y + 0.01 || B.y + B.h <= A.y + 0.01).toBe(true);
        }
      });
    }
  }
  test("the persistent things stay put: every unit has one place for the whole scene", () => {
    const p = layoutStage(compile(GOOD).model, 1000), ids = p.items.filter((i) => i.k === "box" && i.id?.startsWith("unit:")).map((i: any) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(5);
  });
  test("counts are drawn per step and add up", () => {
    const p = layoutStage(compile(GOOD).model, 1000);
    const at = (s: number, re: RegExp) => p.items.filter((i) => i.k === "text" && re.test(i.s) && (i.from ?? 1) <= s && (i.to === undefined || i.to === 0 || i.to >= s)).map((i: any) => i.s);
    expect(at(1, /^Total/)).toEqual(["Total: 2 of 6 parcels in bins · 4 left"]);
    expect(at(2, /^Total/)).toEqual(["Total: 5 of 6 parcels in bins · 1 left"]);
    expect(at(2, /left$/).filter((x: string) => /^\d+ left$/.test(x))).toEqual(["1 left"]);
  });
});

describe("bins: doubling and hostile input", () => {
  const charges = (n: number) => {
    let work = 0; const b = newBudget(); const orig = b.charge; b.charge = (what, w, m) => { work += w; return orig(what, w, m); };
    beginDocument(b);
    const src = `bins: x | y\nitems ${n}\nbin ops a "A": r\nbin api b "B": r\n@step One: a\ninto a: ${n / 2}\n@step Two: b\ninto b: ${n / 2}\n`;
    const i = src.indexOf("@step "), steps = src.slice(i).split(/^@step /m).slice(1).map((s) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: 0 }; });
    const c = compileStage(src.slice(0, i), steps, 1, {}, ROLES); layoutStage(c.model, 1000); stageLlm(c);
    return work;
  };
  test("doubling the input at most about doubles the work", () => { const a = charges(40), b = charges(80); expect(b / a).toBeLessThan(2.6); });
  test("a tiny budget refuses, never hangs", () => {
    beginDocument(newBudget(20, 20));
    expect(() => { const c = compileStage(SET, [], 1, {}, ROLES); layoutStage(c.model, 1000); }).toThrow(BudgetError);
  });
  test("hostile words stay words: markup, long runs, odd ids", () => {
    const evil = `bins: <img src=x onerror=alert(1)> | <b>y</b>\nitems p1..p3: <script>alert(1)</script>; ${"x".repeat(5000)}; __proto__\nbin ops a "${"W".repeat(3000)}": ${"r ".repeat(2000)}\n@step A: a\ninto a: p1..p3\n@step B: b\n`;
    const c = compile(evil); expect(c.errors).toEqual([]);
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w);
      expect(p.h).toBeLessThan(2000);
      for (const it of p.items) if (it.k === "text") expect(it.s.length).toBeLessThan(400);
    }
    expect(stageLlm(c)).toContain("<script>");
  });
  test("__proto__ and constructor as ids and bins do not touch prototypes", () => {
    const c = compile(`bins: x | y\nitems proto_, constructor\nbin ops toString "T": r\n@step A: a\ninto toString: proto_\n@step B: b\ninto toString: constructor\n`);
    expect(c.errors).toEqual([]); expect(({} as any).polluted).toBeUndefined(); expect(stageLlm(c)).toContain("2 in it now");
  });
  test("limits are named", () => { expect(BINS_LIMITS).toEqual({ units: 200, bins: 8 }); });
});

const REBIN = `bins: Outputs into shards | outputs
items p1..p9: Banner EU · error; Banner US · error; Cart EU · warn; Cart US · warn; Feed EU · info; Feed US · info; Login EU · error; Login US · error; Search EU · warn
bin ops a "Shard 1": first shard
bin api b "Shard 2": second shard
bin job c "Shard 3": added in step 2
ledger: Output | Shard
inventory: off
@step Two shards: nine outputs sit in two shards.
into a: p1, p4, p5, p8, p9
into b: p2, p3, p6, p7
@step Three shards: a third shard appears and four outputs move to it.
show c
into c: p1, p4, p6, p7
`;
describe("bins: re-bin, late bins, ledger", () => {
  test("a thing may move to another bin in a later step; the facts say so", () => {
    const c = compile(REBIN); expect(c.errors).toEqual([]);
    const llm = stageLlm(c);
    expect(llm).toContain("Into Shard 3: Banner EU · error, Cart US · warn, Feed US · info, Login EU · error (4 in it now; moved from Shard 1, Shard 2: Banner EU · error, Cart US · warn, Feed US · info, Login EU · error).");
    expect(llm).toContain("Total: 9 of 9 in bins, 0 left.");
    expect(llm).toContain("3. Shard 3 (added in step 2), from step 2");
  });
  test("refusals: same bin again, twice in a step, a bin before its step", () => {
    expect(msgs(REBIN.replace("into c: p1, p4, p6, p7", "into a: p1")).some((x: string) => /already in bin a: name another bin/.test(x))).toBe(true);
    expect(msgs(REBIN.replace("into c: p1, p4, p6, p7", "into c: p1\ninto b: p1")).some((x: string) => /moved in step 2/.test(x))).toBe(true);
    expect(msgs(REBIN.replace("into a: p1, p4, p5, p8, p9", "into a: p1, p4, p8, p9\ninto c: p5")).some((x: string) => /takes things before step 2|appears from step 2/.test(x))).toBe(true);
    expect(msgs(REBIN.replace(`"Shard 3": added`, `"Shard 3" from 2: added`)).some((x: string) => /write "show c" in step 2/.test(x))).toBe(true); // the old "from N" says the new word
    expect(msgs(REBIN.replace("show c", "show zz")).some((x: string) => /"zz" is not a bin of this scene/.test(x) || /"zz" is not a card/.test(x))).toBe(true);
    expect(msgs(REBIN.replace("show c", "show c\nshow c")).some((x: string) => /shown twice/.test(x))).toBe(true);
  });
  for (const w of [1000, 340]) test(`layout at ${w}: inside the box, slots apart, late bin and counts by step`, () => {
    const c = compile(REBIN), p = layoutStage(c.model, w);
    for (const it of p.items) {
      const [x0, y0, x1, y1] = extent(it);
      expect(x0).toBeGreaterThanOrEqual(-0.5); expect(x1).toBeLessThanOrEqual(p.w + 0.5); expect(y0).toBeGreaterThanOrEqual(-6); expect(y1).toBeLessThanOrEqual(p.h + 0.5);
      if (it.k === "text") expect(FONT[it.f].size).toBeGreaterThanOrEqual(11);
    }
    const bin3 = p.items.find((i) => i.k === "box" && i.id === "bin:c") as any; expect(bin3.from).toBe(2);
    const at = (s: number, re: RegExp) => p.items.filter((i) => i.k === "text" && re.test(i.s) && (i.from ?? 1) <= s && (i.to === undefined || i.to === 0 || i.to >= s)).map((i: any) => i.s);
    expect(at(2, /→/)).toEqual(["1 → 3", "1 → 3", "2 → 3", "2 → 3"]);
    expect(at(1, /→/)).toEqual([]);
    const stays = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.id?.startsWith("unit:"));
    expect(stays.length).toBe(13);
    for (let a = 0; a < stays.length; a++) for (let b = a + 1; b < stays.length; b++) { const A = stays[a], B = stays[b]; expect(A.x + A.w <= B.x + 0.01 || B.x + B.w <= A.x + 0.01 || A.y + A.h <= B.y + 0.01 || B.y + B.h <= A.y + 0.01).toBe(true); }
  });
  test("a moved thing leaves a dashed place in its old bin from the move on", () => {
    const p = layoutStage(compile(REBIN).model, 1000), g = p.items.filter((i) => i.k === "box" && i.dash && i.from === 2);
    expect(g.length).toBe(4);
  });
});

describe("bins: a stacked ledger", () => {
  test("at 340 the ledger sits above the bins, never under them", () => {
    const p = layoutStage(compile(REBIN).model, 340);
    const led = p.items.find((i) => i.k === "box" && i.id === "bins:ledger") as any, bins = p.items.filter((i) => i.k === "box" && i.id?.startsWith("bin:") && i.id !== "bins:ledger" && i.id !== "bins:inventory") as any[];
    expect(bins.length).toBe(3);
    for (const b of bins) expect(b.y).toBeGreaterThanOrEqual(led.y + led.h);
  });
  test("at 1000 the ledger sits beside the bins", () => {
    const p = layoutStage(compile(REBIN).model, 1000);
    const led = p.items.find((i) => i.k === "box" && i.id === "bins:ledger") as any, b = p.items.find((i) => i.k === "box" && i.id === "bin:a") as any;
    expect(b.x).toBeGreaterThanOrEqual(led.x + led.w); expect(b.y).toBe(led.y);
  });
});

describe("bins: numbering base and long labels", () => {
  const LONG = REBIN.replace("ledger: Output | Shard", "ledger: Output | Shard from 0").replace("Banner EU · error;", "Banner EU · error with a very long second part;");
  test("ledger numbers can start at 0", () => {
    const c = compile(LONG); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 1000), txt = p.items.filter((i) => i.k === "text").map((i: any) => i.s);
    expect(txt).toContain("0 → 2"); expect(txt).toContain("1 → 2"); expect(txt.some((x: string) => /^3\. /.test(x))).toBe(false); expect(txt).toContain("2. Shard 3");
    expect(stageLlm(c)).toContain("0. Shard 1");
  });
  for (const w of [1000, 340]) test(`a long label is never cut at ${w}`, () => {
    const p = layoutStage(compile(LONG).model, w);
    const words = p.items.filter((i) => i.k === "text" && /Banner|very|long|second|part|error/.test(i.s)).map((i: any) => i.s).join(" ");
    expect(words).not.toContain("…");
    for (const word of "Banner EU · error with a very long second part".split(" ")) expect(words).toContain(word);
    for (const it of p.items) { const [x0, , x1] = extent(it); expect(x0).toBeGreaterThanOrEqual(-0.5); expect(x1).toBeLessThanOrEqual(p.w + 0.5); }
  });
});

describe("bins: show and light", () => {
  test("light a bin with a note: lit in its step, the note in the facts and drawn in that step only", () => {
    const src = REBIN.replace("into c: p1, p4, p6, p7", "into c: p1, p4, p6, p7\nlight c: four outputs move here");
    const c = compile(src); expect(c.errors).toEqual([]);
    expect(stageLlm(c)).toContain("Shard 3: four outputs move here.");
    expect(stageLlm(c)).toContain("Shard 3 comes in.");
    const items = layoutStage(c.model, 1000).items as any[];
    const note = items.find((i) => i.k === "text" && i.s === "four outputs move here");
    expect(note).toBeTruthy(); expect(note.from).toBe(2); expect(note.to).toBe(2);
    const box = items.find((i) => i.k === "box" && i.id === "bin:c");
    expect(box.hot).toContain(2); expect(box.from).toBe(2);
  });
  test("an id that is not a bin goes on to the stage (a card) or is refused", () => {
    const c = compile(REBIN.replace("show c", "show c\nlight zz"));
    expect(c.errors.map((e) => e.msg).join(" | ")).toContain(`"zz"`);
  });
});
