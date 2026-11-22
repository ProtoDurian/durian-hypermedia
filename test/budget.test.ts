// The evaluation budget (0.6.1): one deterministic budget of steps, value slots and characters per parse() call, with
// a cap per part, charged before the work. These tests count work; they never time it.
import { afterEach, describe, expect, test } from "bun:test";
import { parse, check, llmView, LIMITS } from "../src/index";
import { Budget, BudgetError, partLimitsOf, pageLimitsOf, withBudget, pageBudget } from "../src/core/budget";
import { evaluate, parse as parseExpr, parseDefs, evalDefs, fillHoles, sizeOf, ExprError, EXPR_CAPS, type Val } from "../src/core/expr";
import { evalChart } from "../src/core/chart";

const F = "```";
// a chart; let entries are quoted for YAML
const chart = (lets: Record<string, string>, x = "[1]", data = "[1]", extra: string[] = []) =>
  [`${F}chart`, "kind: line", ...extra, ...(Object.keys(lets).length ? ["let:", ...Object.entries(lets).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)] : []), `x: ${x}`, "series:", "  - name: y", `    data: ${data}`, F].join("\n");
const errors = (d: ReturnType<typeof parse>) => d.blocks.filter((b) => b.type === "error") as { message: string; part: string | null }[];
const PART = partLimitsOf(), PAGE = pageLimitsOf();

// every page budget parse() and check() make, to read its counters afterwards
const made: Budget[] = [];
const realPart = Budget.prototype.part;
Budget.prototype.part = function (this: Budget) { if (!this.parent && !made.includes(this)) made.push(this); return realPart.call(this); };
afterEach(() => { made.length = 0; });
const underCaps = (b: Budget, L = b.limits) => {
  // a budget never lets work run past a cap: the charge that would cross it throws first, so the work done stays under
  const done = b.spent ? 0 : 1;
  if (done) { expect(b.steps).toBeLessThanOrEqual(L.steps); expect(b.values).toBeLessThanOrEqual(L.values); expect(b.chars).toBeLessThanOrEqual(L.chars); }
};
const run = (src: string, vars: Record<string, Val> = {}, b = new Budget(PART)): { v?: Val; e?: Error; b: Budget } => {
  try { return { v: evaluate(parseExpr(src, b), { vars }, b), b }; } catch (e) { return { e: e as Error, b }; }
};

