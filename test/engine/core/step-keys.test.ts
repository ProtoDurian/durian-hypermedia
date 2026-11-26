// `set id down=yes` (graph pages) is a step key: the thing keeps it in every later step's state (ThingState.keys),
// so the renderer can cross it out and keep it crossed out (fixture format/51, the primary going down).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";

const page = parse(readFileSync(join(import.meta.dir, "../../../fixtures/format/51-animation-replicas-and-failover.dh.md"), "utf8"), { path: "51.dh.md" });
const block = page.blocks.find((b: any) => b.type === "animation")!;

describe("step keys", () => {
  test("set d1 down=yes lasts from its step to the end", () => {
    const c = tryEngine(block as any).c!;
    expect(c.problems).toEqual([]);
    const k = c.states.findIndex((s) => s.things.d1?.keys?.down === "yes");
    expect(k).toBeGreaterThan(0);
    expect(c.states[k - 1]!.things.d1?.keys?.down).toBeUndefined();
    for (const s of c.states.slice(k)) expect(s.things.d1?.keys?.down).toBe("yes");
  });
});

describe("a graph page's send leaves no line", () => {
  test("format/66: a relation first drawn by a send shows in that step only", () => {
    const p = parse(readFileSync(join(import.meta.dir, "../../../fixtures/format/66-animation-a-packet-through-kube-proxy.dh.md"), "utf8"), { path: "66.dh.md" });
    const c = tryEngine(p.blocks.find((b: any) => b.type === "animation") as any).c!;
    expect(c.problems).toEqual([]);
    let checked = 0;
    for (let k = 1; k < c.states.length - 1; k++) {
      const sent = new Set(c.motions[k]!.events.flatMap((e: any) => (e.k === "send" ? [e.rel] : [])));
      const nextSent = new Set(c.motions[k + 1]!.events.flatMap((e: any) => (e.k === "send" ? [e.rel] : [])));
      for (const id of sent) {
        if (c.model.relations[id]!.setup || nextSent.has(id)) continue;
        expect(c.states[k]!.relations[id]!.visible).toBe(true);
        expect(c.states[k + 1]!.relations[id]!.visible).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("a segment sent into a queue is its item, and pop takes it on", () => {
  test("format/95: s1 is in buf after the send, sits at net after pop", () => {
    const p = parse(readFileSync(join(import.meta.dir, "../../../fixtures/format/95-animation-sent-items.dh.md"), "utf8"), { path: "95.dh.md" });
    const c = tryEngine(p.blocks.find((b: any) => b.type === "animation") as any).c!;
    expect(c.problems).toEqual([]);
    expect(c.states[1]!.things.s1).toMatchObject({ visible: true, in: "buf", at: null });
    expect(c.states[2]!.things.s1).toMatchObject({ visible: true, in: null, at: "net" });
  });
});

describe("a graph page's highlight tone lasts its step only", () => {
  test("format/61: the edge is warn in the Miss step and plain after", () => {
    const p = parse(readFileSync(join(import.meta.dir, "../../../fixtures/format/61-animation-by-a-new-author-a-cdn-miss-then-a-hit.dh.md"), "utf8"), { path: "61.dh.md" });
    const c = tryEngine(p.blocks.find((b: any) => b.type === "animation") as any).c!;
    expect(c.problems).toEqual([]);
    const k = c.states.findIndex((s) => s.things.edge?.tone === "warn");
    expect(k).toBe(2);
    expect(c.states[3]!.things.edge?.tone ?? null).toBe(null);
  });
});
