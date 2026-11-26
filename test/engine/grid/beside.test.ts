// render2: a step's `beside` reaches the grid layout (parse/lower-stage.ts kept it out, so migrate dropped it too): the
// page review's "counted pieces beside a card" (stage 14) had its squares under the card. Wide: side by side, from one top;
// a phone: stacked, as the composed stage does.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import type { Prim } from "../../../src/engine/types";

const file = join(ROOT, "fixtures/stage/14-animation-counted-pieces-beside-a-card.dh.md"), text = readFileSync(file, "utf8");
const at = (f: Prim[], s: string) => f.find((p): p is Extract<Prim, { k: "text" }> => p.k === "text" && !!p.lines[0]?.startsWith(s))!;
for (const [form, src] of [["old", fencesOf(file, text, "old")[0].src], ["format 12", fencesOf(file, migrate(text), "new")[0].src]] as const) {
  test(`${form}: the counted squares sit beside the card, and under it on a phone`, () => {
    const c = compile(src);
    for (let k = 1; k < c.states.length; k++) {
      const wide = c.plan(1178).frame(k), card = at(wide, "Draft"), units = at(wide, "Stored pieces");
      expect(units.x).toBeGreaterThan(card.x + 300);
      expect(Math.abs(units.y - card.y)).toBeLessThan(30);
      const phone = c.plan(356).frame(k);
      expect(at(phone, "Stored pieces").y).toBeGreaterThan(at(phone, "Draft").y + 30);
    }
  });
}
test("migrate keeps the word", () => expect(migrate(text)).toMatch(/^beside$/m));
