// render3: a data structure in a graph scene laid out by the graph engine (legacy.ts) is drawn as big as the data layout
// draws it; its lines leave and enter it at that drawn border, and it keeps its middle where the graph engine put it, so a
// straight line stays straight (format 95: the buffer -> network line started inside the taller buffer at 390).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { atSizes } from "../../../src/engine/render/font";
import type { Prim } from "../../../src/engine/types";

const FILE = "fixtures/format/95-animation-sent-items.dh.md";
const ends = (d: string) => { const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number); return { x1: n[0], y1: n[1], x2: n[n.length - 2], y2: n[n.length - 1] }; };
describe("a grown data structure's lines", () => {
  const c = compile(fencesOf(join(ROOT, FILE), migrate(readFileSync(join(ROOT, FILE), "utf8")), "fmt12")[0].src);
  for (const w of [1178, 356, 341]) test(String(w), () => atSizes(w < 480, () => {
    const f = c.plan(w).frame(1);
    const box = (id: string) => (f.find((q) => q.k === "box" && q.id === id) as Extract<Prim, { k: "box" }>).rect;
    const path = (id: string) => ends((f.find((q) => q.k === "path" && q.id === id) as Extract<Prim, { k: "path" }>).d);
    const buf = box("buf"), out = path("buf->net"), into = path("app->buf");
    // the line out starts on or outside the buffer's drawn border, the line in ends on or outside it
    const outside = (x: number, y: number) => x <= buf.x + 0.5 || x >= buf.x + buf.w - 0.5 || y <= buf.y + 0.5 || y >= buf.y + buf.h - 0.5;
    expect([w, outside(out.x1, out.y1), outside(into.x2, into.y2)]).toEqual([w, true, true]);
    if (w > 480) expect([Math.abs(into.y1 - into.y2) < 0.5, Math.abs(out.y1 - out.y2) < 0.5]).toEqual([true, true]);
  }));
});

// the queue with workers (format 60) at 390: the api's line ended 23 px inside the grown jobs queue (its stored route
// kept the graph engine's port); it meets the drawn border, and the two lines out keep their own ports
describe("a stored route's end on a grown box", () => {
  const FILE60 = "fixtures/format/60-animation-by-a-new-author-a-queue-with-workers.dh.md";
  const c = compile(fencesOf(join(ROOT, FILE60), migrate(readFileSync(join(ROOT, FILE60), "utf8")), "fmt12")[0].src);
  for (const w of [356, 341]) test(String(w), () => atSizes(true, () => {
    const f = c.plan(w).frame(1);
    const q = (f.find((p) => p.k === "box" && p.id === "q") as Extract<Prim, { k: "box" }>).rect;
    const into = ends((f.find((p) => p.k === "path" && p.id === "api->q") as Extract<Prim, { k: "path" }>).d);
    expect(into.y2).toBeLessThanOrEqual(q.y + 0.5);
    const outs = ["q->w1", "q->w2"].map((id) => ends((f.find((p) => p.k === "path" && p.id === id) as Extract<Prim, { k: "path" }>).d).x1);
    expect(Math.abs(outs[0] - outs[1])).toBeGreaterThan(10);
  }));
});
