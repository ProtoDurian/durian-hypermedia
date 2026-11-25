// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// "layout: row" under a lane lays its cards side by side across the lane's width; arrows
// between neighbours run along the row, their labels under it; on a phone the row wraps (the phone's lane rules);
// nothing moves between steps
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";

const steps = (...raws: string[]) => raws.map((raw, i) => ({ title: `S${i + 1}: Step ${i + 1}.`, raw: raw + "\n", line: (i + 1) * 10 }));
const ROLES = { a: 1, b: 2, c: 3, d: 4 };
const ROW = "title: Data path | x\n## Foreman\na dep: the workshop | two pens\n## The data path\nlayout: row\nb ap: app pens | 1,000\nb ev: pickers | 64 pens\nb mg: packers | 4 pens\nc mi: store\n";
const lay = (head: string, ss: ReturnType<typeof steps>, w: number) => { const c = compileStage(head, ss, 1, {}, ROLES); expect(c.errors).toEqual([]); return { c, p: layoutStage(c.model, w) }; };
const box = (p: { items: Item[] }, id: string) => p.items.find((it): it is Extract<Item, { k: "box" }> => it.k === "box" && (it as { id?: string }).id === id)!;
const meets = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const STEPS = () => steps("ap --> ev: pluck\nev --> mg: send\nmg --> mi: write\ndep --> ev", "clear\nap --> ev: pluck\nmg --> mi: write");
beforeEach(() => beginDocument());

for (const w of [1180, 1000]) test(`a row lane's cards stand side by side in one row, inside the lane (${w})`, () => {
  const { p } = lay(ROW, STEPS(), w);
  const cs = ["ap", "ev", "mg", "mi"].map((id) => box(p, id));
  for (const c of cs) expect(c.y).toBe(cs[0].y);
  for (let i = 1; i < cs.length; i++) expect(cs[i].x).toBeGreaterThan(cs[i - 1].x + cs[i - 1].w + 10);
  const dep = box(p, "dep"); expect(cs[0].x).toBeGreaterThan(dep.x + dep.w);
  expect(cs[3].x + cs[3].w).toBeLessThanOrEqual(w);
  // arrows between neighbours run straight along the row; their labels stand under the row (at each gap), on no card
  for (const id of ["ap>ev", "ev>mg", "mg>mi"]) { const q = p.items.find((it) => it.k === "path" && it.id === id) as Extract<Item, { k: "path" }>; expect(q.pts.length).toBe(2); expect(Math.abs(q.pts[0][1] - q.pts[1][1])).toBeLessThan(1); }
  const chips = p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] !== undefined);
  expect(chips.length).toBe(5);
  for (const c of chips) { expect(c.y).toBeGreaterThanOrEqual(cs[0].y + cs[0].h - 0.5); for (const r of [...cs, dep]) expect(meets(c, r)).toBe(false); }
  // each card once, in one place
  for (const id of ["ap", "ev", "mg", "mi"]) expect(p.items.filter((it) => it.k === "box" && (it as { id?: string }).id === id).length).toBe(1);
});

test("a row is shorter than the same lane stacked", () => {
  const row = lay(ROW, STEPS(), 1180).p, col = lay(ROW.replace("layout: row\n", ""), STEPS(), 1180).p;
  expect(row.h).toBeLessThan(col.h);
});

for (const w of [390, 360]) test(`on a phone the row wraps: every card whole, inside the stage, none on another (${w})`, () => {
  const { p } = lay(ROW, STEPS(), w);
  expect(p.narrow).toBe(true);
  const cs = ["ap", "ev", "mg", "mi", "dep"].map((id) => box(p, id));
  for (const c of cs) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(w); }
  for (const a of cs) for (const b of cs) if (a !== b) expect(meets(a, b)).toBe(false);
  expect(box(p, "ev").y).toBe(box(p, "ap").y); // at least two a row
});

test("groups of a row never on screen together share its places", () => {
  const head = ROW + "d l1: ticket one\nd l2: ticket two\n";
  const { p } = lay(head, steps("ap --> ev: pluck", "clear\nhide ap, ev, mg, mi\nshow l1, l2\nl1 --> l2"), 1180);
  expect(box(p, "l1").x).toBe(box(p, "ap").x); expect(box(p, "l1").y).toBe(box(p, "ap").y);
  expect(box(p, "l2").y).toBe(box(p, "ev").y); // each group its own widths, one shared place
});

