// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "sphone": denser phone forms of the composed stage (tools/stage-phone.ts and its hooks in tools/stage.ts,
// tools/stage-cards.ts, tools/stage-sheet.ts). Never by hiding a fact, never under 11 px: every word stays whole.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, layoutStage, type Compiled } from "../../src/core/stage";
import { FONT, PHONE_FONT, measure, setPhoneFont, type Item } from "../../src/core/stage-core";
/** a word's width as a phone stage measures it (its phone type size) */
const pmeasure = (s: string, f: Parameters<typeof measure>[1]) => { setPhoneFont(true); try { return measure(s, f); } finally { setPhoneFont(false); } };
import { PHONE, phonePer, longestPiece, badgeGeo } from "../../src/core/stage-phone";
import { badgeRows, type Card } from "../../src/core/stage-cards";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
import { checkDoc } from "../../src/core/doccheck";
import { parseDoc } from "../../src/core/dh-lib";

beforeEach(() => { beginDocument(); });

const ROLES = { client: 1, server: 2, store: 3, ops: 6, plain: 0 };
function scene(src: string): Compiled {
  beginDocument(); // its own page budget: a scene built while the file loads does not run on the budget the previous test file left
  const head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/^@step (.*)$/);
    if (m) steps.push({ title: m[1], raw: "", line: i + 1 });
    else if (steps.length) steps[steps.length - 1].raw += (steps[steps.length - 1].raw ? "\n" : "") + l;
    else head.push(l);
  });
  return compileStage(head.join("\n"), steps, 1, {}, ROLES);
}
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const boxes = (items: Item[]) => items.filter((i): i is Box => i.k === "box");
const texts = (items: Item[]) => items.filter((i): i is Text => i.k === "text");
const card = (items: Item[], label: string) => boxes(items).find((b) => b.cls === "scn-shape" && b.bar?.kind === "card" && b.bar?.label === label)!;
const inside = (t: Text, b: Box) => t.x >= b.x && t.x <= b.x + b.w && t.y >= b.y && t.y <= b.y + b.h;
/** plain words (not chips) a connector segment runs through: an independent check of the drawn plan */
function crossings(items: Item[]): string[] {
  const out: string[] = [];
  // phone words at the phone's size: the width the phone draws
  setPhoneFont(true); let ts: { s: string; x0: number; x1: number; y0: number; y1: number }[];
  try { ts = texts(items).filter((t) => t.f !== "chip").map((t) => { const tw = measure(t.s, t.f), x0 = t.anchor === "middle" ? t.x - tw / 2 : t.anchor === "end" ? t.x - tw : t.x; return { s: t.s, x0, x1: x0 + tw, y0: t.y - FONT[t.f].size * 0.75, y1: t.y + FONT[t.f].size * 0.2 }; }); } finally { setPhoneFont(false); }
  for (const it of items) if (it.k === "path") for (let i = 0; i + 1 < it.pts.length; i++) {
    const [[ax, ay], [bx, by]] = [it.pts[i], it.pts[i + 1]];
    for (const t of ts) {
      const hit = ay === by ? ay > t.y0 && ay < t.y1 && Math.max(ax, bx) > t.x0 && Math.min(ax, bx) < t.x1 : ax === bx ? ax > t.x0 && ax < t.x1 && Math.max(ay, by) > t.y0 && Math.min(ay, by) < t.y1 : false;
      if (hit) out.push(`${it.id} through "${t.s}"`);
    }
  }
  return out;
}

// a public dense sample: weather stations reporting to relays, relays storing to an archive
const DENSE = `## Stations
client w1..w6: north-ridge-…-a1b2; south-bay-…-c3d4; east-hill-…-e5f6; west-dock-…-g7h8; lake-…-i9j0; mill-…-k1l2 | reports every minute
... about 400 stations
## Relays
server r0,r1,r9: relay 0; relay 1; relay 9 | 10 s tick: gather, pack
  + (a) copy a; (b) copy b
... 10 relays, 20 copies
## Archive
store ar: archive | keeps a year | same names as | the old feed
ops ctl under Relays..Archive: scheduler: plans → one ledger file (relays, archive URLs); sizes them
@step Report: Each station reports once a minute.
light w*
@step Gather: Each relay gathers its stations.
show r*
tag w1,w4: → relay 0
tag w2,w6: → relay 1
tag w3,w5: → relay 9
r0 --> w1,w4
r1 --> w2,w6
r9 --> w3,w5
inside r*: readings
@step Store: The relays send to the archive.
clear
show ar
r0,r1,r9 --> ar: POST /store
say ar: to both copies
@step Plan: The scheduler writes one file.
show ctl
ctl --> r9,ar: ledger file, checked
@step All: Nothing reads back from the archive.
show all
key client: PULL relay → station (GET); PUSH relay → archive (POST)`;

describe("phone lanes", () => {
  const c = scene(DENSE), phone = layoutStage(c.model, 356), wide = layoutStage(c.model, 1000);
  test("the scene reads with no problems; the phone plan is the stacked one", () => {
    expect(c.errors).toEqual([]);
    expect(phone.narrow).toBe(true);
    expect(wide.narrow).toBe(false);
  });
  test("every word at 11 px or more, and none cut ('…') on the phone", () => {
    for (const t of texts(phone.items)) { expect(FONT[t.f].size).toBeGreaterThanOrEqual(11); expect(t.s.endsWith("…")).toBe(false); }
  });
  test("nothing outside the stage's width", () => {
    for (const b of boxes(phone.items)) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(356 + 0.5); }
  });
  test("the three relays share one row on a phone (three a row is the least tall with every word whole)", () => {
    const ys = ["relay 0", "relay 1", "relay 9"].map((l) => card(phone.items, l).y);
    expect(new Set(ys).size).toBe(1);
  });
  test("a card line's shared second line: once for the lane on a phone, in every card on a wide stage", () => {
    const line = "10 s tick: gather, pack";
    const onPhone = texts(phone.items).filter((t) => t.s === `each: ${line}`), onWide = texts(wide.items).filter((t) => t.s.startsWith("10 s tick")); // said once, it says each:
    expect(onPhone.length).toBe(1);
    expect(["relay 0", "relay 1", "relay 9"].some((l) => inside(onPhone[0], card(phone.items, l)))).toBe(false);
    expect(onWide.length).toBeGreaterThanOrEqual(3);
  });
  test("the lane heading sits above its first card, never on it", () => {
    for (const [h, first] of [["Stations", "north-ridge-…-a1b2"], ["Relays", "relay 0"], ["Archive", "archive"]] as const) {
      const t = texts(phone.items).find((x) => x.s === h)!, b = card(phone.items, first);
      expect(t).toBeDefined();
      expect(t.y).toBeLessThan(b.y);
    }
  });
  test("a phone tag chip sits across its card's top edge and covers no word of the card", () => {
    const tagBoxes = boxes(phone.items).filter((b) => b.cls === "stg-chip" && b.bar?.label?.toString().startsWith("→ relay"));
    expect(tagBoxes.length).toBe(6);
    const cards = boxes(phone.items).filter((b) => b.cls === "scn-shape" && b.bar?.kind === "card");
    for (const t of tagBoxes) {
      const host = cards.find((c) => t.y < c.y && t.y + t.h > c.y && t.x < c.x + c.w && t.x + t.w > c.x)!;
      expect(host).toBeDefined();
      for (const w of texts(phone.items).filter((x) => x.f !== "chip" && inside(x, host))) {
        const tw = measure(w.s, w.f), x0 = w.anchor === "middle" ? w.x - tw / 2 : w.x;
        const overlapX = x0 < t.x + t.w && x0 + tw > t.x, top = w.y - FONT[w.f].size * 0.75;
        if (overlapX) expect(t.y + t.h).toBeLessThanOrEqual(top);
      }
    }
  });
  test("no connector runs through a lane's own words (headings, shared lines, 'and more')", () => {
    expect(crossings(phone.items)).toEqual([]);
  });
  test("a phone keeps every card's fact: each title and badge word is drawn", () => {
    const all = texts(phone.items).map((t) => t.s).join(" ");
    for (const w of ["relay 9", "copy a", "copy b", "archive", "keeps a year", "about 400 stations", "10 relays, 20 copies", "scheduler:"]) expect(all).toContain(w);
  });
  test("badge rows are lower on a phone, and a wide layout after a phone one has its own badge rows again", () => {
    const bPhone = boxes(phone.items).find((b) => b.bar?.label === "copy a")!, bWide = boxes(layoutStage(c.model, 1000).items).find((b) => b.bar?.label === "copy a")!;
    expect(bPhone.h).toBe(24);
    expect(bWide.h).toBe(28);
    expect(badgeGeo().pitch).toBe(34);
  });
});

describe("'and more' in a row's free cells", () => {
  const SRC = `## Shelves
client s1,s2,s3,s4,s5: the long shelf by the door; the second long shelf; a third long shelf; the fourth shelf; a fifth shelf | holds books
... and 40 more
@step One: one.
light s1
@step Two: two.
light s2`;
  test("on a phone, five cards leave a free cell in the last row; the 'and more' line goes there, beside the last card", () => {
    const c = scene(SRC), p = layoutStage(c.model, 356);
    const third = card(p.items, "a fifth shelf"), more = texts(p.items).find((t) => t.s === "and 40 more")!;
    expect(more.y).toBeGreaterThan(third.y);
    expect(more.y).toBeLessThan(third.y + third.h);
    expect(more.x).toBeGreaterThan(third.x + third.w);
  });
});

