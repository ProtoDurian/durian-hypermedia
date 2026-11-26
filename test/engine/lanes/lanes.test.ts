import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { beginDocument } from "../../../src/core/stage-budget";
import { compileStage, layoutStage } from "../../../src/core/stage";
import { Lanes, placeLanes } from "../../../src/engine/layouts/lanes";
import { printStage } from "../../../src/engine/layouts/lanes/stage-src";
import { shownAt } from "../../../src/engine/layouts/lanes/items";
import type { Prim } from "../../../src/engine/types";
import { FIX, ROOT, blockOf, ctxOf, inputOf, modelOf } from "./helper";

beforeEach(() => { beginDocument(); });
const stage = (n: string) => join(ROOT, "fixtures/stage", n);
const words = (ps: Prim[]) => ps.flatMap((p) => (p.k === "text" ? p.lines : p.k === "chip" ? [p.words] : []));

describe("lanes: the stage's layout behind the plug-in", () => {
  test("it is the lanes plug-in", () => { expect(Lanes.name).toBe("lanes"); });

  test("fixture 01 at 1000: the plan has the stage's size and a rect for every card", () => {
    const b = blockOf(stage("01-animation-a-composed-stage.dh.md")), m = modelOf(b);
    const problems: { line: number; msg: string }[] = [];
    const placed = placeLanes(inputOf(m), ctxOf(1000, problems));
    expect(problems).toEqual([]);
    const c = compileStage(b.src.head, b.src.steps, 1, {}, b.roles), old = layoutStage(c.model, 1000);
    expect([placed.w, placed.h]).toEqual([old.w, old.h]);
    const r = placed.at(1);
    for (const id of ["b1", "b2", "b3", "b4", "s0", "s1", "db", "cfg"]) expect(r[id]).toBeDefined();
    const box = old.items.find((i) => i.k === "box" && i.id === "s0")!;
    expect(r.s0).toEqual({ x: (box as any).x, y: (box as any).y, w: (box as any).w, h: (box as any).h });
  });

  test("a card keeps its place in every step (the still rule)", () => {
    const m = modelOf(blockOf(stage("01-animation-a-composed-stage.dh.md"))), placed = placeLanes(inputOf(m), ctxOf(1000));
    for (let k = 2; k <= m.steps.length; k++) for (const [id, rc] of Object.entries(placed.at(k))) if (placed.at(1)[id]) expect(rc).toEqual(placed.at(1)[id]);
  });

  test("the connectors the Model has are routed by the plug-in, the rest are decor", () => {
    const m = modelOf(blockOf(stage("01-animation-a-composed-stage.dh.md"))), placed = placeLanes(inputOf(m), ctxOf(1000));
    const rel = m.relations["s0->db"], r = placed.at(2);
    const d = placed.routes!(2, rel, r.s0, r.db);
    expect(d).toMatch(/^M\d/);
    expect(placed.decor(2).some((p) => p.k === "path" && p.id === "s0>db")).toBe(false);
    expect(placed.routes!(2, { ...rel, from: "zz", to: "yy" }, r.s0, r.db)).toBeNull();
  });

  test("every word the stage shows outside its cards is in the decor of that step (the cards are drawn from the Model)", () => {
    const b = blockOf(stage("01-animation-a-composed-stage.dh.md")), m = modelOf(b), placed = placeLanes(inputOf(m), ctxOf(1000));
    const c = compileStage(b.src.head, b.src.steps, 1, {}, b.roles), old = layoutStage(c.model, 1000);
    for (let k = 1; k <= m.steps.length; k++) {
      const got = new Set(words(placed.decor(k))), cards = Object.values(placed.at(k)).filter((r, i) => !m.things[Object.keys(placed.at(k))[i]].parent);
      const inCard = (x: number, y: number) => cards.some((r) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5);
      const tags = new Set(c.model.steps.flatMap((s) => s.tags.map(([, t]) => t)));
      for (const it of old.items) if (it.k === "text" && shownAt(it, k) && !inCard(it.x, it.y) && !tags.has(it.s)) expect(got.has(it.s) || it.breaks?.length).toBeTruthy();
    }
    expect(words(placed.decor(2))).toContain("SELECT");
    expect(words(placed.decor(1))).not.toContain("SELECT");
  });

  test("keys are unique inside a step and stay the same between steps", () => {
    const m = modelOf(blockOf(stage("15-animation-cards-inside-cards.dh.md"))), placed = placeLanes(inputOf(m), ctxOf(1000));
    const seen = new Map<string, string>();
    for (let k = 0; k <= m.steps.length; k++) {
      const ks = placed.decor(k).map((p) => p.key);
      expect(new Set(ks).size).toBe(ks.length);
      for (const p of placed.decor(k)) { const sig = p.k + JSON.stringify(p.k === "box" || p.k === "rect" ? p.rect : p.k === "text" ? [p.x, p.y] : p.k === "path" ? p.d : ""); if (seen.has(p.key)) expect(seen.get(p.key)).toBe(sig); seen.set(p.key, sig); }
    }
  });

  test("cards inside cards: the inner cards have rects inside the outer one", () => {
    const m = modelOf(blockOf(stage("15-animation-cards-inside-cards.dh.md"))), placed = placeLanes(inputOf(m), ctxOf(1000)), r = placed.at(1);
    expect(r.f1).toBeDefined(); expect(r.h).toBeDefined();
    expect(r.f1.x).toBeGreaterThanOrEqual(r.h.x); expect(r.f1.y).toBeGreaterThanOrEqual(r.h.y);
    expect(r.f1.x + r.f1.w).toBeLessThanOrEqual(r.h.x + r.h.w + 0.5); expect(r.f1.y + r.f1.h).toBeLessThanOrEqual(r.h.y + r.h.h + 0.5);
  });

  test("the phone stacks the lanes: narrow and taller", () => {
    const m = modelOf(blockOf(stage("01-animation-a-composed-stage.dh.md")));
    const wide = placeLanes(inputOf(m), ctxOf(1000)), phone = placeLanes(inputOf(m), ctxOf(340));
    expect(phone.w).toBeLessThanOrEqual(341); expect(phone.h).toBeGreaterThan(wide.h);
    const r = phone.at(1); expect(r.b1.y).toBeLessThan(r.s0.y); expect(r.s0.y).toBeLessThan(r.db.y);
  });

  test("a problem of the stage's own compile goes to the context, with its line", () => {
    const b = blockOf(stage("01-animation-a-composed-stage.dh.md")); b.src.head += "\nnope nope nope";
    const problems: { line: number; msg: string }[] = []; placeLanes(inputOf(modelOf(b)), ctxOf(1000, problems));
    expect(problems.length).toBeGreaterThan(0); expect(problems[0].msg.length).toBeGreaterThan(5);
  });

  test("without a stashed source the Model is printed back to the stage's words", () => {
    const m = modelOf(blockOf(stage("01-animation-a-composed-stage.dh.md")), false);
    const src = printStage(m);
    expect(src.head).toContain("## Browsers"); expect(src.head).toContain("client b1,b2,b3,b4: laptop; phone"); // eng-migrate2: cards that share lines are one line, as the stage wrote them
    const problems: { line: number; msg: string; warn?: boolean }[] = [];
    const placed = placeLanes(inputOf(m), ctxOf(1000, problems));
    expect(problems.filter((p) => !p.warn)).toEqual([]);
    expect(placed.at(1).b1).toBeDefined();
  });
});

