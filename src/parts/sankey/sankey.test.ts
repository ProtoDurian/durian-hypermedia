// The sankey part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at
// n and 2n, never time), the layout, and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import sankey, { parseSankey, sankeyLlm, flowLine, nodeLine, flowShare } from "./part";
import { layoutSankey, pathOf } from "./layout";

const fence = (body: string, info = 'title="T" unit=ms') => `# Page\n\n\`\`\`sankey ${info}\n${body}\n\`\`\`\n`;
const GOOD = "request -> auth: 12\nrequest -> handler: 80\nhandler -> db: 55\nnode db \"Postgres\" [c3]";
const flows = (n: number) => Array.from({ length: n }, (_, k) => `s${k % 10} -> t${k % 20}: ${k + 1}`).join("\n");
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const NOCAP = { sankeyFlows: 1e9, sankeyNodes: 1e9, sankeySteps: 1e9 };
const spec = (body: string, lim: { sankeyFlows: number; sankeyNodes: number; sankeySteps: number } = LIMITS, b?: Budget) => parseSankey([{ text: body, line: 1, appear: 0 }], { title: "T", unit: "ms" }, 1, [], lim, b);
const problems = (src: string, limits?: Partial<typeof LIMITS>) => check(parse(src, { path: "p.dh.md", limits }));
const errorsOf = (src: string, limits?: Partial<typeof LIMITS>) => problems(src, limits).filter((p) => p.level === "error").map((p) => p.message);

describe("sankey: parse and the LLM view", () => {
  test("a good sankey is a block with its data and no problems", () => {
    const doc = parse(fence(GOOD), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "sankey")!;
    if (!b || b.type !== "sankey") throw new Error("not a sankey");
    expect(b.data.flows.map((f) => [f.from, f.to, f.amount])).toEqual([["request", "auth", 12], ["request", "handler", 80], ["handler", "db", 55]]);
    expect(b.data.nodes.find((n) => n.id === "db")).toEqual({ id: "db", label: "Postgres", colour: "c3", named: true });
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
  });
  test("the LLM view is the table, in the order written, and the page carries it", () => {
    const want = "Sankey: T (ms).\n\n| from | to | amount (ms) |\n| --- | --- | --- |\n| request | auth | 12 |\n| request | handler | 80 |\n| handler | Postgres | 55 |";
    expect(sankeyLlm(spec(GOOD))).toBe(want);
    expect(parse(fence(GOOD), { path: "p.dh.md" }).llm).toContain(want);
  });
  test("steps group the flows under their captions", () => {
    const doc = parse(fence("a -> b: 1\n@step one\n@step two\nb -> c: 2"), { path: "p.dh.md" });
    const b = doc.blocks[1];
    if (b.type !== "sankey") throw new Error("not a sankey");
    expect(b.data.steps).toEqual(["one", "two"]);
    expect(b.data.flows.map((f) => f.appear)).toEqual([0, 1]);
    expect(doc.llm).toContain("Step 1: one\n\n| from | to | amount (ms) |");
    expect(doc.llm).toContain("Step 2: two");
  });
  test("the hand scans read what the old patterns read", () => {
    expect(flowLine("a.b -> c_d: 1.5")).toEqual({ from: "a.b", to: "c_d", amount: "1.5" });
    expect(flowLine("a -> b: -2")).toEqual({ from: "a", to: "b", amount: "-2" });
    expect(flowLine("a -> b: 1.")).toBeNull();
    expect(flowLine("a b -> c: 1")).toBeNull();
    expect(nodeLine('node db "Postgres" [c3]')).toEqual({ id: "db", label: "Postgres", colour: "c3" });
    expect(nodeLine("node db")).toEqual({ id: "db", label: undefined, colour: undefined });
    expect(nodeLine('node db "x" junk')).toBeNull();
  });
  test("a flow's share of its source", () => {
    const s = spec("a -> b: 30\na -> c: 10");
    expect(flowShare(s, s.flows[0])).toBe(0.75);
  });
});

