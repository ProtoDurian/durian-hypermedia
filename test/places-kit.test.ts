import { expect, test } from "bun:test";
import { takeColour, takeQuoted, takeLabel, isDate, dayNum, dayIso, wall, instant, unknownKeys } from "../src/parts/kit/places";

test("shared place scans keep the author's words and separate metadata", () => {
  expect(takeColour('A long label [c2]')).toEqual({ rest: 'A long label', word: 'c2', raw: 'c2' });
  expect(takeQuoted('Name note="Front door"', 'note')).toEqual({rest:'Name',value:'Front door'});
  expect(takeLabel('"Two words" 37.7, -122.4')).toBeDefined();
  expect(unknownKeys({static:'',llm:'own',bad:'x'}, [], 'map')).toHaveLength(1);
});
test("shared dates round-trip leap days and wall clocks in an explicit zone", () => {
  expect(isDate('2024-02-29')).toBe(true);
  expect(isDate('2026-02-29')).toBe(false);
  expect(dayIso(dayNum('2026-11-23'))).toBe('2026-11-23');
  expect(wall(instant('2026-11-23',540,'America/Los_Angeles'),'America/Los_Angeles')).toEqual({date:'2026-11-23',min:540});
});