describe("one budget per parse() call", () => {
  test("lists of lists pay for every copy they stand for (fill of fill)", () => {
    const d = parse(chart({ big: "fill(fill(fill(1, 300), 300), 300) + 1" }));
    expect(errors(d)).toHaveLength(1);
    expect(errors(d)[0].message).toMatch(/too many values/);
    expect(d.problems.some((p) => p.level === "error" && /^chart: /.test(p.message))).toBe(true);
    expect(made[0].values).toBeLessThan(PART.values * 2);
  });
  test("user functions calling user functions are counted inside every call", () => {
    const lets: Record<string, string> = { a: "range(1, 10000)", "h0(x)": "x + x" };
    for (let i = 1; i <= 14; i++) lets[`h${i}(x)`] = `h${i - 1}(x) + h${i - 1}(x)`;
    lets.b = "h14(a)";
    const d = parse(chart(lets, "a", "b"));
    expect(errors(d)).toHaveLength(1);
    expect(made[0].steps + made[0].values).toBeLessThan((PART.steps + PART.values) * 2);
  });
  test("many definitions share one part budget (no fresh budget per definition)", () => {
    const lets: Record<string, string> = { a: "range(1, 5000)" };
    for (let i = 0; i < 20; i++) lets[`d${i}`] = "a * 2";
    const d = parse(chart(lets));
    expect(errors(d)[0]?.message).toMatch(/limit for one part/);
  });
  test("x and every series draw from the same part budget", () => {
    const heavy = `"${Array(8).fill("range(1, 4000)").join(" + ")}"`;
    const d = parse([`${F}chart`, "kind: line", `x: ${heavy}`, "series:", ...[1, 2].map((i) => `  - name: s${i}\n    data: ${heavy}`), F].join("\n"));
    expect(errors(d)[0]?.message).toMatch(/limit for one part/);
  });
  test("many charts share the page budget; once it is spent no later chart restarts it", () => {
    const heavy = chart({ a: "range(1, 4000)", b: "a + a + a + a + a + a + a + a + a + a" });
    const small = chart({}, "[1, 2]", "[1, 2]");
    const d = parse([...Array(12).fill(heavy), small].join("\n\n"));
    const errs = errors(d);
    expect(errs.some((e) => /whole page/.test(e.message))).toBe(true);
    expect(d.blocks.at(-1)!.type).toBe("error"); // even the small chart after the spend
    expect(d.blocks.filter((b) => b.type === "chart").length).toBeLessThan(12);
    expect(made).toHaveLength(1);
    expect(made[0].values).toBeLessThanOrEqual(PAGE.values + PART.values);
    // the rest of the page still draws
    expect(parse("# Title\n\n" + heavy + "\n\nAfter.\n").blocks.some((b) => b.type === "markdown")).toBe(true);
  });
  test("a page that spends its budget still shows its text and other parts", () => {
    const d = parse(`# Title\n\n${chart({ big: "fill(fill(1, 10000), 10000)" })}\n\n${F}terminal\n$ ls\n${F}\n\nThe end.\n`);
    expect(d.blocks.map((b) => b.type)).toEqual(["markdown", "error", "terminal", "markdown"]);
  });
  test("a shared list that later expands is paid for when it is shared (list literal)", () => {
    const d = parse(chart({ a: "range(1, 9000)", b: "[a, a, a, a, a, a, a, a, a, a]" }));
    expect(errors(d)[0]?.message).toMatch(/too many values/);
  });
  test("the LLM view of a chart reuses the page's evaluation (it never pays twice)", () => {
    const x = `"${Array(10).fill("range(1, 1000)").join(" + ")}"`;
    const one = [`${F}chart`, "kind: line", `x: ${x}`, "series:", "  - name: y", `    data: ${x}`, F].join("\n");
    // three charts take most of the page budget; paying again for their LLM tables would go over it
    const d = parse(Array(3).fill(one).join("\n\n"));
    expect(errors(d)).toHaveLength(0);
    expect(made[0].values).toBeGreaterThan(PAGE.values / 2);
    expect(made[0].values).toBeLessThan(PAGE.values);
    expect((d.llm.match(/\| x \| y \|/g) ?? []).length).toBe(3);
    expect(llmView(d)).toBe(d.llm);
  });
  test("YAML aliases in a chart's data count as what they stand for", () => {
    const row = Array.from({ length: 4000 }, (_, i) => i).join(", ");
    const y = ["kind: line", `a0: &a0 [${row}]`, "a1: &a1 [*a0, *a0, *a0, *a0]", "a2: &a2 [*a1, *a1, *a1, *a1]", "x: *a2", "series:", "  - name: y", "    data: [1, 2, 3, 4]"];
    const d = parse(`${F}chart\n${y.join("\n")}\n${F}\n`);
    expect(errors(d)[0]?.message).toMatch(/too big/);
  });
  test("a host can lower the caps through parse options; LIMITS stays as it is", () => {
    const text = chart({ a: "range(1, 100)" });
    expect(errors(parse(text))).toHaveLength(0);
    expect(errors(parse(text, { limits: { maxEvalValues: 50 } }))[0]?.message).toMatch(/limit for one part is 50 values/);
    expect(errors(parse(text + "\n\n" + text, { limits: { maxPageEvalValues: 150 } })).some((e) => /whole page is 150 values/.test(e.message))).toBe(true);
    expect(LIMITS.maxEvalValues).toBe(50_000);
  });
  test("check() evaluates every control case from one budget of its own", () => {
    const opts = Array.from({ length: 300 }, (_, i) => i + 1).join(", ");
    const text = [`${F}chart`, "kind: line", "controls:", `  - select: n`, `    options: [${opts}]`, "let:", '  a: "range(1, 1000) * n"', '  b: "a + a + a + a + a"', "x: [1]", "series:", "  - name: y", "    data: [1]", F].join("\n");
    const d = parse(text);
    expect(errors(d)).toHaveLength(0);
    made.length = 0;
    const probs = check(d);
    expect(probs.some((p) => /whole page/.test(p.message))).toBe(true);
    expect(made).toHaveLength(1);
    expect(made[0].values).toBeLessThanOrEqual(PAGE.values + PART.values);
  });
  test("a reader's control move gets a fresh budget of its own, never the page's", () => {
    const text = chart({ a: "range(1, n)", b: "a * 2" }, "a", "b", ["controls:", "  - slider: n", "    min: 2", "    max: 4000", "    value: 3"]);
    const spent = parse([text, ...Array(12).fill(chart({ a: "range(1, 4000)", b: "a + a + a + a + a + a + a + a + a + a" }))].join("\n\n"));
    expect(spent.blocks[0].type).toBe("chart");
    const spec = (spent.blocks[0] as any).chart;
    const r = evalChart(spec, { n: 4000 });
    expect(r.error).toBeUndefined();
    expect(r.x).toHaveLength(4000);
    // and a reader's move is capped too
    const heavy = evalChart({ ...spec, let: { a: "range(1, n)", b: "fill(a, 5000)" } }, { n: 4000 });
    expect(heavy.limit).toBe(true);
  });
  test("the page budget is per call: parse() inside withBudget keeps its own", () => {
    const outer = pageBudget();
    withBudget(outer, () => parse(chart({ a: "range(1, 1000)" })));
    expect(outer.values).toBe(0);
  });
});

