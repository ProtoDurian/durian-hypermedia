import { describe, expect, test } from "bun:test";
import { states, replayProblems } from "../../../src/engine/core/states";
import { diff, valueMap } from "../../../src/engine/core/diff";
import { EXAMPLES } from "./examples";
import { build } from "./build";
import type { Model, Motion, StepState } from "../../../src/engine/types";

const run = (m: Model): { s: StepState[]; mo: Motion[] } => {
  const s = states(m);
  return { s, mo: s.map((x, k) => (k === 0 ? diff(m, x, x) : diff(m, s[k - 1], x))) };
};
const visible = (s: StepState) => Object.entries(s.things).filter(([, t]) => t.visible).map(([id]) => id);

describe("the 7 DESIGN examples read without problems", () => {
  for (const [name, mk] of Object.entries(EXAMPLES)) test(name, () => {
    const m = mk();
    expect(m.problems).toEqual([]);
    const s = states(m);
    expect(s.length).toBe(m.steps.length + 1);
    s.forEach((x, k) => expect(x.step).toBe(k));
    expect(replayProblems(m)).toEqual([]);
  });
});

describe("A, git rebase: a label slides", () => {
  const m = EXAMPLES.A();
  const { s, mo } = run(m);
  test("setup facts are the state at step 0; a thing named in a later show starts hidden", () => {
    expect(s[0].things.main.at).toBe("e");
    expect(s[0].things.d2.visible).toBe(false);
    expect(s[0].relations["e->d2"].visible).toBe(false); // its end is hidden
    expect(s[0].relations["a->b"].visible).toBe(true);
  });
  test("feat at d2 is a move from d to d2; dim restyles", () => {
    expect(mo[3].move).toEqual([{ id: "feat", from: "d", to: "d2" }]);
    expect(mo[3].restyle).toEqual([{ id: "c", fields: ["dim"] }, { id: "d", fields: ["dim"] }]);
    expect(mo[3].touched).toEqual(["c", "d", "feat"]);
  });
  test("show d2 enters it and its setup line with it", () => {
    expect(mo[2].enter).toEqual(["d2"]);
    expect(mo[2].relEnter).toEqual(["e->d2"]);
    expect(mo[2].touched).toEqual(["e", "d2"]);
  });
});

describe("B, TCP: is replaces, a lost send draws no line", () => {
  const m = EXAMPLES.B();
  const { s, mo } = run(m);
  test("is replaces the chip, never stacks", () => {
    expect(s[1].things.s.is).toBe("LISTEN");
    expect(s[3].things.s.is).toBe("SYN-RECEIVED");
    expect(s[4].things.s.is).toBe("ESTABLISHED");
    expect(mo[3].restyle).toEqual([{ id: "s", fields: ["is"] }]);
  });
  test("a send with words: line stays, words and dot this step", () => {
    expect(mo[1].relEnter).toEqual(["c->r"]);
    expect(mo[1].events).toEqual([{ k: "send", rel: "c->r", from: "c", to: "r", words: "SYN seq 100", style: "token", role: null, beat: 0 }]);
    expect(s[4].relations["c->r"].visible).toBe(true);
    expect(mo[2].events.filter((e) => e.k === "send")).toEqual([{ k: "send", rel: "r->s", from: "r", to: "s", words: "SYN seq 100", style: "lost", role: null, beat: 0 }]);
    expect(s[2].relations["r->s"].visible).toBe(false);
    expect(mo[2].touched).toEqual(["r", "s"]);
  });
  test("tone restyles both", () => {
    expect(mo[4].restyle).toEqual([{ id: "c", fields: ["is", "tone"] }, { id: "s", fields: ["is", "tone"] }]);
  });
});

describe("C, merge sort: values slide to their new cells, or fly in from", () => {
  const m = EXAMPLES.C();
  const { s, mo } = run(m);
  test("what a hidden container holds starts hidden; a later show of the container keeps a child hidden that is named in its own show", () => {
    expect(visible(s[0])).toEqual(["s"]);
    expect(visible(s[1])).toEqual(["s", "h1", "h2"]);
    expect(visible(s[2]).length).toBe(7);
    expect(mo[1].enter).toEqual(["h1", "h2"]);
    expect(mo[2].enter).toEqual(["q1", "q2", "q3", "q4"]);
  });
  test("5 2 -> 2 5 trades places", () => {
    const v = mo[3].values.find((x) => x.id === "q1")!;
    expect(v).toEqual({ id: "q1", before: ["5", "2"], after: ["2", "5"], map: [1, 0], from: [] });
    expect(mo[3].touched).toEqual(["q1", "q2", "q3", "q4"]);
  });
  test("from: every cell is new to the thing, the sources are touched", () => {
    const v = mo[4].values.find((x) => x.id === "h1")!;
    expect(v.map).toEqual([null, null, null, null]);
    expect(v.from).toEqual(["q1", "q2"]);
    expect(mo[4].touched).toEqual(["h1", "q1", "q2", "h2", "q3", "q4"]);
  });
});

