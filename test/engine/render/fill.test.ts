// render2: a graph scene fills its stage on a wide screen (render/fill.ts; SPEC 6.8: at least 260 tall, no wider than 2.4 per
// unit of height, drawn up to 1.5 times natural size), and a finished send's dot rests clear of words.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { cameraOf, viewOf } from "../../../src/engine/render/svg";
import { restsOnWords, stageView } from "../../../src/engine/render/fill";

const forms = (name: string) => { const p = join(ROOT, "fixtures/format", name + ".dh.md"), t = readFileSync(p, "utf8"); return [fencesOf(p, t, "o")[0].src, fencesOf(p, migrate(t), "n")[0].src].map((s) => compile(s)); };
for (const name of ["47-animation-the-engine", "55a-animation-eight-colours-told-apart-by-everyone", "72-3d-a-2d-scene-unchanged"]) test(`${name}: the stage keeps its shape and the scene fills it`, () => {
  for (const c of forms(name)) {
    const plan = c.plan(1178), view = stageView(c, plan, viewOf(plan));
    expect(view.h).toBeGreaterThanOrEqual(Math.max(260, view.w / 2.4) - 0.5);
    for (let k = 0; k < c.states.length; k++) {
      const cam = cameraOf(c, plan, k);
      expect(cam.w).toBeGreaterThanOrEqual(view.w / 1.5 - 0.5); // never past 1.5 times natural size
      for (const r of Object.values(plan.rects(k))) expect(r.x >= cam.x - 0.5 && r.y >= cam.y - 0.5 && r.x + r.w <= cam.x + cam.w + 0.5 && r.y + r.h <= cam.y + cam.h + 0.5).toBe(true); // all of it in frame
    }
    expect(cameraOf(c, plan, 1).w).toBeLessThan(view.w - 1); // zoomed in: it was drawn small in a wide stage
  }
});
test("a phone, and a scene that is not a graph, keep their stage", () => {
  const [c] = forms("47-animation-the-engine"), p = c.plan(356);
  expect(stageView(c, p, viewOf(p))).toEqual(viewOf(p));
  const lanes = compile(fencesOf("x", readFileSync(join(ROOT, "fixtures/gt/02-tcp-handshake.dh.md"), "utf8"), "x")[0].src), lp = lanes.plan(1178);
  expect(stageView(lanes, lp, viewOf(lp))).toEqual(viewOf(lp));
});
test("a resting dot on words or a chip is gone; one in the clear stays", () => {
  const chip = { k: "rect", rect: { x: 100, y: 100, w: 60, h: 20 }, cls: "stg-chip" };
  expect(restsOnWords({ x: 105, y: 110 }, [], [], [chip])).toBe(true);
  expect(restsOnWords({ x: 105, y: 110 }, [{ x: 100, y: 105, w: 30, h: 12 }], [], [])).toBe(true);
  expect(restsOnWords({ x: 300, y: 300 }, [{ x: 100, y: 105, w: 30, h: 12 }], [{ x: 0, y: 0, w: 20, h: 20 }], [chip])).toBe(false);
});
