// The inline hook of the Markdown core (src/parts/inline.ts, inline-runtime.ts, markdown.ts): where a part is read, what
// the core checks about its ranges, what happens when a scan is wrong or too slow, and the doubling test (steps and time).
// The parts here are made in the test and handed to the core through an InlineRun, so no folder is needed.
import { describe, expect, test } from "bun:test";
import GithubSlugger from "github-slugger";
import { Budget, BudgetError, pageBudget, withBudget } from "../src/core/budget";
import { LIMITS } from "../src/safety";
import { mdBlocks, type MdContext, type MdInline } from "../src/markdown";
import { defineInline, type InlineDef, type InlineHit } from "../src/parts/inline";
import type { InlineRun } from "../src/parts/inline-runtime";
import { INLINE_STEPS_PER_CHAR } from "../src/parts/inline-runtime";

// the parts are read in the order given (prepareInlines sorts the real ones by rank)
const run = (...defs: [InlineDef<any, any>, unknown?][]): InlineRun => ({ active: defs.map(([def, state]) => ({ def, state: state ?? {}, stopped: false })), problems: [], limits: LIMITS, reported: 0 });
const ctxOf = (r: InlineRun): MdContext & { problems: any[] } => ({ policy: undefined, idPrefix: "dh-", slugger: new GithubSlugger(), maxDepth: 20, problems: [], line: 1, heads: [], inlineParts: r });
/** every ref node of a text, in order */
function refsOf(src: string, r: InlineRun) {
  const ctx = ctxOf(r), out: { name: string; text: string; data: any }[] = [];
  const inl = (c: MdInline[]) => { for (const x of c) { if (x.t === "ref") out.push({ name: x.name, text: x.text, data: x.data }); if ("c" in x && Array.isArray(x.c)) inl(x.c as MdInline[]); } };
  const blk = (b: any) => { if (Array.isArray(b.c) && b.c.length && b.c[0]?.t && ["p", "text", "h"].includes(b.t)) inl(b.c); else if (Array.isArray(b.c)) b.c.forEach(blk); if (b.items) b.items.forEach((it: any) => it.c.forEach(blk)); if (b.head) b.head.forEach(inl); if (b.rows) b.rows.forEach((row: any[]) => row.forEach(inl)); };
  mdBlocks(src, ctx).forEach(blk);
  return { refs: out, problems: ctx.problems };
}
/** a part that takes every "zz" word of a text */
const words = (name: string, word: string, extra: Partial<InlineDef<any, any>> = {}) => defineInline<{ n: number }, { at: number }>({
  name, ...extra,
  scan(text, st, budget) {
    const hits: InlineHit<{ at: number }>[] = [];
    for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + word.length)) { budget.charge(1); hits.push({ from: i, to: i + word.length, data: { at: st.n++ } }); }
    return hits;
  },
});

describe("inline hook: where a part is read", () => {
  test("in a paragraph, a list item, a quote and a table cell; never in code, a link, an image, a heading or an HTML tag", () => {
    const src = ["a zz", "", "- b zz", "", "> c zz", "", "| h | i |", "| --- | --- |", "| zz | x |", "", "`zz` [zz](https://example.com) ![zz](https://example.com/a.png) <i title=\"zz\">k</i>", "", "## zz heading", "", "```", "zz", "```"].join("\n");
    const { refs } = refsOf(src, run([words("p", "zz"), { n: 0 }]));
    expect(refs.map((r) => r.data.at)).toEqual([0, 1, 2, 3]);
    expect(refs.every((r) => r.name === "p" && r.text === "zz")).toBe(true);
  });
  test("a text is one run across a soft line break; an escaped character ends it", () => {
    const seen: string[] = [];
    const d = defineInline<{}, null>({ name: "seen", scan: (t) => { seen.push(t); return []; } });
    refsOf("one two\nthree \\* four", run([d]));
    expect(seen).toEqual(["one two\nthree ", " four"]);
  });
  test("a part whose prepare says null is never offered a text, and nothing is charged for it", () => {
    let calls = 0;
    const d = defineInline<{}, null>({ name: "off", prepare: () => null, scan: () => { calls++; return []; } });
    const r = { active: [] as any[], problems: [], limits: LIMITS, reported: 0 } as InlineRun;
    expect(r.active.length).toBe(0);
    refsOf("hello zz", r);
    expect(calls).toBe(0);
    void d;
  });
  test("section(): called at each heading with its depth, so a part can mark the first use in a section", () => {
    const depths: number[] = [];
    const d = words("p", "zz", { section: (st: any, depth: number) => { depths.push(depth); st.n = 0; } });
    const { refs } = refsOf("# A\n\nzz zz\n\n### B\n\nzz\n\n## C\n\nzz", run([d, { n: 0 }]));
    expect(depths).toEqual([1, 3, 2]);
    expect(refs.map((r) => r.data.at)).toEqual([0, 1, 0, 0]);
  });
});