describe("D, budget: chart numbers", () => {
  const { s, mo } = run(EXAMPLES.D());
  test("values from empty grow; then change in place", () => {
    expect(s[0].things.spent.values).toEqual([]);
    expect(mo[1].values[0].map).toEqual([null, null, null, null, null]);
    expect(mo[2].values[0]).toEqual({ id: "spent", before: ["1300", "0", "0", "0", "0"], after: ["1300", "550", "0", "0", "0"], map: [0, 1, 2, 3, 4], from: [] });
  });
});

describe("E, BST insert: a token moves, then goes", () => {
  const { s, mo } = run(EXAMPLES.E());
  test("k shows at n8, moves to n3, then hides; n6 enters", () => {
    expect(s[0].things.k.visible).toBe(false);
    expect(s[0].things.n6.visible).toBe(false);
    expect(mo[1].enter).toEqual(["k"]);
    expect(mo[1].move).toEqual([]); // entering is not a move
    expect(s[1].things.k.at).toBe("n8");
    expect(mo[2].move).toEqual([{ id: "k", from: "n8", to: "n3" }]);
    expect(mo[2].events).toEqual([{ k: "light", ids: ["n3"], beat: 0 }]);
    expect(mo[3].enter).toEqual(["n6"]);
    expect(mo[3].exit).toEqual(["k"]);
    expect(s[3].things.n6.side).toBe("right");
    expect(s[3].things.n6.tone).toBe("good");
  });
  test("a step that changes nothing touches nothing", () => {
    expect(mo[4].touched).toEqual([]);
    expect(mo[4].beats).toBe(1);
  });
});

describe("F, three regions: setup facts and a fan-out", () => {
  const { s, mo } = run(EXAMPLES.F());
  test("setup chips, then a change", () => {
    expect(s[0].things.db3.is).toBe("change 40");
    expect(s[0].relations["db1->db2"].visible).toBe(true);
    expect(mo[2].events.map((e) => e.k === "send" && e.to)).toEqual(["db2", "db3"]);
    expect(mo[2].events.every((e) => e.k === "send" && e.role === "copy")).toBe(true);
    expect(mo[2].touched).toEqual(["db1", "db2", "db3"]);
    expect(s[4].things.db3.is).toBe("change 40");
    expect(mo[4].restyle).toEqual([{ id: "db3", fields: ["tone"] }]);
  });
  test("a step relation stays", () => {
    expect(s[1].relations["u1->db1"].visible).toBe(true);
    expect(s[4].relations["u1->db1"].visible).toBe(true);
  });
});

describe("G, counted columns: parts of a chart", () => {
  const { mo } = run(EXAMPLES.G());
  test("the first six keep their cells, the rest are new; light of a part touches the chart", () => {
    expect(mo[2].values[0].map).toEqual([0, 1, 2, 3, 4, 5, null, null, null, null, null, null]);
    expect(mo[2].events).toEqual([{ k: "light", ids: ["returns.Jul", "returns.Aug", "returns.Sep", "returns.Oct", "returns.Nov", "returns.Dec"], beat: 0 }]);
    expect(mo[2].touched).toEqual(["returns"]);
  });
});

