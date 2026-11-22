// The evaluation budget's edges (0.6.1): names, keys, error text, YAML anchors, everything a chart returns, check() on
// normal pages, and how work grows with the input. Counts and sizes only, never time.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { parse, check, setYamlParser, LIMITS } from "../src/index";
import { Budget, partLimitsOf, pageLimitsOf } from "../src/core/budget";
import { parseDefs, EXPR_CAPS, ExprError, evaluate, parse as parseExpr } from "../src/core/expr";
import { CHART_CAPS } from "../src/core/chart";
import { yamlGuard, YamlTooBig } from "../src/host/yaml";

// these tests reach the evaluation guards through long YAML texts: the YAML size caps (0.6.2, test/yaml-size.test.ts)
// are raised while they run, so each test still meets the guard it is about
const YAML_CAPS = { maxYamlChars: LIMITS.maxYamlChars, maxPageYamlChars: LIMITS.maxPageYamlChars, maxYamlNodes: LIMITS.maxYamlNodes, maxPageYamlNodes: LIMITS.maxPageYamlNodes };
beforeAll(() => { Object.assign(LIMITS, { maxYamlChars: 1e8, maxPageYamlChars: 1e9, maxYamlNodes: 1e8, maxPageYamlNodes: 1e9 }); });
afterAll(() => { Object.assign(LIMITS, YAML_CAPS); });

const F = "```";
const q = (v: string) => JSON.stringify(v);
const chart = (body: string[]) => [`${F}chart`, ...body, F, ""].join("\n");
const simple = (lets: string[], extra: string[] = []) => chart(["kind: line", ...extra, ...(lets.length ? ["let:", ...lets] : []), "x: [1]", "series:", "  - name: y", "    data: [1]"]);
const first = (d: ReturnType<typeof parse>) => d.blocks.find((b) => b.type !== "markdown") as any;
const msgOf = (b: any): string => String(b?.initial?.error ?? b?.message ?? "");
const PART = partLimitsOf(), PAGE = pageLimitsOf();

// the page budgets parse() and check() make, to read their counters
const pages: Budget[] = [];
const realPart = Budget.prototype.part;
Budget.prototype.part = function (this: Budget, ...a: Parameters<Budget["part"]>) { if (!this.parent && !pages.includes(this)) pages.push(this); return realPart.apply(this, a); };
afterEach(() => { pages.length = 0; setYamlParser(null); });
const work = (text: string) => { pages.length = 0; parse(text); return pages.reduce((a, b) => a + b.steps + b.values + b.chars, 0); };

describe("names, keys and parameters", () => {
  test("a long key is refused in one pass (no backtracking regex), with a short message", () => {
    for (const k of [`a( ${" ".repeat(40000)}!`, "k".repeat(40000), `f(${Array.from({ length: 8000 }, (_, i) => "p" + i).join(",")})`]) {
      const d = parse(simple([`  ${q(k)}: "1"`]));
      expect(msgOf(first(d))).toMatch(/is not a name or a name\(params\)/);
      expect(msgOf(first(d)).length).toBeLessThan(200);
    }
  });
  test("names are at most 64 characters, functions take at most 16 parameters", () => {
    expect(() => parseExpr("a".repeat(65))).toThrow(/longer than 64 characters/);
    const p = parseDefs({ [`f(${Array.from({ length: 17 }, (_, i) => "p" + i).join(", ")})`]: "1", [`${"n".repeat(65)}`]: "1", "g( a , b )": "a + b" }, []);
    expect(p.errors.some((e) => /at most 16 parameters/.test(e))).toBe(true);
    expect(p.errors.some((e) => /at most 64 characters/.test(e))).toBe(true);
    expect(p.defs.fns.g.params).toEqual(["a", "b"]);
  });
  test("key forms read exactly as before", () => {
    const p = parseDefs({ a: "1", "b()": "2", "c( )": "3", "d(x)": "x", "e( x ,y )": "x", "f (x)": "1", "g(x,)": "1", "h(x y)": "1", "i(x) ": "1", "1j": "1" }, []);
    expect(p.defs.order).toEqual(["a"]);
    expect(Object.keys(p.defs.fns)).toEqual(["b", "c", "d", "e"]);
    expect(p.defs.fns.e.params).toEqual(["x", "y"]);
    expect(p.errors.filter((e) => /is not a name/.test(e))).toHaveLength(5);
  });
});

