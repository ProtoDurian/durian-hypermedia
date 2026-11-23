// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// on a phone a connector label never runs past the stage's edge. A step's labels
// keep clear only of labels drawn in the same step, so a later step reuses the places of labels no longer drawn.
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

// the repro: three lanes; six steps, each clears and sends two messages
const HEAD = "title: Three lanes | many messages, one pair of lanes at a time\n## Browser\nclient a: browser\n## Proxy\napi b: proxy\n## Server\nstore c: server\n";
const STEPS = [1, 2, 3, 4, 5, 6].map((k) => ({ title: `S${k}: Message ${k}.`, raw: `clear\na -> b: message ${k}\nb -> c: message ${k}\n`, line: k * 10 }));
const ROLES = { client: 1, api: 2, store: 3 };
const labels = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.["edge-label"] !== undefined);
beforeEach(() => beginDocument());

for (const w of [390, 360]) test(`no label runs past the stage's edge at ${w}`, () => {
  const c = compileStage(HEAD, STEPS, 1, {}, ROLES);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, w), ls = labels(p.items);
  expect(p.narrow).toBe(true);
  expect(ls.length).toBe(12);
  for (const b of ls) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(w); }
});

test("labels of one step do not overlap; a later step reuses the places of labels no longer drawn", () => {
  const c = compileStage(HEAD, STEPS, 1, {}, ROLES);
  const ls = labels(layoutStage(c.model, 390).items);
  for (let k = 1; k <= 6; k++) {
    const here = ls.filter((b) => b.on?.includes(k));
    expect(here.length).toBe(2);
    for (const a of here) for (const b of here) if (a !== b && Math.abs(a.y - b.y) < 20) expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
  }
  // nothing piles up to the right: every label stays inside the stage and stands by its own line, within 24 px (a line too short
  // for its chip, between two cards, keeps it in the gap just under them)
  // (so it is never set apart at the stage's edge)
  const p = layoutStage(c.model, 390), paths = p.items.filter((i): i is Extract<Item, { k: "path" }> => i.k === "path");
  for (const b of ls) {
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(390);
    const k = b.on![0];
    let d = 1e9; for (const q of paths.filter((q) => q.on?.includes(k))) for (let i = 1; i < q.pts.length; i++) for (let u = 0; u <= 1; u += 0.05) { const x = q.pts[i - 1][0] + (q.pts[i][0] - q.pts[i - 1][0]) * u, y = q.pts[i - 1][1] + (q.pts[i][1] - q.pts[i - 1][1]) * u; d = Math.min(d, Math.max(b.x - x, 0, x - (b.x + b.w)) + Math.max(b.y - y, 0, y - (b.y + b.h))); }
    expect(d).toBeLessThanOrEqual(24);
  }
});

test("each label is drawn once, in one place, for all its steps (nothing moves)", () => {
  const c = compileStage(HEAD, STEPS, 1, {}, ROLES);
  const ls = labels(layoutStage(c.model, 390).items), seen = new Map<string, string>();
  // one item per label place: the same words in the same steps (two pairs of one step) never share a place
  for (const b of ls) { const key = `${b.bar?.label}|${b.on?.join(",")}|${Math.round(b.x)},${Math.round(b.y)}`; expect(seen.has(key)).toBe(false); seen.set(key, "") ; expect(b.on?.length).toBeGreaterThan(0); }
});