describe("rules", () => {
  test("the last line about a thing wins; writing it twice changes nothing", () => {
    const m = build(`
plain a: A
@step One: x
tone a bad
tone a good
a is up
@step Two: x
a is up
tone a good
`);
    const { s, mo } = run(m);
    expect(s[1].things.a.tone).toBe("good");
    expect(mo[2].restyle).toEqual([]);
    expect(mo[2].touched).toEqual([]);
  });
  test("clear removes step lines but keeps setup ones; hide takes lines, show brings them back", () => {
    const m = build(`
plain a: A
plain b: B
plain c: C
a -> b
@step One: x
b -> c
@step Two: x
clear
@step Three: x
b -> c
hide c
@step Four: x
show c
`);
    const { s, mo } = run(m);
    expect(s[1].relations["b->c"].visible).toBe(true);
    expect(s[2].relations["b->c"].visible).toBe(false);
    expect(s[2].relations["a->b"].visible).toBe(true);
    expect(mo[2].relExit).toEqual(["b->c"]);
    expect(s[3].relations["b->c"].visible).toBe(false);
    expect(s[4].relations["b->c"].visible).toBe(true);
  });
  test("then counts beats; events carry their beat; pace from the step, else the fence", () => {
    const m = build(`
plain a: A
plain b: B
@step One: x
a -> b: hi
then
say b: got it
then
light a
@step Two: x
pace slow
`, { fence: { pace: "fast" } });
    const { mo } = run(m);
    expect(mo[1].beats).toBe(3);
    expect(mo[1].events.map((e) => ("beat" in e ? e.beat : -1))).toEqual([0, 1, 2]);
    expect(mo[1].pace).toBe("fast");
    expect(mo[2].pace).toBe("slow");
  });
  test("split, merge and drop set the pieces' state", () => {
    const m = build(`
plain p: P
plain q [box]: Q
plain msg [token]: message
plain s1 [token]: seg 1
plain s2 [token]: seg 2
msg at p
@step Split: x
split msg into s1 s2
@step Move: x
s1,s2 at q
@step Merge: x
merge s1,s2 into msg
@step Drop: x
drop msg at p
`);
    const { s, mo } = run(m);
    expect(visible(s[0])).toEqual(["p", "q", "msg"]);
    expect(visible(s[1])).toEqual(["p", "q", "s1", "s2"]);
    expect(s[1].things.s1.at).toBe("p");
    expect(mo[1].enter).toEqual(["s1", "s2"]);
    expect(mo[1].exit).toEqual(["msg"]);
    expect(mo[1].events).toEqual([{ k: "split", ids: ["msg", "s1", "s2"], beat: 0 }]);
    expect(s[3].things.msg.at).toBe("q");
    expect(visible(s[3])).toEqual(["p", "q", "msg"]);
    expect(visible(s[4])).toEqual(["p", "q"]);
    expect(mo[4].events).toEqual([{ k: "drop", ids: ["msg"], to: "p", beat: 0 }]);
    expect(replayProblems(m)).toEqual([]);
  });
  test("in moves into a container; side; a container's children move with it (not listed)", () => {
    const m = build(`
plain w1 [box]: worker 1
  plain x: hold
plain w2 [box]: worker 2
  plain y: hold
plain job: job
@step One: x
job in w1
@step Two: x
job in w2 left
`);
    const { s, mo } = run(m);
    expect(s[0].things.job.in).toBe(null);
    expect(mo[1].move).toEqual([{ id: "job", from: null, to: "w1" }]);
    expect(mo[2].move).toEqual([{ id: "job", from: "w1", to: "w2" }]);
    expect(s[2].things.job.side).toBe("left");
  });
  test("zoom and lift set open and lifted; zoom out puts back what it closes", () => {
    const m = build(`
plain c [box closed]: cluster
  plain n1 [box hidden-inside]: node 1
    plain fe: frontend
  plain n2 [box hidden-inside]: node 2
    plain w2: web 2
@step One: x
zoom into c
@step Two: x
zoom into n1 n2
@step Three: x
lift fe w2
fe -> w2: GET /
@step Four: x
zoom out
@step Five: x
zoom out all
`, { view: "3d-only" });
    const { s, mo } = run(m);
    expect(s[1].zoom).toEqual([["c"]]);
    expect(s[2].zoom).toEqual([["c"], ["n1", "n2"]]);
    expect(s[2].things.n1.open).toBe(true);
    expect(s[3].things.fe.lifted).toBe(true);
    expect(mo[3].restyle).toEqual([{ id: "fe", fields: ["lifted"] }, { id: "w2", fields: ["lifted"] }]);
    expect(s[4].zoom).toEqual([["c"]]);
    expect(s[4].things.fe.lifted).toBe(false);
    expect(s[4].things.n1.open).toBe(false);
    expect(s[5].zoom).toEqual([]);
    expect(replayProblems(m)).toEqual([]);
  });
  test("a second series of a chart is kept in series[1]", () => {
    const m = build(`
out c [chart bar]: two | n
@step One: x
c = 1 2
c.1 = 3 4
@step Two: x
c.1 = 5 6
`);
    const { s, mo } = run(m);
    expect(s[1].things.c.values).toEqual(["1", "2"]);
    expect(s[2].things.c.series).toEqual([null, ["5", "6"]]);
    expect(mo[2].values.length).toBe(1);
    expect(mo[2].touched).toEqual(["c"]);
  });
  test("valueMap matches equal values in order", () => {
    expect(valueMap(["1", "1", "2"], ["1", "2", "1"])).toEqual([0, 2, 1]);
    expect(valueMap(["a"], ["b", "a"])).toEqual([null, 0]);
  });
});