describe("every path is charged", () => {
  test("range: non-finite and tiny steps are refused before any list is made", () => {
    for (const s of ["range(0, 1, 1e-300)", "range(0, 1/0)", "range(0/0, 5)", "range(0, 5, 0/0)", "range(-1e308, 1e308, 1e300)"]) {
      const r = run(s);
      expect(r.e).toBeInstanceOf(ExprError);
      expect(r.b.values).toBe(0);
    }
  });
  test("fill: nested, NaN and infinite counts", () => {
    expect(run("fill(1, 0/0)").e).toBeInstanceOf(ExprError);
    expect(run("fill(1, 1/0)").e).toBeInstanceOf(ExprError);
    expect(run("fill(fill(1, 10000), 10000)").e).toBeInstanceOf(BudgetError);
    expect(run("fill(1, -5)").v).toEqual([]);
    expect(run("fill(1, 2.7)").v).toEqual([1, 1]);
  });
  test("round and text digits never throw a RangeError", () => {
    expect(run("text(1.5, 1000)").e).toBeInstanceOf(ExprError);
    expect(run("text(1.5, -1)").e).toBeInstanceOf(ExprError);
    expect(run("text(1.25, 1)").v).toBe("1.3");
    expect(run("round(1.5, 1/0)").e).toBeInstanceOf(ExprError);
    expect(run("round(1.25, 1)").v).toBe(1.3);
  });
  test("min and max read a list without spreading it", () => {
    expect(run("max(range(1, 10000))").v).toBe(10000);
    expect(run("min(range(1, 10000))").v).toBe(1);
    expect(run("min(3, 1, 2)").v).toBe(1);
    expect(run("max(fill(1, 0))").v).toBe(-Infinity);
  });
  test("operators, unary ops, if and every built-in pay for each value they visit", () => {
    const b = new Budget({ steps: 1e9, values: 1e9, chars: 1e9 });
    const vars = { a: Array.from({ length: 1000 }, (_, i) => i) as Val };
    for (const [src, atLeast] of [["a + 1", 1000], ["-a", 1000], ["!a", 1000], ["if(a > 1, a, 0)", 2000], ["abs(a)", 1000], ["round(a, 1)", 1000], ["text(a)", 1000], ["cumsum(a)", 1000], ["sum(a)", 1000], ["max(a)", 1000], ["[a, a]", 2000]] as const) {
      const before = b.steps + b.values;
      run(src, vars, b);
      expect(b.steps + b.values - before).toBeGreaterThanOrEqual(atLeast);
    }
  });
  test("string growth is paid for before the text is made", () => {
    const lets: Record<string, string> = { s0: "'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'" };
    for (let i = 1; i <= 30; i++) lets[`s${i}`] = `s${i - 1} + s${i - 1}`;
    const d = parse(chart(lets));
    expect(errors(d)[0]?.message).toMatch(/too much text/);
    expect(run("fill('abc', 10000) + fill('abc', 10000)").e).toBeInstanceOf(BudgetError);
  });
  test("fillHoles pays for the holes and the joined text", () => {
    expect(fillHoles("n = {a + 1}", { a: 1 })).toBe("n = 2");
    expect(fillHoles("{a}", { a: [1, [2, 3]] as Val })).toBe("1, 2,3");
    expect(() => fillHoles("{fill(fill(1, 100), 1000)}", {}, new Budget(PART))).toThrow(BudgetError);
    expect(() => fillHoles("{constructor}", {})).toThrow(/unknown name/);
  });
  test("deep expressions are refused, never a stack overflow", () => {
    const cases = [`${"(".repeat(5000)}1${")".repeat(5000)}`, `${"-".repeat(5000)}1`, Array(20000).fill("1").join("+"), `1${"[0]".repeat(5000)}`, `${Array(3000).fill("1 ? 1 :").join(" ")} 1`, `${"[".repeat(5000)}${"]".repeat(5000)}`, `${Array(5000).fill("2").join("^")}`];
    for (const src of cases) {
      const r = run(src);
      expect(r.e).toBeInstanceOf(ExprError);
      expect(r.e!.message).toMatch(/nested too deeply/);
    }
    const d = parse(chart({ a: cases[0] }));
    expect(d.blocks[0].type).toBe("chart");
    expect((d.blocks[0] as any).initial.error).toMatch(/nested too deeply/);
  });
  test("deep evaluation and deep lists are refused", () => {
    const fns = { "f(n)": "n <= 0 ? 0 : 1 + f(n - 1)" };
    const p = parseDefs({ ...fns, a: "f(60)" }, []);
    expect(() => evalDefs(p.defs, {}, new Budget(PART))).toThrow(/call each other too deeply/);
    const q = parseDefs({ "w(x, n)": "n <= 0 ? x : w([x], n - 1)", a: "w(1, 40)" }, []);
    expect(() => evalDefs(q.defs, {}, new Budget(PART))).toThrow(/nested too deeply/);
  });
  test("a long chain of definitions is read without recursion", () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 50000; i++) entries[`d${i}`] = i ? `d${i - 1}` : "1";
    const b = new Budget({ steps: 1e9, values: 1e9, chars: 1e9 });
    const p = parseDefs(entries, [], b);
    expect(p.errors).toEqual([]);
    expect(p.defs.order[0]).toBe("d0");
    const cyc: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) cyc[`c${i}`] = `c${(i + 1) % 2000}`;
    const c = parseDefs(cyc, [], b);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0].length).toBeLessThan(200);
    expect(() => parseDefs(entries, [], new Budget(PART))).toThrow(BudgetError);
  });
  test("error messages never print a long value", () => {
    const r = run("s + 1 > 0", { s: "x".repeat(100000) });
    expect(r.e!.message.length).toBeLessThan(200);
    const d = parse(chart({}, "[1]", `[[1, 2, "${"y".repeat(40000)}"]]`).replace("kind: line", "kind: bubble"));
    expect((d.blocks[0] as any).initial.error).toMatch(/has size/);
    expect((d.blocks[0] as any).initial.error.length).toBeLessThan(300);
  });
  test("a name is only ever the author's own (no inherited object names)", () => {
    for (const n of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(run(n).e!.message).toMatch(/unknown name/);
      expect(run(`${n}(1)`).e!.message).toMatch(/unknown function/);
    }
    const p = parseDefs(JSON.parse('{"__proto__": "1"}'), []);
    expect(p.errors).toEqual([]);
    expect(evalDefs(p.defs, {}, new Budget(PART)).__proto__).toBe(1);
  });
  test("a reused value keeps its size; sizes count shared lists each time", () => {
    const b = new Budget({ steps: 1e9, values: 1e9, chars: 1e9 });
    const a = Array.from({ length: 10 }, () => [1, 2, 3]);
    expect(sizeOf(a, b)).toEqual({ n: 40, c: 0, d: 2 });
    const shared = [a, a, a];
    expect(sizeOf(shared, b).n).toBe(123);
  });
});

