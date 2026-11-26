// eng-polish: the last drawing differences from the old stage: counted units (squares, the remainder lighter, a key in a column), the time
// block's rows, bars and dots drawn flat inside a lanes scene, struck words with a red line of their own, a phone's foot in one row.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { beginDocument } from "../../../src/core/stage-budget";
import { setPhoneFont } from "../../../src/core/stage-core";
import { Draw, wholeOf } from "../../../src/engine/render/svg";
import type { Prim } from "../../../src/engine/types";
import { useStandin } from "../render/standin";

const ROOT = join(import.meta.dir, "../../..");
let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
beforeEach(() => { beginDocument(); });
const compiled = (file: string, n = 0) => {
  const p = parse(readFileSync(join(ROOT, file), "utf8"), { path: "x.dh.md" });
  return tryEngine((p as any).blocks.filter((b: any) => b.type === "animation")[n]).c!;
};
const frame = (file: string, width: number, step: number, n = 0) => { setPhoneFont(width < 480); return compiled(file, n).plan(width).frame(step); };

describe("units: the stage's own look", () => {
  const F07 = "fixtures/stage/07-animation-counted-units.dh.md";
  test("a remaining unit is a faint-edged band square, not a faded one, and every swatch matches its cells", () => {
    const f = frame(F07, 1280, 0) as Prim[];
    const cells = f.filter((p) => p.k === "rect" && p.key.startsWith("u:")) as Extract<Prim, { k: "rect" }>[];
    const rest = cells.filter((c) => c.fill === "band");
    expect(rest.length).toBe(36);
    for (const c of rest) { expect(c.cls).toContain("ps-scn-faint-edge"); expect(c.edge).toBe("line"); expect(c.role).toBeNull(); }
    const swatch = f.find((p) => p.k === "rect" && p.key === "keyc:remaining") as Extract<Prim, { k: "rect" }>;
    expect(swatch.fill).toBe("band"); expect(swatch.cls).toContain("ps-scn-faint-edge");
  });
  test("the key is one group to a row, at the left, as the stage's was", () => {
    for (const w of [1280, 390]) {
      const keys = (frame(F07, w, 0) as Prim[]).filter((p) => p.k === "rect" && p.key.startsWith("keyc:")) as Extract<Prim, { k: "rect" }>[];
      expect(keys.map((k) => k.key)).toEqual(["keyc:kept", "keyc:added", "keyc:removed", "keyc:remaining"]);
      expect(new Set(keys.map((k) => k.rect.x)).size).toBe(1);
      expect(new Set(keys.map((k) => k.rect.y)).size).toBe(4);
    }
  });
});

describe("a time block inside a lanes scene draws flat (stage 13)", () => {
  const F13 = "fixtures/stage/13-test-a-late-timeline.dh.md";
  test("its rows, bars and frame are rects with the time block's paints, never cards", () => {
    for (const w of [1280, 390]) {
      const f = frame(F13, w, 3) as Prim[];
      expect(f.filter((p) => p.k === "box" && /time-axis/.test(p.id ?? p.key)).length).toBe(0);
      const rows = f.filter((p) => p.k === "rect" && /stg-time-row\b/.test(p.cls ?? "")) as Extract<Prim, { k: "rect" }>[];
      expect(rows.length).toBe(3);
      for (const r of rows) { expect(r.edge).toBe("none"); expect(r.r).toBe(0); }
      const segs = f.filter((p) => p.k === "rect" && /stg-seg\b/.test(p.cls ?? "")) as Extract<Prim, { k: "rect" }>[];
      expect(segs.length).toBe(3);
      for (const s of segs) expect(s.r).toBeLessThanOrEqual(7);
    }
  });
});

describe("struck words draw a red line of their own (SVG ignores text-decoration-color)", () => {
  const F20 = "fixtures/stage/20-animation-boxes-inside-boxes.dh.md";
  test("each struck word has a line in --stg-struck-line and no text-decoration", () => {
    const c = compiled(F20), plan = c.plan(1280);
    let found = 0;
    for (let k = 1; k <= c.states.length; k++) {
      const struck = (plan.frame(k) as Prim[]).filter((p) => p.k === "text" && /stg-struck/.test(p.cls ?? ""));
      if (!struck.length) continue;
      found += struck.length;
      const html = renderToString(<Draw c={c} plan={plan} from={k} to={k} t={1} cam={wholeOf(plan)} still={true} />);
      expect((html.match(/class="eng-strike"/g) ?? []).length).toBe(struck.length);
      expect(html).toContain("--stg-struck-line");
      expect(html).not.toContain("text-decoration");
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe("a phone's foot is one row", () => {
  test("engine.css: at 560 px and under the player's step slider is hidden and its row does not wrap", () => {
    const css = readFileSync(join(ROOT, "src/engine/render/engine.css"), "utf8");
    const m = css.match(/@media screen and \(max-width: 560px\) \{([^}]*\})*[^}]*\}\s*$/);
    expect(m).not.toBeNull();
    expect(css).toContain(".eng .stg-foot .ctl { flex-wrap: nowrap;");
    expect(css).toContain(".eng .stg-foot .ctl .ctl-range");
  });
});
