// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// stage faults found while rebuilding scenes (each test failed before its fix)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

const steps = (...raws: string[]) => raws.map((raw, i) => ({ title: `S${i + 1}: Step ${i + 1}.`, raw: raw + "\n", line: (i + 1) * 10 }));
const ROLES = { a: 1, b: 2, c: 3, d: 4 };
const lay = (head: string, ss: ReturnType<typeof steps>, w = 1180) => {
  const c = compileStage(head, ss, 1, {}, ROLES);
  expect(c.errors).toEqual([]);
  return { c, p: layoutStage(c.model, w) };
};
const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
beforeEach(() => beginDocument());

// 1. hide on a card inside a card
test("hide on a nested card takes it off the drawing from that step, like a top card", () => {
  const head = "title: Stores | x\n## Stores\na box: the stores\n  b one: first inner\n  c two: second inner\n";
  const { p } = lay(head, steps("light one", "light two", "hide two", "show two"));
  const two = p.items.filter((it) => it.k === "text" && it.s === "second inner");
  expect(two.length).toBeGreaterThan(0);
  for (const it of two) { expect(shown(it, 2)).toBe(true); expect(shown(it, 3)).toBe(false); expect(shown(it, 4)).toBe(true); }
  const one = p.items.filter((it) => it.k === "text" && it.s === "first inner");
  for (const it of one) for (const k of [1, 2, 3, 4]) expect(shown(it, k)).toBe(true);
});

// 2a. a scene: two groups of cards in one lane that are never on screen together share one place (no new word)
const TWO = "title: Two groups | x\n## Left\na x: left card\n## Mid\nb p1: path one\nb p2: path two\nc q1: ticket one | bearer A\nc q2: ticket two\n";
const TWO_STEPS = () => steps("x --> p1: go\np1 --> p2", "clear\nx --> p2", "clear\nhide p1, p2\nshow q1, q2\nx --> q1", "clear\nx --> q2");
const boxOf = (p: { items: Item[] }, id: string) => p.items.find((it): it is Extract<Item, { k: "box" }> => it.k === "box" && (it as { id?: string }).id === id)!;
test("groups of a lane never shown together share one place, sized to the larger; nothing moves between steps", () => {
  const { p } = lay(TWO, TWO_STEPS());
  const [p1, p2, q1, q2] = ["p1", "p2", "q1", "q2"].map((id) => boxOf(p, id));
  expect(q1.y).toBe(p1.y); // the second group starts where the first does
  expect(q2.y).toBeGreaterThan(q1.y + q1.h - 1);
  const slot = Math.max(p2.y + p2.h, q2.y + q2.h) - p1.y;
  expect(slot).toBe(Math.max(p2.y + p2.h - p1.y, q2.y + q2.h - q1.y));
  // each card is drawn once, in one place, for every step
  for (const id of ["p1", "p2", "q1", "q2"]) expect(p.items.filter((it) => it.k === "box" && (it as { id?: string }).id === id).length).toBe(1);
});
test("a connector into a group that shares a place ends on its own card", () => {
  const { p } = lay(TWO, TWO_STEPS());
  const q1 = boxOf(p, "q1"), q2 = boxOf(p, "q2");
  const into = (id: string, r: { x: number; y: number; w: number; h: number }) => {
    const path = p.items.find((it) => it.k === "path" && (it as { id?: string }).id === `x>${id}`) as Extract<Item, { k: "path" }>;
    const [ex, ey] = path.pts.at(-1)!;
    expect(ex).toBeGreaterThanOrEqual(r.x - 1); expect(ex).toBeLessThanOrEqual(r.x + r.w + 1);
    expect(ey).toBeGreaterThanOrEqual(r.y - 1); expect(ey).toBeLessThanOrEqual(r.y + r.h + 1);
  };
  into("q1", q1); into("q2", q2);
});
test("groups that are on screen together keep their own places", () => {
  const { p } = lay(TWO, steps("x --> p1", "show q1, q2\nx --> q1", "x --> q2"));
  expect(boxOf(p, "q1").y).toBeGreaterThan(boxOf(p, "p2").y);
});

// 2b. a scene: a connector to or from a card inside a frame ends on that card's own edge, not on the frame's
test("a connector from a card inside a frame starts on that card's own edge", () => {
  const head = "title: Frame | x\n## Left\na dep: the workshop | two pens inside\n  a pa: pen A | bells\n  a pb: pen B | bells\n## Right\nb l1: ticket one | bearer A\nb l2: ticket two\n";
  const { p } = lay(head, steps("pa --> l1", "pb --> l2: holds", "l1 -> pa"));
  const paths = p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path");
  const pa = boxOf(p, "pa"), pb = boxOf(p, "pb"), l1 = boxOf(p, "l1");
  const on = (pt: [number, number], r: { x: number; y: number; w: number; h: number }) => pt[0] >= r.x - 1 && pt[0] <= r.x + r.w + 1 && pt[1] >= r.y - 1 && pt[1] <= r.y + r.h + 1;
  const edge = (pt: [number, number], r: { x: number; y: number; w: number; h: number }) => Math.abs(pt[0] - (r.x + r.w)) < 1.5 || Math.abs(pt[0] - r.x) < 1.5;
  const step = (k: number) => paths.filter((q) => q.from === k);
  const [a] = step(1); expect(on(a.pts[0], pa) && edge(a.pts[0], pa)).toBe(true); expect(on(a.pts.at(-1)!, l1)).toBe(true);
  const [b] = step(2); expect(on(b.pts[0], pb) && edge(b.pts[0], pb)).toBe(true);
  const [c] = step(3); expect(on(c.pts.at(-1)!, pa) && edge(c.pts.at(-1)!, pa)).toBe(true);
});

