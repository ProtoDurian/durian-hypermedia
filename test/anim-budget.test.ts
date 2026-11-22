// The animation work budget (0.6.2): laying out an animation (play, lay out, route, place) is counted, never timed,
// and charged to a budget of its own: one cap per animation, one for the whole page. These tests count work.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, check, LIMITS } from "../src/index";
import { parseDoc, animSrc, animOf, type PartNode } from "../src/core/dh-lib";
import { compileScene, wrapText } from "../src/core/scene";
import { stageScene, phoneScene } from "../src/core/readable";
import { workTotal, OUTSIDE } from "../src/core/work";
import { genAnimation } from "./anim-gen";

const F = "```";
// a scene of n boxes and some steps; joined: a line from each box to the next
const scene = (n: number, steps: number, joined = false) => {
  const L = [`${F}animation`];
  for (let i = 0; i < n; i++) L.push(`box b${i} "b${i}"`);
  if (joined) for (let i = 1; i < n; i++) L.push(`b${i - 1} -> b${i}`);
  for (let s = 0; s < steps; s++) L.push(`@step step ${s}`, `send "m" b${s % n} -> b${(s * 7 + 3) % n}`, `highlight b${(s * 3) % n}`);
  L.push(F);
  return L.join("\n");
};
// n boxes with a line between many pairs of them
const lines = (n: number, steps: number) => {
  const L = [`${F}animation`];
  for (let i = 0; i < n; i++) L.push(`box b${i} "b${i}"`);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j += 3) L.push(`b${i} -> b${j}`);
  for (let s = 0; s < steps; s++) L.push(`@step s${s}`, `highlight b${s % n}`);
  L.push(F);
  return L.join("\n");
};
const errors = (d: ReturnType<typeof parse>) => d.blocks.filter((b) => b.type === "error") as { message: string; part: string | null }[];
const counted = <T>(fn: () => T): [T, number] => { const u0 = workTotal(); const out = fn(); return [out, workTotal() - u0]; };
const animParts = (text: string): PartNode[] => { const out: PartNode[] = []; const walk = (ns: any[]) => { for (const n of ns) { if (n.kind === "part" && n.name === "animation") out.push(n); if (n.kind === "part") { walk(n.nodes ?? []); for (const it of n.items ?? []) walk(it.nodes); } } }; walk(parseDoc("x.dh.md", text, {}).body); return out; };
// the units of each animation of a page, compiled on its own with no cap
const unitsOf = (text: string) => { const was = LIMITS.maxAnimWork; LIMITS.maxAnimWork = 1e12; try { return animParts(text).map((p) => { const s = animSrc(p); return counted(() => compileScene(s.head, s.steps, s.base, s.info))[1]; }); } finally { LIMITS.maxAnimWork = was; } };
// small caps, so a test that goes over them stays quick
const SMALL = { maxAnimWork: 2_000_000, maxPageAnimWork: 5_000_000 };
// what parse() may count beyond the page's cap: the last charge (one piece of at most 16,384 units), and the LLM view
// of the animations it kept (which plays their stories again, about what their play cost)
const OVER = 200_000;

describe("an animation over its work budget", () => {
  test("is an error block and a problem; the rest of the page is drawn", () => {
    const text = `# Title\n\nBefore.\n\n${scene(60, 120, true)}\n\nAfter.`;
    const [d, units] = counted(() => parse(text, { limits: SMALL }));
    const e = errors(d);
    expect(e.length).toBe(1);
    expect(e[0].part).toBe("animation");
    expect(e[0].message).toMatch(/needs too much layout work \(the limit for one animation is 2,000,000 units\)/);
    expect(d.problems.some((p) => p.level === "error" && /animation: this animation needs too much layout work/.test(p.message))).toBe(true);
    expect(d.blocks.filter((b) => b.type === "markdown").length).toBe(2);
    expect(d.llm).toContain("[animation not shown:");
    expect(units).toBeLessThan(SMALL.maxAnimWork + OVER);
  });

  test("large scenes, many lines and long stories are refused at the default caps, within them", () => {
    for (const text of [scene(280, 199), scene(140, 199, true), lines(40, 100)]) {
      const [d, units] = counted(() => parse(text));
      expect(errors(d).length).toBe(1);
      expect(errors(d)[0].message).toMatch(/needs too much layout work/);
      expect(units).toBeLessThan(LIMITS.maxAnimWork + OVER);
    }
  });

  test("a scene inside the caps is drawn, within them", () => {
    const [d, units] = counted(() => parse(scene(20, 199)));
    expect(errors(d).length).toBe(0);
    expect(units).toBeLessThan(LIMITS.maxAnimWork + OVER);
  });

  test("check() reports it once and does not lay it out again", () => {
    const d = parse(scene(60, 120, true), { limits: SMALL });
    const [ps, units] = counted(() => check(d));
    expect(ps.filter((p) => /too much layout work/.test(p.message)).length).toBe(1);
    expect(units).toBeLessThan(10_000);
  });

  test("the same page gives the same answer every time (the route cache does not change the count)", () => {
    const text = [scene(30, 40, true), scene(24, 30, true), scene(60, 120, true)].join("\n\n");
    const a = parse(text, { limits: SMALL }), b = parse(text, { limits: SMALL });
    expect(JSON.stringify(b.blocks)).toBe(JSON.stringify(a.blocks));
    expect(JSON.stringify(b.problems)).toBe(JSON.stringify(a.problems));
    const s = animSrc(animParts(scene(12, 20, true))[0]);
    const u1 = counted(() => compileScene(s.head, s.steps, s.base, s.info))[1];
    const u2 = counted(() => compileScene(s.head, s.steps, s.base, s.info))[1];
    expect(u2).toBe(u1);
  });
});

