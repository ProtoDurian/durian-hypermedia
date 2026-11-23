// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
//: a key entry can take "[dashed]" and draws its swatch dashed, same size
// and place (the original's "not plucked" key is dashed: a solid swatch loses the pending cue); and a phase chip not yet
// reached draws dashed, with no solid role border showing through the dashes.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
type Box = Extract<Item, { k: "box" }>;
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const ROLES = { pen: 0, pick: 1, warm: 7 };
const keyScene = (keys: string) => compileStage("## A\npick e0: picker 0\npen p1: pen 1", [{ title: "One: x", raw: keys, line: 4 }, { title: "Two: y", raw: "foot: done", line: 9 }], 1, {}, ROLES);
const swatches = (items: Item[]) => items.filter((i): i is Box => i.k === "box" && (i as Box).cls === "stg-key");

describe("key [dashed]", () => {
  test("a [dashed] key draws its swatch dashed; the same size and place as a solid one; other keys stay solid", () => {
    const solid = keyScene("key pick: plucks + sends\nkey pen: not plucked"), dashed = keyScene("key pick: plucks + sends\nkey pen [dashed]: not plucked");
    expect(dashed.errors).toEqual([]);
    for (const w of [1000, 360]) {
      const a = swatches(layoutStage(solid.model, w).items), b = swatches(layoutStage(dashed.model, w).items);
      expect(b.length).toBe(2);
      expect(b.map((s) => !!s.dash)).toEqual([false, true]);
      expect(a.map((s) => !!s.dash)).toEqual([false, false]);
      expect(b.map(({ x, y, w, h, fill, stroke }) => ({ x, y, w, h, fill, stroke }))).toEqual(a.map(({ x, y, w, h, fill, stroke }) => ({ x, y, w, h, fill, stroke })));
    }
  });
  test("[dashed] goes with a tone in either order; the LLM view says so", () => {
    for (const k of ["key warm [warn] [dashed]: fills windows", "key warm [dashed] [warn]: fills windows"]) {
      const c = keyScene(k); expect(c.errors).toEqual([]);
      const s = swatches(layoutStage(c.model, 1000).items)[0];
      expect(s).toMatchObject({ fill: "warn:soft", stroke: "warn:line", dash: true });
      expect(stageLlm(c)).toContain("Key (warm, warn, dashed): fills windows.");
    }
  });
  test("refused: two tones, [dashed] twice, another word", () => {
    for (const k of ["key pen [warn] [bad]: x", "key pen [dashed] [dashed]: x", "key pen [dotted]: x"]) {
      const c = keyScene(k);
      expect(c.errors.map((e) => e.msg).join("\n")).toMatch(/a key takes one role, at most one tone and \[dashed\]/);
    }
  });
});

describe("a phase not yet reached is dashed, with no role border under it", () => {
  const PHASES = ["1 Pending", "2 Signalled", "3 Allocated", "4 Rerouted", "5 Done"];
  const steps = [null, 1, 3].map((a, i) => ({ title: `S${i + 1}: step ${i + 1}`, raw: a === null ? "" : `at ${PHASES[a]}`, line: 20 + 3 * i }));
  for (const [name, form] of [["beside the where line", "form: chips | arrows\nplace: beside where\n"]] as const) // the chips in rows keep a scene's faded later phases
    test(name, () => {
      const c = compileStage(`track: op ${PHASES.join(", ")}\n${form}where: yard main-pickers · status.season.stage`, steps, 1, {}, { op: 6 });
      expect(c.errors).toEqual([]);
      for (const w of [1000, 360]) {
        const items = layoutStage(c.model, w).items, boxes = items.filter((i): i is Box => i.k === "box" && (i as Box).cls?.startsWith("stg-phase") === true);
        // at step 2 the place is phase 2: phases 3-5 are not reached; at step 3 the place is phase 4: phase 5 is not reached
        for (const [k, place] of [[2, 1], [3, 3]] as const) for (let i = 0; i < PHASES.length; i++) {
          const here = boxes.filter((b) => b.id === `phase:${i}` || (b as any).bar?.id === `phase:${i}` || ((b as any).bar?.ignore && b.x === boxes.find((q) => q.id === `phase:${i}`)!.x && b.y === boxes.find((q) => q.id === `phase:${i}`)!.y)).filter((b) => shownAt(b, k));
          const role = here.filter((b) => b.cls === "stg-phase"), dashed = here.filter((b) => b.dash);
          if (i > place) { expect(dashed.length).toBe(1); expect(role.length).toBe(0); expect(dashed[0].stroke).toBe("line-2"); }
          else { expect(dashed.length).toBe(0); }
        }
      }
    });
});
