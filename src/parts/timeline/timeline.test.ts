// The timeline part: parse, LLM view, every refusal, its caps in both sets, the doubling test (budget charges counted at
// n and 2n, never time), the hand scans against the regular expressions they replace, and the fixtures.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS, UNTRUSTED_LIMITS } from "../../index";
import { Budget, partLimitsOf } from "../../core/budget";
import timeline, { dateLine, noteAtEnd, parseTimeline, takeColour, timelineLlm } from "./part";

const fence = (body: string, info = 'title="T"') => `# Page\n\n\`\`\`timeline ${info}\n${body}\n\`\`\`\n`;
const SRC = `2026-05-04 Design review [c1]\n  Scope and owners agreed\n2026-09 First release [c2] note="the big one"\n2026-11-23 Version 2 ships [good]`;
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
const tl = (body: string, title = "", across = false, lim: { timelineEvents: number } = LIMITS, budget?: Budget) => parseTimeline(body, 1, title, across, lim, budget);
const errorsOf = (src: string) => check(parse(src, { path: "p.dh.md" })).filter((p) => p.level === "error").map((p) => p.message);
const has = (e: { msg: string }[], re: RegExp) => expect(e.some((x) => re.test(x.msg))).toBe(true);

describe("timeline: parse and the LLM view", () => {
  test("a good timeline is a block with its data and no problems", () => {
    const doc = parse(fence(SRC, 'title="A release plan"'), { path: "p.dh.md" });
    const b = doc.blocks.find((x) => x.type === "timeline")!;
    expect(b).toBeDefined();
    if (b.type !== "timeline") throw new Error("not a timeline");
    expect(b.data.events.map((e) => e.date)).toEqual(["2026-05-04", "2026-09", "2026-11-23"]);
    expect(b.data.events[1].note).toBe("the big one");
    expect(b.data.events[0].detail).toEqual(["Scope and owners agreed"]);
    expect(b.data.events.map((e) => e.colour)).toEqual(["c1", "c2", "good"]);
    expect(b.llmKind).toBe("own");
    expect(check(doc)).toEqual([]);
    expect(JSON.parse(JSON.stringify(b.data))).toEqual(b.data);   // plain data: parse on a server, draw in a browser
  });
  test("a year, a month and a day; a note without quotes; no colour", () => {
    const t = tl('2026-11-23 Ships [good] note="a b"\n2026-11-24 Next note=soon\n2026-11-25 Plain\n2027 A year');
    expect(t.errors).toEqual([]);
    expect(t.events.map((e) => [e.title, e.colour, e.note])).toEqual([["Ships", "good", "a b"], ["Next", "", "soon"], ["Plain", "", ""], ["A year", "", ""]]);
  });
  test("the LLM view is the dated list, and the page's LLM view carries it", () => {
    const t = timelineLlm(tl(SRC + "\n  and a second detail", "A release plan"));
    expect(t).toBe("Timeline: A release plan.\n- 2026-05-04: Design review — Scope and owners agreed\n- 2026-09: First release (the big one)\n- 2026-11-23: Version 2 ships — and a second detail");
    expect(parse(fence(SRC, 'title="A release plan"'), { path: "p.dh.md" }).llm).toContain("- 2026-09: First release (the big one)");
  });
  test("steps: the LLM view says the caption before each step's events; dir=across is data", () => {
    const t = tl("2026 One\n@step first\n2026-03 Two\n@step second\n2026-06 Three", "", true);
    expect(t.across).toBe(true);
    expect(t.steps.map((s) => s.title)).toEqual(["first", "second"]);
    expect(t.events.map((e) => e.step)).toEqual([-1, 0, 1]);
    expect(timelineLlm(t)).toBe("Timeline.\n- 2026: One\nfirst\n- 2026-03: Two\nsecond\n- 2026-06: Three");
    const doc = parse(fence("2026 One\n2026-03 Two", 'dir=across'), { path: "p.dh.md" });
    expect((doc.blocks.find((b) => b.type === "timeline") as any).data.across).toBe(true);
  });
  test("a :::llm after it replaces its LLM view", () => {
    const doc = parse(fence(SRC) + "\n:::llm\nThree dates of a release.\n:::\n", { path: "p.dh.md" });
    expect(doc.llm).toContain("Three dates of a release.");
    expect(doc.llm).not.toContain("- 2026-05-04");
  });
});

