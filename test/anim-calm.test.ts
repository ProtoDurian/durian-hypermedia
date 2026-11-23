// Format version 11, a calm story (src/core/calm.ts): a thing that takes no part keeps its place; only items that pass
// each other arc; one held view from one camera word to the next, so the camera moves only at a zoom in or out; a
// step's first frame is its start; in 3D a thing that changes floor rises along its way; one token's words at a time.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { calmHeight, heldViews, passing, stepT, tokenSubject } from "../src/core/calm";
import { compileScene, inFrame, storyView, useNarrow, type Compiled } from "../src/core/scene";
import { phoneScene } from "../src/core/readable";

const ROOT = join(import.meta.dir, "..");
const steps = (head: string, ...raw: string[]) => compileScene(head, raw.map((r, k) => ({ title: `step ${k + 1}`, raw: r, line: 10 + 5 * k })), 0, {});
const arcs = (c: Compiled, k: number) => {
  const got = passing(c.frames[k - 1].boxes, c.frames[k].boxes);
  return c.frames[k].boxes.filter((b) => got.has(b.key)).map((b) => b.label).sort();
};
// every animation fence of every Format fixture, as the graph engine reads it
const split = (src: string) => { const [head, ...rest] = src.split(/^@step /m); return { head, steps: rest.map((r, k) => { const [t, ...body] = r.split("\n"); return { title: t.trim(), raw: body.join("\n"), line: 100 * (k + 1) }; }) }; };
const scenes = () => {
  const FIX = join(ROOT, "fixtures/format"), out: { name: string; src: ReturnType<typeof split> & { info: Record<string, string> } }[] = [];
  for (const f of readdirSync(FIX).filter((x) => x.endsWith(".dh.md")).sort())
    for (const m of readFileSync(join(FIX, f), "utf8").matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)) {
      const info: Record<string, string> = {};
      for (const w of m[1].trim().split(/\s+/).filter(Boolean)) { const [k, v] = w.split("="); if (v) info[k] = v; else if (k === "3d" || k === "2d") info.view = k; else if (k === "only") info.only = info.view ?? "3d"; }
      out.push({ name: f, src: { ...split(m[2]), info } });
    }
  return out;
};
const compile = (s: ReturnType<typeof scenes>[number]["src"]) => compileScene(s.head, s.steps, 1, s.info);
const ROUTER = () => scenes().find((x) => x.name.includes("a-message-through-a-router-in-segments"))!;

describe("only items that pass each other travel on an arc", () => {
  test("a queue moves up straight when one leaves", () => {
    // Arrange
    const c = steps('group out "out"\nqueue q "q"\nq -> out', 'push q "one"\npush q "two"\npush q "three"', "pop q to out");
    expect(c.errors).toEqual([]);
    // they do shift along: the rule has something to say no to
    const shifted = c.frames[1].boxes.filter((b) => b.parentKind === "queue" && Math.abs(b.x - (c.frames[0].boxes.find((a) => a.key === b.key)?.x ?? b.x)) > 4);
    // Act, Assert
    expect(shifted.length).toBe(2);
    expect(arcs(c, 1)).toEqual([]);
  });
  test("two items that trade places still do", () => {
    const c = steps('array a "a": 5, 3, 8', "highlight a.0", "swap a.0 a.2");
    expect(c.errors).toEqual([]);
    expect(arcs(c, 1).length).toBe(2);
  });
  test("the stage uses it, on the beat's own clock (before: every shifted item of a queue arced)", () => {
    const a = readFileSync(join(ROOT, "src/ui/anim.tsx"), "utf8");
    expect(a).toContain("const pass = passing(SA.boxes, SB.boxes);");
    expect(a).toContain("if (pass.has(b.key)) r.y += Math.sin(Math.PI * tb)");
    expect(a).not.toContain('["array", "list", "stack", "queue", "bucket"].includes(b.parentKind)');
  });
});

describe("the camera holds from one zoom to the next", () => {
  const PX = 700;
  const shape = (c: Compiled) => PX / Math.min(620, Math.max(260, PX / c.aspect));
  test("the router scene: the camera moves at its zoom in and its zoom out, and at no other step", () => {
    // Arrange
    const c = compile(ROUTER().src), ar = shape(c);
    const zooms = c.frames.flatMap((f, k) => (k && JSON.stringify(f.look) !== JSON.stringify(c.frames[k - 1].look) ? [k + 1] : []));
    // Act
    const H = heldViews(c, ar, PX), cams = c.frames.map((_, k) => JSON.stringify(storyView(H[k].frame, ar, PX)));
    const own = c.frames.map((f) => JSON.stringify(storyView(f, ar, PX)));
    // Assert: two camera words (zoom into, zoom out); each step's own view moved more often than that
    expect(zooms.length).toBe(2);
    expect(cams.flatMap((v, k) => (k && v !== cams[k - 1] ? [k + 1] : []))).toEqual(zooms);
    expect(own.flatMap((v, k) => (k && v !== own[k - 1] ? [k + 1] : [])).length).toBeGreaterThan(2);
  });
  test("every fixture: a held view keeps in frame all that the step's own view kept", () => {
    const lost: string[] = [];
    for (const s of scenes()) {
      const c = compile(s.src);
      if (c.errors.length || c.scene.attrs.still) continue;
      const ar = shape(c), H = heldViews(c, ar, PX);
      c.frames.forEach((f, k) => { if (inFrame(f, storyView(H[k].frame, ar, PX)).ok < inFrame(f, storyView(f, ar, PX)).ok) lost.push(`${s.name} step ${k + 1}`); });
    }
    expect(lost).toEqual([]);
  }, 60000);
  test("the stage reads the held view (2D) and hands it to the 3D stage", () => {
    const a = readFileSync(join(ROOT, "src/ui/anim.tsx"), "utf8"), t = readFileSync(join(ROOT, "src/ui/anim3d.ts"), "utf8");
    expect(a).toContain("story = mv ? moveCam(mv, vB, ar) : user || (hB && hA === hB) ? vB :");
    expect(a).toContain("...(hold ? { hold } : {}),");
    expect(t).toContain("const R: Rest[] = rests.length ? rests : [{ items: v.items, pos, posL }];");
  });
});