const files = [
  ...["01-animation-a-composed-stage", "15-animation-cards-inside-cards", "16-animation-pills-that-move", "17-animation-token-chips-and-a-record", "18-animation-two-arrows-one-label-each", "19-animation-a-key"].map((n) => stage(`${n}.dh.md`)),
  ...readdirSync(FIX).filter((f) => f.endsWith(".dh.md")).sort().map((f) => join(FIX, f)),
];
describe("lanes: every fixture of the lane draws at 1280 and 390", () => {
  for (const f of files) for (const w of [1178, 390]) {
    test(`${f.split("/").pop()} at ${w}`, () => {
      const m = modelOf(blockOf(f)), problems: { line: number; msg: string; warn?: boolean }[] = [];
      const placed = placeLanes(inputOf(m), ctxOf(w, problems));
      expect(problems.filter((p) => !p.warn)).toEqual([]);
      expect(placed.w).toBeGreaterThan(100); expect(placed.h).toBeGreaterThan(40);
      for (let k = 0; k <= m.steps.length; k++) {
        const ks = placed.decor(k).map((p) => p.key);
        expect(new Set(ks).size).toBe(ks.length);
        expect(placed.decor(k).length).toBeGreaterThan(0);
      }
    });
  }
});

describe("lanes: tones", () => {
  test("a toned rect (a chip in a tone) carries its tone", () => {
    const b = blockOf(stage("01-animation-a-composed-stage.dh.md")); b.src.steps[0].raw += "\nb1 -> s0 (bad): dropped";
    const m = modelOf(b), placed = placeLanes(inputOf(m), ctxOf(1000));
    const all = [0, 1, 2, 3, 4].flatMap((k) => placed.decor(k));
    expect(all.some((p) => (p.k === "rect" || p.k === "box") && p.tone === "bad") || all.some((p) => p.k === "text" && p.tone === "bad")).toBe(true);
  });
});

