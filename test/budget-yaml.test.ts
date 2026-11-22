// YAML anchors and aliases (0.6.1): sized against the text itself, checked before parsing, charged to the page.
// Counts and sizes only, never time.
import { afterEach, describe, expect, test } from "bun:test";
import { parse, check, setYamlParser, LIMITS } from "../src/index";
import { pageLimitsOf, partLimitsOf } from "../src/core/budget";
import { yamlAliasCount, yamlMayMerge, yamlParse } from "../src/host/yaml";

const F = "```";
const PAGE = pageLimitsOf(), PART = partLimitsOf();
const chart = (rows: string[]) => [`${F}chart`, "kind: line", ...rows, F, ""].join("\n");
const plain = ["x: [1, 2]", "series:", "  - name: y", "    data: [1, 2]"];
const first = (d: ReturnType<typeof parse>) => d.blocks.find((b) => b.type !== "markdown") as any;
const msgOf = (b: any): string => String(b?.initial?.error ?? b?.message ?? "");
const NAMES = ["a", "é", ".x", "$x", "日本", "a-b", "9", "😀", "a/b", "_"];
afterEach(() => setYamlParser(null));

describe("an aliased string counts each time it is held, against the text's length", () => {
  const S = 5_000, K = 12; // 12 aliases of 5,000 characters: 60,000 characters from about 5 KB of text
  const flat = (nm: string) => `[&${nm} "${"z".repeat(S)}", ${Array(K).fill("*" + nm).join(", ")}]`;
  test("in a chart key, in x and in a series name: refused, whatever the anchor is named", () => {
    for (const nm of NAMES) {
      for (const rows of [["hold: " + flat(nm), ...plain], ["x: " + flat(nm), "series:", "  - name: y", `    data: [${Array(K + 1).fill(1).join(", ")}]`], [`s: &${nm} "${"z".repeat(S)}"`, "x: [1, 2]", "series:", ...Array.from({ length: K }, () => `  - name: *${nm}\n    data: [1, 2]`)]]) {
        const src = chart(rows);
        const d = parse(src);
        expect(first(d).type).toBe("error");
        expect(msgOf(first(d))).toMatch(/anchors and aliases/);
        expect(JSON.stringify(d).length).toBeLessThan(4 * src.length);
        expect(d.llm.length).toBeLessThan(2 * src.length);
        expect(JSON.stringify(check(d)).length).toBeLessThan(2000);
      }
    }
  });
  test("in front matter: ignored with a problem; check() reports it too", () => {
    for (const nm of NAMES) {
      for (const fm of [`hold: ${flat(nm)}`, `s: &${nm} "${"z".repeat(S)}"\ntitle: *${nm}\nm:\n${Array.from({ length: K }, (_, i) => `  a${i}: *${nm}`).join("\n")}`]) {
        const src = `---\n${fm}\n---\n\n# t\n\ntext\n`;
        const d = parse(src);
        expect(d.problems.some((p) => /front matter/.test(p.message))).toBe(true);
        expect(JSON.stringify(d).length).toBeLessThan(2 * src.length);
        expect(check(d).length).toBeGreaterThan(0);
      }
    }
  });
  test("a few short aliases still work", () => {
    const d = parse(chart([`s: &é "Revenue"`, "x: [a, b]", "series:", "  - name: *é", "    data: &d [1, 2]", "  - name: Cost", "    data: *d"]));
    expect(first(d).type).toBe("chart");
    expect(first(d).initial.series.map((s: any) => s.name)).toEqual(["Revenue", "Cost"]);
  });
});

