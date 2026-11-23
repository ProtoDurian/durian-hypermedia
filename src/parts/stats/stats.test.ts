// The stats part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at
// n and 2n, never time), the drawn tiles (static markup) and the hostile fixtures.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import stats, { parseStats, statsLlm } from "./part";
import StatsView from "./view";

const fence = (body: string, info = "") => `# Page\n\n\`\`\`stats${info ? " " + info : ""}\n${body}\n\`\`\`\n`;
const BODY = `Requests "1.2 M" change=+12% [good] note="last 7 days" spark=3 5 4 6 8 9
p95 latency "180 ms" change=-8% [good]
Errors "0.4%" change=+0.1 [bad]
Cost "USD 412" change=+3%`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const errorsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);
const errs = (body: string, info = "") => errorsOf(fence(body, info)).join(" | ");
const lim = LIMITS;
const props = (data: ReturnType<typeof parseStats>, st?: string | false) => ({ data, block: { id: "x", line: 1, attrs: {}, llm: "" } as any, ui: {} as any, static: st, stage: { width: 600, theme: "light" as const, motion: "on" as const, report() {} } });

describe("stats: parse and the LLM view", () => {
  test("a good page is a block with its tiles and no problems", () => {
    const doc = parse(fence(BODY), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "stats")!;
    expect(b).toBeDefined();
    if (b.type !== "stats") throw new Error("not stats");
    expect(b.data.tiles.length).toBe(4);
    expect(b.data.tiles[0]).toMatchObject({ name: "Requests", value: "1.2 M", change: "+12%", dir: "up", colour: "good", note: "last 7 days", spark: [3, 5, 4, 6, 8, 9] });
    expect(b.data.tiles[1]).toMatchObject({ name: "p95 latency", dir: "down", colour: "good" });
    expect(b.data.tiles[3].colour).toBe("");   // never guessed from the sign
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);
  });
  test("glyph, trend and sub-line", () => {
    const d = parseStats(`Yield "251 kg" glyph="✦" trend=up sub="Across three plots" change=+8% [good] spark=180 192 205`, 1, {}, lim);
    expect(d.errors).toEqual([]);
    expect(d.tiles[0]).toMatchObject({ glyph: "✦", trend: "up", sub: "Across three plots", spark: [180, 192, 205] });
    expect(statsLlm(d)).toBe("- Yield: 251 kg (+8%, Across three plots, trend up)");   // the decorative glyph is left out
  });
  test("the LLM view is one line a tile, and the page's LLM view carries it", () => {
    const want = "- Requests: 1.2 M (+12%, last 7 days)\n- p95 latency: 180 ms (-8%)\n- Errors: 0.4% (+0.1)\n- Cost: USD 412 (+3%)";
    expect(statsLlm(parseStats(BODY, 1, {}, lim))).toBe(want);
    expect(parse(fence(BODY), { path: "p.dh.md" }).llm).toContain(want);
    expect(statsLlm(parseStats(BODY, 1, { title: "Week" }, lim))).toBe(`Stat tiles: Week.\n${want}`);
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(BODY) + "\n:::llm\nFour figures for the week.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Four figures for the week.");
    expect(doc.llm).not.toContain("- Requests");
  });
  test("a minus sign, a quoted change, a zero change", () => {
    const d = parseStats(`A "1" change=−5%\nB "2" change="+1 ms"\nC "3" change=0%\nD "4" change=0.00`, 1, {}, lim);
    expect(d.errors).toEqual([]);
    expect(d.tiles.map((t) => t.dir)).toEqual(["down", "up", "flat", "flat"]);
  });
});

describe("stats: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["not a tile", 'Requests 1.2M', /a tile is:/],
    ["an unclosed quote", 'Requests "1.2M', /a tile is:/],
    ["a bad change", 'A "1" change=big', /is not a number with a sign/],
    ["a hex colour", 'A "1" [#ff0000]', /not a tile word/],
    ["an unknown colour", 'A "1" [pink]', /not a colour word/],
    ["an unknown key", 'A "1" colour=red', /unknown key "colour"/],
    ["one spark number", 'A "1" spark=3', /at least 2 numbers/],
    ["a spark with a word", 'A "1" spark=3 x', /not a tile word/],
    ["an empty value", 'A "  "', /needs a name before the quoted value/],
    ["a long value", `A "${"x".repeat(61)}"`, /at most 60 characters/],
    ["a bad trend", 'A "1" trend=sideways', /trend= is up, down or flat/],
    ["an empty glyph", 'A "1" glyph=""', /glyph= needs 1 to 60 characters/],
    ["nothing", "// nothing", /has no tile/],
    ["13 tiles", Array.from({ length: 13 }, (_, i) => `T${i} "1"`).join("\n"), /more than 12 tiles/],
    ["a spark of 70", `A "1" spark=${Array.from({ length: 70 }, (_, i) => i).join(" ")}`, /the most is 60/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const e = errorsOf(fence(body));
    expect(e.some((m) => re.test(m))).toBe(true);
    expect(e.every((m) => m.includes("stats:"))).toBe(true);
  });
  test("an unknown fence key", () => { expect(errs('A "1"', "colour=red")).toMatch(/unknown key "colour"/); });
  test("the refusal names its own line", () => {
    const p = check(parse(fence('A "1"\nB "2" change=big'), { path: "p.dh.md" })).find((x) => x.level === "error")!;
    expect(p.line).toBe(5);   // the page's fence is on line 3, the first tile on 4, the bad one on 5
  });
});

