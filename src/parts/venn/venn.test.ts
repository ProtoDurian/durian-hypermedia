// The venn part: parse, LLM view, every refusal, its caps in both sets, the layout's geometry, the doubling test (budget
// charges counted at n and 2n, never time), the hand scans against the regular expressions they replace, the fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import venn, { countFirst, countLast, parseVenn, setLine, takeColour, vennLlm } from "./part";
import { parseItem, splitList } from "./names";
import { fitSetLabel, inShape, layoutVenn, regionDraw } from "./layout";

const fence = (body: string, info = 'title="T"') => `# Page\n\n\`\`\`venn ${info}\n${body}\n\`\`\`\n`;
const SRC = `set go "Go" [c1]\nset rust "Rust" [c2]\nset zig "Zig" [c3]\ngo: Ana, Ben\ngo & rust: Cy\ngo & rust & zig: Dee (writes all three)\nrust: Eve, Fay\nzig: 4 people`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const vn = (body: string, title = "", lim = LIMITS, budget?: Budget) => parseVenn(body, 1, title, lim, budget);
const errorsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);
const has = (e: { msg: string }[], re: RegExp) => expect(e.some((x) => re.test(x.msg))).toBe(true);

describe("venn: parse and the LLM view", () => {
  test("a good venn is a block with its data and no problems", () => {
    const doc = parse(fence(SRC), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "venn")!;
    expect(b).toBeDefined();
    if (b.type !== "venn") throw new Error("not a venn");
    expect(b.data.sets.map((s) => [s.id, s.colour])).toEqual([["go", "c1"], ["rust", "c2"], ["zig", "c3"]]);
    expect(b.data.regions.find((r) => r.mask === 7)!.items[0]).toEqual({ name: "Dee", note: "writes all three" });
    expect(b.data.regions.find((r) => r.mask === 4)).toMatchObject({ count: 4, countWord: "people" });
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("a region names its sets in any order; a set with no colour takes the next family colour", () => {
    expect(vn(SRC.replace("go & rust: Cy", "rust & go: Cy")).regions.find((r) => r.mask === 3)!.items[0].name).toBe("Cy");
    expect(vn('set a "A"\nset b "B" [bad]\nset c').sets.map((s) => s.colour)).toEqual(["c1", "bad", "c3"]);
    expect(vn('set a\nset b').sets.map((s) => s.label)).toEqual(["a", "b"]);
  });
  test("the LLM view is a line a region, and the page's LLM view carries it", () => {
    const t = vennLlm(vn(SRC, "Who writes what"));
    expect(t).toBe("Venn: Who writes what. Sets: Go, Rust, Zig.\nGo only: Ana, Ben\nRust only: Eve, Fay\nZig only: 4 people\nGo and Rust only: Cy\nall three: Dee (writes all three)");
    expect(parse(fence(SRC, 'title="Who writes what"'), { path: "p.dh.md" }).llm).toContain(t);
  });
  test("steps: the LLM view says the caption before each step's regions", () => {
    const s = vn("set a \"A\"\nset b \"B\"\n@step one\na: x\n@step two\nb: y\na & b: z");
    expect(s.steps.map((x) => x.title)).toEqual(["one", "two"]);
    expect(vennLlm(s)).toBe("Venn. Sets: A, B.\none\nA only: x\ntwo\nB only: y\nA and B only: z");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(SRC) + "\n:::llm\nThree languages and who writes them.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Three languages and who writes them.");
    expect(doc.llm).not.toContain("Sets: Go");
  });
});

describe("venn: every refusal names the line and the fix", () => {
  const two = `set a "A"\nset b "B"\n`;
  const cases: [string, string, RegExp][] = [
    ["1 set", `set a "A"\na: x`, /needs 2 to 4 sets/],
    ["5 sets", Array.from({ length: 5 }, (_, k) => `set s${k} "S${k}"`).join("\n"), /5 sets; a venn has 2 to 4.*table or a tier list/],
    ["a set twice", `set a "A"\nset a "B"\nset b "B"`, /set "a" is written twice/],
    ["a bad id", `set a$ "A"\nset b "B"`, /"a\$" is not an id/],
    ["a word after the label", `set a "A" blue\nset b "B"`, /only a colour in square brackets may follow/],
    ["a hex colour", `set a "A" [#ff0000]\nset b "B"`, /unknown colour.*c1, c2/],
    ["an unknown set", two + "c: x", /"c", which is not a set/],
    ["a set twice in a region", two + "a & a: x", /set "a" is named twice in one region/],
    ["a region twice", two + "a & b: x\nb & a: y", /written twice/],
    ["an item in two regions", two + "a: x\nb: x", /"x" is in two regions/],
    ["a count with the word first", two + "a: people 4", /number first: write "4 people"/],
    ["nothing after the colon", two + "a:", /has nothing after the colon/],
    ["a line that is none of these", two + "just words", /is not a set .* or a region/],
    ["a region of a later set", `set a "A"\nset b "B"\n@step one\na & c: x\n@step two\nset c "C"`, /not a set/],
    ["a quoted name then words", two + 'a: "x" tail', /only a \(note\) may follow/],
    ["a bracket in a name", two + "a: x(y)z", /holds a bracket/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.includes("venn:"))).toBe(true);
  });
  test("an unknown attribute", () => {
    expect(errorsOf(fence(two + "a: x", 'speed=3')).some((m) => /unknown attribute "speed"/.test(m))).toBe(true);
    expect(errorsOf(fence(two + "a: x", 'title="T" static=1 #one')).length).toBe(0);
  });
});

