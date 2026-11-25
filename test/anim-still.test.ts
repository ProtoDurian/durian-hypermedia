// Format version 11, pure core: a still scene (an animation with no @step: its setup, drawn once), the whole layout a
// still scene takes (src/core/whole.ts), and the cut rule for words: an arrow's label belongs to the scene's bounds and
// to what a view cuts (a view that cut one clipped it to a letter at 1180 wide).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileScene, sceneLlm, phoneInfo, storyView, cutBy, hit, type Frame, type Rect } from "../src/core/scene";
import { wholeAspect, wholeLayout, wholeView, staticView, oneStep, wholeSize, layoutWidth } from "../src/core/whole";

const split = (src: string) => { const [head, ...rest] = src.split(/^@step /m); return { head, steps: rest.map((r, k) => { const [t, ...body] = r.split("\n"); return { title: t, raw: body.join("\n"), line: 100 * (k + 1) }; }) }; };
const scene = (src: string, info: Record<string, string> = {}) => { const s = split(src); return compileScene(s.head, s.steps, 1, info); };
const msgs = (c: ReturnType<typeof scene>) => c.errors.map((e) => e.msg).join("\n");
const inBox = (r: Rect, v: Rect) => r.x >= v.x - 0.5 && r.y >= v.y - 0.5 && r.x + r.w <= v.x + v.w + 0.5 && r.y + r.h <= v.y + v.h + 0.5;

describe("still scenes", () => {
  const src = 'box web "web"\nbox api "API"\ncylinder db "orders"\nweb -> api "HTTPS"\napi -> db';
  test("no steps is one frame, in which nothing moves", () => {
    // Arrange, Act
    const c = scene(src);
    // Assert
    expect(msgs(c)).toBe("");
    expect(c.frames.length).toBe(1);
    expect(c.scene.attrs.still).toBe(true);
    expect(c.frames[0].boxes.map((b) => b.id).sort()).toEqual(["api", "db", "web"]);
    expect(c.frames[0].edges.length).toBe(2);
    expect(c.fx[0].enter).toEqual([]);
  });
  test("the whole scene is in the camera, also on a phone", () => {
    for (const info of [{}, phoneInfo(scene(src), {}, 354)]) {
      const f = scene(src, info).frames[0];
      for (const b of f.boxes) expect(inBox(b, f.camera)).toBe(true);
    }
  });
  test("the LLM view is what is there, with no step count", () => {
    expect(sceneLlm(scene(src))).toBe('Starts with: box web; box api "API"; cylinder db "orders". Connected: web -> api "HTTPS", api -> db.');
  });
  test("one step, or nothing to draw, is refused", () => {
    expect(msgs(scene(`${src}\n@step only\nhighlight api`))).toContain("at least 2 @step");
    expect(msgs(scene("// nothing"))).toContain("needs something to draw");
  });
});

describe("a still scene shows whole (src/core/whole.ts)", () => {
  test("a still column of 24 or 40 boxes shows whole at 1680 wide, not a part of itself", () => {
    for (const n of [24, 40]) {
      const head = [...Array.from({ length: n }, (_, k) => `box b${k} "part ${k}"`), ...Array.from({ length: n - 1 }, (_, k) => `b${k} -> b${k + 1}`)].join("\n");
      const c = wholeLayout(compileScene(head, [], 0, { dir: "down" }), 860);
      const v = wholeView(c, wholeAspect(c, 860), 860);
      expect(v).not.toBeNull();
      for (const b of c.frames[0].boxes) expect(inBox(b, v!)).toBe(true);
    }
  });
  test("a short still scene is as short as it is: its drawing and the margin, not 260 high", () => {
    const c = scene('box a "a"\nbox b "b"\nbox c "c"\na -> b\nb -> c');
    const s = wholeSize(c), ar = wholeAspect(c, 700);
    expect(700 / ar).toBeLessThan(260);
    expect(700 / ar).toBeGreaterThanOrEqual(s.h - 0.5);
  });
  test("a wide still row lays out top to bottom on a phone, words at the least size", () => {
    const head = Array.from({ length: 8 }, (_, k) => `box b${k} "service ${k}"`).join("\n");
    const c = wholeLayout(compileScene(head, [], 0, {}), 352);
    expect(c.scene.attrs.narrow).toBe(true);
    expect(wholeView(c, wholeAspect(c, 352), 352)).not.toBeNull();
  });
  test("static shows one step whole: the view holds every thing of that step", () => {
    const c = scene('box a "a"\nbox b "b"\n@step one\nhighlight a\n@step two\nadd box c "c"\nb -> c');
    const one = oneStep(c, 1), v = staticView(one, 1.6, 700);
    expect(one.frames.length).toBe(1);
    for (const b of one.frames[0].boxes) expect(inBox(b, v)).toBe(true);
  });
  test("the page lays out at 16 px steps", () => {
    expect([layoutWidth(700), layoutWidth(714), layoutWidth(15)]).toEqual([688, 704, 0]);
  });
});