// the real front-end (parse/lower-stage.ts): the Model it gives lays out the same as the stage's own plan
import { fencesOf } from "../parse/fixtures";
import { compile, readModel } from "../../../src/engine/pipeline";
import { statesOf } from "./helper";
describe("lanes: a Model from the real lowerStage", () => {
  for (const f of files) for (const w of [1178, 390]) {
    test(`${f.split("/").pop()} at ${w}`, () => {
      const [fence] = fencesOf(f);
      const model = readModel(fence.src);
      expect(model.origin).toBe("stage11");
      expect(model.fence["stage-src"]).toBeTruthy();
      const problems: { line: number; msg: string; warn?: boolean }[] = [];
      const placed = placeLanes({ model, states: statesOf(model), container: null, members: [], regions: model.regions }, ctxOf(w, problems));
      expect(problems.filter((p) => !p.warn)).toEqual([]);
      const src = JSON.parse(model.fence["stage-src"]);
      const c = compileStage(src.head, src.steps, src.base, src.info, fence.src.roles), old = layoutStage(c.model, w);
      expect([placed.w, placed.h]).toEqual([old.w, old.h]);
      // every card the model has and the stage draws has a rect at the step it is first shown
      const cards = old.items.filter((i) => i.k === "box" && i.id && model.things[i.id]) as any[];
      for (const it of cards) expect(placed.at(it.from ?? 1)[it.id]).toBeDefined();
    });
  }
});

describe("lanes: charts the Model holds as things", () => {
  const gt12 = join(FIX, "gt-12-monthly-budget.tweaked.dh.md");
  test("a chart kind the chart system cannot draw yet keeps the stage's own block", async () => {
    const { chartReady } = await import("../../../src/engine/layouts/lanes");
    if (chartReady("bar")) return; // the chart system is there: the next test holds
    const [fence] = fencesOf(gt12), model = readModel(fence.src);
    const placed = placeLanes({ model, states: statesOf(model), container: null, members: [], regions: model.regions }, ctxOf(1178));
    expect(placed.at(2).bars).toBeUndefined();
    expect(placed.decor(2).some((p) => p.cls?.includes("stg-bar"))).toBe(true);
  });
  test("a chart kind it can draw gets a rect for the chart thing, and the stage's own bars are not drawn twice", async () => {
    const { chartReady } = await import("../../../src/engine/layouts/lanes");
    if (!chartReady("bar")) return;
    const [fence] = fencesOf(gt12), model = readModel(fence.src);
    const placed = placeLanes({ model, states: statesOf(model), container: null, members: [], regions: model.regions }, ctxOf(1178));
    const r = placed.at(2).bars; expect(r).toBeDefined(); expect(r.h).toBeGreaterThan(100);
    expect(placed.decor(2).some((p) => p.cls?.includes("stg-bar") || p.cls?.includes("stg-chart-slot"))).toBe(false);
  });
});

