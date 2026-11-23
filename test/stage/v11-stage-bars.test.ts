// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { FONT, measure, type Item } from "../../src/core/stage-core";
import { beginDocument, newBudget, BudgetError } from "../../src/core/stage-budget";
const roles = { server: 1, job: 2 };
const head = `bars 7 server: day of the week · cups ÷ the average | ×
  axis 0, 0.5, 1, 1.5
  line average: 1
  labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  tabs One: 1..3; Two: 4`;
const steps = [
  { title: "Busy: Friday.", raw: "values: 0.7 0.8 0.9 1.0 1.4 1.3 0.9\npeak: busiest 1.4×\nheading: cups by day | one week\nbig: 1.4× | busiest ÷ average", line: 10 },
  { title: "Cap: Two days over.", raw: "limit 1.2: cap 1.2×", line: 15 },
  { title: "Move: Hand orders over.", raw: "values: 0.9 0.9 0.9 1.0 1.2 1.2 0.9\nmove 2 from Fri to Mon; 1 from Sat to Tue", line: 17 },
  { title: "Two: Saturday.", raw: "values: 0.9 0.9 1.0 1.0 1.1 1.2 0.9\nlight Sat: the busiest", line: 20 },
];
const compile = (h = head, ss = steps) => compileStage(h, ss, 1, {}, roles);
beforeEach(() => beginDocument());
function bounded(items: Item[], w: number, h: number) {
  for (const it of items) {
    const pts = it.k === "path" ? it.pts : it.k === "text" ? (() => { const tw = measure(it.s, it.f), left = it.x - (it.anchor === "middle" ? tw / 2 : it.anchor === "end" ? tw : 0); expect(FONT[it.f].size).toBeGreaterThanOrEqual(11); return [[left, it.y - FONT[it.f].size], [left + tw, it.y]]; })() : it.k === "box" ? [[it.x, it.y], [it.x + it.w, it.y + it.h]] : [[it.x, it.y]];
    for (const [x, y] of pts) { expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); expect(x).toBeGreaterThanOrEqual(-0.01); expect(x).toBeLessThanOrEqual(w + 0.01); expect(y).toBeGreaterThanOrEqual(-0.01); expect(y).toBeLessThanOrEqual(h + 0.01); }
  }
}
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const barsAt = (items: Item[], k: number) => items.filter((i) => i.k === "box" && i.cls?.includes("stg-bar") && shownAt(i, k)) as Extract<Item, { k: "box" }>[];

