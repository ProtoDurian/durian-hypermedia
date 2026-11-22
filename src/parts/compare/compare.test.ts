// The compare part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at
// n and 2n, never time), a long line, the hostile fixtures and the rendered markup.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import compare, { parseCompare, compareLlm, splitTop, splitNote, numberOf, scaleIn } from "./part";
import CompareView from "./view";
import { UI } from "../../ui/ui";

const fence = (body: string, info = 'title="Which queue?"') => `# Page\n\n\`\`\`compare ${info}\n${body}\n\`\`\`\n`;
const CMP = `options: Redis Streams, Kafka, SQS
Ordering: yes, yes, partial (FIFO queues only)
Runs itself: no, no, yes
Throughput: 3, 5, 3 (score 1-5)
Cost at our size: good, bad, good`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const NOCAP = { compareOptions: 1e9, compareRows: 1e9, compareValue: 1e9, compareNote: 1e9, compareName: 1e9 };
const read = (body: string, attrs: Record<string, string> = {}, lim: typeof LIMITS = LIMITS, b?: Budget) => parseCompare(body, 1, 0, attrs, lim, b);
const errorsOf = (src: string, limits?: Partial<typeof LIMITS>) => check(parse(src, { path: "p.dh.md", limits })).filter((p) => p.level === "error").map((p) => p.message);
const joined = (body: string, info?: string) => errorsOf(fence(body, info)).join("\n");