describe("sankey: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["a loop", "a -> b: 1\nb -> c: 1\nc -> a: 1", /a loop: a -> b -> c -> a/],
    ["an amount of 0", "a -> b: 0", /an amount is above 0/],
    ["a flow into itself", "a -> a: 3\na -> b: 1", /flows into itself/],
    ["an unknown colour", "a -> b: 1\nnode a [pink]", /"\[pink\]" is not a colour word/],
    ["a hex colour", "a -> b: 1\nnode a \"A\" [#ff0000]", /is not a colour word.*no hex values/],
    ["a line not understood", "a -> b: 1\nthis is prose", /line not understood/],
    ["a bad node line", "a -> b: 1\nnode", /write a node line as/],
    ["an unknown attribute", "a -> b: 1", /unknown attribute "colour"/],
    ["no flows", "node a", /no flows/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const src = what === "an unknown attribute" ? fence(body, 'title="T" colour=red') : fence(body);
    expect(errorsOf(src).some((m) => re.test(m))).toBe(true);
  });
  test("warnings: more out than in, and a long label", () => {
    const w = problems(fence(`a -> b: 1\nb -> c: 5\nnode c "${"x".repeat(70)}"`)).filter((p) => p.level === "warn").map((p) => p.message);
    expect(w.some((m) => /"b" sends out 5 but only 1 comes in/.test(m))).toBe(true);
    expect(w.some((m) => /keep it under 60/.test(m))).toBe(true);
  });
});

describe("sankey: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, the strict ones lower", () => {
    expect([LIMITS.sankeyFlows, LIMITS.sankeyNodes, LIMITS.sankeySteps]).toEqual([300, 120, 30]);
    expect([UNTRUSTED_LIMITS.sankeyFlows, UNTRUSTED_LIMITS.sankeyNodes]).toEqual([150, 60]);
  });
  test("flows: 200 pass the authored set, the strict set refuses them, a host cap too", () => {
    expect(errorsOf(fence(flows(200))).filter((m) => /more than|nodes|steps/.test(m))).toEqual([]);
    expect(errorsOf(fence(flows(200)), UNTRUSTED_LIMITS).some((m) => /more than 150 flows/.test(m))).toBe(true);
    expect(errorsOf(fence(flows(200)), { sankeyFlows: 50 }).some((m) => /more than 50 flows/.test(m))).toBe(true);
  });
  test("nodes and steps", () => {
    const many = Array.from({ length: 70 }, (_, k) => `hub -> n${k}: 1`).join("\n");
    expect(errorsOf(fence(many), UNTRUSTED_LIMITS).some((m) => /more than 60 nodes/.test(m))).toBe(true);
    const steps = "a -> b: 1\n" + Array.from({ length: 31 }, (_, k) => `@step s${k}`).join("\n");
    expect(errorsOf(fence(steps)).some((m) => /at most 30 steps/.test(m))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, never a hang", () => {
    const doc = parse(fence(flows(200)), { path: "p.dh.md", limits: { maxEvalSteps: 5000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the sankey part does too much work/);
    expect(doc.llm).toContain("[sankey not shown: the sankey part does too much work");
  });
});

describe("sankey: linear (the doubling test, charges counted)", () => {
  // a chain keeps nodes and flows growing together; the layout charge is nodes times flows, so the reading is measured
  // on lines that are not flows, and the layout cost is checked against its formula
  test("reading: twice the lines cost at most about twice", () => {
    const cost = (n: number) => { const b = big(); spec(Array.from({ length: n }, (_, k) => `// a note ${k} that is not a flow`).join("\n") + "\na -> b: 1", NOCAP, b); return b.steps + b.values; };
    for (const n of [500, 2000, 8000]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once", () => {
    const b1 = big(), b2 = big();
    spec("a -> b: 1\n" + "x".repeat(20_000), NOCAP, b1);
    spec("a -> b: 1\n" + "x".repeat(40_000), NOCAP, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
  });
  test("the layout's charge is its formula: within the caps, a sankey at the flow cap stays inside one part's budget", () => {
    const s = spec(flows(300), LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the sankey part"));
    expect(s.flows.length).toBe(300);
  });
});

describe("sankey: the layout", () => {
  test("lays out left to right, and top to bottom when turned", () => {
    const s = spec(GOOD + "\ndb -> disk: 20\ndisk -> ssd: 10");
    const h = layoutSankey(s, 700, 320, false);
    expect(h.columns).toBe(5);
    expect(h.nodes.every((n) => n.x >= 0 && n.x + n.w <= 700 + 0.5)).toBe(true);
    const v = layoutSankey(s, 390, 500, true);
    expect(v.vertical).toBe(true);
    expect(v.nodes.every((n) => n.x >= -0.5 && n.x + n.w <= 390 + 0.5)).toBe(true);
  });
  test("a flow's path lights everything upstream and downstream", () => {
    const s = spec("a -> b: 1\nb -> c: 1\nx -> y: 1");
    expect([...pathOf(s, 1)].sort()).toEqual([0, 1]);
  });
});

describe("sankey: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every sankey drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "sankey").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
    });
  }
});

test("the definition matches its folder", () => {
  expect(sankey.name).toBe("sankey");
  expect(sankey.dependencies).toEqual(["d3-sankey"]);
});
