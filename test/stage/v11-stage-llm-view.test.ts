// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
//.2 review MUST 13: the LLM view says what the drawing shows. Four Format page samples disagreed:
// 35 listed 25 drawn dots as "empty" runs; 22 left out the tabs and which bars are lit; 27 listed the inset-only
// row under the overview's range; 21 called a column lit again ("light Dec", no new dots) "New".
import { beforeEach, expect, test } from "bun:test";
import { compileStage, stageLlm } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
const roles = { server: 1, job: 2, store: 3 };
const st = (raw: string[]) => raw.map((r, i) => ({ title: `S${i + 1}: step ${i + 1}.`, raw: r, line: 20 + i * 3 }));
const llm = (head: string, steps: string[]) => { const c = compileStage(head, st(steps), 1, {}, roles); expect(c.errors).toEqual([]); return stageLlm(c); };
beforeEach(() => beginDocument());

test("a [dot] interval is listed as a dot, never as an empty run (sample 35)", () => {
  const v = llm(`time: -150..212 | seconds
row server receiver "Receiver": _ -150..-148 [dot]; _ -135..-133 [dot]; _ 45..47 [dot] @2
row job storage "Storage": received 36..38 [dot] [plain]`, ["", "keep fill receiver", "off receiver"]);
  expect(v).toContain("Receiver: dot -150 to -148, dot -135 to -133, dot 45 to 47 (steps 2 onward)");
  expect(v).toContain("Storage: received (a dot) 36 to 38 (neutral)");
  expect(v).not.toContain("empty");
});

test("an empty run that is not a dot is still called empty", () => {
  expect(llm(`time: 0..10 | s\nrow server a "A": _ 0..4; busy 4..10`, ["", ""])).toContain("A: empty 0 to 4, busy 4 to 10");
});

test("the tabs and every lit bar are listed, with why each is lit (sample 22)", () => {
  const v = llm(`bars 7 server: day of the week · cups ÷ the average | ×
  axis 0, 0.5, 1, 1.5
  line average: 1
  labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  tabs One barista: 1..3; Two baristas: 4`, [
    "values: 0.7 0.8 0.9 1.0 1.4 1.3 0.9\npeak: busiest 1.4×",
    "limit 1.2: cap 1.2×",
    "values: 0.9 0.9 0.9 1.0 1.2 1.2 0.9\nmove 2 from Fri to Mon; 1 from Sat to Tue",
    "values: 0.9 0.9 1.0 1.0 1.1 1.2 0.9\nlight Sat: the busiest",
  ]);
  expect(v).toContain("Tabs: One barista (steps 1 to 3), Two baristas (step 4).");
  const at = (k: number) => v.split("\n").slice(v.split("\n").findIndex((l) => l.startsWith(`${k}. `))).join("\n").split(`\n${k + 1}. `)[0];
  expect(at(1)).toContain("Tab: One barista.");
  expect(at(1)).toContain("Lit bars: Fri 1.4 (the peak).");
  expect(at(2)).not.toContain("Tab:"); // the lit tab is named only where it changes
  expect(at(2)).toContain("Lit bars: Fri 1.4 (the peak), Sat 1.3 (over the limit).");
  // Fri and Sat keep the authored peak highlight at the cap, without an over-cap giving warning.
  expect(at(3)).toContain("Lit bars: Mon 0.9 (takes), Tue 0.9 (takes), Fri 1.2 (the peak; at the limit), Sat 1.2 (the peak; at the limit).");
  expect(at(3)).toContain("Moves: Fri to Mon (2), Sat to Tue (1).");
  expect(at(3)).not.toContain("gives");
  expect(at(2)).not.toContain("at the limit"); // 1.4 and 1.3 are over it
  expect(at(4)).toContain("Tab: Two baristas.");
  expect(at(4)).toContain("Lit bars: Sat 1.2 (lit: the busiest; at the limit).");
});

test("an inset-only row is listed under the inset's range, not the overview's (sample 27)", () => {
  const v = llm(`time: 0..12 | overview
ticks: 0, 4, 8, 12
zoom: 8..12 | enlarged
zoom row job detail "Detail": +working 8..12
row job run "Run": +working 0..12`, ["", ""]);
  const lines = v.split("\n"), over = lines.findIndex((l) => l.startsWith("Time from 0 to 12")), zoom = lines.findIndex((l) => l === "Zoom 8 to 12: enlarged.");
  expect(lines[over + 1]).toBe("  Run: working 0 to 12");
  expect(lines.slice(over, zoom).some((l) => l.includes("Detail"))).toBe(false);
  expect(lines.slice(zoom + 1, zoom + 3)).toEqual(["In the inset only (8 to 12):", "  Detail: working 8 to 12"]);
});

test("a column lit again is 'lit', not 'new'; a column the step adds is new (sample 21)", () => {
  const v = llm(`columns 12 store: books returned each month | books
  labels: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec`, [
    "counts 6: 24, 19, 31, 22, 27, 12",
    "counts 12: 24, 19, 31, 22, 27, 12, 9, 11, 28, 30, 26, 35\nlight Jul..Dec",
    "light Dec",
    "counts 12: 24, 19, 31, 22, 27, 12, 9, 11, 28, 30, 26, 38\nlight Dec, Jan",
  ]);
  expect(v).toContain("New: Jul, Aug, Sep, Oct, Nov, Dec (139 in them).");
  expect(v).not.toContain("New: Dec.");
  expect(v).toContain("Lit, unchanged since the step before: Dec 35.");
  expect(v).toContain("Lit: Dec 38 (3 new since the step before).\n   Lit, unchanged since the step before: Jan 24.");
});

test("a bar the author paints is listed with its paint", () => {
  const v = llm(`bars 3 server: x\n  labels: a, b, c`, ["values: 1 2 3\ntone b bad", "values: 1 2 3"]);
  expect(v).toContain("Lit bars: b 2 (marked bad).");
});

test("bars at the limit with no lit bar are still listed", () => {
  const v = llm(`bars 3 server: x\n  labels: a, b, c`, ["values: 1 2 3\nlimit 2: cap", "values: 1 2 2"]);
  expect(v).toContain("Bars at the limit 2, not lit: b 2, c 2.");
});