describe("compare: parse and the LLM view", () => {
  test("a good comparison is a block with its data and no problems", () => {
    const doc = parse(fence(CMP, 'title="Which queue?" winner=on'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "compare")!;
    if (!b || b.type !== "compare") throw new Error("not a compare");
    const c = b.data.compare!;
    expect(c.options.map((o) => o.name)).toEqual(["Redis Streams", "Kafka", "SQS"]);
    expect(c.rows.map((x) => x.kind)).toEqual(["bool", "bool", "score", "tone"]);
    expect(c.rows[0].cells[2]).toMatchObject({ text: "partial", note: "FIFO queues only" });
    expect(c.rows[2].scale).toEqual([1, 5]);
    expect(c.rows[2].cells[2].note).toBe("");
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("a comma inside a note does not split the values; an unclosed bracket takes the rest", () => {
    expect(splitTop("yes (a, b), no, 3").parts).toEqual(["yes (a, b)", "no", "3"]);
    expect(splitTop("yes (a, b").parts).toEqual(["yes (a, b"]);
    expect(splitTop("a, b, c, d", 2)).toEqual({ parts: ["a", "b"], more: true });
    expect(splitNote("yes (a) (b)")).toEqual({ text: "yes (a)", note: "b" });
    expect(splitNote("yes (a (b))")).toEqual({ text: "yes (a (b))", note: null });
  });
  test("numbers: sign, decimals, a unit of up to six letters", () => {
    expect(numberOf("12 ms")).toEqual({ num: 12, unit: "ms" });
    expect(numberOf("−3.5%")).toEqual({ num: -3.5, unit: "%" });
    expect(numberOf("+4")).toEqual({ num: 4, unit: "" });
    expect(numberOf("1.")).toBeNull();
    expect(numberOf("12 milliseconds")).toBeNull();
    expect(numberOf("v2")).toBeNull();
    expect(numberOf("3 ms ago")).toBeNull();
  });
  test("a scale in a note, in either spelling", () => {
    expect(scaleIn("score 1-5")).toEqual({ lo: "1", hi: "5", rest: "" });
    expect(scaleIn("fast, Score 0 to 10")).toEqual({ lo: "0", hi: "10", rest: "fast" });
    expect(scaleIn("the score is high")).toBeNull();
    expect(scaleIn("subscore 1-5")).toBeNull();
  });
  test("the best value of each yes/no, scored and good/bad row; a row of equal values has none", () => {
    const c = read(CMP + "\nSame: yes, yes, yes\nWords: a, b, c", { winner: "on" }).compare!;
    expect(c.rows.map((x) => x.best)).toEqual([[0, 1], [2], [1], [0, 2], [], []]);
    expect(c.wins).toEqual([2, 2, 2]);
    expect(c.mostWins).toBe(-1);
    const d = read("options: A, B\nx: yes, no\ny: 3, 1\nz: no, no", { winner: "on" }).compare!;
    expect(d.wins).toEqual([2, 0]);
    expect(d.mostWins).toBe(0);
  });
  test("lower is better turns a score round, in the criterion or in a note", () => {
    const a = read("options: A, B\nLatency (lower is better): 12 ms, 8 ms").compare!;
    expect(a.rows[0]).toMatchObject({ name: "Latency", lower: true, best: [1] });
    const a2 = read("options: A, B\nLatency (p95, lower is better): 12 ms, 8 ms").compare!;
    expect(a2.rows[0]).toMatchObject({ name: "Latency (p95)", lower: true });
    const b = read("options: A, B\nCost: 3, 5 (lower is better)").compare!;
    expect(b.rows[0]).toMatchObject({ lower: true, best: [0] });
    expect(b.rows[0].cells[1].note).toBe("");
  });
  test("no data, option colours, a pick and the view", () => {
    const c = read("options: A [c2], B, C\nSpeed: 1, -, n/a\nWords: x, y, z", { pick: "b", view: "single" }).compare!;
    expect(c.options[0].colour).toBe("c2");
    expect(c.rows[0].cells.map((x) => x.kind)).toEqual(["score", "none", "none"]);
    expect(c.pick).toBe(1);
    expect(c.view).toBe("single");
  });
  test("the LLM view is a Markdown table with the notes kept, and the best in bold with winner=on", () => {
    const t = parse(fence(CMP, 'title="Which queue?" winner=on'), { path: "p.dh.md" }).llm;
    expect(t).toContain("| Which queue? | Redis Streams | Kafka | SQS |");
    expect(t).toContain("| Ordering | **yes** | **yes** | partial (FIFO queues only) |");
    expect(t).toContain("| Throughput | 3 | **5** | 3 |");
    expect(parse(fence(CMP), { path: "p.dh.md" }).llm).not.toContain("**");
    expect(compareLlm(read("options: A, B\nx: a|b, c"), "")).toContain("a\\|b");
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(CMP) + "\n:::llm\nKafka wins on throughput.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Kafka wins on throughput.");
    expect(doc.llm).not.toContain("| Criterion |");
  });
  test("a body that does not read stays a code block in the LLM view", () => {
    expect(parse(fence("options: A, B\nx: yes"), { path: "p.dh.md" }).llm).toContain("```compare\noptions: A, B\nx: yes\n```");
  });
});

describe("compare: every refusal names the line and the fix", () => {
  test("wrong number of values (fewer, and more)", () => {
    expect(joined("options: A, B, C\nOrdering: yes, no")).toContain('"Ordering" has 2 values but there are 3 options');
    expect(joined("options: A, B\nOrdering: yes, no, yes")).toContain('"Ordering" has more than 2 values but there are 2 options');
  });
  test("mixed kinds in one row", () => {
    const m = joined("options: A, B\nSpeed: yes, 3");
    expect(m).toContain("mixes kinds of value");
    expect(m).toContain("yes/no/partial");
    expect(m).toContain("a number");
  });
  test("no options line, one option, a repeated option, a hex colour", () => {
    expect(joined("Ordering: yes, no")).toContain('first line is "options: A, B, C"');
    expect(joined("options: A\nx: yes")).toContain("at least 2 options");
    expect(joined("options: A, a\nx: yes, no")).toContain('"a" is listed twice');
    expect(joined("options: A [#fff], B\nx: yes, no")).toContain("not a colour word");
  });
  test("an empty value, a bad scale, a value outside its scale, unknown key, bad winner, pick not an option, bad view", () => {
    expect(joined("options: A, B\nx: yes,")).toContain("a value is empty");
    expect(joined("options: A, B\nx: 3 (score 5-1), 4")).toContain("must go up");
    expect(joined("options: A, B\nx: 9 (score 1-5), 4")).toContain("outside its scale");
    expect(joined(CMP, "colour=red")).toContain('unknown key "colour"');
    expect(joined(CMP, "winner=yes")).toContain("winner= is on or off");
    expect(joined(CMP, "pick=Pulsar")).toContain('pick="Pulsar" is not one of the options');
    expect(joined(CMP, "view=cards")).toContain("view= is table");
  });
  test("a line with no colon, and a body with no row", () => {
    expect(joined("options: A, B\njust words")).toContain('a line is "<criterion>: <value>');
    expect(joined("options: A, B")).toContain("no criterion line");
  });
  test("every message carries the part's name, and its own line", () => {
    const src = fence("options: A, B\nOk: yes, no\nBad: yes", "");
    const out = check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error");
    expect(out.length).toBe(1);
    expect(out[0].message).toContain("compare: ");
    expect(out[0].line).toBe(src.split("\n").findIndex((l) => l.startsWith("Bad:")) + 1);
  });
  test("the fence's keys id and static are allowed", () => {
    expect(errorsOf(fence(CMP, "#q static="))).toEqual([]);
  });
});

describe("compare: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS, the strict ones no higher", () => {
    expect([LIMITS.compareOptions, LIMITS.compareRows, LIMITS.compareValue, LIMITS.compareNote, LIMITS.compareName]).toEqual([8, 40, 120, 300, 80]);
    expect([UNTRUSTED_LIMITS.compareRows, UNTRUSTED_LIMITS.compareNote]).toEqual([25, 200]);
    for (const k of Object.keys(LIMITS).filter((x) => x.startsWith("compare") && !x.startsWith("compareImage"))) expect((UNTRUSTED_LIMITS as any)[k]).toBeLessThanOrEqual((LIMITS as any)[k]);
  });
  test("options, rows, value and note length", () => {
    const opts = Array.from({ length: 9 }, (_, i) => `O${i}`).join(", ");
    expect(joined(`options: ${opts}\nx: ${Array(9).fill("yes").join(", ")}`)).toContain("the most is 8");
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `R${i}: yes, no`).join("\n");
    expect(joined(`options: A, B\n${rows(41)}`)).toContain("the most is 40");
    expect(joined(`options: A, B\n${rows(40)}`)).not.toContain("the most is");
    expect(joined(`options: A, B\nx: ${"w".repeat(121)}, b`)).toContain("at most 120");
    expect(joined(`options: A, B\nx: yes (${"n".repeat(301)}), no`)).toContain("at most 300");
  });
  test("the strict set takes fewer rows and shorter notes; a host's own cap works too", () => {
    const rows = Array.from({ length: 30 }, (_, i) => `R${i}: yes, no`).join("\n");
    expect(errorsOf(fence(`options: A, B\n${rows}`))).toEqual([]);
    expect(errorsOf(fence(`options: A, B\n${rows}`), UNTRUSTED_LIMITS).join("\n")).toContain("more than 25 rows");
    expect(errorsOf(fence(`options: A, B\n${rows}`), { compareRows: 10 }).join("\n")).toContain("more than 10 rows");
    expect(errorsOf(fence(`options: A, B\nx: yes (${"n".repeat(250)}), no`), UNTRUSTED_LIMITS).join("\n")).toContain("at most 200");
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = "options: A, B\n" + Array.from({ length: 4000 }, () => "not a line at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the compare part does too much work/);
    expect(doc.llm).toContain("[compare not shown: the compare part does too much work");
  });
});