describe("badges: one row only when each fits its share", () => {
  test("two badges whose sum fits but the longer one not its half go one a row (no '…')", () => {
    const c: Card = { id: "x", role: "client", title: "t", subs: [], badges: [{ b: "a", s: "ab" }, { b: "b", s: "a much longer badge line" }], lane: 0, from: 1, line: 1, kids: [], pills: [], tokens: [] , keys: [] };
    const need = c.badges.reduce((a, b) => a + measure(b.s, "sub") + 40, 0);
    const w = need + 12 + 4; // the sum fits the row
    expect(badgeRows(c, w)).toBe(2);
    const roomy = (measure("a much longer badge line", "sub") + 40) * 2 + 6 + 12 + 2;
    expect(badgeRows(c, roomy)).toBe(1);
  });
});

describe("phonePer", () => {
  test("the count that makes the lane least tall, among the counts where every card is whole; ties keep fewer", () => {
    // 6 cards; at 3 a row each is 60 tall, at 2 a row 50, at 1 a row 40; at 4 a row a word would be cut
    const h = (_: number, cw: number) => (cw > 300 ? 40 : cw > 150 ? 50 : 60);
    const whole = (_: number, cw: number) => cw >= 75;
    const r = phonePer(6, 320, h, whole, () => 0, 2);
    // 1 a row: 6 x 50 = 300; 2 a row: 3 x 60 = 180; 3 a row: 2 x 70 = 140; 4 a row: not whole
    expect(r.per).toBe(3);
    expect(r.h).toBe(2 * (60 + PHONE.rowGap));
  });
  test("no count whole: the stage's own count", () => {
    expect(phonePer(4, 320, () => 40, () => false, () => 0, 2).per).toBe(2);
  });
  test("never under the least card width", () => {
    const r = phonePer(8, 320, () => 40, () => true, () => 0, 1);
    expect((320 - (r.per - 1) * PHONE.colGap) / r.per).toBeGreaterThanOrEqual(PHONE.cardMinW);
  });
  test("longestPiece: a long word may break after -. / _:", () => {
    expect(longestPiece("north-ridge-a1b2", "sub")).toBeLessThan(measure("north-ridge-a1b2", "sub"));
    expect(longestPiece("plain", "sub")).toBe(measure("plain", "sub"));
  });
  test("linear: double the cards, the charge at most about doubles", () => {
    const charge = (n: number) => { const b = beginDocument(newBudget()); phonePer(n, 320, () => 40, () => true, () => 0, 2); return 2_000_000 - b.left().work; };
    expect(charge(80)).toBeLessThanOrEqual(charge(40) * 2 + 4);
  });
  test("a hostile lane (64 cards with long words) lays out on a phone, whole words and all", () => {
    const ids = Array.from({ length: 64 }, (_, i) => `c${i}`).join(",");
    const src = `## Many\nclient ${ids}: ${Array.from({ length: 64 }, (_, i) => `x${"y".repeat(40)}-${i}`).join("; ")} | ${"w ".repeat(60)}\n@step A: a.\nlight c0\n@step B: b.\nlight c1`;
    const c = scene(src); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 340);
    expect(p.h).toBeGreaterThan(0);
    for (const t of texts(p.items)) expect(FONT[t.f].size).toBeGreaterThanOrEqual(11);
  });
});

describe("sheet: the phone form", () => {
  const SRC = `sheet: two bakeries, each with its own ovens | 3 of 7 ovens
desk b0 "bakery 0": bakery north | owns 2 ovens
  plain o1 "oven 1": 4 4 5 5 6 6 6 4
  plain o2 "oven 2": 2 2 2 2 3 3 3 3
desk b1 "bakery 1": bakery south | owns 1 oven
  plain o3 "oven 3": 9 9 9 9 9 9 9 9
=> hub out: head office | adds the parts
@step Loaves: The trays fill.
@step Totals: Each oven's trays, summed.
value o1 o2 o3: sum of 8 | 40, 20, 72
@step Mean: Divided by the trays.
value o1 o2 o3: ÷ 8 | 5.00, 2.50, 9.00`;
  test("a result that does not fit beside the label goes on one line under the cells (22 tall), not a 44 tall box", () => {
    const c = compileStage(SRC.split("@step")[0], SRC.split("\n@step ").slice(1).map((s, i) => ({ title: s.split("\n")[0], raw: s.split("\n").slice(1).join("\n"), line: 20 + i })), 1, {}, { hub: 1, desk: 2, plain: 0 });
    expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356), w = layoutStage(c.model, 1000);
    const vals = boxes(p.items).filter((b) => String(b.id ?? "").startsWith("value:"));
    expect(vals.length).toBeGreaterThan(0);
    for (const v of vals) expect(v.h).toBe(22);
    for (const t of texts(p.items)) { expect(FONT[t.f].size).toBeGreaterThanOrEqual(11); expect(t.s.endsWith("…")).toBe(false); }
    // the wide stage keeps its own form
    expect(boxes(w.items).filter((b) => String(b.id ?? "").startsWith("value:")).every((v) => v.h !== 22)).toBe(true);
  });
  test("the outcome column's header keeps its tight room on a phone (the 16 px under it is the wide stage's)", () => {
    const c = compileStage(SRC.split("@step")[0], SRC.split("\n@step ").slice(1).map((s, i) => ({ title: s.split("\n")[0], raw: s.split("\n").slice(1).join("\n"), line: 20 + i })), 1, {}, { hub: 1, desk: 2, plain: 0 });
    // an outcome column with nothing in it yet: its header alone, 28 + 8 on a phone (no 16 px of air under it)
    const fr = boxes(layoutStage(c.model, 356).items).find((b) => b.id === "out:out")!;
    expect(fr.h).toBeLessThanOrEqual(36);
  });
});

describe("panels reuse the place of hidden lanes", () => {
  const SRC = `## Inputs
client i1,i2,i3: wind; rain; sun | read each minute
## Model
server mo: model | sums them
@step Read: the inputs come in.
i1,i2,i3 --> mo: values
@step Plan: every input is put away; the plan shows.
hide i1,i2,i3,mo
list the plan
  one: run at noon
  two: store the sums
  three: send the report
@step Send: the report goes out.
list the report
  to: the office
  when: noon`;
  const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
  for (const w of [1000, 356]) test(`at ${w}: the panels start where the lanes were; the lanes' things are gone in those steps; nothing moves`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), noHide = layoutStage(scene(SRC.replace("hide i1,i2,i3,mo\n", "")).model, w);
    const lanes = boxes(p.items).filter((b) => b.cls === "stg-region" && (b.bar?.label === "Inputs" || b.bar?.label === "Model"));
    const top = Math.min(...lanes.map((b) => b.y));
    const panelTops = boxes(p.items).filter((b) => (b.bar?.kind === "panel" || b.bar?.kind === "lane" && !lanes.includes(b)) && !shown(b, 1)).map((b) => b.y);
    expect(panelTops.length).toBeGreaterThan(0);
    expect(Math.min(...panelTops)).toBeLessThan(top + 40);
    expect(p.h).toBeLessThan(noHide.h);
    // in the panels' steps no lane heading, card or connector shows
    for (const k of [2, 3]) {
      expect(texts(p.items).some((t) => shown(t, k) && (t.s === "Inputs" || t.s === "Model" || t.s === "wind"))).toBe(false);
      expect(p.items.some((i) => i.k === "path" && shown(i, k))).toBe(false);
    }
    // step 1 still has its lanes and connector
    expect(texts(p.items).some((t) => shown(t, 1) && t.s === "Inputs")).toBe(true);
    expect(p.items.some((i) => i.k === "path" && shown(i, 1))).toBe(true);
  });
  test("no reuse when a step with panels still shows a card", () => {
    const src = SRC.replace("hide i1,i2,i3,mo", "hide i1,i2,i3");
    const p = layoutStage(scene(src).model, 1000);
    const model = boxes(p.items).find((b) => b.bar?.kind === "card" && b.bar?.label === "model")!;
    const panelTops = boxes(p.items).filter((b) => b.bar?.kind === "panel" && !shown(b, 1)).map((b) => b.y);
    expect(Math.min(...panelTops)).toBeGreaterThan(model.y + model.h);
  });
});

