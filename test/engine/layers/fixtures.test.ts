// The real fixtures (format 64, 67, 70, 71, 73) through parse -> states -> plan -> the 3D feed, at 1280 and 390.
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import { viewAt } from "../../../src/engine/render/three";
import { restCheck } from "../../../src/ui/geo3d";
import { fencesOf, ROOT } from "../parse/fixtures";

const dir = join(ROOT, "fixtures/format");
const files = readdirSync(dir).filter((f) => /^(64|67|70|71|73)-/.test(f));
describe("layers fixtures through the 3D feed", () => {
  for (const f of files) for (const w of [1280, 390]) test(`${f.slice(0, 2)} at ${w}`, () => {
    const fe = fencesOf(join(dir, f), undefined, f.slice(0, 2))[0], c = compile(fe.src), p = c.plan(w);
    expect(c.model.regions.length).toBeGreaterThan(1);
    for (let k = 0; k < c.states.length; k++) {
      const v = viewAt(c, p, k);
      expect(v.layers.length).toBe(c.model.regions.length);
      // eng-3d3: the floor is the room the things take, from foot.x
      for (const i of v.items) { expect(i.x).toBeGreaterThanOrEqual(v.foot.x - 0.01); expect(i.y).toBeGreaterThanOrEqual(-0.01); expect(i.x + i.w).toBeLessThanOrEqual(v.foot.x + v.foot.w + 0.01); expect(i.y + i.h).toBeLessThanOrEqual(v.foot.h + 0.01); }
      expect(restCheck(v.items.map((i) => ({ key: i.key, kind: i.kind, container: i.container, bare: i.bare, parent: i.parent, L: i.L })), 100)).toEqual([]);
      // an author's `camera <ids>` frames exactly those; else the close-up holds everything the step touches
      if (v.look && !c.states[k].camera) for (const t of v.touched) expect(v.look).toContain(t);
      if (v.focus != null) expect(v.look).toBeNull();
      expect(v.sends.length).toBe(c.motions[k].events.filter((e) => e.k === "send").length);
    }
  });
});

describe("fixture 69: a scene inside the scene", () => {
  const f = readdirSync(dir).find((x) => x.startsWith("69-"))!;
  for (const w of [1280, 390]) test(`enter, inside, leave at ${w}`, () => {
    const c = compile(fencesOf(join(dir, f), undefined, "69")[0].src), p = c.plan(w);
    const inside = c.states.map((s) => s.scene ?? null);
    expect(new Set(inside.filter(Boolean))).toEqual(new Set(["tcp"]));
    const enter = inside.findIndex((s) => s === "tcp"), leave = inside.findIndex((s, k) => k > enter && s === null);
    expect(enter).toBeGreaterThan(0); expect(leave).toBeGreaterThan(enter);
    for (let k = 0; k < c.states.length; k++) {
      const v = viewAt(c, p, k), ids = new Set(v.items.map((i) => i.id)), keys = v.items.map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(v.items.length).toBeGreaterThan(0);
      expect(v.scene).toBe(inside[k] ?? undefined);
      if (inside[k]) { expect(ids.has("hdr")).toBe(true); expect(v.items.find((i) => i.id === "h1")?.label).toBe("from port · 51514"); expect(ids.has("a7")).toBe(false); expect(v.layers.length).toBe(0); for (const i of v.items) { expect(i.x).toBeGreaterThanOrEqual(-0.01); expect(i.x + i.w).toBeLessThanOrEqual(v.foot.w + 0.01); } }
      else expect(ids.has("hdr")).toBe(false);
    }
    // while the enter and leave steps play, the stage is told which way the story goes
    const going = viewAt(c, p, enter, { from: enter - 1, t: 0.3 }), back = viewAt(c, p, leave, { from: leave - 1, t: 0.3 });
    expect(going.sceneDir).toBe("in"); expect(going.fade).toBeLessThan(1);
    expect(back.sceneDir).toBe("out"); expect(back.sceneVia).toBe(going.items.length ? viewAt(c, p, enter - 1).items.find((i) => i.id === "a4")!.key : null);
    expect(viewAt(c, p, enter).sceneDir).toBeUndefined();
  });
});

// 3dframe: zooming out all the way, and the first step, frame the whole stage on a phone too (no cut to what they touch)
describe("fixture 65: the first step and zoom out all frame the whole stage", () => {
  for (const w of [1280, 390]) test(`at ${w}`, () => {
    const fe = fencesOf(join(dir, readdirSync(dir).find((f) => f.startsWith("65-"))!), undefined, "65")[0], c = compile(fe.src), p = c.plan(w);
    expect(viewAt(c, p, 1).touched).toEqual([]);
    expect(viewAt(c, p, c.states.length - 1).touched).toEqual([]);
  });
});