// 3. a scene: a connector label into a lane of one card stays inside the stage and off the lane headings
import { measure, setPhoneFont } from "../../src/core/stage-core";
const KEEP = "title: Keepers | one key\n## Left keeper\na k0: keeper zero | looks after the key | one room each\n## Key\nb K: the key | one per house | bearer: zero\n## Right keeper\na k1: keeper one | looks after the key | one room each\n## _ under Left keeper..Right keeper\nc dp: the house keeps running | only the chores wait\n";
for (const w of [1180, 1000]) test(`labels into lone cards stay in the stage and off the lane headings (${w})`, () => {
  const { p } = lay(KEEP, steps("k0 --> K: restamps\nk1 -> K: reads", "clear\nk1 --> K: starts: 23", "clear\nk1 --> K: takes it now, at last"), w);
  const heads = p.items.filter((it): it is Extract<Item, { k: "text" }> => it.k === "text" && it.f === "lane").map((t) => ({ x: t.x, y: t.y - 13, w: measure(t.s, "lane"), h: 17 }));
  const cards = ["k0", "K", "k1", "dp"].map((id) => boxOf(p, id));
  const chips = p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] !== undefined);
  expect(chips.length).toBe(4);
  const meets = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const c of chips) {
    expect(c.y, String(c.bar?.label)).toBeGreaterThanOrEqual(0);
    for (const h of heads) expect(meets(c, h), `${c.bar?.label} on a heading`).toBe(false);
    for (const r of cards) expect(meets(c, r), `${c.bar?.label} on a card`).toBe(false);
  }
});

// 4. a scene: a connector label with a tone, "a -> b (bad): 202" (the one form: the tone before the colon)
import { stageLlm } from "../../src/core/stage";
const PAIR = "title: Pair | x\n## Left\na r: the root\na e: the engine\n## Right\nb d: the door\n";
for (const w of [1180, 390]) test(`a toned label is plain words in the tone's ink, not a chip (${w})`, () => {
  const { c, p } = lay(PAIR, steps("r --> d: 200\ne --> d (bad): 202", "clear\ne --> d (good): 200"), w);
  const chips = p.items.filter((it) => it.k === "box" && it.bar?.["edge-label"] !== undefined).map((it) => (it as { bar: { label: string } }).bar.label);
  expect(chips).toEqual(["200"]);
  const words = p.items.filter((it): it is Extract<Item, { k: "text" }> => it.k === "text" && /^20[02]$/.test(it.s) && it.ink.endsWith(":ink") && /^(bad|good)/.test(it.ink));
  expect(words.map((t) => `${t.s} ${t.ink}`).sort()).toEqual(["200 good:ink", "202 bad:ink"]);
  for (const t of words) { expect(t.x - measure(t.s, "sub") / 2).toBeGreaterThanOrEqual(0); expect(t.x + measure(t.s, "sub") / 2).toBeLessThanOrEqual(w); }
  expect(stageLlm(c)).toContain("202: the engine to the door");
});
test("the tone after the words is refused, with the form to write", () => {
  const c = compileStage(PAIR, steps("e --> d: 202 (bad)", "r --> d: drop-off (late)"), 1, {}, ROLES);
  expect(c.errors.map((e) => e.msg)).toEqual([`a connector's tone goes before the colon: say "e --> d (bad): 202" instead`]);
});

// 5. a scene: "cut a --> b": a red cross on that connector (or, with none, between the two cards), from its step
for (const w of [1180, 390]) test(`cut draws a cross on the connector, or between the cards with none (${w})`, () => {
  const { c, p } = lay(PAIR, steps("r --> d: 200\ne --> d: 200", "cut r --> d", "clear\ncut e -> d"), w);
  const crosses = p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && it.id?.startsWith("cut:") === true);
  expect(crosses.length).toBe(4); // two strokes each
  const at = (id: string) => crosses.filter((x) => x.id === id);
  const [r, d, e] = ["r", "d", "e"].map((id) => boxOf(p, id));
  for (const x of crosses) expect(x.ink).toBe("bad:ink");
  // the first sits on the r -> d line, shown in step 2 only (the step 3 clear ends it); the second between e and d
  const line = p.items.find((it) => it.k === "path" && it.id === "r>d" && it.from === 1) as Extract<Item, { k: "path" }>;
  const mid = (q: [number, number][]) => [(Math.min(...q.map((z) => z[0])) + Math.max(...q.map((z) => z[0]))) / 2, (Math.min(...q.map((z) => z[1])) + Math.max(...q.map((z) => z[1]))) / 2];
  const c1 = mid(at("cut:r>d").flatMap((x) => x.pts));
  const near = line.pts.some((pt, i) => i > 0 && Math.hypot(...[0, 1].map((j) => c1[j] - (pt[j] + line.pts[i - 1][j]) / 2) as [number, number]) < 60) || line.pts.some((pt) => Math.hypot(pt[0] - c1[0], pt[1] - c1[1]) < 60);
  expect(near).toBe(true);
  for (const x of at("cut:r>d")) expect(x.on).toEqual([2]);
  const c2 = mid(at("cut:e>d").flatMap((x) => x.pts));
  for (const x of at("cut:e>d")) expect(x.on).toEqual([3]);
  expect(c2[0]).toBeGreaterThanOrEqual(Math.min(e.x, d.x)); expect(c2[0]).toBeLessThanOrEqual(Math.max(e.x + e.w, d.x + d.w));
  for (const q of [r, d, e]) expect(c2[0] > q.x + 2 && c2[0] < q.x + q.w - 2 && c2[1] > q.y + 2 && c2[1] < q.y + q.h - 2).toBe(false);
  const llm = stageLlm(c);
  expect(llm).toContain("Cut: the root to the door.");
  expect(llm).toContain("Cut: the engine to the door.");
});
test("cut names two known cards", () => {
  const c = compileStage(PAIR, steps("cut r --> x", "cut r"), 1, {}, ROLES);
  expect(c.errors.map((e) => e.msg)).toEqual([`"x" is not a card of this scene (r, e, d)`, `"cut" names a connector: cut a --> b (or cut a -> b)`]);
});

