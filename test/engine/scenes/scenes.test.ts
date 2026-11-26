// Lane eng-scenes: a scene inside a scene (SPEC 6.12) through the real path: a format 10 block -> parse (lower-graph)
// -> core states, diff, check, the LLM view -> the plans.
import { describe, expect, test } from "bun:test";
import { compile, planAt } from "../../../src/engine/pipeline";
import { sceneModel, scenePath } from "../../../src/engine/core/scenes";
import { diff, still } from "../../../src/engine/core/diff";
import { fencesOf, ROOT } from "../parse/fixtures";
import type { Compiled, Model, Prim, StepState } from "../../../src/engine/types";

const make = (body: string): Compiled => compile({ body, line0: 1, fence: {}, roles: {}, format12: false });
const refusals = (c: Compiled) => c.problems.filter((p) => !p.warn);
const visible = (s: StepState | undefined) => Object.entries(s?.things ?? {}).filter(([, t]) => t.visible).map(([id]) => id).sort();
/** a scene's own plan at one width, built from its states as the pipeline builds it */
const scenePlan = (c: Compiled, id: string, w: number) => {
  const sm = sceneModel(c.model, id);
  const inner = c.states.map((s) => s.inner![id]);
  return planAt(sm, inner, inner.map((s, k) => (k ? diff(sm, inner[k - 1], s) : still(0))), w);
};
const drawnIds = (prims: Prim[]) => [...new Set(prims.map((p) => ("id" in p ? p.id : undefined)).filter(Boolean))].sort();

// the SPEC 6.12 example
const UP = `box a "browser"
box t "TCP"
a -> t
scene up "TCP, up close" layout=row
  group snd "sender"
  token m "message" in snd
  group rcv "receiver"
  snd -> rcv
end
@step The browser hands its message to TCP.
highlight t
@step Up close: what TCP does with it.
enter up from t
@step TCP cuts it in two.
split m into 2 "seg"
@step Both pieces cross to the receiver.
move m.1 m.2 into rcv
@step Back at the overview, where we left it.
leave`;

describe("the SPEC 6.12 example", () => {
  const c = make(UP);
  test("reads with no problem; what a step inside the scene makes is the scene's thing", () => {
    expect(c.problems).toEqual([]);
    expect(c.model.order).toEqual(["a", "t"]);
    expect(c.model.scenes.up.order).toEqual(expect.arrayContaining(["snd", "m", "rcv", "m.1", "m.2"]));
  });
  test("each step's scene: an enter step shows the scene, a leave step the overview", () => {
    expect(c.states.map((s) => s.scene)).toEqual([null, null, "up", "up", "up", null]);
  });
  test("a step inside the scene changes the scene, never the overview (frozen while elsewhere)", () => {
    for (const k of [2, 3, 4, 5]) expect(c.states[k].things).toEqual(c.states[1].things);
    expect(c.states[1].inner!.up.things).toEqual(c.states[0].inner!.up.things); // the scene waits at its setup
    expect(visible(c.states[2].inner!.up)).toEqual(["m", "rcv", "snd"]);
    expect(c.states[3].inner!.up.things.m.visible).toBe(false);
    expect(c.states[4].inner!.up.things["m.1"].in).toBe("rcv");
    expect(c.states[5].inner!.up.things).toEqual(c.states[4].inner!.up.things); // as it was left
  });
  test("motions: inside the scene they are the scene's; enter and leave change no thing", () => {
    expect(c.motions[2]).toMatchObject({ scene: "up", enter: [], exit: [], move: [], events: [], touched: [] });
    expect(c.motions[3]).toMatchObject({ scene: "up", enter: ["m.1", "m.2"], exit: ["m"] });
    expect(c.motions[4].move.map((m) => m.id)).toEqual(["m.1", "m.2"]);
    expect(c.motions[5]).toMatchObject({ scene: "up", enter: [], exit: [], move: [], touched: ["t"] }); // where we left it
    expect(c.motions[1].scene).toBeUndefined();
  });
  test("the LLM view indents the scene's steps under the step that enters it", () => {
    const v = c.llm().split("\n");
    expect(v[0]).toBe(`Animation, 5 steps, with 1 scene inside it (up "TCP, up close"): steps in a scene are indented under the step that enters it. Starts with: box a "browser"; box t "TCP". Connected: a -> t.`);
    expect(v).toContain("2. Up close: what TCP does with it.");
    expect(v).toContain(`   enters scene up "TCP, up close" from t. Starts with: group snd "sender" [token m "message"]; group rcv "receiver". Connected: snd -> rcv.`); // llm3: a group says it is one
    expect(v).toContain("   3. TCP cuts it in two.");
    expect(v).toContain("      m splits into: seg 1, seg 2");
    expect(v).toContain("   4. Both pieces cross to the receiver.");
    expect(v).toContain("5. Back at the overview, where we left it.");
    expect(v[v.length - 1]).toBe("   leaves scene up: back to the overview, as it was, at t");
  });
  for (const w of [1280, 390]) test(`plans at ${w}: inside the scene the frame is the scene's; leaving restores the overview exactly`, () => {
    const p = c.plan(w), sp = p.scene!("up");
    expect(drawnIds(p.frame(1))).toEqual(["a", "a->t", "t"]);
    for (const k of [2, 3, 4]) expect(p.frame(k)).toEqual(sp.frame(k));
    expect(drawnIds(p.frame(2))).toEqual(["m", "rcv", "snd", "snd->rcv"]);
    expect(drawnIds(p.frame(4))).toEqual(["m.1", "m.2", "rcv", "snd", "snd->rcv"]);
    expect(p.frame(5)).toEqual(p.frame(1));
    expect(p.rects(5)).toEqual(p.rects(1));
    // the stage keeps the overview's size; the scene has its own, the same over the whole story
    expect(p.scene!("up")).toBe(sp);
    expect([p.w, p.h]).not.toEqual([0, 0]);
  });
});

