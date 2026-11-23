// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "scards": the stage's cards (tools/stage-cards.ts): one kind per thing, regions named by their own title,
// cards inside cards, pills that move, token chips, records, per-step words, align: top, across bands; refusals,
// the facts, layout at 1000 and 340, linear work and hostile input.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm, type Compiled } from "../../src/core/stage";
import { FONT, LINE_H, measure, setPhoneFont, type Item } from "../../src/core/stage-core";
/** a word's width in a phone stage's type sizes */
const phoneMeasure = (s: string, f: Parameters<typeof measure>[1]) => { setPhoneFont(true); try { return measure(s, f); } finally { setPhoneFont(false); } };
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";

beforeEach(() => { beginDocument(); });
const ROLES = { farm: 1, gate: 2, shelf: 3, tool: 4 };
function scene(src: string): Compiled {
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^@step (.*)$/);
    if (m) steps.push({ title: m[1], raw: "", line: i + 1 });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return compileStage(head.join("\n"), steps, 1, {}, ROLES);
}
const msgs = (c: Compiled) => c.errors.map((e) => e.msg).join(" | ");
type B = Extract<Item, { k: "box" }>;
const boxes = (items: Item[]) => items.filter((i): i is B => i.k === "box");
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const box = (items: Item[], id: string, k = 1) => boxes(items).find((b) => b.id === id && shownAt(b, k))!;

const HOUSE = `title: Greenhouse | one evening
## Growers
farm h: tomato house | two benches | no heater
  farm w1: bench one [- OFF] | seedlings
  farm w2: bench two [+ ON] | ripening
## Doors
gate g: north door | one keeper
  gate g1: latch | open at dawn
  gate g2: bell | rings twice
## Shelves
shelf s: shelves
  shelf s1: old shelf | empty
  shelf s2: new shelf | pots
  shelf s3: spare shelf | bags
## Path across Growers..Shelves
tool a: rake
tool b: hoe
tool c: spade
tool d: fork
next row
tool e: wheelbarrow
@step Plan: The benches report to the door.
dashed s1
w1 --> g: warm
h --> s: pots
a --> b: next
b --> c: next
e -> b: lift
@step Warm: Bench one turns on.
state w1: [+ ON]
text g1: open all day | and at night
dim s1
show s3
tag w2: ready
say g2: ding`;

describe("one kind per thing; regions carry their own title", () => {
  test("a card is kind card in a lane and in a band; lanes and bands are regions named by their title", () => {
    const c = scene(HOUSE); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), bs = boxes(p.items);
    const kinds = new Map<string, string>(); for (const b of bs) if (b.id && b.bar?.kind) kinds.set(b.id, String(b.bar.kind));
    for (const id of ["h", "w1", "g", "g2", "s3", "a", "e"]) expect(kinds.get(id)).toBe("card");
    const regions = bs.filter((b) => b.cls === "stg-region");
    expect(regions.map((r) => `${r.bar!.kind}:${r.bar!.label ?? ""}`)).toEqual(["lane:Growers", "lane:Doors", "lane:Shelves", "band:Path"]);
    for (const r of regions) { expect(r.fill).toBe("none"); expect(r.stroke).toBe("none"); }
    // a lane title is words, not a second lane
    expect(p.items.filter((i) => i.bar?.kind === "lane").length).toBe(3);
    // every card of a lane sits inside its region
    const lane = regions[0], hb = box(p.items, "h");
    expect(hb.x >= lane.x && hb.x + hb.w <= lane.x + lane.w + 0.5 && hb.y >= lane.y && hb.y + hb.h <= lane.y + lane.h + 0.5).toBe(true);
  });
  test("a band with no heading is still kind band, with no label; a phone keeps the regions", () => {
    const c = scene("## A\nfarm a: A\n## B\ngate b: B\n## _ under A..B\nshelf x: X");
    for (const w of [1000, 340]) {
      const r = boxes(layoutStage(c.model, w).items).filter((b) => b.cls === "stg-region");
      expect(r.map((x) => x.bar!.kind)).toEqual(["lane", "lane", "band"]);
      expect(r[2].bar!.label).toBeUndefined();
    }
  });
  test("pills and tokens are chips; a pill is a chip in every card it visits", () => {
    const c = scene(`## A\nfarm m0: left\n  pill p1: seed · ok\n## B\nfarm m1: right\n  tokens: sum ( a, b )\n@step One: x\n@step Two: y\nmove p1 to m1`);
    const bs = boxes(layoutStage(c.model, 1000).items);
    expect(bs.filter((b) => b.cls === "stg-pill").map((b) => b.bar!.kind)).toEqual(["chip", "chip"]);
    expect(bs.filter((b) => String(b.id).startsWith("m1#")).every((b) => b.bar!.kind === "chip")).toBe(true);
  });
});

describe("cards inside cards", () => {
  test("parse: one level, the parent holds its children; they are cards of the scene", () => {
    const m = scene(HOUSE).model;
    expect(m.cards.get("h")!.kids).toEqual(["w1", "w2"]);
    expect(m.cards.get("w1")!.parent).toBe("h");
    expect(m.cards.get("w1")!.state).toEqual({ s: "OFF", tone: "bad" });
    expect(m.lanes[0].cards.map((x) => x.id)).toEqual(["h"]);
  });
  test("children sit inside their parent, stacked, in one place for every step", () => {
    const p = layoutStage(scene(HOUSE).model, 1000);
    const h = box(p.items, "h"), w1 = box(p.items, "w1"), w2 = box(p.items, "w2");
    for (const k of [w1, w2]) expect(k.x > h.x && k.x + k.w < h.x + h.w && k.y > h.y && k.y + k.h < h.y + h.h).toBe(true);
    expect(w1.y + w1.h).toBeLessThanOrEqual(w2.y);
    const s3 = box(p.items, "s3", 2); expect(s3.from).toBe(2); // shown later: its place was kept from the start
    expect(h.cls).toBe("scn-frame"); expect(w1.cls).toBe("scn-shape");
  });
  // a side end sits on the named child's own edge, running on through the parent's padding
  test("a connector to or from a child starts or ends at that child's own edge, never across another child", () => {
    const p = layoutStage(scene(HOUSE).model, 1000);
    const e = p.items.find((i) => i.k === "path" && i.bar?.edge && i.bar.label === undefined && i.bar.from === "tomato house" && i.bar.to === "north door") as Extract<Item, { k: "path" }>;
    expect(e).toBeTruthy();
    const w1 = box(p.items, "w1"); expect(Math.abs(e.pts[0][0] - (w1.x + w1.w))).toBeLessThan(1); expect(e.pts[0][1]).toBeGreaterThanOrEqual(w1.y); expect(e.pts[0][1]).toBeLessThanOrEqual(w1.y + w1.h);
    for (const kid of ["g1", "g2", "w1", "w2"]) { const k = box(p.items, kid); for (const [x, y] of e.pts) expect(x > k.x + 1 && x < k.x + k.w - 1 && y > k.y + 1 && y < k.y + k.h - 1).toBe(false); }
  });
  test("a parent is as tall as its children need; a tag or say on a child gets its room", () => {
    const p = layoutStage(scene(HOUSE).model, 1000), g = box(p.items, "g"), g2 = box(p.items, "g2");
    expect(g.y + g.h).toBeGreaterThanOrEqual(g2.y + g2.h + 22 - 0.5); // the say under g2
    const tag = boxes(p.items).find((b) => b.cls === "stg-chip" && b.bar?.label === "ready")!, w2 = box(p.items, "w2"), w1 = box(p.items, "w1");
    expect(tag.y + tag.h).toBeLessThanOrEqual(w2.y + 1); expect(tag.y).toBeGreaterThanOrEqual(w1.y + w1.h - 0.5);
  });
});

describe("step words on cards", () => {
  test("text, state, ghost, dash: each from its step on, in the card's one place", () => {
    const p = layoutStage(scene(HOUSE).model, 1000);
    const texts = (k: number) => p.items.filter((i) => i.k === "text" && shownAt(i, k)).map((i) => (i as any).s);
    expect(texts(1)).toContain("open at dawn"); expect(texts(2)).not.toContain("open at dawn");
    expect(texts(2)).toContain("open all day"); expect(texts(2)).toContain("and at night");
    expect(texts(1)).toContain("OFF"); expect(texts(2)).toContain("ON");
    const s1 = boxes(p.items).filter((b) => b.id === "s1");
    expect(s1.every((b) => b.dash)).toBe(true);
    expect(s1.every((b) => (b.dim ?? []).includes(2) && !(b.dim ?? []).includes(1))).toBe(true);
    const g1 = boxes(p.items).filter((b) => b.id === "g1");
    expect(g1.length).toBe(1); // the card itself does not change: one box
  });
  test("tone: one box per run, same place; a toned card is not painted as its role", () => {
    const c = scene("## A\nfarm m: mill\n@step One: x\n@step Two: y\ntone m bad\n@step Three: z\ntone m off");
    const bs = boxes(layoutStage(c.model, 1000).items).filter((b) => b.id === "m");
    expect(bs.map((b) => [b.from, b.to, b.stroke])).toEqual([[1, 1, "role:farm:line"], [2, 2, "bad:line"], [3, 0, "role:farm:line"]]);
    expect(new Set(bs.map((b) => `${b.x},${b.y},${b.w},${b.h}`)).size).toBe(1);
    expect(bs[1].bar!.role).toBe("tone:bad"); expect(bs[1].role).toBeUndefined();
  });
  test("the lines' height is the largest of every step's text: nothing moves", () => {
    const c = scene("## A\nfarm m: mill | one\nfarm n: next\n@step One: x\n@step Two: y\ntext m: one | two | three");
    const p = layoutStage(c.model, 1000), m = box(p.items, "m");
    expect(m.h).toBeGreaterThanOrEqual(10 + LINE_H.title + 3 * LINE_H.sub);
  });
});