describe("venn: the figure", () => {
  test("every region of the figure exists and its anchor is inside exactly its sets (an independent point-in-shape rule)", () => {
    for (const n of [2, 3, 4]) {
      const L = layoutVenn(n);
      expect(L.anchors.size).toBe((1 << n) - 1);
      for (const [mask, a] of L.anchors) {
        L.shapes.forEach((e, k) => {
          const c = Math.cos(e.rot), s = Math.sin(e.rot), dx = a.x - e.cx, dy = a.y - e.cy, u = dx * c + dy * s, v = -dx * s + dy * c;
          expect((u * u) / (e.rx * e.rx) + (v * v) / (e.ry * e.ry) <= 1).toBe(!!(mask & (1 << k)));
          expect(inShape(e, a.x, a.y)).toBe(!!(mask & (1 << k)));
        });
        expect(a.r).toBeGreaterThan(8);
      }
    }
  });
  test("the box is the same every time, and a set's name stays inside the frame", () => {
    for (const n of [2, 3, 4]) {
      const L = layoutVenn(n);
      expect(layoutVenn(n).h).toBe(L.h);
      for (const lab of L.labels) { const fl = fitSetLabel("A long set name here", lab, L.w); expect(fl.x).toBeGreaterThanOrEqual(0); expect(fl.x).toBeLessThanOrEqual(L.w); }
    }
    expect(fitSetLabel("x".repeat(80), { x: 100, anchor: "end" }, 420)).toEqual({ x: 8, anchor: "start" });
  });
  test("a region too small for its names says +N, never overflows", () => {
    const names = Array.from({ length: 30 }, (_, k) => `Person${k}`).join(", ");
    const v = vn(`set a "A"\nset b "B"\na: ${names}`); expect(v.errors).toEqual([]);
    const L = layoutVenn(2), d = regionDraw(v, v.regions[0], L.anchors.get(1)!);
    expect(d.more).toBeGreaterThan(0);
    expect(d.lines.length + (d.more ? 1 : 0)).toBeLessThanOrEqual(Math.floor((L.anchors.get(1)!.r * 1.5) / 21) + 1);
    expect(d.lines.length + d.more).toBe(30);
  });
  test("a count shows its number and, when it fits, its word", () => {
    const v = vn(`set a "A"\nset b "B"\na: 4 people`);
    const d = regionDraw(v, v.regions[0], layoutVenn(2).anchors.get(1)!);
    expect(d).toMatchObject({ count: "4", word: "people", more: 0 });
  });
  test("the layout is refused by a small budget, and charged on every call (a cached figure too)", () => {
    expect(() => layoutVenn(4, new Budget({ steps: 1000, values: 1e9, chars: 1e9 }, null, null, "the venn part"))).toThrow(/the venn part/);
    const a = big(), b = big();
    layoutVenn(3, a); layoutVenn(3, b);
    expect(a.steps).toBeGreaterThan(0);
    expect(b.steps).toBe(a.steps);
  });
});