describe("lanes: words", () => {
  test("the layout says it draws a line's words itself", () => {
    const placed = placeLanes(inputOf(modelOf(blockOf(stage("01-animation-a-composed-stage.dh.md")))), ctxOf(1000));
    expect(placed.words).toBe("own");
    expect(words(placed.decor(1))).toContain("GET");
  });
});

describe("lanes: lines between cards inside cards", () => {
  test("a line of an inner card is routed by the stage's line of its holder, and the stage's own is not drawn twice", () => {
    const [fence] = fencesOf(stage("15-animation-cards-inside-cards.dh.md")), model = readModel(fence.src);
    const placed = placeLanes({ model, states: statesOf(model), container: null, members: [], regions: model.regions }, ctxOf(1000));
    const r = placed.at(1), rel = model.relations["f1->v"];
    expect(rel).toBeDefined();
    expect(placed.routes!(1, rel, r.f1, r.v)).toMatch(/^M\d/);
    expect(placed.decor(1).some((p) => p.k === "path" && p.id === "h>v")).toBe(false);
  });
  test("every line the core says is drawn at a step has the stage's own line there (so the engine's router is never needed)", () => {
    const miss: string[] = [];
    for (const f of files) {
      const [fence] = fencesOf(f), c = compile(fence.src);
      const placed = placeLanes({ model: c.model, states: c.states, container: null, members: [], regions: c.model.regions }, ctxOf(1178));
      c.states.forEach((st, k) => { if (!k) return; for (const rel of Object.values(c.model.relations)) if (st.relations[rel.id]?.visible && placed.routes!(k, rel, { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }) === null) miss.push(`${f.split("/").pop()} ${rel.id}@${k}`); });
    }
    expect(miss).toEqual([]);
  });
});

describe("lanes: a tag replaces the tag before it", () => {
  const chipsAt = (placed: ReturnType<typeof placeLanes>, k: number, re: RegExp) => placed.decor(k).filter((p) => p.k === "text" && p.lines.some((l) => re.test(l)));
  test("gt 12 as written: the balance chip at step 2 is 1,900 only, not 3,200 over it", () => {
    const [fence] = fencesOf(join(FIX, "gt-12-monthly-budget.dh.md")), c = compile(fence.src), plan = c.plan(1178);
    const balance = /^(3,200|1,900|2,300|1,270)$/;
    const at = (k: number) => plan.frame(k).filter((p) => p.k === "chip" && balance.test(p.words)).map((p) => (p as any).words);
    expect(at(1)).toEqual(["3,200"]); expect(at(2)).toEqual(["1,900"]); expect(at(3)).toEqual(["2,300"]); expect(at(4)).toEqual(["1,270"]); expect(at(5)).toEqual([]);
    expect(plan.frame(5).find((p) => p.key === "t:acc:is")).toMatchObject({ words: "0" }); // step 5: tag acc: 0
    // and the stage's own chips are not in the decor any more
    expect(c.plan(1178).frame(2).filter((p) => p.k === "text" && p.lines.some((l) => balance.test(l))).length).toBe(0);
    void chipsAt;
  });
  test("edge words are not state chips: two lines' words in a step both stay, and each tag is its card's state chip", () => {
    const placed = placeLanes(inputOf(modelOf(blockOf(stage("01-animation-a-composed-stage.dh.md")))), ctxOf(1000));
    expect(words(placed.decor(1)).filter((w) => w === "GET").length).toBeGreaterThanOrEqual(1);
    expect(words(placed.decor(1))).not.toContain("to api 0");
    const [fence] = fencesOf(stage("01-animation-a-composed-stage.dh.md")), c = compile(fence.src);
    expect(c.plan(1000).frame(1).filter((p) => p.k === "chip" && p.words === "to api 0").map((p) => p.key).sort()).toEqual(["t:b1:is", "t:b3:is"]);
  });
});