describe("pills", () => {
  const MILL = `align: top
## In
farm src: source | id 1
farm cfg: ledger
## Work
farm m0: mill zero | id 2
  pill p1,p2: seed east · ok; seed west · slow
## Done
farm m2: mill two | id 3
  pill p3: seed north · ok
@step One: start
@step Two: move
move p1 to m2
light p2: → 2
@step Three: rest
dim m2`;
  test("a move: drawn in the old card until the step, in the new one from it; both slots kept", () => {
    const c = scene(MILL); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), pills = boxes(p.items).filter((b) => b.cls === "stg-pill");
    const p1 = pills.filter((b) => b.bar!.id === "pill:p1");
    expect(p1.map((b) => [b.id, b.from, b.to])).toEqual([["pill:p1@m0", 1, 1], ["pill:p1@m2", 2, 0]]);
    const m0 = box(p.items, "m0"), m2 = box(p.items, "m2");
    expect(p1[0].x).toBeGreaterThan(m0.x); expect(p1[0].x + p1[0].w).toBeLessThan(m0.x + m0.w);
    expect(p1[1].x).toBeGreaterThan(m2.x); expect(p1[1].y + p1[1].h).toBeLessThan(m2.y + m2.h);
    // m2 reserved a slot for p1 from the start: its own pill does not move
    const p3 = pills.filter((b) => b.bar!.id === "pill:p3"); expect(p3.length).toBe(1);
  });
  test("a lit pill is hot in its step with its note at its right end; ghost fades a card's pills", () => {
    const p = layoutStage(scene(MILL).model, 1000);
    const p2 = boxes(p.items).find((b) => b.bar?.id === "pill:p2")!;
    expect(p2.hot).toEqual([2]);
    const note = p.items.find((i) => i.k === "text" && (i as any).s === "→ 2")!;
    expect([note.from, note.to]).toEqual([2, 2]); expect((note as any).anchor).toBe("end");
    expect(boxes(p.items).filter((b) => b.bar?.id === "pill:p3").every((b) => (b.dim ?? []).includes(3))).toBe(true);
  });
  test("align: top: the cards of a row share one top and one foot", () => {
    const p = layoutStage(scene(MILL).model, 1000);
    const src = box(p.items, "src"), cfg = box(p.items, "cfg"), m0 = box(p.items, "m0"), m2 = box(p.items, "m2");
    expect(src.y).toBe(m0.y); expect(m0.y).toBe(m2.y);
    expect(cfg.y + cfg.h).toBeCloseTo(m0.y + m0.h, 3); expect(m0.h).toBeCloseTo(m2.h, 3);
    // without it the lanes are centred (as before)
    const q = layoutStage(scene(MILL.replace("align: top\n", "").replace("farm cfg: ledger\n", "")).model, 1000); // lanes of clearly different heights (with 21 px card gaps the two-card lane can equal the pill card)
    expect(box(q.items, "m0").y).not.toBe(box(q.items, "src").y);
  });
  test("the facts: pills in their card, moves and lit notes per step", () => {
    const t = stageLlm(scene(MILL));
    expect(t).toMatch(/mill zero \(id 2\) pills: seed east · ok; seed west · slow/);
    expect(t).toMatch(/seed east · ok moves to mill two/);
    expect(t).toMatch(/seed west · slow: → 2/);
    expect(t).toMatch(/mill two fades/);
  });
});

describe("tokens and records", () => {
  const Q = `## _
tool q: the query
  tokens: sum by ( a, b, zone ) ( pick( hits {k="x"} [5d] ) )
tool r: the plan
  keys: Name; Kind; Owner
@step One: read
@step Two: drop
mark q zone: bad dropped: not kept
fill r Name, Kind: total; sum
@step Three: name
mark q hits, {k="x"}: accent
fill r Owner: the shop`;
  test("tokens: plain on every step, boxed in a tone in the step that marks them, a remark under their row", () => {
    const c = scene(Q); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), toks = boxes(p.items).filter((b) => String(b.id).startsWith("q#"));
    expect(new Set(toks.map((b) => b.id)).size).toBe(14);
    const zone = toks.filter((b) => b.bar!.label === "zone");
    expect(zone.map((b) => [b.from, b.to, b.fill])).toEqual([[1, 1, "surface"], [2, 2, "bad:soft"], [3, 0, "surface"]]);
    const rm = p.items.find((i) => i.k === "text" && (i as any).s === "dropped: not kept")!;
    expect([rm.from, rm.to]).toEqual([2, 2]);
    expect(toks.filter((b) => b.fill === "acc:soft").map((b) => b.bar!.label)).toEqual(["hits", '{k="x"}']);
    // a token keeps its place: every run of one token is at one x, y
    for (const id of new Set(toks.map((b) => b.id))) expect(new Set(toks.filter((b) => b.id === id).map((b) => `${b.x},${b.y}`)).size).toBe(1);
  });
  test("a record: '...' until a step fills it; filled stays; keys and values in columns; the card never resizes", () => {
    const p = layoutStage(scene(Q).model, 1000);
    const at = (k: number) => p.items.filter((i) => i.k === "text" && shownAt(i, k) && i.bar?.column === "r:value").map((i) => (i as any).s);
    expect(at(1)).toEqual(["...", "...", "..."]); expect(at(2)).toEqual(["total", "sum", "..."]); expect(at(3)).toEqual(["total", "sum", "the shop"]);
    const xs = new Set(p.items.filter((i) => i.bar?.column === "r:value").map((i) => (i as any).x)); expect(xs.size).toBe(1);
    expect(boxes(p.items).filter((b) => b.id === "r").length).toBe(1);
  });
  test("the facts", () => {
    const t = stageLlm(scene(Q));
    expect(t).toMatch(/the plan \{Name: \.\.\.; Kind: \.\.\.; Owner: \.\.\.\}/);
    expect(t).toMatch(/the query: zone \(bad: dropped: not kept\)/);
    expect(t).toMatch(/the plan: Name = total, Kind = sum/);
  });
});

describe("across bands", () => {
  test("one row left to right (any number of card lines), next row starts the next, centred; neighbours' connectors run straight across the gap", () => {
    const p = layoutStage(scene(HOUSE).model, 1000);
    const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((id) => box(p.items, id));
    expect(a.y).toBe(b.y); expect(c.y).toBe(d.y);
    expect(a.x + a.w).toBeLessThan(b.x); expect(b.x + b.w).toBeLessThan(c.x); expect(c.x + c.w).toBeLessThan(d.x);
    expect(e.y).toBeGreaterThan(a.y + a.h + 20);
    expect(e.x + e.w / 2).toBeCloseTo((a.x + d.x + d.w) / 2, 0);
    const next = p.items.filter((i) => i.k === "path" && i.bar?.from === "rake") as Extract<Item, { k: "path" }>[];
    expect(next.length).toBe(1); expect(next[0].pts.length).toBe(2);
    const lab = boxes(p.items).find((x) => x.bar?.["edge-label"] === "next")!;
    expect(lab.x).toBeGreaterThanOrEqual(a.x + a.w - 1); expect(lab.x + lab.w).toBeLessThanOrEqual(d.x + 1);
  });
});