describe("venn: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.vennNames).toBe(120);
    expect(UNTRUSTED_LIMITS.vennNames).toBeLessThanOrEqual(LIMITS.vennNames);
  });
  const names = (n: number) => Array.from({ length: n }, (_, k) => `N${k}`).join(", ");
  test("over the names cap: refused by check, at the host's own cap too", () => {
    const body = `set a "A"\nset b "B"\na: ${names(130)}`;
    expect(errorsOf(fence(body)).some((m) => /more than 120 names; a venn holds at most 120/.test(m))).toBe(true);
    const ok = `set a "A"\nset b "B"\na: ${names(12)}`;
    expect(errorsOf(fence(ok))).toEqual([]);
    expect(check(parse(fence(ok), { path: "p.dh.md", limits: { vennNames: 10 } })).some((p) => /more than 10 names/.test(p.message))).toBe(true);
  });
  test("the strict set takes fewer names", () => {
    const body = `set a "A"\nset b "B"\na: ${names(80)}`;
    expect(errorsOf(fence(body))).toEqual([]);
    expect(check(parse(fence(body), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /more than 60 names/.test(p.message))).toBe(true);
  });
  test("a fifth set stops the read, so a page of set lines cannot make a long search", () => {
    const body = Array.from({ length: 5000 }, (_, k) => `set s${k} "S"`).join("\n");
    const b = big();
    const s = vn(body, "", LIMITS, b);
    expect(s.sets.length).toBe(4);
    expect(b.steps).toBeLessThan(5100);   // the 5000 lines are read once (the line scan); the parse of them stops at the fifth set
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = `set a "A"\nset b "B"\n` + Array.from({ length: 4000 }, () => "not a line at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the venn part does too much work/);
    expect(doc.llm).toContain("[venn not shown: the venn part does too much work");
  });
});