// 6. a scene: a label placed at its target's corner keeps off every box shown with it (cards, cards inside cards,
// pills, a track's phases): the corner's other side, then along its line
const HAND = "title: Handover | x\ntrack: a 1 Pending, 2 Signalled, 3 Allocated, 4 Rerouted, 5 Done\n## _\nb ev: pickers | send to two\n## _\nc m0: packer 0 | old steward | running\n  pill p1,p2: one; two\n## _\nc m1: packer 1 | old steward | running\n## _\nc m2: packer 2 | new | owns nothing\n";
for (const w of [1180, 1000]) test(`corner labels keep off every box shown with them (${w})`, () => {
  const { p } = lay(HAND, steps("at 2 Signalled\nev --> m0", "at 3 Allocated\nm0, m1 --> m2: GET /handover", "at 4 Rerouted\nm0 --> m2: GET /handover\nm1 --> m2: GET /handover"), w);
  const meets = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  const chips = p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] !== undefined);
  expect(chips.length).toBeGreaterThan(0);
  const others = p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] === undefined && it.cls !== "stg-region");
  for (const c of chips) for (const k of c.on ?? []) for (const r of others) if (shown(r, k)) expect(meets(c, r), `${c.bar?.label} in step ${k} on ${r.cls} ${(r as { id?: string }).id ?? ""}`).toBe(false);
  for (const c of chips) { expect(c.y).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(w); }
});

// 7. phones (both rules at every width)
const FRAME = "title: Frame | x\n## Left\na dep: the workshop | two pens inside\n  a pa: pen A | bells\n  a pb: pen B | bells\n## Right\nb l1: ticket one | bearer A\nb l2: ticket two\n";
for (const w of [390, 360]) {
  test(`phone ${w}: a connector to or from a card inside a card meets that card's own edge`, () => {
    const { p } = lay(FRAME, steps("pa --> l1", "pb --> l2: holds", "l1 -> pa"), w);
    expect(p.narrow).toBe(true);
    const paths = p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && !it.id?.startsWith("cut:"));
    const pa = boxOf(p, "pa"), pb = boxOf(p, "pb");
    const onEdge = (pt: [number, number], r: { x: number; y: number; w: number; h: number }) => (Math.abs(pt[0] - (r.x + r.w)) < 1.5 || Math.abs(pt[0] - r.x) < 1.5) && pt[1] >= r.y && pt[1] <= r.y + r.h || (Math.abs(pt[1] - (r.y + r.h)) < 1.5 || Math.abs(pt[1] - r.y) < 1.5) && pt[0] >= r.x && pt[0] <= r.x + r.w;
    const at = (k: number) => paths.find((q) => q.from === k)!;
    expect(onEdge(at(1).pts[0], pa)).toBe(true);
    expect(onEdge(at(2).pts[0], pb)).toBe(true);
    expect(onEdge(at(3).pts.at(-1)!, pa)).toBe(true);
    // and never across the other inner card
    for (const q of [at(1), at(3)]) for (let i = 1; i < q.pts.length; i++) { const [a, b] = [q.pts[i - 1], q.pts[i]]; for (let u = 0.1; u < 1; u += 0.1) { const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; expect(x > pb.x + 1 && x < pb.x + pb.w - 1 && y > pb.y + 1 && y < pb.y + pb.h - 1).toBe(false); } }
  });
  test(`phone ${w}: groups of a lane never shown together share one place`, () => {
    const { p } = lay(TWO, TWO_STEPS(), w);
    expect(boxOf(p, "q1").y).toBe(boxOf(p, "p1").y);
    for (const id of ["p1", "p2", "q1", "q2"]) expect(p.items.filter((it) => it.k === "box" && (it as { id?: string }).id === id).length).toBe(1);
  });
  test(`phone ${w}: two stacked lanes never shown together share one place, headings in their own steps`, () => {
    const LANES = "title: Two lanes | x\n## Left\na x: left card\n## Path\nb p1: path one\nb p2: path two\n## Tickets\nc q1: ticket one | bearer A\nc q2: ticket two\n## After\nd z: after card\n";
    const ss = steps("x --> p1: go\np1 --> z", "clear\nx --> p2", "clear\nhide p1, p2\nshow q1, q2\nx --> q1", "clear\nx --> q2\nq2 --> z");
    const { p } = lay(LANES, ss, w);
    const [p1, q1, z] = ["p1", "q1", "z"].map((id) => boxOf(p, id));
    expect(q1.y).toBe(p1.y);
    const heads = p.items.filter((it): it is Extract<Item, { k: "text" }> => it.k === "text" && it.f === "lane");
    const hp = heads.find((t) => t.s === "Path")!, hq = heads.find((t) => t.s === "Tickets")!;
    for (const k of [1, 2]) { expect(shown(hp, k)).toBe(true); expect(shown(hq, k)).toBe(false); }
    for (const k of [3, 4]) { expect(shown(hp, k)).toBe(false); expect(shown(hq, k)).toBe(true); }
    // the lane after keeps clear of the taller group
    const bottom = Math.max(...["p1", "p2", "q1", "q2"].map((id) => { const b = boxOf(p, id); return b.y + b.h; }));
    expect(z.y).toBeGreaterThan(bottom);
    // shorter than the same scene with the groups on screen together
    const both = lay(LANES, steps("x --> p1: go\np1 --> z", "clear\nx --> p2", "clear\nshow q1, q2\nx --> q1", "clear\nx --> q2\nq2 --> z"), w).p;
    expect(p.h).toBeLessThan(both.h);
    // a connector into the shared place ends on its own card
    const into = p.items.find((it) => it.k === "path" && it.id === "x>q1") as Extract<Item, { k: "path" }>;
    const [ex, ey] = into.pts.at(-1)!; expect(ex >= q1.x - 1 && ex <= q1.x + q1.w + 1 && ey >= q1.y - 1 && ey <= q1.y + q1.h + 1).toBe(true);
  });
}

