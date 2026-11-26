// eng-polish: v0.7.0's renderer and camera fixes, ported into the one engine: the camera leaves a box out whole by sliding a few pixels
// past the scene (cab61bb), a container's heading rides with the view (149ccb8), the phone's step scroll counts the lit table row and
// takes the screenful with the most lit items (8ded128).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { beginDocument } from "../../../src/core/stage-budget";
import { setPhoneFont } from "../../../src/core/stage-core";
import { Draw, cameraOf, wholeOf } from "../../../src/engine/render/svg";
import { SLACK, wholeAtEdge } from "../../../src/engine/render/camera";
import { followBy } from "../../../src/ui/stage";
import { useStandin } from "../render/standin";

const ROOT = join(import.meta.dir, "../../..");
let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
beforeEach(() => { beginDocument(); });

describe("the camera leaves a box out whole rather than cut it (v0.7.0 cab61bb)", () => {
  const whole = { x: 0, y: 0, w: 400, h: 200 };
  test("a view held at the scene's edge slides up to SLACK px past it to leave a cut box out, when that cuts fewer", () => {
    const frame = { x: 300, y: 0, w: 100, h: 100 }, cutter = { x: 250, y: 20, w: 55, h: 20 }, keep = { x: 380, y: 20, w: 10, h: 20 };
    const f = wholeAtEdge(frame, whole, [cutter, keep], [keep], { w: 100, h: 100 });
    expect(f.x).toBeGreaterThan(305); expect(f.x + f.w).toBeLessThanOrEqual(whole.w + SLACK + 0.01);
    expect(f.x + f.w).toBeGreaterThan(whole.w); // it did go past the scene
  });
  test("within the scene wins: a view that can leave the box out inside the scene does not go past it", () => {
    const frame = { x: 150, y: 0, w: 100, h: 100 }, cutter = { x: 140, y: 20, w: 20, h: 20 };
    const f = wholeAtEdge(frame, whole, [cutter], [], { w: 100, h: 100 });
    expect(f.x).toBeGreaterThanOrEqual(0); expect(f.x + f.w).toBeLessThanOrEqual(whole.w);
  });
  test("never more than SLACK past the scene", () => {
    const frame = { x: 300, y: 0, w: 100, h: 100 }, cutter = { x: 250, y: 20, w: 90, h: 20 }, keep = { x: 380, y: 20, w: 10, h: 20 };
    const f = wholeAtEdge(frame, whole, [cutter, keep], [keep], { w: 100, h: 100 });
    expect(f.x + f.w).toBeLessThanOrEqual(whole.w + SLACK + 0.01);
  });
});

const compiled = (file: string) => {
  const p = parse(readFileSync(join(ROOT, file), "utf8"), { path: "x.dh.md" });
  return tryEngine((p as any).blocks.find((b: any) => b.type === "animation")).c!;
};

describe("a container's heading rides with the view (v0.7.0 149ccb8)", () => {
  // the service mesh (format 53) on a phone, the reader zoomed in on the middle of a container: its heading is cut by the view's top edge
  const mesh = () => { const file = readdirSync(join(ROOT, "fixtures/format")).find((x) => x.startsWith("53-animation"))!; setPhoneFont(true); const c = compiled("fixtures/format/" + file); return { c, plan: c.plan(390) }; };
  const drawAt = (c: any, plan: any, cam: { x: number; y: number; w: number; h: number }) => renderToString(<Draw c={c} plan={plan} from={3} to={3} t={1} cam={cam} still={true} />);
  test("some zoomed view draws a cut heading as riding (class eng-ride), and the whole scene draws none", () => {
    const { c, plan } = mesh();
    expect((drawAt(c, plan, cameraOf(c, plan, 3)).match(/eng-ride/g) ?? []).length).toBe(0);
    let n = 0;
    for (let y = 0; y <= 420; y += 20) n += (drawAt(c, plan, { x: 23, y, w: 195, h: 300 }).match(/eng-ride/g) ?? []).length;
    expect(n).toBeGreaterThan(0);
  }, 60000);
  test("a riding heading is inside the view, and over a halo (css)", () => {
    const { c, plan } = mesh(), cam = { x: 23, y: 0, w: 195, h: 300 };
    for (let y = 0; y <= 420; y += 20) {
      const html = drawAt(c, plan, { ...cam, y });
      for (const m of html.matchAll(/<text[^>]*eng-ride[^>]*x="([\d.]+)" y="([\d.]+)"/g)) { const x = +m[1], yy = +m[2]; expect(x).toBeGreaterThanOrEqual(cam.x - 1); expect(x).toBeLessThanOrEqual(cam.x + cam.w); expect(yy).toBeGreaterThanOrEqual(y); expect(yy).toBeLessThanOrEqual(y + cam.h); }
    }
    expect(readFileSync(join(ROOT, "src/engine/render/engine.css"), "utf8")).toMatch(/\.eng-ride \{[^}]*paint-order: stroke;/);
  }, 60000);
});

describe("the phone's step scroll (v0.7.0 8ded128)", () => {
  const at = (top: number, h = 20) => ({ top, bottom: top + h });
  test("the engine's follow uses followBy and counts the accent words a step brings", () => {
    const src = readFileSync(join(ROOT, "src/engine/render/svg.tsx"), "utf8");
    expect(src).toContain('querySelectorAll(".stg-plan .stg-hot, .stg-plan .eng-fresh")');
    expect(src).toMatch(/const by = followBy\(hot, foot\.getBoundingClientRect\(\)\.top\);/);
  });
  test("a lit row far below the lit field: the screenful with the most lit items wins", () => {
    expect(followBy([at(100), at(1300), at(1300), at(1300), at(1300)], 760)).toBe(1300 - 72);
  });
});