describe("compare: linear (the doubling test, charges counted)", () => {
  const rows = (n: number) => "options: A, B, C\n" + Array.from({ length: n }, (_, k) => `Criterion number ${k}: yes (a note about ${k}), ${k} ms, a word`).join("\n");
  const cost = (body: string) => { const b = big(); read(body, { winner: "on" }, NOCAP as typeof LIMITS, b); return b.steps + b.values + b.chars; };
  test("rows: twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) { const r = cost(rows(2 * n)) / cost(rows(n)); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("the options line and a value with a long note", () => {
    const opts = (n: number) => "options: " + Array.from({ length: n }, (_, k) => `Option ${k}`).join(", ") + "\nx: " + Array(n).fill("yes").join(", ");
    for (const n of [50, 200, 800]) { const r = cost(opts(2 * n)) / cost(opts(n)); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
    const note = (n: number) => `options: A, B\nx: yes (${"a, b ".repeat(n)}), no`;
    for (const n of [50, 200, 800]) { const r = cost(note(2 * n)) / cost(note(n)); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once (no scan per start)", () => {
    for (const filler of ["x", "(", "[", ":", ",", " ", "score "]) {
      const b1 = big(), b2 = big();
      read("options: A, B\nx: " + filler.repeat(20_000), {}, NOCAP as typeof LIMITS, b1);
      read("options: A, B\nx: " + filler.repeat(40_000), {}, NOCAP as typeof LIMITS, b2);
      expect(b2.steps / b1.steps).toBeLessThan(2.2);
    }
  });
  test("a hostile long line ends fast", () => {
    const t = Date.now();
    for (const filler of ["(", ",", "score 1-", "lower is better ", "1", "yes (", "["]) read(`options: A, B\nx: ` + filler.repeat(100_000), {}, NOCAP as typeof LIMITS, big());
    expect(Date.now() - t).toBeLessThan(2500);
  });
  test("a compare at its caps fits one part's budget", () => {
    const body = `options: ${Array.from({ length: 8 }, (_, i) => `O${i}`).join(", ")}\n` + Array.from({ length: 40 }, (_, k) => `R${k}: ${Array(8).fill("good (" + "n".repeat(100) + ")").join(", ")}`).join("\n");
    const d = read(body, { winner: "on" }, LIMITS, new Budget(partLimitsOf(LIMITS), null, null, "the compare part"));
    expect(d.errors).toEqual([]);
  });
});

describe("compare: the view", () => {
  const html = (src: string, attrs: Record<string, string> = {}, width = 0) => {
    const d = read(src, attrs);
    const props: any = { data: d, block: { type: "compare", id: null, line: 1, attrs, llm: null, llmKind: "own", data: d }, ui: UI.en, static: undefined, stage: { width, theme: "light", motion: "on", report() {} } };
    return renderToStaticMarkup(React.createElement(CompareView, props));
  };
  test("draws the columns, the best, the pick, the notes as buttons, and the words as well as the colours", () => {
    const h = html(CMP + "\nSame: yes, yes, yes", { winner: "on", pick: "Kafka" });
    expect(h).toContain("Redis Streams");
    expect(h).toContain("Our pick");
    expect(h).toContain("Best in this row");
    expect(h).toContain('class="cmp-note"');
    expect(h).toContain(">Partial<");
    expect(h).toContain(">Good<");
    expect(h).toContain("dh-pop-host");
    expect(h).not.toContain("data-dh-part");   // the frame sets it
  });
  test("narrow: a switcher; with view=single one option and its buttons", () => {
    const h = html(CMP, { view: "single" }, 390);
    expect(h).toContain("One at a time");
    expect(h).toContain('class="cmp-tabs"');
    expect((h.match(/class="cmp-opt"/g) ?? []).length).toBe(1);
    expect((html(CMP, {}, 800).match(/class="cmp-opt"/g) ?? []).length).toBe(3);
  });
  test("a body that does not read draws the first message, not a table", () => {
    const h = html("options: A, B\nx: yes");
    expect(h).toContain("cw-error");
    expect(h).not.toContain("<table");
  });
  test("a note's text is the popover's, never HTML", () => {
    const h = html("options: A, B\nx: yes (<img src=x onerror=alert(1)>), no");
    expect(h).not.toContain("<img");
  });
});

describe("compare: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every comparison drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "compare").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a line, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const errs = check(parse(text, { path: f, limits })).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      for (const m of text.matchAll(/```compare[^\n]*\n([\s\S]*?)\n```/g)) {
        const b = new Budget(partLimitsOf(LIMITS), null, null, "the compare part");
        expect(() => read(m[1], {}, LIMITS, b)).not.toThrow();
      }
    });
  }
});

test("the definition matches its folder", () => {
  expect(compare.name).toBe("compare");
  expect(compare.steps).toBe(false);
});