describe("the page's work budget", () => {
  test("later animations cannot restart the spend", () => {
    const one = scene(12, 16, true);
    const units = unitsOf(one)[0];
    // room for five of them on the page, each well inside its own cap
    const limits = { maxAnimWork: Math.round(units * 2), maxPageAnimWork: Math.round(units * 5.5) };
    const text = Array.from({ length: 30 }, (_, i) => `## Part ${i}\n\n${one}`).join("\n\n");
    const [d, total] = counted(() => parse(text, { limits }));
    const e = errors(d);
    expect(e.length).toBe(25);
    expect(e.at(-1)!.message).toBe(`the animations on this page need too much layout work (the limit for the whole page is ${limits.maxPageAnimWork.toLocaleString("en-US")} units); this animation and the ones after it are not drawn`);
    expect(d.blocks.filter((b) => b.type === "animation").length).toBe(5);
    expect(d.headings.length).toBe(30);
    expect(total).toBeLessThan(limits.maxPageAnimWork + units + 2 * OVER);
  });

  test("a page of many animations stays within the page's cap at the default caps", () => {
    const text = Array(60).fill(scene(30, 40, true)).join("\n\n");
    const [d, total] = counted(() => parse(text));
    expect(errors(d).length).toBe(60);
    expect(total).toBeLessThan(LIMITS.maxPageAnimWork + 2 * OVER);
  });

  test("check() of a page past the block cap compiles what parse() never reached within a page budget", () => {
    const text = Array.from({ length: 12 }, () => scene(30, 40, true)).join("\n\n");
    const d = parse(text, { limits: { ...SMALL, maxBlocks: 2 } });
    const [, units] = counted(() => check(d));
    expect(units).toBeLessThan(SMALL.maxPageAnimWork + 2 * OVER);
  });
});

describe("one compile per animation", () => {
  test("parse() lays each animation out once (its JSON, LLM view and checks share it)", () => {
    const p = animParts(scene(10, 12, true))[0];
    expect(animOf(p)).toBe(animOf(p));
    const text = scene(12, 16, true);
    const once = unitsOf(text)[0];
    const [d, units] = counted(() => parse(text));
    expect(errors(d).length).toBe(0);
    // one compile, and the LLM view's play of the story
    expect(units).toBeLessThan(once * 1.5);
    const [, more] = counted(() => check(d));
    expect(more).toBeLessThan(once * 0.1);
  });
});

describe("the renderer", () => {
  test("draws a block parse() kept within its own budget, and falls back when a layout is over it", () => {
    const text = scene(30, 40, true);
    const s = animSrc(animParts(text)[0]);
    const was = LIMITS.maxAnimWork;
    try {
      LIMITS.maxAnimWork = 200_000 / OUTSIDE;
      // the wide layout over its budget: the captions on an empty stage
      const c = stageScene(s);
      expect(c.frames.length).toBe(40);
      expect(c.frames.every((f) => f.boxes.length === 0)).toBe(true);
      // a phone layout over its budget: none (the stage keeps the wide one)
      LIMITS.maxAnimWork = 1e12;
      const wide = stageScene(s);
      LIMITS.maxAnimWork = 200_000 / OUTSIDE;
      expect(phoneScene(wide, false)).toBeNull();
      expect(phoneScene(wide, true)).toBeNull();
    } finally { LIMITS.maxAnimWork = was; }
  });

  test("the phone layouts are compiled once per scene, whatever the stage width", () => {
    const s = animSrc(animParts(scene(8, 6, true))[0]);
    const wide = stageScene(s);
    const a = phoneScene(wide, false);
    const [b, units] = counted(() => phoneScene(wide, false));
    expect(b).toBe(a);
    expect(units).toBe(0);
  });
});