// 8. a scene point 1: in a shared place, a connector between cards of one group runs straight; the other group's cards
// (not on screen in its steps) are no obstacle, for its line and for its label
const STACK = "title: Stack | x\n## Left\na x: left card\n## Mid\nb p1: path one\nb p2: path two\nb p3: path three\nc q1: ticket one | bearer A\nc q2: ticket two\nc q3: ticket three\n";
for (const w of [1180, 1000, 390, 360]) test(`connectors in a shared place ignore the cards that are not on screen (${w})`, () => {
  const { p } = lay(STACK, steps("p1 --> p2: pluck\np2 --> p3: send", "clear\np1 --> p2: pluck", "clear\nhide p1, p2, p3\nshow q1, q2, q3\nq1 --> q2", "clear\nq2 --> q3"), w);
  expect(boxOf(p, "q1").y).toBe(boxOf(p, "p1").y);
  const cards = ["p1", "p2", "p3", "q1", "q2", "q3"].map((id) => boxOf(p, id));
  for (const id of ["p1>p2", "p2>p3", "q1>q2", "q2>q3"]) {
    const path = p.items.find((it) => it.k === "path" && it.id === id) as Extract<Item, { k: "path" }>;
    // straight where the two cards stand one under the other (at 360 a phone lays two a row: the line turns)
    if (w >= 390) expect(path.pts.length, `${id} at ${w}`).toBe(2);
    const [fa, fb] = id.split(">"), ks = path.on ?? [path.from ?? 1];
    for (const r of cards) {
      const rid = (r as { id?: string }).id!; if (rid === fa || rid === fb || !ks.some((k) => shown(r, k))) continue;
      for (let i = 1; i < path.pts.length; i++) for (let u = 0.05; u < 1; u += 0.05) { const x = path.pts[i - 1][0] + (path.pts[i][0] - path.pts[i - 1][0]) * u, y = path.pts[i - 1][1] + (path.pts[i][1] - path.pts[i - 1][1]) * u; expect(x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1, `${id} through ${rid} at ${w}`).toBe(false); }
    }
  }
  // labels sit off every card edge shown with them
  const chips = p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] !== undefined);
  for (const c of chips) for (const r of cards) {
    if (!(c.on ?? []).some((k) => shown(r, k))) continue;
    const inter = c.x < r.x + r.w && r.x < c.x + c.w && c.y < r.y + r.h && r.y < c.y + c.h, inside = c.x >= r.x && c.x + c.w <= r.x + r.w && c.y >= r.y && c.y + c.h <= r.y + r.h;
    expect(inter && !inside, `${c.bar?.label} across ${(r as { id?: string }).id} at ${w}`).toBe(false);
  }
});

// 9. a scene: the note band ("notes: above") and a time block that appears later ("show <name>") share one place when
// they are never on screen in the same steps; the block keeps one place for the whole scene
const NB = (showAt: number, noteTo: number) => {
  const head = "title: Swap | x\nnotes: above\n## Tier\na r: root | the only writer\nb e: engine | writes beside it\ntrack: a 1 Plan, 2 Swap\nwhere: order: one, two\npanels\ntime swap: 0..8 | THE SWAP · seconds\nrow a ra \"root pushes\": +_ 0..2 @" + showAt + "; +_ 4..6 @" + showAt + "\nrow b eb \"engine pushes\": +_ 1..3 @" + showAt;
  const ss = Array.from({ length: 5 }, (_, i) => (i + 1 <= noteTo ? `note: Step ${i + 1}: the tiers do not touch. | Safety: never two writers.\n` : "") + (i + 1 === showAt ? "show swap\n" : "") + "r -> e: x");
  return [head, steps(...ss)] as const;
};
const span = (p: { items: Item[] }, pick: (it: Item) => boolean) => { const ys = p.items.filter(pick).flatMap((it) => ("pts" in it && it.pts ? it.pts.map(([, y]) => y) : "y" in it ? [it.y as number] : [])); return [Math.min(...ys), Math.max(...ys)]; };
const isNote = (it: Item) => String((it as { cls?: string }).cls ?? "").includes("note-strip");
const steps0 = (it: Item) => { const o = it as { on?: number[]; from?: number }; return o.on ? Math.min(...o.on) : o.from ?? 1; };
for (const w of [1180, 1000, 390, 360]) test(`notes and a time block never on screen together share one place (${w})`, () => {
  const [h1, s1] = NB(4, 3), shared = lay(h1, s1, w).p;
  const [h2, s2] = NB(3, 3), apart = lay(h2, s2, w).p;
  expect(shared.h).toBeLessThan(apart.h - 40);
  const [n0] = span(shared, isNote), [t0] = span(shared, (it) => steps0(it) >= 4 && !isNote(it) && ((it as { y?: number }).y ?? 0) > n0 - 30);
  expect(t0).toBeLessThan(n0 + 40);
  // apart: the block stays under the notes
  const [, n1] = span(apart, isNote), [a0] = span(apart, (it) => steps0(it) >= 3 && !isNote(it) && String((it as { cls?: string }).cls ?? "").includes("time"));
  expect(a0).toBeGreaterThan(n1);
});

