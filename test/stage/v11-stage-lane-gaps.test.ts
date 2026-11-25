// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Regression source: public fixtures/stage/19-animation-a-key.dh.md (bike shop).
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
const head = "title: A bike shop | parts in, bikes out\nkey at: top right\n## Store room\nstore p: parts shelf | wheels, chains\n## Bench\njob f: fitter | one bench\n## Door\nclient c: rider";
const steps = [
  {
    "title": "Parts: The fitter takes parts from the shelf.",
    "raw": "p -> f: two wheels\nkey store: kept in stock\nkey job: work done here",
    "line": 27
  },
  {
    "title": "Ride: The bike goes out of the door.",
    "raw": "f -> c: one bike\nkey client: who it is for",
    "line": 31
  }
];
const roles = {"client":1,"server":2,"store":3,"job":4,"cache":5,"ops":6,"plain":0};
const cards = (p: ReturnType<typeof layoutStage>) => p.items.filter((i): i is Extract<Item,{k:"box"}> => i.k === "box" && !!i.id && i.bar?.kind === "card");

for (const width of [560,600,620,654,683,700,734,760,800,1280]) test(`three public bike-shop lanes keep their cards inside ${width}px`, () => {
  const c = compileStage(head, steps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, width), boxes = cards(p);
  expect(new Set(boxes.map(b => b.id)).size).toBe(3);
  for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x+b.w).toBeLessThanOrEqual(width); }
  if (width <= 620) expect(p.narrow).toBe(true);
  if (width >= 654) expect(p.narrow).toBe(false);
});

test("a longer public caption introduced in a later step participates in the switch", () => {
  const caption = steps[0].title.split(": ").slice(1).join(": ");
  const c = compileStage(head, [steps[0], {...steps[1], raw: steps[1].raw.replace("one bike", caption)}], 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 700);
  expect(p.narrow).toBe(true);
  for (const b of cards(p)) expect(b.x+b.w).toBeLessThanOrEqual(700);
});

const plain = "## Store room\nstore p: parts shelf\n## Bench\njob f: fitter\n## Door\nclient c: rider";
const plainSteps = [{title:"Parts",raw:"p -> f\nf -> c",line:10},{title:"Ride",raw:"",line:12}];
test("an unlabelled gap still reserves the actual 64px minimum", () => {
  const c = compileStage(plain, plainSteps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 531);
  expect(p.narrow).toBe(true);
  for (const b of cards(p)) expect(b.x+b.w).toBeLessThanOrEqual(531);
});
test("a reduced right margin that still fits keeps its wide layout", () => {
  const c = compileStage(plain, plainSteps, 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 538);
  expect(p.narrow).toBe(false);
  for (const b of cards(p)) expect(b.x+b.w).toBeLessThanOrEqual(538);
});
test("later panel lanes reuse the earlier lanes' width", () => {
  // The config card and Settings panel use the public composed-stage samples.
  const c = compileStage(head+"\n## Settings\nops cfg: config service | pushes routes and limits", [
    {...steps[0],raw:"hide cfg\n"+steps[0].raw},
    {...steps[1],raw:"hide p, f, c\nshow cfg\nlist Settings\n  timeout: 30 s\n  retries: 3"}
  ], 1, {}, roles);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 734);
  expect(p.narrow).toBe(false);
  for (const b of cards(p)) expect(b.x+b.w).toBeLessThanOrEqual(734);
});

// Public regression control: fixtures/stage/16-animation-pills-that-move.dh.md.
test("a narrow search that ends wide still rejects a clipped four-lane plan",()=>{
  const c=compileStage("title: Bakery shelves | trays move as they sell\nalign: top\n## Oven\njob o: oven | batch 1\ncache t: timer | 20 minutes\n## Shelf A\nserver sa: shelf A | by the door\n  pill p1,p2,p3: rye · fresh; spelt · fresh; oat · cooling\n## Shelf B\nserver sb: shelf B | at the back\n  pill p4: seed · fresh\n## Window\nclient w: window | on the street\n  pill p5: brioche · on show",[{"title":"Bake: The oven fills shelf A.","raw":"o -> sa: trays","line":33},{"title":"Sell: Rye sells out and the oat loaf moves to the window.","raw":"move p3 to w\nlight p1: sold\ndim p1\ntext sa: rye is gone | spelt stays","line":35},{"title":"Late: Shelf B runs low and closes; the timer is off.","raw":"tone sb bad\ndim t\ntext sb: closed for the night","line":40}],1,{},{"client":1,"server":2,"store":3,"job":4,"cache":5,"ops":6,"plain":0});
  expect(c.errors).toEqual([]);const p=layoutStage(c.model,744);
  const boxes=p.items.filter((i):i is Extract<Item,{k:"box"}>=>i.k==="box"&&!!i.id&&c.model.cards.has(i.id));
  expect(boxes.length).toBeGreaterThan(0);for(const b of boxes)expect(b.x+b.w).toBeLessThanOrEqual(744);
});