describe("work grows with the input, not faster", () => {
  const sizes = [
    { things: 8, containers: 1, edges: 3, steps: 8 },
    { things: 10, containers: 2, edges: 4, steps: 10 },
    { things: 12, containers: 2, edges: 2, steps: 10, layers: 3 },
    { things: 8, containers: 2, edges: 3, steps: 8, label: 40 },
  ];
  test("random scenes stay within the caps (or are refused there)", () => {
    let kept = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const text = genAnimation(seed, sizes[seed % sizes.length]);
      const [d, units] = counted(() => parse(text, { limits: SMALL }));
      const e = errors(d);
      if (e.length) expect(e[0].message).toMatch(/too much layout work/);
      else kept++;
      expect(units).toBeLessThan(SMALL.maxAnimWork + OVER);
    }
    expect(kept).toBeGreaterThan(10);
  }, 30_000);

  test("twice the steps is about twice the work at most", () => {
    // the same things, a story twice as long
    for (const n of [10, 20, 40]) {
      const [u1] = unitsOf(scene(n, 30)), [u2] = unitsOf(scene(n, 60));
      expect(u2).toBeLessThan(u1 * 2.3);
    }
    // random scenes whose steps add nothing (the first steps, then as many again): about twice, though one step can
    // cost far more than the others (a send with no clean way searches the free space); seeds picked to stay quick
    const ratios: number[] = [];
    for (const seed of [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 15, 16]) {
      const z = { ...sizes[seed % sizes.length], grow: false };
      const [u1] = unitsOf(genAnimation(seed, z)), [u2] = unitsOf(genAnimation(seed, { ...z, steps: z.steps * 2 }));
      ratios.push(u2 / u1);
    }
    ratios.sort((a, b) => a - b);
    expect(ratios[ratios.length >> 1]).toBeLessThan(2.2);
    expect(ratios[ratios.length - 1]).toBeLessThan(3);
  }, 30_000);

  test("two copies of an animation on a page are twice the work of one", () => {
    const one = genAnimation(4, sizes[0]);
    const [, u1] = counted(() => parse(one));
    const [, u2] = counted(() => parse(`${one}\n\n${one}`));
    expect(u2).toBeLessThan(u1 * 2.1);
  });

  test("a long label is measured in time that grows with its length", () => {
    const label = (n: number) => `${F}animation\nbox a "${"ab-".repeat(n)}"\nbox b "${"x".repeat(n * 3)}"\na -> b\n@step one\nhighlight a\n@step two\nhighlight b\n${F}`;
    const [u1] = unitsOf(label(2000)), [u2] = unitsOf(label(4000));
    expect(u2).toBeLessThan(u1 * 2.3);
    expect(u2).toBeLessThan(LIMITS.maxAnimWork / 4);
  });

  test("a long word wraps as it did: the same lines", () => {
    // the longest start that fits is found by halving; the answer is the one a scan from the longest gives
    const w = "service-web-replica-b-7f9c".repeat(40) + " " + "abcdefghij".repeat(30) + " " + "中".repeat(50);
    expect(wrapText(w, 13, 160)).toEqual(["service-web-replica-b-", "7f9cservice-web-", "replica-b-7f9cservice-…"]);
    const all = wrapText(w, 13, 160, 99);
    expect(all.length).toBe(78);
    expect(all.slice(60, 62)).toEqual(["abcdefghijabcdefghijabc-", "defghijabcdefghijabcdef-"]);
    expect(all.slice(-2)).toEqual(["中".repeat(11), "中".repeat(6)]);
  });
});

describe("the fixtures", () => {
  const dirs = ["", "format", "hostile"].map((d) => join(import.meta.dir, "../fixtures", d));
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => join(d, f)));
  test("every animation and every page stays well inside the caps (at least 5 times)", () => {
    let most = 0, page = 0;
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      let parts: PartNode[] = [];
      try { parts = animParts(text); } catch { continue; }
      if (!parts.length) continue;
      const us = unitsOf(text);
      most = Math.max(most, ...us);
      page = Math.max(page, us.reduce((a, b) => a + b, 0));
      expect(errors(parse(text)).filter((e) => /layout work/.test(e.message))).toEqual([]);
    }
    expect(most).toBeGreaterThan(0);
    expect(most * 5).toBeLessThan(LIMITS.maxAnimWork);
    expect(page * 5).toBeLessThan(LIMITS.maxPageAnimWork);
  });
});