describe("before the parser runs: the alias count and merge keys", () => {
  test("more aliases than maxYamlAliases are refused, whatever the names are spelled with", () => {
    for (const nm of NAMES) {
      const d = parse(chart([`hold: [&${nm} 1, ${Array(LIMITS.maxYamlAliases + 1).fill("*" + nm).join(", ")}]`, ...plain]));
      expect(msgOf(first(d))).toMatch(/too many (YAML )?anchors and aliases/);
      expect(yamlAliasCount(`a: [&${nm} 1, *${nm}, *${nm}]\nb: *${nm}\n- *${nm}`)).toBe(4);
    }
  });
  test("a merge key next to an alias is refused in every spelling the parser reads as a merge", () => {
    const keys = ["<<", "<< ", '"<<"', "'<<'", '"\\x3c\\x3C"', '"\\u003c<"', '"\\U0000003c<"', "!!merge <<", "<<\t"];
    for (const k of keys) {
      const src = `b: &é {x: 1, y: 2}\nm:\n  ${k}: *é`;
      expect(yamlMayMerge(src)).toBe(true);
      expect(() => yamlParse(src)).toThrow(/merge key/);
    }
    expect(() => yamlParse('b: &é {x: 1}\nm: {"<\\\n  <": *é}')).toThrow(/merge key/);
    expect(() => yamlParse("m:\n  <<: {x: 1}")).not.toThrow(); // a merge of a map written out costs only its text
  });
  test("Markdown and ampersands in values are not taken for aliases or merges", () => {
    const vals = ['"**bold** and *em*"', '"Tom & Jerry, R&D"', "'a < b'", '"x, *y*, **z**"', "plain *text* here"];
    const fm = `---\ntitle: "**Bold** & more"\ndescription: ${vals[4]}\n---\n\n`;
    const src = fm + chart([`title: ${vals[0]}`, "x: [a, b]", "series:", ...vals.slice(0, 4).map((v) => `  - name: ${v}\n    data: [1, 2]`)]);
    const d = parse(src);
    expect(d.problems.filter((p) => /anchors|aliases|front matter/.test(p.message))).toEqual([]);
    expect(first(d).type).toBe("chart");
    expect(d.title).toBe("**Bold** & more");
  });
  test("a parser given with setYamlParser is checked the same way, before it runs", () => {
    let used = 0;
    setYamlParser((t) => { used++; return (globalThis as any).Bun.YAML.parse(t); });
    expect(() => yamlParse(`b: &é {x: 1}\nm:\n  <<: *é`)).toThrow(/merge key/);
    expect(() => yamlParse(`a: [&é 1, ${Array(20).fill("*é").join(", ")}]`)).toThrow(/too many/);
    expect(used).toBe(0);
    expect(() => yamlParse(`s: &é "${"z".repeat(10_000)}"\nl: [${Array(10).fill("*é").join(", ")}]`)).toThrow(/repeat too much/);
    expect(used).toBe(1);
  });
});

describe("one allowance for the page", () => {
  // each chart's aliases add about 48,000 characters beyond its text: inside one part's allowance, not 100 times
  const one = chart([`s: &é "${"z".repeat(3000)}"`, `l: [${Array(16).fill("*é").join(", ")}]`, ...plain]);
  test("what aliases add is charged to the page: later charts are refused once it is spent", () => {
    const n = 100, src = Array(n).fill(one).join("\n");
    const d = parse(src);
    const drawn = d.blocks.filter((b) => b.type === "chart").length;
    expect(drawn).toBeLessThanOrEqual(Math.ceil(PAGE.chars / (16 * 3000 - one.length)));
    expect(drawn).toBeGreaterThan(0);
    expect(d.blocks.filter((b) => b.type === "error")).toHaveLength(n - drawn);
    expect(JSON.stringify(d).length).toBeLessThanOrEqual(8 * src.length + 2 * (PAGE.values + PAGE.chars));
  });
  test("front matter and charts share it", () => {
    const fm = `---\ns: &é "${"z".repeat(3000)}"\nl: [${Array(16).fill("*é").join(", ")}]\n---\n\n`;
    const a = parse(Array(20).fill(one).join("\n")).blocks.filter((b) => b.type === "chart").length;
    const b = parse(fm + Array(20).fill(one).join("\n")).blocks.filter((b) => b.type === "chart").length;
    expect(b).toBe(a - 1);
  });
  test("parse options lower the YAML allowance and the alias count too", () => {
    const small = { ...LIMITS, maxEvalChars: 10_000, maxYamlAliases: 4 };
    expect(first(parse(one, { limits: small })).type).toBe("error");
    expect(msgOf(first(parse(chart([`h: [&é 1, *é, *é, *é, *é, *é]`, ...plain]), { limits: small })))).toMatch(/too many/);
    expect(first(parse(one)).type).toBe("chart");
  });
  test("results that name one list many times are charged to the page as well", () => {
    // each chart makes 9,000 values and returns them 5 times: 45,000, inside one part, but not for free
    const rep = chart(["let:", '  a: "range(1, 9000)"', "  b: a", "  c: a", "  d: a", "  e: a", ...plain]);
    const d = parse(Array(30).fill(rep).join("\n"));
    const drawn = d.blocks.filter((b) => b.type === "chart").length;
    expect(drawn).toBeLessThanOrEqual(Math.ceil(PAGE.values / 36_000) + 1);
    expect(drawn).toBeGreaterThan(0);
  });
});