describe("stats: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.statsTiles).toBe(12);
    for (const k of ["statsTiles", "statsSpark", "statsText", "statsNote"] as const) {
      expect(LIMITS[k]).toBeGreaterThan(0);
      expect(UNTRUSTED_LIMITS[k]).toBeLessThanOrEqual(LIMITS[k]);
    }
  });
  test("over the tile cap: refused by check, at the host's own cap too", () => {
    const body = Array.from({ length: 5 }, (_, i) => `T${i} "1"`).join("\n");
    expect(errorsOf(fence(body)).length).toBe(0);
    const e = check(parse(fence(body), { path: "p.dh.md", limits: { statsTiles: 4 } })).map((p) => p.message);
    expect(e.some((m) => /more than 4 tiles/.test(m))).toBe(true);
  });
  test("the strict set takes fewer tiles", () => {
    const body = Array.from({ length: 10 }, (_, i) => `T${i} "1"`).join("\n");
    expect(check(parse(fence(body), { path: "p.dh.md" })).length).toBe(0);
    expect(check(parse(fence(body), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /more than 8 tiles/.test(p.message))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = Array.from({ length: 4000 }, () => "not a tile at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000, statsTiles: 100000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the stats part does too much work/);
    expect(doc.llm).toContain("[stats not shown: the stats part does too much work");
  });
});

describe("stats: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => Array.from({ length: n }, (_, k) => `Tile ${k} "${k} ms" change=+${k}% [good] note="a note about ${k}" spark=3 5 4 6 8 9`).join("\n");
  const cost = (n: number) => { const b = big(); parseStats(body(n), 1, {}, { statsTiles: 1e9, statsSpark: 1e9, statsText: 1e9, statsNote: 1e9 }, b); return b.steps + b.values + b.chars; };
  test("twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("a long line is read once (no scan per start)", () => {
    for (const mk of [(n: number) => `${"a ".repeat(n)}"1"`, (n: number) => `A "1" spark=${"1 ".repeat(n)}`, (n: number) => `A "${"x".repeat(n)}"`, (n: number) => `A ${" ".repeat(n)}`]) {
      const b1 = big(), b2 = big();
      parseStats(mk(20_000), 1, {}, { statsTiles: 1e9, statsSpark: 1e9, statsText: 1e9, statsNote: 1e9 }, b1);
      parseStats(mk(40_000), 1, {}, { statsTiles: 1e9, statsSpark: 1e9, statsText: 1e9, statsNote: 1e9 }, b2);
      expect(b2.steps / b1.steps).toBeLessThan(2.3);
    }
  });
  test("a long line is fast", () => {
    const t = Date.now();
    parseStats(`${"a ".repeat(200_000)}"1"`, 1, {}, lim);
    parseStats(`A "1" spark=${"1 ".repeat(200_000)}`, 1, {}, lim);
    parseStats(`A "1" ${"[".repeat(200_000)}`, 1, {}, lim);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe("stats: the tiles are drawn", () => {
  const html = (st?: string | false) => renderToStaticMarkup(React.createElement(StatsView, props(parseStats(BODY, 1, { title: "Week" }, lim), st)));
  test("a sparkline, a coloured change, a plain change, the slots", () => {
    const h = html();
    for (const w of ["stats-spark", "is-good", "is-bad", "is-plain", 'data-dh-slot="stat-value"', 'data-dh-slot="tile"', 'aria-label="Week"']) expect(h).toContain(w);
    expect(h.match(/data-dh-slot="tile"/g)!.length).toBe(4);
  });
  test("static draws the same tiles whole, marked static", () => {
    expect(html("")).toContain("data-dh-static");
    expect(html("").replace(/ data-dh-static="true"/, "")).toBe(html(false).replace(/ data-dh-static="true"/, ""));
    expect(html()).not.toContain("data-dh-static");
  });
  test("no HTML string sink", () => {
    const src = readFileSync(join(import.meta.dir, "view.tsx"), "utf8");
    expect(src).not.toMatch(new RegExp([["inner", "HTML"].join(""), ["dangerouslySetInner", "HTML"].join(""), ["insertAdjacent", "HTML"].join(""), "document\\.write", "eval\\(", "new Function"].join("|")));
  });
  test("a refused page draws the message, not tiles", () => {
    const d = parseStats('Requests 1.2M', 1, {}, lim);
    const h = renderToStaticMarkup(React.createElement(StatsView, props(d)));
    expect(h).toContain("cw-error");
    expect(h).not.toContain("stat-value");
  });
});

describe("stats: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every stats drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "stats").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const e = check(doc).filter((p) => p.level === "error");
        expect(e.length).toBeGreaterThan(0);
        expect(e.every((p) => p.line >= 1)).toBe(true);
      }
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the stats part");
      expect(() => parseStats(text, 1, {}, LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(stats.name).toBe("stats");
  expect(stats.steps).toBe(false);
  expect(stats.llmKind).toBe("own");
});
