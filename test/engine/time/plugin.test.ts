// The `timeline` plug-in through the engine's own contract (LayoutPlugin.place, words, llm), on hand-built models.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { measure, wrap, setPhoneFont } from "../../../src/core/stage-core";
import { LAYOUT, layoutForWord } from "../../../src/engine/layouts";
import { Timeline } from "../../../src/engine/layouts/time";
import { lineText, splitKeep } from "../../../src/engine/layouts/time/words";
import type { LayoutCtx, LayoutInput, Problem, Prim } from "../../../src/engine/types";
import { loadFence, timeModel } from "./lower";

const FX = join(import.meta.dir, "../../../fixtures/stage");
const DATA = join(import.meta.dir, "data");
const ctxFor = (width: number, problems: Problem[] = []): LayoutCtx => ({
  width, phone: width < 480, look: "stage", measure: (t, f) => measure(t, f), wrap: (t, w, f, max) => wrap(t, w, f, max),
  child: () => { throw new Error("no children"); }, problem: (p) => problems.push(p),
});
const input = (model: ReturnType<typeof timeModel>): LayoutInput => ({ model, states: [], container: null, members: [], regions: [] });
const texts = (prims: Prim[]) => prims.flatMap((p) => (p.k === "text" ? p.lines : []));

describe("timeline: the registry and the words", () => {
  test("registered as `timeline`, owns the time words, never the core `show`", () => {
    expect(LAYOUT.timeline).toBe(Timeline);
    expect(layoutForWord("span", "step")).toBe(Timeline);
    expect(layoutForWord("hush", "step")).toBe(Timeline);
    expect(layoutForWord("keep", "step")).toBe(Timeline);
    expect(layoutForWord("keep span", "step")).toBe(Timeline);
    expect(layoutForWord("ticks", "setup")).toBe(Timeline);
    expect(Timeline.words!.step).not.toContain("show");
    expect(Timeline.words!.step).not.toContain("light");
  });
  test("a handed-over word rebuilds the stage's own line, with or without the colon", () => {
    expect(lineText("zoom", "24..36 | Close-up")).toBe("zoom: 24..36 | Close-up");
    expect(lineText("zoom:", ": 24..36 | Close-up")).toBe("zoom: 24..36 | Close-up");
    expect(lineText("zoom row", `job detail "Detail": +working 8..12`)).toBe(`zoom row job detail "Detail": +working 8..12`);
    expect(lineText("zoom", `row job detail "Detail": +working 8..12`)).toBe(`zoom row job detail "Detail": +working 8..12`);
    expect(lineText("row", "labels: beside")).toBe("row labels: beside");
    expect(lineText("zoom ticks", "40 check")).toBe("zoom ticks: 40 check");
    expect(lineText("at", "30: halfway")).toBe("at 30: halfway");
    expect(lineText("row", `job j1 "build": queued 0..4`)).toBe(`row job j1 "build": queued 0..4`);
  });
  test("`keep` arrives as a word, a prefix or a flag", () => {
    expect(splitKeep("keep", "at 6 [bad]: x")).toEqual({ word: "at", arg: "6 [bad]: x", keep: true });
    expect(splitKeep("keep at", "6 [bad]: x")).toEqual({ word: "at", arg: "6 [bad]: x", keep: true });
    expect(splitKeep("span", "j1 4..31: x", true)).toEqual({ word: "span", arg: "j1 4..31: x", keep: true });
    expect(splitKeep("at:", "6")).toEqual({ word: "at", arg: "6", keep: false });
  });
});

describe("timeline: place()", () => {
  const fence = loadFence(join(FX, "05-animation-time.dh.md"));
  const model = timeModel(fence);
  test("the whole story is laid out once; a step shows what its facts say", () => {
    const problems: Problem[] = [];
    const placed = Timeline.place(input(model), ctxFor(1280, problems));
    expect(problems).toEqual([]);
    expect(placed.w).toBe(1280);
    expect(placed.h).toBeGreaterThan(100);
    expect(placed.at(1)).toEqual({});
    const t1 = texts(placed.decor(1)), t2 = texts(placed.decor(2)), t3 = texts(placed.decor(3));
    expect(t1).toContain("27 s");
    expect(t1).not.toContain("build done");
    expect(t2).toContain("build done");
    expect(t2).not.toContain("tests pass");
    expect(t3).toContain("tests pass");
    // the rows and the ruler are drawn in every step, in the same place: a key in two steps is the same geometry
    const geo = (p: Prim) => JSON.stringify({ ...p, cls: undefined });
    const a = new Map(placed.decor(1).map((p) => [p.key, geo(p)])), b = new Map(placed.decor(3).map((p) => [p.key, geo(p)]));
    const shared = [...a.keys()].filter((k) => b.has(k));
    expect(shared.length).toBeGreaterThan(30);
    for (const k of shared) expect(b.get(k)).toBe(a.get(k));
    // step 0 is the stage's first view
    expect(placed.decor(0)).toEqual(placed.decor(1));
  });
  test("a phone gets its own layout and font", () => {
    const wide = Timeline.place(input(model), ctxFor(1280)), phone = Timeline.place(input(model), ctxFor(390));
    setPhoneFont(false);
    expect(phone.w).toBe(390);
    expect(phone.h).not.toBe(wide.h);
  });
  test("a bad time line is a problem with its line, and the rest still draws", () => {
    const bad = timeModel(fence);
    bad.steps[0].facts.push({ k: "layout", word: "span", arg: "nope 1..2: x", body: [], src: { line: 99 } });
    bad.layoutWords.timeline.push({ word: "ticks", arg: "5, 3", body: [], src: { line: 98 } });
    const problems: Problem[] = [];
    const placed = Timeline.place(input(bad), ctxFor(1280, problems));
    expect(problems.some((p) => p.line === 98)).toBe(true);
    expect(problems.some((p) => p.line === 99)).toBe(true);
    expect(placed.decor(1).length).toBeGreaterThan(10);
  });
  test("words with no time line are refused with a reason", () => {
    const m = timeModel(fence); m.layoutWords.timeline = m.layoutWords.timeline.filter((w) => w.word !== "time");
    const problems: Problem[] = [];
    Timeline.place(input(m), ctxFor(800, problems));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].msg).toMatch(/time/);
  });
});

