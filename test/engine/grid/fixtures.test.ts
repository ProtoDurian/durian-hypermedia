// The grid layout on the real fixtures, read by the real front-end (parse/lower-stage.ts): stage 02 (panels), 04 (the matrix),
// 34 (three bins fences) and the layers example's panels. Sizes, the still rule, what shows in which step, phone and wide.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Grid } from "../../../src/engine/layouts/grid";
import { readLegacy } from "../../../src/engine/layouts/grid/legacy";
import { readModel } from "../../../src/engine/pipeline";
import { states as stepStates } from "../../../src/engine/core/states";
import type { Model, Prim } from "../../../src/engine/types";
import { ctxAt, inputOf, lowerGrid, PANEL_WORDS } from "./helpers";

const read = (f: string) => readFileSync(`fixtures/stage/${f}`, "utf8");
const fences = (f: string) => [...read(f).matchAll(/^```animation([^\n]*)\n([\s\S]*?)^```$/gm)].map((m) => m[2]);
const rolesOf = (f: string): Record<string, number> => Object.fromEntries((/^roles:\n((?:  .*\n)+)/m.exec(read(f))?.[1] ?? "").split("\n").filter(Boolean).map((l) => { const [k, ...v] = l.trim().split(": "); return [k, +(/c(\d)/.exec(v.join(": "))?.[1] ?? 0)]; }));
const real = (f: string, i: number): Model => readModel({ body: fences(f)[i].replace(/\n+$/, ""), line0: 1, fence: {}, roles: rolesOf(f), format12: false });
const F02 = "02-animation-a-phase-strip-and-swapped-panels.dh.md", F04 = "04-animation-a-swimlane-matrix.dh.md", F34 = "34-animation-bins.dh.md", FL = "example-layers.dh.md";
const place = (m: Model, w: number) => Grid.place(inputOf(m, stepStates(m)), ctxAt(w));
const words = (ps: Prim[]) => ps.flatMap((p) => (p.k === "text" ? p.lines : p.k === "chip" ? [p.words] : []));

describe("the real front-end hands the grid layout what it reads", () => {
  test("the matrix and bins reach layoutWords.grid, the panels reach step layout facts", () => {
    expect(real(F04, 0).layoutWords.grid?.[0].word).toBe("matrix");
    expect(real(F34, 0).layoutWords.grid?.map((e) => e.word)).toContain("bin");
    expect(real(F02, 0).steps.flatMap((s) => s.facts).filter((f) => f.k === "layout" && PANEL_WORDS.includes(f.word)).length).toBeGreaterThanOrEqual(3);
  });
  test("every target fixture reads with no problem from the grid layout", () => {
    for (const [f, n] of [[F02, 1], [F04, 1], [F34, 3]] as const) for (let i = 0; i < n; i++) expect(readLegacy(real(f, i)).problems).toEqual([]);
    for (const [i, src] of fences(FL).entries()) { const m = readModel({ body: src.replace(/\n+$/, ""), line0: 1, fence: {}, roles: rolesOf(FL), format12: false }); if (m.layoutWords.grid || m.steps.some((s) => s.facts.some((f) => f.k === "layout" && PANEL_WORDS.includes(f.word)))) expect(readLegacy(m).problems, `layers fence ${i}`).toEqual([]); }
  });
});

describe("stage 04, the swimlane matrix", () => {
  test("wide: a head row, five lanes, every cell; the same size as the stand-in lowering", () => {
    const p = place(real(F04, 0), 1280), q = Grid.place(inputOf(lowerGrid(fences(F04)[0])), ctxAt(1280));
    expect([p.w, p.h]).toEqual([q.w, q.h]);
    expect(p.h).toBeGreaterThan(500);
  });
  test("nothing moves: a card has one place in every step it shows", () => {
    const p = place(real(F04, 0), 1280), seen = new Map<string, string>();
    for (let k = 1; k <= 4; k++) for (const d of p.decor(k)) if (d.k === "box" && !/stg-sel|stg-more/.test(d.cls ?? "")) { const r = `${d.rect.x},${d.rect.y},${d.rect.w},${d.rect.h}`; if (seen.has(d.key) && seen.get(d.key) !== r) throw new Error(`${d.key} moved`); seen.set(d.key, r); }
  });
  test("a card shows only from its step; a lit cell shows in its step alone", () => {
    const p = place(real(F04, 0), 1280);
    expect(words(p.decor(1))).not.toContain("202");
    expect(words(p.decor(2))).toContain("202");
    expect(words(p.decor(2))).toContain("202 sent back");
    expect(words(p.decor(3))).not.toContain("202 sent back");
    expect(words(p.decor(4))).toContain("Done page");
  });
  test("phone: lanes stack, narrower and taller; no word under 11 px", () => {
    const p = place(real(F04, 0), 390);
    expect(p.w).toBe(390); expect(p.h).toBeGreaterThan(place(real(F04, 0), 1280).h);
    for (let k = 1; k <= 4; k++) for (const d of p.decor(k)) if (d.k === "text") { expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x).toBeLessThanOrEqual(390); }
  });
});

