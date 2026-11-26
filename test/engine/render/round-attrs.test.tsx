// eng-sweep: the stage's drawn numbers (a box's, a ring's, a dot's x, y, width, height) are rounded to 0.01. The server (Bun) and the
// browser (Chrome) can differ in the 17th digit of a computed float, and React's hydration then warned "Prop cx did not match"
// (gate run: format 56, gt 03, stage 01 and 18). A number with at most two decimals is the same text on both.
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { beginDocument } from "../../../src/core/stage-budget";
import { Draw, cameraOf } from "../../../src/engine/render/svg";
import { useStandin } from "./standin";

const ROOT = join(import.meta.dir, "../../..");
let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
beforeEach(() => { beginDocument(); });

for (const file of ["fixtures/gt/03-oauth-login.dh.md", "fixtures/stage/01-animation-a-composed-stage.dh.md", "fixtures/stage/18-animation-two-arrows-one-label-each.dh.md", "fixtures/format/56-animation-streams-meters-and-colours.dh.md"]) {
  test(`${file}: no drawn circle or rect carries a number with more than two decimals`, () => {
    const doc = parse(readFileSync(join(ROOT, file), "utf8"), { path: "x.dh.md" });
    const c = tryEngine((doc as any).blocks.find((b: any) => b.type === "animation")).c!;
    const plan = c.plan(1000);
    let bad = 0, seen = 0;
    for (let k = 1; k < c.states.length; k++) {
      const html = renderToString(<Draw c={c} plan={plan} from={k} to={k} t={1} cam={cameraOf(c, plan, k)} still={true} />);
      for (const m of html.matchAll(/<(circle|rect)\b[^>]*>/g)) {
        if (/class="[^"]*eng-(?:ring|edges)/.test(m[0])) continue;
        for (const a of m[0].matchAll(/\s(cx|cy|x|y|width|height|r)="(-?\d+\.\d+)"/g)) { seen++; if (a[2].split(".")[1].length > 2) { bad++; } }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toBe(0);
  }, 60000);
}