describe("error text is output: it is capped", () => {
  test("many unknown names in a long-named function", () => {
    const body = `[${Array.from({ length: 4000 }, (_, i) => "n" + i).join(",")}]`;
    const d = parse(simple([`  ${q(`f${"x".repeat(63)}(p)`)}: ${q(body)}`]));
    const m = msgOf(first(d));
    expect(m).toMatch(/unknown name/);
    expect(m).toMatch(/and \d+ more/);
    expect(m.length).toBeLessThanOrEqual(CHART_CAPS.message);
  });
  test("many cycles, one long path", () => {
    const n = 2000;
    const d = parse(simple(Array.from({ length: n }, (_, i) => `  d${i}: ${q(i + 1 < n ? `d${i + 1} + d0` : "d0")}`)));
    const m = msgOf(first(d));
    expect(m).toMatch(/refers to itself/);
    expect(m.length).toBeLessThanOrEqual(CHART_CAPS.message);
    const probs = check(d);
    expect(probs.reduce((a, p) => a + p.message.length, 0)).toBeLessThan(10 * CHART_CAPS.message);
  });
  test("a long-named root that many definitions point back to", () => {
    const k = 1000, R = "r" + "x".repeat(63);
    const vs = Array.from({ length: k }, (_, i) => "v" + i);
    const d = parse(simple([`  ${R}: S`, `  S: ${q(`[${vs.join(",")}]`)}`, ...vs.map((v) => `  ${v}: S`)]));
    expect(msgOf(first(d)).length).toBeLessThanOrEqual(CHART_CAPS.message);
    expect(check(d).reduce((a, p) => a + p.message.length, 0)).toBeLessThan(10 * CHART_CAPS.message);
  });
});

describe("everything a chart returns is sized", () => {
  test("definitions that only name a big list (vars are written out too)", () => {
    const d = parse(simple(["  a: range(1, 10000)", ...Array.from({ length: 200 }, (_, i) => `  b${i}: a`)]));
    expect(first(d).type).toBe("error");
    expect(msgOf(first(d))).toMatch(/too big/);
    expect(JSON.stringify(d).length).toBeLessThan(20000);
  });
  test("comparing long control strings pays for the characters compared", () => {
    const long = "q".repeat(100000);
    const d = parse(simple([`  "f(k)": "k <= 0 ? 1 : (s == t ? f(k - 1) : 0)"`, ...Array.from({ length: 20 }, (_, i) => `  r${i}: f(45)`)],
      ["controls:", `  - {select: s, value: "${long}", options: [1, 2]}`, `  - {select: t, value: "${long}", options: [1, 2]}`]));
    expect(first(d).type).toBe("error");
    expect(msgOf(first(d))).toMatch(/too much work/);
    const b = new Budget({ steps: 1e9, values: 1e9, chars: 1e9 });
    evaluate(parseExpr("s == t", b), { vars: { s: long, t: long } }, b);
    expect(b.steps).toBeGreaterThan(100000 / 32);
  });
  test("a chart's names, tones and kinds count as what they stand for", () => {
    const rows = ['a0: &n0 ["xxxxxxxxxx", "xxxxxxxxxx"]', ...Array.from({ length: 8 }, (_, i) => `a${i + 1}: &n${i + 1} [*n${i}, *n${i}, *n${i}, *n${i}]`)];
    for (const where of ["  - name: *n8\n    data: [1]", "  - name: y\n    tone: *n8\n    data: [1]", "  - name: y\n    kind: *n8\n    data: [1]"]) {
      const d = parse(chart(["kind: line", ...rows, "x: [1]", "series:", where]));
      expect(first(d).type).toBe("error");
      expect(JSON.stringify(d).length).toBeLessThan(20000);
    }
  });
});

