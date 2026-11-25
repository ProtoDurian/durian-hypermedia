import { expect, test } from "bun:test";
import { parse, llmView, check } from "../src/index";

test("map is a registered part with regions, arcs and a globe", () => {
  const doc = parse('```map title="Regional links" view=globe spin=off\nfill DE 83.2\nfill FR 68.4\narc DE -> FR 12 "Daily flow" [c2]\n```');
  const block = doc.blocks.find(b => b.type === "map");
  expect(block).toBeDefined();
  expect(check(doc).filter(p => p.level === "error")).toEqual([]);
  expect(llmView(doc)).toContain("83.2");
  expect(llmView(doc)).toContain("Daily flow");
});
test("calendar is a registered part that expands a bounded repeat", () => {
  const doc = parse('```calendar title="Release week" tz=UTC date=2026-11-23 view=week\ncalendar eng "Engineering" [c2]\n2026-11-23 09:00-09:15 Stand-up in eng every weekday times=5\n```');
  const block = doc.blocks.find(b => b.type === "calendar");
  expect(block).toBeDefined();
  expect(check(doc).filter(p => p.level === "error")).toEqual([]);
  expect(llmView(doc)).toContain("Stand-up");
});