describe("timeline: every refusal names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["no date", "First release", /does not start with a date/],
    ["a month of 13", "2026-13-01 x", /month is 01 to 12/],
    ["a month of 00", "2026-00 x", /month is 01 to 12/],
    ["a day of 40", "2026-05-40 x", /day is 01 to 31/],
    ["a day of 00", "2026-05-00 x", /day is 01 to 31/],
    ["a half date", "2026-5-4 x", /does not start with a date/],
    ["a hex colour", "2026 x [#fff]", /unknown colour "#fff"/],
    ["a detail first", "  detail first\n2026 x", /no event above/],
    ["no title", "2026 [c1]", /the event on 2026 has no title/],
    ["no event", "// nothing", /has no event/],
    ["81 events", Array.from({ length: 81 }, (_, k) => `2026 e${k}`).join("\n"), /more than 80 events/],
  ];
  for (const [what, body, re] of cases) test(what, () => {
    const errs = errorsOf(fence(body));
    expect(errs.some((m) => re.test(m))).toBe(true);
    expect(errs.some((m) => m.includes("timeline:"))).toBe(true);
  });
  test("out of order is a warning, not a refusal", () => {
    const t = tl("2026-05-04 b\n2026-01-01 a");
    expect(t.errors).toEqual([]);
    expect(t.warnings.length).toBe(1);
    has(t.warnings, /list events from oldest to newest/);
    expect(tl("2026-05-04 b\n2027 a").warnings).toEqual([]);   // different kinds of date are not compared
    const probs = check(parse(fence("2026-05-04 b\n2026-01-01 a"), { path: "p.dh.md" }));
    expect(probs.filter((p) => p.level === "warn").length).toBe(1);
  });
  test("a direction that is not one, and an unknown attribute", () => {
    expect(errorsOf(fence(SRC, "dir=up")).some((m) => /dir=up is not a direction; write dir=across/.test(m))).toBe(true);
    expect(errorsOf(fence(SRC, "speed=3")).some((m) => /unknown attribute "speed"/.test(m))).toBe(true);
    expect(errorsOf(fence(SRC, 'title="T" dir=down static=1 #one'))).toEqual([]);
  });
});

describe("timeline: caps in both sets", () => {
  const events = (n: number) => Array.from({ length: n }, (_, k) => `2026 e${k}`).join("\n");
  test("its caps are in LIMITS and UNTRUSTED_LIMITS", () => {
    expect(LIMITS.timelineEvents).toBe(80);
    expect(UNTRUSTED_LIMITS.timelineEvents).toBeLessThanOrEqual(LIMITS.timelineEvents);
  });
  test("over the event cap: refused by check, at the host's own cap too", () => {
    expect(errorsOf(fence(events(30))).filter((m) => !/LLM text present/.test(m))).toEqual([]);
    expect(check(parse(fence(events(12)), { path: "p.dh.md", limits: { timelineEvents: 10 } })).some((p) => /more than 10 events/.test(p.message))).toBe(true);
  });
  test("the strict set takes fewer events", () => {
    expect(errorsOf(fence(events(60))).filter((m) => !/LLM text present/.test(m))).toEqual([]);
    expect(check(parse(fence(events(60)), { path: "p.dh.md", limits: UNTRUSTED_LIMITS })).some((p) => /more than 50 events/.test(p.message))).toBe(true);
  });
  test("over the page's work budget: refused with the part's name, drawn as an error, never a hang", () => {
    const body = "2026 one\n" + Array.from({ length: 4000 }, () => "not a line at all").join("\n");
    const doc = parse(fence(body), { path: "p.dh.md", limits: { maxEvalSteps: 2000 } });
    const err = doc.blocks.find((b) => b.type === "error");
    expect(err && err.type === "error" && err.message).toMatch(/^the timeline part does too much work/);
    expect(doc.llm).toContain("[timeline not shown: the timeline part does too much work");
  });
});

describe("timeline: linear (the doubling test, charges counted)", () => {
  const body = (n: number) => Array.from({ length: n }, (_, k) => `2026-${String(1 + (k % 12)).padStart(2, "0")}-${String(1 + (k % 28)).padStart(2, "0")} Event ${k} [c${1 + (k % 8)}] note="a note ${k}"\n  detail for ${k}`).join("\n");
  const cost = (n: number) => { const b = big(); tl(body(n), "T", false, { timelineEvents: 1e9 }, b); return b.steps + b.values + b.chars; };
  test("twice the input costs at most about twice", () => {
    for (const n of [50, 200, 800]) {
      const r = cost(2 * n) / cost(n);
      expect(r).toBeGreaterThan(1.5);
      expect(r).toBeLessThan(2.3);
    }
  });
  test("a very long line of spaces and brackets is read in one pass: its charge is the line, once", () => {
    const line = (n: number) => "2026-11-23 " + " [".repeat(n) + " x";
    const b1 = big(), b2 = big();
    tl(line(20_000), "", false, LIMITS, b1); tl(line(40_000), "", false, LIMITS, b2);
    expect(b2.steps / b1.steps).toBeLessThan(2.2);
    for (const mk of [(n: number) => "2026" + " ".repeat(n) + "x", (n: number) => "2026-11-23 x" + " note=".repeat(n), (n: number) => "2026-11-23 " + "x".repeat(n) + "\"".repeat(n)]) {
      const c1 = big(), c2 = big();
      tl(mk(20_000), "", false, LIMITS, c1); tl(mk(40_000), "", false, LIMITS, c2);
      expect(c2.steps / c1.steps).toBeLessThan(2.2);
    }
  });
});