describe("a later lane and the panels share the place of the lanes they replace", () => {
  const SRC = `## Inputs
client i1,i2: wind; rain | read each minute
## Plan
server pl: the plan | runs at noon
@step Read: the inputs come in.
i1 --> i2: next
@step Plan: the inputs are put away; the plan and its list show.
hide i1,i2
show pl
list the steps
  one: store the sums
  two: send the report
@step Send: the report goes out.
list the report
  to: the office`;
  const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
  for (const w of [1000, 356]) test(`at ${w}: the later lane starts at the lanes' top, the panels under it (wide: a lone card has them beside it); the first lanes' things are gone later`, () => {
    const c = scene(SRC.replace("## Plan\nserver pl:", "## Plan\nserver pl:")); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    const reg = (t: string) => boxes(p.items).find((b) => b.cls === "stg-region" && b.bar?.label === t)!;
    expect(reg("Plan").y).toBeCloseTo(reg("Inputs").y, 0);
    const pl = boxes(p.items).find((b) => b.id === "pl" && b.cls === "scn-shape")!, panelTops = boxes(p.items).filter((b) => b.bar?.kind === "panel" && !shown(b, 1)).map((b) => b.y);
    if (w < 480) expect(Math.min(...panelTops)).toBeGreaterThan(pl.y + pl.h);
    else expect(Math.min(...panelTops)).toBe(reg("Inputs").y); // a lone card on a wide stage: its panels beside it, from the lanes' top: the place of the lanes they cover
    for (const k of [2, 3]) {
      expect(texts(p.items).some((t) => shown(t, k) && (t.s === "Inputs" || t.s === "wind"))).toBe(false);
      expect(p.items.some((i) => i.k === "path" && shown(i, k))).toBe(false);
    }
    expect(p.items.some((i) => i.k === "path" && shown(i, 1))).toBe(true);
    // the later lane's heading and region show only from its step: never over the first lanes' heading
    expect(texts(p.items).some((t) => shown(t, 1) && t.s === "Plan")).toBe(false);
    expect(boxes(p.items).some((b) => shown(b, 1) && b.cls === "stg-region" && b.bar?.label === "Plan")).toBe(false);
  });
  test("no sharing when a connector touches the later lane", () => {
    const p = layoutStage(scene(SRC.replace("@step Plan:", "@step Plan:").replace("show pl\n", "show pl\ni1 --> pl\n")).model, 1000);
    const reg = (t: string) => boxes(p.items).find((b) => b.cls === "stg-region" && b.bar?.label === t)!;
    expect(reg("Plan").y === reg("Inputs").y && reg("Plan").x === reg("Inputs").x).toBe(false);
  });
});

describe("phase track on a phone", () => {
  const SRC = `track: op Pending, Signalled, Allocated, Rerouted, Done
## Yard
op pl: yard | 32 fields
@step One: it starts.
at Pending
@step Two: it ends.
at Done`;
  const phases = (p: ReturnType<typeof layoutStage>) => boxes(p.items).filter((b) => b.cls === "stg-phase");
  test("five phases on one row, each as wide as its own name, every name whole", () => {
    const p = layoutStage(scene(SRC).model, 356), ph = phases(p);
    expect(new Set(ph.map((b) => b.y)).size).toBe(1);
    for (let i = 1; i < ph.length; i++) expect(ph[i].x).toBeGreaterThan(ph[i - 1].x + ph[i - 1].w);
    expect(Math.max(...ph.map((b) => b.x + b.w))).toBeLessThanOrEqual(356);
    const names = texts(p.items).filter((t) => ["Pending", "Signalled", "Allocated", "Rerouted", "Done"].includes(t.s));
    expect(names.length).toBe(5);
    for (const t of texts(p.items)) expect(t.s.endsWith("…")).toBe(false);
  });
  test("a wide stage keeps equal pills; too many names still wrap on a phone", () => {
    const wide = phases(layoutStage(scene(SRC).model, 1000));
    expect(new Set(wide.map((b) => Math.round(b.w))).size).toBe(1);
    const many = SRC.replace("Done", "Done, Verified, Archived, Reported");
    expect(new Set(phases(layoutStage(scene(many.replace("at Done", "at Reported")).model, 356)).map((b) => b.y)).size).toBeGreaterThan(1);
  });
});

describe("a lone card's heading and long titles on a phone", () => {
  const SRC = `## Stations
client s1,s2: north-station-...-a1b2c; south-station-...-d3e4f | report each minute
## Archive
server ar: archive | keeps a year | of readings
@step Report: the stations send.
s1,s2 --> ar: readings sent to the archive each minute`;
  test("the heading of a one-card lane sits at the card's left, on the card's top line; shorter than a heading row", () => {
    const p = layoutStage(scene(SRC).model, 356);
    const head = texts(p.items).find((t) => t.s === "Archive" && t.f === "lane")!, ar = boxes(p.items).find((b) => b.id === "ar" && b.cls === "scn-shape")!;
    expect(head.x + measure("Archive", "lane")).toBeLessThanOrEqual(ar.x);
    expect(head.y).toBeGreaterThan(ar.y); expect(head.y).toBeLessThan(ar.y + 24);
    for (const t of texts(p.items)) expect(t.s.endsWith("…")).toBe(false);
  });
  test("a wide stage keeps its headings above the cards", () => {
    const p = layoutStage(scene(SRC).model, 1000);
    const head = texts(p.items).find((t) => t.s === "Archive" && t.f === "lane")!, ar = boxes(p.items).find((b) => b.id === "ar" && b.cls === "scn-shape")!;
    expect(head.y).toBeLessThan(ar.y);
  });
  test("a long card title takes a third line on a phone instead of an ellipsis; two lines on a wide stage", () => {
    const src = `## Ops\nops o: planner: reads one order sheet (crates, stall numbers, changes); weighs and sorts them together across the whole yard | runs once\n@step One: x.\n@step Two: y.`;
    const ph = layoutStage(scene(src).model, 356);
    // the card's title lines (whatever font titles use): every word drawn, none cut
    const o = boxes(ph.items).find((b) => b.id === "o" && b.cls === "scn-shape")!, inO = texts(ph.items).filter((t) => t.y > o.y && t.y < o.y + o.h && t.s !== "runs once");
    expect(inO.some((t) => t.s.endsWith("…"))).toBe(false);
    const words = inO.map((t) => t.s).join(" ");
    for (const w of ["planner:", "order", "sorts", "together", "yard"]) expect(words).toContain(w);
    expect(inO.length).toBeGreaterThan(2);
  });
});

describe("a card panel's title stays inside its card", () => {
  test("a long title wraps to the card's width on a phone and beside on a wide stage", () => {
    const src = `## Yard\nop pl: yard | 32\n@step One: x.\ncard op: at 36 fields the planner reads (made-up load) every minute\n  tick weight p90 2.4 s`;
    for (const w of [356, 1000]) {
      const p = layoutStage(scene(src).model, w), fr = boxes(p.items).find((b) => b.cls === "scn-frame" && b.bar?.label?.startsWith("at 36"))!;
      expect(fr).toBeTruthy();
      for (const t of texts(p.items).filter((t) => t.f === "title" && (t.on ? t.on.includes(1) : true) && t.y > fr.y && t.y < fr.y + fr.h)) expect(t.x + (w < 480 ? pmeasure : measure)(t.s, "title")).toBeLessThanOrEqual(fr.x + fr.w);
    }
  });
});

describe("pills wrap instead of cutting their words", () => {
  const SRC = `## Packers
server m0: packer 0 | old steward
  pill p1,p2: Stall East · apples sold per crate across every field of the market; Mixed East figs · no_sale count seen by every trader in the yard
server m1: packer 1 | new steward
@step One: both pills at packer 0.
@step Two: one moves and lights.
move p1 to m1
light p1: → 1`;
  for (const w of [356, 1000]) test(`at ${w}: every pill word is drawn whole, and a pill keeps one height in every step`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w);
    expect(texts(p.items).some((t) => t.s.endsWith("…"))).toBe(false);
    const words = texts(p.items).filter((t) => t.f === "chip").map((t) => t.s).join(" ");
    for (const s of ["Stall", "crate", "market", "no_sale", "yard"]) expect(words).toContain(s);
    const pills = boxes(p.items).filter((b) => b.cls === "stg-pill" && b.id?.startsWith("pill:p1@"));
    expect(new Set(pills.map((b) => b.h)).size).toBe(1);
  });
});

describe("no word cut with '…' on a phone", () => {
  const SRC = `## Inputs
client i1: weather station north-east-coastal-relay-0042 at the harbour mouth | reports wind, rain, sun and pressure every minute to the archive in the valley, with its own clock and a battery that lasts a year | keeps a week of readings if the line is down | sends a heartbeat every ten seconds
@step Read: the station reports.
list the readings
  wind: 12 knots from the north-east, gusting to 30 knots near the harbour mouth, falling after noon as the front passes over the valley
  rain: none
@step Rest: the station sleeps.`;
  test("cards and list panels wrap on a phone; a wide stage keeps its line limits", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const ph = layoutStage(c.model, 356);
    expect(texts(ph.items).filter((t) => t.s.endsWith("…")).map((t) => t.s)).toEqual([]);
    const words = texts(ph.items).map((t) => t.s).join(" ");
    for (const s of ["heartbeat", "valley", "front", "relay-0042"]) expect(words).toContain(s);
  });
});

describe("a step note's title stays inside its band", () => {
  test("a long note title wraps on a phone", () => {
    const src = `## Yard\nops pl: yard | 32\n@step One: x.\nnote: change = last − first: no restart care at all (same as the old ledger) | 105 → 2: a restart\n@step Two: y.`;
    const c = scene(src); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356), band = boxes(p.items).find((b) => b.bar?.kind === "band")!;
    const ts = texts(p.items).filter((t) => t.f === "title" && t.y > band.y && t.y < band.y + band.h);
    expect(ts.length).toBeGreaterThan(1);
    for (const t of ts) expect(t.x + pmeasure(t.s, "title")).toBeLessThanOrEqual(band.x + band.w);
  });
});