test("layout takes one value, under a lane", () => {
  const bad = compileStage(ROW.replace("layout: row", "layout: column"), STEPS(), 1, {}, ROLES);
  expect(bad.errors.map((e) => e.msg)).toEqual([`"layout: row" lays this lane's cards side by side across its width; "row" is the one layout`]);
  const early = compileStage("title: x | y\nlayout: row\n## L\na x: one\na y: two\n", steps("x --> y", "clear"), 1, {}, ROLES);
  expect(early.errors.map((e) => e.msg)).toEqual([`"layout: row" goes under a lane's heading ("## Title"), before its cards`]);
  const c = compileStage(ROW, STEPS(), 1, {}, ROLES);
  expect(stageLlm(c)).toContain("The data path");
});

// a card under two cards of the row ("role id under A..B"): its own line, from A's left edge to B's right edge; its arrows
// to them go straight up; a line from another lane comes straight across when nothing is in its way
const UNDER = "title: Data path | x\n## Foreman\na dep: the workshop | two pens | one pen per node | PDB: one down at most | barrows fixed | no sorter\n## The data path\nlayout: row\nb ap: app pens\nb ev: pickers\nb mg: packers\nc mi: store\nd cfg under ev..mg: ledger · yards | written by the ticket bearer\n";
for (const w of [1180, 1000]) test(`a card under two cards of a row spans them, its arrows straight up (${w})`, () => {
  const { p } = lay(UNDER, steps("ap --> ev: pluck\nev --> mg: send\nmg --> mi: write\ncfg -> ev\ncfg -> mg\ndep --> cfg", "clear\ncfg -> ev"), w);
  const [ap, ev, mg, mi, cfg, dep] = ["ap", "ev", "mg", "mi", "cfg", "dep"].map((id) => box(p, id));
  for (const c of [ev, mg, mi]) expect(c.y).toBe(ap.y);
  expect(Math.abs(cfg.x - ev.x)).toBeLessThan(1); expect(Math.abs(cfg.x + cfg.w - (mg.x + mg.w))).toBeLessThan(1); expect(cfg.y).toBeGreaterThan(ap.y + ap.h + 20);
  const path = (id: string) => p.items.find((it) => it.k === "path" && it.id === id) as Extract<Item, { k: "path" }>;
  for (const [id, t] of [["cfg>ev", ev], ["cfg>mg", mg]] as const) { const q = path(id); expect(q.pts.length).toBe(2); expect(Math.abs(q.pts[0][0] - q.pts[1][0])).toBeLessThan(1); expect(q.pts[1][0]).toBeGreaterThan(t.x); expect(q.pts[1][0]).toBeLessThan(t.x + t.w); }
  const d = path("dep>cfg"); expect(d.pts.length).toBe(2); expect(Math.abs(d.pts[0][1] - d.pts[1][1])).toBeLessThan(1); expect(Math.abs(d.pts[0][0] - (dep.x + dep.w))).toBeLessThan(1); expect(Math.abs(d.pts[1][0] - cfg.x)).toBeLessThan(1);
  const chips = p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] !== undefined);
  for (const c of chips) for (const r of [ap, ev, mg, mi, cfg, dep]) expect(meets(c, r)).toBe(false);
});
test("under in a row names two cards of that row, left to right; lane names keep the band form", () => {
  const bad = compileStage(UNDER.replace("cfg under ev..mg", "cfg under mg..ev"), STEPS(), 1, {}, ROLES);
  expect(bad.errors.map((e) => e.msg)).toEqual([`"under" in a row names two cards of this row, left to right: "d cfg under ap..ev: title"`]);
  const band = compileStage(UNDER.replace("cfg under ev..mg", "cfg under Foreman..The data path"), steps("ap --> ev", "clear"), 1, {}, ROLES);
  expect(band.errors).toEqual([]); expect(band.model.lanes.some((l) => l.span)).toBe(true);
});