describe("timeline: hand scans give what the regular expressions they replace gave (5 000 random tricky lines each)", () => {
  const rnd = (() => { let s = 11; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const gen = (parts: string[], max = 8) => { let s = ""; const n = 1 + Math.floor(rnd() * max); for (let j = 0; j < n; j++) s += parts[Math.floor(rnd() * parts.length)]; return s; };
  const J = (x: unknown) => JSON.stringify(x);
  const cases: [string, string[], (s: string) => unknown, (s: string) => unknown][] = [
    ["date", ["2026", "-", "11", "23", "1", " ", "x", "\t"], (s) => { const m = s.trim().match(/^(\d{4}(?:-\d{2}(?:-\d{2})?)?)\s+(.+)$/); return m ? [m[1], m[2]] : null; }, (s) => dateLine(s.trim())],
    ["note at the end", ["Ship", " ", "note=", '"', "a b", "x", "[c1]"], (s) => { const m = s.match(/\s+note="([^"]*)"\s*$/) ?? s.match(/\s+note=(\S+)\s*$/); return m ? [m[1], s.slice(0, m.index).trimEnd()] : null; }, (s) => { const n = noteAtEnd(s); return n ? [n[0], n[1].trimEnd()] : null; }],
    ["colour", ["a", " ", "[", "]", "c1", "x y"], (s) => { const m = s.match(/^(.*?)\s*\[([^\]]*)\]\s*$/); return m ? [m[1].trim(), m[2].trim()] : null; }, (s) => { const c = takeColour(s); return c.has ? [c.head, c.raw] : null; }],
  ];
  for (const [name, parts, old, now] of cases) test(name, () => {
    let differ = 0;
    for (let k = 0; k < 5000; k++) { const s = gen(parts); if (J(old(s)) !== J(now(s))) differ++; }
    expect(differ).toBe(0);
  });
});

describe("timeline: fixtures", () => {
  const dir = join(import.meta.dir, "fixtures");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md"))) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.startsWith("good-")) test(`${f}: no problems, every timeline drawn`, () => {
      const doc = parse(text, { path: f });
      expect(check(doc)).toEqual([]);
      expect(doc.blocks.filter((b) => b.type === "timeline").length).toBeGreaterThan(0);
    });
    if (f.startsWith("hostile-")) test(`${f}: refused with a message, within its budget, in both sets`, () => {
      for (const limits of [LIMITS, UNTRUSTED_LIMITS]) {
        const doc = parse(text, { path: f, limits });
        const errs = check(doc).filter((p) => p.level === "error");
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.every((p) => p.line >= 1)).toBe(true);
      }
      const at = text.indexOf("```timeline"), body = text.slice(text.indexOf("\n", at) + 1, text.indexOf("\n```\n", at));
      const b = new Budget(partLimitsOf(LIMITS), null, null, "the timeline part");
      expect(() => parseTimeline(body, 1, "", false, LIMITS, b)).not.toThrow();
    });
  }
});

test("the definition matches its folder", () => {
  expect(timeline.name).toBe("timeline");
  expect(timeline.steps).toBe(true);
});

describe("timeline: no coloured edge on the cards", () => {
  const css = readFileSync(join(import.meta.dir, "style.css"), "utf8");
  test("the card has a plain 1 px frame: no thick coloured side (the dot and the line carry the colour)", () => {
    const card = css.match(/\.timeline-card\s*\{([^}]*)\}/)![1];
    expect(card).not.toMatch(/border-(left|inline-start)/);
    expect(card).not.toMatch(/box-shadow/);
    expect(card).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(css).not.toMatch(/border-left:\s*[2-9]px/);
  });
  test("the dot is still the event's colour and the line still joins the events, down and across", () => {
    expect(css).toMatch(/\.timeline-item::after\s*\{[^}]*background:\s*var\(--tc, var\(--timeline-dot\)\)/);
    expect(css).toMatch(/\.timeline-item::before\s*\{[^}]*background:\s*var\(--timeline-line\)/);
    expect(css).toMatch(/\.is-across \.timeline-item\s*\{[^}]*border-top:\s*2px solid var\(--timeline-line\)/);
  });
});
