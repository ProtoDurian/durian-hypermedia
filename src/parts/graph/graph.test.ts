// The graph part: parse, the LLM view, every refusal, the caps in both sets, the work budget (small input, large work), our
// own layouts checked against rules worked out here (not read back from the layout), the still picture, the fold view, the
// force layout through real cytoscape (headless), the view's HTML, the doubling test (budget charges counted at n and 2n,
// never time) and the fixtures. The browser checks (touch at 390, the focus inside the visible box, Trusted Types) are
// scripts/part-check.ts and the part's own touch check.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import cytoscape from "cytoscape";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, BudgetError, partLimitsOf } from "../../core/budget";
import { UI } from "../../ui/ui";
import graph, { expandPattern, graphLlm, mostConnected, parseGraph, type GraphSpec } from "./part";
import { FORCE_ITER_MAX, FORCE_RUN_MIN, NODE_H, forceCost, forceIterations, forceRunIterations } from "./shape";
import { anchorId, hullOf, modelOf, nearHull, viewOf } from "./model";
import { forceLayout } from "./force";
import GraphView from "./view";

const HERE = import.meta.dir;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const fm = `---\ntitle: X\n---\n\n`;
const fence = (attrs: string, body: string) => "```graph" + (attrs ? " " + attrs : "") + "\n" + body + "\n```";
/** the problems of a page, as "line: message" (the fence of fence() sits on line 5, its first body line is 6) */
const issues = (body: string, level: "error" | "warn" = "error", limits = LIMITS) => check(parse(fm + body + "\n", { path: "x.dh.md", limits })).filter((p) => p.level === level).map((p) => `${p.line}: ${p.message}`);
const g = (body: string, attrs: Record<string, string> = {}, lim = LIMITS, b = big()) => parseGraph(body, 1, attrs, 0, lim, b);
const errs = (body: string, attrs: Record<string, string> = {}) => g(body, attrs).errors.map((e) => `${e.line}: ${e.msg}`);
const SMALL = `group core "core" [c1]
node parse "parser" in core
node check "doccheck" in core
node react "react renderer" [c2]
check -> parse
react -> parse
react -> chart.js "lazy"`;
const sampleText = readFileSync(join(HERE, "sample.md"), "utf8");
const sampleDoc = parse(sampleText, { path: "sample.dh.md" });
const sampleBlock = (title: string) => sampleDoc.blocks.find((b: any) => b.type === "graph" && b.data.title.startsWith(title)) as any;
const sample = (title: string): GraphSpec => sampleBlock(title).data;
const stage = (width = 600) => ({ width, theme: "light" as const, motion: "on" as const, report() {} });
const html = (data: GraphSpec, stp?: string | false) => renderToStaticMarkup(React.createElement(GraphView, { data, block: {} as any, ui: UI.en, static: stp, stage: stage() }));