describe("bin names on a phone", () => {
  const SRC = `bins: Parcels by depot | parcels
items p1..p4: one; two; three; four
bin ops a "regional depot 0"
bin server b "regional depot 1"
bin ops c "regional depot 2"
ledger: Parcel | Depot
form: table
@step First: in two depots.
into a: p1, p2
into b: p3, p4
@step Second: a third depot.
show c
into c: p2, p4`;
  test("the shared words go once into the header; no bin name word is broken or cut", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356), ts = texts(p.items);
    // either form: the shared words in the header ("regional depot: 0, 1, 2") or whole names in full-width bins
    for (const t of ts) { expect(t.s.endsWith("…")).toBe(false); expect(["regio", "depo", "regiona"].includes(t.s)).toBe(false); }
    const bins = boxes(p.items).filter((b) => b.bar?.kind === "bin");
    for (const b of bins) { const lab = ts.find((t) => t.x > b.x && t.x < b.x + b.w && t.y < b.y + 40)!; expect(lab.x + measure(lab.s, "chip")).toBeLessThanOrEqual(b.x + b.w); }
  });
});

describe("lit columns on a phone", () => {
  const counts = (n: number) => Array.from({ length: n }, (_, i) => 10 + (i % 7)).join(", ");
  const SRC = `columns 40 server: parcels per depot | parcels
@step Thirty-two: 32 depots.
counts 32: ${counts(32)}
@step Forty: eight new depots.
counts 40: ${counts(40)}
light 32..39`;
  const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
  test("eight lit columns side by side: one row of labels (every k-th of the run), none touch in a step", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    for (const w of [356, 360, 390, 1000]) { // 360, 390: the phone widths the bar reads
      const p = layoutStage(c.model, w), at2 = texts(p.items).filter((t) => shown(t, 2) && t.y > 0 && /^\d+(–\d+)?$/.test(t.s)).sort((a, b) => a.x - b.x);
      for (let i = 1; i < at2.length; i++) if (at2[i].y === at2[i - 1].y) expect(at2[i].x - measure(at2[i].s, "sub") / 2).toBeGreaterThan(at2[i - 1].x + measure(at2[i - 1].s, "sub") / 2);
      const run = at2.filter((t) => +t.s >= 32 && +t.s <= 39); expect(new Set(run.map((t) => t.y)).size).toBe(1); expect(run.some((t) => t.s === "32")).toBe(true);
      if (w < 480) expect(run.length).toBeGreaterThanOrEqual(3);
      else expect(at2.some((t) => t.s === "39")).toBe(true);
    }
  });
});

describe("chart line labels on a phone", () => {
  const vals = Array.from({ length: 32 }, (_, i) => (0.6 + ((i * 7) % 9) / 10).toFixed(2)).join(" ");
  const SRC = `bars 32: field · bar = its load ÷ the average | ×
  line average: 1
@step Load: some fields are full.
bars: ${vals}
@step Limit: a limit near the average.
limit 1.1: limit 1.1×`;
  const shown = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
  test("the 'average' and limit labels sit beside the plot, apart, over no bar (they sat on the last bars)", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356);
    const bars = boxes(p.items).filter((b) => String(b.cls ?? "").includes("stg-bar") && shown(b, 2));
    expect(bars.length).toBe(32);
    const labs = texts(p.items).filter((t) => shown(t, 2) && (t.s === "average" || t.s.startsWith("limit")));
    expect(labs.length).toBe(2);
    for (const t of labs) for (const b of bars) {
      const x0 = t.anchor === "end" ? t.x - measure(t.s, t.f) : t.x, x1 = x0 + measure(t.s, t.f), y0 = t.y - FONT[t.f].size, y1 = t.y;
      expect(x1 <= b.x || x0 >= b.x + b.w || y1 <= b.y || y0 >= b.y + b.h).toBe(true);
    }
    expect(Math.abs(labs[0].y - labs[1].y)).toBeGreaterThanOrEqual(12);
    for (const t of labs) expect(t.x + measure(t.s, t.f)).toBeLessThanOrEqual(356 + 1);
  });
});

describe("arrows between stacked cards on a phone", () => {
  const SRC = `## Source
client t: the pens | the same targets
## Pair
server ra: barrow a · one node | plucks every 10 s
  + (a) part 318 · packed · cool
server rb: barrow b · another node | keeps its own baskets
  + (b) part 318 · packed · cool
## Sink
store m: packer | packs exactly one crate
@step Pluck: both barrows pluck the pens.
t --> ra
t --> rb
@step Send: both send to the packer.
ra --> m
rb --> m`;
  test("every arrow's last stretch is long enough to show its head; two arrows into one card end apart", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356), ars = p.items.filter((i) => i.k === "path" && i.arrow && String(i.id).includes(">")) as Extract<Item, { k: "path" }>[];
    expect(ars.length).toBe(4);
    for (const a of ars) { const [[ax, ay], [bx, by]] = a.pts.slice(-2); expect(Math.hypot(bx - ax, by - ay)).toBeGreaterThanOrEqual(10); }
    const intoM = ars.filter((a) => String(a.id).endsWith(">m")).map((a) => a.pts.at(-1)!);
    expect(Math.hypot(intoM[0][0] - intoM[1][0], intoM[0][1] - intoM[1][1])).toBeGreaterThan(20);
  });
});

describe("phone type sizes", () => {
  const core = require("../../src/core/stage-core") as typeof import("../../src/core/stage-core");
  const SRC = `## Inputs
client i1,i2: wind sensor on the north roof; rain gauge by the south gate | read each minute
## Model
server mo: model: sums every input into one forecast for the whole valley | runs each hour
@step Read: the inputs come in.
i1,i2 --> mo: values`;
  test("a phone stage is measured in the phone sizes, never under 11 px; a wide stage keeps the stage's own sizes", () => {
    const P = core.PHONE_FONT;
    expect(Object.keys(P).sort()).toEqual(["body", "chip", "sub", "title"]);
    for (const [f, v] of Object.entries(P)) { expect(v!).toBeGreaterThanOrEqual(11); expect(v!).toBeLessThanOrEqual(FONT[f as keyof typeof FONT].size); }
    const before = JSON.stringify(FONT), wBefore = measure("a wind sensor on the north roof", "body");
    const c = scene(SRC), ph = layoutStage(c.model, 356), wide = layoutStage(c.model, 1000);
    expect(ph.phone).toBe(true); expect(wide.phone).toBeUndefined();
    for (const t of texts(ph.items)) expect(P[t.f] ?? FONT[t.f].size).toBeGreaterThanOrEqual(11);
    // outside a layout, and after a phone one, the stage's own sizes: desktop is untouched
    expect(JSON.stringify(FONT)).toBe(before); expect(measure("a wind sensor on the north roof", "body")).toBe(wBefore);
    expect(core.fontSize("body")).toBe(FONT.body.size);
  });
  test("the paint reads the same values: stage.css draws a phone plan in --stg-phone-<font>, equal to PHONE_FONT", () => {
    const css = require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../src/ui/stage.css"), "utf8") as string;
    const tsx = require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8") as string;
    expect(tsx).toContain(`className={plan.phone ? "stg-svg stg-phone" : "stg-svg"}`);
    for (const [f, v] of Object.entries(core.PHONE_FONT)) {
      expect(css).toContain(`--stg-phone-${f}: ${v}px`);
      expect(css).toContain(`.stg-phone .stg-f-${f} { font-size: var(--stg-phone-${f}); }`);
    }
  });
});

describe("a sheet's result box on a phone", () => {
  const SRC = `sheet: two bakeries | 3 ovens
desk b0 "bakery 0": north | owns 2 ovens
  plain o1 "oven 1": 4 4 5 5
  plain o2 "oven 2": 2 2 2 2
=> hub out: head office | adds the parts
@step Loaves: The trays fill.
@step Mean: one division.
total out: Σ = 16 + 8 => mean per tray | 24 ÷ 8 = 3.00
@step Wrong: the other way.
total out wrong: each oven's mean 4.5 and 2, averaged once more, with no weight at all => mean of the oven means of both bakeries | (4.5 + 2) ÷ 2 = 3.25 (bad struck)`;
  test("label and value side by side when both fit (40 tall, was 64); stacked otherwise; the wide stage keeps them stacked", () => {
    const c = compileStage(SRC.split("@step")[0], SRC.split("\n@step ").slice(1).map((s, i) => ({ title: s.split("\n")[0].split(":")[0], raw: s.split("\n").slice(1).join("\n"), line: 20 + i })), 1, {}, { hub: 1, desk: 2, plain: 0 });
    expect(c.errors).toEqual([]);
    const at = (w: number) => { const p = layoutStage(c.model, w); return { one: boxes(p.items).find((b) => b.id === "total")!, two: boxes(p.items).find((b) => b.id === "total:wrong")!, ts: texts(p.items) }; };
    const ph = at(356), wide = at(1000);
    expect(ph.one.h).toBe(40);
    const lab = ph.ts.find((t) => t.s === "mean per tray")!, val = ph.ts.find((t) => t.s === "24 ÷ 8 = 3.00")!;
    expect(Math.abs(lab.y - val.y)).toBeLessThanOrEqual(3); expect(val.x).toBeGreaterThan(lab.x + pmeasure(lab.s, "sub"));
    expect(val.x + pmeasure(val.s, "big")).toBeLessThanOrEqual(ph.one.x + ph.one.w);
    expect(ph.two.h).toBeGreaterThan(55); // a label too long to share the line: stacked
    expect(wide.one.h).toBe(64); expect(wide.two.h).toBeGreaterThanOrEqual(64); // stacked (the narrow outcome column may wrap the value)
  });
});

