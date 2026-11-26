import { describe, expect, test } from "bun:test";
import { viewAt, layerAt } from "../../../src/engine/render/three";
import { planAt } from "../../../src/engine/pipeline";
import type { Compiled, Event, Motion } from "../../../src/engine/types";
import { restCheck } from "../../../src/ui/geo3d";
import { model, states } from "./helpers";

const mo = (step: number, touched: string[], events: Event[] = [], beats = 1): Motion => ({ step, enter: [], exit: [], move: [], restyle: [], values: [], relEnter: [], relExit: [], events, touched, beats, pace: "normal" });
// a database in three regions (format 70, shortened): one thing in each region, a line from the first to the others
const db = () => {
  const m = model([["us", "us-east"], ["eu", "eu-west"], ["ap", "ap-south"]], [
    { id: "u1", title: "user", region: "us", shape: "person" }, { id: "db1", title: "primary", region: "us", shape: "cylinder" },
    { id: "db2", title: "Paris", region: "eu", shape: "cylinder" }, { id: "db3", title: "Mumbai", region: "ap", shape: "cylinder" },
  ], [["db1", "db2"], ["db1", "db3"]]);
  const sts = states(m, 4, (s, id) => (id === "db2" && s >= 2 ? { is: "change 41", tone: "good" as const } : {}), (s) => (s === 3 ? "ap" : "all"));
  const events: Event[][] = [[], [{ k: "send", rel: "db1->db2", from: "db1", to: "db2", words: "change 41", style: "token", role: null, beat: 0 }], [{ k: "say", id: "db3", words: "still at 40", beat: 0 }], []];
  const motions = sts.map((s, k) => mo(k, k === 1 ? ["db1", "db2"] : k === 2 ? ["db3"] : [], events[k]));
  const c = { model: m, states: sts, motions, problems: [], llm: () => "" } as unknown as Compiled;
  return { c, plan: planAt(m, sts, motions, 1280) };
};