describe("refusals: each names the line and the fix", () => {
  const cases: [string, string, RegExp][] = [
    ["a card inside a card inside a card", "## A\nfarm a: A\n  farm b: B\n    farm c: C", /one level only/],
    ["cards inside a line of many ids", "## A\nfarm a,b: A; B\n  farm c: C", /declared alone/],
    ["a child id used twice", "## A\nfarm a: A\n  farm a: B", /declared twice/],
    ["a pill id that is a card", "## A\nfarm a: A\n  pill a: x", /declared twice/],
    ["an unknown role on a child", "## A\nfarm a: A\n  nope b: B", /not a role of this page/],
    ["a move of an unknown pill", "## A\nfarm a: A\n@step One: x\nmove zz to a\n@step Two: y", /not a pill/],
    ["a move to an unknown card", "## A\nfarm a: A\n  pill p: x\n@step One: x\nmove p to zz\n@step Two: y", /not a card/],
    ["an unknown tone", "## A\nfarm a: A\n@step One: x\ntone a pink\n@step Two: y", /not a tone/],
    ["a state that does not read", "## A\nfarm a: A\n@step One: x\nstate a: ON\n@step Two: y", /a state is/],
    ["fill on a card with no keys", "## A\nfarm a: A\n@step One: x\nfill a K: v\n@step Two: y", /has no keys/],
    ["fill of an unknown key", "## A\nfarm a: A\n  keys: K\n@step One: x\nfill a Z: v\n@step Two: y", /not a key of a/],
    ["chip of an unknown token", "## A\nfarm a: A\n  tokens: x y\n@step One: x\nmark a z: bad\n@step Two: y", /not a token of a/],
    ["chip by a place past the end", "## A\nfarm a: A\n  tokens: x y\n@step One: x\nmark a #3: bad\n@step Two: y", /no #3/],
    ["a key listed twice", "## A\nfarm a: A\n  keys: K; K", /listed twice/],
    ["light mixing pills and cards", "## A\nfarm a: A\n  pill p: x\n@step One: x\nlight p, a: n\n@step Two: y", /lights pills/],
    ["align other than top", "align: middle\n## A\nfarm a: A", /align: top/],
    ["next row outside an across band", "## A\nfarm a: A\nnext row", /goes in a band written/],
    ["across without a range", "## A\nfarm a: A\n## X across A\nfarm b: B", /names the lanes it spans/],
    ["too many tokens", `## A\nfarm a: A\n  tokens: ${"t ".repeat(65)}`, /at most 64 tokens/],
    ["too many pills", `## A\nfarm a: A\n  pill p1..p64: x\nfarm b: B\n  pill q: y`, /at most 64 pills/],
    ["too many keys", `## A\nfarm a: A\n  keys: ${Array.from({ length: 25 }, (_, i) => "k" + i).join("; ")}`, /at most 24 keys/],
    ["too many children", `## A\nfarm a: A\n${Array.from({ length: 13 }, (_, i) => `  farm k${i}: k`).join("\n")}`, /at most 12 cards/],
  ];
  for (const [name, src, re] of cases) test(name, () => { const c = scene(src); expect(msgs(c)).toMatch(re); expect(c.errors[0].line).toBeGreaterThan(0); });
});

describe("layout bounds and work", () => {
  test("everything inside the stage and no font under 11, at 1000 and 340", () => {
    for (const src of [HOUSE]) for (const w of [1000, 340]) {
      const p = layoutStage(scene(src).model, w);
      for (const it of p.items) {
        if (it.k === "box" && it.cls !== "stg-region") { expect(it.x).toBeGreaterThanOrEqual(-0.5); expect(it.x + it.w).toBeLessThanOrEqual(w + 0.5); }
        if (it.k === "text") expect(FONT[it.f].size).toBeGreaterThanOrEqual(11);
      }
    }
  });
  const big = (n: number) => `## A\n${Array.from({ length: n }, (_, i) => `farm c${i}: card ${i}\n  farm k${i}: kid ${i} | line\n  pill p${i}: pill ${i}\n  tokens: a${i} b${i} c${i}\n  keys: K${i}`).join("\n")}\n## B\ngate s: S\n@step One: x\n${Array.from({ length: n }, (_, i) => `k${i} -> s: call ${i}\nfill c${i} K${i}: v`).join("\n")}\n@step Two: y\n${Array.from({ length: n }, (_, i) => `move p${i} to s\nmark c${i} b${i}: bad why`).join("\n")}`;
  const work = (src: string) => { const b = beginDocument(newBudget(1e9, 1e9)); const c = scene(src); expect(msgs(c)).toBe(""); layoutStage(c.model, 1000); stageLlm(c); return 1e9 - b.left().work; };
  test("doubling the input at most about doubles the work", () => {
    const a = work(big(12)), b = work(big(24));
    expect(b / a).toBeLessThan(2.6);
  });
  test("a small budget refuses a big scene with BudgetError", () => {
    beginDocument(newBudget(500, 500));
    expect(() => { const c = scene(big(24)); layoutStage(c.model, 1000); }).toThrow(BudgetError);
  });
  test("hostile input ends quickly: long tokens, deep indents, many moves", () => {
    const t0 = performance.now();
    const c1 = scene(`## A\nfarm a: A\n  tokens: ${"x".repeat(20000)} y\n  pill p: ${"w ".repeat(3000)}`);
    layoutStage(c1.model, 1000); layoutStage(c1.model, 340);
    const c2 = scene(`## A\nfarm a: A\n${"  ".repeat(300)}farm b: B`);
    expect(msgs(c2)).toBe(""); expect(c2.model.cards.get("b")!.parent).toBe("a"); // any depth of indent is one level in
    const c3 = scene(`## A\nfarm a: A\n  pill p: x\nfarm b: B\n${Array.from({ length: 150 }, (_, i) => `@step S${i}: s\nmove p to ${i % 2 ? "a" : "b"}`).join("\n")}`);
    layoutStage(c3.model, 1000);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("a scene follow-ups", () => {
  test("a key with a comma is quoted, in keys: and in fill", () => {
    const c = scene(`## A\nfarm r: plan\n  keys: Name; "Fn, Window"\n@step One: x\nfill r "Fn, Window", Name: avg; total\n@step Two: y`);
    expect(msgs(c)).toBe("");
    expect(c.model.cards.get("r")!.keys).toEqual(["Name", "Fn, Window"]);
    expect(stageLlm(c)).toMatch(/plan: Fn, Window = avg, Name = total/);
    expect(msgs(scene(`## A\nfarm r: plan\n  keys: Name; "Fn, Window"\n@step One: x\nfill r Fn, Window: avg\n@step Two: y`))).toMatch(/is quoted/);
  });
  test("a card titled _ draws no title row (its band heading says it)", () => {
    const c = scene(`## Query across A..B\nfarm q: _ | one line\n## A\nfarm a: A\n## B\nfarm b: B`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000);
    expect(p.items.some((i) => i.k === "text" && (i as any).s === "_")).toBe(false);
    expect(box(p.items, "q").bar!.label).toBeUndefined();
    expect(stageLlm(c)).toMatch(/Query \(across A to B\): one line/);
  });
  test("token chips are measured in the font they are drawn in, inside the card at 1000 and 340", () => {
    const c = scene(`## A\nfarm q: query\n  tokens: sum by ( alpha, beta, gamma, delta ) ( pick( apples_total {row=~"5.."} [5d] ) ) then more words here`);
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w), q = box(p.items, "q");
      const toks = boxes(p.items).filter((b) => String(b.id).startsWith("q#"));
      for (const t of toks) { expect(t.x).toBeGreaterThanOrEqual(q.x); expect(t.x + t.w).toBeLessThanOrEqual(q.x + q.w); }
      const texts = p.items.filter((i) => i.k === "text" && i.f === "chip" && (i as any).anchor === "middle");
      for (const t of texts) expect(FONT[(t as any).f as "chip"].size).toBeGreaterThanOrEqual(11); // the chip font, whatever its size
      // no two chips of one row overlap
      for (const a of toks) for (const b of toks) if (a !== b && a.y === b.y) expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
    }
  });
});
describe("records with values from the start", () => {
  test("keys: Key = value starts filled; fill still changes it", () => {
    const c = scene(`## A\nfarm g: gate\n  farm g1: lock | two lines\n    keys: Crates = 76; Keeper = one\n@step One: x\n@step Two: y\nfill g1 Crates: 80`);
    expect(msgs(c)).toBe("");
    expect(stageLlm(c)).toMatch(/lock \(two lines\) \{Crates: 76; Keeper: one\}/);
    const p = layoutStage(c.model, 1000);
    const at = (k: number) => p.items.filter((i) => i.k === "text" && shownAt(i, k) && i.bar?.column === "g1:value").map((i) => (i as any).s);
    expect(at(1)).toEqual(["76", "one"]); expect(at(2)).toEqual(["80", "one"]);
  });
});
describe("one paint per role (bar point 7)", () => {
  test("every box stamped with a role has that role's soft fill and line; a tone is stamped tone:<tone>", () => {
    const c = scene(`## A\nfarm m: mill\n  farm k: inner\n  pill p: seed\n## B\nfarm n: next\n  tokens: a b\n@step One: x\n@step Two: y\ntone n bad\nmark n a: accent`);
    const bs = boxes(layoutStage(c.model, 1000).items).filter((b) => b.bar?.role);
    for (const b of bs) {
      const r = String(b.bar!.role);
      if (r.startsWith("tone:")) { expect(b.fill).toBe(`${r.slice(5)}:soft`); expect(b.role).toBeUndefined(); }
      else { expect(b.fill).toBe(`role:${r}:soft`); expect(b.stroke).toBe(`role:${r}:line`); }
    }
    expect(bs.some((b) => b.bar!.role === "tone:bad")).toBe(true);
  });
});
describe("phone: lanes of one card each sit side by side", () => {
  const ROW = `align: top
## Oven
tool o: oven | batch 1
## Shelf A
farm sa: shelf A | by the door
  pill p1,p2: rye · fresh; spelt · fresh
## Shelf B
farm sb: shelf B | at the back
## Window
gate w: window | on the street
@step Bake: x
o -> sa: trays
sa -> sb: more
@step Sell: y
sb --> w: last`;
  test("at 340 four one-card lanes take two rows of two; each heading over its own card; nothing outside; words 11 px or more", () => {
    const c = scene(ROW); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 340);
    const [o, sa, sb, w] = ["o", "sa", "sb", "w"].map((id) => box(p.items, id));
    expect(o.y).toBe(sa.y); expect(sb.y).toBe(w.y); expect(sb.y).toBeGreaterThan(o.y + o.h);
    expect(o.h).toBe(sa.h); expect(o.x + o.w).toBeLessThan(sa.x);
    for (const it of p.items) {
      if (it.k === "box" || it.k === "text") { expect((it as any).x).toBeGreaterThanOrEqual(-0.5); }
      if (it.k === "box") expect(it.x + it.w).toBeLessThanOrEqual(340 + 0.5);
      if (it.k === "text") expect(FONT[it.f].size).toBeGreaterThanOrEqual(11);
    }
    const heads = p.items.filter((i) => i.k === "text" && i.f === "lane") as any[];
    expect(heads.map((t) => t.s)).toEqual(["Oven", "Shelf A", "Shelf B", "Window"]);
    expect(heads[1].x).toBeCloseTo(sa.x, 3); expect(heads[1].y).toBeLessThan(sa.y);
    // regions: one per lane, each as wide as its card
    const regs = boxes(p.items).filter((b) => b.cls === "stg-region");
    expect(regs.map((r) => r.bar!.label)).toEqual(["Oven", "Shelf A", "Shelf B", "Window"]);
    expect(regs[1].w).toBeCloseTo(sa.w, 3);
    // neighbours in one row: a short straight arrow across their gap; others through the channel
    const e = p.items.find((i) => i.k === "path" && i.bar?.from === "oven") as Extract<Item, { k: "path" }>;
    expect(e.pts.length).toBe(2); expect(e.pts[0][0]).toBeCloseTo(o.x + o.w, 3); expect(e.pts[1][0]).toBeCloseTo(sa.x, 3);
    expect(sa.x - (o.x + o.w)).toBeGreaterThanOrEqual(24);
  });
  test("the phone stage is shorter than one lane a row, and nothing moves between steps", () => {
    const c = scene(ROW), p = layoutStage(c.model, 340);
    const stacked = layoutStage(scene(ROW.replace("## Shelf A", "## Shelf A\n... and more")).model, 340); // a lane with "and more" stacks as before
    expect(p.h).toBeLessThan(stacked.h * 0.9); // the stacked phone lane got denser too (int 351 vs 473; 337 vs 402; tighter lane bottoms 331 vs 380)
    expect(new Set(boxes(p.items).filter((b) => b.id === "sa").map((b) => `${b.x},${b.y}`)).size).toBe(1);
  });
  test("a wide stage is unchanged: lanes left to right", () => {
    const p = layoutStage(scene(ROW).model, 1000), [o, sa, sb, w] = ["o", "sa", "sb", "w"].map((id) => box(p.items, id));
    expect(o.y).toBe(sa.y); expect(sb.y).toBe(w.y); expect(o.y).toBe(w.y);
  });
});
describe("bar kinds of the step bands", () => {
  test("a step's note: band is kind band, not a card", () => {
    const c = scene("## A\nfarm a: A\n@step One: x\nnote: Why | one line\n@step Two: y");
    const n = boxes(layoutStage(c.model, 1000).items).find((b) => b.bar?.label === "Why")!;
    expect(n.bar!.kind).toBe("band"); expect(n.dash).toBeFalsy(); expect(n.stroke).toBe("stg-note-line"); expect(n.cls).toBe("stg-note-strip"); // the originals draw these strips solid, 1 px (a theme token)
  });
});
describe("says wrap to their card and stack", () => {
  const SAY = `## A\nfarm a: first\nfarm b: second\n## B\ngate c: third\n@step One: x\nsay a: a long remark that is far wider than its card ever is | and a second line\nsay a: one more under it\n@step Two: y\nsay c: short`;
  test("a say is no wider than its card (two lines) and two says under one card stack", () => {
    const c = scene(SAY); expect(msgs(c)).toBe("");
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w), a = box(p.items, "a"), b = box(p.items, "b");
      const chips = boxes(p.items).filter((x) => x.cls === "stg-chip" && x.from === 1 && String(x.bar?.label).length > 3 && (w === 1000 ? a.x - 1 <= x.x + x.w / 2 && x.x + x.w / 2 <= a.x + a.w + 1 : a.x - 1 <= x.x && x.x <= a.x + a.w)); // a phone say may use the row's width: under a by its left edge
      expect(chips.length).toBe(2);
      // at 1000 a say is no wider than its card; on a phone the one card of a row with says may use the row's width
      for (const ch of chips) { expect(ch.w).toBeLessThanOrEqual((w === 1000 ? Math.max(a.w, 60) : w) + 0.5); expect(ch.x).toBeGreaterThanOrEqual(0); }
      if (w === 1000) expect(chips[0].h).toBeGreaterThan(30); // wrapped to more than one line
      expect(chips[0].y + chips[0].h).toBeLessThanOrEqual(chips[1].y);
      // the next card in the lane starts under both (its place is kept for every step)
      if (b.x === a.x) expect(b.y).toBeGreaterThanOrEqual(chips[1].y + chips[1].h);
    }
  });
});
describe("phone: labels of connectors inside one stacked lane or band", () => {
  test("cards a connector joins in one row get an arrow gap; their labels sit in a strip under the row, never on a heading or card", () => {
    const c = scene(`## A\nfarm x: x\n## B\ngate y: y\n## Desk across A..B\ntool a: check in\ntool b: shelve\ntool c: lend\nnext row\ntool d: repair\n@step One: s\na --> b: next\nb --> c: next\nd -> b: mended\n@step Two: t`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 340), cards = ["x", "y", "a", "b", "c", "d"].map((id) => box(p.items, id));
    const [a, b] = [cards[2], cards[3]];
    if (a.y === b.y) expect(b.x - (a.x + a.w)).toBeGreaterThanOrEqual(24);
    const labels = boxes(p.items).filter((x) => x.bar?.["edge-label"]);
    expect(labels.length).toBeGreaterThan(0);
    const heads = p.items.filter((i) => i.k === "text" && i.f === "lane") as any[];
    for (const lb of labels) {
      for (const k of cards) expect(lb.x + lb.w <= k.x || k.x + k.w <= lb.x || lb.y + lb.h <= k.y || k.y + k.h <= lb.y).toBe(true);
      for (const hd of heads) expect(hd.y < lb.y || hd.y - 12 > lb.y + lb.h).toBe(true);
      expect(lb.x + lb.w).toBeLessThanOrEqual(340 + 0.5);
    }
  });
});
describe("a title a step changes; a phone say on its row's width", () => {
  test("title id: words changes the card's title from that step, in its one place", () => {
    const c = scene(`## A\nfarm t: lantern: OFF (step 0) | watches\n@step One: x\n@step Two: y\ntitle t: lantern: ON (step 1)`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), at = (k: number) => p.items.filter((i) => i.k === "text" && i.f === "title" && shownAt(i, k)).map((i) => (i as any).s);
    expect(at(1)).toEqual(["lantern: OFF (step 0)"]); expect(at(2)).toEqual(["lantern: ON (step 1)"]);
    expect(stageLlm(c)).toMatch(/lantern: OFF \(step 0\) is now titled: lantern: ON \(step 1\)/);
    expect(boxes(p.items).filter((b) => b.id === "t").length).toBe(1);
  });
  test("on a phone, the one card of a row with says wraps them to the row's width (one line when they fit)", () => {
    const c = scene(`## A\nfarm a: one\n## B\nfarm b: two\n@step One: x\nsay a: a say of some thirty letters\n@step Two: y`);
    const p = layoutStage(c.model, 340), a = box(p.items, "a"), b = box(p.items, "b");
    expect(a.y).toBe(b.y); // side by side
    const ch = boxes(p.items).find((x) => x.bar?.label === "a say of some thirty letters")!;
    expect(ch.h).toBeLessThan(24); // one line
    expect(ch.x).toBeGreaterThanOrEqual(0); expect(ch.x + ch.w).toBeLessThanOrEqual(340);
  });
});
describe("a connector line of one pair keeps its own label", () => {
  const SRC = `## Farms\nfarm a: hill farm\nfarm b: river farm\n## Market\nshelf m: market hall\n## Shops\ngate s: corner shop\ngate t: kiosk\n@step Arrive: x\na -> m: 30 crates\nb -> m: 30 crates\n@step Share: y\nm -> s, t: 12 each\n@step Again: z\nclear\na -> m: 30 crates`;
  const labelsAt = (items: Item[], t: string, k: number) => boxes(items).filter((x) => x.bar?.["edge-label"] === t && shownAt(x, k));
  for (const w of [1000, 340]) test(`two one-pair lines with one label show it twice; a line of pairs shows it once (${w})`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w);
    const two = labelsAt(p.items, "30 crates", 1);
    expect(two.length).toBe(2);
    expect(two[0].x + two[0].w <= two[1].x || two[1].x + two[1].w <= two[0].x || two[0].y + two[0].h <= two[1].y || two[1].y + two[1].h <= two[0].y).toBe(true);
    expect(labelsAt(p.items, "12 each", 2).length).toBe(1);
    expect(labelsAt(p.items, "30 crates", 3).length).toBe(1); // the one line of step 3 after clear
  });
});
// a key entry's words: the text right beside its swatch, on its line (the swatch itself is a wordless chip, as in the originals)
const besideOf = (items: Item[], c: { x: number; y: number; w: number; h: number }) => (items.filter((i) => i.k === "text") as any[]).find((t) => t.x >= c.x + c.w && t.x <= c.x + c.w + 10 && Math.abs(t.y - 4 - (c.y + c.h / 2)) <= 3);
describe("key at: top right: a small swatch and its words per entry, at the top right", () => {
  const SRC = `key at: top right\n## Farms\nfarm a: hill farm\n## Market\nshelf m: market hall\n@step One: x\na -> m: crates\nkey farm: grown here\nkey shelf: sold here\n@step Two: y\nkey gate: a second key line, a longer one, written later`;
  for (const w of [1000, 340]) test(`each entry is a chip of a swatch and its words, top right, above the cards, from its step (${w})`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w), bs = boxes(p.items);
    const ents = bs.filter((b) => b.cls === "stg-key"), sws = ents; // the swatch itself is the chip (as the originals stamp it)
    expect(ents.map((e) => e.bar?.kind)).toEqual(["chip", "chip", "chip"]);
    expect(ents.map((e) => e.bar?.label)).toEqual([undefined, undefined, undefined]); // wordless swatches
    expect(ents.map((e) => besideOf(p.items, e)?.s)).toEqual(["grown here", "sold here", "a second key line, a longer one, written later"]);
    for (const s of sws) { expect(s.w).toBe(16); expect(s.h).toBe(16); }
    expect(sws.map((s) => s.fill)).toEqual(["role:farm:soft", "role:shelf:soft", "role:gate:soft"]);
    // the top right: the first row ends at the stage's right edge, above every card; inside the stage
    const ends = ents.map((e) => besideOf(p.items, e)!).map((t) => t.x + (w < 480 ? phoneMeasure(t.s, t.f) : measure(t.s, t.f))), right = Math.max(...ends), top = Math.min(...ents.map((e) => e.y)), cards = bs.filter((b) => b.bar?.kind === "card");
    expect(right).toBeGreaterThan(w - 40); expect(right).toBeLessThanOrEqual(w);
    for (const e of ents) { expect(e.x).toBeGreaterThanOrEqual(0); for (const k of cards) expect(e.y + e.h).toBeLessThanOrEqual(k.y); }
    expect(top).toBeLessThan(20);
    // from the step that writes it; no wide boxes under the stage
    expect(shownAt(ents[0], 1)).toBe(true); expect(shownAt(ents[2], 1)).toBe(false); expect(shownAt(ents[2], 2)).toBe(true);
    expect(bs.some((b) => b.bar?.kind === "worksheet-row")).toBe(false);
    for (const t of p.items.filter((i) => i.k === "text") as any[]) expect(FONT[t.f as keyof typeof FONT].size).toBeGreaterThanOrEqual(11);
  });
  test("a scene with no key draws no legend and starts where it did", () => {
    const c = scene(`## Farms\nfarm a: hill farm\n@step One: x\n@step Two: y`);
    const p = layoutStage(c.model, 1000);
    expect(boxes(p.items).some((b) => b.cls === "stg-key")).toBe(false);
  });
  test("by default the key stays at the bottom left, stacked: the same items as with key at: bottom left, one legend box (kind legend) holding a small unstamped swatch and its words per entry (the hero's original)", () => {
    const body = SRC.replace("key at: top right\n", "");
    for (const w of [1000, 340]) {
      const a = layoutStage(scene(body).model, w), b = layoutStage(scene("key at: bottom left\n" + body).model, w);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      // one legend box at the bottom left holding every entry; the swatches inside it carry no kind
      const ents = boxes(a.items).filter((x) => x.cls === "stg-key"), cards = boxes(a.items).filter((x) => x.bar?.kind === "card");
      expect(ents.map((e) => e.bar?.kind)).toEqual([undefined, undefined, undefined]);
      const lg = boxes(a.items).filter((x) => x.bar?.kind === "legend"); expect(lg.length).toBe(1);
      for (const e of ents) expect(e.x >= lg[0].x && e.y >= lg[0].y && e.x + e.w <= lg[0].x + lg[0].w && e.y + e.h <= lg[0].y + lg[0].h).toBe(true);
      expect(boxes(a.items).filter((x) => x.cls === "stg-key").every((s) => s.w === 16 && s.h === 16)).toBe(true);
      for (const e of ents) { expect(e.x).toBeLessThan(w / 2); expect(e.y).toBeGreaterThan(Math.min(...cards.map((k) => k.y))); expect(e.x + e.w).toBeLessThanOrEqual(w); }
      expect(a.items.some((i) => i.k === "text" && (i as any).s === "grown here")).toBe(true);
    }
  });
  test("key at takes top right or bottom left", () => {
    expect(msgs(scene("key at: middle\n## A\nfarm a: A\n One: x\nkey farm: k\n Two: y"))).toMatch(/the key takes one place/);
  });
});
describe("a key entry: the swatch is the chip, its words beside it, crossing no box (the bar)", () => {
  const KEYS = `## Farms\nfarm a: hill farm\n## Market\nshelf m: market hall\n@step One: x\nkey farm: grown here; picks, fills crates, no sale\nkey shelf: sold here\n@step Two: y\nkey gate: kept`;
  for (const top of [false, true]) for (const w of [1280, 390]) test(`${top ? "top right" : "bottom left"} at ${w}`, () => {
    const p = layoutStage(scene((top ? "key at: top right\n" : "") + KEYS).model, w);
    const chips = boxes(p.items).filter((b) => b.cls === "stg-key");
    const words = (p.items.filter((i) => i.k === "text") as any[]).map((t) => ({ s: t.s, x: t.x, y: t.y - 12, w: measure(t.s, t.f), h: 16 }));
    expect(chips.length).toBe(4);
    for (const c of chips) {
      const b = besideOf(p.items, c)!, own = words.find((t) => t.s === b.s && t.x === b.x)!;
      expect(own.x - (c.x + c.w)).toBeGreaterThanOrEqual(4); expect(own.x - (c.x + c.w)).toBeLessThanOrEqual(8); // beside it
      expect(Math.abs(own.y + own.h / 2 - (c.y + c.h / 2))).toBeLessThanOrEqual(2); // on its line
      for (const t of words) { const ix = Math.min(t.x + t.w, c.x + c.w) - Math.max(t.x, c.x), iy = Math.min(t.y + t.h, c.y + c.h) - Math.max(t.y, c.y); expect(ix > 1 && iy > 1).toBe(false); }
    }
  });
});
describe("key at: bottom right", () => {
  const TALL = `key at: bottom right\n## Farms\nfarm a: hill farm\nfarm b: river farm\nfarm c: lake farm\nfarm d: wood farm\n## Market\nshelf m: market hall\n@step One: x\nkey farm: grown here\nkey shelf: sold here\n@step Two: y`;
  for (const w of [1000, 390]) test(`right-aligned at the foot, crossing no box, at most one row taller (${w})`, () => {
    const c = scene(TALL); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w), bs = boxes(p.items), keys = bs.filter((b) => b.cls === "stg-key"), cards = bs.filter((b) => b.bar?.kind === "card");
    expect(keys.length).toBe(2);
    for (const k of keys) { expect(k.x).toBeGreaterThan(w / 3); for (const b of cards) expect(k.x + k.w <= b.x || b.x + b.w <= k.x || k.y + k.h <= b.y || b.y + b.h <= k.y).toBe(true); }
    const words = keys.map((k) => besideOf(p.items, k)!);
    expect(Math.max(...words.map((t) => t.x + measure(t.s, t.f)))).toBeGreaterThan(w - 40);
    const plain = layoutStage(scene(TALL.replace("key at: bottom right\n", "").replace(/\nkey [a-z]+: [a-z ]+/g, "")).model, w);
    expect(p.h - plain.h).toBeLessThanOrEqual(26);
  });
  test("under the stage, right-aligned, when the foot is taken", () => {
    const c = scene(`key at: bottom right\n## Farms\nfarm a: hill farm\n## Market\nshelf m: market hall\n@step One: x\nkey farm: grown here\n@step Two: y`);
    const p = layoutStage(c.model, 1000), k = boxes(p.items).find((b) => b.cls === "stg-key")!, cards = boxes(p.items).filter((b) => b.bar?.kind === "card");
    expect(k.y).toBeGreaterThan(Math.max(...cards.map((b) => b.y + b.h)));
    expect(k.x).toBeGreaterThan(500);
  });
});
describe("keep mark on a card's tokens: from this step on", () => {
  const SRC = `## A\nfarm q: recipe | one line\n  tokens: mix, flour, salt\n@step One: x\n@step Two: y\nkeep mark q salt: bad dropped: optional\n@step Three: z\nmark q flour: accent\n@step Four: w\nmark q salt: good\n@step Five: v\nkeep mark q salt: good back`;
  test("the tone and remark hold until the next kept mark; a one-step mark wins on its step; the card never resizes", () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000);
    const salt = boxes(p.items).filter((b) => b.id === "q#3"), toneAt = (k: number) => salt.find((b) => shownAt(b, k))!.fill;
    expect([1, 2, 3, 4, 5].map(toneAt)).toEqual(["surface", "bad:soft", "bad:soft", "good:soft", "good:soft"]);
    const rem = (s: string) => p.items.filter((i) => i.k === "text" && (i as any).s === s)[0];
    expect([1, 2, 3, 4, 5].map((k) => shownAt(rem("dropped: optional"), k))).toEqual([false, true, true, true, false]);
    expect([1, 2, 3, 4, 5].map((k) => shownAt(rem("back"), k))).toEqual([false, false, false, false, true]);
    const card = boxes(p.items).filter((b) => b.id === "q" && b.bar?.kind === "card");
    expect(new Set(card.map((b) => `${b.x},${b.y},${b.w},${b.h}`)).size).toBe(1);
    expect(stageLlm(c)).toMatch(/salt \(bad: dropped: optional, from now on\)/);
  });
  test("keep on other card words is refused; keep mark on a card with no tokens says so", () => {
    expect(msgs(scene(`## A\nfarm q: recipe\n@step One: x\nkeep mark q salt: bad\n@step Two: y`))).toMatch(/keep mark/);
  });
});
describe("spacing: roomy under a record card: its rows spaced wider", () => {
  test("each row is 9 px taller, its words in the middle; values and columns as before", () => {
    const src = (sp: string) => `## A\nfarm r: plan\n  keys: Name; Kind; Owner\n${sp}@step One: x\nfill r Name: alpha\n@step Two: y`;
    const a = scene(src("")), b = scene(src("  spacing: roomy\n")); expect(msgs(a)).toBe(""); expect(msgs(b)).toBe("");
    const pa = layoutStage(a.model, 1000), pb = layoutStage(b.model, 1000);
    expect(box(pb.items, "r").h - box(pa.items, "r").h).toBe(27);
    const ya = (pa.items.filter((i) => i.k === "text" && (i as any).s === "Kind") as any[])[0].y, yb = (pb.items.filter((i) => i.k === "text" && (i as any).s === "Kind") as any[])[0].y;
    expect(yb - ya).toBe(9 + 4.5); // one roomy row above it, and half the gap
    expect(b.model.cards.get("r")!.keys).toEqual(["Name", "Kind", "Owner"]);
  });
  test("the old 'keys roomy:' says the new word; another spacing is refused", () => {
    expect(msgs(scene(`## A\nfarm r: plan\n  keys roomy: Name\n@step One: x\n@step Two: y`))).toMatch(/say "spacing: roomy" under the card instead/);
    expect(msgs(scene(`## A\nfarm r: plan\n  keys: Name\n  spacing: tight\n@step One: x\n@step Two: y`))).toMatch(/spacing: roomy/);
  });
});
describe("a headline line, connectors from a pill, a toned label", () => {
  const SRC = `## Farms\nfarm t: three farms\n  pill f1,f2,f3: farm-1; farm-2; farm-3\n## Sheds\nshelf a: shed a\nshelf b: shed b\n## Hall\ngate m: market hall | ** 318 crates | counted at noon\n@step One: x\nf1 --> a\nf3 --> b\n@step Two: y\nb --> m (bad): dropped`;
  test("'** words' is big and centred in the card's colour; the card is tall enough for it", () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), mb = box(p.items, "m"), h = (p.items.filter((i) => i.k === "text") as any[]).find((t) => t.s === "318 crates");
    expect(h.f).toBe("big"); expect(h.anchor).toBe("middle"); expect(h.x).toBeCloseTo(mb.x + mb.w / 2, 0); expect(h.ink).toBe("role:gate:ink");
    expect(h.y).toBeLessThan(mb.y + mb.h); expect(h.y - 21).toBeGreaterThan(mb.y);
    expect(stageLlm(c)).toMatch(/318 crates/); expect(stageLlm(c)).not.toMatch(/\*\*/);
  });
  for (const w of [1000, 340]) test(`a connector from a pill leaves its card at that pill (${w})`, () => {
    const c = scene(SRC), p = layoutStage(c.model, w);
    const pill = (id: string) => boxes(p.items).find((b) => b.id?.startsWith(`pill:${id}@`))!;
    const line = (id: string) => p.items.find((i) => i.k === "path" && (i as any).id === id) as any;
    for (const [pid, eid] of [["f1", "t>a"], ["f3", "t>b"]] as const) {
      const [x0, y0] = line(eid).pts[0], pr = pill(pid);
      const level = y0 >= pr.y - 0.5 && y0 <= pr.y + pr.h + 0.5, under = x0 >= pr.x - 0.5 && x0 <= pr.x + pr.w + 0.5;
      expect(level || under).toBe(true);
    }
    expect(stageLlm(c)).toMatch(/farm-1 \(on three farms\) to shed a/);
  });
  test("a label in a tone is plain words in that tone, not a chip", () => {
    const p = layoutStage(scene(SRC).model, 1000);
    expect(boxes(p.items).some((b) => b.bar?.["edge-label"] === "dropped")).toBe(false);
    const t = (p.items.filter((i) => i.k === "text") as any[]).find((x) => x.s === "dropped");
    expect(t.ink).toBe("bad:ink"); expect(t.f).toBe("title"); // the label size, large
  });
});
describe("a connector from a card inside a card leaves that card, level with it (its own edge)", () => {
  const SRC = `## Pens\nfarm t: pens\n  farm p1: pen-1\n  farm p2: pen-2\n  farm p3: pen-3\n## Sheds\nshelf a: shed a\nshelf b: shed b\n@step One: x\np1 --> a\np3 --> b\n@step Two: y`;
  test("wide: the line starts on the inner card's own edge at its height", () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), t = box(p.items, "t");
    for (const [kid, eid] of [["p1", "t>a"], ["p3", "t>b"]] as const) {
      const k = box(p.items, kid), [x0, y0] = (p.items.find((i) => i.k === "path" && (i as any).id === eid) as any).pts[0];
      expect(Math.abs(x0 - (k.x + k.w))).toBeLessThan(1); expect(x0).toBeLessThan(t.x + t.w); expect(y0).toBeGreaterThanOrEqual(k.y); expect(y0).toBeLessThanOrEqual(k.y + k.h);
    }
  });
});
describe("a connector written again while it still shows: one line, new words", () => {
  const SRC = `## A\nfarm a: shed a\nfarm b: shed b\n## B\nshelf m: market\n@step One: x\na --> m\nb --> m\n@step Two: y\n@step Three: z\nb --> m (bad): dropped`;
  for (const w of [1000, 340]) test(`no second b>m line; 'dropped' from step 3 beside the one line (${w})`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w), lines = p.items.filter((i) => i.k === "path" && (i as any).id === "b>m");
    expect(lines.length).toBe(1);
    const t = (p.items.filter((i) => i.k === "text") as any[]).find((x) => x.s === "dropped");
    expect(t.ink).toBe("bad:ink"); expect(shownAt(t, 2)).toBe(false); expect(shownAt(t, 3)).toBe(true);
  });
  test("after a clear, the same connector is drawn again (a new line)", () => {
    const c = scene(`## A\nfarm a: shed a\n## B\nshelf m: market\n@step One: x\na -> m\n@step Two: y\nclear\na -> m: again`);
    expect(layoutStage(c.model, 1000).items.filter((i) => i.k === "path" && (i as any).id === "a>m").length).toBe(2);
  });
  test("on a phone a '** words' headline takes the title size (no taller than a title line), 11 px or more", () => {
    const src = (h: string) => `## A\nfarm a: shed a | ${h}318 crates\n## B\nfarm b: shed b\n@step One: x\n@step Two: y`;
    const ph = layoutStage(scene(src("** ")).model, 340), pl = layoutStage(scene(src("* ")).model, 340);
    const t = (ph.items.filter((i) => i.k === "text") as any[]).find((x) => x.s === "318 crates");
    expect(t.f).toBe("title"); expect(FONT.title.size).toBeGreaterThanOrEqual(11);
    expect(box(ph.items, "a").h - box(pl.items, "a").h).toBeLessThanOrEqual(LINE_H.title - LINE_H.sub);
  });
});
describe("'+ (a)': a letter chip in the title row, no row of its own", () => {
  const src = (tag: string) => `## A\nfarm r: barrow a | one wheel\n${tag}farm s: barrow b | one wheel\n@step One: x\n@step Two: y`;
  for (const w of [1000, 340]) test(`the card is no taller; the chip sits before the title on its row, kind chip (${w})`, () => {
    const c = scene(src("  + (a)\n")); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w), q = layoutStage(scene(src("")).model, w), r = box(p.items, "r");
    expect(r.h).toBe(box(q.items, "r").h);
    const t = boxes(p.items).find((b) => b.cls === "stg-tag")!;
    expect(t.bar).toEqual({ kind: "chip", label: "a" });
    expect(t.x).toBeGreaterThanOrEqual(r.x + 6); expect(t.x).toBeLessThan(r.x + 20); expect(t.y).toBeLessThan(r.y + 20);
    const title = (p.items.filter((i) => i.k === "text") as any[]).find((x) => x.s.startsWith("barrow a"));
    expect(title.x).toBeGreaterThanOrEqual(t.x + t.w + 4); expect(title.x + measure(title.s, title.f)).toBeLessThanOrEqual(r.x + r.w - 6); expect(title.y - 12).toBeLessThan(t.y + t.h); expect(title.y).toBeGreaterThan(t.y);
    expect(p.items.some((i) => i.k === "badge" && (i as any).s === "a")).toBe(true);
  });
  test("two on one card are refused", () => {
    expect(msgs(scene(`## A\nfarm r: barrow a\n  + (a)\n  + (b)\n@step One: x\n@step Two: y`))).toMatch(/one title-row letter chip/);
  });
});
describe("a toned label stays beside its own line", () => {
  test("its words touch the line, about mid-way, and sit on no card", () => {
    const c = scene(`## A\nfarm a: shed a\nfarm b: shed b\n## B\nshelf m: market hall | ** 318\n@step One: x\na --> m\nb --> m\n@step Two: y\nb --> m (bad): dropped`); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), line = p.items.find((i) => i.k === "path" && (i as any).id === "b>m") as any;
    const t = (p.items.filter((i) => i.k === "text") as any[]).find((x) => x.s === "dropped"), w = measure("dropped", "title");
    const x0 = t.anchor === "middle" ? t.x - w / 2 : t.x, bx = { x: x0, y: t.y - 12, w, h: 16 };
    const near = (px: number, py: number) => Math.max(bx.x - px, 0, px - (bx.x + bx.w)) + Math.max(bx.y - py, 0, py - (bx.y + bx.h));
    let best = 1e9; const pts = line.pts as [number, number][]; for (let i = 1; i < pts.length; i++) for (let u = 0; u <= 1; u += 0.02) best = Math.min(best, near(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u));
    expect(best).toBeLessThanOrEqual(8);
    const [sx] = pts[0], [ex] = pts.at(-1)!; expect(Math.abs(bx.x + bx.w / 2 - (sx + ex) / 2)).toBeLessThanOrEqual(Math.abs(ex - sx) * 0.3); // about mid-way
    for (const k of boxes(p.items).filter((b) => b.bar?.kind === "card")) expect(bx.x + bx.w <= k.x || k.x + k.w <= bx.x || bx.y + bx.h <= k.y || k.y + k.h <= bx.y).toBe(true);
  });
});
describe("a plain label of one line stands on that line (desktop)", () => {
  test("each of two arrows into one card carries its own label on its own line, near the middle", () => {
    const c = scene(`## Farms\nfarm a: hill farm\nfarm b: river farm\n## Market\nshelf m: market hall\nshelf n: corner stall\n@step One: x\na -> m: 30 crates\nb -> m: 30 crates\n@step Two: y`); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), chips = boxes(p.items).filter((b) => b.bar?.["edge-label"] === "30 crates");
    expect(chips.length).toBe(2);
    for (const id of ["a>m", "b>m"]) {
      const ln = p.items.find((i) => i.k === "path" && (i as any).id === id) as any, pts = ln.pts as [number, number][];
      const mid = [(pts[0][0] + pts.at(-1)![0]) / 2, (pts[0][1] + pts.at(-1)![1]) / 2];
      const on = chips.filter((k) => { for (let i = 1; i < pts.length; i++) for (let u = 0; u <= 1; u += 0.02) { const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u; if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return true; } return false; });
      expect(on.length).toBe(1);
      expect(Math.abs(on[0].x + on[0].w / 2 - mid[0])).toBeLessThan((pts.at(-1)![0] - pts[0][0]) * 0.25 + 1);
    }
  });
});
describe("'** words' works in any card, a card inside a card too", () => {
  for (const w of [1000, 340]) test(`inner cards draw their headline big and centred, inside their own box (${w})`, () => {
    const c = scene("## A\nshelf v: the vote | ** big outer\n  farm e1: one hall | ** north hall\n  farm e2: two hall | ** the root\n## B\nshelf z: other\n@step One: x\ne1 -> z\n@step Two: y"); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w), t = p.items.filter((i) => i.k === "text") as any[];
    for (const [s, id] of [["north hall", "e1"], ["the root", "e2"], ["big outer", "v"]]) {
      const x = t.find((i) => i.s === s); expect(x).toBeTruthy(); expect(x.anchor).toBe("middle"); expect(["big", "title"]).toContain(x.f);
      const b = box(p.items, id); expect(x.x).toBeGreaterThan(b.x); expect(x.x).toBeLessThan(b.x + b.w); expect(x.y).toBeGreaterThan(b.y); expect(x.y).toBeLessThan(b.y + b.h);
      expect(Math.abs(x.x - (b.x + b.w / 2))).toBeLessThan(2);
      expect(measure(s, x.f)).toBeLessThanOrEqual(b.w);
    }
    expect(t.some((i) => /\*\*/.test(i.s))).toBe(false);
  });
});
describe("'ends: on this card' under a holder card", () => {
  const src = (opt: string) => `## Left\nshelf d: the depot | two bins inside\n${opt}  farm pa: bin A | apples\n  farm pb: bin B | pears\n## Right\ngate l1: gate one\ngate l2: gate two\n@step One: x\npa --> l1\npb --> l2\n@step Two: y`;
  const ends = (opt: string) => {
    const c = scene(src(opt)); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), d = box(p.items, "d"), out: Record<string, { s: [number, number]; r: any }> = {};
    for (const [id, k] of [["d>l1", "pa"], ["d>l2", "pb"]]) out[k] = { s: (p.items.find((i) => i.k === "path" && (i as any).id === id) as any).pts[0], r: box(p.items, k) };
    return { d, out };
  };
  test("by default an arrow from an inner card starts on that card's own edge", () => {
    const { d, out } = ends("");
    for (const { s, r } of Object.values(out)) { expect(Math.abs(s[0] - (r.x + r.w))).toBeLessThan(1.5); expect(s[0]).toBeLessThan(d.x + d.w - 1); }
  });
  test("with 'ends: on this card' it starts on the holder's edge, level with the inner card", () => {
    const { d, out } = ends("  ends: on this card\n");
    for (const { s, r } of Object.values(out)) { expect(Math.abs(s[0] - (d.x + d.w))).toBeLessThan(1.5); expect(Math.abs(s[1] - (r.y + r.h / 2))).toBeLessThan(1.5); }
  });
  test("other words are refused with the form to write", () => {
    expect(msgs(scene(src("  ends: here\n")))).toMatch(/"ends: on this card"/);
  });
});
describe("a toned label keeps clear of its arrowhead and target", () => {
  const SRC5 = `## A\nfarm a: shed a\nfarm b: shed b\n## B\nshelf m: market hall | ** 318\n@step One: x\na --> m\nb --> m\n@step Two: y\nb --> m (bad): dropped`;
  const lab = (p: any) => (p.items.filter((i: any) => i.k === "text") as any[]).find((x) => x.s === "dropped");
  test("wide: 6 px or more off the target box, 12 px or more off the arrowhead", () => {
    const c = scene(SRC5), p = layoutStage(c.model, 1000), t = lab(p), lw = measure("dropped", "title"), m = box(p.items, "m");
    const x0 = t.anchor === "middle" ? t.x - lw / 2 : t.x, bx = { x: x0, y: t.y - 12, w: lw, h: 16 };
    const tip = (p.items.find((i: any) => i.k === "path" && i.id === "b>m") as any).pts.at(-1);
    expect(bx.x + bx.w).toBeLessThanOrEqual(m.x - 8 + 0.5);
    expect(Math.max(bx.x - tip[0], 0, tip[0] - (bx.x + bx.w)) + Math.max(bx.y - tip[1], 0, tip[1] - (bx.y + bx.h))).toBeGreaterThanOrEqual(12);
  });
  test("phone: the words stand beside the vertical line, not across it, in the label size", () => {
    const c = scene(SRC5), p = layoutStage(c.model, 340) as any, n = p.narrow && p.narrow.items ? p.narrow : p, t = lab(n);
    expect(t.f).toBe("title");
    const ln = n.items.find((i: any) => i.k === "path" && i.id === "b>m" && (!i.on || i.on.includes(2))), lw = measure("dropped", "title");
    const x0 = t.anchor === "middle" ? t.x - lw / 2 : t.anchor === "end" ? t.x - lw : t.x;
    for (let i = 1; i < ln.pts.length; i++) { const [a, b] = [ln.pts[i - 1], ln.pts[i]]; if (Math.abs(a[0] - b[0]) < 1 && Math.min(a[1], b[1]) < t.y && Math.max(a[1], b[1]) > t.y - 12) expect(a[0] < x0 - 3 || a[0] > x0 + lw + 3).toBe(true); }
  });
});
describe("a card line '(tone) words' or '(role) words' in that ink", () => {
  test("the line's words in the tone's ink without the bracket; the rest of the card unchanged", () => {
    const c = scene("## A\nshelf j: the jobs | (good) job one runs | (bad) no job label | plain line | (farm) a farm line\n@step One: x\n@step Two: y\ntext j: title | (warn) now late"); expect(msgs(c)).toBe("");
    for (const w of [1000, 340]) {
      const t = layoutStage(c.model, w).items.filter((i) => i.k === "text") as any[];
      const ink = (s: string) => t.find((x) => x.s === s)?.ink;
      expect(ink("job one runs")).toBe("good:ink"); expect(ink("no job label")).toBe("bad:ink"); expect(ink("plain line")).toBe("muted"); expect(ink("a farm line")).toBe("role:farm:ink"); expect(ink("now late")).toBe("warn:ink");
      expect(t.some((x) => /^\(/.test(x.s))).toBe(false);
    }
    expect(stageLlm(c)).not.toMatch(/\((good|bad|warn)\)/);
  });
  test("an unknown tone is refused with the forms to write, on the card and in a step", () => {
    expect(msgs(scene("## A\nshelf j: the jobs | (great) yes\n@step One: x\n@step Two: y"))).toMatch(/"\(great\)" is not a tone or a role of this page/);
    expect(msgs(scene("## A\nshelf j: the jobs\n@step One: x\ntext j: t | (great) yes\n@step Two: y"))).toMatch(/\(good\), \(bad\), \(warn\), \(accent\)/);
  });
});
describe("a record key longer than its column on a phone wraps whole words inside it", () => {
  const SRC = "## A\nshelf r: the sums\n  keys: Name; sum of the apples sold over the week by shed; Total\n@step One: x\nfill r Name, sum of the apples sold over the week by shed, Total: east; 318; 9\n@step Two: y";
  for (const w of [390, 360]) test(`at ${w}: the key's lines stay in its column, every word whole, the row as tall as the key`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w) as any, n = p.narrow && p.narrow.items ? p.narrow : p, t = n.items.filter((i: any) => i.k === "text") as any[];
    const key = "sum of the apples sold over the week by shed", parts = t.filter((x) => x.tip === key);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((x) => x.s).join(" ")).toBe(key);
    const val = t.find((x) => x.s === "318"), kx = parts[0].x;
    for (const x of parts) { expect(x.x).toBe(kx); expect(x.x + measure(x.s, x.f)).toBeLessThan(val.x); }
    const total = t.find((x) => x.s === "Total"); expect(total.y).toBeGreaterThan(Math.max(...parts.map((x) => x.y)));
    expect(t.every((x) => x.f !== "small" && x.f !== "tiny")).toBe(true);
  });
});
describe("'dim' takes a card's pills by their ids: the pill faint, the card strong", () => {
  const SRC = "## A\nshelf m: packer two\n  pill o1,o2: out one; out two\n## B\nshelf z: other\n@step One: x\n@step Two: y\ndim o1, o2\n@step Three: z\ndim o2 off";
  for (const w of [1000, 340]) test(`at ${w}`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w) as any, items = (p.narrow && p.narrow.items ? p.narrow : p).items as any[];
    const pill = (id: string) => items.find((i) => i.k === "box" && typeof i.id === "string" && i.id.startsWith(`pill:${id}@`));
    expect(pill("o1").dim).toEqual([2, 3]); expect(pill("o2").dim).toEqual([2]);
    expect(box(items as any, "m").dim ?? []).toEqual([]);
  });
  test("the LLM view says the pill fades", () => {
    expect(stageLlm(scene(SRC))).toMatch(/the pill "out one" fades/);
  });
  test("an unknown id is still refused", () => {
    expect(msgs(scene("## A\nshelf m: packer\n  pill o1: out\n@step One: x\ndim o9\n@step Two: y"))).toMatch(/"o9" is not a card/);
  });
});
describe("'cross ids': a large X over a card from a step on", () => {
  const SRC = "## A\nfarm p1: pen one | down\nfarm p2: pen two\n@step One: x\n@step Two: y\ncross p1, p2\n@step Three: z\ncross p2 off";
  for (const w of [1000, 340]) test(`at ${w}: one X box per run over the card, inside it, the words kept`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w) as any, items = (p.narrow && p.narrow.items ? p.narrow : p).items as any[];
    const xs = items.filter((i) => i.k === "box" && i.cls === "stg-cross");
    expect(xs.length).toBe(2);
    for (const [id, from, to] of [["p1", 2, 0], ["p2", 2, 2]] as const) {
      const b = box(items as any, id), x = xs.find((q) => q.x > b.x && q.x < b.x + b.w && q.y > b.y && q.y < b.y + b.h)!;
      expect(x).toBeTruthy(); expect(x.from).toBe(from); expect(x.to).toBe(to);
      expect(x.x + x.w).toBeLessThanOrEqual(b.x + b.w); expect(x.y + x.h).toBeLessThanOrEqual(b.y + b.h); expect(x.bar).toBeUndefined();
    }
    expect(items.some((i) => i.k === "text" && i.s === "pen one")).toBe(true);
  });
  test("the LLM view says so; an unknown id is refused", () => {
    const t = stageLlm(scene(SRC)); expect(t).toMatch(/pen one is crossed out/); expect(t).toMatch(/pen two is no longer crossed out/);
    expect(msgs(scene("## A\nfarm p1: pen\n@step One: x\ncross p9\n@step Two: y"))).toMatch(/"p9" is not a card/);
  });
});
describe("phone: a short level arrow's label keeps 14 px off the other lines shown with it (picture check, bike shop)", () => {
  test("'two wheels' under the gap between two cards side by side does not sit by the fitter -> rider line", () => {
    const c = scene("## Store\nshelf p: parts shelf | wheels\n## Bench\ntool f: fitter | one bench\n## Door\ngate c: rider\n@step Parts: x\np -> f: two wheels\n@step Ride: y\nf -> c: one bike"); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 356) as any, n = p.narrow && p.narrow.items ? p.narrow : p, it = n.items as any[];
    const lab = it.find((i) => i.k === "box" && i.bar?.["edge-label"] === "two wheels"), other = it.find((i) => i.k === "path" && i.id === "f>c");
    expect(lab && other).toBeTruthy();
    const st = (i: any) => (i.on ?? [i.from ?? 1]); if (!st(lab).some((k: number) => st(other).includes(k))) { expect(st(lab)).toEqual([1]); return; } // a data label speaks in its own step: never shown with the step-2 line
    for (let i = 1; i < other.pts.length; i++) { const [a, b] = [other.pts[i - 1], other.pts[i]]; const d = Math.max(lab.x - Math.max(a[0], b[0]), 0, Math.min(a[0], b[0]) - (lab.x + lab.w)) + Math.max(lab.y - Math.max(a[1], b[1]), 0, Math.min(a[1], b[1]) - (lab.y + lab.h)); expect(d).toBeGreaterThanOrEqual(14); }
  });
});
describe("'cross ids corner': the original's big bold x in the card's top-right corner", () => {
  const SRC = (t: string) => `## A\nfarm ra: barrow a with a rather long title | one wheel\nfarm rb: barrow b\n@step One: x\n@step Two: y\n${t}\n@step Three: z\ncross ra corner off`;
  for (const w of [1000, 340]) test(`at ${w}: a 26 px x in the top-right corner, the title never under it, nothing moves`, () => {
    const c = scene(SRC("cross ra corner")); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w) as any, items = (p.narrow && p.narrow.items ? p.narrow : p).items as any[], r = box(items as any, "ra");
    const x = items.find((i) => i.k === "box" && i.cls === "stg-cross-corner");
    expect(x).toBeTruthy(); expect(x.from).toBe(2); expect(x.to).toBe(2); expect(x.w).toBe(26); expect(x.h).toBe(26); expect(x.bar).toBeUndefined();
    expect(x.x + x.w).toBeLessThanOrEqual(r.x + r.w - 6 + 0.01); expect(x.y).toBeGreaterThanOrEqual(r.y); expect(x.y).toBeLessThan(r.y + 10);
    for (const t of items.filter((i) => i.k === "text" && i.f === "title" && i.y < x.y + x.h && i.x >= r.x && i.x < r.x + r.w)) expect(t.x + measure(t.s, t.f)).toBeLessThanOrEqual(x.x);
    // the same card place with and without the mark at that step: nothing moves
    const q = layoutStage(scene(SRC("cross ra")).model, w) as any, qi = (q.narrow && q.narrow.items ? q.narrow : q).items;
    expect(items.filter((i) => i.k === "box" && i.bar?.kind === "card").map((b) => [b.x, b.y])).toEqual(qi.filter((i: any) => i.k === "box" && i.bar?.kind === "card").map((b: any) => [b.x, b.y]));
  });
  test("the LLM view says so", () => { expect(stageLlm(scene(SRC("cross ra corner")))).toMatch(/is crossed out/); });
});