describe("lane bottoms on a phone", () => {
  const SRC = `## Pens
client p1,p2,p3: pen one; pen two; pen three | hold 40 books
... about 1,200 targets per region
## Fields
server s0,s1: field zero; field one | pluck
@step Pluck: the fields pluck.
p1,p2 --> s0
p3 --> s1`;
  test("a lane's last card row keeps 6 px to the lane's edge; an 'and more' line sits 9 px under the cards, 14 a line", () => {
    // with no line across the gap under the lane, the 'and more' line stays under the cards (with one, it
    // joins the heading's line where it fits and its line stays as room for the lines; the case after this one)
    const p = layoutStage(scene(SRC.replace("p1,p2 --> s0\np3 --> s1", "light s0")).model, 356), regs = boxes(p.items).filter((b) => b.cls === "stg-region");
    const s1 = boxes(p.items).find((b) => b.id === "s1" && String(b.cls).includes("scn-shape"))!, fields = regs.find((r) => r.y <= s1.y && r.y + r.h >= s1.y + s1.h)!;
    expect(fields.y + fields.h - (s1.y + s1.h)).toBe(6);
    const more = texts(p.items).find((t) => t.s === "about 1,200 targets per region")!, p3 = boxes(p.items).find((b) => b.id === "p3" && String(b.cls).includes("scn-shape"))!;
    expect(more.y - (p3.y + p3.h)).toBeLessThanOrEqual(10 + 9); expect(more.y).toBeGreaterThan(p3.y + p3.h + 12); // clear of the card
    const pens = regs.find((r) => r.y <= p3.y && r.y + r.h >= p3.y + p3.h)!;
    expect(pens.y + pens.h - more.y).toBeLessThanOrEqual(6);
  });
  test("with lines across the gap under the lane, its 'and more' line joins the heading's line and leaves its room", () => {
    const p = layoutStage(scene(SRC).model, 356), plain = layoutStage(scene(SRC.replace("p1,p2 --> s0\np3 --> s1", "light s0")).model, 356);
    const more = texts(p.items).find((t) => t.s === "about 1,200 targets per region")!, head = texts(p.items).find((t) => t.s === "Pens")!;
    expect(more.y).toBe(head.y);
    expect(p.h).toBe(plain.h);
  });
});

describe("a grid of records with verdicts on a phone", () => {
  const SRC = `@step Pens: which pens are kept.
grid 2
  client: web-7f9c8d6b5-k2m4p | 192.0.2.1 · Running [+ kept]
  client: web-7f9c8d6b5-24qdt | 192.0.2.2 · Running [+ kept]
  client: batch-6b7c8d9e0-q4r5s | 192.0.2.3 · Running [- name not web-(.+)]
  client: cron-5a6b7c8d9-t6u7v | 192.0.2.4 · Pending [- phase Pending: drop]
@step Next: x.`;
  test("whole names on one line, the verdict chip at the end of the last line (a compact list, ~54 a record, was 112)", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356), recs = boxes(p.items).filter((b) => b.cls === "scn-shape" && String(b.bar?.label).includes("-"));
    const vs = boxes(p.items).filter((b) => b.cls === "stg-verdict");
    expect(recs.length).toBe(4); expect(vs.length).toBe(4);
    for (const r of recs) expect(r.h).toBeLessThanOrEqual(56);
    for (const v of vs) { const r = recs.find((q) => v.y >= q.y && v.y + v.h <= q.y + q.h - 2)!; expect(r).toBeDefined(); expect(v.x + v.w).toBeLessThanOrEqual(r.x + r.w); }
    for (const n of ["web-7f9c8d6b5-k2m4p", "cron-5a6b7c8d9-t6u7v"]) expect(texts(p.items).some((t) => t.s === n)).toBe(true);
    for (const t of texts(p.items)) expect(t.s.endsWith("…")).toBe(false);
  });
});

describe("a lane's shared line and inside chips on a phone", () => {
  const SRC = `## App pens
client p1..p6: web-a; web-b; web-c; web-d; web-e; web-f | holds 40 books on :8080
## Pickers
server e0,e1,e2: picker field 0; picker field 1; picker field 31 | 10 s tick: pluck, compute
  + (a) barrow a; (b) barrow b
@step Serve: pens serve.
@step Pull: pickers pull.
e0 --> p1
inside e0,e1,e2: samples`;
  test("a line every card of the lane shares is said once with 'each:'; the wide stage keeps it in every card", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const ph = texts(layoutStage(c.model, 356).items).map((t) => t.s), wide = texts(layoutStage(c.model, 1000).items).map((t) => t.s);
    expect(ph.filter((s) => s === "each: holds 40 books on :8080").length).toBe(1);
    expect(ph.some((s) => s === "holds 40 books on :8080")).toBe(false);
    expect(wide.filter((s) => s === "holds 40 books on :8080").length).toBe(6);
    expect(wide.some((s) => s.startsWith("each:"))).toBe(false);
  });
  test("cards whose badges stack on a phone hold one inside chip per badge (6 for 3 cards of 2), as the wide stage does", () => {
    const c = scene(SRC), n = (w: number) => boxes(layoutStage(c.model, w).items).filter((b) => b.bar?.label === "samples").length;
    expect(n(1000)).toBe(6); expect(n(356)).toBe(6);
    const p = layoutStage(c.model, 356), bs = boxes(p.items), chips = bs.filter((b) => b.bar?.label === "samples"), cards = bs.filter((b) => /^e\d$/.test(String(b.id)) && String(b.cls).includes("scn-shape"));
    for (const ch of chips) expect(cards.some((k) => ch.x >= k.x && ch.x + ch.w <= k.x + k.w && ch.y >= k.y && ch.y + ch.h <= k.y + k.h)).toBe(true);
  });
});

describe("phone spacing: roomy records, one-card lane rows, list rows", () => {
  const SRC = `## Expr
ops a: SumNode
## Call
ops b: Call
## Plan
ops p: the plan
  spacing: roomy
  keys: Name; Agg; Measure
@step One: the plan.
fill p Name, Agg, Measure: count_total; SumOf; demo_replies_total
list what it turns away
  most(5, count(a[2d])): unsupported grouping most
  sum(count(a[2d] late 5d)): unsupported: late or @ marker
@step Two: y.`;
  const at = (w: number) => layoutStage(scene(SRC).model, w);
  test("a roomy record row is 16 + 4 on a phone (16 + 9 wide); one-card lanes side by side keep 6 px under the card; list rows 4 apart", () => {
    const ph = at(356), wide = at(1000), ys = (p: ReturnType<typeof at>, s: string[]) => s.map((x) => texts(p.items).find((t) => t.s === x)!.y);
    const [n, g] = ys(ph, ["Name", "Agg"]), [wn, wg] = ys(wide, ["Name", "Agg"]);
    expect(g - n).toBe(20); expect(wg - wn).toBe(25);
    const a = boxes(ph.items).find((b) => b.id === "a" && String(b.cls).includes("scn-shape"))!, reg = boxes(ph.items).find((b) => b.cls === "stg-region" && b.x <= a.x && b.x + b.w >= a.x + a.w && b.y <= a.y && b.y + b.h >= a.y + a.h)!;
    expect(reg.x + 1).toBeLessThan(ph.w / 2); expect(reg.y + reg.h - (a.y + a.h)).toBe(6);
    const vs = [texts(ph.items).filter((t) => t.s.startsWith("unsupported grouping"))[0].y], v2 = texts(ph.items).filter((t) => t.s.startsWith("unsupported: late"))[0].y;
    expect(v2 - vs[0]).toBeLessThanOrEqual(2 * 16 + 4);
  });
});

