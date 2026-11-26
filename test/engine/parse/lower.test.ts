// Lane parse: both old front ends lower to a Model with no refusal, on every animation fence of the fixtures.
import { describe, expect, test } from "bun:test";
import { allFixtureFences } from "./fixtures";
import { lowerGraph } from "../../../src/engine/parse/lower-graph";
import { lowerStage } from "../../../src/engine/parse/lower-stage";
import { frontEnd } from "../../../src/engine/pipeline";

const all = allFixtureFences();
const lower = (f: (typeof all)[number]) => (frontEnd(f.src) === "stage11" ? lowerStage(f.src) : lowerGraph(f.src));
const by = (part: string, n = 1) => all.find((f) => f.id.includes(part) && f.n === n)!;

describe("every animation fence lowers", () => {
  for (const f of all) test(f.id, () => {
    const m = lower(f);
    const refused = m.problems.filter((p) => !p.warn);
    if (f.id.startsWith("hostile/") && !f.id.includes("10-")) expect(refused.length).toBeGreaterThan(0); // hostile 07 (one step) and 09 (garbage) are refused on purpose, by the old parsers too
    else expect(refused).toEqual([]);
    expect(m.format).toBe(12);
    expect(m.origin).toBe(frontEnd(f.src));
    for (const id of m.order) expect(m.things[id]).toBeDefined();
    for (const r of Object.values(m.relations)) expect(m.things[r.from] ?? Object.values(m.scenes).find((s) => s.things[r.from]) ?? m.things[r.from.split(".")[0]]).toBeDefined();
    expect(JSON.parse(m.fence[m.origin === "stage11" ? "stage-src" : "graph-src"]).head).toBeDefined();
  });
});

describe("graph engine (format 10)", () => {
  test("48: a tree of circles, a token that walks, an add that becomes show + hide", () => {
    const m = lowerGraph(by("48-").src);
    expect(m.things.t.layout).toBe("tree"); expect(m.things.n3.parent).toBe("t"); expect(m.things.n3.keys).toMatchObject({ under: "n8", side: "left" });
    expect(m.things.k.shape).toBe("token");
    expect(m.steps[0].facts.map((f) => f.k)).toEqual(["show", "at", "light"]);
    expect(m.steps[1].facts[0]).toMatchObject({ k: "at", ids: ["k"], place: "n3" });
    expect(m.steps[2].facts.map((f) => f.k)).toEqual(["show", "hide", "tone", "camera"]);
    expect(m.look).toBe("classic");
  });
  test("70: layers are regions with layout layers, families are roles, sends are rel events", () => {
    const m = lowerGraph(by("70-").src);
    expect(m.view).toBe("3d"); expect(m.layout).toBe("layers");
    expect(m.regions.map((r) => r.id)).toEqual(["us", "eu", "ap"]);
    expect(m.things.db2.region).toBe("eu"); expect(m.things.db2.role).toBe("db"); expect(Object.keys(m.roles)).toContain("copy");
    expect(m.steps[0].facts[0]).toMatchObject({ k: "layers", apart: true });
    expect(m.steps[2].facts.filter((f) => f.k === "rel").length).toBe(2);
    expect(m.steps[5].facts.find((f) => f.k === "focus")).toMatchObject({ k: "focus", target: "ap" });
  });
  test("50: sharding", () => { const m = lowerGraph(by("50-").src); expect(m.steps.length).toBeGreaterThan(2); expect(m.problems).toEqual([]); });
  test("a data structure keeps its values; push/pop/swap/put become values facts", () => {
    const m = lowerGraph(by("63-").src);
    expect(m.steps.flatMap((s) => s.facts).some((f) => f.k === "values")).toBe(true);
  });
});

describe("composed stage (format 11)", () => {
  test("01: lanes are regions, cards things, connectors rel events, tag is `is`", () => {
    const m = lowerStage(by("stage/01-").src);
    expect(m.regions.map((r) => r.title)).toEqual(["Browsers", "Servers", "Storage", ""]);
    expect(m.things.b1.region).toBe("browsers"); expect(m.things.s0.role).toBe("server");
    expect(m.steps[0].facts.filter((f) => f.k === "rel").length).toBe(4);
    expect(m.steps[0].facts.find((f) => f.k === "is")).toMatchObject({ ids: ["b1", "b3"], words: "to api 0" });
    expect(m.title).toBe("Orders");
  });
  test("21: counted columns are a dots chart; counts are values; light names parts", () => {
    const m = lowerStage(by("stage/21-").src);
    const t = m.things.columns;
    expect(t.chart?.kind).toBe("dots"); expect(t.chart?.x).toHaveLength(12); expect(t.chart?.x[6]).toBe("Jul");
    expect(m.steps[0].facts[0]).toMatchObject({ k: "values", id: "columns", values: ["24", "19", "31", "22", "27", "12"] });
    expect(m.steps[1].facts[1]).toMatchObject({ k: "light", ids: ["columns.Jul", "columns.Aug", "columns.Sep", "columns.Oct", "columns.Nov", "columns.Dec"] });
  });
  test("the block words of a head block are handed on verbatim", () => {
    const f = all.find((x) => x.id.includes("stage/05-"))!; const m = lowerStage(f.src);
    expect(Object.keys(m.layoutWords)).toContain("timeline");
  });
});

describe("pinned lowering rules (from the lanes)", () => {
  test("51: a bare connector in a step is a lasting relation with its label, never a send", () => {
    const m = lowerGraph(by("51-").src);
    const r = m.relations["d2->d3"];
    expect(r.label).toBe("copies"); expect(r.setup).toBe(false); expect(r.style).toBe("dashed");
    const step5 = m.steps[4].facts.filter((f) => f.k === "rel");
    expect(step5.find((f: any) => f.rel === "d2->d3")).toMatchObject({ words: null });
    expect(step5.find((f: any) => f.rel === "app->d2")).toMatchObject({ words: "write" }); // the one send of the step
    expect(m.problems).toEqual([]);
  });
  test("a note stays in keys.note, not in the lines", () => {
    const m = lowerGraph(by("52-").src);
    expect(m.things.svc.keys.note).toBeDefined(); expect(m.things.svc.lines).toEqual([]);
  });
  test("49: buckets are a map with buckets=N; get lights a cell", () => {
    const m = lowerGraph(by("49-").src);
    expect(m.things.h.layout).toBe("map"); expect(m.things.h.keys.buckets).toBeDefined();
    expect(m.steps.flatMap((s) => s.facts).some((f) => f.k === "light" && f.ids.some((i) => /^h\./.test(i)))).toBe(true);
  });
  test("a time block's keep lines are layout words 'keep'", () => {
    const f = all.find((x) => x.id.includes("stage/")) ; expect(f).toBeDefined();
    const kept = all.filter((x) => x.id.startsWith("stage/")).flatMap((x) => lowerStage(x.src).steps.flatMap((s) => s.facts)).filter((f: any) => f.k === "layout" && f.word === "keep");
    expect(kept.length).toBeGreaterThan(0);
  });
});
