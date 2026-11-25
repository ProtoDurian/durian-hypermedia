// A sent token's label pill keeps clear of the token as drawn: its dot and the dot's halo (anim.tsx draws a halo of
// SEND_HALO around it), not only the dot's own size. The pill rides with the dot at a fixed offset, so the gap at rest
// is the gap on the whole way (the pill of a packet through a network card into the VPC touched the halo: 0.5 px).
import { describe, expect, test } from "bun:test";
import { CHIP, SEND_HALO, compileScene, connGeom, type Compiled } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";

const steps = (head: string, ...raw: string[]) => compileScene(head, raw.map((r, k) => ({ title: `step ${k + 1}`, raw: r, line: 10 + 5 * k })), 0, {});
const HEAD = `group n1 "node 1" layout=column
box a "app" in n1
box e1 "network card" in n1
box vr "VPC"
group n2 "node 2" layout=column
box e2 "network card" in n2
box w "web" in n2
e1 -> vr
vr -> e2`;
const SENDS = ['send "to 198.51.100.7" e1 -> vr', 'send "200 OK" vr -> e1', 'send "to the app" e1 -> a', 'send "up" a -> e1', 'send "to web" e2 -> w', 'send "back" w -> e2', 'send "200 OK" e2 -> vr'];

// the least gap from the token's resting point to its pill, in every frame that has a pill
const gaps = (c: Compiled) => c.frames.flatMap((f) => f.sends.filter((g) => g.chip != null).map((g) => {
  const by = new Map(f.boxes.map((b) => [b.key, b])), n = g.path.length - 1;
  const a = by.get(g.path[n - 1])!, b = by.get(g.path[n])!;
  const q = connGeom(a, b, a.kind, b.kind, false, g.offs[n - 1], g.bends[n - 1] ?? 0, g.rts?.[n - 1] ?? null).Q;
  const r = f.marks[g.chip!].r, dx = Math.max(r.x - q.x, 0, q.x - r.x - r.w), dy = Math.max(r.y - q.y, 0, q.y - r.y - r.h);
  return { label: g.label, gap: Math.hypot(dx, dy) };
}));

describe("a sent token's pill keeps clear of the dot as drawn", () => {
  test("the halo is the dot's size and 4 px", () => {
    expect(SEND_HALO).toBe(CHIP.dot + 4);
  });
  test("on a laptop and a phone, every pill is 3 px or more off the halo, in every direction it is sent", () => {
    // Arrange
    const wide = steps(HEAD, ...SENDS);
    const phone = phoneScene(wide, true) ?? wide;
    // Act
    const all = [...gaps(wide), ...gaps(phone)];
    // Assert
    expect(all.length).toBe(2 * SENDS.length);
    for (const x of all) expect({ label: x.label, clear: x.gap - SEND_HALO >= 3 }).toEqual({ label: x.label, clear: true });
  });
});