describe("YAML anchors: sized as a graph, whatever the anchor's name", () => {
  const NAMES = ["a", "é", ".x", "$x", "日本", "a-b", "9", "😀", "x:y", "a/b", "_"];
  const bomb = (nm: string, L = 9) => { const r = [`a0: &${nm}0 ["${"z".repeat(20)}", "${"z".repeat(20)}"]`]; for (let i = 1; i <= L; i++) r.push(`a${i}: &${nm}${i} [*${nm}${i - 1}, *${nm}${i - 1}, *${nm}${i - 1}, *${nm}${i - 1}]`); return { rows: r, top: `*${nm}${L}` }; };
  test("in front matter: ignored with a problem, the page still reads", () => {
    for (const nm of NAMES) {
      const { rows, top } = bomb(nm);
      for (const fm of [`title: ${top}`, `marks:\n  m: { label: ${top}, colour: good }`]) {
        const d = parse(`---\n${rows.join("\n")}\n${fm}\n---\n\ntext\n`);
        expect(JSON.stringify(d).length).toBeLessThan(20000);
        expect(d.problems.some((p) => /front matter/.test(p.message))).toBe(true);
        expect(d.blocks.some((b) => b.type === "markdown")).toBe(true);
      }
    }
  });
  test("in every chart key: the chart is refused before anything reads it", () => {
    for (const nm of NAMES) {
      const { rows, top } = bomb(nm);
      const places = [
        ["x: " + top, "series:", "  - name: y", "    data: [1]"],
        ["x: [1]", "series:", `  - name: ${top}`, "    data: [1]"],
        ["x: [1]", "series:", "  - name: y", `    data: ${top}`],
        ["x: [1]", "series:", "  - name: y", `    tone: ${top}`, "    data: [1]"],
        ["x: [1]", `controls:`, `  - select: s`, `    options: ${top}`, "series:", "  - name: y", "    data: [1]"],
        ["x: [1]", `let:`, `  a: ${top}`, "series:", "  - name: y", "    data: [1]"],
        ["x: [1]", `junk: ${top}`, "series:", "  - name: y", "    data: [1]"],
        ["x: [1]", `title: ${top}`, "series:", "  - name: y", "    data: [1]"],
      ];
      for (const p of places) {
        const d = parse(chart(["kind: line", "hold:", ...rows.map((r) => "  " + r), ...p]));
        expect(first(d).type).toBe("error");
        expect(msgOf(first(d))).toMatch(/anchors and aliases/); // the old count of anchors may refuse it first
        expect(JSON.stringify(d).length).toBeLessThan(20000);
        expect(() => check(d)).not.toThrow();
      }
    }
  });
  test("small aliases still work as before", () => {
    const d = parse(chart(["kind: bar", "x: &x [a, b]", "series:", "  - name: one", "    data: &d [1, 2]", "  - name: two", "    data: *d"]));
    expect(first(d).type).toBe("chart");
    expect(first(d).initial.series[1].data).toEqual([1, 2]);
  });
  test("a parser given with setYamlParser is guarded the same way", () => {
    let used = 0;
    setYamlParser((t) => { used++; return (globalThis as any).Bun.YAML.parse(t); });
    const { rows, top } = bomb("é");
    const d = parse(chart(["kind: line", ...rows, "x: [1]", "series:", `  - name: ${top}`, "    data: [1]"]));
    // refused before the parser runs (too many aliases): see budget-yaml.test.ts for the parser's own runs
    expect(used).toBe(0);
    expect(first(d).type).toBe("error");
  });
  test("the guard itself: a graph, a self-reference, deep nesting", () => {
    const a: any[] = ["x".repeat(10)]; let v: any = a; for (let i = 0; i < 30; i++) v = [v, v];
    expect(() => yamlGuard(v)).toThrow(YamlTooBig);
    const self: any[] = []; self.push(self);
    expect(() => yamlGuard(self)).toThrow(/holds itself/);
    let deep: any = 1; for (let i = 0; i < 100; i++) deep = [deep];
    expect(() => yamlGuard(deep)).toThrow(/nests more than/);
    expect(() => yamlGuard({ a: [1, 2, 3], b: "x" })).not.toThrow();
  });
});

