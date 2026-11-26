import { describe, expect, test } from "bun:test";
import { states } from "../../../src/engine/core/states";
import { check } from "../../../src/engine/core/check";
import { llm } from "../../../src/engine/core/llm";
import { EXAMPLES } from "./examples";
import { build } from "./build";
import type { Model } from "../../../src/engine/types";

const problems = (m: Model) => check(m, states(m));
const msgs = (m: Model) => problems(m).map((p) => `${p.line}: ${p.msg}`);

describe("check", () => {
  test("the 7 DESIGN examples pass", () => {
    for (const [name, mk] of Object.entries(EXAMPLES)) expect([name, problems(mk())]).toEqual([name, []]);
  });
  test("an unknown id names the nearest one", () => {
    const m = build(`
plain router: R
plain shard1: S
@step One: x
light shard2
tone rooter good
`);
    expect(msgs(m)).toEqual([
      `4: no thing "shard2" on the stage (did you mean shard1?)`,
      `5: no thing "rooter" on the stage (did you mean router?)`,
    ]);
  });
  test("two hops in one step; a fan-out is fine", () => {
    const m = build(`
plain a: A
plain b: B
plain c: C
@step One: x
a -> b: hi
b -> c: hi again
@step Two: x
a -> b: one
a -> c: two
`);
    expect(msgs(m)).toEqual([`6: one hop per step: a -> b then b -> c in one step is two hops; move "hi again" to a step of its own, with its own caption`]);
  });
  test("a token moved twice in one step", () => {
    const m = build(`
plain a: A
plain b: B
plain k [token]: k
@step One: x
k at a
k at b
`);
    expect(msgs(m)).toEqual([`6: one hop per step: k already moved in this step (line 5); give its next hop a step of its own, with its own caption`]);
  });
  test("values on a thing that holds none", () => {
    const m = build(`
plain a: A
@step One: x
a = 1 2 3
`);
    expect(msgs(m)).toEqual([`3: a = 1 2 3: a holds no values; values go on a data structure ([array], [list], [stack], [queue], [map]) or a chart ([chart bar])`]);
  });
  test("zoom and lift rules (SPEC 6.11)", () => {
    const m = build(`
plain c [box closed]: cluster
  plain n1 [box hidden-inside]: node 1
    plain fe: frontend
  plain n2 [box]: node 2
    plain w2: web 2
plain k [token]: k
plain lone: alone
@step One: x
zoom out
zoom into c n1
lift fe
@step Two: x
zoom into c
zoom into c
lift k
lift lone
put back
`, { view: "3d-only" });
    expect(msgs(m)).toEqual([
      "9: zoom out: nothing is zoomed into; write zoom into <id> in an earlier step",
      "10: zoom into c n1: n1 is inside c; zoom into c first, then into n1 in a later step (zooms nest)",
      "11: lift fe: it is inside n1, which is closed; zoom into n1 in this step or an earlier one",
      "14: zoom into c: the story is already zoomed into it",
      "15: lift raises a thing out of its box; k is a token, which rides on what it sits at or in: lift that instead",
      "16: lift raises a thing out of the box it is in; lone stands on the stage, in no box (put it in a container, or lift what it holds)",
      "17: put back: nothing is lifted; write lift <id> in an earlier step",
    ]);
  });
  test("lift outside a 3D-only scene", () => {
    const m = build(`
plain g [box]: G
  plain a: A
@step One: x
lift a
`);
    expect(msgs(m)[0]).toStartWith("4: lift is a 3D-only word");
  });
  test("pointing into a closed inside", () => {
    const m = build(`
plain r [box closed]: router
  plain q: queue
@step One: x
light q
`);
    expect(msgs(m)).toEqual(["4: light q, which is inside r; r is closed (its inside is drawn faint, without words): zoom into r in this step or an earlier one"]);
  });
  test("then rules", () => {
    const m = build(`
plain a: A
@step One: x
then
light a
@step Two: x
light a
then
then
light a
`);
    expect(msgs(m)).toEqual([
      "3: then comes between two changes: a change must come before it in the step",
      "8: then twice in a row: a change must come between them",
    ]);
  });
  test("a step cap as the old engine's: 201 steps are refused", () => {
    const m = build(`plain a: A\n${Array.from({ length: 201 }, (_, i) => `@step S${i}: x\nlight a`).join("\n")}`);
    expect(msgs(m)).toEqual([`402: 201 steps; the limit is 200`]);
  });
  test("a step that lights a hidden thing warns", () => {
    const m = build(`
plain a: A
plain b: B
@step One: x
hide b
light b
@step Two: x
show b
`);
    expect(problems(m)).toEqual([{ line: 5, warn: true, msg: "light: b is hidden in this step, so the reader cannot see it; show b in this step or an earlier one" }]);
  });
  test("a line between a container and what it holds", () => {
    const m = build(`
plain g [box]: G
  plain a: A
g -> a
@step One: x
light a
`);
    expect(msgs(m)).toEqual(["3: g -> a: a is inside g; a line joins two things side by side, not a container and what it holds"]);
  });
});