describe("a phone", () => {
  test("the router scene at 390 by 844: the stage grows at most to 680, and the camera moves only at the two zooms", () => {
    const wide = compile(ROUTER().src);
    for (const px of [358, 388]) {
      // the layout the stage takes at this width (src/ui/anim.tsx: narrow when it keeps more steps whole)
      const c = phoneScene(wide, useNarrow(wide, px))!;
      const zooms = c.frames.flatMap((f, k) => (k && JSON.stringify(f.look) !== JSON.stringify(c.frames[k - 1].look) ? [k + 1] : []));
      const h = calmHeight(c, px, 844)!;
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(680);
      const ar = px / h, cams = heldViews(c, ar, px).map((x) => JSON.stringify(storyView(x.frame, ar, px)));
      expect(cams.flatMap((v, k) => (k && v !== cams[k - 1] ? [k + 1] : []))).toEqual(zooms);
    }
  });
});

describe("3D: a thing's height while it moves comes from where it starts and ends", () => {
  test("the 3D stage reads the slab count, and the 2D side gives it with the 3D stage's own rule", () => {
    const a = readFileSync(join(ROOT, "src/ui/anim.tsx"), "utf8"), t = readFileSync(join(ROOT, "src/ui/anim3d.ts"), "utf8");
    expect(t).toContain("const floor = it.slab != null ? floorY(it.L, gap(view!)) + it.slab * (SLAB + 1) : baseY(it, byKey);");
    expect(a).toContain("slab: lerp(nA, nB, tb)");
    expect(a).toContain("geoBase(r, by, 1)");
  });
});

describe("a step's first frame", () => {
  test("a frame that began before the click is the step's start, never before it or at its end", () => {
    expect(stepT(1000, 1004, 1500)).toBe(0);
    expect(stepT(1004, 1004, 1500)).toBe(0);
    expect(stepT(1754, 1004, 1500)).toBe(0.5);
    expect(stepT(9000, 1004, 1500)).toBe(1);
    expect(stepT(5, 0, 0)).toBe(1);
  });
  test("the stage uses it, and a beat is never before the first", () => {
    const a = readFileSync(join(ROOT, "src/ui/anim.tsx"), "utf8");
    expect(a).toContain("const p = stepT(now, start, d);");
    expect(a).toContain("Math.max(0, Math.min(NB - 1, Math.floor(t * NB)))");
  });
});

describe("one focus: at rest only the token a step is about keeps its words", () => {
  const router = () => {
    const s = ROUTER().src, c = compile(s);
    const ids = new Set<string>(c.frames.flatMap((f) => f.boxes.filter((b) => b.kind === "token").map((b) => b.id)));
    return (k: number) => { const f = c.frames[k - 1], r = tokenSubject(f, s.steps[k - 1].raw, ids); return r && r.map((q) => f.boxes.find((b) => b.key === q)!.id).sort(); };
  };
  test("the router: a step that names segments keeps only theirs; one token on the stage changes nothing", () => {
    // Arrange
    const at = router(), s = ROUTER().src;
    // Act
    const got = s.steps.map((_, k) => at(k + 1));
    // Assert: every step with two or more tokens keeps at most the tokens it names
    const many = got.filter((x) => x !== null);
    expect(many.length).toBeGreaterThan(3);
    for (const [k, x] of got.entries()) if (x && x.length > 1) expect(s.steps[k].raw.split(/[\s,]+/).some((w) => x.includes(w)) || /split/.test(s.steps[k].raw)).toBe(true);
    expect(got[0]).toBeNull();
  });
  test("a scene with no step words (a still scene) keeps every token's label", () => {
    const f: any = { boxes: [{ key: 1, id: "a", kind: "token" }, { key: 2, id: "b", kind: "token" }], part: [] };
    expect(tokenSubject(f, "", new Set(["a", "b"]))).toBeNull();
  });
  test("the 2D and 3D stages mute the others' words", () => {
    const a = readFileSync(join(ROOT, "src/ui/anim.tsx"), "utf8"), t = readFileSync(join(ROOT, "src/ui/anim3d.ts"), "utf8");
    expect(a).toContain('className={mute ? "scn-chip-t is-mute" : "scn-chip-t"}');
    expect(t).toContain('const tokOff = it.kind === "token" && !!tokSet && !tokSet.has(it.key);');
  });
});