// 10. a scene (fan-in): two arrows with the same words into one target share ONE label and come in by the side that faces
// their sources over the cards (the top, when a card stands between), never through a card
const FAN = "title: Handover | x\n## _\nb m0: packer 0 | old steward | packs the moved outputs\n## _\nb m1: packer 1 | old steward | packs the moved outputs\n## _\nc m2: packer 2 | new | checks /handover\n";
for (const w of [1180, 1000]) test(`fan-in: one shared label, both lines into the target's top, none through a card (${w})`, () => {
  const { p } = lay(FAN, steps("m0 -> m1: hello", "clear\nm0, m1 --> m2: GET /handover"), w);
  const t = boxOf(p, "m2"), cards = ["m0", "m1", "m2"].map((id) => boxOf(p, id));
  const paths = p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && (it.id === "m0>m2" || it.id === "m1>m2"));
  expect(paths.length).toBe(2);
  const ends = paths.map((q) => q.pts.at(-1)!);
  for (const [x, y] of ends) { expect(Math.abs(y - t.y)).toBeLessThan(1); expect(x).toBeGreaterThan(t.x); expect(x).toBeLessThan(t.x + t.w); }
  expect(Math.abs(ends[0][0] - ends[1][0])).toBeGreaterThan(8);
  for (const q of paths) for (const r of cards) for (let i = 1; i < q.pts.length; i++) for (let u = 0.02; u < 1; u += 0.02) {
    const x = q.pts[i - 1][0] + (q.pts[i][0] - q.pts[i - 1][0]) * u, y = q.pts[i - 1][1] + (q.pts[i][1] - q.pts[i - 1][1]) * u;
    expect(x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1, `${q.id} through a card at ${w}`).toBe(false);
  }
  const chips = p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] === "GET /handover");
  expect(chips.length).toBe(1);
  for (const r of cards) expect(chips[0].x < r.x + r.w && r.x < chips[0].x + chips[0].w && chips[0].y < r.y + r.h && r.y < chips[0].y + chips[0].h).toBe(false);
  expect(chips[0].y).toBeGreaterThanOrEqual(0);
});

// 11. a scene: a lone card beside a stack of cards stands as tall as the whole stack, its big value centred in it
const LONE = "title: Barrows | x\n## Barrows\na ra: barrow a | part 318 | plucks every 10 s\nb rb: barrow b | part 318 | keeps its own baskets\n## Packer\nc m: packer | packs exactly one crate\n";
for (const w of [1180, 1000]) test(`a lone card beside a stack spans the whole stack, its big value in the middle (${w})`, () => {
  const { p } = lay(LONE, steps("ra --> m\nrb --> m\ntext m: packs exactly one crate | ** 2 copies | which one counts?", "text m: packs exactly one crate | ** 318 (a) | a's crate sealed"), w);
  const ra = boxOf(p, "ra"), rb = boxOf(p, "rb"), m = boxOf(p, "m");
  expect(Math.abs(m.y - ra.y)).toBeLessThan(1); expect(Math.abs(m.y + m.h - (rb.y + rb.h))).toBeLessThan(1);
  for (const s of ["2 copies", "318 (a)"]) {
    const t = p.items.find((it) => it.k === "text" && it.s === s) as Extract<Item, { k: "text" }>;
    expect(Math.abs(t.y - 7 - (m.y + m.h / 2))).toBeLessThan(18);
  }
});

// 9b. the same with the notes in their default place (after the block): the notes start at the block's top, and the place
// is as tall as the taller of the two, not both
for (const w of [1180, 390]) test(`notes after a time block never on screen with them share its place (${w})`, () => {
  const [h1, s1] = NB(4, 3), shared = lay(h1.replace("notes: above\n", ""), s1, w).p;
  const [h2, s2] = NB(3, 3), apart = lay(h2.replace("notes: above\n", ""), s2, w).p;
  expect(shared.h).toBeLessThan(apart.h - 30);
  const [n0] = span(shared, isNote), [t0] = span(shared, (it) => steps0(it) >= 4 && !isNote(it) && String((it as { cls?: string }).cls ?? "").includes("time"));
  expect(Math.abs(n0 - t0)).toBeLessThan(70); // the block's title row stands above its rows
});

// 12. "flow: off": no moving dot on the scene's connectors; on by default; one value
test("flow: off turns the moving dots off for that scene only", () => {
  const on = lay(LONE, steps("ra --> m", "rb --> m"), 1180).p, off = lay(LONE.replace("title: Barrows | x\n", "title: Barrows | x\nflow: off\n"), steps("ra --> m", "rb --> m"), 1180).p;
  const flows = (p: { items: Item[] }) => p.items.filter((it) => it.k === "path" && (it as { flow?: boolean }).flow).length;
  expect(flows(on)).toBe(2); expect(flows(off)).toBe(0);
  expect(off.items.filter((it) => it.k === "path").length).toBe(on.items.filter((it) => it.k === "path").length);
  const bad = compileStage(LONE.replace("title: Barrows | x\n", "title: Barrows | x\nflow: none\n"), steps("ra --> m", "rb --> m"), 1, {}, ROLES);
  expect(bad.errors.map((e) => e.msg)).toEqual([`"flow: off" turns this scene's moving dots off; "off" is the one value (the dots are on by default)`]);
});