describe("a scene's phone forms", () => {
  test("a plain table row on a phone keeps each cell's tone (a moved value and its 'moves at' stay toned)", () => {
    const c = scene(`@step Rows: x.\nrows plain\n  ^ address | field\n  192.0.2.1:8080 ; web-a | ! 32 ; ! moves at 33\n  192.0.2.2:8080 ; web-b | 11\n@step Two: y.`);
    expect(c.errors).toEqual([]);
    const ts = texts(layoutStage(c.model, 356).items);
    expect(ts.find((t) => t.s === "32")?.ink).toBe("warn:ink"); expect(ts.find((t) => t.s === "moves at 33")?.ink).toBe("warn:ink");
    expect(ts.find((t) => t.s === "11")?.ink).not.toBe("warn:ink");
    for (const w of ["192.0.2.1:8080", "web-a", "192.0.2.2:8080", "web-b"]) expect(ts.some((t) => t.s === w || t.s.includes(w))).toBe(true);
  });
  test("one row of columns on a phone is at most half full; a wide stage keeps its own share", () => {
    const counts = Array.from({ length: 32 }, (_, i) => 20 + (i % 9)).join(", ");
    const c = scene(`columns 32 server: parcels | parcels\n@step One: x.\ncounts 32: ${counts}\n@step Two: y.`);
    expect(c.errors).toEqual([]);
    const col = (w: number) => boxes(layoutStage(c.model, w).items).find((b) => b.id === "col:0")!;
    const dots = (w: number) => { const p = layoutStage(c.model, w), k = col(w), ds = boxes(p.items).filter((b) => b.cls === "stg-dot-u" && b.x >= k.x && b.x < k.x + k.w); return Math.max(...ds.map((d) => k.y + k.h - d.y)); };
    expect(dots(356) / col(356).h).toBeLessThanOrEqual(0.55);
  });
});

describe("a lone card beside its steps' panels on a wide stage", () => {
  const SRC = `## Inputs
client i1,i2: wind; rain | read each minute
## Model
server mo: model | sums them
## Ledger
ops cfg: rendered ledger | barrows: 32 | moves: none
@step Read: the inputs come in.
i1,i2 --> mo: values
@step Signalled: the ledger shows.
hide i1,i2,mo
show cfg
list Signalled: new fields
  one: field 32
  two: field 33
@step Allocated: two ticks.
list Allocated: tick numbers
  warm: 848
  switch: 869`;
  test("wide: the card in the left ~30%, the panels at its right from the lanes' top (the place of the lanes they cover, heading row included); a phone keeps them under the card", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    for (const w of [1000, 1280]) {
      const p = layoutStage(c.model, w), cfg = boxes(p.items).find((b) => b.id === "cfg" && String(b.cls).includes("scn-shape"))!;
      const pans = boxes(p.items).filter((b) => b.bar?.kind === "panel");
      expect(pans.length).toBeGreaterThan(0);
      expect(cfg.x + cfg.w).toBeLessThanOrEqual(0.33 * w);
      const top = boxes(p.items).find((b) => b.cls === "stg-region" && b.bar?.label === "Inputs")!.y;
      for (const q of pans) { expect(q.x).toBeGreaterThan(cfg.x + cfg.w + 12); expect(q.y).toBe(top); expect(q.y).toBeLessThan(cfg.y); expect(q.x + q.w).toBeLessThanOrEqual(w); }
    }
    const ph = layoutStage(c.model, 356), cfg = boxes(ph.items).find((b) => b.id === "cfg" && String(b.cls).includes("scn-shape"))!;
    for (const q of boxes(ph.items).filter((b) => b.bar?.kind === "panel")) expect(q.y).toBeGreaterThanOrEqual(cfg.y + cfg.h);
  });
});

describe("a table's short cells on a phone (lever a)", () => {
  const SRC = `@step Switch: stewards change.
rows
  tick ≥ 869: every pen uses the new stewards
  web-a-…-k2x9m ; read by part 32 only | part 7 · old home ; lets it go, no wait | => server: part 32 · new home ; reads + SENDS
  web-b-…-p4r7t ; read by part 29 only | part 29 · home before and after ; stays | => server: like 900 of 1,000 ; unchanged
@step Two: y.`;
  test("two text cells that fit half the width share a line; the chip after them; every word drawn", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356), ts = texts(p.items), at = (s: string) => ts.find((t) => t.s === s)!;
    expect(at("web-a-…-k2x9m").y).toBe(at("part 7 · old home").y);
    expect(at("part 7 · old home").x).toBeGreaterThan(at("web-a-…-k2x9m").x + pmeasure("web-a-…-k2x9m", "sub"));
    const chip = boxes(p.items).find((b) => b.cls === "scn-shape" && b.role === "server")!;
    expect(chip.y).toBeGreaterThan(at("lets it go, no wait").y - 14); // the review's compact row: the chip under the pair, or at the end of its last line
    for (const w of ["read by part 32 only", "lets it go, no wait", "stays"]) expect(ts.some((t) => t.s === w)).toBe(true);
    expect(ts.some((t) => t.s.startsWith("part 29 · home before"))).toBe(true);
    for (const t of ts) expect(t.s.endsWith("…")).toBe(false);
  });
});

describe("a wide table's row of two-line cells is ~50 px, as the originals", () => {
  const SRC = `@step Switch: stewards change.
rows
  web-a-…-k2x9m ; read by part 32 only | part 7 · old home ; lets it go, no wait | => server: part 32 · new home ; reads + SENDS
  web-b-…-p4r7t ; read by part 29 only | part 29 · home before and after ; stays | => server: like 900 of 1,000 ; unchanged
@step Two: y.`;
  for (const w of [1000, 1280]) test(`at ${w}: rows of 50, both lines inside the row, the second under the first`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), rows = boxes(p.items).filter((b) => b.bar?.kind === "worksheet-row"), ts = texts(p.items);
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.h).toBeLessThanOrEqual(50);
    const a = ts.find((t) => t.s === "web-a-…-k2x9m")!, b = ts.find((t) => t.s === "read by part 32 only")!, r0 = rows[0];
    expect(b.y - a.y).toBeGreaterThanOrEqual(15);
    expect(a.y - 11).toBeGreaterThanOrEqual(r0.y + 4); expect(b.y + 4).toBeLessThanOrEqual(r0.y + r0.h - 4);
  });
});

describe("a plain table's row on a phone keeps its cells apart", () => {
  const SRC = `@step Jump: stewards move.
rows plain
  ^ address (pen) | before | after | _
  192.0.2.29:8080 ; web-app-…-h5n2q | => server: 28 | => server: 28 | ! moves at 40
  192.0.2.73:8080 ; web-log-…-v8c3d | => server: 22 | => server: 22 | ~ stays
@step Two: y.`;
  for (const w of [356, 360, 390]) test(`at ${w}: a gap between a cell's lines, no '·' at a line's start or end, a two-line row breaks between cells`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const ts = texts(layoutStage(c.model, w).items).filter((t) => t.f === "body"), at = (s: string) => ts.find((t) => t.s === s)!;
    const ad = at("192.0.2.29:8080"), pen = at("web-app-…-h5n2q");
    if (pen.y === ad.y) expect(pen.x - (ad.x + pmeasure(ad.s, "body"))).toBeGreaterThanOrEqual(6);
    const lines = new Map<number, typeof ts>(); for (const t of ts) lines.set(t.y, [...(lines.get(t.y) ?? []), t]);
    for (const l of lines.values()) { const s = l.sort((a, b) => a.x - b.x); expect(s[0].s).not.toBe("·"); expect(s[s.length - 1].s).not.toBe("·"); }
    for (const last of ["moves at 40", "stays"]) { const t = at(last), mates = lines.get(t.y)!; expect(mates.length).toBeGreaterThan(1); }
  });
});

describe("a later run on screen only with the place's last run reuses the place too (phone)", () => {
  const SRC = `## Path
client ap: app pens | 1,000
server ev: pickers | 64 pens
store mi: the store
ops l1: Lock main | bearer: pen A
ops l2: Lock two | bearer: pen A
ops l3: Lock three | bearer: pen B
@step One: the path.
hide l1, l2, l3
ap --> ev: pluck
@step Two: one ticket.
hide ap, ev, mi, l2, l3
show l1
@step Three: three tickets.
hide ap, ev, mi
show l1, l2, l3`;
  test("at 356: the second and third tickets sit in the hidden cards' place, beside and under the first", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 356), card = (id: string) => boxes(p.items).find((b) => b.id === id && String(b.cls).includes("scn-shape"))!;
    const top = card("ap").y;
    expect(card("l1").y).toBe(top); expect(card("l2").y).toBe(top);
    expect(card("l3").y).toBeLessThan(card("mi").y + card("mi").h + 60);
    const wide = layoutStage(c.model, 1280), wc = (id: string) => boxes(wide.items).find((b) => b.id === id && String(b.cls).includes("scn-shape"))!;
    expect(wc("l2")).toBeTruthy();
  });
});

