// Speech points at the thing that speaks, wherever the engine puts it: above or below (a tail under or over it), and
// beside it (a phone puts it there when above is taken): a tail on its left or right edge. Beside, it had no tail.
import { describe, expect, test } from "bun:test";
import { sayPath } from "../src/ui/anim";

const THING = { x: 100, y: 100, w: 60, h: 30 }; // centre 130, 115
const BUBBLE = { w: 90, h: 34 };
// the bubble's place is given from the thing's centre (Mark dx, dy), as the engine gives it
const at = (side: "up" | "down" | "left" | "right", x: number, y: number) => ({ side, dx: x - 130, dy: y - 115, r: BUBBLE });
// the outline's points (absolute)
const points = (d: string) => {
  const out: { x: number; y: number }[] = []; let x = 0, y = 0;
  for (const [, op, a] of d.matchAll(/([MLHVlhvz])([^MLHVlhvz]*)/g)) {
    const n = a.trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if (op === "M" || op === "L") [x, y] = n; else if (op === "l") { x += n[0]; y += n[1]; } else if (op === "H") x = n[0]; else if (op === "h") x += n[0]; else if (op === "V") y = n[0]; else if (op === "v") y += n[0]; else continue;
    out.push({ x, y });
  }
  return out;
};

describe("speech has a tail towards the thing on every side", () => {
  test("beside the thing, on its right: the tail is on the bubble's left edge, level with the thing", () => {
    // Arrange: the bubble 8 px right of the thing
    const m = at("right", 168, 100);
    // Act
    const ps = points(sayPath(m, THING));
    // Assert: one point juts 6 px left of the bubble, at the thing's middle height
    const tip = ps.reduce((a, b) => (b.x < a.x ? b : a));
    expect(tip.x).toBe(162);
    expect(tip.y).toBe(115);
  });
  test("beside the thing, on its left: the tail is on the bubble's right edge", () => {
    const m = at("left", 2, 100);
    const ps = points(sayPath(m, THING));
    const tip = ps.reduce((a, b) => (b.x > a.x ? b : a));
    expect(tip.x).toBe(98);
    expect(tip.y).toBe(115);
  });
  test("a bubble higher than the thing's middle keeps its tail on its own edge", () => {
    const m = at("right", 168, 140);
    const tip = points(sayPath(m, THING)).reduce((a, b) => (b.x < a.x ? b : a));
    expect(tip.y).toBe(146);
  });
  test("above and below are as they were", () => {
    expect(sayPath(at("up", 85, 60), THING)).toBe("M85 60h90v34H136l-6 6l-6 -6H85z");
    expect(sayPath(at("down", 85, 136), THING)).toBe("M85 136H124l6 -6l6 6H175v34h-90z");
  });
});
