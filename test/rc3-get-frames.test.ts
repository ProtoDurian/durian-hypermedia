// 0.7.0-rc.3 review, row 4 (one focus per step): `get <map> <key>` on a hash table lit the entry AND its bucket, two lit
// things in one step. Now the entry is the one lit thing; its bucket is framed (a thin outline in the faint ink colour, its
// fill, words and border stay) and still kept in view by the story camera. 2D and 3D both draw the frame.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene, type Frame } from "../src/core/scene";

const split = (src: string) => { const [head, ...rest] = src.split(/^@step /m); return { head, steps: rest.map((r, k) => { const [t, ...body] = r.split("\n"); return { title: t, raw: body.join("\n"), line: 100 * (k + 1) }; }) }; };
const scene = (src: string) => { const s = split(src); return compileScene(s.head, s.steps, 1, {}); };
const key = (f: Frame, id: string) => f.boxes.find((b) => b.id === id && b.key > 0)!.key;
const read = (rel: string) => readFileSync(join(import.meta.dir, "..", rel), "utf8");

describe("a lookup in a hash table lights the entry and frames its bucket", () => {
  test("get h cy: one lit thing (h.cy); bucket h.b0 framed and in the step's view", () => {
    const c = scene(`map h "h" buckets=4: ana: 3, cy: 9, ben: 7\n@step a\nget h cy\n@step b\nput h dee: 4\n`);
    expect(c.errors).toEqual([]);
    const f = c.frames[0];
    expect(c.fx[0].highlights.map((h) => h.key)).toEqual([key(f, "h.cy")]);
    expect(c.fx[0].framed).toEqual([key(f, "h.b0")]);
    expect(c.fx[0].touched).toContain("h.b0");
    expect(c.fx[1].framed ?? []).toEqual([]);
  });
  test("a map without buckets has nothing to frame", () => {
    const c = scene(`map cache "cache": u7: Ana, u12: Ben\n@step a\nget cache u7\n`);
    expect(c.fx[0].highlights.map((h) => h.key)).toEqual([key(c.frames[0], "cache.u7")]);
    expect(c.fx[0].framed ?? []).toEqual([]);
  });
  test("the Format page's array, map and tree scene (fixture 63): 'get cart ana' lights cart.ana only, frames cart.b1", () => {
    const m = read("fixtures/format/63-animation-an-array-a-map-and-a-tree-in-one-scene.dh.md").match(/^```animation[^\n]*\n([\s\S]*?)^```$/m)!;
    const c = scene(m[1]);
    expect(c.errors).toEqual([]);
    const k = c.fx.findIndex((x, i) => /^get cart ana$/m.test(split(m[1]).steps[i].raw));
    expect(c.fx[k].highlights.map((h) => h.key)).toEqual([key(c.frames[k], "cart.ana")]);
    expect(c.fx[k].framed).toEqual([key(c.frames[k], "cart.b1")]);
  });
  test("the stage draws a framed thing with a quiet ring (no lit class), in 2D and 3D", () => {
    const anim = read("src/ui/anim.tsx"), a3 = read("src/ui/anim3d.ts"), css = read("src/ui/parts.css");
    expect(anim).toMatch(/!hl && framed && "is-framed"/);
    expect(anim).toMatch(/framed: new Set\(fx\.framed \?\? \[\]\)/);
    expect(a3).toMatch(/o\.ring\.visible = !!\(hlt \|\| sel \|\| fr\)/);
    const rule = css.match(/\.is-framed \.scn-ring \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("var(--faint)");
    expect(css).not.toMatch(/\.is-framed \.scn-(shape|frame|label)/);
  });
});