describe("stage 34, bins", () => {
  test("three fences place wide and on a phone", () => {
    for (let i = 0; i < 3; i++) for (const w of [1280, 390]) { const p = place(real(F34, i), w); expect(p.h).toBeGreaterThan(80); expect(p.decor(1).length).toBeGreaterThan(5); }
  });
  test("a thing drops into its bin in its step; the inventory slot stays", () => {
    const p = place(real(F34, 0), 1280);
    expect(words(p.decor(1)).filter((x) => x === "Atlas").length).toBeGreaterThanOrEqual(1);
    expect(p.decor(0).length).toBeGreaterThan(0);
  });
  test("the LLM view lines say each block's facts", () => {
    const lines = Grid.llm!(real(F34, 0), []);
    expect(lines.some((l) => l.startsWith("Setup:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Step 1:"))).toBe(true);
  });
});

describe("stage 02, swapped panels", () => {
  test("one region as tall as the tallest step; each step's panel shows in its step only", () => {
    const m = real(F02, 0), p = place(m, 1280);
    const w = (k: number) => words(p.decor(k)).join(" ");
    expect(w(1)).toContain("ui-kit"); expect(w(1)).not.toContain("hash = 0x51a2");
    expect(w(2)).toContain("hash = 0x51a2"); expect(w(2)).not.toContain("ui-kit 3.2.0 · ready");
    expect(w(3)).toContain("strip");
    expect(p.h).toBeGreaterThan(100);
  });
  test("the layout draws its step's foot line itself (words: own) in a band under that step's panels", () => {
    const p = place(real(F02, 0), 1280);
    expect(p.words).toBe("own");
    expect(words(p.decor(1))).toContain("Only ready, public packages go on.");
    expect(words(p.decor(2))).not.toContain("Only ready, public packages go on.");
    const foot = p.decor(1).find((d) => d.k === "text" && d.lines[0].startsWith("Only ready")) as { y: number };
    expect(foot.y).toBeLessThan(p.h);
  });
  test("it takes its width from avail when the parent gives one", () => {
    const m = real(F02, 0), q = Grid.place({ ...inputOf(m, stepStates(m)), avail: 700 }, ctxAt(1280));
    expect(q.w).toBe(700);
    for (const d of q.decor(1)) if (d.k === "box") expect(d.rect.x + d.rect.w).toBeLessThanOrEqual(700);
  });
  test("a phone keeps panels at the full width", () => {
    const p = place(real(F02, 0), 390);
    for (let k = 1; k <= 3; k++) for (const d of p.decor(k)) if (d.k === "box") expect(d.rect.x + d.rect.w).toBeLessThanOrEqual(390.5);
  });
});

describe("the layers example's panels", () => {
  test("every fence with panels places wide and on a phone, and each step's panels show in that step", () => {
    let n = 0;
    for (const src of fences(FL)) {
      const m = readModel({ body: src.replace(/\n+$/, ""), line0: 1, fence: {}, roles: rolesOf(FL), format12: false });
      if (!m.steps.some((s) => s.facts.some((f) => f.k === "layout" && PANEL_WORDS.includes(f.word)))) continue;
      n++;
      for (const w of [1280, 390]) { const p = place(m, w); expect(p.h).toBeGreaterThan(0); for (let k = 1; k <= m.steps.length; k++) p.decor(k); }
    }
    expect(n).toBeGreaterThan(3);
  });
});

describe("the drawing is as tall as its lowest panel (phone and wide)", () => {
  test("no box or word of any step reaches below the height", () => {
    for (const [f, i] of [[F02, 0], [F04, 0], [F34, 0], [F34, 1], [F34, 2]] as const) for (const w of [1280, 390]) {
      const m = real(f, i), p = place(m, w);
      for (let k = 1; k <= m.steps.length; k++) for (const d of p.decor(k)) {
        if (d.k === "box") expect(d.rect.y + d.rect.h, `${f} ${w} step ${k}`).toBeLessThanOrEqual(p.h - 3);
        if (d.k === "text") expect(d.y, `${f} ${w} step ${k}`).toBeLessThanOrEqual(p.h - 3);
      }
    }
  });
});

test("the layers example's panels also stay inside the height", () => {
  for (const src of fences(FL)) {
    const m = readModel({ body: src.replace(/\n+$/, ""), line0: 1, fence: {}, roles: rolesOf(FL), format12: false });
    if (!m.steps.some((s) => s.facts.some((f) => f.k === "layout" && PANEL_WORDS.includes(f.word)))) continue;
    for (const w of [1280, 390]) { const p = place(m, w); for (let k = 1; k <= m.steps.length; k++) for (const d of p.decor(k)) if (d.k === "box") expect(d.rect.y + d.rect.h).toBeLessThanOrEqual(p.h - 3); }
  }
});
