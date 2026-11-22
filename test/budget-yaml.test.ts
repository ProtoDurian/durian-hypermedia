// YAML anchors and aliases (0.6.1): sized against the text itself, checked before parsing, charged to the page.
// Counts and sizes only, never time.
import { afterEach, describe, expect, test } from "bun:test";
import { parse, check, setYamlParser, LIMITS } from "../src/index";
import { pageLimitsOf, partLimitsOf } from "../src/core/budget";
import { yamlAliasCount, yamlMayMerge, yamlMayTag, yamlParse, yamlPrecheck } from "../src/host/yaml";

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
  test("with an alias, any tag or directive is refused (a tag can spell a merge without << or the word)", () => {
    const tagged = ["!!%6derge k: *é", "!<tag:yaml.org,2002:%6derge> k: *é", "!m!ge k: *é", "!!str k: *é", "k: !!str *é", "k: &z !x [1]\nl: *é", "- !t 1\n- *é", "k: {a: !t 1, b: *é}"];
    for (const body of tagged) {
      const src = `b: &é {x: 1}\n${body}`;
      expect(yamlMayTag(src)).toBe(true);
      expect(() => yamlParse(src)).toThrow(/tag \(!\) or a directive/);
    }
    for (const head of ["%YAML 1.1\n---\n", "%TAG !m! tag:yaml.org,2002:mer\n---\n"]) expect(() => yamlParse(`${head}b: &é {x: 1}\nm: *é`)).toThrow(/directive/);
    // without an alias a tag costs only its text, as before
    expect(yamlParse("a: !!str 1\nb: 2")).toEqual({ a: "1", b: 2 });
  });
  test("a ! or % inside a value is not a tag or directive", () => {
    const vals = ['"Wow! 50% off"', "Hello! world", "'100%'", '"a, b! c"', "50 %", '"Q: why? *Answer*"'];
    for (const v of vals) {
      const src = `b: &é [1]\nc: *é\nt: ${v}\n`;
      expect(yamlMayTag(src)).toBe(false);
      expect(() => yamlParse(src)).not.toThrow();
    }
  });
  test("Markdown in block scalars is not counted: a page with no anchor reads exactly as before", () => {
    const fm = (body: string) => `---\ntitle: T\n${body}\n---\n\ntext\n`;
    const bold = (n: number) => Array.from({ length: n }, (_, i) => `  **word${i}** text`).join("\n");
    const cases = [
      fm(`summary: |\n${bold(16)}`), fm(`summary: |\n${bold(40)}`),
      fm(`summary: |\n${Array.from({ length: 40 }, (_, i) => `  - **item${i}**`).join("\n")}`),
      fm("summary: |\n  **Note** use\n  cout << x\n  !important\n  %d"),
      chart(["note: |", bold(40), ...plain]),
    ];
    for (const src of cases) {
      const d = parse(src);
      expect(d.problems).toEqual([]);
      expect(yamlAliasCount(src)).toBe(0);
    }
    expect(parse(cases[0]).title).toBe("T");
  });
  test("an alias whose name starts with * or & still counts when such an anchor exists", () => {
    expect(yamlAliasCount("a: &*x 1\nb: [**x, **x]")).toBe(2);
    expect(yamlAliasCount("a: &&x 1\nb: *&x")).toBe(1);
    expect(yamlAliasCount("a: &é 1\nb: [*é, *e, **bold**]")).toBe(1);
    expect(yamlAliasCount("no anchor: [*a, *b, *c]")).toBe(0);
  });
  test("a ! after a blank is taken for a tag, but only next to a real alias (the one narrow refusal)", () => {
    expect(yamlMayTag("t: x !y")).toBe(true);
    expect(() => yamlParse("t: x !y")).not.toThrow();
    expect(() => yamlParse("b: &é [1]\nc: *é\nt: x !y")).toThrow(/tag/);
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

describe("the whole pre-parse check, fuzzed: every alias Bun resolves is counted, every merge is refused", () => {
  test("20,000 seeded documents: anchors and aliases behind tags, anchors, quotes, comments, odd blanks, in every frame", () => {
    let seed = 6;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const pick = <T>(a: T[]) => a[rnd(a.length)];
    const props = ["", "", "", "!t ", "!<t,u> ", "!<t]u> ", "!<a>b> ", "!<[> ", "!t,u ", "!! ", "! ", "!!str ", "!!map ", "!%6d ", "!<t#u> ", "!<t:u> ", "&z ", "&z,w ", "&z] ", "&z:w ", "&! ", "&* ", "&z\t", "!t\n    ", "&z\n    ", "#c\n    ", '"q" ', "'q' ", "] ", "> ", ": ", "- ", "? ", "\\ ", "\u00a0", "\u2028", "\ufeff", "\r", "\u0085"];
    const frames = [(x: string) => " " + x, (x: string) => " [" + x + "]", (x: string) => " [1," + x + "]", (x: string) => " {k: " + x + "}", (x: string) => ' {"k":' + x + "}", (x: string) => "\n  - " + x, (x: string) => "\n  k: " + x, (x: string) => "\n  ? " + x, (x: string) => "\n  " + x, (x: string) => "\n  <<: " + x, (x: string) => "\n  !!%6derge k: " + x, (x: string) => " {<<: " + x + "}", (x: string) => "\n  " + x + " : 1"];
    const defs = ["s: &N {ZQMARK: 1}", "s: !<t,u> &N {ZQMARK: 1}", "s: [&N {ZQMARK: 1}]", "s: {k: &N {ZQMARK: 1}}", "s:\n  - &N {ZQMARK: 1}", '"s":\n  &N {ZQMARK: 1}', "{s: &N {ZQMARK: 1}, r: 1}", "? &N ZQMARK\n: 1"];
    const names = ["a", "a", "ab", "a-b", "a.b", "a,b", "é", "*", "-", "1", "😀", "!", ":", "&", "", "aaaaaaaab"];
    const marks = (v: any, seen = new Set<object>()): number => {
      if (v === "ZQMARK") return 1;
      if (!v || typeof v !== "object" || seen.has(v)) return 0;
      seen.add(v); let n = 0; for (const [k, x] of Object.entries(v)) n += marks(x, seen) + (k === "ZQMARK" ? 1 : 0); seen.delete(v); return n;
    };
    const holders = (v: any, out = new Set<object>()): Set<object> => { if (v && typeof v === "object" && !out.has(v)) { if (!Array.isArray(v) && "ZQMARK" in v) out.add(v); for (const x of Object.values(v)) if (x && typeof x === "object") holders(x, out); } return out; };
    const refused = (s: string, most: number) => { try { yamlPrecheck(s, most); return false; } catch { return true; } };
    let resolved = 0, merged = 0;
    for (let i = 0; i < 20_000; i++) {
      const N = pick(names);
      let x = ""; for (let j = rnd(3); j >= 0; j--) x += pick(props);
      const s = pick(defs).replaceAll("&N", "&" + N) + "\nl:" + pick(frames)(x + "*" + N) + "\n";
      let v: any; try { v = (globalThis as any).Bun.YAML.parse(s); } catch { continue; }
      if (marks(v) < 2) continue;
      resolved++;
      expect({ s, counted: refused(s, 0) }).toEqual({ s, counted: true });
      if (!s.startsWith("? ") && holders(v).size > 1) { merged++; expect({ s, refused: refused(s, 16) }).toEqual({ s, refused: true }); }
    }
    expect(resolved).toBeGreaterThan(500);
    expect(merged).toBeGreaterThan(50);
  });
});
