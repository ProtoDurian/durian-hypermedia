// 3D in the one engine's stage: the server draws 2D, the 3D host is the browser's; the 3D feed carries what layers2 added.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { compile } from "../../../src/engine/pipeline";
import { EngineStage } from "../../../src/engine/render/svg";
import { threeOf } from "../../../src/engine/render/three-host";
import { viewAt } from "../../../src/engine/render/three";
import { UI } from "../../../src/ui/ui";
import { fencesOf, ROOT } from "../parse/fixtures";
import { useStandin } from "../render/standin";

let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
const dir = join(ROOT, "fixtures/format");
const fx = (n: string) => { const f = readdirSync(dir).find((x) => x.startsWith(n + "-"))!; return compile(fencesOf(join(dir, f), undefined, n)[0].src); };
const ui = (UI as any).en ?? Object.values(UI as any)[0];

describe("EngineStage and 3D", () => {
  test("a 3d fence is flat on the server (no WebGL there) and says it wants 3D", () => {
    for (const n of ["64", "70"]) {
      const c = fx(n), html = renderToString(<EngineStage compiled={c} ui={ui} />);
      expect(threeOf(c).want).toBe(true);
      expect(html).toContain('data-engine="12"'); expect(html).toContain("stg-plan-ssr"); expect(html).not.toContain("eng-3d"); expect(html).toContain('data-step="1"');
    }
  });
  test("`3d only` has no 2D button; a plain 2D scene wants no 3D", () => {
    expect(threeOf(fx("65")).only).toBe(true);
    expect(threeOf(fx("66")).want).toBe(false);
  });
});

describe("the 3D feed", () => {
  test("pills stay on their line, and the stage is told to keep them there; a tall stack is pulled in on a wide stage", () => {
    const c = fx("70"), v = viewAt(c, c.plan(1280), 2);
    expect(v.pillsOnLine).toBe(true); expect(v.fitStack).toBe(true);
  });
  test("`set id down=yes` reaches the 3D item (65 step 5)", () => {
    const c = fx("65"), v = viewAt(c, c.plan(1280), 5), k3 = v.items.find((i) => i.id === "k3")!;
    expect(k3.down).toBe(true);
    expect(viewAt(c, c.plan(1280), 4).items.find((i) => i.id === "k3")!.down).toBe(false);
  });
  test("a focused layer fades the others, eased with the step (67 step 11)", () => {
    const c = fx("67"), p = c.plan(1280), v = viewAt(c, p, 11), by = Object.fromEntries(v.items.map((i) => [i.id, i]));
    expect(by.a3.o).toBe(1); expect(by.a1.o).toBeLessThan(0.2);
    const mid = viewAt(c, p, 11, { from: 10, t: 0.5 }), m = Object.fromEntries(mid.items.map((i) => [i.id, i]));
    expect(m.a1.o).toBeGreaterThan(by.a1.o); expect(m.a1.o).toBeLessThan(1);
  });
  test("a close-up that spans half the layers is the whole stack (69 step 4: three tokens at layer 4 of 7)", () => {
    const c = fx("69"), p = c.plan(1280);
    for (const k of [4, 12, 16]) expect(viewAt(c, p, k).look).toBeNull();
  });
  test("a scene inside the scene is framed whole (69 step 9: the buffer and its neighbours, none cut)", () => {
    const c = fx("69"), v = viewAt(c, c.plan(1280), 9);
    expect(v.scene).toBe("tcp"); expect(v.look).toBeNull();
  });
  test("the author's `camera <id>` frames exactly that thing (65 step 4: redis)", () => {
    const c = fx("65"), v = viewAt(c, c.plan(1280), 4), id = new Map(v.items.map((i) => [i.key, i.id]));
    expect((v.look ?? []).map((k) => id.get(k))).toEqual(["k3"]);
  });
});

describe("a place kept for a token that lands later", () => {
  test("69 step 9: segment 2 is still at the network; its slot between 1 and 3 in the buffer is shown faint with a ring", () => {
    const c = fx("69"), v = viewAt(c, c.plan(1280), 9), by = Object.fromEntries(v.items.map((i) => [i.id, i]));
    const g = by["s2~slot"]; expect(g).toBeDefined();
    expect(g.o).toBeLessThan(0.6); expect(v.framed?.has(g.key)).toBe(true);
    expect(g.x).toBeGreaterThan(by.s1.x); expect(g.x).toBeLessThan(by.s3.x);
    expect(viewAt(c, c.plan(1280), 10).items.some((i) => i.id.endsWith("~slot"))).toBe(false);
    expect(viewAt(c, c.plan(1280), 8).items.some((i) => i.id.endsWith("~slot"))).toBe(false);
  });
});