describe("lanes: no two words in one place", () => {
  for (const f of files) for (const w of [1178, 390]) {
    test(`${f.split("/").pop()} at ${w}: at no step do two texts start in the same place`, () => {
      const [fence] = fencesOf(f), model = readModel(fence.src);
      const placed = placeLanes({ model, states: statesOf(model), container: null, members: [], regions: model.regions }, ctxOf(w));
      const bad: string[] = [];
      for (let k = 1; k <= model.steps.length; k++) {
        const seen = new Map<string, string>();
        for (const p of placed.decor(k)) if (p.k === "text") { const key = `${Math.round(p.x)}:${Math.round(p.y)}`; const was = seen.get(key); if (was !== undefined && was !== p.lines[0]) bad.push(`k${k} ${was} / ${p.lines[0]}`); seen.set(key, p.lines[0]); }
      }
      expect(bad).toEqual([]);
    });
  }
});

describe("lanes: a stage chart block with words the chart system cannot draw keeps the stage's drawing (adapter)", () => {
  test("stage 22: tabs, readouts, the busiest and cap lines are the chart system's now (eng-stagebars); gt 12's plain bars go to it too", () => {
    const [f22] = fencesOf(stage("22-animation-a-bar-chart-in-a-scene.dh.md")), c22 = compile(f22.src), p22 = c22.plan(1178);
    expect(p22.rects(2).bars).toBeDefined(); // eng-stagebars: the chart system draws the stage's bars whole (opts.stage = "bars")
    const words = p22.frame(c22.states.length - 1).flatMap((p) => (p.k === "text" ? p.lines : []));
    for (const w of ["One barista", "Two baristas", "busiest 1.2×", "cap 1.2×"]) expect(words).toContain(w);
    const [f12] = fencesOf(join(FIX, "gt-12-monthly-budget.tweaked.dh.md")), c12 = compile(f12.src);
    expect(c12.plan(1178).rects(2).bars).toBeDefined();
  });
});

describe("lanes: a pair and its reverse share the stage's one line", () => {
  test("gt 05 step 7: oc -> bc runs the line bc -> oc took, backwards (its dot leaves oc)", () => {
    const [fence] = fencesOf(join(ROOT, "fixtures/gt/05-dns-lookup.dh.md")), c = compile(fence.src);
    const placed = placeLanes({ model: c.model, states: c.states, container: null, members: [], regions: c.model.regions }, ctxOf(1280));
    const unit = { x: 0, y: 0, w: 1, h: 1 }, k = 7;
    const there = placed.routes!(k, c.model.relations["bc->oc"], unit, unit)!, back = placed.routes!(k, c.model.relations["oc->bc"], unit, unit)!;
    const ends = (d: string) => { const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number); return [n.slice(0, 2), n.slice(-2)]; };
    expect(ends(back)[0]).toEqual(ends(there)[1]); expect(ends(back)[1]).toEqual(ends(there)[0]);
  });
});

describe("lanes: chartDraws (the adapter's rule)", () => {
  test("a stage bar block the chart system draws whole goes to it; max is a column block's scale; tabs stay the stage's", async () => {
    const { chartDraws } = await import("../../../src/engine/layouts/lanes");
    const m = { steps: [{ facts: [{ k: "layout", word: "peak", arg: "", body: [], src: { line: 1 } }] }] } as never;
    expect(chartDraws(m, { opts: { stage: "bars", tabs: "a|b", line: "x" } }, ["peak"])).toBe(true);
    expect(chartDraws(m, { opts: { tabs: "a|b" } }, [])).toBe(false);
    expect(chartDraws(m, { opts: { axis: "x" } }, ["peak"])).toBe(false);
    expect(chartDraws({ steps: [] } as never, { opts: { every: "3", max: "12" } }, [])).toBe(true);
  });
});
