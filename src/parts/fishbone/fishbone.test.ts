// The fishbone part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at
// n and 2n, never time) and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import fishbone, { parseFish, fishLlm } from "./part";
import { layoutFish } from "./layout";

const fence = (body: string, info = 'title="T"') => `# Page\n\n\`\`\`fishbone ${info}\n${body}\n\`\`\`\n`;
const GOOD = "effect: Checkout is slow\nPeople: on-call is new\nProcess: no load test\n  only staging has real data";
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);

describe("fishbone: parse and the LLM view", () => {
  test("a good fishbone is a block with its data and no problems", () => {
    const doc = parse(fence(GOOD), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "fishbone")!;
    expect(b).toBeDefined();
    if (b.type !== "fishbone") throw new Error("not a fishbone");
    expect(b.data.effect).toBe("Checkout is slow");
    expect(b.data.categories.map((c) => c.name)).toEqual(["People", "Process"]);
    expect(b.data.categories[1].causes[0].subs[0].text).toBe("only staging has real data");
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("the LLM view is the nested list, and the page's LLM view carries it", () => {
    const want = "Fishbone: T. Effect: Checkout is slow. Causes by category:\n- People\n  - on-call is new\n- Process\n  - no load test\n    - only staging has real data";
    expect(fishLlm(parseFish(GOOD, 1, "T", LIMITS))).toBe(want);
    expect(parse(fence(GOOD), { path: "p.dh.md" }).llm).toContain(want);
  });
  test("steps and a highlight", () => {
    const s = parseFish("effect: E\n@step one\nA: a\nB: b\n@step two\nhighlight a", 1, "", LIMITS);
    expect(s.steps.map((x) => x.title)).toEqual(["one", "two"]);
    expect(s.highlights).toEqual([{ step: 1, category: 0 }]);
    expect(fishLlm(s)).toContain("Steps:\n1. one\n2. two");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(GOOD) + "\n:::llm\nThree causes of a slow checkout.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Three causes of a slow checkout.");
    expect(doc.llm).not.toContain("Causes by category");
  });
});

describe("fishbone: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["no effect", "A: a\nB: b", /no "effect:" line; start with/],
    ["two effects", "effect: a\neffect: b\nA: a\nB: b", /a second "effect:" line/],
    ["one category", "effect: e\nA: a", /needs 2 to 8/],
    ["nine categories", "effect: e\n" + Array.from({ length: 9 }, (_, k) => `C${k}: c`).join("\n"), /at most 8/],
    ["a third level", "effect: e\nA: a\n  b\n    c\nB: b", /a fishbone has 2 levels/],
    ["an orphan indented line", "effect: e\n  orphan\nA: a\nB: b", /no cause above this one/],
    ["an empty cause", "effect: e\nA:\nB: b\nC: c", /is empty; write a cause/],
    ["an unknown highlight", "effect: e\nA: a\nB: b\nhighlight Z", /no category "Z"/],
    ["not a line", "effect: e\nA: a\nB: b\njust words", /is not a line/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.startsWith("fishbone:") || m.includes("fishbone"))).toBe(true);
  });
});

describe("fishbone: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.fishboneCauses).toBe(60);
    expect(UNTRUSTED_LIMITS.fishboneSubCauses).toBeLessThanOrEqual(LIMITS.fishboneSubCauses);
  });
  test("over the cause cap: refused by check, at the host's own cap too", () => {
    const body = "effect: e\n" + Array.from({ length: 12 }, (_, k) => `C${k % 3}: cause ${k}`).join("\n");
    expect(errorsOf(fence(body)).some((m) => /more than/.test(m))).toBe(false);
    const errs = check(parse(fence(body), { path: "p.dh.md", limits: { fishboneCauses: 10 } })).map((p) => p.message);
    expect(errs.some((m) => /more than 10 causes/.test(m))).toBe(true);
  });
  test("the strict set takes fewer sub-causes", () => {
    const body = "effect: e\nA: a\n" + Array.from({ length: 150 }, (_, k) => `  sub ${k}`).join("\n") + "\nB: b";
    expect(check(parse(fence(body), { path: "p.dh.md" })).some((p) => /sub-causes/.test(p.message))).toBe(false);
    expect(check(parse(fence(body), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /more than 120 sub-causes/.test(p.message))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = "effect: e\n" + Array.from({ length: 4000 }, () => "not a line at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the fishbone part does too much work/);
    expect(doc.llm).toContain("[fishbone not shown: the fishbone part does too much work");
  });
});

describe("fishbone: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => "effect: " + "slow ".repeat(n) + "\n" + Array.from({ length: n }, (_, k) => `Cat${k % 8}: cause number ${k} with some words\n  a sub-cause ${k}`).join("\n");
  const cost = (n: number) => {
    const b = big();
    const s = parseFish(body(n), 1, "T", { fishboneCauses: 1e9, fishboneSubCauses: 1e9 }, b);
    layoutFish(s, "wide", b); layoutFish(s, "narrow", b);
    return b.steps + b.values + b.chars;
  };
  test("parse and both layouts: twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("a long line is read once (no scan per start)", () => {
    const b1 = big(), b2 = big();
    parseFish("effect: " + "x".repeat(20_000), 1, "", LIMITS, b1);
    parseFish("effect: " + "x".repeat(40_000), 1, "", LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
  });
});

describe("fishbone: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every fishbone drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "fishbone").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the fishbone part");
      expect(() => parseFish(text, 1, "", LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(fishbone.name).toBe("fishbone");
  expect(fishbone.steps).toBe(true);
});