// a refusal card ("tone b bad") writes its filled values in the tone's ink, not the plain ink
describe("a toned card's values take the tone's ink", () => {
  test("values filled while the card is toned bad are bad:ink; on an untoned card they stay ink; '...' stays muted", () => {
    const c = scene(`## _\ntool r: the plan\n  keys: A; B\ntool x: refusals\n  keys: Q\n@step One: plan\nfill r A: ok\n@step Two: refuse\ntone x bad\nfill x Q: unsupported`);
    expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), t = (s: string) => p.items.find((i) => i.k === "text" && (i as any).s === s) as any;
    expect(t("unsupported").ink).toBe("bad:ink");
    expect(t("ok").ink).toBe("ink");
    expect(t("...").ink).toBe("muted");
  });
});
describe("a long record key on a wide card is never cut", () => {
  test("it gets a wider column (up to 45%) and wraps whole words; no '...'", () => {
    const key = "sum(pick(a[2d])) / sum(pick(b[2d])) over every field and season";
    const c = scene(`## A\nshelf r: what it turns away\n  keys: ${key}; Total\n@step One: x\nfill r ${key}, Total: 0.93; 9\n@step Two: y`); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1280), t = p.items.filter((i) => i.k === "text") as any[];
    const parts = t.filter((x) => x.tip === key);
    expect(parts.map((x) => x.s).join(" ")).toBe(key);
    expect(t.some((x) => /…|\.\.\./.test(x.s) && x.tip === key)).toBe(false);
    const val = t.find((x) => x.s === "0.93"); for (const x of parts) expect(x.x + measure(x.s, x.f)).toBeLessThan(val.x);
  });
});
describe("a toned label is large and centred in the free gap", () => {
  test("title size, its middle within 4 px of the gap's middle between the two cards", () => {
    const c = scene(`## A\nfarm b: shed b\n## B\nshelf m: market hall | ** 318\n@step One: x\nb --> m\n@step Two: y\nb --> m (bad): dropped`); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), t = (p.items.filter((i) => i.k === "text") as any[]).find((x) => x.s === "dropped");
    const b = box(p.items, "b"), m = box(p.items, "m");
    expect(t.f).toBe("title"); expect(t.anchor).toBe("middle");
    expect(Math.abs(t.x - (b.x + b.w + m.x) / 2)).toBeLessThanOrEqual(4);
  });
});
describe("a toned label between two cards sits BELOW its line", () => {
  for (const tgt of ["shelf m: market hall | ** 318", "shelf m: hall"]) test(`below the line, 8 px or more off the arrowhead, on no card (${tgt.slice(9, 20)})`, () => {
    const c = scene(`## A\nfarm b: shed b | some words\n## B\n${tgt}\n@step One: x\nb --> m\n@step Two: y\nb --> m (bad): dropped`); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), t = (p.items.filter((i) => i.k === "text") as any[]).find((x) => x.s === "dropped"), lw = measure("dropped", t.f);
    const bx = { x: t.x - lw / 2, y: t.y - 14, w: lw, h: 18 }, ln = p.items.find((i: any) => i.k === "path" && i.id === "b>m") as any, pts = ln.pts as [number, number][];
    const a = pts[0], b = pts.at(-1)!, yAt = (x: number) => a[1] + ((b[1] - a[1]) / (b[0] - a[0])) * (x - a[0]);
    const cx = Math.max(Math.min(t.x, Math.max(a[0], b[0])), Math.min(a[0], b[0]));
    expect(bx.y).toBeGreaterThanOrEqual(yAt(cx));
    expect(Math.max(bx.x - b[0], 0, b[0] - (bx.x + bx.w)) + Math.max(bx.y - b[1], 0, b[1] - (bx.y + bx.h))).toBeGreaterThanOrEqual(8);
    for (const k of boxes(p.items).filter((q) => q.bar?.kind === "card")) expect(bx.x + bx.w <= k.x || k.x + k.w <= bx.x || bx.y + bx.h <= k.y || k.y + k.h <= bx.y).toBe(true);
  });
});
describe("a record value on a phone wraps whole, no '…'", () => {
  for (const w of [390, 360]) test(`at ${w}`, () => {
    const v = "refused because the rule wants every field to report a full season before it moves the keeper";
    const c = scene(`## A\nshelf r: what it turns away\n  keys: Why; Total\n@step One: x\nfill r Why, Total: ${v}; 9\n@step Two: y`); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w) as any, n = p.narrow && p.narrow.items ? p.narrow : p, t = n.items.filter((i: any) => i.k === "text") as any[];
    const parts = t.filter((x) => v.includes(x.s) && x.s.length > 2 && x.x > 40);
    expect(parts.map((x) => x.s).join(" ")).toBe(v);
    expect(t.some((x) => /…/.test(x.s))).toBe(false);
  });
});
describe("card lines take the panel prefixes, one meaning per spelling", () => {
  const SRC = "## A\nshelf y: ledger | . sorted 318 · packed · cool | pickers: | > baskets: 2 | > harvest: | > > toBaskets: 3 | ~ the same rows as at the swap | = in the card's colour\n@step One: x\n@step Two: y";
  for (const w of [1000, 340]) test(`at ${w}: '. ' body plain ink, '> ' indents (repeatable), '~ ' small muted, '= ' body in the card's colour`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w) as any, items = (p.narrow && p.narrow.items ? p.narrow : p).items as any[], t = (s: string) => items.find((i) => i.k === "text" && i.s === s);
    expect(t("sorted 318 · packed · cool")).toMatchObject({ f: "body", ink: "ink" });
    const base = t("pickers:").x;
    expect(t("baskets: 2").x).toBe(base + 14); expect(t("harvest:").x).toBe(base + 14); expect(t("toBaskets: 3").x).toBe(base + 28);
    expect(t("the same rows as at the swap")).toMatchObject({ f: "sub", ink: "muted" });
    expect(t("in the card's colour")).toMatchObject({ f: "body", ink: "role:shelf:ink" });
    expect(items.some((i) => i.k === "text" && /^(> |~ |\. |= )/.test(i.s))).toBe(false);
  });
  test("the LLM view reads the words without the marks", () => {
    const llm = stageLlm(scene(SRC)); expect(llm).toMatch(/toBaskets: 3/); expect(llm).not.toMatch(/> >|~ the|\. sorted/);
  });
});
describe("a plain text card with a headline centres its lines as one group", () => {
  test("in a taller row the headline and its lines are centred across the card and in the free height", () => {
    const c = scene("## A\nfarm a: shed | one | two | three | four | five | six\n## B\nshelf m: the packer | packs one crate | ** 318 | sealed at the door\n@step One: x\n@step Two: y"); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, 1000), m = box(p.items, "m"), t = (s: string) => (p.items as any[]).find((i) => i.k === "text" && i.s === s);
    for (const s of ["packs one crate", "318", "sealed at the door"]) { expect(t(s).anchor).toBe("middle"); expect(Math.abs(t(s).x - (m.x + m.w / 2))).toBeLessThan(1); }
    const title = t("the packer"), top = title.y, bot = m.y + m.h, first = t("packs one crate").y - 12, last = t("sealed at the door").y + 4;
    expect(Math.abs((first - top) - (bot - 8 - last))).toBeLessThanOrEqual(16);
  });
  test("a card without a headline keeps its lines at the top left", () => {
    const c = scene("## A\nfarm a: shed | one | two | three | four | five | six\n## B\nshelf m: the packer | packs one crate\n@step One: x\n@step Two: y");
    const p = layoutStage(c.model, 1000), x = (p.items as any[]).find((i) => i.k === "text" && i.s === "packs one crate");
    expect(x.anchor).toBeUndefined();
  });
});
describe("'badges: stacked' and a connector end at a badge", () => {
  const SRC = `## Pens\nfarm t: a shed's crates | the same rows\n  + (1) crate-1 :north; (2) crate-2 :south; (3) crate-3 :east\n  badges: stacked\n## Sheds\nshelf a: shed a\nshelf b: shed b\n@step One: x\nt.1 --> a\nt.3 --> b\n@step Two: y`;
  const badge = (items: Item[], id: string) => boxes(items).find((b) => b.id === id)!;
  for (const w of [1000, 340]) test(`the badges stand one per row, top to bottom, each the card's width (${w})`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w), t = box(p.items, "t"), bs = ["1", "2", "3"].map((k) => badge(p.items, `badge:t.${k}`));
    for (const b of bs) { expect(b.x).toBeCloseTo(t.x + 6, 0); expect(b.w).toBeCloseTo(t.w - 12, 0); expect(b.y + b.h).toBeLessThanOrEqual(t.y + t.h); expect(b.bar?.kind).toBe("card"); }
    expect(bs[1].y).toBeGreaterThan(bs[0].y + bs[0].h - 0.5); expect(bs[2].y).toBeGreaterThan(bs[1].y + bs[1].h - 0.5);
  });
  for (const w of [1000, 340]) test(`'t.1 --> a' leaves the card level with badge (1), or under it (${w})`, () => {
    const p = layoutStage(scene(SRC).model, w);
    for (const [k, eid] of [["1", "t>a"], ["3", "t>b"]] as const) {
      const [x0, y0] = (p.items.find((i) => i.k === "path" && (i as any).id === eid) as any).pts[0], br = badge(p.items, `badge:t.${k}`);
      const level = y0 >= br.y - 0.5 && y0 <= br.y + br.h + 0.5, under = x0 >= br.x - 0.5 && x0 <= br.x + br.w + 0.5;
      expect(level || under).toBe(true);
    }
  });
  test("the two ends leave at different heights on the wide stage, and the LLM view names the badge", () => {
    const c = scene(SRC), p = layoutStage(c.model, 1000), y = (eid: string) => (p.items.find((i) => i.k === "path" && (i as any).id === eid) as any).pts[0][1];
    expect(y("t>b") - y("t>a")).toBeGreaterThan(20);
    expect(stageLlm(c)).toMatch(/crate-1 :north \(on a shed's crates\) to shed a/);
  });
  test("without the line the badges keep one row when they fit", () => {
    const p = layoutStage(scene(SRC.replace("\n  badges: stacked", "")).model, 1000), bs = ["1", "2", "3"].map((k) => badge(p.items, `badge:t.${k}`));
    expect(bs[0].y).toBeCloseTo(bs[2].y, 0);
  });
  test("refusals: another badges word, no badges, a letter the card lacks", () => {
    expect(msgs(scene(SRC.replace("badges: stacked", "badges: wide")))).toMatch(/"badges: stacked"/);
    expect(msgs(scene(`## A\nfarm t: shed\n  badges: stacked\n## B\nshelf a: x\n@step One: x\n@step Two: y`))).toMatch(/give it badges/);
    expect(msgs(scene(SRC.replace("t.3 --> b", "t.9 --> b")))).toMatch(/"t" has no badge \(9\): its badges are \(1\), \(2\), \(3\)/);
  });
  test("a card whose id has a dot is still that card", () => {
    const c = scene(`## A\nfarm t: shed\n  + (1) crate-1\nfarm t.1: lone crate\n## B\nshelf a: x\n@step One: x\nt.1 --> a\n@step Two: y`);
    expect(msgs(c)).toBe(""); expect(c.model.steps[0].edges[0]).toMatchObject({ from: "t.1", to: "a" }); expect(c.model.steps[0].edges[0].fromPill).toBeUndefined();
  });
});
describe("'badges: stacked plain': the same rows, words only", () => {
  const SRC = `## Pens\nfarm t: a shed's crates | the same rows\n  + (1) crate-1 :north; (2) crate-2 :south; (3) crate-3 :east\n  badges: stacked plain\n## Sheds\nshelf a: shed a\nshelf b: shed b\n@step One: x\nt.1 --> a\nt.3 --> b\n@step Two: y`;
  for (const w of [1000, 340]) test(`no letter chip; the words start near the row's left edge; ends still leave at their rows (${w})`, () => {
    const c = scene(SRC); expect(msgs(c)).toBe("");
    const p = layoutStage(c.model, w), row = (k: string) => boxes(p.items).find((b) => b.id === `badge:t.${k}`)!;
    expect(p.items.some((i) => i.k === "badge" && ["1", "2", "3"].includes((i as any).s))).toBe(false);
    const word = (p.items as any[]).find((i) => i.k === "text" && i.s === "crate-1 :north"), r1 = row("1");
    expect(word.x - r1.x).toBeLessThan(12); expect(row("2").y).toBeGreaterThan(r1.y + r1.h - 0.5);
    for (const [k, eid] of [["1", "t>a"], ["3", "t>b"]] as const) {
      const [x0, y0] = (p.items.find((i) => i.k === "path" && (i as any).id === eid) as any).pts[0], br = row(k);
      expect((y0 >= br.y - 0.5 && y0 <= br.y + br.h + 0.5) || (x0 >= br.x - 0.5 && x0 <= br.x + br.w + 0.5)).toBe(true);
    }
  });
  test("the LLM view reads the rows' words, not their letters", () => {
    const l = stageLlm(scene(SRC));
    expect(l).toMatch(/\[crate-1 :north; crate-2 :south; crate-3 :east\]/); expect(l).toMatch(/crate-1 :north \(on a shed's crates\) to shed a/);
  });
  test("another word after 'stacked' is refused", () => {
    expect(msgs(scene(SRC.replace("stacked plain", "stacked bare")))).toMatch(/"badges: stacked plain"/);
  });
});