describe("format/69: the seven layers and a scene inside the scene", () => {
  const [f] = fencesOf(`${ROOT}/fixtures/format/69-3d-the-seven-network-layers-and-a-scene-inside-the-scene.dh.md`);
  const c = compile(f.src);
  test("compiles with 0 problems; steps 5 to 11 are in tcp", () => {
    expect(c.problems).toEqual([]);
    expect(c.states.map((s) => s.scene ?? "")).toEqual(["", "", "", "", "", "tcp", "tcp", "tcp", "tcp", "tcp", "tcp", "tcp", "", "", "", "", "", "", ""]);
    expect(c.model.order).not.toContain("s1"); // the split pieces made inside the scene are the scene's
    expect(c.model.scenes.tcp.relations["rcv->net"]).toBeDefined();
  });
  test("leaving restores the overview exactly", () => {
    expect(c.states[12].things).toEqual(c.states[4].things);
    expect(c.states[12].relations).toEqual(c.states[4].relations);
    expect(c.motions[12].touched).toEqual(["a4", "msg.1", "msg.2", "msg.3"]);
  });
  for (const w of [1280, 390]) test(`every inner step draws the scene's things at ${w}`, () => {
    const p = scenePlan(c, "tcp", w);
    const base = ["buf", "h1", "h2", "h3", "hdr", "net", "out", "rcv", "snd"];
    for (let k = 5; k <= 11; k++) expect(drawnIds(p.frame(k))).toEqual(expect.arrayContaining(base));
    expect(drawnIds(p.frame(7))).toEqual(expect.arrayContaining(["s1", "s2", "s3"]));
    expect(drawnIds(p.frame(11))).toEqual(expect.arrayContaining(["m2", "rcv->net"]));
  });
  test("the LLM view: 6 to 11 indented under 5, 12 back at the outer level", () => {
    const v = c.llm().split("\n");
    expect(v.some((l) => l.startsWith(`   enters scene tcp "Transport, up close" from a4. Starts with: `))).toBe(true);
    for (let k = 6; k <= 11; k++) expect(v.some((l) => l.startsWith(`   ${k}. `))).toBe(true);
    expect(v.some((l) => l.startsWith("12. Back at the overview"))).toBe(true);
    expect(v).toContain("   leaves scene tcp: back to the overview, as it was, at a4");
  });
});