describe("3D view from a Plan", () => {
  const { c, plan } = db();
  test("a layer per region; a thing stands on its region's layer", () => {
    const v = viewAt(c, plan, 1);
    expect(v.layers.map((l) => l.label)).toEqual(["us-east", "eu-west", "ap-south"]);
    const L = Object.fromEntries(v.items.map((i) => [i.id, i.L]));
    expect(L).toEqual({ u1: 0, db1: 0, db2: 1, db3: 2 });
    expect(v.levels).toBe(3);
  });
  test("every layer shares one floor plan: y is inside the band, not the stacked page", () => {
    const v = viewAt(c, plan, 1);
    for (const i of v.items) { expect(i.y).toBeGreaterThanOrEqual(0); expect(i.y + i.h).toBeLessThanOrEqual(v.foot.h + 0.01); }
    // db2 and db3 are the 1st thing of their bands: the same place on the floor
    const by = Object.fromEntries(v.items.map((i) => [i.id, i]));
    expect(by.db2.x).toBeCloseTo(by.db3.x, 3); expect(by.db2.y).toBeCloseTo(by.db3.y, 3);
  });
  test("things rest on their planes (the old rest check) at every step", () => {
    for (let k = 0; k < 4; k++) { const v = viewAt(c, plan, k); expect(restCheck(v.items.map((i) => ({ key: i.key, kind: i.kind, container: i.container, bare: i.bare, parent: i.parent, L: i.L })), 100)).toEqual([]); }
  });
  test("the camera frames what the step touches (point 2), the whole stage when nothing is touched", () => {
    // 3dframe: the first step (state 1) frames the whole stage, whatever it touches
    expect(viewAt(c, plan, 1).touched).toEqual([]);
    const v1 = viewAt(c, plan, 2), keys = Object.fromEntries(v1.items.map((i) => [i.id, i.key]));
    expect(v1.touched.sort()).toEqual([keys.db3]);
    // the touched things and their neighbours on the drawn lines (db1 also has a line to db3): a close-up keeps its context;
    // in a scene this small the focus rect is the whole stage, so the camera frames all of it
    if (v1.look) expect(v1.look).toContain(keys.db3);
    expect(viewAt(c, plan, 3).look).toBeNull();
  });
  // 3dframe: `camera db2 close` on a step that sends db1 -> db2 frames the packet's two ends, so its line is whole in the shot
  test("an author's camera word on a step with a send frames the send's two ends too", () => {
    const sts = c.states.map((s, k) => (k === 1 ? { ...s, camera: { ids: ["db2"], close: true, far: false, turn: null, tilt: null } } : s));
    const c2 = { ...c, states: sts } as unknown as Compiled;
    const v = viewAt(c2, plan, 1), keys = Object.fromEntries(v.items.map((i) => [i.id, i.key]));
    expect(v.look).toEqual([keys.db2]);
    expect(v.touched.sort()).toEqual([keys.db1, keys.db2].sort());
  });
  test("a focused layer is framed by the stage (no tight look); words on a step line ride the line", () => {
    expect(viewAt(c, plan, 3).look).toBeNull();
    expect(viewAt(c, plan, 1).sends[0].show).toBe("both");
  });
  test("a packet: one send, fixed identity, eased progress that only goes forward; the line stays", () => {
    const ps = [0, 0.25, 0.5, 0.75, 1].map((t) => viewAt(c, plan, 1, { from: 0, t }).sends);
    for (const s of ps) { expect(s).toHaveLength(1); expect(s[0].path.length).toBe(2); expect(s[0].label).toBe("change 41"); }
    const p = ps.map((s) => s[0].p); for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
    expect(p[0]).toBe(0); expect(p[4]).toBe(1);
    const e = viewAt(c, plan, 1).edges.find((x) => x.key === "rel:db1->db2")!; expect(e.label).toBe(""); expect(e.o).toBe(1); // the words ride on the packet, once
  });
  // eng-3d3: a label picks its spot once per step, so the stage must know when a step is playing; layers together show the top layer's words only
  test("the view says when a step is playing (a tween under way), not at rest", () => {
    expect(viewAt(c, plan, 1, { from: 0, t: 0.5 }).playing).toBe(true);
    expect(viewAt(c, plan, 1, { from: 0, t: 0 }).playing).toBe(true);
    expect(viewAt(c, plan, 1, { from: 0, t: 1 }).playing).toBeUndefined();
    expect(viewAt(c, plan, 1).playing).toBeUndefined();
  });
  // eng-3d3: the story's camera reads where the things will rest, not the tween (format 65 step 4: a label rode 110 px up and back with the fit)
  test("while a step plays the camera is held to the step's resting view; at rest there is no hold", () => {
    const rest = viewAt(c, plan, 2), mid = viewAt(c, plan, 2, { from: 1, t: 0.4 }); // a step with no packet on the move
    expect(rest.hold).toBeUndefined();
    expect(mid.hold).toBeDefined();
    const by = (items: { id: string; x: number; y: number; w: number; h: number; L: number }[]) => Object.fromEntries(items.map((i) => [i.id, [i.x, i.y, i.w, i.h, i.L]]));
    expect(by(mid.hold!.frames[0])).toEqual(by(rest.items));
    expect(mid.hold!.touched).toEqual(rest.touched); expect(mid.hold!.spread).toBe(rest.spread);
    expect(viewAt(c, plan, 2, { from: 1, t: 1 }).hold).toBeUndefined();
    expect(viewAt(c, plan, 1, { from: 0, t: 0.4 }).hold).toBeUndefined(); // a packet is on the move: the camera follows it
  });
  test("layers together (no gap, no focus): the stage leaves out a name with no clear spot (stackHide); layers apart or a focus: never", () => {
    const v = viewAt(c, plan, 0);
    expect(v.spread).toBe(0); expect(v.stackHide).toBe(true); expect(v.part).toBeNull(); // (names are never hidden by the placer: SPEC 6.14)
    expect(viewAt(c, plan, 1).stackHide).toBe(true);
    expect(viewAt(c, plan, 3).stackHide).toBeUndefined(); // a focused layer
    expect(viewAt(c, plan, 1, { quiet: true }).stackHide).toBe(true); // also while it plays
    const apart = { ...c, states: c.states.map((s) => ({ ...s, layersApart: true })) } as typeof c;
    expect(viewAt(apart, planAt(apart.model, apart.states, apart.motions, 1280), 0).stackHide).toBeUndefined();
  });
  test("a tween never moves a thing that does not move", () => {
    const a = viewAt(c, plan, 1, { from: 0, t: 0.4 }).items, b = viewAt(c, plan, 1).items;
    for (const i of a) { const j = b.find((x) => x.id === i.id)!; expect([i.x, i.y, i.w, i.h, i.L]).toEqual([j.x, j.y, j.w, j.h, j.L]); }
  });
  test("labels: only who takes part while a step plays; every label at rest", () => {
    const q = viewAt(c, plan, 1, { quiet: true }), r = viewAt(c, plan, 1, { quiet: false });
    expect(q.part?.length).toBe(2); expect(r.part).toBeNull() /* eng-3d3: layers together: stackHide, not part */; expect(viewAt(c, plan, 3, { quiet: true }).part).toBeNull();
  });
  test("the state chip is part of the label; a focused region is the focus; speech has its own key", () => {
    const v2 = viewAt(c, plan, 2), db2 = v2.items.find((i) => i.id === "db2")!; expect(db2.label).toBe("Paris · change 41"); expect(db2.tone).toBe("good");
    expect(viewAt(c, plan, 3).focus).toBe(2); expect(viewAt(c, plan, 1).focus).toBeNull();
    expect(v2.says).toEqual([{ key: v2.items.find((i) => i.id === "db3")!.key, text: "still at 40", o: 1 }]);
  });
  test("a thing moved into a container on another layer is carried there; with no regions, depth is the layer", () => {
    const m = model([["a", "A"], ["b", "B"]], [{ id: "c", region: "b" }, { id: "x", region: "a" }]);
    const sts = states(m, 2, (s, id) => (id === "x" && s === 1 ? { in: "c" } : {}));
    expect([layerAt(m, sts[0], "x"), layerAt(m, sts[1], "x")]).toEqual([0, 1]);
    const f = model([], [{ id: "p" }, { id: "q", parent: "p" }, { id: "r", parent: "q" }]);
    expect(f.order.map((id) => layerAt(f, states(f)[0], id))).toEqual([0, 1, 2]);
  });
});