describe("llm", () => {
  test("B, TCP", () => {
    const m = EXAMPLES.B();
    expect(llm(m, states(m))).toBe(`Animation, 4 steps. Starts with: box c "client"; box r "router"; box s "server".

1. SYN: the client sends SYN.
   c -> r: SYN seq 100
   c is SYN-SENT.
   s is LISTEN.
2. Lost: the router's queue is full.
   r -> s: SYN seq 100 (lost on the way)
   r says: queue full, SYN dropped
3. SYN-ACK: the retry gets through.
   s is SYN-RECEIVED.
4. ACK: both ends are connected.
   c, s are ESTABLISHED.
   c, s turn good.`);
  });
  test("C, merge sort: nested values, things shown later, from", () => {
    const m = EXAMPLES.C();
    const v = llm(m, states(m));
    expect(v.split("\n")[0]).toBe(`Animation, 5 steps. Starts with: array s: 5 2 8 1 9 3 7 4.`);
    expect(v).toContain(`1. Split: the list splits in two.\n   Now shown: array h1: 5 2 8 1; array h2: 9 3 7 4.`);
    expect(v).toContain(`   q1 = 2 5\n`);
    expect(v).toContain(`   h1 = 1 2 5 8 (from q1, q2)`);
    expect(v).toContain(`   s turns good.`);
  });
  test("F, three regions: families, layers, setup chips, a fan-out", () => {
    const m = EXAMPLES.F();
    const v = llm(m, states(m)).split("\n");
    expect(v[0]).toBe(`Animation, 4 steps, in 3D. Starts with: person u1 "user in Virginia"; cylinder db1 "primary; takes every write", is change 40; cylinder db2 "copy in Paris", is change 40; cylinder db3 "copy in Mumbai", is change 40. Connected: db1 --> db2 (copy): copies, db1 --> db3 (copy): copies.`);
    expect(v[1]).toBe(`Families, one colour each: user (u1); db (db1, db2, db3); copy (db1 --> db2, db1 --> db3).`); // llm3: a family only lines use names them
    expect(v[2]).toBe(`Layers, top to bottom: us-east (u1, db1); eu-west (db2); ap-south (db3).`);
    expect(v).toContain(`   db1 -> db2: change 41 (dashed)`); // llm3: a send on a dashed line says so
    expect(v).toContain(`   db1 -> db3: change 41 (dashed)`);
    expect(v).toContain(`   db3 turns warn (a warning).`); // llm3
  });
  test("E, a token at a thing; a step that does nothing", () => {
    const m = EXAMPLES.E();
    const v = llm(m, states(m));
    expect(v).toContain(`2. Right: 6 is more than 3, so go right.\n   k moves to n3.\n   Lit: n3`);
    expect(v).toContain(`3. Insert: 3 has no right child: 6 goes there.\n   Now shown: circle n6 "6" (right), good.\n   Gone: k.`);
    expect(v.endsWith(`4. The order holds: every left child is smaller.`)).toBe(true);
  });
  test("zoom, lift, put back in words (SPEC 6.11)", () => {
    const m = build(`
plain c [box]: cluster
  plain n1 [box hidden-inside]: node 1
    plain fe: frontend
  plain n2 [box hidden-inside]: node 2
    plain w2: web 2
@step One: x
zoom into n1 n2
@step Two: x
lift fe w2
fe -> w2: GET /
@step Three: x
zoom out
`, { view: "3d-only" });
    const v = llm(m, states(m));
    expect(v.split("\n")[0]).toBe(`Animation, 3 steps, 3D only. Starts with: box c "cluster" [box n1 "node 1" closed, inside hidden [box fe "frontend"], box n2 "node 2" closed, inside hidden [box w2 "web 2"]].`);
    expect(v).toContain(`1. One: x\n   zoom into n1, n2: their insides appear, the rest fades`);
    expect(v).toContain(`2. Two: x\n   fe -> w2: GET /\n   lift fe, w2 out of n1, n2`);
    expect(v).toContain(`3. Three: x\n   zoom out of n1, n2\n   fe, w2 settle back into place`);
  });
  test("split, merge, drop in words (SPEC 6.8)", () => {
    const m = build(`
plain p: P
plain q: Q
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
    const v = llm(m, states(m));
    expect(v).toContain(`   msg splits into: seg 1, seg 2`);
    expect(v).toContain(`   seg 1, seg 2 merge into msg: message`);
    expect(v).toContain(`   q -> p: message, dropped there (lost)`);
  });
});