// depth 2: the overview, a scene in it, a scene in that
const DEEP = `box x "outside"
box y "far"
x -> y
scene a "first"
  box p "p"
  box q "q"
  p -> q
end
scene b "second"
  box r "r"
  token k "k" at r
end
@step Start.
highlight x
@step Into a.
enter a from x
@step a one.
highlight p
@step a two.
set q tone=good
@step Into b.
enter b from q
@step b one.
highlight r
@step b two.
set r tone=bad
@step Back to a.
leave
@step a three.
set p tone=warn
@step Out.
leave b
@step Out, the right way.
leave`;

describe("depth 2", () => {
  const c = make(DEEP);
  const sp = scenePath(c.model);
  test("the path, and leave b while in a is refused with its line", () => {
    expect(sp.path.map((p) => p.join(">"))).toEqual(["", "", "a", "a", "a", "a>b", "a>b", "a>b", "a", "a", "a", ""]);
    expect(refusals(c)).toEqual([{ line: 32, msg: "leave b: the story is in a, not b; write leave, or leave a" }]);
  });
  test("each scene keeps its own state; a deeper visit leaves the outer scene as it was", () => {
    const s = c.states;
    expect(s[5].inner!.a.things).toEqual(s[4].inner!.a.things);
    expect(s[8].inner!.a.things).toEqual(s[4].inner!.a.things);
    expect(s[8].inner!.a.things.q.tone).toBe("good");
    expect(s[7].inner!.b.things.r.tone).toBe("bad");
    expect(s[10].inner!.b.things).toEqual(s[7].inner!.b.things); // frozen after it was left
    expect(s[9].inner!.a.things.p.tone).toBe("warn");
    expect(s[11].things).toEqual(s[1].things); // the overview, exactly
  });
  test("leaving b touches q, the thing it was entered from, in a", () => {
    expect(c.motions[8]).toMatchObject({ scene: "b", touched: ["q"] });
    expect(c.motions[5]).toMatchObject({ scene: "b", touched: [] });
    expect(c.motions[6]).toMatchObject({ scene: "b" });
    expect(c.motions[9]).toMatchObject({ scene: "a" });
  });
  test("the LLM view indents b's steps twice", () => {
    const v = c.llm().split("\n");
    expect(v).toContain("   5. Into b.");
    expect(v).toContain(`      enters scene b "second" from q. Starts with: box r; token k at r.`);
    expect(v).toContain("      6. b one.");
    expect(v).toContain("         Lit: r");
    expect(v).toContain("   8. Back to a.");
    expect(v).toContain("      leaves scene b: back to scene a, as it was, at q");
    expect(v).toContain("11. Out, the right way.");
    expect(v).toContain("   leaves scene a: back to the overview, as it was, at x");
  });
  for (const w of [1280, 390]) test(`plans at ${w}: each step draws its own scene`, () => {
    const p = c.plan(w);
    expect(drawnIds(p.frame(3))).toEqual(["p", "p->q", "q"]);
    expect(drawnIds(p.frame(6))).toEqual(["k", "r"]);
    expect(p.frame(8)).toEqual(p.scene!("a").frame(8));
    expect(p.frame(11)).toEqual(p.frame(1));
  });
});

