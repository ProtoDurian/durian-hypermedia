// 0.7.0-rc.3 review of the layers example: (1) 'The session, set up and kept' at 800: with no clear place by its
// line, the label 'the server's flight' slid ~140 px down onto the NAT table and hid its words; a label with no clear place
// now covers no words, as near its line as it can. (2) 'The way back': routing table T3's cells were cut ('longest:…') and
// its prefixes broken inside; a plain table's cell takes the lines it needs and a column is at least its longest word.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
import { measure, type Item } from "../../src/core/stage-core";

const SRC = readFileSync(join(import.meta.dir, "../../fixtures/stage/example-layers.dh.md"), "utf8");
const fm = SRC.slice(0, SRC.indexOf("\n---\n", 4)), roles: Record<string, number> = {};
for (const m of fm.slice(fm.indexOf("\nroles:\n")).matchAll(/^  ([a-z][\w-]*): (?:c(\d)|\{[^}]*colour: c(\d)[^}]*\})/gm)) roles[m[1]] = +(m[2] ?? m[3]);
const section = (title: string) => SRC.slice(SRC.indexOf(`\n## ${title}\n`)).match(/^```animation[^\n]*\n([\s\S]*?)^```$/m)![1];
const lay = (src: string, w: number) => {
  const parts = src.split(/^@step /m), steps = parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: i + 1 }; });
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const c = compileStage(parts[0], steps, 1, {}, roles); expect(c.errors).toEqual([]);
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); return layoutStage(c.model, w).items;
};
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));

for (const w of [800, 766]) test(`'The session, set up and kept' at ${w}, step 5: the server's flight label covers no words`, () => {
  const its = lay(section("2. The session, set up and kept"), w);
  const chips = its.filter((i): i is Box => i.k === "box" && (i as { bar?: Record<string, string> }).bar?.["edge-label"] === "the server's flight" && shown(i, 5));
  expect(chips.length).toBe(2);
  for (const c of chips) {
    const under = its.filter((t): t is Text => t.k === "text" && shown(t, 5) && t.s !== "the server's flight" && !(t as { bar?: Record<string, string> }).bar?.["edge-label"]).filter((t) => { const tw = measure(t.s, t.f), lx = t.anchor === "middle" ? t.x - tw / 2 : t.anchor === "end" ? t.x - tw : t.x; return c.x + c.w > lx && c.x < lx + tw && c.y + c.h > t.y - 10 && c.y < t.y + 2; });
    expect(under.map((t) => t.s)).toEqual([]);
  }
});

for (const w of [1180, 800, 766]) test(`'The way back' at ${w}, step 3: routing table T3 keeps every word and every prefix whole`, () => {
  const its = lay(section("8. The way back"), w).filter((i): i is Text => i.k === "text" && shown(i, 3) && /^r\d$/.test(String((i as { bar?: Record<string, string> }).bar?.column)));
  expect(its.filter((t) => t.s.endsWith("…"))).toEqual([]);
  const words = new Set(its.flatMap((t) => t.s.split(" ")));
  for (const p of ["198.51.100.6/31", "198.51.100.200/31", "198.51.100.196/30", "198.51.100.128/26", "198.51.100.0/24", "203.0.113.0/24", "0.0.0.0/0"]) expect(words.has(p)).toBe(true);
  expect(its.map((t) => t.s).join(" ")).toContain("longest: chosen");
});
// 0.7.0-rc.3 review: the column minimum by the wider drawn estimate narrowed T4's other columns and wrapped cells that
// fit; widths go by measure() (the page font's): T4's cells stay one line each at 732
test("'The way back' at 732, step 2: routing table T4's cells stay one line each", () => {
  const its = lay(section("8. The way back"), 732).filter((i): i is Text => i.k === "text" && shown(i, 2) && /^r\d$/.test(String((i as { bar?: Record<string, string> }).bar?.column)));
  expect(its.length).toBe(4 * 7);
  for (const s of ["BGP, from AS 64496", "radio to A: matches, longest: chosen", "default (set by hand)"]) expect(its.map((t) => t.s)).toContain(s);
});
// 0.7.0-rc.3 review: on a phone the floating footer never hides the step's lit items: after a step the READER asked for, the page
// scrolls them above it; never on Play's own steps and never against a scroll in progress
const TSX = readFileSync(join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8");
test("the step scroll follows only a step the reader asked for: never on load, never on Play's own steps", () => {
  expect(TSX).toMatch(/const go = \(x: number\) => \{ setPlaying\(false\); wantFollow\.current = true; setK\(/);
  expect(TSX).toMatch(/if \(!wantFollow\.current\) return; wantFollow\.current = false;/);
  expect(TSX).toContain("setTimeout(() => setK((x) => Math.min(n, x + 1)), 3200)"); // Play's advance does not ask for it
  expect((TSX.match(/wantFollow\.current = true/g) ?? []).length).toBe(1);
  expect(TSX).toMatch(/matchMedia\("screen and \(max-width: 560px\)"\)/);
});
test("the step scroll waits 800 ms after the reader moved the page (wheel, touch move, scroll keys, a scroll it did not make)", () => {
  expect(TSX).toMatch(/const USER_SCROLL_MS = 800;/);
  expect(TSX).toMatch(/if \(performance\.now\(\) - userScrollAt < USER_SCROLL_MS\) return;/);
  for (const ev of ["wheel", "touchmove", "scroll", "keydown"]) expect(TSX).toContain(`addEventListener("${ev}"`);
  expect(TSX).not.toContain('addEventListener("touchstart"'); // a tap on a step button is not a move
  expect(TSX).toMatch(/ownScrollUntil = performance\.now\(\) \+ \d+;[^\n]*\n\s*scrollBy\(/);
});
