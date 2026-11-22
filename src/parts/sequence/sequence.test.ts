// The sequence part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted
// at n and 2n, never time), the hand scans against the regular expressions they replace, and the fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import sequence, { declLine, lostLine, msgLine, noteLine, parseSequence, seqLlm } from "./part";
import { layoutSequence } from "./layout";

const fence = (body: string, info = 'title="T"') => `# Page\n\n\`\`\`sequence ${info}\n${body}\n\`\`\`\n`;
const SRC = `actor dev "developer"\nparticipant cli "CLI"\nparticipant tc "template container"\ndev -> cli: cyanprint create\ncli -> tc: init call, all answers\ntc --> cli: question reply\nnote tc: the script stopped at a question\nloop until no question is left\n  cli -> tc: init call, one more answer\n  tc --> cli: question reply\nend\ncli --> dev: project written`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const seq = (body: string, title = "", each = false, lim = LIMITS, budget?: Budget) => parseSequence(body, 1, title, each, lim, budget);
const errorsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);
const has = (e: { msg: string }[], re: RegExp) => expect(e.some((x) => re.test(x.msg))).toBe(true);

describe("sequence: parse and the LLM view", () => {
  test("a good sequence is a block with its data and no problems", () => {
    const doc = parse(fence(SRC), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "sequence")!;
    expect(b).toBeDefined();
    if (b.type !== "sequence") throw new Error("not a sequence");
    expect(b.data.participants.map((p) => [p.id, p.kind, p.label])).toEqual([["dev", "actor", "developer"], ["cli", "participant", "CLI"], ["tc", "participant", "template container"]]);
    expect(b.data.items.map((i) => i.t)).toEqual(["msg", "msg", "msg", "note", "open", "msg", "msg", "end", "msg"]);
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("arrows: call, reply, async, lost, to itself", () => {
    const s = seq("participant a\nparticipant b\na -> b: one\nb --> a: two\na ->> b: three\na -x b: four\na -> a: five");
    expect(s.errors).toEqual([]);
    expect(s.items.map((i: any) => i.arrow)).toEqual(["call", "reply", "async", "lost", "call"]);
  });
  test("a participant used with no line is added at the end", () => {
    const s = seq("participant a\na -> z: hi");
    expect(s.errors).toEqual([]);
    expect(s.participants.map((p) => p.id)).toEqual(["a", "z"]);
    expect(seq("a -> z: hi\nparticipant a \"Alpha\"").participants.map((p) => [p.id, p.label, p.implicit])).toEqual([["a", "Alpha", false], ["z", "z", true]]);
  });
  test("the LLM view is the numbered list, and the page's LLM view carries it", () => {
    const want = seqLlm(seq(SRC, "One init call"));
    expect(want).toMatch(/^Sequence: One init call\. Participants: developer \(actor\), CLI, template container\./);
    expect(want).toContain("1. dev -> cli: cyanprint create");
    expect(want).toMatch(/loop until no question is left:\n {3}4\. cli -> tc: init call, one more answer\n {3}5\. tc --> cli: question reply\n6\. cli --> dev: project written$/);
    expect(parse(fence(SRC, 'title="One init call"'), { path: "p.dh.md" }).llm).toContain(want);
  });
  test("an else line keeps the depth of its block in the LLM view", () => {
    const t = seqLlm(seq("participant a\nparticipant b\nalt it works\n  a -> b: go\nelse it fails\n  b --> a: sorry\nend"));
    expect(t).toMatch(/alt it works:\n {3}1\. a -> b: go\nelse it fails:\n {3}2\. b --> a: sorry$/);
  });
  test("steps: messages under @step, and steps=each", () => {
    const s = seq("participant a\nparticipant b\n@step first\na -> b: x\n@step second\nb --> a: y");
    expect(s.steps.map((t) => t.title)).toEqual(["first", "second"]);
    expect(s.items.map((i) => i.step)).toEqual([0, 1]);
    expect(seqLlm(s)).toContain("first\n1. a -> b: x\nsecond\n2. b --> a: y");
    const e = seq("participant a\nparticipant b\na -> b: x\nb --> a: y\na -> b: z", "", true);
    expect(e.errors).toEqual([]); expect(e.steps.map((t) => t.title)).toEqual(["x", "y", "z"]); expect(e.items.map((i) => i.step)).toEqual([0, 1, 2]);
  });
  test("steps=each: a block opens with its first message, a note and an end join the message before", () => {
    const e = seq("participant a\nparticipant b\na -> b: one\nloop again\na -> b: two\nnote a: aside\nb --> a: three\nend\nnote b: last", "", true);
    expect(e.errors).toEqual([]);
    expect(e.items.map((i) => [i.t, i.step])).toEqual([["msg", 0], ["open", 1], ["msg", 1], ["note", 1], ["msg", 2], ["end", 2], ["note", 2]]);
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(SRC) + "\n:::llm\nA CLI talks to a template container.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("A CLI talks to a template container.");
    expect(doc.llm).not.toContain("Participants:");
  });
});

describe("sequence: every refusal names the line and the fix", () => {
  const two = "participant a\nparticipant b\n";
  const cases: [string, string, RegExp][] = [
    ["an end with no block", two + "a -> b: x\nend", /"end" with no block open/],
    ["an else with no block", two + "else x\na -> b: x", /"else" with no block open/],
    ["an and with no block", two + "and x\na -> b: x", /"and" with no block open/],
    ["an else in a loop", two + "loop x\nelse y\na -> b: x\nend", /"else" inside a loop block/],
    ["an and in an alt", two + "alt x\nand y\na -> b: x\nend", /"and" inside a alt block/],
    ["a block never closed", two + "loop x\na -> b: x", /the loop block is never closed/],
    ["a message with no text", two + "a -> b:", /a message with no text/],
    ["a note with no text", two + "a -> b: x\nnote a:", /a note with no text/],
    ["blocks 4 deep", two + "loop 1\nloop 2\nloop 3\nloop 4\na -> b: x\nend\nend\nend\nend", /blocks nest 3 deep at most/],
    ["an unknown kind", "gizmo a \"A\"\nparticipant b\na -> b: x", /unknown participant kind "gizmo"/],
    ["a participant twice", "participant a\nparticipant a\na -> a: x", /participant "a" is declared twice/],
    ["mermaid's as", "participant A as Bee\nparticipant b\nA -> b: x", /write participant a "Bee"/],
    ["an id with a bad character", "participant a$b\nparticipant b\nb -> b: x", /"a\$b" is not an id/],
    ["a line that is none of these", two + "some odd thing here\na -> b: x", /is not a participant, a message/],
    ["no message at all", two, /a sequence has no message/],
    ["13 participants", Array.from({ length: 13 }, (_, k) => `participant p${k}`).join("\n") + "\np0 -> p1: x", /13 participants; at most 12/],
    ["more than 200 lines", "participant a\nparticipant b\n" + Array.from({ length: 202 }, () => "a -> b: x").join("\n"), /at most 200 lines/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.some((m) => m.includes("sequence:"))).toBe(true);
  });
  test("steps=each with @step lines, and with one message", () => {
    expect(errorsOf(fence(two + "@step x\na -> b: y\n@step z\nb -> a: w", 'steps=each')).some((m) => /steps=each makes every message a step/.test(m))).toBe(true);
    expect(errorsOf(fence(two + "a -> b: y", 'steps=each')).some((m) => /steps=each needs at least 2 messages/.test(m))).toBe(true);
  });
  test("a steps word that is not each, and an unknown attribute", () => {
    expect(errorsOf(fence(two + "a -> b: y", 'steps=all')).some((m) => /steps=all is not a word; write steps=each/.test(m))).toBe(true);
    expect(errorsOf(fence(two + "a -> b: y", 'speed=3')).some((m) => /unknown attribute "speed"/.test(m))).toBe(true);
    expect(errorsOf(fence(two + "a -> b: y", 'title="T" static=1 #one')).length).toBe(0);
  });
});

describe("sequence: layout", () => {
  test("rows grow with wrapped text, heads exist, the box is fixed by the spec alone", () => {
    const s = seq(SRC), L = layoutSequence(s);
    expect(L.cols.length).toBe(3); expect(L.rows.length).toBe(s.items.length); expect(L.h).toBeGreaterThan(200);
    expect(L.acts.length).toBeGreaterThan(0);
    const long = layoutSequence(seq("participant a\nparticipant b\na -> b: " + "word ".repeat(40)));
    const short = layoutSequence(seq("participant a\nparticipant b\na -> b: hi"));
    expect(long.h).toBeGreaterThan(short.h);
    expect(layoutSequence(s).h).toBe(L.h);   // the same spec twice gives the same box (the controls under it never move)
  });
  test("an activation bar runs from a call to its reply", () => {
    const L = layoutSequence(seq("participant a\nparticipant b\nparticipant c\na -> b: ask\nb -> c: pass on\nc --> b: back\nb --> a: answer\na -> c: other\nnote a: no reply for this"));
    expect(L.acts.map((a) => a.col)).toEqual([1, 2]);   // b from a's call to its reply, c from b's call; the last call has no reply
    expect(L.acts[0].y2).toBeGreaterThan(L.acts[1].y2);
    expect(L.acts.every((a) => a.y2 > a.y1)).toBe(true);
  });
  test("a layout of small input that does large work is refused by its budget", () => {
    const s = seq("participant a\nparticipant b\n" + "a -> b: x\n".repeat(150));
    expect(() => layoutSequence(s, new Budget({ steps: 300, values: 1e9, chars: 1e9 }, null, null, "the sequence part"))).toThrow(/the sequence part/);
  });
});

describe("sequence: caps in both sets", () => {
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.sequenceParticipants).toBe(12);
    expect(LIMITS.sequenceItems).toBe(200);
    expect(UNTRUSTED_LIMITS.sequenceItems).toBeLessThanOrEqual(LIMITS.sequenceItems);
    expect(UNTRUSTED_LIMITS.sequenceParticipants).toBeLessThanOrEqual(LIMITS.sequenceParticipants);
  });
  test("over the participant cap: refused by check, at the host's own cap too", () => {
    const body = "participant a\nparticipant b\nparticipant c\na -> b: x\nb -> c: y";
    expect(errorsOf(fence(body))).toEqual([]);
    const errs = check(parse(fence(body), { path: "p.dh.md", limits: { sequenceParticipants: 2 } })).map((p) => p.message);
    expect(errs.some((m) => /3 participants; at most 2/.test(m))).toBe(true);
  });
  test("over the depth cap at the host's own cap", () => {
    const body = "participant a\nparticipant b\nloop 1\nloop 2\na -> b: x\nend\nend";
    expect(errorsOf(fence(body))).toEqual([]);
    expect(check(parse(fence(body), { path: "p.dh.md", limits: { sequenceDepth: 1 } })).some((p) => /blocks nest 1 deep at most/.test(p.message))).toBe(true);
  });
  test("the strict set takes fewer lines", () => {
    const body = "participant a\nparticipant b\n" + Array.from({ length: 130 }, (_, k) => `a -> b: message ${k}`).join("\n");
    expect(check(parse(fence(body), { path: "p.dh.md" })).some((p) => /at most/.test(p.message))).toBe(false);
    expect(check(parse(fence(body), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /a sequence holds at most 120 lines/.test(p.message))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = "participant a\nparticipant b\n" + Array.from({ length: 4000 }, () => "not a line at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the sequence part does too much work/);
    expect(doc.llm).toContain("[sequence not shown: the sequence part does too much work");
  });
});

describe("sequence: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => ['participant a "A"', 'participant b "B"', 'participant c "C"', ...Array.from({ length: n }, (_, k) => `${"abc"[k % 3]} -> ${"abc"[(k + 1) % 3]}: message number ${k} with some words`)].join("\n");
  const cost = (n: number, each = false) => {
    const b = big();
    const s = parseSequence(body(n), 1, "T", each, { sequenceParticipants: 1e9, sequenceItems: 1e9, sequenceDepth: 9 }, b);
    layoutSequence(s, b);
    return b.steps + b.values + b.chars;
  };
  test("parse and layout: twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("steps=each is linear too", () => {
    for (const n of [50, 200, 800]) { const r = cost(2 * n, true) / cost(n, true); expect(r).toBeGreaterThan(1.5); expect(r).toBeLessThan(2.3); }
  });
  test("a long line is read once (no scan per start)", () => {
    for (const mk of [(n: number) => "a -> b: " + "x".repeat(n), (n: number) => "a" + " -".repeat(n) + " b", (n: number) => "note " + "x ".repeat(n), (n: number) => "participant a " + "\"".repeat(n)]) {
      const b1 = big(), b2 = big();
      seq(mk(20_000), "", false, LIMITS, b1); seq(mk(40_000), "", false, LIMITS, b2);
      expect(b2.steps / b1.steps).toBeLessThan(2.2);
    }
  });
  test("a long line of arrows and colons is scanned in linear time", () => {
    const line = (n: number) => ("-> ".repeat(n)) + ":";
    const t0 = performance.now();
    for (const f of [msgLine, lostLine, noteLine, declLine]) f(line(100_000));
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("sequence: hand scans give what the regular expressions they replace gave (5 000 random tricky lines each)", () => {
  // the old patterns live only here, in the test, run on short lines
  const rnd = (() => { let s = 11; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const gen = (parts: string[], max = 8) => { let s = ""; const n = 1 + Math.floor(rnd() * max); for (let j = 0; j < n; j++) s += parts[Math.floor(rnd() * parts.length)]; return s; };
  const J = (x: unknown) => JSON.stringify(x);
  const arr = (m: RegExpMatchArray | null) => (m ? [...m] : null);
  const cases: [string, string[], (s: string) => unknown, (s: string) => unknown][] = [
    ["message", ["a", "b", "dev", " ", "->", "-->", "->>", "-", ">", ":", "x", "c:d"], (s) => arr(s.trim().match(/^(\S+?)\s*(-->|->>|->)\s*(\S+?)\s*:\s*(.*)$/)), (s) => msgLine(s.trim())],
    ["lost message", ["a", "b", " ", "-x", "-", "x", ":", "c:d"], (s) => arr(s.trim().match(/^(\S+)\s+-x\s+(\S+?)\s*:\s*(.*)$/)), (s) => lostLine(s.trim())],
    ["note", ["note", " ", "a", "b", ":", "x y", "\t"], (s) => { const m = s.trim().match(/^note\s+(\S+?)(?:\s+(\S+?))?\s*:\s*(.*)$/); return m ? [m[1], m[2], m[3]] : null; }, (s) => { const n = noteLine(s.trim()); return n ? [n[1], n[2], n[3]] : null; }],
    ["declaration", ["actor", "dev", " ", "x", '"', "A b", "as", "  "], (s) => { const m = s.trim().match(/^([A-Za-z]+)\s+(\S+)(?:\s+"([^"]*)")?\s*$/); return m ? [m[1], m[2], m[3]] : null; }, (s) => { const d = declLine(s.trim()); return d ? [d.kind, d.id, d.label] : null; }],
  ];
  for (const [name, parts, old, now] of cases) test(name, () => {
    let differ = 0;
    for (let k = 0; k < 5000; k++) { const s = gen(parts); if (J(old(s)) !== J(now(s))) differ++; }
    expect(differ).toBe(0);
  });
});

describe("sequence: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every sequence drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "sequence").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      const body = text.slice(text.indexOf("\n", text.indexOf("```sequence")) + 1, text.indexOf("\n```\n", text.indexOf("```sequence")));
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the sequence part");
      expect(() => parseSequence(body, 1, "", false, LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(sequence.name).toBe("sequence");
  expect(sequence.steps).toBe(true);
});