describe("what doccheck refuses (SPEC 6.12), each with its line", () => {
  const msgs = (body: string) => refusals(make(body)).map((p) => `${p.line}: ${p.msg}`);
  const head = `box a "a"\nbox b "b"\nscene s "s"\n  box u "u"\n  box v "v"\nend`; // lines 1..6
  const visit = `@step in\nenter s from a\n@step one\nhighlight u\n@step two\nhighlight v\n@step out\nleave`; // lines 7..14
  test("a good visit reads clean", () => expect(msgs(`${head}\n${visit}`)).toEqual([]));
  test("entering a scene that is not declared lists the scenes", () => {
    expect(msgs(`${head}\n${visit}\n@step again\nenter z from a`)).toContain("16: enter z: no scene z (scenes: s)");
  });
  test("entering from a thing that is not on the stage of the scene the story is in", () => {
    expect(msgs(`${head}\n@step in\nenter s from u\n@step one\nhighlight u\n@step two\nhighlight v\n@step out\nleave`)).toContain("8: enter s from u: no u on the stage of the overview at this step; name a thing that is there");
  });
  test("a visit with fewer than 2 steps of its own", () => {
    expect(msgs(`${head}\n@step in\nenter s from a\n@step one\nhighlight u\n@step out\nleave`)).toContain("12: scene s has 1 step of its own on this visit (after the one that enters, line 8); give it at least 2, or show it as a step of the overview");
  });
  test("leave in the overview", () => {
    expect(msgs(`${head}\n${visit}\n@step again\nleave`)).toContain("16: leave: the story is in the overview, not in a scene; there is nothing to leave");
  });
  test("a story that ends inside a scene", () => {
    expect(msgs(`${head}\n@step in\nenter s from a\n@step one\nhighlight u\n@step two\nhighlight v`)).toContain("8: the story ends inside scene s: add a step that leaves it (leave), so the reader comes back to the overview");
  });
  test("a scene declared but never entered", () => {
    expect(msgs(`${head}\n@step only\nhighlight a\n@step more\nhighlight b`)).toContain("4: scene s is declared but never entered: add a step with enter s from <thing>");
  });
  test("any other change in a step that enters or leaves", () => {
    expect(msgs(`${head}\n@step in\nenter s from a\nhighlight b\n@step one\nhighlight u\n@step two\nhighlight v\n@step out\nleave`)).toContain("9: a step that enters a scene does only that (the camera flies in); put this change in the next step, with its own caption");
  });
  test("going deeper than 2, and entering a scene the story is already in", () => {
    const three = `box a "a"\nscene s "s"\n  box u "u"\nend\nscene t "t"\n  box w "w"\nend\nscene z "z"\n  box y "y"\nend\n@step 1\nenter s from a\n@step 2\nhighlight u\n@step 3\nenter t from u\n@step 4\nhighlight w\n@step 5\nenter z from w\n@step 6\nenter s from w`;
    const m = msgs(three);
    expect(m).toContain("20: enter z: scenes go 2 deep at most (the overview, a scene in it, a scene in that); leave one first, or show this in the scene you are in");
    expect(m).toContain("22: enter s: the story is already in s; leave it first");
  });
  test("a step inside a scene names the scene's things: an overview thing there is unknown", () => {
    expect(msgs(`${head}\n@step in\nenter s from a\n@step one\nhighlight b\n@step two\nhighlight v\n@step out\nleave`)).toContain(`10: no thing "b" on the stage (did you mean u, v?)`);
  });
});

test("a model with no scene is unchanged: no inner state, no Motion.scene", () => {
  const c = make(`box a "a"\nbox b "b"\n@step one\nhighlight a\n@step two\nhighlight b`);
  expect(c.states.every((s) => s.scene === null && s.inner === undefined)).toBe(true);
  expect(c.motions.every((m) => m.scene === undefined)).toBe(true);
  expect((c.model as Model).scenes).toEqual({});
});

test("modelAt: the scene's model inside a scene (its lines, as a renderer needs for a send's words), else the story's", async () => {
  const { modelAt } = await import("../../../src/engine/core/scenes");
  const [f] = fencesOf(`${ROOT}/fixtures/format/69-3d-the-seven-network-layers-and-a-scene-inside-the-scene.dh.md`);
  const c = compile(f.src);
  expect(modelAt(c.model, c.states[4])).toBe(c.model);
  const m = modelAt(c.model, c.states[11]);
  expect(m).toBe(sceneModel(c.model, "tcp"));
  const send = c.motions[11].events.find((e) => e.k === "send");
  expect(send && send.k === "send" && m.relations[send.rel]?.id).toBe("rcv->net");
});
