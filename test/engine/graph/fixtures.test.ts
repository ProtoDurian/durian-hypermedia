// Geometry match for the graph/free plugin while the core and parser lanes are still separate.
// Replay supplies the frozen contract's states; expected coordinates come from the existing engine.
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { fixtureInput } from "./fixture-input";
import { Graph, Free } from "../../../src/engine/layouts/graph";
import { compileScene } from "../../../src/core/scene";
import { compile } from "../../../src/engine/pipeline";
import { narrowWins, phoneScene } from "../../../src/core/readable";
import { wholeLayout } from "../../../src/core/whole";
import { measure, wrap, setPhoneFont } from "../../../src/core/stage-core";
import { cutAt, laptopKey } from "../../../src/ui/anim";
import type { Placed, Rect } from "../../../src/engine/types";

const fixtureDir = new URL("../../../fixtures/format/", import.meta.url).pathname;
const ids = ["47", "50", "51", "52", "53", "54", "55", "55a", "56", "57", "58", "59", "61", "66", "81", "93", "94", "95", "09", "07"];
const files = readdirSync(fixtureDir);


for (const fixture of ids) {
  test(`format ${fixture}: graph10 member geometry matches wide, laptop and phone plans`, async () => {
    const file = files.find((name) => name.startsWith(`${fixture}-`));
    expect(file).toBeDefined();
    const text = await Bun.file(fixtureDir + file).text();
    const blocks = [...text.matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```/gm)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const info = Object.fromEntries([...block[1].matchAll(/([\w-]+)(?:=("[^"]*"|[^\s]+))?/g)].map((m) => [m[1], m[2]?.replace(/^"|"$/g, "") ?? ""]));
      const chunks = block[2].split(/^@step\s*/m), head = chunks.shift()!;
      const steps = chunks.map((s) => { const n = s.indexOf("\n"); return { title: s.slice(0, n), raw: s.slice(n + 1), line: 1 }; });
      const input = fixtureInput(head, steps, info), old = compileScene(head, steps, 1, info);
      expect(old.errors).toEqual([]);
      const compiled = compile({ body: block[2], line0: 1, fence: info, roles: {}, format12: false });
      expect(compiled.problems.filter((p) => !p.warn)).toEqual([]);
      for (const width of [1280, 704, 390]) {
        const whole = compiled.plan(width);
        for (let k = 0; k < compiled.states.length; k++) {
          const prims = whole.frame(k);
          expect(prims.length).toBeGreaterThan(0);
          if (fixture === "95") expect(prims.filter((p) => p.k === "text" && p.lines.join(" ") === compiled.model.things.buf.title)).toHaveLength(1);
          expect(Object.values(whole.focus(k)).every(Number.isFinite)).toBe(true);
          for (const r of Object.values(whole.rects(k))) expect(Object.values(r).every(Number.isFinite)).toBe(true);
        }
        const narrow = width >= 480 && cutAt(old, width) ? phoneScene(old, true) : null;
        const expected = input.model.steps.length === 0 || "static" in info ? wholeLayout(old, width)
          : width === 390 ? phoneScene(old, narrowWins(old, width)) ?? old
          : laptopKey(old, narrow, width) === "narrow" ? narrow! : old;
        if (fixture === "55" && width === 704) expect(expected.scene.attrs.narrow).toBe(true);
        setPhoneFont(width < 480);
        const plans = new Map<string | null, Placed>();
        const place = (container: string | null): Placed => {
          const i = { ...input, container, members: input.model.order.filter((id) => input.states.some((s) => (s.things[id].in ?? input.model.things[id].parent) === container && !s.things[id].at)) };
          const p = (input.model.layout === "free" ? Free : Graph).place(i, { width, phone: width < 480, look: "classic", measure, wrap, child: place, problem: (p) => { if (!p.warn) throw new Error(p.msg); } });
          plans.set(container, p); return p;
        };
        const root = place(null);
        for (let k = steps.length ? 1 : 0; k < input.states.length; k++) {
          const rects: Record<string, Rect> = {};
          const walk = (p: Placed, x: number, y: number) => {
            for (const [id, r] of Object.entries(p.at(k))) { rects[id] = { ...r, x: r.x + x, y: r.y + y }; const child = plans.get(id); if (child) walk(child, rects[id].x, rects[id].y); }
          };
          walk(root, 0, 0);
          const frame = expected.frames[steps.length ? k - 1 : 0];
          const boxes = frame.boxes.filter((b) => input.model.things[b.id] && !input.states[k].things[b.id]?.at);
          const anchor = boxes.find((b) => rects[b.id]);
          expect(anchor).toBeDefined(); if (!anchor) continue;
          for (const b of boxes) {
            const r = rects[b.id]; expect(r).toBeDefined(); if (!r) continue;
            expect(r.w).toBeCloseTo(b.w, 4); expect(r.h).toBeCloseTo(b.h, 4);
            expect(r.x - rects[anchor.id].x).toBeCloseTo(b.x - anchor.x, 4);
            expect(r.y - rects[anchor.id].y).toBeCloseTo(b.y - anchor.y, 4);
          }
        }
        // A source with no @steps is the setup frame (state 0), still placed by the plugin.
        if (!steps.length) expect(Object.keys(root.at(0)).length).toBeGreaterThan(0);
      }
    }
  });
}