describe("arrows out of the cards in a box keep off box edges and show their heads (phone)", () => {
  const SRC = `## Sources
client t: the web pens | the same targets
  ends: on this card
  client p1..p3: web-1 :8080; web-2 :8080; web-3 :8080
## Servers in region seven: two copies
server ra: copy a · one node | part · warm
server rb: copy b · another node | part · warm
@step Same pens: both copies read them.
p1 --> ra
p3 --> rb
@step Two: y.`;
  for (const w of [356, 360, 390]) test(`at ${w}: the foot card drops straight into its target; no stretch inside a card or along an edge closer than 4 px; last stretch 8 px or more`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), cards = boxes(p.items).filter((b) => b.bar?.kind === "card" && String(b.cls).includes("scn-"));
    const arrows = p.items.filter((i): i is Item & { pts: [number, number][]; id: string } => i.k === "path" && !!(i as any).arrow);
    const drop = arrows.find((a) => a.id.endsWith(">rb"))!;
    expect(drop.pts.length).toBe(2); expect(drop.pts[0][0]).toBe(drop.pts[1][0]);
    for (const a of arrows) {
      const [fid, tid] = a.id.split(">"), last = a.pts.at(-1)!, prev = a.pts.at(-2)!;
      expect(Math.hypot(last[0] - prev[0], last[1] - prev[1])).toBeGreaterThanOrEqual(8);
      for (let s = 0; s + 1 < a.pts.length; s++) { const [[x1, y1], [x2, y2]] = [a.pts[s], a.pts[s + 1]];
        for (const b of cards) { if (b.id === fid || b.id === tid || b.id === "t") continue;
          if (Math.abs(y1 - y2) < 0.5 && Math.min(Math.max(x1, x2), b.x + b.w) - Math.max(Math.min(x1, x2), b.x) > 2) expect(y1 <= b.y - 4 || y1 >= b.y + b.h + 4).toBe(true);
          if (Math.abs(x1 - x2) < 0.5 && Math.min(Math.max(y1, y2), b.y + b.h) - Math.max(Math.min(y1, y2), b.y) > 2) expect(x1 <= b.x - 4 || x1 >= b.x + b.w + 4).toBe(true);
        } }
    }
  });
});

describe("a side-channel route with a hidden head takes the gap instead (phone)", () => {
  const SRC = `## Terms
client t1: batch term | from the reads
client t2: tick term | from the clock
client t3: busiest-part term | from the fields
## Bound
server bd: biggest crate, capped | the most it may be
## Yard
store pl: yard main | the pickers
@step Read: the terms meet.
t1 --> bd
t2 --> bd
t3 --> bd
bd --> pl
@step Two: y.`;
  for (const w of [356, 390]) test(`at ${w}: the third term's line goes down, across the gap, down into the bound card, its head shown, off the pool card`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), cards = boxes(p.items).filter((b) => b.bar?.kind === "card" && String(b.cls).includes("scn-"));
    const a = p.items.find((i) => i.k === "path" && (i as any).id === "t3>bd") as any, bd = cards.find((b) => b.id === "bd")!, pl = cards.find((b) => b.id === "pl")!;
    const last = a.pts.at(-1), prev = a.pts.at(-2);
    expect(Math.hypot(last[0] - prev[0], last[1] - prev[1])).toBeGreaterThanOrEqual(8);
    expect(last[1]).toBe(bd.y);
    for (const [x, y] of a.pts) expect(x > pl.x - 4 && x < pl.x + pl.w + 4 && y > pl.y - 4 && y < pl.y + pl.h + 4).toBe(false);
  });
});

describe("'[chip]' on a rows row: each cell a boxed chip inside the same row height", () => {
  const rowsSrc = (chip: boolean) => `@step Switch: stewards change.
rows
  web-a-…-k2x9m ; read by part 32 only | part 7 · old home ; lets it go, no wait | part 32 · new home ; reads + SENDS${chip ? " [chip]" : ""}
  web-b-…-p4r7t ; read by part 29 only | part 29 · home before and after ; stays | ${chip ? "=> server: " : ""}like 900 of 1,000 ; unchanged${chip ? " [chip]" : ""}
@step Two: y.`;
  for (const w of [356, 390, 1000, 1280]) test(`at ${w}: one chip per text cell, inside its row, stamped as a chip; no growth; words inside their chip`, () => {
    const a = scene(rowsSrc(true)), b = scene(rowsSrc(false)); expect(a.errors).toEqual([]);
    const pa = layoutStage(a.model, w), pb = layoutStage(b.model, w);
    expect(pa.h).toBe(pb.h);
    const rows = boxes(pa.items).filter((x) => x.bar?.kind === "worksheet-row"), chips = boxes(pa.items).filter((x) => String(x.cls).includes("stg-cell-chip"));
    expect(chips.length).toBe(6); // every cell, the role cell too (a role cell in a [chip] row is the row's chip in its role's colours, as tall as plain words)
    for (const c of chips) {
      expect(c.bar?.kind).toBe("chip");
      const r = rows.find((q) => c.y >= q.y && c.y + c.h <= q.y + q.h)!; expect(r).toBeTruthy();
      expect(c.x).toBeGreaterThanOrEqual(r.x + 4); expect(c.x + c.w).toBeLessThanOrEqual(r.x + r.w - 4);
      for (const t of texts(pa.items).filter((t) => c.bar!.label!.includes(t.s) && t.y > c.y && t.y < c.y + c.h)) { expect(t.x).toBeGreaterThanOrEqual(c.x + 2); expect(t.y).toBeLessThanOrEqual(c.y + c.h); }
    }
    for (const c of chips) for (const d of chips) if (c !== d && Math.abs(c.y - d.y) < 1) expect(c.x + c.w <= d.x - 4 || d.x + d.w <= c.x - 4).toBe(true);
    expect(boxes(pb.items).some((x) => String(x.cls).includes("stg-cell-chip"))).toBe(false);
  });
});

describe("each arrow out of a box takes its own short route (phone)", () => {
  const SRC = `## Sources
client t: the web pens | the same targets
  ends: on this card
  client p1..p3: web-1 :8080; web-2 :8080; web-3 :8080
## Servers in region seven: two copies
server ra: copy a · one node | part · warm
server rb: copy b · another node | part · warm
@step Same pens: both copies read them.
p1 --> ra
p3 --> rb
@step Two: y.`;
  for (const w of [356, 360, 390]) test(`at ${w}: web-1 leaves left, down the strip beside the box, into copy a; no shared stretch with web-3's line; no line through a heading`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), bx = boxes(p.items), arrows = p.items.filter((i) => i.k === "path" && (i as any).arrow) as any[];
    const box = bx.find((b) => b.id === "t" && String(b.cls).includes("scn-"))!, ra = bx.find((b) => b.id === "ra" && String(b.cls).includes("scn-"))!;
    const a = arrows.find((q) => q.id.endsWith(">ra")), b = arrows.find((q) => q.id.endsWith(">rb"));
    expect(Math.max(...a.pts.map((q: number[]) => q[0]))).toBeLessThanOrEqual(a.pts[0][0]); expect(a.pts[0][0]).toBeLessThan(box.x + 12); // out of the left side, never round the far side
    expect(a.pts.at(-1)[1]).toBe(ra.y);
    const segs = (q: any) => q.pts.slice(1).map((e: number[], i: number) => [q.pts[i], e]);
    for (const [s1, e1] of segs(a)) for (const [s2, e2] of segs(b)) {
      const sameX = Math.abs(s1[0] - e1[0]) < 0.5 && Math.abs(s2[0] - e2[0]) < 0.5 && Math.abs(s1[0] - s2[0]) < 2, sameY = Math.abs(s1[1] - e1[1]) < 0.5 && Math.abs(s2[1] - e2[1]) < 0.5 && Math.abs(s1[1] - s2[1]) < 2;
      expect(sameX || sameY).toBe(false);
    }
    for (const t of texts(p.items).filter((t) => t.f === "lane")) { const tw = pmeasure(t.s, "lane");
      for (const q of arrows) for (const [s1, e1] of segs(q)) if (Math.abs(s1[0] - e1[0]) < 0.5) expect(s1[0] > t.x - 2 && s1[0] < t.x + tw + 2 && Math.min(s1[1], e1[1]) < t.y + 4 && Math.max(s1[1], e1[1]) > t.y - 12).toBe(false); }
  });
});

describe("a chip row's blank '_' cell draws nothing; a '- ' cell is a dashed dropped chip", () => {
  const SRC = `@step Switch: stewards change.
rows
  web-a-…-k2x9m ; read by part 32 only | - part 7 · old home ; lets it go, no wait | => server: part 32 · new home ; reads + SENDS [chip]
  web-b-…-p4r7t ; read by part 29 only | part 29 · home before and after ; stays | _ [chip]
@step Two: y.`;
  for (const w of [356, 1000, 1280]) test(`at ${w}`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), chips = boxes(p.items).filter((x) => String(x.cls).includes("stg-cell-chip"));
    expect(chips.length).toBe(5); // two address cells, the dropped old steward, the new steward (a role cell), the kept steward; no chip for "_"
    const drop = chips.filter((x) => String(x.cls).includes("stg-cell-dropped"));
    expect(drop.length).toBe(1); expect((drop[0] as any).dash).toBe(true); expect(drop[0].bar?.label).toBe("part 7 · old home lets it go, no wait");
    expect(texts(p.items).some((t) => t.s === "_" || t.s === "–" || t.s.startsWith("- "))).toBe(false);
    expect(texts(p.items).some((t) => t.s === "part 7 · old home")).toBe(true);
  });
});

describe("a heading wider than the phone wraps", () => {
  const SRC = `## Left
client a: A | one
## Right
server b: B | two
## The library's parser builds the tree; our checker accepts one shape: under Left..Right
store c: the shape | a sum by labels
@step One: x.
a --> b
@step Two: y.`;
  for (const w of [356, 360, 390]) test(`at ${w}: every heading word drawn, none past the right edge; the band's card under its last line`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), hs = texts(p.items).filter((t) => t.f === "lane");
    for (const t of hs) expect(t.x + pmeasure(t.s, "lane")).toBeLessThanOrEqual(w - 4);
    expect(hs.map((t) => t.s).join(" ")).toContain("The library's parser builds the tree; our checker accepts one shape:");
    const last = Math.max(...hs.filter((t) => /parser|checker|shape/.test(t.s)).map((t) => t.y)), card = boxes(p.items).find((b) => b.id === "c" && String(b.cls).includes("scn-"))!;
    expect(card.y).toBeGreaterThan(last);
  });
});

