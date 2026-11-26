// The pipeline paints a container before what it holds at each step, so a thing that moved into a container declared
// after it is never painted under that container (graph lane, fixture 50: k4 moved into s3).
import { describe, expect, test } from "bun:test";
import { paintOrder } from "../../../src/engine/pipeline";
import type { Model, StepState } from "../../../src/engine/types";

const thing = (id: string, parent: string | null, order: number) => ({ id, role: null, title: id, lines: [], flags: [], shape: "box", layout: null, container: false, parent, region: null, order, values: null, keys: {}, chart: null, src: { line: 1 } });
const model = { order: ["s2", "k4", "s3", "tok"], things: { s2: thing("s2", null, 0), k4: thing("k4", "s2", 1), s3: thing("s3", null, 2), tok: thing("tok", null, 3) } } as unknown as Model;
const st = (inOf: Record<string, string | null>, at: Record<string, string> = {}): StepState => ({ things: Object.fromEntries(model.order.map((id) => [id, { visible: true, at: at[id] ?? null, in: inOf[id] ?? null }])) } as unknown as StepState);

describe("paint order", () => {
  test("a thing moved into a later-declared container is painted after it", () => {
    const o = paintOrder(model, st({ k4: "s3" }));
    expect(o.indexOf("k4")).toBeGreaterThan(o.indexOf("s3"));
  });
  test("declaration order holds among things at one depth, and tokens sit on top", () => {
    expect(paintOrder(model, st({ k4: "s2" }, { tok: "k4" }))).toEqual(["s2", "s3", "k4", "tok"]);
  });
});


import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { readFileSync } from "node:fs";
import { join } from "node:path";
describe("a container's layout decor is painted over the container", () => {
  test("format/95: the buffer's own title and cells come after the buffer's box", () => {
    const p = parse(readFileSync(join(import.meta.dir, "../../../fixtures/format/95-animation-sent-items.dh.md"), "utf8"), { path: "95.dh.md" });
    const c = tryEngine(p.blocks.find((b: any) => b.type === "animation") as any).c!;
    const plan = c.plan(1000);
    let checked = 0;
    for (let k = 0; k < c.states.length; k++) {
      const f = plan.frame(k);
      for (const t of Object.values(c.model.things)) {
        if (!t.container || !t.layout || !["array", "list", "stack", "queue", "map", "tree"].includes(t.layout)) continue;
        const box = f.findIndex((q: any) => q.id === t.id && q.k === "box");
        const firstDecor = f.findIndex((q: any) => typeof q.key === "string" && q.key.startsWith(`${t.id}:`));
        if (box < 0 || firstDecor < 0) continue;
        expect(firstDecor).toBeGreaterThan(box);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