// 11b. a lone card with no big value keeps its own height, centred on the stack (the Format page's stores)
test("a lone card without a big value keeps its height, centred on the stack", () => {
  const { p } = lay(LONE, steps("ra --> m", "rb --> m"), 1180);
  const ra = boxOf(p, "ra"), rb = boxOf(p, "rb"), m = boxOf(p, "m");
  expect(m.h).toBeLessThan(rb.y + rb.h - ra.y - 10);
  expect(Math.abs(m.y + m.h / 2 - (ra.y + rb.y + rb.h) / 2)).toBeLessThan(2);
});

// 13. "lines: straight": a side arrow with nothing in its way is one straight line; default unchanged
test("lines: straight draws clear side arrows straight; without it they curve as before", () => {
  const head = (x: string) => LONE.replace("title: Barrows | x\n", "title: Barrows | x\n" + x);
  const st = lay(head("lines: straight\n"), steps("ra --> m", "rb --> m"), 1180).p, cv = lay(LONE, steps("ra --> m", "rb --> m"), 1180).p;
  const curves = (p: { items: Item[] }) => p.items.filter((it) => it.k === "path" && /^r[ab]>m$/.test(String(it.id))).map((it) => (it as { curve?: string }).curve);
  expect(curves(st)).toEqual(["line", "line"]); expect(curves(cv)).toEqual(["h", "h"]);
  expect(compileStage(head("lines: curved\n"), steps("ra --> m", "rb --> m"), 1, {}, ROLES).errors.map((e) => e.msg)).toEqual([`"lines: straight" draws this scene's arrows as straight lines where nothing is in the way; "straight" is the one value`]);
});

// 14. "hide ## Title" / "show ## Title": a lane heading shows only in its steps; nothing moves
for (const w of [1180, 390]) test(`a lane heading hides and shows again by its title; nothing moves (${w})`, () => {
  const src = "title: Heads | x\n## Foreman\na dep: workshop\n## The orchard path, every 10 s\nb ap: app pens\nb ev: pickers\n";
  const { p } = lay(src, steps("ap --> ev", "hide ## The orchard path", "show ## The orchard path, every 10 s"), w);
  const heads = p.items.filter((it): it is Extract<Item, { k: "text" }> => it.k === "text" && it.f === "lane" && it.s.startsWith("The orchard path"));
  expect(heads.length).toBe(1); expect((heads[0] as { on?: number[] }).on).toEqual([1, 3]);
  const op = p.items.find((it) => it.k === "text" && it.f === "lane" && it.s === "Foreman") as { on?: number[] };
  expect(op.on).toBeUndefined();
  const plain = lay(src, steps("ap --> ev", "clear", "clear"), w).p;
  for (const id of ["dep", "ap", "ev"]) { const a = boxOf(p, id), b = boxOf(plain, id); expect([a.x, a.y, a.w, a.h]).toEqual([b.x, b.y, b.w, b.h]); }
  expect(compileStage(src, steps("hide ## Nothing", "clear"), 1, {}, ROLES).errors.map((e) => e.msg)).toEqual([`"hide ## Title" names one lane or band heading; the headings are "Foreman", "The orchard path, every 10 s"`]);
});

// 15. phone: a labelled arrow between two tall cards side by side runs near their foot, by its label under the gap
// (the label stood 150 px under its arrow on the layers page)
for (const w of [390, 360]) test(`phone: a labelled arrow between tall side-by-side cards runs by its label (${w})`, () => {
  const src = "title: Tall | x\n## Hosts\na lap: laptop | one | two | three | four | five | six | seven | eight\nb hr: home router | one | two | three | four | five | six | seven | eight\n";
  const { p } = lay(src, steps("lap --> hr: SYN", "clear\nhr --> lap: SYN-ACK"), w);
  const a = boxOf(p, "lap"), b = boxOf(p, "hr");
  if (Math.abs(a.y - b.y) > 1) return; // stacked at this width: nothing to check
  for (const id of ["lap>hr", "hr>lap"]) {
    const q = p.items.find((it) => it.k === "path" && it.id === id) as Extract<Item, { k: "path" }>, lab = p.items.find((it) => it.k === "box" && it.bar?.["edge-label"] !== undefined && (it.on ?? []).some((k) => (q.on ?? []).includes(k))) as Extract<Item, { k: "box" }>;
    expect(lab.y - q.pts[0][1]).toBeLessThan(40); expect(lab.y - q.pts[0][1]).toBeGreaterThan(0);
  }
});

// 16. phone: a line holding a run of hex and colons (a MAC address) breaks as if 15% wider; the desktop is unchanged
test("phone: a line with a MAC address breaks earlier; desktop unchanged", async () => {
  const { wrap, measure, setPhoneLines } = await import("../../src/core/stage-core");
  const s = "MAC 00:00:5E:00:53:0A", w = measure(s, "sub") + 2;
  expect(wrap(s, w, "sub").length).toBe(1);
  setPhoneLines(true); try { expect(wrap(s, w, "sub").length).toBe(2); } finally { setPhoneLines(false); }
});

