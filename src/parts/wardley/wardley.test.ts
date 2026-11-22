// The wardley part: parse, LLM view, every refusal, its caps in both sets, the label placer, the doubling test (budget
// charges counted at n and 2n, never time), the hand scans against the regular expressions they replace, the fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import wardley, { hasBarePair, isDecimal, keyVals, needLine, parseWardley, wardleyLlm } from "./part";
import { layoutWardley } from "./layout";

const fence = (body: string, info = 'title="T"') => `# Page\n\n\`\`\`wardley ${info}\n${body}\n\`\`\`\n`;
const SRC = `anchor customer "Customer" visible=0.95 evolution=0.6\ncomponent cup "Cup of tea" visible=0.8 evolution=0.6\ncomponent tea "Tea" visible=0.6 evolution=0.8\ncomponent kettle "Kettle" visible=0.45 evolution=0.4\ncomponent power "Power" visible=0.1 evolution=0.85\ncustomer -> cup\ncup -> tea\ncup -> kettle\nkettle -> power\nnote "Kettles are a product now" visible=0.5 evolution=0.5\n@step Today the kettle is a product we buy.\nhighlight kettle\n@step A smart kettle moves it further to the right.\nevolve kettle 0.65 "smart kettle"`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const wm = (body: string, title = "", lim = LIMITS, budget?: Budget) => parseWardley(body, 1, title, lim, budget);
const errorsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);
const has = (e: { msg: string }[], re: RegExp) => expect(e.some((x) => re.test(x.msg))).toBe(true);
const one = `component a "A" visible=0.5 evolution=0.5\n`;