describe("venn: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => ['set a "A" [c1]', 'set b "B" [c2]', 'set c "C" [c3]', ...["a", "b", "c", "a & b", "a & c", "b & c", "a & b & c"].map((r, j) => `${r}: ${Array.from({ length: Math.ceil(n / 7) }, (_, k) => `N${j}x${k} (note ${k})`).join(", ")}`)].join("\n");
  const cost = (n: number) => {
    const b = big();
    const s = parseVenn(body(n), 1, "T", { vennNames: 1e9 }, b);
    const L = layoutVenn(s.sets.length);   // the figure costs the same for any text: its fixed charge is outside the count
    for (const r of s.regions) regionDraw(s, r, L.anchors.get(r.mask)!, b);
    return b.steps + b.values + b.chars;
  };
  test("parse and every region's words: twice the input costs at most about twice", () => {
    for (const n of [70, 280, 1120]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("the figure costs the same whatever the text says", () => {
    const a = big(), b = big();
    layoutVenn(3, a); layoutVenn(3, b);
    expect(a.steps).toBe(b.steps);
  });
  test("a long line is read once (no scan per start)", () => {
    for (const mk of [(n: number) => 'set a "A"\nset b "B"\na: ' + "x".repeat(n), (n: number) => "set a" + " ".repeat(n) + "b", (n: number) => 'set a "A"\nset b "B"\na: 4' + " ".repeat(n) + "x", (n: number) => 'set a "A"\nset b "B"\na: x' + " [".repeat(n)]) {
      const b1 = big(), b2 = big();
      vn(mk(20_000), "", LIMITS, b1); vn(mk(40_000), "", LIMITS, b2);
      expect(b2.steps / b1.steps).toBeLessThan(2.2);
    }
  });
  test("a very long list of names is cut at the cap without reading the rest", () => {
    const b = big();
    vn(`set a "A"\nset b "B"\na: ${Array.from({ length: 50_000 }, (_, k) => `N${k}`).join(", ")}`, "", LIMITS, b);
    expect(b.values).toBeLessThan(5000);   // the split list itself is the only thing that is all read
  });
});

describe("venn: hand scans give what the regular expressions they replace gave (5 000 random tricky lines each)", () => {
  const rnd = (() => { let s = 11; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const gen = (parts: string[], max = 8) => { let s = ""; const n = 1 + Math.floor(rnd() * max); for (let j = 0; j < n; j++) s += parts[Math.floor(rnd() * parts.length)]; return s; };
  const J = (x: unknown) => JSON.stringify(x);
  const cases: [string, string[], (s: string) => unknown, (s: string) => unknown][] = [
    ["set line", ["set", " ", "go", '"', "Go", "[c1]", "x", "  "], (s) => { const m = s.trim().match(/^set\s+(\S+)(?:\s+"([^"]*)")?\s*(.*)$/); return m ? [m[1], m[2], m[3]] : null; }, (s) => { const m = setLine(s.trim()); return m ? [m.id, m.label, m.rest] : null; }],
    ["count", ["4", "12", " ", "people", ",", "(", "x", '"'], (s) => { const m = s.trim().match(/^(\d+)(?:\s+([^,()"]+))?$/); return m ? [+m[1], (m[2] ?? "").trim()] : null; }, (s) => { const c = countFirst(s.trim()); return c ? [c.n, c.word] : null; }],
    ["count, wrong order", ["4", "12", " ", "people", ",", "(", "x", '"', "P"], (s) => { const m = s.trim().match(/^([A-Za-z][^,()"]*?)\s+(\d+)$/); return m ? [m[2], m[1]] : null; }, (s) => { const c = countLast(s.trim()); return c ? [c.n, c.word] : null; }],
    ["colour", ["a", " ", "[", "]", "c1", "x y"], (s) => { const m = s.match(/^(.*?)\s*\[([^\]]*)\]\s*$/); return m ? [m[1].trim(), m[2].trim()] : null; }, (s) => { const c = takeColour(s); return c.has ? [c.head, c.raw] : null; }],
    ["item", ["Ana", " ", '"', ",", "(", ")", "note", "a b"], (s) => oldItem(s), (s) => J(parseItem(s))],
    ["list", ["Ana", " ", '"', ",", "(", ")", "b"], (s) => J(oldSplit(s)), (s) => J(splitList(s))],
  ];
  // the old item and list readers (private prototype): kept here, run on short lines
  function oldSplit(s: string): string[] {
    const out: string[] = []; let cur = "", depth = 0, quote = false;
    for (const c of s) { if (c === '"') quote = !quote; else if (!quote && c === "(") depth++; else if (!quote && c === ")" && depth) depth--; if (c === "," && !depth && !quote) { out.push(cur); cur = ""; } else cur += c; }
    out.push(cur);
    return out.map((x) => x.trim());
  }
  function oldItem(raw: string): string {
    const s = raw.trim();
    let name = s, note = "";
    const q = s.match(/^"([^"]*)"(?=(\s*))\2(.*)$/);
    let rest = s;
    if (q) { name = q[1].trim(); rest = q[3]; if (!rest) return J(name ? { name, note: "" } : "an item has an empty name"); if (!rest.startsWith("(")) return J(`after the quoted name "${name}" only a (note) may follow, found "${rest.slice(0, 20)}"`); }
    if (q || s.endsWith(")")) {
      if (!rest.endsWith(")")) return J(q ? `the note after "${name}" is not closed: end it with )` : "an item is cut off");
      let depth = 0, at = -1;
      for (let i = rest.length - 1; i >= 0; i--) { if (rest[i] === ")") depth++; else if (rest[i] === "(") { depth--; if (!depth) { at = i; break; } } }
      if (at < 0) return J(`a note is never opened: "${s.slice(0, 30)}" has a ) with no (`);
      note = rest.slice(at + 1, -1).trim();
      if (!q) name = rest.slice(0, at).trim();
    }
    if (!name) return J("an item has an empty name; write it before its (note), or in quotes");
    if (/[()]/.test(name) && !q) return J(`the name "${name}" holds a bracket; put the whole name in quotes ("${name}") or move the bracket's text into a (note)`);
    return J({ name, note });
  }
  for (const [name, parts, old, now] of cases) test(name, () => {
    let differ = 0;
    for (let k = 0; k < 5000; k++) { const s = gen(parts); if (J(old(s)) !== J(now(s))) differ++; }
    expect(differ).toBe(0);
  });
});

describe("venn: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every venn drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "venn").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      const at = text.indexOf("```venn"), body = text.slice(text.indexOf("\n", at) + 1, text.indexOf("\n```\n", at));
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the venn part");
      expect(() => parseVenn(body, 1, "", LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(venn.name).toBe("venn");
  expect(venn.steps).toBe(true);
});

test("the Venn membership legend is visible in normal flow on wide screens", () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  const rule = /^\.venn-legend\s*\{([^}]+)\}/m.exec(css)?.[1];
  expect(rule).toBeDefined();
  expect(rule).not.toMatch(/position:\s*absolute|clip-path:|overflow:\s*hidden|white-space:\s*nowrap/);
  expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
});