describe("inline hook: what the core checks", () => {
  test("a range that overlaps the one before, or lies outside the text, is dropped with a problem; the text stays", () => {
    const d = defineInline<{}, number>({ name: "bad", scan: () => [{ from: 2, to: 5, data: 1 }, { from: 4, to: 7, data: 2 }, { from: 9, to: 99, data: 3 }, { from: 0.5, to: 1, data: 4 }, { from: 8, to: 9, data: 5 }] });
    const { refs, problems } = refsOf("0123456789", run([d]));
    expect(refs.map((r) => [r.text, r.data])).toEqual([["234", 1], ["8", 5]]);
    expect(problems.some((p: any) => /^bad: 3 ranges overlap or lie outside the text/.test(p.message))).toBe(true);
  });
  test("a hit with a problem is reported with its line, stays text, and is not read by another part", () => {
    const first = defineInline<{}, number>({ name: "first", rank: -1, scan: (t) => { const i = t.indexOf("zz"); return i < 0 ? [] : [{ from: i, to: i + 2, data: 0, problem: "is wrong", level: "warn" as const }]; } });
    const { refs, problems } = refsOf("a\n\nb zz c", run([first], [words("second", "zz"), { n: 0 }]));
    expect(refs).toEqual([]);
    expect(problems).toEqual([{ line: 3, message: "first: is wrong", level: "warn" }]);
  });
  test("rank: a part with a lower rank reads first, and a later part sees its ranges as filler", () => {
    const a = words("later", "bar"), b = defineInline<{}, null>({ name: "marker", rank: -1, scan: (t) => { const i = t.indexOf("[bar]"); return i < 0 ? [] : [{ from: i, to: i + 5, data: null }]; } });
    const { refs } = refsOf("x [bar] y bar", run([b], [a, { n: 0 }]));
    expect(refs.map((r) => [r.name, r.text])).toEqual([["marker", "[bar]"], ["later", "bar"]]);
  });
  test("a problem list is capped, with one line saying so", () => {
    const d = defineInline<{}, number>({ name: "noisy", scan: (t) => (t ? [{ from: 0, to: 1, data: 0, problem: "no" }] : []) });
    const { problems } = refsOf(Array.from({ length: 300 }, () => "x").join("\n\n"), run([d]));
    expect(problems.length).toBe(101);
    expect(problems[100].message).toMatch(/more than 100 problems/);
  });
});