describe("wardley: parse and the LLM view", () => {
  test("a good map is a block with its data and no problems", () => {
    const doc = parse(fence(SRC, 'title="A tea shop"'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "wardley")!;
    expect(b).toBeDefined();
    if (b.type !== "wardley") throw new Error("not a wardley");
    expect(b.data.comps.length).toBe(5); expect(b.data.needs.length).toBe(4);
    expect(b.data.evolves[0]).toMatchObject({ id: "kettle", to: 0.65, label: "smart kettle" });
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("the LLM view is a table and lines, and the page's LLM view carries it", () => {
    const t = wardleyLlm(wm(SRC, "A tea shop"));
    expect(t).toMatch(/^Wardley map: A tea shop\. Evolution left to right: genesis, custom built, product, commodity; visibility top to bottom\./);
    expect(t).toContain("| Kettle | custom built (0.40) | 0.45 |");
    expect(t).toContain("| Customer (anchor) | product (0.60) | 0.95 |");
    expect(t).toContain("Cup of tea needs Tea, Kettle");
    expect(t).toContain('Kettle evolves to product (0.65) as "smart kettle"');
    expect(t).toContain("Note (product (0.50), visible 0.50): Kettles are a product now");
    expect(t).toMatch(/Steps:\n1\. Today the kettle is a product we buy\.\n2\. A smart kettle/);
    expect(parse(fence(SRC, 'title="A tea shop"'), { path: "p.dh.md" }).llm).toContain(t);
  });
  test("every kind of line", () => {
    const s = wm(`${one}component b "B" visible=0.4 evolution=genesis\na -> b\ninertia b\npipeline a from=0.4 to=0.7\ngroup g "Both": a, b\nhighlight a\nnote "x y" visible=0.2 evolution=0.2`);
    expect(s.errors).toEqual([]);
    expect(s.inertia).toEqual([{ id: "b", step: -1 }]);
    expect(s.pipelines).toEqual([{ id: "a", from: 0.4, to: 0.7, step: -1 }]);
    expect(s.groups[0]).toMatchObject({ id: "g", label: "Both", ids: ["a", "b"] });
    expect(s.highlights).toEqual([{ id: "a", step: -1 }]);
    const t = wardleyLlm(s);
    expect(t).toContain("B has inertia (resists change)"); expect(t).toContain("A is a pipeline from 0.40 to 0.70"); expect(t).toContain("Both: A, B");
  });
  test("a stage word is the middle of that stage; a quoted value works; a need may touch its arrow", () => {
    expect(wm(`component a "A" visible=0.5 evolution=product`).comps[0].e).toBe(0.625);
    expect(wm(`component a "A" visible=0.5 evolution=Custom-Built`).comps[0].e).toBe(0.375);
    expect(wm(`component a "A" visible="0.5" evolution=0.5`).errors).toEqual([]);
    expect(wm(`${one}component b "B" visible=0.4 evolution=0.5\na->b`).needs).toEqual([{ a: "a", b: "b", step: -1, line: 3 }]);
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(SRC) + "\n:::llm\nA tea shop map.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("A tea shop map.");
    expect(doc.llm).not.toContain("| component |");
  });
});

describe("wardley: every refusal names the line and the fix", () => {
  const two = one + `component b "B" visible=0.4 evolution=0.5\n`;
  const cases: [string, string, RegExp][] = [
    ["a value outside 0 to 1", `component a "A" visible=1.5 evolution=0.5`, /visible=1\.5 is outside 0 to 1/],
    ["a value with a sign", `component a "A" visible=-0.5 evolution=0.5`, /outside 0 to 1/],
    ["an evolution that is neither", `component a "A" visible=0.5 evolution=soon`, /evolution=soon is outside 0 to 1 \(or a stage word/],
    ["no visible", `component a "A" evolution=0.5`, /no visible=/],
    ["no evolution", `component a "A" visible=0.5`, /no evolution=/],
    ["an unknown key", `component a "A" visible=0.5 evolution=0.5 size=3`, /unknown key "size="/],
    ["the OWM pair", `component a "A" [0.4, 0.6]`, /visible=0\.6 evolution=0\.4/],
    ["a bad id", `component a$ "A" visible=0.5 evolution=0.5`, /"a\$" is not an id/],
    ["an id twice", one + one, /"a" is written twice/],
    ["a need on an unknown component", one + "a -> zz", /"zz", which is not a component/],
    ["a cycle of needs", two + `component c "C" visible=0.3 evolution=0.5\na -> b\nb -> c\nc -> a`, /round in a circle \(a -> b -> c -> a\)/],
    ["evolve of an unknown component", one + "evolve zz 0.7", /evolve names "zz"/],
    ["evolve with a bad value", one + "evolve a 2", /evolution=2 is outside/],
    ["inertia of an unknown component", one + "inertia zz", /inertia names "zz"/],
    ["highlight of an unknown component", one + "highlight zz", /highlight names "zz"/],
    ["a pipeline with no from", one + "pipeline a to=0.7", /a pipeline needs from=0\.4 to=0\.7/],
    ["a pipeline of an unknown component", one + "pipeline zz from=0.1 to=0.2", /pipeline names "zz"/],
    ["a note with no quotes", one + "note hello visible=0.5 evolution=0.5", /a note is: note "text"/],
    ["a note with no position", one + `note "hi"`, /a note needs visible= and evolution=/],
    ["a group of an unknown component", one + `group g "G": a, zz`, /group "g" names "zz"/],
    ["a line that is none of these", one + "what is this", /is not a Wardley line/],
    ["no component", `note "x" visible=0.5 evolution=0.5`, /has no component/],
    ["61 components", Array.from({ length: 61 }, (_, k) => `component c${k} "C" visible=0.5 evolution=0.5`).join("\n"), /more than 60 components/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.includes("wardley:") || m.includes("[part data]") === false)).toBe(true);
  });
  test("evolve backwards is a warning, not a refusal", () => {
    const s = wm(`component a "A" visible=0.5 evolution=0.6\n@step x\nhighlight a\n@step y\nevolve a 0.2`);
    expect(s.errors).toEqual([]);
    has(s.warnings, /goes backwards/);
    const probs = check(parse(fence("component a \"A\" visible=0.5 evolution=0.6\nevolve a 0.2"), { path: "p.dh.md" }));
    expect(probs.filter((p) => p.level === "warn").length).toBe(1);
  });
  test("an unknown attribute", () => {
    expect(errorsOf(fence(one, 'speed=3')).some((m) => /unknown attribute "speed"/.test(m))).toBe(true);
    expect(errorsOf(fence(one, 'title="T" static=1 #one')).length).toBe(0);
  });
});

describe("wardley: the label placer", () => {
  test("no label over another label or over a dot (checked with my own box maths)", () => {
    const w = wm(SRC), L = layoutWardley(w);
    const boxes = L.labels.map((l) => l.box);
    const dots = L.labels.map((l) => ({ l: l.x - 6, t: l.y - 6, r: l.x + 6, b: l.y + 6 }));
    const over = (a: any, b: any) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
    for (let i = 0; i < boxes.length; i++) { for (let j = i + 1; j < boxes.length; j++) expect(over(boxes[i], boxes[j])).toBe(false); dots.forEach((d, j) => { if (i !== j) expect(over(boxes[i], d)).toBe(false); }); }
  });
  test("an evolve gives the label a second place; a note is wrapped; the same map gives the same box", () => {
    const w = wm(SRC), L = layoutWardley(w);
    const k = w.comps.findIndex((c) => c.id === "kettle");
    expect(L.labels[k].evBox).toBeDefined(); expect(L.labels[k].evText).toBe("smart kettle");
    expect(L.notes[0].lines.length).toBeGreaterThan(0);
    expect(layoutWardley(w).h).toBe(L.h);
    expect(layoutWardley(w).labels.map((l) => l.tx)).toEqual(L.labels.map((l) => l.tx));
  });
  test("a layout of small input that does large work is refused by its budget", () => {
    const body = Array.from({ length: 55 }, (_, k) => `component c${k} "C${k}" visible=0.5 evolution=0.5`).join("\n");
    expect(() => layoutWardley(wm(body), new Budget({ steps: 500, values: 1e9, chars: 1e9 }, null, null, "the wardley part"))).toThrow(/the wardley part/);
  });
});

describe("wardley: caps in both sets", () => {
  const comps = (n: number) => Array.from({ length: n }, (_, k) => `component c${k} "C" visible=0.5 evolution=0.5`).join("\n");
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.wardleyComponents).toBe(60);
    expect(UNTRUSTED_LIMITS.wardleyComponents).toBeLessThanOrEqual(LIMITS.wardleyComponents);
  });
  test("over the component cap: refused by check, at the host's own cap too", () => {
    expect(errorsOf(fence(comps(60))).filter((m) => !/LLM text present/.test(m))).toEqual([]);   // (a map this big reads over 400 tokens: its author adds a :::llm)
    expect(check(parse(fence(comps(12)), { path: "p.dh.md", limits: { wardleyComponents: 10 } })).some((p) => /more than 10 components/.test(p.message))).toBe(true);
  });
  test("the strict set takes fewer components", () => {
    expect(check(parse(fence(comps(50)), { path: "p.dh.md" })).filter((p) => p.level === "error" && !/LLM text present/.test(p.message))).toEqual([]);
    expect(check(parse(fence(comps(50)), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /more than 40 components/.test(p.message))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = one + Array.from({ length: 4000 }, () => "not a line at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the wardley part does too much work/);
    expect(doc.llm).toContain("[wardley not shown: the wardley part does too much work");
  });
  test("a map of many components and needs charges the budget", () => {
    const n = 55, needs = Array.from({ length: n - 1 }, (_, k) => `c${k} -> c${k + 1}`).join("\n");
    expect(() => wm(comps(n) + "\n" + needs, "", LIMITS, new Budget({ steps: 100, values: 1e9, chars: 1e9 }, null, null, "the wardley part"))).toThrow(/the wardley part/);
  });
});

describe("wardley: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => [...Array.from({ length: n }, (_, k) => `component c${k} "Comp ${k}" visible=${(((k * 37) % 97) / 100 + 0.01).toFixed(2)} evolution=${(((k * 53) % 89) / 100 + 0.05).toFixed(2)}`), ...Array.from({ length: n - 1 }, (_, k) => `c${k} -> c${k + 1}`), ...Array.from({ length: Math.floor(n / 4) }, (_, k) => `note "a note number ${k} with words" visible=0.5 evolution=0.5`)].join("\n");
  const cost = (n: number) => {
    const b = big();
    const s = parseWardley(body(n), 1, "T", { wardleyComponents: 1e9 }, b);
    layoutWardley(s, b);
    return b.steps + b.values + b.chars;
  };
  test("parse and layout: twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("the placer looks at a bounded number of things per label (a dense map near the cap)", () => {
    const b = big();
    layoutWardley(parseWardley(body(56), 1, "T", LIMITS), b);
    // 12 candidates a label; each visits the cells its box covers and at most 12 things
    expect(b.steps).toBeLessThan(56 * (2 + 12 * (2 + 8 + 12 + 1)) + 56 * 12 + 56 * 3 + 2000);
  });
  test("a chain of 50 000 needs is walked with no stack overflow, one charge per need", () => {
    const chain = ['component c0 "C" visible=0.5 evolution=0.5', "c0 -> x1", ...Array.from({ length: 50_000 }, (_, k) => `x${k + 1} -> x${k + 2}`)].join("\n");
    const b = big();
    const s = parseWardley(chain, 1, "", LIMITS, b);
    expect(s.errors.length).toBeGreaterThan(0);              // the unknown ids are named
    expect(b.steps).toBeLessThan(5 * 50_002 + 10);
    expect(wardleyLlm(s).length).toBeGreaterThan(100);        // the LLM view of it is built with look-ups, not scans
  });
  test("a long line is read once (no scan per start)", () => {
    for (const mk of [(n: number) => one + "evolve a " + "1".repeat(n) + "x", (n: number) => "component a " + "k=".repeat(n), (n: number) => "component a" + " ".repeat(n) + "x visible=" + "9".repeat(n), (n: number) => one + "a" + "->".repeat(n) + " x", (n: number) => one + "[ ".repeat(n), (n: number) => one + "x".repeat(n) + "= visible=" + "1".repeat(n) + "x", (n: number) => one + "a ->" + " ".repeat(n) + "b c"]) {
      const b1 = big(), b2 = big();
      wm(mk(20_000), "", LIMITS, b1); wm(mk(40_000), "", LIMITS, b2);
      expect(b2.steps / b1.steps).toBeLessThan(2.2);
    }
    const t0 = performance.now();
    for (const f of [needLine, hasBarePair, keyVals, isDecimal] as ((s: string) => unknown)[]) { f("a" + "->".repeat(100_000) + " x y"); f("[ ".repeat(100_000)); f("visible=".repeat(50_000)); f("1".repeat(200_000) + "x"); }
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("wardley: hand scans give what the regular expressions they replace gave (5 000 random tricky lines each)", () => {
  const rnd = (() => { let s = 11; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const gen = (parts: string[], max = 8) => { let s = ""; const n = 1 + Math.floor(rnd() * max); for (let j = 0; j < n; j++) s += parts[Math.floor(rnd() * parts.length)]; return s; };
  const J = (x: unknown) => JSON.stringify(x);
  const cases: [string, string[], (s: string) => unknown, (s: string) => unknown][] = [
    ["need", ["a", "b", " ", "->", "-", ">", "x1", "  "], (s) => { const m = s.trim().match(/^(\S+)\s*->\s*(\S+)$/); return m ? [m[1], m[2]] : null; }, (s) => needLine(s.trim())],
    ["bare pair", ["[", "]", "0.4", ".", ",", " ", "1", "x"], (s) => /\[\s*[\d.]+\s*,\s*[\d.]+\s*\]/.test(s), (s) => hasBarePair(s)],
    ["decimal", ["0", "1", ".", "5", "x", "-", " "], (s) => /^\d*\.?\d+$/.test(s), (s) => isDecimal(s)],
    ["key=value", ["visible", "=", "0.5", '"', "a b", " ", "x", "evolution", "K", "_"], (s) => [...s.matchAll(/\b([a-z]+)=("[^"]*"|\S+)/g)].map((m) => [m[1], m[2]]), (s) => keyVals(s)],
  ];
  for (const [name, parts, old, now] of cases) test(name, () => {
    let differ = 0;
    for (let k = 0; k < 5000; k++) { const s = gen(parts); if (J(old(s)) !== J(now(s))) differ++; }
    expect(differ).toBe(0);
  });
});

describe("wardley: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every map drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "wardley").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      const at = text.indexOf("```wardley"), body = text.slice(text.indexOf("\n", at) + 1, text.indexOf("\n```\n", at));
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the wardley part");
      expect(() => parseWardley(body, 1, "", LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(wardley.name).toBe("wardley");
  expect(wardley.steps).toBe(true);
});
