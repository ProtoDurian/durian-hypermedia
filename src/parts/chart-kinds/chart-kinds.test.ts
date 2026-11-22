// The chart-kinds part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted
// at n and 2n, never time), the layouts, and the hostile fixtures. Every kind of a ```chart (histogram, boxplot, violin,
// funnel, waterfall, treemap, sunburst, calendar) is this one part.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import part, { parseChartKinds } from "./part";
import { capsOf, compute, dayNum, dateOf, flattenTree, llmText } from "./compute";
import { boxStats, kde, niceTicks, quantile, sunburstLayout, treemapLayout } from "./layout";
import { LIMITS as OWN, UNTRUSTED_LIMITS as OWN_UNTRUSTED } from "./limits";
import { fmtValue } from "./fmt";

const fence = (body: string) => `# Page\n\n\`\`\`chart\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const sumOf = (b: Budget) => b.steps + b.values + b.chars;
const errorsOf = (src: string, limits?: object) => check(parse(src, { path: "p.dh.md", ...(limits ? { limits } : {}) })).filter((p) => p.level === "error" && p.message.includes("chart:")).map((p) => p.message);
const warnsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "warn" && p.message.includes("chart:")).map((p) => p.message);
const blockOf = (src: string) => parse(src, { path: "p.dh.md" }).blocks.find((x) => x.type === "chart-kinds");
const HIST = "kind: histogram\nx: { label: latency, format: duration-ms }\nbins: 4\nmarks: [p50]\ndata: [10, 20, 20, 30, 30, 30, 40, 50]";
const FUNNEL = "kind: funnel\ntitle: Funnel\ndata:\n  - [Visited, 1000]\n  - [Paid, 100]";
const run = (body: string, limits = LIMITS, b = big()) => parseChartKinds(body, 1, 1, limits, b);
const loose = { ...LIMITS, chartKindsValues: 1e9, chartKindsViolinValues: 1e9, chartKindsCategories: 1e9, chartKindsStages: 1e9, chartKindsTreeNodes: 1e9, chartKindsDays: 1e9, chartKindsBins: 1e9, chartKindsMarks: 1e9, chartKindsSteps: 1e9, chartKindsTreeDepth: 1e9 };

describe("chart-kinds: the maths", () => {
  test("quantiles by linear interpolation, and box statistics with the fences", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    const s = boxStats("a", [1, 2, 3, 4, 5, 6, 100], big());
    expect([s.q1, s.median, s.q3]).toEqual([2.5, 4, 5.5]);
    expect(s.outliers).toEqual([100]);
    expect(s.hi).toBe(6);
    expect(s.mean).toBeCloseTo(121 / 7, 9);
  });
  test("the density integrates to about 1", () => {
    const k = kde([1, 2, 2, 3, 3, 3, 4, 4, 5], undefined, big(), 200);
    let area = 0;
    for (let i = 1; i < k.at.length; i++) area += ((k.dens[i] + k.dens[i - 1]) / 2) * (k.at[i] - k.at[i - 1]);
    expect(area).toBeGreaterThan(0.8);
    expect(area).toBeLessThan(1.05);
  });
  test("round ticks, formats and dates", () => {
    expect(niceTicks(0, 97, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(fmtValue(90, "duration")).toBe("1m 30s");
    expect(fmtValue(1536, "bytes")).toBe("1.5 KiB");
    expect(fmtValue(12500, "money", "EUR")).toBe("€12,500");
    expect(dayNum("2026-02-30")).toBeNull();
    expect(dateOf(dayNum("2026-11-22")!)).toBe("2026-11-22");
  });
});

describe("chart-kinds: parse and the LLM view", () => {
  test("a good chart is a block of this part with its data and no problems", () => {
    const doc = parse(fence(HIST), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "chart-kinds")!;
    expect(b).toBeDefined();
    if (b.type !== "chart-kinds") throw new Error("not this part");
    expect(b.data.kind).toBe("histogram");
    const v = b.data.steps[0].view;
    if (v.kind !== "histogram") throw new Error("not a histogram");
    expect(v.series[0].counts).toEqual([1, 2, 3, 2]);
    expect(v.marks[0].label).toBe("p50");
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("a chart of another kind stays a chart", () => {
    expect(blockOf(fence("kind: bar\nx: { values: [a, b] }\ndata: [1, 2]"))).toBeUndefined();
  });
  test("the LLM view is the table, and the page's LLM view carries it", () => {
    const want = "Chart (funnel): Funnel\n\n| stage | count | of the first | of the one before |\n| --- | --- | --- | --- |\n| Visited | 1,000 | 100% |  |\n| Paid | 100 | 10% | 10% |";
    const d = run(FUNNEL);
    expect(part.llm!(d, { body: FUNNEL, bodyLine: 1, line: 1, attrs: {}, head: "", steps: [] })).toBe(want);
    expect(parse(fence(FUNNEL), { path: "p.dh.md" }).llm).toContain(want);
  });
  test("every kind has an LLM view of its numbers", () => {
    const text = (src: string) => parse(fence(src), { path: "p.dh.md" }).llm;
    expect(text(HIST)).toContain("| from | to | count |");
    expect(text("kind: boxplot\nx: { values: [a, b] }\ndata: [[1, 2, 3, 4, 50], [2, 3, 4]]")).toContain("| category | min | p25 | median | p75 | max | outliers |");
    expect(text("kind: violin\nx: { values: [a] }\ndata: [[1, 2, 3, 4, 5]]")).toContain("Values per category: a 5.");
    expect(text('kind: waterfall\nx: { values: [Start, Up, End] }\ndata: [10, 5, "="]')).toContain("| Start | start 10 | 10 |");
    expect(text("kind: treemap\ndata:\n  - { name: A, value: 3 }\n  - { name: B, value: 1 }")).toContain("- A: 3 (75%)");
    expect(text("kind: sunburst\ndata:\n  - name: A\n    children: [{ name: B, value: 1 }]")).toContain("  - B: 1 (100%)");
    expect(text('kind: calendar\ndata: [["2026-11-20", 4], ["2026-11-21", 7]]')).toContain("| Nov 2026 | 2 | 11 | 2026-11-21 (7) |");
  });
  test("steps: each is computed on top of the one before; the LLM view lists them", () => {
    const src = `${FUNNEL}\nsteps:\n  - title: before\n  - title: after\n    data: [[Visited, 1000], [Paid, 300]]`;
    const b = blockOf(fence(src));
    if (!b || b.type !== "chart-kinds") throw new Error("missing");
    expect(b.data.steps.map((s) => s.title)).toEqual(["before", "after"]);
    expect(b.data.stepped).toBe(true);
    const llm = parse(fence(src), { path: "p.dh.md" }).llm;
    expect(llm).toContain("Step 1: before");
    expect(llm).toContain("Step 2: after");
    expect(llm).toContain("| Paid | 300 | 30% | 30% |");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(HIST) + "\n:::llm\nEight latencies.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Eight latencies.");
    expect(doc.llm).not.toContain("| from | to |");
  });
  test("histogram: series share the bins; a value outside from and to warns", () => {
    const b = blockOf(fence("kind: histogram\nbin: 10\nseries:\n  - { name: Before, data: [5, 15, 25] }\n  - { name: After, tone: c3, data: [5, 6, 7] }"));
    if (!b || b.type !== "chart-kinds") throw new Error("missing");
    const v = b.data.steps[0].view;
    if (v.kind !== "histogram") throw new Error("kind");
    expect(v.series.map((s) => s.tone)).toEqual(["c1", "c3"]);
    expect(v.series[1].counts).toEqual([3, 0]);
    expect(warnsOf(fence("kind: histogram\nfrom: 0\nto: 10\ndata: [1, 2, 50]")).join()).toMatch(/1 value is outside from and to/);
  });
  test("treemap and sunburst: parents before children, sizes summed, a branch takes its entry's colour", () => {
    const c: any = { b: big(), caps: capsOf(LIMITS), errors: [], warnings: [] };
    const nodes = flattenTree([{ name: "A", tone: "c5", children: [{ name: "x", value: 2 }, { name: "y", value: 3 }] }, { name: "B", value: 1 }], "All", c)!;
    expect(nodes.map((n) => [n.name, n.value, n.tone])).toEqual([["All", 6, "acc"], ["A", 5, "c5"], ["y", 3, "c5"], ["x", 2, "c5"], ["B", 1, "c2"]].sort((a, b) => nodes.findIndex((n) => n.name === a[0]) - nodes.findIndex((n) => n.name === b[0])));
    const rects = treemapLayout(nodes, 0, 400, 300, 2, big());
    expect(rects.length).toBe(4);
    let area = 0;
    for (const r of rects.filter((r) => r.depth === 1)) area += r.w * r.h;
    expect(area).toBeCloseTo(400 * 300, 3);
    const arcs = sunburstLayout(nodes, 0, 2, big());
    expect(arcs.filter((a) => a.ring === 1).reduce((s, a) => s + (a.a1 - a.a0), 0)).toBeCloseTo(Math.PI * 2, 9);
  });
  test("calendar: weeks run in columns from the week's first day", () => {
    const b = blockOf(fence('kind: calendar\nweek: sun\nfrom: 2026-11-01\nto: 2026-11-14\ndata: [["2026-11-02", 4]]'));
    if (!b || b.type !== "chart-kinds") throw new Error("missing");
    const v = b.data.steps[0].view;
    if (v.kind !== "calendar") throw new Error("kind");
    expect(v.days.length).toBe(14);
    expect(v.days[0]).toMatchObject({ date: "2026-11-01", col: 0, row: 0 });   // a Sunday
    expect(v.days[1]).toMatchObject({ col: 0, row: 1, value: 4 });
    expect(v.cols).toBe(2);
  });
});

describe("chart-kinds: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["unreadable YAML", "kind: histogram\ndata: [1, 2", /YAML cannot be read/],
    ["histogram without data", "kind: histogram", /needs data/],
    ["a value that is not a number", "kind: histogram\ndata: [1, x]", /data\[2\] is "x", not a number/],
    ["an empty list", "kind: histogram\ndata: []", /data is empty/],
    ["data and series", "kind: histogram\ndata: [1]\nseries: [{ name: a, data: [1] }]", /not both/],
    ["bins over the cap", "kind: histogram\nbins: 1000\ndata: [1, 2]", /at most 400/],
    ["bins not whole", "kind: histogram\nbins: 2.5\ndata: [1, 2]", /whole number from 1 to 400/],
    ["bins and bin", "kind: histogram\nbins: 4\nbin: 2\ndata: [1, 9]", /bins \(how many\) or bin/],
    ["a bin that makes too many bins", "kind: histogram\nbin: 1\ndata: [0, 100000]", /makes 100000 bins; at most 400/],
    ["a mark that is not a mark", "kind: histogram\nmarks: [p150]\ndata: [1, 2]", /marks\[1\] "p150" is not a mark/],
    ["over 8 marks", "kind: histogram\nmarks: [p1, p2, p3, p4, p5, p6, p7, p8, p9]\ndata: [1, 2]", /at most 8 marks/],
    ["five series", "kind: histogram\nseries: [" + Array.from({ length: 5 }, (_, k) => `{ name: s${k}, data: [1, 2] }`).join(", ") + "]", /at most 4 series/],
    ["boxplot without names", "kind: boxplot\ndata: [[1, 2]]", /name the categories with x/],
    ["names that do not match", "kind: boxplot\nx: { values: [a] }\ndata: [[1], [2]]", /x.values has 1 names but data has 2 lists/],
    ["a violin bandwidth of 0", "kind: violin\nx: { values: [a] }\nbandwidth: 0\ndata: [[1, 2, 3]]", /bandwidth must be a number above 0/],
    ["a funnel of one stage", "kind: funnel\ndata: [[a, 1]]", /at least 2 stages/],
    ["a funnel's first stage of 0", "kind: funnel\ndata: [[a, 0], [b, 0]]", /first stage "a" must be above 0/],
    ["a funnel stage without a name", "kind: funnel\ndata: [[\"\", 3], [b, 1]]", /stage 1 needs a name/],
    ["a funnel count that is not a number", "kind: funnel\ndata: [[a, 3], [b, many]]", /stage "b" needs a count/],
    ["a waterfall that starts with =", 'kind: waterfall\nx: { values: [a, b] }\ndata: ["=", 5]', /first entry is the start/],
    ["a waterfall entry of text", 'kind: waterfall\nx: { values: [a, b] }\ndata: [5, up]', /data\[2\] \(b\) is "up"/],
    ["a waterfall with a tone", "kind: waterfall\ntone: c1\nx: { values: [a, b] }\ndata: [5, 1]", /remove tone/],
    ["a tree leaf without a value", "kind: treemap\ndata:\n  - { name: a }", /"a" needs a value above 0/],
    ["a tree entry without a name", "kind: treemap\ndata:\n  - { value: 1 }", /an entry has no name/],
    ["an unknown tree key", "kind: treemap\ndata:\n  - { name: a, value: 1, size: 2 }", /unknown key "size"/],
    ["a tone on a deeper entry", "kind: treemap\ndata:\n  - name: a\n    children: [{ name: b, value: 1, tone: c1 }]", /tone goes on a top-level entry/],
    ["an empty children", "kind: sunburst\ndata:\n  - { name: a, children: [] }", /children must be a non-empty list/],
    ["a depth out of range", "kind: treemap\ndepth: 9\ndata: [{ name: a, value: 1 }]", /depth must be a whole number from 1 to 4/],
    ["a tone on the chart of a tree", "kind: treemap\ntone: c1\ndata: [{ name: a, value: 1 }]", /set tone on an entry in data/],
    ["a date that is not real", 'kind: calendar\ndata: [["2026-02-30", 1]]', /is not a date/],
    ["a date twice", 'kind: calendar\ndata: [["2026-02-03", 1], ["2026-02-03", 2]]', /is in data twice/],
    ["a date outside from and to", 'kind: calendar\nfrom: 2026-02-04\nto: 2026-02-10\ndata: [["2026-02-03", 1]]', /outside from and to/],
    ["a bad week", 'kind: calendar\nweek: tue\ndata: [["2026-02-03", 1]]', /week must be mon or sun/],
    ["a century of days", 'kind: calendar\nfrom: 1900-01-01\nto: 2026-01-01\ndata: [["2026-01-01", 1]]', /at most 740/],
    ["a data item that is not a pair", "kind: calendar\ndata: [[1, 2, 3]]", /must be a pair/],
    ["an unknown key", "kind: funnel\ncolour: red\ndata: [[a, 2], [b, 1]]", /unknown key "colour" for a funnel \(keys: kind, title/],
    ["an unknown tone", "kind: histogram\ntone: pink\ndata: [1, 2]", /tone must be c1 to c8/],
    ["an unknown format", "kind: histogram\nx: { format: euros }\ndata: [1, 2]", /x.format must be one of number, percent/],
    ["one step", `${FUNNEL}\nsteps:\n  - title: only`, /at least 2 \(or none\)/],
    ["a step key the kind does not have", "kind: funnel\ndata: [[a, 2], [b, 1]]\nsteps:\n  - title: one\n  - title: two\n    bins: 4", /a funnel has no bins to change in a step/],
    ["an unknown step key", "kind: funnel\ndata: [[a, 2], [b, 1]]\nsteps:\n  - title: one\n  - { title: two, colour: red }", /step 2: unknown key "colour"/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.includes("chart:"))).toBe(true);
  });
  test("a refusal names the line of its key", () => {
    const probs = check(parse(fence("kind: histogram\ntitle: T\nbins: 1000\ndata: [1, 2]"), { path: "p.dh.md" })).filter((p) => p.level === "error");
    expect(probs.map((p) => p.line)).toEqual([6]);   // the fence is on line 3, its body from line 4: bins is the third line
  });
  test("a kind that is not one of the eight is refused by the part itself", () => {
    expect(run("kind: nope\ndata: [1]").errors[0].msg).toMatch(/kind must be one of histogram, boxplot/);
    expect(run("- a\n- b").errors[0].msg).toMatch(/is a list/);
  });
  test("a funnel stage larger than the one before only warns", () => {
    const src = fence("kind: funnel\ndata: [[a, 1], [b, 5]]");
    expect(warnsOf(src).join()).toMatch(/larger than "a"/);
    expect(errorsOf(src)).toEqual([]);
  });
});

describe("chart-kinds: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    for (const k of Object.keys(OWN)) { expect((LIMITS as any)[k]).toBe((OWN as any)[k]); expect((UNTRUSTED_LIMITS as any)[k]).toBe((OWN_UNTRUSTED as any)[k]); expect((OWN_UNTRUSTED as any)[k]).toBeLessThanOrEqual((OWN as any)[k]); }
    expect(LIMITS.chartKindsBins).toBe(400);
    expect(UNTRUSTED_LIMITS.chartKindsTreeDepth).toBeLessThan(LIMITS.chartKindsTreeDepth);
  });
  test("over a cap: refused by check, at the host's own cap too, and in the strict set", () => {
    const body = `kind: histogram\ndata: [${Array.from({ length: 300 }, (_, k) => k).join(", ")}]`;
    expect(errorsOf(fence(body))).toEqual([]);
    expect(errorsOf(fence(body), { chartKindsValues: 100 }).some((m) => /data has 300 values; at most 100/.test(m))).toBe(true);
    expect(errorsOf(fence(`kind: histogram\nbins: 300\ndata: [1, 2]`)).length).toBe(0);
    expect(errorsOf(fence(`kind: histogram\nbins: 300\ndata: [1, 2]`), UNTRUSTED_LIMITS).some((m) => /at most 200/.test(m))).toBe(true);
    expect(errorsOf(fence(`kind: calendar\nfrom: 2026-01-01\nto: 2027-03-01\ndata: [["2026-01-01", 1]]`)).length).toBe(0);
    expect(errorsOf(fence(`kind: calendar\nfrom: 2026-01-01\nto: 2027-03-01\ndata: [["2026-01-01", 1]]`), UNTRUSTED_LIMITS).some((m) => /at most 400/.test(m))).toBe(true);
  });
  test("a tree stops at the depth cap, however it was written", () => {
    let t = "{ name: leaf, value: 1 }";
    for (let i = 0; i < 12; i++) t = `{ name: n, children: [${t}] }`;
    const b = big();
    const d = run(`kind: treemap\ndata: [${t}]`, LIMITS, b);
    expect(d.errors[0].msg).toMatch(/nested 9 levels deep; at most 8/);
    expect(b.steps).toBeLessThan(500);
  });
  test("a YAML anchor that stands for a tree cannot loop (the depth cap holds)", () => {
    const d = run("kind: treemap\ndata:\n  - &a { name: a, children: [{ name: b, value: 1 }] }\n  - *a");
    expect(d.errors.length).toBe(0);   // an alias is a copy, not a cycle: both entries read
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const list = (n: number) => `[${Array.from({ length: n }, (_, k) => (k * 7919) % 1000).join(", ")}]`;
    const src = fence(`kind: violin\nx: { values: [a, b, c] }\ndata: [${list(300)}, ${list(300)}, ${list(300)}]`);
    const doc = parse(src, { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the chart-kinds part does too much work/);
    expect(doc.llm).toContain("[chart-kinds not shown: the chart-kinds part does too much work");
  });
});

describe("chart-kinds: linear (the doubling test, charges counted)", () => {
  const rnd = (n: number, seed = 5) => { let s = seed; return Array.from({ length: n }, () => (s = (s * 16807) % 2147483647) % 1000); };
  const caps = capsOf(loose);
  const cost = (make: (n: number) => any, n: number) => { const b = big(); const r = compute(make(n), b, caps); expect(r.errors).toEqual([]); return sumOf(b); };
  const tree = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `g${i}`, children: Array.from({ length: 4 }, (_, k) => ({ name: `l${i}-${k}`, value: 1 + ((i + k) % 7) })) }));
  const KINDS: [string, (n: number) => any, number[]][] = [
    ["histogram", (n) => ({ kind: "histogram", bins: 50, data: rnd(n) }), [400, 1600, 6400]],
    ["histogram with marks", (n) => ({ kind: "histogram", bins: 50, marks: ["p50", "p99", "mean"], data: rnd(n) }), [1600, 6400, 25600]],
    ["boxplot", (n) => ({ kind: "boxplot", x: { values: Array.from({ length: 4 }, (_, i) => `c${i}`) }, data: Array.from({ length: 4 }, (_, i) => rnd(n, i + 3)) }), [1600, 6400, 25600]],
    ["violin", (n) => ({ kind: "violin", x: { values: ["a", "b"] }, data: [rnd(n, 2), rnd(n, 3)] }), [200, 800, 3200]],
    ["funnel", (n) => ({ kind: "funnel", data: Array.from({ length: n }, (_, i) => [`s${i}`, 100000 - i]) }), [50, 200, 800]],
    ["waterfall", (n) => ({ kind: "waterfall", x: { values: Array.from({ length: n }, (_, i) => `s${i}`) }, data: Array.from({ length: n }, (_, i) => (i ? (i % 3 ? 5 : -4) : 100)) }), [50, 200, 800]],
    ["treemap", (n) => ({ kind: "treemap", depth: 2, data: tree(n) }), [50, 200, 800]],
    ["sunburst", (n) => ({ kind: "sunburst", depth: 3, data: tree(n) }), [50, 200, 800]],
    ["calendar", (n) => ({ kind: "calendar", data: Array.from({ length: n }, (_, i) => [dateOf(20000 + i), i % 9]) }), [50, 200, 700]],
    ["steps", (n) => ({ kind: "funnel", data: [["a", 9], ["b", 3]], steps: Array.from({ length: n }, (_, i) => ({ title: `s${i}`, data: [["a", 9 + i], ["b", 3]] })) }), [10, 40, 160]],
  ];
  for (const [name, make, sizes] of KINDS) test(`${name}: twice the input costs at most about twice`, () => {
    for (const n of sizes) {
      const r = cost(make, 2 * n) / cost(make, n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("both layouts: twice the tree costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const nodes = (m: number) => flattenTree(tree(m), "All", { b: big(), caps, errors: [], warnings: [] } as any)!;
      const t1 = big(), t2 = big(), s1 = big(), s2 = big();
      treemapLayout(nodes(n), 0, 720, 420, 3, t1); treemapLayout(nodes(2 * n), 0, 720, 420, 3, t2);
      sunburstLayout(nodes(n), 0, 3, s1); sunburstLayout(nodes(2 * n), 0, 3, s2);
      for (const [a, b] of [[t1, t2], [s1, s2]]) { const r = sumOf(b) / sumOf(a); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
    }
  });
  test("parse of the YAML text: a long line is read once, twice the lines cost twice", () => {
    const b1 = big(), b2 = big();
    run("kind: histogram\ntitle: " + "x".repeat(10_000) + "\ndata: [1, 2]", LIMITS, b1);
    run("kind: histogram\ntitle: " + "x".repeat(20_000) + "\ndata: [1, 2]", LIMITS, b2);
    expect(sumOf(b2) / sumOf(b1)).toBeLessThan(2.2);
    const lines = (n: number) => "kind: histogram\ndata: [1, 2]\n" + Array.from({ length: n }, (_, k) => `# comment ${k}`).join("\n");
    const c1 = big(), c2 = big();
    run(lines(400), LIMITS, c1); run(lines(800), LIMITS, c2);
    expect(sumOf(c2) / sumOf(c1)).toBeGreaterThan(1.5);
    expect(sumOf(c2) / sumOf(c1)).toBeLessThan(2.3);
  });
});

describe("chart-kinds: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every chart drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "chart-kinds").length).toBeGreaterThan(3);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThanOrEqual(5);
        expect(errs.every((p) => p.line >= 1 && (p.message.includes("chart:") || p.message.includes("chart-kinds")))).toBe(true);
      }
      for (const lim of [LIMITS, UNTRUSTED_LIMITS]) {
        const b = new Budget(partLimitsOf(lim), null, null, "the chart-kinds part");
        for (const m of text.matchAll(/```chart\n([\s\S]*?)\n```/g)) expect(() => parseChartKinds(m[1], 1, 1, lim, b)).not.toThrow();
      }
    });
  }
});

test("the definition matches its folder", () => {
  expect(part.name).toBe("chart-kinds");
  expect(part.steps).toBe(false);
  expect(part.chartKinds).toEqual(["histogram", "boxplot", "violin", "funnel", "waterfall", "treemap", "sunburst", "calendar"]);
  expect(llmText).toBeDefined();
});
