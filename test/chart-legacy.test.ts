// The plain charts are unchanged: every fixture and the plain charts of test/legacy give the same doccheck issues, the same
// first evaluation and the same LLM view as before the version 11 chart words (the snapshot was taken on that commit).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshot } from "./legacy/snapshot";

const ROOT = join(import.meta.dir, "..");
test("plain charts: issues, evaluation and LLM view match the snapshot from before the chart words", async () => {
  const want = JSON.parse(readFileSync(join(import.meta.dir, "legacy/base.snap.json"), "utf8"));
  const got = JSON.parse(JSON.stringify(await snapshot(ROOT)));
  expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(got[k], k).toEqual(want[k]);
});
test("a plain scatter with a number range on x is valid", async () => {
  const { parse, check } = await import("../src/index");
  const doc = parse("```chart\nkind: scatter\nx: { min: 1, max: 3 }\nseries:\n  - { name: s, data: [[1, 2], [3, 4]] }\n```\n", { path: "a.dh.md" });
  expect(check(doc).filter((i: any) => i.level === "error")).toEqual([]);
});