test("control names over 64 characters are refused, not cut", () => {
  const long = "k".repeat(65);
  const d = parse(chart(["controls:", `  - {slider: ${long}a, min: 0, max: 1}`, `  - {slider: ${long}b, min: 0, max: 1}`, ...plain]));
  expect(check(d).some((p) => /control name has at most 64 characters/.test(p.message))).toBe(true);
});

describe("a seeded YAML fuzz: the Document stays within 8 x input + 2 x (page values + page characters)", () => {
  test("300 pages of scalar, list and map anchors, chains, merges, every anchor spelling, front matter and many parts", () => {
    let seed = 11;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const block = (): string => {
      const p = NAMES[rnd(NAMES.length)] + "k", m = 2 + rnd(5), L = 1 + rnd(4), k = 1 + rnd(40), S = 1 + rnd(4000);
      switch (rnd(5)) {
        case 0: return `s: &${p} "${"z".repeat(S)}"\nl: [${Array(k).fill("*" + p).join(", ")}]`;
        case 1: { const r = [`c0: &${p}0 ["${"z".repeat(1 + rnd(50))}", "${"z".repeat(1 + rnd(50))}"]`]; for (let i = 1; i <= L; i++) r.push(`c${i}: &${p}${i} [${Array(m).fill(`*${p}${i - 1}`).join(", ")}]`); return r.join("\n"); }
        case 2: return `b: &${p} {${Array.from({ length: 1 + rnd(200) }, (_, i) => `k${i}: 1`).join(", ")}}\n${Array.from({ length: k }, (_, i) => `m${i}:\n  ${["<<", '"<<"', '"\\x3c<"', "!!merge <<", "<< "][rnd(5)]}: *${p}`).join("\n")}`;
        case 3: return `t: &${p} {name: "${"n".repeat(S)}"}\nu: {${Array.from({ length: k }, (_, i) => `v${i}: *${p}`).join(", ")}}`;
        default: return `w: "${"**bold** & more, *x* ".repeat(1 + rnd(20))}"`;
      }
    };
    const bound = (n: number) => 8 * n + 2 * (PAGE.values + PAGE.chars);
    let drawn = 0;
    for (let k = 0; k < 300; k++) {
      const fm = rnd(2) ? `---\ntitle: t\n${block()}\n---\n\n` : "";
      const parts = Array.from({ length: 1 + rnd(25) }, () => chart([block(), ...plain]));
      const src = fm + "# p\n\n" + parts.join("\n");
      const d = parse(src);
      drawn += d.blocks.filter((b) => b.type === "chart").length;
      expect(JSON.stringify(d).length).toBeLessThanOrEqual(bound(src.length));
      expect(JSON.stringify(check(d)).length).toBeLessThanOrEqual(bound(src.length));
    }
    expect(drawn).toBeGreaterThan(300); // most small cases still draw
    void PART;
  });
});
