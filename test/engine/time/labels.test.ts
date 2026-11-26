// render2: a plot's line never runs through a point label (layouts/time/labels.ts). The page review: "time detail, static"
// (stage 08), the line through "Halfway" and "Complete".
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { pointLabelsOffLines } from "../../../src/engine/layouts/time/labels";
import { pathPoints } from "../../../src/engine/render/route";
import { measure, type Item } from "../../../src/core/stage-core";
import { atSizes } from "../../../src/engine/render/font";
import type { Prim } from "../../../src/engine/types";

type Pt = { x: number; y: number };
const crosses = (a: Pt, b: Pt, r: { x: number; y: number; w: number; h: number }) => {
  let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
  const clip = (p: number, q: number) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
  return clip(-dx, a.x - r.x) && clip(dx, r.x + r.w - a.x) && clip(-dy, a.y - r.y) && clip(dy, r.y + r.h - a.y) && t1 - t0 > 1e-6;
};
/** point labels a plot line runs through, in one frame */
function crossed(frame: Prim[], names: string[]): string[] {
  const lines = frame.filter((p): p is Extract<Prim, { k: "path" }> => p.k === "path").map((p) => pathPoints(p.d)).filter((pts) => pts.length === 2);
  return frame.flatMap((p) => {
    if (p.k !== "text" || !names.includes(p.lines[0])) return [];
    const w = measure(p.lines[0], "sub"), r = { x: p.x + 1, y: p.y - 11, w: w - 2, h: 13 };
    return lines.some(([a, b]) => crosses(a, b, r)) ? [p.lines[0]] : [];
  });
}

describe("a plot line runs through no point label", () => {
  const file = join(ROOT, "fixtures/stage/08-animation-time-detail-static.dh.md"), text = readFileSync(file, "utf8");
  for (const [form, src] of [["old", fencesOf(file, text, "old")[0].src], ["format 12", fencesOf(file, migrate(text), "new")[0].src]] as const) {
    test(form, () => {
      const c = compile(src);
      for (const w of [1178, 800, 356]) atSizes(w < 480, () => {
        const p = c.plan(w);
        for (let k = 0; k < c.states.length; k++) expect(crossed(p.frame(k), ["Start", "Halfway", "Complete"])).toEqual([]);
      });
    });
  }
  test("a label off every line stays where it is", () => {
    const items: Item[] = [{ k: "path", pts: [[0, 100], [200, 100]], curve: "round", ink: "role:a:line" }, { k: "text", x: 50, y: 60, s: "away", f: "sub", ink: "role:a:ink", halo: true }];
    expect(pointLabelsOffLines(items)).toEqual(items);
  });
  test("a crossed label moves off the line", () => {
    const items: Item[] = [{ k: "path", pts: [[0, 100], [200, 100]], curve: "round", ink: "role:a:line" }, { k: "text", x: 50, y: 106, s: "on it", f: "sub", ink: "role:a:ink", halo: true }];
    const t = pointLabelsOffLines(items)[1] as Extract<Item, { k: "text" }>;
    expect(t.y).not.toBe(106);
    expect(t.y - 13 > 102 || t.y + 4 < 98).toBe(true);
  });
});