describe("graph: parse", () => {
  test("a good graph is a block with its data and no problems; the data survives JSON", () => {
    const doc = parse(fm + fence('title="Package dependencies" layout=layers', SMALL) + "\n", { path: "x.dh.md" });
    const b: any = doc.blocks.find((x) => x.type === "graph")!;
    expect(b).toBeDefined();
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("the design's example: groups, nodes, labels, colours, a node used and never declared", () => {
    const s = g(SMALL, { title: "Package dependencies", layout: "layers" });
    expect(s.errors).toEqual([]);
    expect(s.groups.map((x) => [x.id, x.label, x.tone])).toEqual([["core", "core", "c1"]]);
    expect(s.nodes.map((n) => [n.id, n.label, n.group, n.tone, n.declared])).toEqual([["parse", "parser", "core", "c1", true], ["check", "doccheck", "core", "c1", true], ["react", "react renderer", null, "c2", true], ["chart.js", "chart.js", null, null, false]]);
    expect(s.edges.map((e) => [e.from, e.to, e.label])).toEqual([["check", "parse", ""], ["react", "parse", ""], ["react", "chart.js", "lazy"]]);
  });
  test("lists and chains: a, b -> c -> d makes every pair of each hop", () => {
    const s = g(`a, b -> c -> d, e "x" [warn] dashed`);
    expect(s.errors).toEqual([]);
    expect(s.edges.map((e) => `${e.from}>${e.to}:${e.label}:${e.tone}:${e.dashed}`)).toEqual(["a>c:x:warn:true", "b>c:x:warn:true", "c>d:x:warn:true", "c>e:x:warn:true"]);
  });
  test("a top-level group with no colour takes the next family colour; a nested group and its nodes take their parent's", () => {
    const s = g(`group a\ngroup b\ngroup b1 in b\nnode x in b1\nnode y in a [bad]\ngroup c [c6]\ngroup d`);
    expect(Object.fromEntries(s.groups.map((x) => [x.id, x.tone]))).toEqual({ a: "c1", b: "c2", b1: "c2", c: "c6", d: "c3" });
    expect(Object.fromEntries(s.nodes.map((n) => [n.id, n.tone]))).toEqual({ x: "c2", y: "bad" });
  });
  test("a node line after an edge that used the node gives it its label and group", () => {
    const s = g(`group g\na -> b\nnode b "Bee" in g`);
    expect(s.errors).toEqual([]);
    expect(s.nodes.find((n) => n.id === "b")).toMatchObject({ label: "Bee", group: "g", declared: true });
  });
  test("an edge may join groups", () => {
    const s = g(`group web\ngroup api\nnode w in web\nnode a in api\nweb -> api "https"`);
    expect(s.errors).toEqual([]);
    expect(s.edges[0]).toMatchObject({ from: "web", to: "api", label: "https" });
  });
  test("comments and blank lines are skipped; ids may hold . - _", () => {
    expect(g(`// the core\n\nnode chart.js\nnode a_b-c.d\n  // indented comment`).nodes.map((n) => n.id)).toEqual(["chart.js", "a_b-c.d"]);
  });
});

describe("graph: patterns, a numbered range in an id", () => {
  test("node api-{1..8} declares eight nodes; an edge between two patterns is every pair", () => {
    const s = g(`group api\nnode api-{1..8} in api\nweb-{1..3} -> api-{1..8}`);
    expect(s.nodes.filter((n) => n.group === "api").map((n) => n.id)).toEqual(Array.from({ length: 8 }, (_, i) => `api-${i + 1}`));
    expect(s.edges.length).toBe(24);
    expect(s.nodes.length).toBe(11);
  });
  test("two ranges in one id multiply; a range may start anywhere", () => {
    expect(expandPattern("r{1..2}-z{9..10}", 100, big())).toEqual(["r1-z9", "r1-z10", "r2-z9", "r2-z10"]);
  });
  test("a range that counts down, or makes too many names, is refused before anything is made", () => {
    expect(expandPattern("a{5..1}", 100, big())).toContain("counts down");
    const b = big();
    const t0 = performance.now();
    expect(expandPattern("a{1..1000000}{1..1000000}", LIMITS.graphNodes, b)).toContain("at most 2,000");
    expect(performance.now() - t0).toBeLessThan(50);
    expect(b.steps + b.values + b.chars).toBe(0); // nothing was made, nothing charged
  });
  test("a label on a pattern is refused (a label names one node)", () => {
    expect(errs(`node api-{1..3} "API"`).join()).toContain("a label names one node");
  });
});

describe("graph: the LLM view", () => {
  test("nodes by group, edges as a -> b lines, the most connected; the page's LLM view carries it", () => {
    const want = `Graph "Package dependencies": 4 nodes in 1 group, 3 edges (a -> b: a links to b).

Nodes by group:
- core: parse "parser", check "doccheck"
- in no group: react "react renderer", chart.js

Edges:
check -> parse
react -> parse
react -> chart.js: lazy

Most connected: parse (2 in), react (2 out), check (1 out), chart.js (1 in).`;
    expect(graphLlm(g(SMALL, { title: "Package dependencies", layout: "layers" }))).toBe(want);
    expect(parse(fm + fence('title="Package dependencies" layout=layers', SMALL) + "\n", { path: "x.dh.md" }).llm).toContain(want);
  });
  test("nested groups are named by their path; notes are kept", () => {
    const t = graphLlm(g(`group a "Alpha"\ngroup b in a note="inner"\nnode x in b\nnode y in a\nx -> y`));
    expect(t).toContain(`- a "Alpha": y, group b`);
    expect(t).toContain(`- a/b: x`);
    expect(t).toContain(`Notes:\n- b: inner`);
  });
  test("no groups: one line of nodes", () => {
    expect(graphLlm(g(`a -> b`))).toBe(`Graph: 2 nodes, 1 edge (a -> b: a links to b).\n\nnodes: a, b\n\nEdges:\na -> b\n\nMost connected: a (1 out), b (1 in).`);
  });
  test("most connected: by in + out, ties in the written order, at most 5", () => {
    expect(mostConnected(g(`hub -> a, b, c\nd -> hub\ne -> f\nf -> e\nz -> y`)).map((x) => x.id)).toEqual(["hub", "e", "f", "a", "b"]);
  });
  test("a big graph needs a :::llm (over the 400-token rule), and passes with one; a :::llm replaces the view", () => {
    const bigOne = fence("layout=force", `node n{1..120}\nn{1..119} -> n120`);
    expect(issues(bigOne).join()).toContain("400-token limit");
    expect(issues(bigOne + "\n\n:::llm\nA star of 120 nodes.\n:::")).toEqual([]);
    const doc = parse(fm + bigOne + "\n\n:::llm\nA star of 120 nodes.\n:::\n", { path: "x.dh.md" });
    expect(doc.llm).toContain("A star of 120 nodes.");
    expect(doc.llm).not.toContain("Most connected");
  });
  test("a part that does not parse shows its source as written", () => {
    const doc = parse(fm + fence("", "group a in a\nnode x in a") + "\n", { path: "x.dh.md" });
    expect(doc.llm).toContain("```graph\ngroup a in a\nnode x in a\n```");
  });
});

describe("graph: every refusal names the line and the fix", () => {
  const cases: [string, string, string, number?][] = [
    ["unknown attribute", fence("shape=round", "a -> b"), `unknown attribute "shape"`],
    ["center spelling", fence("layout=radial center=a", "a -> b"), "write centre="],
    ["layout word", fence("layout=tree", "a -> b"), "layout must be layers, force or radial"],
    ["dir on force", fence("layout=force dir=right", "a -> b"), "dir= is for layout=layers"],
    ["dir word", fence("dir=up", "a -> b"), "dir must be down or right"],
    ["size word", fence("size=xl", "a -> b"), "size must be s, m or l"],
    ["radial with no centre", fence("layout=radial", "a -> b"), "needs centre="],
    ["centre on layers", fence("centre=a", "a -> b"), "centre= is for layout=radial"],
    ["centre not a node", fence("layout=radial centre=q", "a -> b"), "centre=q is not a node"],
    ["centre a group", fence("layout=radial centre=g", "group g\nnode a in g\na -> b"), "centre=g is a group"],
    ["hex colour", fence("", "node a [#ff0000]"), "a colour is a theme word, not a value", 6],
    ["unknown colour", fence("", "node a [pink]"), "unknown colour [pink]", 6],
    ["group in itself", fence("", "group a in a\nnode x in a"), "group a is inside itself", 6],
    ["a ring of groups", fence("", "group a in b\ngroup b in c\ngroup c in a\nnode x in a"), "sit inside each other in a ring", 6],
    ["too deep", fence("", Array.from({ length: LIMITS.graphDepth + 2 }, (_, i) => `group g${i}${i ? ` in g${i - 1}` : ""}`).join("\n") + `\nnode x in g${LIMITS.graphDepth + 1}`), `at most ${LIMITS.graphDepth}`],
    ["in an unknown group", fence("", "node x in nowhere"), `"in nowhere", which is not a group`, 6],
    ["node twice", fence("", "node a\nnode a"), "node a is declared twice (first at line 6)", 7],
    ["group twice", fence("", "group a\ngroup a\nnode x in a"), "group a is declared twice", 7],
    ["a node and a group", fence("", "node a\ngroup a"), "a is a node (line 6) and a group", 7],
    ["a long label", fence("", `node a "${"x".repeat(81)}"`), "at most 80"],
    ["@step", fence("", "a -> b\n@step one\nb -> c"), "graph takes no @step lines", 7],
    ["not a graph line", fence("", "a b c"), "is not a graph line", 6],
    ["an open quote", fence("", `node a "open`), "a quote is never closed", 6],
    ["an edge with an empty end", fence("", "a -> "), "a name on each side of ->", 6],
    ["a bad id", fence("", "node a/b"), `"a/b" is not an id`, 6],
    ["member and group at once (out)", fence("", "group g\nnode m in g\nx -> g\nx -> m"), "x links to the group g and to its member m at once", 9],
    ["member and group at once (in)", fence("", "group g\nnode m in g\ng -> x\nm -> x"), "the group g and its member m both link to x", 9],
    ["a member of a nested group", fence("", "group g\ngroup h in g\nnode m in h\nx -> g\nx -> m"), "x links to the group g and to its member m", 10],
    ["an edge to its own group", fence("", "group g\nnode m in g\nm -> g"), "joins m to its own group g", 8],
    ["a group's edge to its member", fence("", "group g\nnode m in g\ng -> m"), "joins the group g to its own member m", 8],
    ["an edge twice", fence("", "a -> b\na -> b"), "the edge a -> b is written twice (first at line 6)", 7],
    ["empty", fence("", "// nothing yet"), "graph has no nodes"],
  ];
  for (const [name, body, want, line] of cases) test(name, () => {
    const r = issues(body);
    const hit = r.find((m) => m.includes(want));
    expect(hit ?? r.join(" | ")).toContain(want);
    expect(r.every((m) => m.includes("graph"))).toBe(true);
    if (line) expect(hit!.startsWith(`${line}: `)).toBe(true);
  });
  test("the same edge with two labels is two edges, not a repeat", () => { expect(issues(fence("", `a -> b "x"\na -> b "y"`))).toEqual([]); });
  test("a hex value lists the colour words", () => { expect(issues(fence("", "node a [#0f0]")).join()).toContain("[c1], [c2]"); });
  test("rgb( and hsl( are values too", () => { expect(issues(fence("", "node a [rgb(1,2,3)]")).join()).toContain("a colour is a theme word, not a value"); });
});

describe("graph: caps in both sets, and the work budget (small input, large work)", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, and the strict set is never higher", () => {
    expect([LIMITS.graphNodes, LIMITS.graphEdges, LIMITS.graphDepth]).toEqual([2000, 5000, 6]);
    for (const k of ["graphNodes", "graphEdges", "graphGroups", "graphDepth", "graphFoldFirst"] as const) { expect(UNTRUSTED_LIMITS[k]).toBeGreaterThan(0); expect(UNTRUSTED_LIMITS[k]).toBeLessThanOrEqual(LIMITS[k]); }
  });
  test("over 2,000 nodes is refused, also at the host's own cap", () => {
    expect(errs(`node n{1..2000}\nnode extra`).join()).toContain("over 2,000 nodes");
    expect(errs(`node a{1..1500}\nb{1..600} -> c`).join()).toContain("over 2,000 nodes");
    expect(g(`node n{1..2000}`).errors).toEqual([]);
    const r = check(parse(fm + fence("", "node n{1..30}") + "\n", { path: "x.dh.md", limits: { graphNodes: 20 } })).map((p) => p.message);
    expect(r.join()).toContain("at most 20");
  });
  test("one line that declares 10,000 edges by a pattern is refused at once, before it makes any", () => {
    const b = big();
    const t0 = performance.now();
    const s = g(`x{1..100} -> y{1..100}`, {}, LIMITS, b);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(s.errors.map((e) => e.msg).join()).toContain("over 5,000 edges (this line makes 10,000");
    expect(s.edges.length).toBe(0);
    expect(b.steps).toBeLessThan(1000); // the names were made (200), the edges never
  });
  test("edges over 5,000 across lines are refused; the strict set stops at 2,500", () => {
    expect(errs(`a{1..50} -> b{1..50}\nc{1..50} -> d{1..50}\ne -> f`).join()).toContain("over 5,000 edges");
    expect(g(`a{1..50} -> b{1..50}\nc{1..50} -> d{1..50}`).errors).toEqual([]);
    expect(g(`a{1..50} -> b{1..50}\nc{1..50} -> d{1..50}`, {}, UNTRUSTED_LIMITS).errors.map((e) => e.msg).join()).toContain("over 2,500 edges");
  });
  test("a billion names in one pattern ends at once", () => {
    const t0 = performance.now();
    expect(errs(`node a{1..1000000000}`).join()).toContain("makes 1,000,000,000 names; at most 2,000");
    expect(performance.now() - t0).toBeLessThan(50);
  });
  test("the charge is really counted: 900 edges under a budget of 1,000 steps end in BudgetError", () => {
    const small = new Budget({ steps: 1000, values: 1e9, chars: 1e9 }, null, null, "the graph part");
    expect(() => parseGraph(`x{1..30} -> y{1..30}`, 1, {}, 0, LIMITS, small)).toThrow(BudgetError);
    expect(parseGraph(`x{1..30} -> y{1..30}`, 1, {}, 0, LIMITS, big()).edges.length).toBe(900);
  });
  test("a group nested in itself ends at once (no endless walk up the groups)", () => {
    const t0 = performance.now();
    expect(errs(`group a in a\ngroup b in c\ngroup c in b\nnode x in a\nnode y in b`).length).toBe(2);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  test("the force layout is charged up front: its fixed iterations x (nodes + edges), in budget steps", () => {
    const b = big();
    const s = g(`node n{1..300}\nn{1..299} -> n300`, { layout: "force" }, LIMITS, b);
    expect(s.forceIterations).toBe(forceIterations(300, 299));
    expect(s.forceIterations).toBeLessThanOrEqual(FORCE_ITER_MAX);
    expect(b.steps).toBeGreaterThanOrEqual(forceCost(300, 299));
    expect(forceIterations(2000, 5000)).toBeGreaterThanOrEqual(40);
    expect(forceIterations(10, 10)).toBe(FORCE_ITER_MAX);
  });
  test("the biggest graph the caps allow fits one part's budget, in every layout", () => {
    const body = `group g{1..20}\nnode n{1..1980}\nn{1..1980} -> hub\nn{1..1000} -> h{1..3}\nn{1..20} -> k`;
    for (const layout of ["layers", "force"]) {
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the graph part");
      const s = parseGraph(body, 1, { layout }, 0, LIMITS, b);
      expect(s.errors.map((e) => e.msg)).toEqual([]);
      expect(s.nodes.length).toBeGreaterThan(1900);
      expect(b.steps).toBeLessThan(partLimitsOf(LIMITS).steps);
    }
  });
  test("a part over the work budget is an error block, named, and the LLM view says so", () => {
    const body = `node n{1..1999}\nn{1..1999} -> hub`;
    const doc = parse(fm + fence("layout=force", body) + "\n:::llm\nBig.\n:::\n", { path: "x.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the graph part does too much work/);
    const noLlm = parse(fm + fence("layout=force", body) + "\n", { path: "x.dh.md", limits: { maxEvalSteps: 2000 } });
    expect(noLlm.llm).toContain("[graph not shown: the graph part does too much work");
  });
  test("one budget for the whole page: the big force graphs of one page run it out", () => {
    const one = fence("layout=force", `group g{1..20}\nnode n{1..1999}\nn{1..1999} -> hub`) + "\n\n:::llm\nBig.\n:::";
    const doc = parse(fm + Array.from({ length: 8 }, () => one).join("\n\n") + "\n", { path: "x.dh.md" });
    const drawn = doc.blocks.filter((b) => b.type === "graph").length, refused = doc.blocks.filter((b) => b.type === "error").length;
    expect(drawn).toBeGreaterThanOrEqual(1);
    expect(refused).toBeGreaterThanOrEqual(1);
  });
  test("over 300 nodes with groups: only the groups are drawn first", () => {
    expect(g(`group a\ngroup b\nnode x{1..200} in a\nnode y{1..101} in b`).foldFirst).toBe(true);
    expect(g(`group a\nnode x{1..300} in a`).foldFirst).toBe(false);
  });
  test("over 300 nodes with most in no group: a warning that the first view will be big", () => {
    expect(issues(fence("", `group a\nnode a1 in a\nnode n{1..400}`) + "\n\n:::llm\nx\n:::", "warn").join()).toContain("put them in groups");
  });
});

// ------------------------------------------------------------------ our layouts, checked by rules worked out here
const box = (n: GraphSpec["nodes"][number]) => ({ x1: n.x - n.w / 2, x2: n.x + n.w / 2, y1: n.y - NODE_H / 2, y2: n.y + NODE_H / 2 });
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
describe("graph: layouts", () => {
  test("layers: every edge points down, from a higher layer to a lower one, in a graph with no cycle", () => {
    const s = sample("A shop's packages");
    const at = new Map(s.nodes.map((n) => [n.id, n]));
    for (const e of s.edges) if (at.has(e.from) && at.has(e.to)) expect(at.get(e.from)!.y).toBeLessThan(at.get(e.to)!.y);
  });
  test("layers: a node sits one layer below the lowest node pointing at it (longest path, worked out here)", () => {
    const s = sample("A shop's packages");
    const depth = new Map<string, number>();
    const d = (id: string): number => { if (depth.has(id)) return depth.get(id)!; const ins = s.edges.filter((e) => e.to === id).map((e) => e.from); const v = ins.length ? Math.max(...ins.map(d)) + 1 : 0; depth.set(id, v); return v; };
    const ys = [...new Set(s.nodes.map((n) => n.y))].sort((a, b) => a - b);
    for (const n of s.nodes) expect(ys.indexOf(n.y)).toBe(d(n.id));
  });
  test("layers: no two nodes overlap; a group's area (the box round its members) holds no node of another group, and no two groups' areas meet", () => {
    for (const s of [sample("A shop's packages"), g(`group a\ngroup b\ngroup c in b\nnode a1, a2, a3 in a\nnode b1, b2 in b\nnode c1, c2 in c\na1 -> b1, c1, x\nb1 -> c2, a2\nc1 -> a3\nx -> c2\ny -> a1, b2`)]) {
      for (let i = 0; i < s.nodes.length; i++) for (let j = i + 1; j < s.nodes.length; j++) expect(overlap(box(s.nodes[i]), box(s.nodes[j]))).toBe(false);
      const inG = (n: GraphSpec["nodes"][number], gid: string) => { for (let p = n.group; p; p = s.groups.find((x) => x.id === p)!.parent) if (p === gid) return true; return false; };
      const area = (gid: string) => { const ms = s.nodes.filter((n) => inG(n, gid)).map(box); return { x1: Math.min(...ms.map((b) => b.x1)), x2: Math.max(...ms.map((b) => b.x2)), y1: Math.min(...ms.map((b) => b.y1)), y2: Math.max(...ms.map((b) => b.y2)) }; };
      for (const gr of s.groups) { const a = area(gr.id); for (const n of s.nodes) if (!inG(n, gr.id)) expect(overlap(a, box(n))).toBe(false); }
      const tops = s.groups.filter((x) => !x.parent).map((x) => area(x.id));
      for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) expect(overlap(tops[i], tops[j])).toBe(false);
    }
  });
  test("layers: packed, so a group that uses other layers shares columns (the package sample is not one column per group wide)", () => {
    const s = sample("A shop's packages");
    const width = Math.max(...s.nodes.map((n) => box(n).x2)) - Math.min(...s.nodes.map((n) => box(n).x1));
    const sumOfGroups = s.groups.reduce((acc, gr) => { const ms = s.nodes.filter((n) => n.group === gr.id).map(box); return acc + Math.max(...ms.map((b) => b.x2)) - Math.min(...ms.map((b) => b.x1)); }, 0);
    expect(width).toBeLessThan(sumOfGroups);
  });
  test("layers dir=right: every edge points right", () => {
    const s = g(`a -> b, c\nb -> d\nc -> d\nd -> e`, { layout: "layers", dir: "right" });
    const at = new Map(s.nodes.map((n) => [n.id, n]));
    for (const e of s.edges) expect(at.get(e.from)!.x).toBeLessThan(at.get(e.to)!.x);
  });
  test("layers: a cycle still lays out (one edge turned round), with every node placed once", () => {
    const s = g(`a -> b\nb -> c\nc -> a\nc -> d`);
    expect(s.errors).toEqual([]);
    expect(new Set(s.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(4);
  });
  test("radial: the centre at the middle, each ring further out by its steps from the centre (breadth-first, worked out here)", () => {
    const s = sample("What touches the sign-in");
    const steps = new Map<string, number>([["auth", 0]]); const q = ["auth"];
    while (q.length) { const v = q.shift()!; for (const e of s.edges) for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) if (a === v && !steps.has(b)) { steps.set(b, steps.get(v)! + 1); q.push(b); } }
    const r = (id: string) => { const n = s.nodes.find((x) => x.id === id)!; return Math.hypot(n.x, n.y); };
    expect(r("auth")).toBe(0);
    for (const a of s.nodes) for (const b of s.nodes) if (steps.get(a.id)! < steps.get(b.id)!) expect(r(a.id)).toBeLessThan(r(b.id));
    for (let i = 0; i < s.nodes.length; i++) for (let j = i + 1; j < s.nodes.length; j++) expect(overlap(box(s.nodes[i]), box(s.nodes[j]))).toBe(false);
  });
  test("a long chain lays out fast in every layout (no pass over every node for every layer)", () => {
    const n = 2000, body = Array.from({ length: n - 1 }, (_, i) => `n${i} -> n${i + 1}`).join("\n");
    const variants: Record<string, string>[] = [{ layout: "layers" }, { layout: "radial", centre: "n0" }, { layout: "force" }];
    for (const attrs of variants) {
      const t0 = performance.now();
      expect(g(body, attrs).errors).toEqual([]);
      expect(performance.now() - t0).toBeLessThan(1500);
    }
  });
  test("force: the seed is the same every time (so cytoscape's result is too)", () => {
    const a = g(`group x\nnode a{1..9} in x\na{1..8} -> a9`, { layout: "force" }), b = g(`group x\nnode a{1..9} in x\na{1..8} -> a9`, { layout: "force" });
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
  });
});

describe("graph: the still picture and the fold view", () => {
  test("the still: one box per top-level group with its node count, and lines that count the edges between them", () => {
    const s = sample("Calls between");
    const st = s.still!;
    expect(st.items.filter((x) => x.group).map((x) => x.id)).toEqual(s.groups.map((x) => x.id));
    expect(st.items.reduce((a, x) => a + x.count, 0)).toBe(s.nodes.length);
    const across = s.edges.filter((e) => s.nodes.find((n) => n.id === e.from)!.group !== s.nodes.find((n) => n.id === e.to)!.group).length;
    expect(st.edges.reduce((a, e) => a + e.count, 0)).toBe(across);
  });
  test("fold a group: its members leave, one box with the count stands for them, their edges join on it with a count", () => {
    const s = g(`group g\nnode a, b in g\nx -> a\nx -> b\nb -> y`);
    const m = modelOf(s);
    const pos = new Map(s.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const open = viewOf(s, m, new Set(), pos);
    expect(open.filter((e) => e.group === "nodes").map((e) => [e.data.id, e.data.kind])).toEqual([["a", "node"], ["b", "node"], ["x", "node"], ["y", "node"]]);
    const shut = viewOf(s, m, new Set(["g"]), pos);
    const ns = shut.filter((e) => e.group === "nodes");
    expect(ns.map((e) => e.data.id)).toEqual(["g", "x", "y"]);
    expect(ns[0].data).toMatchObject({ kind: "folded", count: 2, label: "g  2" });
    expect(ns[0].position).toEqual({ x: (pos.get("a")!.x + pos.get("b")!.x) / 2, y: (pos.get("a")!.y + pos.get("b")!.y) / 2 });
    expect(shut.filter((e) => e.group === "edges").map((e) => [e.data.source, e.data.target, e.data.count])).toEqual([["x", "g", 2], ["g", "y", 1]]);
  });
  test("an edge written to an open group ends on the group's dot, in the middle of its members; folded, on the folded box", () => {
    const s = g(`group g\nnode a, b in g\nx -> g "uses"`);
    const m = modelOf(s), pos = new Map(s.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const open = viewOf(s, m, new Set(), pos);
    const dot = open.find((e) => e.data.id === anchorId("g"))!;
    expect(dot.data).toMatchObject({ anchorOf: "g", kind: "anchor" });
    expect(dot.position).toEqual({ x: (pos.get("a")!.x + pos.get("b")!.x) / 2, y: (pos.get("a")!.y + pos.get("b")!.y) / 2 });
    expect(open.filter((e) => e.group === "edges").map((e) => [e.data.source, e.data.target, e.data.label])).toEqual([["x", anchorId("g"), "uses"]]);
    expect(viewOf(s, m, new Set(["g"]), pos).filter((e) => e.group === "edges").map((e) => [e.data.source, e.data.target])).toEqual([["x", "g"]]);
  });
  test("a group's area: the convex hull of its members' corners; a tap within the padding counts as on it", () => {
    const h = hullOf([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [5, 0]]);
    expect(h.length).toBe(4);
    expect(nearHull(h, 5, 5, 0)).toBe(true);
    expect(nearHull(h, 14, 5, 5)).toBe(true);
    expect(nearHull(h, 16, 5, 5)).toBe(false);
  });
});

describe("graph: the view's HTML (strict page: no HTML string anywhere)", () => {
  test("before cytoscape loads: the still SVG with the groups, the toolbar and the side list, all as text", () => {
    const s = sample("Calls between");
    const h = html(s);
    expect(h).not.toContain("data-dh-part");          // the frame sets it
    expect(h).toContain(`class="gr-still-svg"`);
    for (const x of s.groups) expect(h).toContain(`>${x.label}</text>`);
    expect(h).toContain("Find a node");
    expect(h).toContain("1 step");
    expect(h).toContain("Fold groups");
    expect(h).toContain("Turn on scripts to explore every node.");
  });
  test("static: the still picture whole, with no search, no controls and no side list", () => {
    const s = sample("Calls between");
    const h = html(s, "");
    expect(h).toContain(`data-dh-static="true"`);
    expect(h).toContain(`class="gr-still-svg"`);
    for (const x of s.groups) expect(h).toContain(`>${x.label}</text>`);
    expect(h).not.toContain("Find a node");
    expect(h).not.toContain("Fold groups");
    expect(h).not.toContain("gr-zoom");
    expect(html(s, false)).toContain("Find a node"); // static=false: live
  });
  test("a graph that cannot be drawn says why, in text", () => {
    const bad = g(`group a in a\nnode x in a`);
    expect(html(bad)).toContain("This graph cannot be drawn:");
  });
  test("our files hold no HTML sink, no string evaluation and no string timer", () => {
    // the words are joined here so this file does not hold them itself
    const w = (...p: string[]) => p.join("");
    const sinks = new RegExp([w("inner", "HTML"), w("dangerously", "SetInnerHTML"), w("outer", "HTML"), w("insertAdjacent", "HTML"), w("\\bev", "al\\("), w("new ", "Function"), w("document", "\\.write"), 'setTimeout\\(\\s*["\'`]'].join("|"), "g");
    for (const f of ["part.ts", "layout.ts", "shape.ts", "model.ts", "force.ts", "view.tsx", "style.css"]) {
      const t = readFileSync(join(HERE, f), "utf8");
      expect(t.match(sinks) ?? []).toEqual([]);
    }
  });
  test("hygiene: no addresses, emails or machine paths in the folder's files or the sample; no hex colour in the CSS", () => {
    for (const f of readdirSync(HERE).filter((x) => /\.(ts|tsx|css|md)$/.test(x))) {
      const t = readFileSync(join(HERE, f), "utf8");
      expect((t.match(/\/home\/|\/tmp\/|[\w.]+@[\w-]+\.\w+|\b(?:10|172|192\.168)\.\d+\.\d+/g) ?? []).filter((x) => !/^\d+\.\d+\.\d+\.\d+$/.test(x) || f !== "graph.test.ts")).toEqual([]);
    }
    expect(readFileSync(join(HERE, "style.css"), "utf8").match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});

describe("graph: the Format page sample", () => {
  test("0 refusals and 0 warnings on the sample page", () => { expect(check(sampleDoc)).toEqual([]); });
  test("the three samples and the still one: a package graph (layers, about 40), a service graph (force, 120 in 8 groups), a small radial one", () => {
    const a = sample("A shop's packages"), b = sample("Calls between"), c = sample("What touches the sign-in");
    expect([a.layout, a.nodes.length, a.groups.length]).toEqual(["layers", 40, 6]);
    expect([b.layout, b.nodes.length, b.groups.length, b.size]).toEqual(["force", 120, 8, "l"]);
    expect([c.layout, c.centre, c.nodes.length]).toEqual(["radial", "auth", 12]);
    expect(sampleBlock("The same sign-in").attrs?.static ?? sampleBlock("The same sign-in").static).toBeDefined();
  });
  test("the small radial one fits the 400-token rule with no :::llm; the two big ones carry one", () => {
    const bs = sampleDoc.blocks.filter((b: any) => b.type === "graph") as any[];
    expect(bs.map((b) => b.llmKind)).toEqual(["text", "text", "own", "own"]);
    expect(Math.ceil(graphLlm(bs[2].data).length / 3)).toBeLessThanOrEqual(400);
  });
});

// ------------------------------------------------------------------ the force layout, run through real cytoscape (headless)
describe("graph: the force layout keeps each group in an area of its own", () => {
  // the rules are worked out here from the positions, not read back from the layout
  const boxOf = (spec: GraphSpec, pos: Map<string, { x: number; y: number }>, ids: string[]) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const id of ids) { const p = pos.get(id)!, w = spec.nodes.find((n) => n.id === id)!.w; x1 = Math.min(x1, p.x - w / 2); x2 = Math.max(x2, p.x + w / 2); y1 = Math.min(y1, p.y - NODE_H / 2); y2 = Math.max(y2, p.y + NODE_H / 2); }
    return { x1, y1, x2, y2 };
  };
  const membersOf = (spec: GraphSpec, gid: string) => spec.nodes.filter((n) => { for (let p: string | null = n.group; p; p = spec.groups.find((x) => x.id === p)!.parent) if (p === gid) return true; return false; }).map((n) => n.id);
  const run = async (spec: GraphSpec, aspect = 0) => forceLayout(cytoscape, spec, modelOf(spec), new Map(spec.nodes.map((n) => [n.id, { x: n.x, y: n.y }])), aspect);
  const apart = (a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }) => a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1;
  const services = () => sample("Calls between");

  test("the service sample: no two top-level groups' boxes meet, and no box holds a node of another group or none", async () => {
    const spec = services(); expect(spec.layout).toBe("force");
    const pos = await run(spec);
    const tops = spec.groups.filter((x) => !x.parent);
    expect(tops.length).toBe(8);
    const boxes = tops.map((x) => ({ ids: new Set(membersOf(spec, x.id)), b: boxOf(spec, pos, membersOf(spec, x.id)) }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(apart(boxes[i].b, boxes[j].b)).toBe(true);
    for (const { ids, b } of boxes) for (const n of spec.nodes) if (!ids.has(n.id)) { const p = pos.get(n.id)!; expect(p.x > b.x1 && p.x < b.x2 && p.y > b.y1 && p.y < b.y2).toBe(false); }
  });
  test("the same input gives the same drawing", async () => {
    const spec = services();
    const a = await run(spec), b = await run(spec);
    for (const n of spec.nodes) expect(b.get(n.id)).toEqual(a.get(n.id));
  });
  test("nodes in no group, and a group nested in a group, are placed too, and no two nodes sit on each other's middle", async () => {
    const spec = g(`group a\ngroup a2 in a\nnode a1 in a\nnode a3 in a2\nnode a4 in a2\ngroup b\nnode b1 in b\nnode b2 in b\nnode x\nnode y\na1 -> a3\na3 -> a4\nb1 -> b2\nx -> a1\ny -> b1\nx -> y`, { layout: "force" });
    expect(spec.errors).toEqual([]);
    const pos = await run(spec);
    expect(pos.size).toBe(7);
    for (const p of pos.values()) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
    const ids = [...pos.keys()];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const p = pos.get(ids[i])!, q = pos.get(ids[j])!; expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(10); }
    expect(apart(boxOf(spec, pos, ["a1", "a3", "a4"]), boxOf(spec, pos, ["b1", "b2"]))).toBe(true);
  });
  test("one run over many nodes gets fewer iterations: each one compares every pair", () => {
    expect(forceRunIterations(250, 100)).toBe(250);
    expect(forceRunIterations(85, 2000)).toBe(7);
    expect(forceRunIterations(85, 100000)).toBe(FORCE_RUN_MIN);
    for (const k of [1, 10, 300, 1000, 2000]) expect(forceRunIterations(85, k) * k * k).toBeLessThanOrEqual(Math.max(30_000_000, FORCE_RUN_MIN * k * k));
  });
  test("on a stage taller than wide, the blocks turn to fill it, and the group boxes still never meet", async () => {
    const spec = services();
    const ext = (pos: Map<string, { x: number; y: number }>) => { const ps = [...pos.values()]; return { w: Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)), h: Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)) }; };
    const wide = ext(await run(spec));
    const pos = await run(spec, 2);
    const tall = ext(pos);
    if (wide.w > wide.h * 1.15) expect(tall.h).toBeGreaterThan(tall.w);
    else expect(tall).toEqual(wide);
    const tops = spec.groups.filter((x) => !x.parent).map((x) => boxOf(spec, pos, membersOf(spec, x.id)));
    for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) expect(apart(tops[i], tops[j])).toBe(true);
  });
});

// ------------------------------------------------------------------ linear time: double the input, the work at most about doubles (counted, never timed)
describe("graph: doubling the input at most about doubles the work charged", () => {
  const shapes: Record<string, (n: number) => string> = {
    chain: (n) => Array.from({ length: n - 1 }, (_, i) => `n${i} -> n${i + 1}`).join("\n"),
    star: (n) => Array.from({ length: n - 1 }, (_, i) => `hub -> n${i}`).join("\n"),
    groups: (n) => [...Array.from({ length: n / 10 }, (_, k) => `group g${k}\nnode g${k}n{0..9} in g${k}`), ...Array.from({ length: n }, (_, i) => `g${Math.floor(i / 10)}n${i % 10} -> g${Math.floor(((i * 7 + 3) % n) / 10)}n${(i * 7 + 3) % 10}`)].join("\n"),
    nested: (n) => [...Array.from({ length: 6 }, (_, d) => `group d${d}${d ? ` in d${d - 1}` : ""}`), ...Array.from({ length: n }, (_, i) => `node m${i} in d${i % 6}`), ...Array.from({ length: n - 1 }, (_, i) => `m${i} -> m${(i * 13 + 1) % n}`)].join("\n"),
    long: (n) => `node a "${"x".repeat(60)}"\n` + Array.from({ length: n }, (_, i) => `node l${i} note="${"y".repeat(50)}"`).join("\n"),
    "one long id": (n) => `node ${"a".repeat(n * 20)}\nnode b1${"c".repeat(n * 20)}`,
  };
  const centreOf = (k: string, n: number) => (k === "chain" ? "n0" : k === "star" ? "hub" : k === "groups" ? "g0n0" : k === "nested" ? "m0" : k === "long" ? "a" : "b1" + "c".repeat(n * 20));
  const charged = (body: string, attrs: Record<string, string>) => {
    const b = big();
    const s = parseGraph(body, 1, attrs, 0, { ...LIMITS, graphNodes: 1e6, graphEdges: 1e6 }, b);
    expect(s.errors).toEqual([]);
    return b.steps + b.values + b.chars;
  };
  for (const [k, f] of Object.entries(shapes)) for (const layout of ["layers", "force", "radial"]) {
    test(`${k}, ${layout}: three sizes, ratio between 1.5 and 2.3`, () => {
      const attrs = (n: number): Record<string, string> => (layout === "radial" ? { layout, centre: centreOf(k, n) } : { layout });
      for (const n of [100, 200, 400]) {
        const r = charged(f(2 * n), attrs(2 * n)) / charged(f(n), attrs(n));
        expect(r).toBeGreaterThan(1.5);
        expect(r).toBeLessThan(2.3);
      }
    });
  }
  test("a long single line is read once (no scan per start)", () => {
    const one = (n: number) => { const b = big(); parseGraph(`node ${"x".repeat(n)}`, 1, {}, 0, LIMITS, b); return b.steps; };
    expect(one(40_000) / one(20_000)).toBeLessThan(2.2);
    const many = (n: number) => { const b = big(); parseGraph("a ".repeat(n), 1, {}, 0, LIMITS, b); return b.steps; };
    expect(many(40_000) / many(20_000)).toBeLessThan(2.2);
  });
});

describe("graph: fixtures", () => {
  const dir = join(HERE, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every graph drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "graph").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, quickly, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const t0 = performance.now();
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThanOrEqual(6);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
        // a refused graph stays in the page with what was read before the refusal, never more than the caps allow
        for (const b of doc.blocks.filter((x) => x.type === "graph")) {
          const d = b.data as GraphSpec;
          expect(d.nodes.length).toBeLessThanOrEqual(limits.graphNodes);
          expect(d.edges.length).toBeLessThanOrEqual(limits.graphEdges);
          expect(d.errors.length).toBeGreaterThan(0);
        }
        expect(performance.now() - t0).toBeLessThan(2000);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the graph part");
      expect(() => parseGraph(text, 1, {}, 0, LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(graph.name).toBe("graph");
  expect(graph.steps).toBe(false);
  expect(graph.dependencies).toEqual(["cytoscape"]);
});

describe("graph: a static form shows the same facts as the live one", () => {
  test("the still sample is the live sign-in sample: the same nodes and edges, the counts on the page agree", () => {
    const live = sample("What touches the sign-in"), still = sample("The same sign-in graph");
    expect(still.nodes.map((n) => n.id)).toEqual(live.nodes.map((n) => n.id));
    expect(still.edges.length).toBe(live.edges.length);
    const out = html(still, "true");
    expect(out).toContain(`${live.nodes.length} nodes`);
    expect(out).toContain(`${live.edges.length} edges`);
  });
  test("every node is counted in the still picture: the boxes' counts and the loose nodes add up to the node total", () => {
    for (const title of ["What touches the sign-in", "The same sign-in graph", "A shop's packages", "Calls between the services"]) {
      const s = sample(title);
      const total = s.still!.items.reduce((n, it) => n + it.count, 0);
      expect(total).toBe(s.nodes.length);
    }
  });
});
