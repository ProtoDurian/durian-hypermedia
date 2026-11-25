// 0.7.0-rc.5 (rc.4 review SHOULD 3): on a phone, after a step the reader asked for, the page scrolls the step's lit items
// between the page bar and the floating caption; the lit row of the step's own table counts as lit; when they do not all
// fit one screen, the screenful that holds the most of them (the lit fields and the chosen row together where they can)
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { followBy } from "../../src/ui/stage";

const TSX = readFileSync(join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8");
const at = (top: number, h = 20) => ({ top, bottom: top + h });

test("in view already: no scroll; under the caption: up until the last lit item clears it; over the page bar: down to it", () => {
  expect(followBy([at(100), at(400)], 760)).toBe(0);
  expect(followBy([at(500), at(900)], 760)).toBe(920 - 752);
  expect(followBy([at(20), at(300)], 760)).toBe(20 - 72);
  expect(followBy([], 760)).toBe(0);
});
test("more than a screen: the screenful with the most lit items, from the lit item that starts it", () => {
  // one lit field near the top, a table's chosen row (four cells) 1,200 px further down: the row's screenful wins
  expect(followBy([at(100), at(1300), at(1300), at(1300), at(1300)], 760)).toBe(1300 - 72);
  // two lit fields and a lit row that fit one screenful together, a lone lit item far below: the three first
  expect(followBy([at(100), at(300), at(600), at(1500)], 760)).toBe(100 - 72);
  // a tie: the first such screenful
  expect(followBy([at(100), at(1500)], 760)).toBe(100 - 72);
});
test("the lit cells of the step's own table count as lit (accent ink, drawn in this step only)", () => {
  expect(TSX).toContain('g.stg-i:not(.stg-off)[data-from="${kLive}"][data-to="${kLive}"] text[style*="--acc-ink"]');
  expect(TSX).toMatch(/const by = followBy\(hot, foot\.getBoundingClientRect\(\)\.top\);/);
});