// on a phone each label stands by its own arrow, and no other line of its steps runs through it (a scene at 390: "pluck"
// sat on the wrapping line of "send", and "send" at the far left)
for (const w of [390, 360]) test(`phone: each label by its own arrow, no other line through it (${w})`, () => {
  const { p } = lay(ROW, steps("ap --> ev: pluck\nev --> mg: send\nmg --> mi: write", "clear\nap --> ev: pluck\nev --> mg: send"), w);
  const paths = p.items.filter((it): it is Extract<Item, { k: "path" }> => it.k === "path" && /^[a-z]+>[a-z]+$/.test(String(it.id)));
  const near = (q: Extract<Item, { k: "path" }>, c: { x: number; y: number; w: number; h: number }) => Math.min(...q.pts.slice(1).map((b, i) => { const a = q.pts[i]; return Math.max(c.x - Math.max(a[0], b[0]), 0, Math.min(a[0], b[0]) - (c.x + c.w)) + Math.max(c.y - Math.max(a[1], b[1]), 0, Math.min(a[1], b[1]) - (c.y + c.h)); }));
  const through = (q: Extract<Item, { k: "path" }>, c: { x: number; y: number; w: number; h: number }) => q.pts.slice(1).some((b, i) => { const a = q.pts[i]; return Math.max(a[0], b[0]) > c.x + 1 && Math.min(a[0], b[0]) < c.x + c.w - 1 && Math.max(a[1], b[1]) > c.y + 1 && Math.min(a[1], b[1]) < c.y + c.h - 1; });
  const own = { pluck: "ap>ev", send: "ev>mg", write: "mg>mi" } as Record<string, string>;
  for (const c of p.items.filter((it): it is Extract<Item, { k: "box" }> => it.k === "box" && it.bar?.["edge-label"] !== undefined)) {
    const label = String(c.bar!["edge-label"]), mine = paths.find((q) => q.id === own[label] && (q.on ?? []).some((k) => (c.on ?? []).includes(k)))!;
    const under = mine.pts.length === 2 && Math.abs(mine.pts[0][1] - mine.pts[1][1]) < 1 && c.x + c.w / 2 > Math.min(mine.pts[0][0], mine.pts[1][0]) && c.x + c.w / 2 < Math.max(mine.pts[0][0], mine.pts[1][0]) && near(mine, c) < 40; // under its own gap
    expect(near(mine, c) < 24 || under, `${label} near its arrow at ${w}`).toBe(true);
    for (const q of paths) if (q !== mine && q.id !== mine.id && (q.on ?? []).some((k) => (c.on ?? []).includes(k))) expect(through(q, c), `${q.id} through ${label} at ${w}`).toBe(false);
  }
});

// a scene (110.1% of the original's height): a row lane with width to spare lends it to the tallest other lane, so a
// card there that wraps a line less is shorter; the row keeps its cards a line and none of them grows
test("a row lane lends width to a taller lane beside it while its own cards keep their lines and heights", () => {
  const src = "title: Ops | x\n## Control: 2 barrows, fixed\na ctl: the control service | barrows: 2 (fixed) | no hirer and no sorter for it | one barrow per node, at most one away\n  a ra: barrow A | hooks + loop\n  a rb: barrow B | hooks + loop\n## The work path, every tick\nlayout: row\na sr: sources | 1,000 on site\nb wk: workers | 64 of them\nc jn: joiners | 4 of them\nd st: the store\na cf under wk..jn: settings · yards · sets | written by the barrow that holds the lock\nb k1: Lock control-main-work | the first engine · bearer: barrow A\nb k2: Lock control-engine-2 | a second engine · bearer: barrow A\nb k3: Lock control-engine-3 | a third engine · bearer: barrow B\n";
  const ss = steps("hide k1, k2, k3\nsr --> wk: pull\nwk --> jn: send\njn --> st: write\nctl --> cf", "hide sr, wk, jn, st, cf\nshow k1, k2, k3\nclear");
  const { p } = lay(src, ss, 1180);
  const row = ["sr", "wk", "jn", "st"].map((id) => box(p, id));
  expect(new Set(row.map((b) => Math.round(b.y))).size).toBe(1); // one line
  for (const b of [...row, box(p, "k1"), box(p, "cf")]) expect(b.h).toBe(52); // no row card grew
  // the control card got the width to lose a line (lanes by need alone: 199 wide, 238 tall, the stage 308)
  expect(box(p, "ctl").w).toBeGreaterThan(240);
  expect(box(p, "ctl").h).toBeLessThan(238);
  expect(p.h).toBeLessThan(308);
});