describe("check() on normal pages", () => {
  const normal = (i: number, N = 1000) => `## Chart ${i}\n\n${F}chart\nkind: line\ncontrols:\n  - slider: k\n    min: 1\n    max: 10\n  - select: mode\n    options: [a, b, c, d]\nlet:\n  xs: "range(1, ${N})"\n  grow: "round(sqrt(xs) * k, 2)"\n  lin: "if(mode == 'a', xs * k / 10, xs / 10)"\nx: xs\nseries:\n  - name: grow\n    data: grow\n  - name: lin\n    data: lin\n${F}\n`;
  test("3, 10 and 20 ordinary computed charts: all drawn, check() reports no error and no warning", () => {
    for (const n of [3, 10, 20]) {
      const d = parse("# Page\n\n" + Array.from({ length: n }, (_, i) => normal(i + 1)).join("\n"));
      expect(d.blocks.filter((b) => b.type === "chart")).toHaveLength(n);
      expect(check(d).filter((p) => /control value|expressions/.test(p.message))).toEqual([]);
    }
  });
  test("check() of a page over maxInputBytes returns its problems (no TypeError)", () => {
    const big = "# t\n\n" + "word ".repeat(210_000);
    expect(check(big).some((p) => /bytes/.test(p.message))).toBe(true);
    expect(check(parse(big)).length).toBeGreaterThan(0);
  });
});

describe("output and growth", () => {
  // a stated bound: a Document's JSON is at most 8 times its input plus what one part's caps allow, written out
  const bound = (src: string) => 8 * src.length + 16 * PART.values + 4 * PART.chars;
  const hostile: Record<string, string> = {
    aliasVars: simple(["  a: range(1, 10000)", ...Array.from({ length: 100 }, (_, i) => `  b${i}: a`)]),
    errorText: simple([`  ${q("k".repeat(16000))}: ${q(`[${Array.from({ length: 4000 }, (_, i) => "v" + i).join(",")}]`)}`]),
    cycles: simple(Array.from({ length: 3000 }, (_, i) => `  d${i}: ${q(i + 1 < 3000 ? `d${i + 1} + d0` : "d0")}`)),
    anchors: chart(["kind: line", 'a0: &é0 ["zzzzzzzzzz"]', ...Array.from({ length: 10 }, (_, i) => `a${i + 1}: &é${i + 1} [*é${i}, *é${i}, *é${i}, *é${i}]`), "x: [1]", "series:", "  - name: *é10", "    data: [1]"]),
    frontMatter: `---\na0: &é0 ["zzzzzzzzzz"]\n${Array.from({ length: 10 }, (_, i) => `a${i + 1}: &é${i + 1} [*é${i}, *é${i}, *é${i}, *é${i}]`).join("\n")}\ntitle: *é10\n---\n\ntext\n`,
    fillOfFill: simple(['  big: "fill(fill(fill(1, 1000), 1000), 1000) + 1"']),
    blankLines: simple(['  a: "1"', ...Array(20000).fill("")]),
  };
  for (const [name, src] of Object.entries(hostile)) {
    test(`${name}: the Document stays within ${"8 × input + the caps"}`, () => {
      const d = parse(src);
      const n = JSON.stringify(d).length;
      expect(n).toBeLessThanOrEqual(bound(src));
      expect(JSON.stringify(check(d)).length).toBeLessThanOrEqual(bound(src));
    });
  }
  test("doubling the input at most about doubles the counted work", () => {
    const shapes: Record<string, (n: number) => string> = {
      chain: (n) => simple(Array.from({ length: n }, (_, i) => `  d${i}: ${i ? `d${i - 1} + 1` : "1"}`)),
      cycles: (n) => simple(Array.from({ length: n }, (_, i) => `  d${i}: ${q(i + 1 < n ? `d${i + 1} + d0` : "d0")}`)),
      unknown: (n) => simple([`  "f(p)": ${q(`[${Array.from({ length: n }, (_, i) => "n" + i).join(",")}]`)}`]),
      functions: (n) => simple([...Array.from({ length: n }, (_, i) => `  "f${i}(a, b, c)": "a + b + c + ${i}"`), `  z: ${q(Array.from({ length: Math.min(n, 150) }, (_, i) => `f${i}(1, 2, 3)`).join(" + "))}`]),
      charts: (n) => Array.from({ length: Math.max(1, n / 100) }, () => simple(['  a: "range(1, 1000) * 2"'])).join("\n"),
      strings: (n) => simple([`  s: ${q(`'${"x".repeat(n)}' + 'y'`)}`]),
    };
    for (const [name, mk] of Object.entries(shapes)) {
      const w1 = work(mk(400)), w2 = work(mk(800));
      expect({ name, ratio: w2 / w1 <= 2.5 }).toEqual({ name, ratio: true });
    }
  });
});