// 17. zero movement: a connector drawn again between the same ends keeps its path while it shows (the Format page's
// market morning: 'a -> m' moved when its neighbour 'b -> m' went at the 'clear' step)
for (const w of [1180, 390]) test(`a connector drawn again keeps one path (${w})`, () => {
  const src = "title: Market | x\n## Farms\na a: hill farm | apples\nb b: river farm | pears\n## Market\nc m: market hall | one floor\n";
  const { p } = lay(src, steps("a -> m: 30 crates\nb -> m: 30 crates", "clear\na -> m: 30 crates"), w);
  const shapes = new Set(p.items.filter((it) => it.k === "path" && it.id === "a>m").map((q) => JSON.stringify((q as Extract<Item, { k: "path" }>).pts.map(([x, y]) => [Math.round(x), Math.round(y)]))));
  expect(p.items.filter((it) => it.k === "path" && it.id === "a>m").length).toBeGreaterThan(1);
  expect(shapes.size).toBe(1);
});

// 18. 'lines: straight' on a phone: a lane heading in the gap does not turn a straight line into a loop round the box;
// the line runs straight down and the heading is drawn over it, with the stage's colour round its letters
for (const w of [390, 360]) test(`phone, lines: straight: straight down past a lane heading, heading drawn over it (${w})`, () => {
  const src = "title: Twin | x\nlines: straight\n## Sources\na ev: sources | 60 of them: 30 pairs × a, b | send every part | to both joiners\n## Joiner pair 0: two copies\nb ma: joiner a · packs first | same parts\nc mb: joiner b · packs when a did not | same parts\n";
  const { p } = lay(src, steps("ev --> ma, mb", "ev --> ma"), w);
  for (const id of ["ev>ma", "ev>mb"]) { const q = p.items.find((it) => it.k === "path" && it.id === id) as Extract<Item, { k: "path" }>; expect(q.pts.length).toBe(2); expect(Math.abs(q.pts[0][0] - q.pts[1][0])).toBeLessThan(1); }
  const head = p.items.findIndex((it) => it.k === "text" && it.f === "lane" && it.s.startsWith("Joiner")), last = p.items.map((it) => it.k).lastIndexOf("path");
  expect((p.items[head] as { halo?: boolean }).halo).toBe(true); expect(head).toBeGreaterThan(last);
  // without the setup line the heading is never crossed (the old route stands)
  const { p: q } = lay(src.replace("lines: straight\n", ""), steps("ev --> ma, mb", "ev --> ma"), w);
  expect(q.items.some((it) => (it as { halo?: boolean }).halo)).toBe(false);
});

// 19. a scene: 'hide ## Title' from step 1 keeps a lane (its region, its band ranges) and draws no
// heading; a band's heading hides and shows the same way
test("hide ## a lane heading from step 1 keeps its lane; show ## a band heading from step 2", () => {
  const src = "title: Tree | x\n## Agg\na ag: top node | sum by\n## Call\nb ca: middle node | rate\n## Sel\nc se: leaf node | measure\n## The parser builds the tree: under Agg..Sel\nd pl: the plan | runs everywhere\n## _ under Agg..Sel\nd bad: refusals | other shapes\n";
  const ss = steps("hide ## Agg\nhide ## Call\nhide ## Sel\nhide ## The parser", "show ## The parser");
  for (const w of [1180, 390]) {
    const { p } = lay(src, ss, w);
    for (const t of ["Agg", "Call", "Sel"]) {
      const h = p.items.find((it) => it.k === "text" && it.f === "lane" && it.s === t) as { on?: number[] };
      expect(h.on).toEqual([0]);
      expect(p.items.some((it) => it.k === "box" && it.cls === "stg-region" && it.bar?.label === t)).toBe(true);
    }
    const band = p.items.find((it) => it.k === "text" && it.f === "lane" && it.s.startsWith("The parser")) as { on?: number[] };
    expect(band.on).toEqual([2]);
  }
});

// 20. phone (the hero): when lines cross the gap under a lane, its one "and more" line joins the heading's line
// where it fits after the words there; its own line stays as room; a line climbing to cards of a later row takes the gap
// between card columns rather than the stage's right edge; no stretch runs through words; the stage does not grow
for (const w of [390, 360]) test(`phone: a crossed gap's caption joins the heading line; lines climb a column gap, not the right edge (${w})`, () => {
  const src = "title: Orders | x\n## Browsers\na b1..b4: laptop; phone; tablet; kiosk | sends a request\n... about 2,000 sessions\n## Servers\nb s0,s1: api 0; api 1 | answers\n";
  const ss = steps("b1,b3 --> s0\nb2,b4 --> s1\ntag b1,b3: to api 0\ntag b2,b4: to api 1", "clear");
  const { p } = lay(src, ss, w), heads = p.items.filter((it) => it.k === "text" && it.f === "lane");
  const cap = p.items.find((it) => it.k === "text" && it.s === "about 2,000 sessions") as Extract<Item, { k: "text" }>;
  const head = heads.find((t) => (t as Extract<Item, { k: "text" }>).s === "Browsers") as Extract<Item, { k: "text" }>;
  expect(cap.y).toBe(head.y); // on the heading's line
  // the same stage without connectors keeps the caption under the cards and is exactly as tall
  const plain = lay(src, steps("tag b1,b3: to api 0\ntag b2,b4: to api 1", "clear"), w).p;
  expect((plain.items.find((it) => it.k === "text" && it.s === "about 2,000 sessions") as Extract<Item, { k: "text" }>).y).toBeGreaterThan(head.y + 40);
  expect(p.h).toBe(plain.h);
  const right = Math.max(...p.items.filter((it) => it.k === "box" && /^b\d$/.test(String((it as { id?: string }).id))).map((b) => (b as { x: number; w: number }).x + (b as { w: number }).w));
  if (w === 390) for (const q of p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && /^b\d>s\d$/.test(String(it.id)))) { // at 360 one still needs the edge
    expect(Math.max(...q.pts.map(([x]) => x))).toBeLessThanOrEqual(right); // never out in the right-edge channel
  }
});