// (the owner's page, 1180 wide: "the stage is cut at the right, and one arrow label is clipped to a letter")
describe("the clipping fault: an arrow's label belongs to the scene and to what a view cuts", () => {
  // a wide row, and the last thing's arrow down with a label longer than the things it joins: the label sticks out of
  // every box at the right
  const wide = `group g layout=row\npill a "alpha service" in g\npill b "beta service" in g\npill c "gamma service" in g\npill d "delta service" in g\npill e "epsilon service" in g\npill z "Z" in g\npill y "Y"\nz -> y "a long label on the last arrow at the right"\na -> b\n@step one\ncamera all\n@step two\nhighlight a`;
  // the article column's stage at a laptop: 714 wide, its height from the scene's shape (260 to 620)
  const laptop = (ar: number) => { const w = 714, h = Math.min(620, Math.max(260, w / ar)); return { w, h }; };
  test("the label is inside the scene's bounds and the first step's laptop view, whole", () => {
    const c = scene(wide), f = c.frames[0];
    const b = laptop(c.aspect), v = storyView(f, b.w / b.h, b.w), lr = f.edges.find((e) => e.label)!.lr!;
    expect(f.bounds.x + f.bounds.w).toBeGreaterThanOrEqual(lr.x + lr.w);
    expect([lr.x >= v.x, lr.x + lr.w <= v.x + v.w]).toEqual([true, true]);
  });
  test("a view that cuts an arrow's label counts it as cut", () => {
    const c = scene(wide), f = c.frames[0], lr = f.edges.find((e) => e.label)!.lr!;
    expect(cutBy(f, { x: lr.x + lr.w / 2 - 400, y: lr.y - 50, w: 400, h: 200 }).some((r) => r.x === lr.x && r.y === lr.y)).toBe(true);
  });
  test("every Format fixture scene, every step, laptop stage: no arrow label or speech is cut by the story view", () => {
    const FIX = join(import.meta.dir, "../fixtures/format"), bad: string[] = [];
    const words = (f: Frame) => {
      const out: { what: string; r: Rect }[] = [], byKey = new Map(f.boxes.map((b) => [b.key, b]));
      for (const e of f.edges) { const a = byKey.get(e.from), b = byKey.get(e.to); if (e.lr && e.label && a && b && !a.hidden && !b.hidden && !a.faint && !b.faint) out.push({ what: `arrow label "${e.label}"`, r: e.lr }); }
      for (const m of f.marks) if (m.r && m.text) out.push({ what: `${m.kind} "${m.text}"`, r: m.r });
      return out;
    };
    for (const name of readdirSync(FIX).filter((x) => x.endsWith(".dh.md")).sort()) {
      for (const m of readFileSync(join(FIX, name), "utf8").matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)) {
        if (/\bonly\b/.test(m[1])) continue; // 3D only: no flat story view
        const c = scene(m[2]);
        if (c.errors.length) continue;
        const b = laptop(c.aspect);
        c.frames.forEach((f, k) => {
          const v = storyView(f, b.w / b.h, b.w);
          for (const w of words(f)) if (hit(w.r, v, -1) && !inBox(w.r, v)) bad.push(`${name} step ${k + 1}: ${w.what}`);
        });
      }
    }
    expect(bad).toEqual([]);
  }, 60000);
});