describe("inline hook: a scan that is wrong or too slow", () => {
  test("a scan that throws: the part stops, the text stays as written, the page says so", () => {
    let calls = 0;
    const d = defineInline<{}, null>({ name: "boom", scan: () => { calls++; throw new Error("broken"); } });
    const { refs, problems } = refsOf("a\n\nb\n\nc", run([d]));
    expect(refs).toEqual([]);
    expect(calls).toBe(1);
    expect(problems.map((p: any) => p.message)).toEqual(["boom: could not be read (broken); the rest of the text is left as written"]);
  });
  test("a scan that is not linear runs out of its own budget on a short text, and the page's budget is barely touched", () => {
    const d = defineInline<{}, null>({ name: "slow", scan: (t, _s, b) => { for (let i = 0; i < t.length; i++) b.charge(t.length); return []; } });   // quadratic
    const pb = pageBudget(LIMITS);
    const r = run([d]);
    const { problems } = withBudget(pb, () => refsOf("x".repeat(2000), r));
    expect(problems[0].message).toMatch(/^slow: the slow part does too much work/);
    expect(pb.steps).toBeLessThan(5000);
  });
  test("the core charges one step per character offered to the page's budget; a spent page budget stops the part, not the page", () => {
    const pb = pageBudget({ ...LIMITS, maxPageEvalSteps: 500 });
    const { refs, problems } = withBudget(pb, () => refsOf(`${"word ".repeat(200)}\n\nzz`, run([words("p", "zz"), { n: 0 }])));
    expect(refs).toEqual([]);
    expect(problems.some((p: any) => /^p: .*do too much work/.test(p.message))).toBe(true);
    const ok = pageBudget(LIMITS);
    withBudget(ok, () => refsOf("a".repeat(1000), run([words("p", "zz"), { n: 0 }])));
    expect(ok.steps).toBe(1000);
  });
  test("a scan may take INLINE_STEPS_PER_CHAR steps a character, and no more", () => {
    const eat = (per: number) => defineInline<{}, null>({ name: "eat", scan: (t, _s, b) => { b.charge(per * t.length); return []; } });
    expect(refsOf("x".repeat(100), run([eat(INLINE_STEPS_PER_CHAR - 2)])).problems).toEqual([]);
    expect(refsOf("x".repeat(100), run([eat(INLINE_STEPS_PER_CHAR + 40)])).problems.length).toBe(1);
  });
});

describe("inline hook: the doubling test (steps and time)", () => {
  // a text full of near-matches: "zzz" with no "z" after it is a hit, "zz!" is a miss that starts like one
  const text = (n: number) => ("near zz! zzy zz zzz. ".repeat(n) + "\n\n").repeat(3);
  const part = () => defineInline<{}, null>({
    name: "near",
    scan(t, _s, b) {
      const hits: InlineHit<null>[] = [];
      for (let i = t.indexOf("zz"); i >= 0; i = t.indexOf("zz", i + 1)) { b.charge(2); if (t[i + 2] === " " ) hits.push({ from: i, to: i + 2, data: null }); }
      return hits;
    },
  });
  test("steps charged to the page budget, and by the scan: twice the text costs at most about twice, at three sizes", () => {
    const steps = (n: number) => { const pb = pageBudget(LIMITS); const r = run([part()]); withBudget(pb, () => refsOf(text(n), r)); return pb.steps; };
    for (const n of [50, 200, 800]) { const q = steps(2 * n) / steps(n); expect(q).toBeGreaterThan(1.8); expect(q).toBeLessThan(2.3); }
    const scan = (n: number) => { const b = new Budget({ steps: 1e12, values: 1e12, chars: 1e12 }); part().scan(text(n), {}, b); return b.steps; };
    for (const n of [50, 200, 800]) { const q = scan(2 * n) / scan(n); expect(q).toBeGreaterThan(1.8); expect(q).toBeLessThan(2.3); }
  });
  test("time: twice the text takes at most about twice as long (best of five)", () => {
    const best = (n: number) => { let m = Infinity; for (let k = 0; k < 5; k++) { const r = run([part()]); const t0 = performance.now(); refsOf(text(n), r); m = Math.min(m, performance.now() - t0); } return m; };
    const small = best(1500), large = best(3000);
    expect(large / Math.max(small, 1)).toBeLessThan(3.2);
  });
  test("a BudgetError from a part is the core's to catch, never a thrown error out of mdBlocks", () => {
    const d = defineInline<{}, null>({ name: "throws", scan: () => { throw new BudgetError("the throws part does too much work (the limit for one part is 1 steps)"); } });
    expect(() => refsOf("a b c", run([d]))).not.toThrow();
  });
});