test("parses bars and lists the facts per step", () => {
  const c = compile(); expect(c.errors).toEqual([]);
  const llm = stageLlm(c);
  for (const s of ["Bars: day of the week · cups ÷ the average (×), 7 bars, axis 0, 0.5, 1, 1.5.", "Line average at 1.", "Values: Mon 0.7, Tue 0.8", "Peak: busiest 1.4×.", "1.4×: busiest ÷ average.", "Limit 1.2: cap 1.2×.", "Moves: Fri to Mon (2), Sat to Tue (1).", "Lit bars: Sat 1.2 (lit: the busiest)."]) expect(llm).toContain(s);
});
for (const w of [1000, 340]) test(`bars lay out inside ${w} with every data mark at its true value`, () => {
  const plan = layoutStage(compile().model, w); bounded(plan.items, w, plan.h);
  const ax = plan.items.find((i) => i.bar?.kind === "axis")!; expect(ax.k).toBe("box");
  if (ax.k !== "box") return;
  const marks = plan.items.filter((i) => i.bar?.value !== undefined);
  expect(marks.length).toBeGreaterThanOrEqual(7 * 3 + 4);
  for (const m of marks) {
    if (m.k !== "path") continue;
    const want = ax.y + ax.h - (+m.bar!.value / +ax.bar!.max) * ax.h;
    expect(Math.abs(m.pts[0][1] - want)).toBeLessThan(0.001);
  }
  // one bar per day per step, each in its slot
  for (const k of [1, 2, 3, 4]) { const bs = barsAt(plan.items, k); expect(bs.length).toBe(7); expect(new Set(bs.map((b) => String(b.bar?.id).split(":")[1])).size).toBe(7); }
  // tones: the peak bad, the over-limit warn in the limit step, givers warn and takers good in the move step
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], idx = (d: string) => days.indexOf(d);
  const tone = (k: number, d: string) => barsAt(plan.items, k).find((b) => String(b.bar?.id).startsWith(`bar:${idx(d)}:`))!.fill.split(":")[0];
  expect(tone(1, "Fri")).toBe("bad"); expect(tone(2, "Sat")).toBe("warn"); expect(tone(3, "Mon")).toBe("good"); expect(tone(3, "Fri")).toBe("warn"); expect(tone(4, "Sat")).toBe("acc"); expect(tone(1, "Mon")).toBe("role");
  // the taker's growth as stacked blocks: 2 on Monday, 1 on Tuesday
  expect(plan.items.filter((i) => i.k === "box" && i.cls === "stg-block" && shownAt(i, 3)).length).toBe(3);
  // moves are arrows with edge hooks, shown in their step only
  const arrows = plan.items.filter((i) => i.k === "path" && i.arrow);
  expect(arrows.map((a) => [a.bar?.from, a.bar?.to, a.on])).toEqual([["bar:4:3", "bar:0:3", [3]], ["bar:5:3", "bar:1:3", [3]]]);
  // every arrow end names a bar shown in that step
  for (const a of arrows) for (const end of [a.bar!.from, a.bar!.to]) expect(barsAt(plan.items, 3).some((b) => b.id === end)).toBe(true);
  // reference lines are axis markers, not connectors
  expect(plan.items.filter((i) => i.k === "path" && i.id?.startsWith("marker:")).length).toBeGreaterThanOrEqual(3);
  // a bar's slot never moves: same x and width in every step
  const xs = new Map<string, string>();
  for (const b of plan.items) if (b.k === "box" && b.cls?.includes("stg-bar")) { const key = `${b.x},${b.w}`, id = String(b.bar!.id).split(":")[1]; if (xs.has(id)) expect(xs.get(id)).toBe(key); else xs.set(id, key); }
  // the limit shows from its step on
  const lim = plan.items.find((i) => i.k === "path" && i.id?.startsWith("marker:limit:"))!; expect([1, 2, 3, 4].map((k) => shownAt(lim, k))).toEqual([false, true, true, true]);
});
test("a still chart: values in the setup", () => {
  const c = compile("bars 3: x\nvalues: 1 2 3", []); expect(c.errors).toEqual([]);
  const plan = layoutStage(c.model, 600); bounded(plan.items, 600, plan.h); expect(stageLlm(c)).toContain("Values: 0 1, 1 2, 2 3.");
});
const refusals: [string, string[] | null, string][] = [
  ["bars 0: x", null, "1 to 64"], ["bars 65: x", null, "1 to 64"], ["bars two: x", null, "how many bars"], ["bars 3 a b: x", null, "how many bars"], ["bars 3 nobody: x", null, "not a role"],
  ["bars 3: x\n  axis 1, 0", null, "increasing"], ["bars 3: x\n  axis -1, 0", null, "increasing"], ["bars 3: x\n  axis", null, "increasing"], ["bars 3: x\n  axis 0\n  axis 1", null, "once"],
  ["bars 3: x\n  line avg", null, "reference line"], ["bars 3: x\n  line : 1", null, "reference line"], ["bars 3: x\n  line a: -1", null, "reference line"],
  ["bars 3: x\n" + Array.from({ length: 9 }, (_, i) => `  line l${i}: 1`).join("\n"), null, "at most 8"],
  ["bars 3: x\n  every 0", null, "every names"], ["bars 3: x\n  labels: a, b", null, "one label per bar"], ["bars 3: x\n  labels: a, a, b", null, "used twice"],
  ["bars 3: x\n  tabs A", null, "tabs lists"], ["bars 3: x\n  tabs A: 2..1", null, "tabs lists"], ["bars 3: x\n  tabs " + Array.from({ length: 7 }, (_, i) => `T${i}: 1`).join("; "), null, "at most 6 tabs"],
  ["bars 3: x\n  wobble", null, "under bars"],
  ["bars 3: x", ["values: 1 2"], "3 numbers"], ["bars 3: x", ["values: 1 2 -3"], "3 numbers"], ["bars 3: x", ["values: 1 2 x"], "3 numbers"], ["bars 3: x", ["values: 1 2 3\nvalues: 1 2 3"], "once a step"],
  ["bars 3: x", ["limit x: no"], "limit names"], ["bars 3: x", ["limit 1: a\nlimit 2: b"], "once a step"], ["bars 3: x", ["light 9: no"], "not a card"],
  ["bars 3: x", ["move 1 from 0 to 0"], "two different bars"], ["bars 3: x", ["move 0 to 1"], "a bar move is"], ["bars 3: x", ["move 1 from 0 to 9"], "a bar move is"], ["bars 3: x", ["move 0 -> 1 (2)"], "is now"], ["bars 3: x", ["move 0 from 0 to 1"], "count"], ["bars 3: x", ["move x from 0 to 1"], "count"], ["bars 3: x", ["move ;"], "a bar move is"],
  ["bars 3: x", ["move " + Array(17).fill("1 from 0 to 1").join("; ")], "at most 16"],
];
for (const [h, ops, match] of refusals) test(`refuses ${h.replaceAll("\n", " / ").slice(0, 80)}${ops ? " then " + ops.join(" / ").replaceAll("\n", " / ").slice(0, 60) : ""}`, () => {
  const c = compile(h, ops ? [{ title: "one", raw: ops[0], line: 20 }, { title: "two", raw: "", line: 22 }] : []);
  expect(c.errors.some((e) => e.msg.includes(match) && e.line > 0)).toBe(true);
});
test("hostile input: huge numbers, many values, a spent budget", () => {
  expect(compile("bars 3: x", [{ title: "a", raw: "values: 1 2 " + "9".repeat(400), line: 3 }, { title: "b", raw: "", line: 4 }]).errors.length).toBeGreaterThan(0);
  expect(compile("bars 64: x", [{ title: "a", raw: "values: " + Array(50000).fill(1).join(" "), line: 3 }, { title: "b", raw: "", line: 4 }]).errors.length).toBeGreaterThan(0);
  beginDocument(newBudget(100)); expect(() => compile("bars 3: " + "word ".repeat(400) + "\n  labels: " + "a,".repeat(300) + "b", [])).toThrow(BudgetError);
});
test("bars work doubles linearly with the steps", () => {
  const work = (n: number) => { const b = beginDocument(newBudget()), c = compile("bars 64: x", Array.from({ length: n }, (_, i) => ({ title: `s${i}`, raw: "values: " + Array.from({ length: 64 }, (_, j) => (i * 7 + j) % 13).join(" "), line: 3 + i }))); layoutStage(c.model, 1000); stageLlm(c); return 2_000_000 - b.left().work; };
  const a = work(20), b = work(40); expect(b).toBeGreaterThan(a * 1.6); expect(b).toBeLessThan(a * 2.3);
});
test("a move line that is not a bar move is left to another owner of the word when the stage says it is shared", () => {
  const c = compile(); const blk = (c.model as any).head.find((h: any) => h.block.word === "bars");
  const probs: string[] = [], ctx = { roles: new Set(Object.keys(roles)), problem: (_: number, m: string) => probs.push(m), ids: new Set<string>(), steps: 4 };
  expect(blk.block.op(blk.node, { word: "move", arg: "p1,p2 to w", body: [], line: 30, step: 2, shared: true }, ctx)).toBe(false);
  expect(probs).toEqual([]);
  blk.block.op(blk.node, { word: "move", arg: "p1,p2 to w", body: [], line: 30, step: 2 }, ctx);
  expect(probs.length).toBe(1);
});
test("a move is a low dashed curve: from the giver's top it comes in level to the taker's top corner on the giver's side, head pointing back", () => {
  const p = layoutStage(compile().model, 1000), B = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box");
  const bar = (i: number) => B.find((b) => b.id?.startsWith(`bar:${i}:`) && shownAt(b, 3))!;
  for (const [f, t] of [[4, 0], [5, 1]]) {
    const a = p.items.find((i) => i.id === `move:${f}:${t}:3`) as Extract<Item, { k: "path" }>;
    expect(a).toMatchObject({ dash: true, arrow: true }); expect(a.curve).toBeUndefined(); expect(a.pts.length).toBeGreaterThan(16); // smooth: many points, no corner rounding
    const [s0, e0] = [a.pts[0], a.pts.at(-1)!], pre = a.pts.at(-2)!, giver = bar(f), taker = bar(t);
    expect(Math.abs(s0[1] - giver.y)).toBeLessThan(6); expect(s0[0]).toBeGreaterThan(giver.x); expect(s0[0]).toBeLessThan(giver.x + giver.w); // starts on the giver's top
    expect(Math.abs(e0[0] - (taker.x + taker.w))).toBeLessThan(6); expect(Math.abs(e0[1] - taker.y)).toBeLessThan(6); // ends at the taker's top right corner
    expect(pre[0]).toBeGreaterThan(e0[0]); expect(Math.abs(pre[1] - e0[1])).toBeLessThan(Math.abs(pre[0] - e0[0]) * 0.2); // comes in level, from the right: the head points left
    expect(Math.max(...a.pts.map(([, y]) => y))).toBeLessThanOrEqual(e0[1] + 0.01); // runs low: no point above the giver's top, none below the end
    expect(Math.min(...a.pts.map(([, y]) => y))).toBeGreaterThanOrEqual(s0[1] - 0.01);
  }
});
test("'tone <bars> <tone>' in the head keeps those bars in that tone on every step, whatever their height; in a step from it on, 'off' undoes", () => {
  const h = head + "\n  tone Wed bad";
  const ss = [...steps.slice(0, 3), { ...steps[3], raw: steps[3].raw + "\ntone Mon warn\ntone Wed off" }];
  const c = compile(h, ss); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1000), B = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box");
  const fill = (i: number, k: number) => B.find((b) => b.id?.startsWith(`bar:${i}:`) && shownAt(b, k))!.fill;
  for (const k of [1, 2, 3]) expect(fill(2, k)).toBe("bad:line"); // Wed is never the highest, yet in the peak tone in every step
  expect(fill(2, 4)).toBe("role:server:line"); // off: back to its role
  expect(fill(0, 4)).toBe("warn:line"); expect(fill(0, 1)).toBe("role:server:line"); // a step's tone from its step on
  expect(fill(4, 1)).toBe("bad:line"); // the real peak keeps its tone; no extra line or words for the toned bar
  const plain = layoutStage(compile().model, 1000).items, ids = (its: Item[]) => its.filter((i) => i.k !== "box").map((i) => i.id ?? (i.k === "text" ? i.s : "")).sort();
  expect(ids(p.items)).toEqual(ids(plain)); // the tone adds no line or words: only paint
  for (const bad of ["tone Xyz bad", "tone Wed pink"]) expect(compile(head + "\n  " + bad).errors.some((e) => /tone <bars> good\|bad/.test(e.msg))).toBe(true);
});
// review: phone labels painted at 11 px or more, moves over the bars, a peak just under a limit
const crowded = [
  { title: "Peak: under the cap.", raw: "values: 0.7 0.8 0.9 1.0 1.19 1.0 0.9\npeak: busiest 1.19× (under the cap)\nlimit 1.2: cap 1.2×", line: 10 },
  { title: "Move: Hand orders over.", raw: "values: 0.9 0.9 0.9 1.0 1.05 1.1 0.9\nmove 2 from Fri to Mon; 1 from Sat to Tue", line: 15 },
];
const PHONE = require("../../src/core/stage-core").PHONE_FONT as Partial<Record<keyof typeof FONT, number>>;
const texts = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text");
test("on a phone (stages of 390 and 360 px screens) every bars word is painted at 11 px or more, unscaled", () => {
  const c = compile(head, crowded); expect(c.errors).toEqual([]);
  for (const w of [356, 326]) {
    const p = layoutStage(c.model, w);
    expect(p.phone).toBe(true); expect(p.w).toBe(w); // the plan is drawn at the stage's own width: CSS px = painted px
    for (const t of texts(p.items)) expect(PHONE[t.f] ?? FONT[t.f].size).toBeGreaterThanOrEqual(11);
  }
});
test("a peak's words keep one line when they fit and sit above a limit line just over the peak; line names a line apart", () => {
  const c = compile(head, crowded);
  for (const w of [1000, 356]) {
    const p = layoutStage(c.model, w), peakWords = texts(p.items).filter((t) => shownAt(t, 1) && (t.s.startsWith("busiest") || t.s.includes("under the cap")));
    expect(peakWords.map((t) => t.s)).toEqual(["busiest 1.19× (under the cap)"]);
    const lim = p.items.find((i) => i.id === "marker:limit:1.2") as Extract<Item, { k: "path" }>;
    expect(peakWords[0].y + 3).toBeLessThan(lim.pts[0][1]); // the words' foot is over the limit's line
    if (p.phone) {
      const cap = texts(p.items).find((t) => t.s === "cap 1.2×")!, avg = texts(p.items).find((t) => t.s === "average")!;
      expect(Math.abs(cap.y - avg.y)).toBeGreaterThanOrEqual(15);
    }
  }
});
test("a peak just under a limit: the peak dotted, the limit dashed and drawn over it, both shown", () => {
  const p = layoutStage(compile(head, crowded).model, 1000);
  const ix = (id: string) => p.items.findIndex((i) => i.id === id), peak = p.items[ix("marker:peak:1.19")] as Extract<Item, { k: "path" }>, lim = p.items[ix("marker:limit:1.2")] as Extract<Item, { k: "path" }>;
  expect(peak).toMatchObject({ dash: true, dot: true }); expect(lim.dash).toBe(true); expect(lim.dot).toBeUndefined();
  expect(ix("marker:limit:1.2")).toBeGreaterThan(ix("marker:peak:1.19"));
  expect(Math.abs(peak.pts[0][1] - lim.pts[0][1])).toBeLessThan(3); // nearly on one another: both must stay visible
  const tsx = require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8") as string;
  expect(tsx).toContain(`strokeDasharray: it.dot ? "0.1 4.5"`); expect(tsx).toContain(`strokeLinecap: it.dot ? "round"`);
});
test("a move's arrow is drawn over the bars: after them, on a surface band (ignored by the bar), with a large head", () => {
  const c = compile(head, crowded);
  for (const w of [1000, 356]) {
    const p = layoutStage(c.model, w), lastBar = Math.max(...p.items.flatMap((it, i) => (it.k === "box" && it.cls?.includes("stg-bar") ? [i] : [])));
    for (const id of ["move:4:0:2", "move:5:1:2"]) {
      const i = p.items.findIndex((it) => it.id === id), a = p.items[i] as Extract<Item, { k: "path" }>, band = p.items[i - 1] as Extract<Item, { k: "path" }>;
      expect(i).toBeGreaterThan(lastBar);
      expect(band).toMatchObject({ k: "path", ink: "surface", bar: { ignore: 1 } }); expect(band.pts).toEqual(a.pts); expect(band.w!).toBeGreaterThan(a.w! + 2);
      expect(a.head!).toBeGreaterThanOrEqual(p.phone ? 11 : 15);
    }
  }
});