describe("doccheck knows a rows cell '_' and '- words' (SPEC/BLOCKS)", () => {
  const page = (body: string) => parseDoc("t.dh.md", `---\ntitle: T\nroles:\n  client: c1\n  server: c2\n---\n\n# T\n\n${body}\n`);
  const issues = (rowLine: string) => { const d = page("```animation\n## A\nclient a: A\n@step One: x\nrows\n" + rowLine + "\n@step Two: y\n```"); const out: any[] = []; checkDoc(d, undefined, out); return out.filter((i) => i.level === "error"); };
  test("'_' and '- words' (with or without [chip]) pass; a '-' with no words is refused with its line", () => {
    expect(issues("  web-1 ; 192.0.2.1 | - part 7 · old home ; drops it | _")).toEqual([]);
    expect(issues("  web-1 ; 192.0.2.1 | - part 7 · old home ; drops it | _ [chip]")).toEqual([]);
    const bad = issues("  web-1 ; 192.0.2.1 | - | _");
    expect(bad.some((i) => /a dropped cell is "- words"/.test(i.msg))).toBe(true);
  });
});

describe("moved pills stand in the order the move line lists them", () => {
  const SRC = `## Workers
server w0: worker 0 | old home
  pill p1,p2: Panel EU · error; Mixed EU iOS · no_reply
server w1: worker 1 | old home
  pill p3,p4: Panel EU · slow; Mixed EU · error
server w2: worker 2 | new home
@step One: x.
@step Move: four pills move.
move p3,p4,p2 to w2
@step Three: y.`;
  for (const w of [356, 1280]) test(`at ${w}: in the new card the pills run p3, p4, p2 (the move line), not p2 first (its first card's order)`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), w2 = boxes(p.items).find((b) => b.id === "w2" && String(b.cls).includes("scn-"))!;
    const on2 = (b: any) => (b.on ? b.on.includes(2) : 2 >= (b.from ?? 1) && (!b.to || 2 <= b.to));
    const ps = boxes(p.items).filter((b) => String(b.cls).includes("stg-pill") && on2(b) && b.y >= w2.y && b.y < w2.y + w2.h).sort((a, b) => a.y - b.y || a.x - b.x);
    expect(ps.map((b) => b.bar?.label)).toEqual(["Panel EU · slow", "Mixed EU · error", "Mixed EU iOS · no_reply"]);
  });
});

describe("a phone plan whose arrows never use the right-hand channel gives that width to its lanes", () => {
  const straight = `## Readers
client a: the reader | reads every minute
## Workers
server b: the worker | sums the reads
## Stores
store c: the store | keeps a week of reads
## Views
client d: the view | shows the sums
@step One: x.
a --> b: reads
c --> d: shows
@step Two: y.`;
  const around = `## Top
client a1,a2: first reader | one; second reader | two
## Middle
server m1,m2: first worker | one; second worker | two
## Bottom
store b: the store | keeps a week
@step One: x.
a2 --> b: around
@step Two: y.`;
  for (const w of [356, 390]) test(`at ${w}: straight arrows only: the lanes reach the right edge less the pad; an arrow that needs the channel keeps it`, () => {
    const p = layoutStage(scene(straight).model, w), regs = boxes(p.items).filter((b) => b.cls === "stg-region");
    expect(Math.max(...regs.map((r) => r.x + r.w))).toBeGreaterThan(w - 8 - 22 + 4); // no 22 px channel kept on the right
    const q = layoutStage(scene(around).model, w), arrows = q.items.filter((i) => i.k === "path" && (i as any).arrow) as any[];
    const usesChan = arrows.some((a) => a.pts.some(([x]: number[]) => x > w - 8 - 22 + 2));
    const qr = boxes(q.items).filter((b) => b.cls === "stg-region");
    if (usesChan) expect(Math.max(...qr.map((r) => r.x + r.w))).toBeLessThanOrEqual(w - 8 - 22 + 0.5);
    for (const a of arrows) for (const [x] of a.pts) expect(x).toBeLessThanOrEqual(w - 4);
  });
});

describe("a card that fills the panels right of a lone card is a card for the bar", () => {
  const SRC = `## Inputs
client i1,i2: wind; rain | read each minute
## Ledger
ops cfg: rendered ledger | barrows: 32 | moves: none
@step Read: the inputs come in.
i1 --> i2: next
@step Allocated: the ledger shows.
hide i1,i2
show cfg
card ops: Allocated: two tick numbers
  warm: tick 848
  switch: tick 869`;
  test("wide: the card op panel right of the lone card stamps card (it does not span the stage); it starts at the lanes' top", () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    for (const w of [1000, 1178]) {
      const p = layoutStage(c.model, w), fr = boxes(p.items).find((b) => b.cls === "scn-frame" && b.bar?.label === "Allocated: two tick numbers")!;
      expect(fr).toBeTruthy(); expect(fr.bar?.kind).toBe("card");
      expect(fr.y).toBe(boxes(p.items).find((b) => b.cls === "stg-region" && b.bar?.label === "Inputs")!.y);
    }
  });
});

describe("a wrapped heading keeps its steps", () => {
  const LONG = "the parser builds the tree from the query text; the checker accepts one shape only";
  // a band ("## Title: under A..B") whose caption is wider than a phone, as a scene
  const SRC = `## Reader
client a: the reader | reads every minute
## Writer
client w: the writer | writes every minute
## ${LONG}: under Reader..Writer
server b: the checker | one shape
@step One: only the reader.
hide ## ${LONG}
hide b
@step Two: the checker shows.
show ## ${LONG}
show b
@step Three: y.`;
  for (const w of [356, 390, 1000]) test(`at ${w}: every line of the heading shows from step 2, none in step 1`, () => {
    const c = scene(SRC); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), on = (t: any, k: number) => (t.on ? t.on.includes(k) : k >= (t.from ?? 1) && (!t.to || k <= t.to));
    const lines = texts(p.items).filter((t) => t.f === "lane" && ((t as any).tip?.startsWith(LONG) || LONG.includes(t.s.replace(/:$/, "")) || t.s.startsWith("the parser")) && t.s !== "Reader" && t.s !== "Writer");
    expect(lines.length).toBeGreaterThan(w < 480 ? 1 : 0);
    expect(lines.map((t) => t.s).join(" ").replace(/\s+/g, " ")).toContain("accepts one shape only");
    for (const t of lines) { expect(on(t, 1)).toBe(false); expect(on(t, 2)).toBe(true); }
  });
});

describe("a role cell in a [chip] row is the row's chip in the role's colours, no taller", () => {
  const row = (c: string) => `@step Warm: both read.
rows
  web-a ; read by two parts | part 7 · old home ; reads + SENDS | ${c} [chip]
  web-b ; read by one part | part 29 · home ; stays | _ [chip]
@step Two: y.`;
  for (const w of [356, 1178]) test(`at ${w}: '=> client: words' draws a boxed chip in client's colours, its lines as the plain cell's, the row as tall as with plain words`, () => {
    const a = scene(row("=> client: part 32 · new home ; reads, fills only")), b = scene(row("part 32 · new home ; reads, fills only"));
    expect(a.errors).toEqual([]); expect(b.errors).toEqual([]);
    const pa = layoutStage(a.model, w), pb = layoutStage(b.model, w);
    const chip = boxes(pa.items).find((x) => String(x.cls).includes("stg-cell-chip") && x.bar?.label?.startsWith("part 32"))!;
    expect(chip).toBeTruthy(); expect(chip.role).toBe("client"); expect(chip.bar?.role).toBe("client"); expect(String(chip.fill)).toBe("role:client:soft");
    const plain = boxes(pb.items).find((x) => String(x.cls).includes("stg-cell-chip") && x.bar?.label?.startsWith("part 32"))!;
    expect(chip.h).toBe(plain.h); expect(pa.h).toBe(pb.h);
    expect(texts(pa.items).some((x) => x.s === "reads, fills only")).toBe(true);
  });
});

describe("'; ' in a card panel's line splits it into display lines, as in a rows cell", () => {
  const SRC = (sep: string) => `@step Done: plain again.
card server: Done: 36 parts, no change
  status: 36${sep}pens: nothing changes${sep}sorts again once calm
@step Two: y.`;
  for (const w of [356, 1178]) test(`at ${w}: three lines, each its own, the same as three source lines`, () => {
    const a = scene(SRC(" ; ")), b = scene(SRC("\n  ")); expect(a.errors).toEqual([]); expect(b.errors).toEqual([]);
    const pa = layoutStage(a.model, w), pb = layoutStage(b.model, w);
    for (const s of ["status: 36", "pens: nothing changes", "sorts again once calm"]) expect(texts(pa.items).some((t) => t.s === s)).toBe(true);
    expect(texts(pa.items).some((t) => t.s.includes(" ; "))).toBe(false);
    expect(pa.h).toBe(pb.h);
  });
});
