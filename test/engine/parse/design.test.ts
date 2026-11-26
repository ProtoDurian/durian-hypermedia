// Lane parse: the 7 DESIGN.md examples (A to G) in format 12 read with no refusal and tell the story the design says.
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fencesOf } from "./fixtures";
import { parse12 } from "../../../src/engine/parse/parse12";
import { compile } from "../../../src/engine/pipeline";

const dir = join(import.meta.dir, "design");
const load = (name: string) => fencesOf(join(dir, name + ".dh.md"), undefined, name)[0].src;

test("seven examples", () => expect(readdirSync(dir).filter((f) => f.endsWith(".dh.md")).length).toBe(7));
describe("DESIGN.md examples in format 12", () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md")).sort()) test(f, () => {
    const src = load(f.replace(".dh.md", ""));
    expect(src.format12).toBe(true);
    const m = parse12(src);
    expect(m.problems.filter((p) => !p.warn).map((p) => `${p.line}: ${p.msg}`)).toEqual([]);
    expect(m.origin).toBe("format12");
    expect(compile(src).problems.filter((p) => !p.warn).map((p) => `${p.line}: ${p.msg}`)).toEqual([]);
  });
});

describe("the stories", () => {
  test("A: C and D are copied as C' and D' (the old ones dim), then the label slides (topic at d, then at d2)", () => { // fmt12
    const c = compile(load("a-rebase"));
    expect(c.states[1].things.topic.at).toBe("d"); expect(c.states[2].things.topic.at).toBe("d"); expect(c.states[3].things.topic.at).toBe("d2");
    expect(c.states[1].things.c2.visible || c.states[1].things.d2.visible).toBe(false);
    expect(c.states[2].things.c2.visible && c.states[2].things.d2.visible).toBe(true);
    expect(c.states[2].things.c.dim && c.states[2].things.d.dim).toBe(true);
    expect(c.states[3].relations["c2->d2"].visible && c.states[3].relations["e->c2"].visible).toBe(true);
    expect(c.model.things.main.shape).toBe("ref");
  });
  test("B: is replaces (never stacks), -x is a lost packet", () => {
    const m = parse12(load("b-handshake"));
    expect(m.steps[1].facts.find((f) => f.k === "rel")).toMatchObject({ style: "lost" });
    const c = compile(load("b-handshake"));
    expect(c.states[4].things.s.is).toBe("SYN-RECEIVED"); expect(c.states[5].things.s.is).toBe("ESTABLISHED");
    expect(c.states[5].things.c.is).toBe("ESTABLISHED");
  });
  test("C: a tree of arrays; values fly up from the pairs", () => {
    const m = parse12(load("c-mergesort"));
    expect(m.layout).toBe("tree"); expect(m.things.q1.parent).toBe("h1"); expect(m.things.s.values).toHaveLength(8);
    const f = m.steps[3].facts.find((x) => x.k === "values" && x.id === "h1");
    expect(f).toMatchObject({ values: ["1", "2", "5", "8"], from: ["q1", "q2"] });
    const c = compile(load("c-mergesort"));
    expect(c.motions[4].values.find((v) => v.id === "h1")?.from).toEqual(["q1", "q2"]);
  });
  test("D: a chart with categories, numbers per step, state chip replaced", () => {
    const m = parse12(load("d-budget"));
    expect(m.things.spent.chart).toMatchObject({ kind: "bar", x: ["rent", "food", "travel", "fun", "saved"], flags: ["values"] });
    const c = compile(load("d-budget"));
    expect(c.states[1].things.spent.values).toEqual(["1300", "0", "0", "0", "0"]); expect(c.states[1].things.acc.is).toBe("1,900");
  });
  test("E: indent is children, a binary tree keeps its sides, the token walks", () => {
    const m = parse12(load("e-bst"));
    expect(m.things.n6.parent).toBe("n3"); expect(m.things.n6.flags).toContain("right");
    const c = compile(load("e-bst"));
    expect(c.states[0].things.n6.visible).toBe(false); expect(c.states[3].things.n6.visible).toBe(true); expect(c.states[3].things.k.visible).toBe(false);
  });
  test("F: regions are layers, the state chip is the replica's change", () => {
    const m = parse12(load("f-regions"));
    expect(m.view).toBe("3d"); expect(m.layout).toBe("layers"); expect(m.regions.map((r) => r.title)).toEqual(["us-east", "eu-west", "ap-south"]);
    const c = compile(load("f-regions"));
    expect(c.states[0].things.db3.is).toBe("change 40"); expect(c.states[3].things.db2.is).toBe("change 41"); expect(c.states[4].things.db3.is).toBe("change 40");
    expect(Object.keys(m.relations).filter((k) => m.relations[k].setup)).toEqual(["db1->db2", "db1->db3"]);
  });
  test("G: counted columns are a chart; light names parts", () => {
    const m = parse12(load("g-columns"));
    expect(m.things.returns.chart?.kind).toBe("dots");
    expect(m.steps[1].facts[1]).toMatchObject({ k: "light", ids: ["returns.Jul", "returns.Aug", "returns.Sep", "returns.Oct", "returns.Nov", "returns.Dec"] });
  });
});