describe("a seeded random chart (YAML, keys, names, anchors) stays bounded", () => {
  let seed = 61;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const name = () => ["a", "b", "f", "g", "n".repeat(1 + rnd(70)), "é", "x1"][rnd(7)];
  const key = () => { const n = name(); return rnd(3) ? n : `${n}(${Array.from({ length: rnd(20) }, () => name()).join(rnd(2) ? "," : " , ")})`; };
  const expr = (d: number): string => (d <= 0 ? [String(rnd(100)), name(), "range(1, 3000)", `'${"s".repeat(rnd(50))}'`][rnd(4)] : [`${expr(d - 1)} + ${expr(d - 1)}`, `fill(${expr(d - 1)}, ${rnd(5000)})`, `[${expr(d - 1)}, ${expr(d - 1)}]`, `${name()}(${expr(d - 1)})`, `${expr(d - 1)} == ${expr(d - 1)}`][rnd(5)]);
  test("200 random charts: parse() and check() never throw; the Document stays within the bound; counters stay under the caps", () => {
    for (let k = 0; k < 200; k++) {
      const anchors = rnd(2) ? ["hold:", `  a0: &${["é", ".x", "a", "$"][rnd(4)]}0 [1, 2]`] : [];
      const lets = Array.from({ length: 1 + rnd(8) }, () => `  ${q(key())}: ${q(expr(rnd(4)))}`);
      const src = chart(["kind: line", ...anchors, "let:", ...lets, `x: ${rnd(2) ? "[1]" : q(expr(2))}`, "series:", `  - name: ${q(name())}`, `    data: ${rnd(2) ? "[1]" : q(expr(2))}`]);
      pages.length = 0;
      const d = parse(src);
      // work stops at the cap: a budget that is not spent is under it (a spent one stopped at the charge that crossed it)
      for (const b of pages) if (!b.spent) { expect(b.steps).toBeLessThanOrEqual(PAGE.steps); expect(b.values).toBeLessThanOrEqual(PAGE.values); expect(b.chars).toBeLessThanOrEqual(PAGE.chars); }
      expect(JSON.stringify(d).length).toBeLessThanOrEqual(8 * src.length + 16 * PART.values + 4 * PART.chars);
      expect(() => check(d)).not.toThrow();
      expect(msgOf(first(d)).length).toBeLessThanOrEqual(CHART_CAPS.message);
    }
  });
});

describe("lines that made regular expressions backtrack", () => {
  test("a long heading line inside :::tabs, and a long run of blank lines in a chart, read in one pass", () => {
    const tabs = parse(":::tabs\n## a" + " ".repeat(400_000) + "b\n\ntext\n:::\n");
    expect(tabs.blocks[0].type).toBe("tabs");
    const blanks = parse(simple(['  a: "1"', ...Array(400_000).fill("")]));
    expect(first(blanks).type).toBe("chart");
  });
  test("a tab heading reads exactly as the old pattern did", () => {
    const d = parse(":::tabs\n## One #\n\nfirst\n\n## C#\n\nsecond\n\n##   Three  ##  \n\nthird\n:::\n");
    expect((d.blocks[0] as any).items.map((it: any) => it.title)).toEqual(["One", "C", "Three"]);
  });
});

test("an expression error is an ExprError, never a RangeError", () => { expect(() => parseExpr(`${"(".repeat(10000)}1`)).toThrow(ExprError); void EXPR_CAPS; });
