// Lane sheet: the format 12 form (a container thing of the layout holding things) draws what the format 11 words draw.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { beginDocument, endDocument } from "../../../src/core/stage-budget";
import { measure, wrap } from "../../../src/core/stage-core";
import { LAYOUT } from "../../../src/engine/layouts";
import { buildHeads } from "../../../src/engine/layouts/sheet/blocks";
import type { LayoutCtx, Model, Prim, Thing } from "../../../src/engine/types";
import { modelOf, scenes, statesOf } from "./helpers";

beforeEach(() => beginDocument());
afterEach(() => { endDocument(); });
const ctxAt = (width: number): LayoutCtx => ({ width, phone: width < 480, look: "stage", measure, wrap, child: () => { throw new Error("no child"); }, problem: (p) => { throw new Error(p.msg); } });
let order = 0;
const thing = (id: string, over: Partial<Thing>): Thing => ({ id, role: null, title: id, lines: [], flags: [], shape: "box", layout: null, container: false, parent: null, region: null, order: order++, values: null, keys: {}, chart: null, src: { line: 10 + order }, ...over });
const strip = (ps: Prim[]) => ps.map((p) => JSON.stringify(p, (k, v) => (k === "key" || k === "id" ? undefined : v)));

/** the format 11 model with its head words replaced by a container thing holding the same wrappers */
function asThings(m11: Model): { model: Model; container: string } {
  const model: Model = { ...m11, origin: "format12", layoutWords: {}, things: {}, order: [] };
  const add = (t: Thing) => { model.things[t.id] = t; model.order.push(t.id); };
  add(thing("parcel", { title: "The parcel", lines: ["outside in"], container: true, layout: "wrap", flags: ["wrap"] }));
  add(thing("crate", { role: "store", title: "shipping crate", lines: ["40 kg", "to the depot; from the warehouse; > seal 7731"], parent: "parcel" }));
  add(thing("box", { role: "job", title: "box", lines: ["2 kg", "to the house; status: packed"], parent: "parcel" }));
  add(thing("gift", { role: "client", title: "gift", lines: ["a mug", "wrapped in paper"], parent: "parcel" }));
  return { model, container: "parcel" };
}

test("wrap from things: a container holding three wrappers draws the words the nest: line drew, at the same places", () => {
  const f = scenes("20-animation-boxes-inside-boxes.dh.md")[0], m11 = modelOf(f);
  const { model, container } = asThings(m11);
  expect(buildHeads(model, ["wrap"], container).problems).toEqual([]);
  const states = statesOf(model);
  const child = LAYOUT.wrap.place({ model, states, container, members: ["crate", "box", "gift"], regions: [] }, ctxAt(1000));
  const root = LAYOUT.wrap.place({ model: m11, states: statesOf(m11), container: null, members: [], regions: [] }, ctxAt(1000));
  expect(child.w).toBe(1000 - 28);
  for (let k = 1; k <= model.steps.length; k++) {
    const a = child.decor(k).filter((p) => p.k === "text") as Extract<Prim, { k: "text" }>[], b = root.decor(k).filter((p) => p.k === "text") as Extract<Prim, { k: "text" }>[];
    expect(a.length).toBeGreaterThan(0);
    expect(strip(a.map((p) => ({ ...p, x: p.x + 14, y: p.y + 8 })))).toEqual(strip(b));
  }
  // the wrappers have rects, so a line to one finds it
  expect(Object.keys(child.at(1)).sort()).toEqual(["box", "crate", "gift"]);
});

test("a track from things: phases of one role make one group, carry and where come from the keys", () => {
  const f = scenes("24-animation-a-package-journey.dh.md")[0], m11 = modelOf(f);
  const model: Model = { ...m11, origin: "format12", layoutWords: {}, things: {}, order: [] };
  const add = (t: Thing) => { model.things[t.id] = t; model.order.push(t.id); };
  add(thing("trip", { container: true, layout: "track", keys: { carry: "one package" }, flags: ["track"] }));
  for (const [role, name] of [["job", "fetch"], ["job", "resolve"], ["cache", "lookup"], ["job", "build"], ["job", "test"], ["store", "publish"]]) add(thing(name, { role, title: name, parent: "trip" }));
  const c = LAYOUT.track.place({ model, states: statesOf(model), container: "trip", members: [], regions: [] }, ctxAt(1000));
  const root = LAYOUT.track.place({ model: m11, states: statesOf(m11), container: null, members: [], regions: [] }, ctxAt(1000));
  for (let k = 1; k <= model.steps.length; k++) {
    const a = c.decor(k).filter((p) => p.k === "text") as Extract<Prim, { k: "text" }>[], b = root.decor(k).filter((p) => p.k === "text") as Extract<Prim, { k: "text" }>[];
    expect(strip(a.map((p) => ({ ...p, x: p.x + 14, y: p.y + 8 })))).toEqual(strip(b));
  }
});

test("a sheet from things: groups hold rows with values, a flagged child is the outcome column", () => {
  const f = scenes("03-animation-a-worksheet.dh.md")[0], m11 = modelOf(f);
  const model: Model = { ...m11, origin: "format12", layoutWords: {}, things: {}, order: [] };
  const add = (t: Thing) => { model.things[t.id] = t; model.order.push(t.id); };
  add(thing("shops", { title: "two shops, each with its own tills", lines: ["3 tills"], container: true, layout: "sheet", flags: ["sheet"] }));
  add(thing("s0", { role: "server", title: "shop north", lines: ["2 tills"], container: true, parent: "shops" }));
  add(thing("t1", { title: "till 1", parent: "s0", values: "40 55 70 85 20 35 50".split(" ") }));
  add(thing("t2", { title: "till 2", parent: "s0", values: "10 20 30 40 50 60 70".split(" ") }));
  add(thing("s1", { role: "server", title: "shop south", lines: ["1 till"], container: true, parent: "shops" }));
  add(thing("t3", { title: "till 3", parent: "s1", values: "100 130 160 190 220 250 280".split(" ") }));
  add(thing("out", { role: "store", title: "head office", lines: ["adds the shops"], flags: ["outcome"], parent: "shops" }));
  expect(buildHeads(model, ["sheet"], "shops").problems).toEqual([]);
  const c = LAYOUT.sheet.place({ model, states: statesOf(model), container: "shops", members: [], regions: [] }, ctxAt(1000));
  const root = LAYOUT.sheet.place({ model: m11, states: statesOf(m11), container: null, members: [], regions: [] }, ctxAt(1000));
  for (let k = 1; k <= model.steps.length; k++) {
    const a = c.decor(k).filter((p) => p.k === "text") as Extract<Prim, { k: "text" }>[], b = root.decor(k).filter((p) => p.k === "text") as Extract<Prim, { k: "text" }>[];
    expect(strip(a.map((p) => ({ ...p, x: p.x + 14, y: p.y + 8 })))).toEqual(strip(b));
  }
});
