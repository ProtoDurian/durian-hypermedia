// fmt12 (page2's review, sample 04-04): a data structure drawn wider than the old scene's box pushed over its neighbour (the
// sorted ids over the price index) and past its group's frame (the cart sizes past the orders service), in both forms. A
// member that grows pushes the members after it in its row, and its group's box takes the room.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { atSizes } from "../../../src/engine/render/font";

type R = { x: number; y: number; w: number; h: number };
const FILE = "fixtures/format/63-animation-an-array-a-map-and-a-tree-in-one-scene.dh.md";
const rects = (fr: unknown[]) => new Map((fr as { k: string; key?: string; rect?: R }[]).flatMap((q) => (q.k === "box" && q.key && /^t:[^:]+$/.test(q.key) && q.rect ? [[q.key.slice(2), q.rect] as const] : [])));
const meets = (a: R, b: R) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inside = (a: R, b: R) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

describe("a grown member makes room", () => {
  const text = readFileSync(join(ROOT, FILE), "utf8");
  for (const [form, src] of [["old", fencesOf(join(ROOT, FILE), text, "old")[0].src], ["new", fencesOf(join(ROOT, FILE), migrate(text), "new")[0].src]] as const)
    for (const w of [1178, 356]) test(`format 63, ${form} form, ${w}: the three structures neither overlap nor leave the service`, () => {
      const c = compile(src);
      atSizes(w < 480, () => {
        const p = c.plan(w);
        for (const k of [1, c.states.length - 1]) {
          const r = rects(p.frame(k)), api = r.get("api")!, parts = ["ids", "idx", "cart"].map((id) => r.get(id)!);
          expect(parts.every(Boolean)).toBe(true);
          for (const a of parts) { expect(inside(a, api)).toBe(true); for (const b of parts) if (a !== b) expect(meets(a, b)).toBe(false); }
        }
      });
    });
});
