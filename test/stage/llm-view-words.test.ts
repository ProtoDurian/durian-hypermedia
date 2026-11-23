// The composed stage's LLM view and its doccheck words (0.7.0-rc.3, the rc.2 reviews' SHOULD-FIX items): the LLM view says
// what is drawn in words, never the source's bracket words, pipes or a bare one-letter id; doccheck never reads "no a ...",
// and a one-step stage is refused once.
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, check, llmView } from "../../src/index";
import { beginDocument, endDocument } from "../../src/core/stage-budget";

afterEach(() => { endDocument(); beginDocument(); });
const DIR = join(import.meta.dir, "../../fixtures/stage");
const view = (src: string) => llmView(parse(src, { path: "t.dh.md" }));
const HEAD = "---\nroles: { client: c1, server: c3 }\n---\n# T\n\n```animation\n";

describe("the LLM view of a composed stage", () => {
  test("no source words in any stage sample's LLM view", () => {
    for (const f of readdirSync(DIR).filter((x) => /^\d\d-/.test(x))) {
      const v = view(readFileSync(join(DIR, f), "utf8"));
      for (const bad of [/\[(plain|dashed|warn|bad|good|accent|lit|soft)\]/, /\(steps (\d+) to \1\)/, /: \.$/m, /every 1 [a-z]+s\b/, /\bkept, kept\b/, /^ {2}[a-z]:/m])
        expect({ f, hit: v.match(bad)?.[0] }).toEqual({ f, hit: undefined });
    }
  });

  test("a time row: its look in words, a pipe in its label as a comma, a bare dot, one cell per unit", () => {
    const v = view(HEAD + `time: 0..4 | shifts\ncells: 1\nrow client a "(a) Draft | writes": +_ 0..1; hold 1..2 @1..1 [warn]; ok 2..3 @2 [good]\nrow server r "": idle 0..2 [dashed]; x 2..4 [plain]\ndot 3\n@step One: one.\n@step Two: two.\n\`\`\`\n`);
    expect(v).toContain("(a) Draft, writes:");
    expect(v).toContain("hold 1 to 2 (step 1 only, warning)");
    expect(v).toContain("ok 2 to 3 (steps 2 onward, good)");
    expect(v).toContain("the server row: idle 0 to 2 (dashed), x 2 to 4 (neutral)");
    expect(v).toContain("One state cell per shift.");
    expect(v).toContain("Dot 3.");
  });

  test("a grid item whose chip is its state says it once; a say's pipe reads as a semicolon", () => {
    const v = view(HEAD + `## Clients\nclient c1: the browser\n## Servers\nserver s1: the API\n@step One: one.\nc1 -> s1: GET\nsay s1: busy now | back soon\ngrid 2\n  client: ui-kit | 3.2.0 [+ kept]\n@step Two: two.\ns1 -> c1: ok\n\`\`\`\n`);
    expect(v).toContain("ui-kit (3.2.0): kept.");
    expect(v).toContain("busy now; back soon.");
  });
});

describe("doccheck words for a composed stage", () => {
  const msgs = (src: string) => check(parse(src, { path: "t.dh.md" })).map((p) => p.message);
  const CARDS = "## Clients\nclient c1: the browser\n## Servers\nserver s1: the API\n";
  test("a colour or a pixel size reads 'no colour value', never 'no a colour value'", () => {
    const m = msgs(HEAD + CARDS.replace("the browser", "the browser #ff0000") + "@step One: one.\nc1 -> s1: GET 40px\n@step Two: two.\ns1 -> c1: ok\n```\n");
    expect(m.some((x) => x.includes("no colour value (#ff0000)"))).toBe(true);
    expect(m.some((x) => x.includes("no pixel size (40px)"))).toBe(true);
    expect(m.filter((x) => x.includes("no a "))).toEqual([]);
  });
  test("one @step is refused once", () => {
    const m = msgs(HEAD + CARDS + "@step One: one.\nc1 -> s1: GET\n```\n");
    expect(m).toEqual(["[part data] animation: a scene has at least 2 steps, or none (a still scene)"]);
  });
});
