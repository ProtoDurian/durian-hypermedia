// rc.2 second review, MUST 1 and 4: sample 31 draws no reply where its caption says none comes; sample 38 counts pieces
// (not parcels) and names its markers in plain words; the LLM view follows.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { llmView, parse } from "../../src/document";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "../../fixtures/stage", name), "utf8");

test("31: no reply reaches the draft, so no arrow from the copy to the draft is drawn; the caption carries it", () => {
  const src = fixture("31-animation-roomy-rows-across-a-phone.dh.md"), view = llmView(parse(src));
  expect(src).toMatch(/@step Copy: The copy is ready, but no reply reaches the draft\./);
  expect(src).not.toMatch(/arrow copy -> draft/);
  expect(view).toMatch(/no reply reaches the draft/);
  expect(view).not.toMatch(/copy to draft/);
});

test("38: one square per piece, a plain time unit, marker names in plain words", () => {
  const src = fixture("38-animation-compact-desktop-tick-headers.dh.md"), view = llmView(parse(src));
  expect(view).toMatch(/one square per piece/);
  expect(view).not.toMatch(/per parcel/);
  expect(view).not.toMatch(/previousTick|currentTick/);
  expect(view).toMatch(/previous tick/); expect(view).toMatch(/current tick/);
});
