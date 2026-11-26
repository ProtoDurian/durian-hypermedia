// eng-sweep: a container's heading that rides with the reader's view (eng-polish) must not fly across and back while the camera glides
// to the next step's frame: the ride is blended from the view the step started in to the one it ends in.
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { beginDocument } from "../../../src/core/stage-budget";
import { setPhoneFont } from "../../../src/core/stage-core";
import { Draw, cameraOf } from "../../../src/engine/render/svg";
import { lerpRect } from "../../../src/engine/render/camera";
import { useStandin } from "./standin";

const ROOT = join(import.meta.dir, "../../..");
let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
beforeEach(() => { beginDocument(); });

test("while the camera glides from a zoomed view to the story's frame, a riding heading moves between its two places, never beyond", () => {
  const file = readdirSync(join(ROOT, "fixtures/format")).find((x) => x.startsWith("53-animation"))!;
  setPhoneFont(true);
  const doc = parse(readFileSync(join(ROOT, "fixtures/format", file), "utf8"), { path: "x.dh.md" });
  const c = tryEngine((doc as any).blocks.find((b: any) => b.type === "animation")).c!, plan = c.plan(390);
  const camB = cameraOf(c, plan, 3), draw = (cam: any, t: number, extra: object = {}) => renderToString(<Draw c={c} plan={plan} from={3} to={3} t={t} cam={cam} still={t >= 1} {...extra} />);
  const headY = (html: string) => [...html.matchAll(/<text[^>]*data-key="t:([a-z0-9]+):title"[^>]*>/g)].map((m) => [m[1], +(/\sy="(-?[\d.]+)"/.exec(m[0])?.[1] ?? 0) + +(/\sx="(-?[\d.]+)"/.exec(m[0])?.[1] ?? 0)] as const);
  // some zoomed view that makes a heading ride
  let camA: any = null;
  for (let y = 0; y <= 420 && !camA; y += 20) { const v = { x: 23, y, w: 195, h: 300 }; if (/eng-ride/.test(draw(v, 1))) camA = v; }
  expect(camA).not.toBeNull();
  const a = new Map(headY(draw(camA, 1))), b = new Map(headY(draw(camB, 1)));
  let moved = 0;
  for (const t of [0.2, 0.5, 0.8]) {
    const mid = headY(draw(lerpRect(camA, camB, t), t, { camA, camB }));
    for (const [k, y] of mid) { const lo = Math.min(a.get(k) ?? y, b.get(k) ?? y) - 0.6, hi = Math.max(a.get(k) ?? y, b.get(k) ?? y) + 0.6; expect(y).toBeGreaterThanOrEqual(lo); expect(y).toBeLessThanOrEqual(hi); if (Math.abs((a.get(k) ?? y) - (b.get(k) ?? y)) > 1) moved++; }
  }
  expect(moved).toBeGreaterThan(0);
}, 60000);