describe("a seeded random expression never runs past its budget", () => {
  // a tiny deterministic generator (the same expressions on every run)
  let seed = 20261122;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const leaf = () => [() => String(rnd(10000)), () => "a", () => "s", () => `range(1, ${1 + rnd(10000)})`, () => `'${"x".repeat(rnd(40))}'`, () => `fill(${String(rnd(3))}, ${rnd(10001)})`][rnd(6)]();
  const gen = (d: number): string => {
    if (d <= 0) return leaf();
    const g = () => gen(d - 1);
    switch (rnd(12)) {
      case 0: return `fill(${g()}, ${rnd(10001)})`;
      case 1: return `[${g()}, ${g()}, ${g()}]`;
      case 2: return `${g()} + ${g()}`;
      case 3: return `${g()} * ${g()}`;
      case 4: return `f(${g()})`;
      case 5: return `-(${g()})`;
      case 6: return `if(${g()}, ${g()}, ${g()})`;
      case 7: return `text(${g()}, ${rnd(20)})`;
      case 8: return `cumsum(${g()})`;
      case 9: return `(${g()}) == (${g()})`;
      case 10: return `${g()}[${rnd(5)}]`;
      default: return `round(${g()}, ${rnd(5)})`;
    }
  };
  test("2,000 expressions: only ExprError or BudgetError, counters under the caps, results no bigger than paid for", () => {
    const fns = { "f(x)": "x + x" };
    let over = 0, ok = 0;
    for (let k = 0; k < 2000; k++) {
      const src = gen(1 + rnd(5));
      const b = new Budget(PART);
      const p = parseDefs({ ...fns }, ["a", "s"], b);
      let v: Val | undefined;
      try { v = evaluate(parseExpr(src, b), { vars: { a: [1, 2, 3], s: "ab" }, fns: p.defs.fns }, b); ok++; }
      catch (e) {
        if (!(e instanceof ExprError) && !(e instanceof BudgetError)) throw new Error(`${src}: ${(e as Error).name}: ${(e as Error).message}`);
        if (e instanceof BudgetError) over++;
        continue;
      }
      underCaps(b);
      const z = sizeOf(v, new Budget({ steps: 1e9, values: 1e9, chars: 1e9 }));
      expect(z.n).toBeLessThanOrEqual(b.values + 3); // a name alone hands back its value unpaid (a = [1, 2, 3])
      expect(z.c).toBeLessThanOrEqual(b.chars + 2);
      expect(z.d).toBeLessThanOrEqual(EXPR_CAPS.nest);
    }
    expect(ok).toBeGreaterThan(100);
    expect(over).toBeGreaterThan(10);
  });
});
