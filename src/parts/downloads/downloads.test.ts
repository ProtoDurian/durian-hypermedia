// The downloads part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at
// n and 2n, never time), the shared media helpers and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import downloads, { parseDownloads, downloadsLlm, humanSize } from "./part";
import { extOf, fmtTime, iconOf, nameOf, parseTime, urlRefusal } from "./media";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`downloads${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string, opts: Record<string, unknown> = {}) => check(parse(src, { path: "p.dh.md", ...opts })).filter((p) => p.level === "error" && !/token/.test(p.message)).map((p) => p.message);
const sum = createHash("sha256").update("hello").digest("hex");
const GOOD = `media/q3-report.pdf "Q3 report" 2.4 MB sha256=${sum}
https://example.com/tool-1.2-linux.tar.gz "The tool, Linux" 18 MB sha512=${"ab".repeat(64)}
media/requests.csv "Raw data" note="one row per request"`;
const p = (body: string, attrs: Record<string, string> = {}) => parseDownloads(body, 2, attrs, 1, LIMITS, big());

describe("downloads: parse and the LLM view", () => {
  test("a good list is a block with its data and no problems; the data is plain JSON", () => {
    const doc = parse(fence(GOOD, 'title="Files for this guide"'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "downloads")!;
    expect(b).toBeDefined();
    if (b.type !== "downloads") throw new Error("not downloads");
    expect(b.data.files.map((f) => [f.name, f.icon, f.size, f.bytes, f.algo])).toEqual([["q3-report.pdf", "document", "2.4 MB", 2400000, "sha256"], ["tool-1.2-linux.tar.gz", "archive", "18 MB", 18000000, "sha512"], ["requests.csv", "sheet", "", null, ""]]);
    expect(b.data.files[2].note).toBe("one row per request");
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
  });
  test("the LLM view, and the page's LLM view carries it", () => {
    const d = p(GOOD, { title: "Files for this guide" });
    const llm = downloadsLlm(d);
    expect(llm).toContain("Downloads: Files for this guide.");
    expect(llm).toContain(`- Q3 report: media/q3-report.pdf (PDF, 2.4 MB, sha256 ${sum.slice(0, 6)}...${sum.slice(-4)})`);
    expect(llm).toContain(`sha256: ${sum}`);   // the whole checksum is kept
    expect(llm).toContain("- Raw data: media/requests.csv (CSV) one row per request.");
    expect(parse(fence(GOOD, 'title="Files for this guide"'), { path: "p.dh.md" }).llm).toContain(llm);
    expect(downloadsLlm(p('a.zip "Z"'))).toBe("Downloads: files.\n- Z: a.zip (ZIP)");
  });
  test("sizes: joined or spaced, decimal", () => {
    expect(p("media/a.zip 3MB").files[0].size).toBe("3 MB");
    expect(p("media/a.zip 1.5 kb").files[0].bytes).toBe(1500);
    expect(humanSize(999)).toBe("999 B"); expect(humanSize(2_400_000)).toBe("2.4 MB"); expect(humanSize(18_000_000)).toBe("18.0 MB");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(GOOD) + "\n:::llm\nThree files for the guide.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Three files for the guide.");
    expect(doc.llm).not.toContain("Downloads: files.");
  });
  test("shared media helpers (hand scans): extensions, names, icons, times, addresses", () => {
    expect(extOf("a/b/c.PDF?x=1")).toBe("pdf"); expect(extOf("a.b/c")).toBe(""); expect(extOf("c.")).toBe(""); expect(extOf("x.tar.gz#frag")).toBe("gz");
    expect(iconOf("x.tar.gz")).toBe("archive"); expect(iconOf("x.csv")).toBe("sheet"); expect(iconOf("x.weird")).toBe("other"); expect(iconOf("x.mp3")).toBe("audio");
    expect(nameOf("a/b/My%20File.zip?x=1")).toBe("My File.zip");
    expect(parseTime("1:23")).toBe(83); expect(parseTime("1:02:03")).toBe(3723); expect(parseTime("0:00")).toBe(0); expect(parseTime("1:05.5")).toBe(65.5);
    for (const t of ["1:75", "75", "1:2", "2:61:00", "a:bc", "1:00:00:00", "1:23.1234"]) expect(parseTime(t)).toBeNull();
    expect(fmtTime(83)).toBe("1:23"); expect(fmtTime(3723)).toBe("1:02:03");
    for (const u of ["data:audio/mp3;base64,AAA", "blob:https://x/1", "javascript:alert(1)", "file:///etc/passwd", "//evil.example/x.mp3", "ftp://x/y.mp3", "a b.mp3", "a\\b.mp3", ""]) expect(urlRefusal(u)).not.toBeNull();
    for (const u of ["media/a.mp3", "/media/a.mp3", "../a.mp3", "https://example.com/a.mp3", "http://192.0.2.7/a.mp3"]) expect(urlRefusal(u)).toBeNull();
  });
});

describe("downloads: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["a script address", 'javascript:alert(1) "x"', /"javascript:alert\(1\)" is not allowed: javascript: URLs are not allowed/],
    ["a data address", 'data:text/plain;base64,AA "x"', /not allowed: data: URLs/],
    ["a size with no unit", 'a.zip "x" 3', /the size "3" needs a unit \(B, KB, MB or GB\)/],
    ["a size that is not a size", 'a.zip "x" 3 TB', /needs a unit|is not a size/],
    ["a short checksum", 'a.zip "x" sha256=abc', /sha256= is 64 hex characters; this one has 3/],
    ["a checksum that is not hex", `a.zip "x" sha256=${"z".repeat(64)}`, /and is not all hex/],
    ["a sha512 of the wrong length", `a.zip "x" sha512=${"a".repeat(64)}`, /sha512= is 128 hex characters/],
    ["md5", `a.zip "x" md5=${"a".repeat(32)}`, /md5= is a weak checksum; use sha256=/],
    ["sha1", `a.zip "x" sha1=${"a".repeat(40)}`, /sha1= is a weak checksum/],
    ["a file twice", 'a.zip "x"\na.zip "y"', /"a.zip" is listed twice \(first at line \d+\)/],
    ["an unknown key", 'a.zip "x" color=red', /unknown key "color="/],
    ["no files", "// nothing here", /no files; one a line/],
    ["a second label", 'a.zip "x" "y"', /a second label/],
    ["a word that is not a size", 'a.zip "x" big', /"big" is not a size/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.every((m) => m.includes("downloads:"))).toBe(true);
  });
  test("an unknown option, and a good line has none", () => {
    expect(errorsOf(fence('a.zip "x"', "colour=c1")).some((m) => /unknown option "colour"/.test(m))).toBe(true);
    expect(errorsOf(fence('a.zip "x" 1.5 KB'))).toEqual([]);
  });
  test("every message carries the real line of the fence", () => {
    const m = check(parse(fence('a.zip "x"\nb.zip "x" 3'), { path: "p.dh.md" })).find((x) => /needs a unit/.test(x.message))!;
    expect(m.line).toBe(5);
  });
});

describe("downloads: caps in both sets", () => {
  test("its cap is in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.downloadsFiles).toBe(100);
    expect(UNTRUSTED_LIMITS.downloadsFiles).toBeLessThanOrEqual(LIMITS.downloadsFiles);
  });
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `media/f${i}.zip "File ${i}"`).join("\n");
  test("over the cap: refused by check, at the host's own cap too", () => {
    expect(errorsOf(fence(rows(100)))).toEqual([]);
    expect(errorsOf(fence(rows(101))).some((m) => /more than 100 files \(the cap\)/.test(m))).toBe(true);
    expect(errorsOf(fence(rows(11)), { limits: { downloadsFiles: 10 } }).some((m) => /more than 10 files/.test(m))).toBe(true);
  });
  test("the strict set takes fewer", () => {
    expect(errorsOf(fence(rows(41)), { limits: UNTRUSTED_LIMITS }).some((m) => /more than 40 files/.test(m))).toBe(true);
    expect(errorsOf(fence(rows(40)), { limits: UNTRUSTED_LIMITS })).toEqual([]);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = Array.from({ length: 4000 }, (_, i) => `media/f${i % 90}.zip "File" 1 KB`).join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000, downloadsFiles: 1e9 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the downloads part does too much work/);
    expect(doc.llm).toContain("[downloads not shown: the downloads part does too much work");
  });
});

describe("downloads: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => Array.from({ length: n }, (_, k) => `media/file-${k}.zip "File number ${k}" ${k + 1} KB sha256=${"ab".repeat(32)} note="some words about it"`).join("\n");
  const cost = (n: number) => { const b = big(); parseDownloads(body(n), 1, {}, 1, { downloadsFiles: 1e9 }, b); return b.steps + b.values + b.chars; };
  test("twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) { const r = cost(2 * n) / cost(n); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once (no scan per start)", () => {
    const b1 = big(), b2 = big();
    parseDownloads("a.zip " + "x ".repeat(10_000), 1, {}, 1, LIMITS, b1);
    parseDownloads("a.zip " + "x ".repeat(20_000), 1, {}, 1, LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
  });
});

describe("downloads: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every list drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "downloads").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((q) => q.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((q) => q.line >= 1)).toBe(true);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the downloads part");
      expect(() => parseDownloads(text, 1, {}, 1, LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(downloads.name).toBe("downloads");
  expect(downloads.steps).toBe(false);
});
