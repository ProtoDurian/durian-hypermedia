// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "scards": struck words are drawn faded with a slash in the bad tone across them (the originals' look), not an
// ink line-through; the look is theme tokens (--stg-struck-fade, --stg-struck-line, --stg-struck-w in site/src/stage.css).
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { Stage } from "../../src/ui/stage";
import { UI } from "../../src/ui/ui";
import { beginDocument } from "../../src/core/stage-budget";

const ROLES = { hub: 1, desk: 2, plain: 0 };
const html = (head: string, steps: [string, string][]) => { beginDocument(); return renderToString(React.createElement(Stage, { src: { head, steps: steps.map(([title, raw], i) => ({ title, raw, line: 20 + i })), base: 1, info: {} }, roles: ROLES, ui: UI.en })); };
const cells = Array.from({ length: 20 }, (_, i) => String(i)).join(", ");

describe("struck words: in their tone, a straight bad-tone line over the whole word (the originals)", () => {
  // a sheet whose row value is struck from step two ("(bad struck)")
  const out = html(`sheet: kilns | 2 of 9\nhub k0: kiln east | 2 probes\n  plain pa "probe A": ${cells}\n  plain pb "probe B": ${cells}\n=> desk out: the yard | adds`,
    [["One", "value pa pb: last first | 57, kept one"], ["Two", "value pa pb: kept | 60.00, gone one (bad struck)"]]);
  test("a struck word carries the faded class and a slash line follows it, in the same group", () => {
    expect(out).toMatch(/class="stg-t stg-f-[a-z-]+ stg-struck"[^>]*>gone one</);
    expect(out).toMatch(/gone one<\/text><line class="stg-struck-line"/);
  });
  test("no ink line-through anywhere, and a kept word is not struck", () => {
    expect(out).not.toMatch(/line-through/);
    expect(out).not.toMatch(/stg-struck"[^>]*>kept one</);
  });
  test("the line spans the word's width and runs straight", () => {
    const m = out.match(/<line class="stg-struck-line" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/)!;
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    expect(x2 - x1).toBeGreaterThan(40); expect(y1).toBe(y2);
  });
});

describe("a crossed card ('cross ids'): a large X in the struck line's colour, no box", () => {
  const out = html(`## A\nhub p1: pod one | down\nhub p2: pod two`, [["One", ""], ["Two", "cross p1"]]);
  test("two crossing lines of class stg-cross-line inside a stg-cross group, and no rect for it", () => {
    const g = out.match(/<g[^>]*class="[^"]*stg-cross[^"]*"[^>]*>(.*?)<\/g>/);
    expect(g).toBeTruthy();
    const ls = [...g![1].matchAll(/<line class="stg-cross-line" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)].map((m) => m.slice(1).map(Number));
    expect(ls.length).toBe(2);
    expect(ls[0][2] - ls[0][0]).toBeGreaterThan(40); expect(ls[0][3]).toBeGreaterThan(ls[0][1]); expect(ls[1][3]).toBeGreaterThan(ls[1][1]); expect(ls[1][0]).toBeGreaterThan(ls[1][2]);
    expect(out).not.toMatch(/<rect[^>]*stg-cross/);
    expect(out).toMatch(/>pod one</);
  });
});

describe("a corner x ('cross ids corner'): two thick strokes in the corner, no box", () => {
  const out = html(`## A\nhub ra: replica a | one node\nhub rb: replica b`, [["One", ""], ["Two", "cross ra corner"]]);
  test("two stg-corner-line strokes inside a stg-cross-corner group, and no rect for it", () => {
    const g = out.match(/<g[^>]*class="[^"]*stg-cross-corner[^"]*"[^>]*>(.*?)<\/g>/);
    expect(g).toBeTruthy();
    expect([...g![1].matchAll(/<line class="stg-corner-line"/g)].length).toBe(2);
    expect(out).not.toMatch(/<rect[^>]*stg-cross-corner/);
  });
});
