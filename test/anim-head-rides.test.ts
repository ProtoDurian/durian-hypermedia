// A container's heading rides with the view (SPEC.md 6.14): where the story camera shows part of a container but cuts
// its heading at the stage's edge, the heading is drawn just inside the view's edge, inside its container, off every
// word and thing. (On a phone a close view inside a big container cut "hash table", "one region", "orders service".)
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RIDE, rideHeads } from "../src/core/edge10";

// one world unit is one pixel; a container 600 x 400 whose heading sits at its top left
const box = { key: 1, depth: 1, r: { x: 0, y: 0, w: 600, h: 400 }, head: { x: 10, y: 4, w: 80, h: 16 } };
const lower = { x: 0, y: 100, w: 300, h: 200 }; // a view on its middle: the heading is above it

describe("a cut heading rides just inside the view", () => {
  test("it moves down to the view's top edge, keeping its place along it", () => {
    expect(rideHeads([box], [], lower, 1).get(1)).toEqual({ dx: 0, dy: 100 + RIDE.gap - 4 });
  });
  test("a heading the view shows whole stays where it is", () => {
    expect(rideHeads([box], [], { x: 0, y: 0, w: 300, h: 200 }, 1).size).toBe(0);
  });
  test("a word or a thing under that spot: it takes the far end of the edge, else a line lower", () => {
    const word = { key: 7, r: { x: 20, y: 104, w: 60, h: 14 } };
    expect(rideHeads([box], [word], lower, 1).get(1)).toEqual({ dx: 300 - RIDE.gap - 80 - 10, dy: 100 + RIDE.gap - 4 });
    const both = [word, { key: 8, r: { x: 200, y: 104, w: 60, h: 14 } }];
    expect(rideHeads([box], both, lower, 1).get(1)!.dy).toBeGreaterThan(100 + RIDE.gap - 4 + 16);
  });
  test("it stays inside its container, and leaves it where the visible part has no room", () => {
    const small = { ...box, r: { x: 0, y: 0, w: 600, h: 110 } }; // only 10 px of it in the view
    expect(rideHeads([small], [], lower, 1).size).toBe(0);
  });
  test("an outer and an inner heading never ride over each other", () => {
    const inner = { key: 2, depth: 2, r: { x: 0, y: 40, w: 300, h: 300 }, head: { x: 10, y: 44, w: 80, h: 16 } };
    const at = rideHeads([inner, box], [], lower, 1), a = at.get(1)!, b = at.get(2)!;
    const ra = { x: 10 + a.dx, y: 4 + a.dy }, rb = { x: 10 + b.dx, y: 44 + b.dy };
    expect(Math.abs(ra.x - rb.x) >= 80 || Math.abs(ra.y - rb.y) >= 16).toBe(true);
  });
  test("its gap is in pixels: zoomed in twice, half as many world units", () => {
    expect(rideHeads([box], [], lower, 2).get(1)).toEqual({ dx: 0, dy: 100 + RIDE.gap / 2 - 4 });
  });
  test("the stage draws a riding heading where rideHeads says, with a halo, and the 'more beyond' line keeps off it", () => {
    const src = readFileSync(join(import.meta.dir, "../src/ui/anim.tsx"), "utf8"), css = readFileSync(join(import.meta.dir, "../src/ui/parts.css"), "utf8");
    expect(src).toContain("ride={rides.get(s.box.key)}");
    expect(src).toContain('className={ride ? "scn-head is-ride" : "scn-head"}');
    expect(src).toContain("moreSay, rideRects)");
    expect(css).toMatch(/\.scn-head\.is-ride \{[^}]*paint-order: stroke;/);
  });
});