describe("timeline: the LLM view", () => {
  test("the block's facts, step 0 first, then each step", () => {
    const lines = Timeline.llm!(timeModel(loadFence(join(FX, "06-animation-time-up-close.dh.md"))), []);
    expect(lines[0]).toBe("Time from 0 to 60 seconds:");
    expect(lines).toContain("Step 2: At 30 seconds: halfway.");
  });
});

describe("timeline: the generality scene (gt 04), made-up content", () => {
  for (const f of ["gt04-ci-flaky-retry.dh.md", "gt04-tweaked-ci-flaky-retry.dh.md"]) test(f, () => {
    const fence = loadFence(join(DATA, f));
    const problems: Problem[] = [];
    for (const w of [1280, 390]) {
      const placed = Timeline.place(input(timeModel(fence)), ctxFor(w, problems));
      expect(texts(placed.decor(3))).toContain("test failed");
      expect(texts(placed.decor(1))).not.toContain("test failed");
    }
    expect(problems).toEqual([]);
  });
});

describe("timeline: step caption words and tones", () => {
  test("a [caption] marker's words go to the step caption, from its step on when written in the setup", () => {
    const model = timeModel(loadFence(join(FX, "30-test-arrivals-over-a-bottom-ruler.dh.md")));
    const placed = Timeline.place(input(model), ctxFor(1280));
    expect(placed.caption!(1)).toEqual(["The parcel is released."]);
    expect(placed.caption!(2)).toEqual(["The parcel is released."]);
    expect(texts(placed.decor(1))).not.toContain("The parcel is released.");
  });
  test("a tone paint is the rect's tone", () => {
    const placed = Timeline.place(input(timeModel(loadFence(join(FX, "09-animation-units-on-a-ruler.dh.md")))), ctxFor(1280));
    const tones = new Set(placed.decor(1).flatMap((p) => (p.k === "rect" && p.tone ? [p.tone] : [])));
    expect(tones.has("warn")).toBe(true);
  });
});

describe("timeline: the stylesheet covers every exact-paint class", () => {
  test("every pf-/ps-/pi- class a fixture draws (role paints aside) has a rule in time.css", async () => {
    const css = await Bun.file(join(import.meta.dir, "../../../src/engine/layouts/time/time.css")).text();
    const missing = new Set<string>();
    for (const f of ["05", "06", "09", "10", "11", "23", "28", "30", "31", "33", "35", "37"]) for (const w of [1280, 390]) {
      const file = Array.from(new Bun.Glob(`${f}-*.dh.md`).scanSync({ cwd: FX }))[0];
      const placed = Timeline.place(input(timeModel(loadFence(join(FX, file)))), ctxFor(w));
      for (let k = 1; k <= 7; k++) for (const p of placed.decor(k)) for (const c of (p.cls ?? "").split(" "))
        if (/^(pf|ps|pi)-/.test(c) && !c.includes("role_") && !css.includes(`.${c} `) && !css.includes(`.${c},`)) missing.add(c);
    }
    expect([...missing]).toEqual([]);
  });
});

describe("timeline: a named axis shown late, beside a phase strip (fixture 13)", () => {
  test("`show durations` starts the named axis; `at prepare` (the strip's) is not an error", () => {
    const fence = loadFence(join(FX, "13-test-a-late-timeline.dh.md"));
    const model = timeModel(fence);
    model.layoutWords.track = [{ word: "track", arg: "job prepare, review, publish", body: [], src: { line: 20 } }];
    model.layoutWords.timeline = model.layoutWords.timeline.map((w) => (w.word === "time" ? { ...w, arg: "durations: 0..24 | seconds" } : w));
    model.steps[0].facts.push({ k: "layout", word: "at", arg: "prepare", body: [], src: { line: 27 } });
    model.steps[2].facts.push({ k: "layout", word: "show", arg: "durations", body: [], src: { line: 32 } });
    const problems: Problem[] = [];
    const placed = Timeline.place(input(model), ctxFor(1280, problems));
    expect(problems).toEqual([]);
    const rows = (k: number) => texts(placed.decor(k)).filter((t) => ["First", "Next", "Last"].includes(t));
    expect(rows(1)).toEqual([]);
    expect(rows(3).length).toBe(3);
  });
});