// 21. a scene: "keep a -> b: words" keeps the words while the line stays (one label, drawn once), for a
// data connector and a toned one, wide and on a phone; without keep, a data label speaks in its own step only
for (const w of [1180, 390]) test(`'keep' on a connector: its words stay while its line does, drawn once (${w})`, () => {
  const src = "title: Keep | x\n## A\na m0, m1: packer 0; packer 1\n## B\nb m2: packer 2\n";
  const label = (p: { items: Item[] }, t: string) => p.items.filter((it) => (it.k === "text" || it.k === "box") && (it as { bar?: Record<string, unknown> }).bar?.["edge-label"] === t);
  const vis = (it: Item) => { const o = it as { on?: number[]; from?: number; to?: number }; return o.on ?? [1, 2, 3].filter((k) => k >= (o.from ?? 1) && (!o.to || k <= o.to)); };
  const kept = lay(src, steps("keep m0, m1 --> m2: GET /handover\nkeep m0 -> m2 (bad): failed", "light m2", "light m0"), w).p;
  for (const t of ["GET /handover", "failed"]) {
    const ls = label(kept, t), boxes = ls.filter((it) => it.k === "box");
    expect(boxes.length + ls.filter((it) => it.k === "text").length).toBeGreaterThan(0);
    for (const it of ls) expect(vis(it)).toEqual([1, 2, 3]);
    expect(ls.length).toBe(1); // one label, not one per step (the two lines into m2 share theirs)
  }
  const plain = lay(src, steps("m0, m1 --> m2: GET /handover", "light m2", "light m0"), w).p;
  for (const it of label(plain, "GET /handover")) expect(vis(it)).toEqual([1]);
  expect(compileStage(src, steps("keep m0 --> m2: x", "clear"), 1, {}, ROLES).errors).toEqual([]);
});

// 22. phone: lines between two stacked rows that fall back to the right edge make their gap
// grow (over the upper row's caption, under the gap's heading row; 4 px steps, at most 24 px a stage) when that sends
// some of them through it; a stage with no such line keeps its height; no line runs through words
for (const w of [390, 360]) test(`phone: a gap whose lines fall to the edge grows, at most 24 px, and they go through it (${w})`, () => {
  const src = "title: Pull | x\n## Sources\na p1..p6: src one; src two; src three; src four; src five; src six | serves data on a port\n... about 900 items per group\n## Readers\nb e0,e1,e2: reader 0; reader 1; reader 2 | each tick: read, add\n";
  const pulls = steps("light p*", "e0 --> p1,p4\ne1 --> p2,p6\ne2 --> p3,p5");
  const { p } = lay(src, pulls, w), plain = lay(src, steps("light p*", "light e*"), w).p;
  expect(p.h - plain.h).toBeGreaterThan(0);
  expect(p.h - plain.h).toBeLessThanOrEqual(24);
  const right = Math.max(...p.items.filter((it) => it.k === "box" && /^p\d$/.test(String((it as { id?: string }).id))).map((b) => (b as { x: number; w: number }).x + (b as { w: number }).w));
  const lines = p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && /^e\d>p\d$/.test(String(it.id)));
  expect(lines.length).toBe(6);
  expect(lines.filter((q) => Math.max(...q.pts.map(([x]) => x)) <= right).length).toBeGreaterThan(0); // some go through the gap
  // no stretch through words (the words as the phone draws them)
  setPhoneFont(true);
  try {
    const words = p.items.filter((it): it is Extract<Item, { k: "text" }> => it.k === "text" && it.f !== "chip").map((t) => { const tw = measure(t.s, t.f), x0 = t.anchor === "middle" ? t.x - tw / 2 : t.anchor === "end" ? t.x - tw : t.x; return { x0, x1: x0 + tw, y0: t.y - 9, y1: t.y + 2 }; });
    for (const q of lines) for (let i = 0; i + 1 < q.pts.length; i++) { const [[ax, ay], [bx, by]] = [q.pts[i], q.pts[i + 1]];
      for (const t of words) expect(Math.max(ax, bx) > t.x0 && Math.min(ax, bx) < t.x1 && Math.max(ay, by) > t.y0 && Math.min(ay, by) < t.y1).toBe(false); }
  } finally { setPhoneFont(false); }
  expect(lay(src, steps("light p*", "light e*"), w).p.h).toBe(plain.h); // no line, no room
});

// 23. phone (the hero's foreman): "a -> b x2" draws two lines, each on its own path (the second copy took the
// first one's path: one arrow seen); a connector written again in a later step still keeps its path
for (const w of [390, 360]) test(`phone: the copies of 'a -> b x2' each take their own path; a rewrite keeps its path (${w})`, () => {
  const src = "title: Copies | x\n## Top\na t0,t1,t2: top 0; top 1; top 2\n## Bottom\nb u0,u1: low 0; low 1\n## _ under Top..Bottom\nc op: foreman | sizes them\n";
  const { p } = lay(src, steps("light t*", "op --> t2,u1 x2: checked", "op --> t2,u1 x2: checked again"), w);
  for (const id of ["op>t2", "op>u1"]) {
    const ps = p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && it.id === id);
    expect(ps.length).toBe(2);
    expect(JSON.stringify(ps[0].pts)).not.toBe(JSON.stringify(ps[1].pts));
  }
});
