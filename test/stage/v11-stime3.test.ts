// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// a tick label's own reveal (@N), separated cells ("cells: 1 | apart"), the zoom inset's caption bracket ("| bracket").
import { beforeEach, expect, test } from "bun:test";
import { tiedToCell } from "./v11-tied-helper";
import { compileStage, layoutStage, stageLlm, type Plan } from "../../src/core/stage";
import { type Item, measure, fontSize, setPhoneFont } from "../../src/core/stage-core";
import { beginDocument, newBudget, BudgetError, DOC_WORK } from "../../src/core/stage-budget";

const roles = { job: 1, server: 2 };
const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Step ${i + 1}`, raw: "", line: 40 + i }));
const compile = (head: string, n = 3, ss = steps(n)) => compileStage(head, ss, 1, {}, roles);
const on = (i: Item, s: number) => (!i.from || i.from <= s) && (!i.to || i.to >= s) && (!i.on || i.on.includes(s));
/** where a thing is drawn, without its steps: two layouts with the same geometry give the same list */
const geometry = (p: Plan) => p.items.map((i) => JSON.stringify({ k: i.k, x: (i as any).x, y: (i as any).y, w: (i as any).w, h: (i as any).h, pts: (i as any).pts, s: (i as any).s }));
const texts = (p: Plan, word: string) => p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s.includes(word));
beforeEach(() => beginDocument());

// ---------------------------------------------------------------- (a) a tick label shows from its step
const tickSrc = (reveal: boolean) => `time: 0..11 | hours
cells: 1
ticks: 0 start, 3 first ▲ event${reveal ? " @2" : ""}, 7 later ▲ warm${reveal ? " @3..3" : ""}, 9 "end ▲ done"${reveal ? " @3" : ""}
row job a "A": +x 0..3; +y 3..11 @2`;

test("a tick label's words show from its @N step; its tick and every place stay where they are", () => {
  const c = compile(tickSrc(true)), base = compile(tickSrc(false));
  expect(c.errors).toEqual([]); expect(base.errors).toEqual([]);
  for (const w of [1000, 390, 340]) {
    const p = layoutStage(c.model, w), q = layoutStage(base.model, w);
    expect(p.h).toBe(q.h);
    expect(geometry(p)).toEqual(geometry(q)); // nothing moves: only the label words' steps differ
    const ev = texts(p, "event"), warm = texts(p, "warm"), done = texts(p, "done"), start = texts(p, "start");
    expect(ev.length).toBeGreaterThan(0); expect(warm.length).toBeGreaterThan(0); expect(done.length).toBeGreaterThan(0); expect(start.length).toBe(1);
    for (const t of ev) { expect(on(t, 1)).toBe(false); expect(on(t, 2)).toBe(true); expect(on(t, 3)).toBe(true); }
    for (const t of warm) { expect(on(t, 2)).toBe(false); expect(on(t, 3)).toBe(true); }
    for (const t of done) { expect(on(t, 2)).toBe(false); expect(on(t, 3)).toBe(true); }
    expect(on(start[0], 1)).toBe(true);
    // the ticks themselves keep step 1
    for (const v of [3, 7, 9]) { const tick = p.items.find((i) => i.id?.endsWith(`:tick:${v}`)); if (tick) expect(on(tick, 1)).toBe(true); }
  }
  const llm = stageLlm(c);
  expect(llm).toContain("3 (first ▲ event, from step 2)");
  expect(llm).toContain("7 (later ▲ warm, step 3 only)"); // rc.3 (D3): one step reads "step N only"
  expect(llm).toContain("Tick 3 label shown: first ▲ event.");
});

test("a tick reveal names declared steps and also works on header cells and zoom labels", () => {
  expect(compile(tickSrc(true).replace("@2", "@4")).errors.map((e) => e.msg).join()).toContain("a tick label's reveal is @N or @N..M");
  expect(compile(tickSrc(true).replace("@3..3", "@3..2")).errors.length).toBe(1);
  const h = compile(`time: 0..4\ncells: 1 | headers\nticks: 0.5 one, 1.5 two @2, 2.5 three, 3.5 four\nrow job a "A": +x 0..4`);
  expect(h.errors).toEqual([]);
  const p = layoutStage(h.model, 1000), two = texts(p, "two");
  expect(two.length).toBe(1); expect(two[0].from).toBe(2);
  const z = compile(`time: 0..60\nzoom: 24..36 | Detail\nzoom labels: 24 early, 30 middle @2, 36 late\nrow job a "A": +x 0..60`);
  expect(z.errors).toEqual([]);
  const middle = texts(layoutStage(z.model, 1000), "middle");
  expect(middle.length).toBe(1); expect(middle[0].from).toBe(2);
});

test("a long tick list with reveals charges the budget linearly", () => {
  const charges = (n: number) => {
    const b = newBudget(); beginDocument(b);
    const list = Array.from({ length: n }, (_, i) => `${i} t${i} @${1 + (i % 3)}`).join(", ");
    compile(`time: 0..${n}\nticks: ${list}\nrow job a "A": +x 0..${n}`);
    return DOC_WORK - b.left().work;
  };
  const a = charges(40), b = charges(80);
  expect(a).toBeGreaterThan(0); expect(b).toBeLessThanOrEqual(a * 2.3);
  beginDocument(newBudget(50));
  let refused = "";
  try { refused = compile(`time: 0..400\nticks: ${Array.from({ length: 400 }, (_, i) => `${i} t @2`).join(", ")}\nrow job a "A": +x 0..400`).errors.map((e) => e.msg).join(); } catch (e) { expect(e).toBeInstanceOf(BudgetError); refused = String(e); }
  expect(refused).toContain("more work");
});

// ---------------------------------------------------------------- (b, c) "cells: 1 | apart": separate rounded chips, labels above, no ruler line
const apartSrc = (mode: string) => `time: 0..11 | hours on the pager
cells: 1${mode}
ticks: 0 Mon, 1 Tue, 2 Wed, 3 "Thu ▲ alarm", 4 Fri, 5 Sat, 6 Sun, 7 "Mon ▲ new box, cold" @3, 9 "Wed ▲ warm" @5, 10 Thu
row job r1 "Old box": +up 0..3; +up 9..11 @5
row server r2 "New box": wait 3..4 [dashed]; +boot 3..4 @2; +boot 4..7 @2; +up (cold) 7..9 @3 [wide]`;
const cellBoxes = (p: Plan) => p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.cls && /stg-time-cell|stg-seg/.test(i.cls));

test("apart cells are separate rounded chips (the wide one too), labels centred above their cell, no ruler line", () => {
  const c = compile(apartSrc(" | apart"), 5);
  expect(c.errors).toEqual([]);
  for (const w of [1150, 390, 340]) {
    const p = layoutStage(c.model, w), boxes = cellBoxes(p);
    expect(boxes.length).toBe(3 + 2 + 1 + 1 + 3 + 1);
    for (const b of boxes) { expect(b.bar?.kind).toBe("chip"); expect(b.r).toBeGreaterThanOrEqual(6); }
    const wide = boxes.filter((b) => b.bar?.label === "up (cold)");
    expect(wide.length).toBe(1); expect(wide[0].cls).toContain("stg-seg");
    // neighbours never touch: in each row and step, a gap of at least 3 px (desktop about 7 px)
    for (let s = 1; s <= 5; s++) for (const y of new Set(boxes.map((b) => b.y))) {
      const row = boxes.filter((b) => b.y === y && on(b, s) && !b.dash).sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) if (row[i].x > row[i - 1].x + 1) expect(row[i].x - (row[i - 1].x + row[i - 1].w)).toBeGreaterThanOrEqual(w > 600 ? 6 : 3);
    }
    // no painted axis or tick stroke
    const ruler = p.items.filter((i) => i.k === "path" && (i.bar?.axis || /:tick:/.test(i.id || "")));
    expect(ruler.length).toBeGreaterThan(0);
    for (const r of ruler) expect(r.k === "path" && r.ink).toBe("none");
    // tick 1's label "Tue" sits above the cell 1..2 and is centred over it (an independent rule: the cell's middle)
    const tue = texts(p, "Tue")[0], cell = boxes.find((b) => b.id?.includes(":cell:r1:0:1:"))!;
    expect(tue && cell).toBeTruthy();
    expect(tue.y).toBeLessThan(cell.y);
    if (w > 600) { const mid = cell.x + cell.w / 2; expect(Math.abs(tue.x + measure(tue.s, "sub") / 2 - mid)).toBeLessThanOrEqual(1); }
    else expect(tue.x).toBeGreaterThan(cell.x - cell.w); // a phone shelf may nudge it, but never back to the tick's edge of the previous cell
  }
  expect(stageLlm(c)).toContain("State cells every 1 hours on the pager, drawn apart.");
});

test("without apart nothing changes: a [wide] cell stays a time-bar on a painted ruler; apart refuses a second mode", () => {
  const c = compile(apartSrc(""), 5);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1150), boxes = cellBoxes(p);
  expect(boxes.find((b) => b.bar?.label === "up (cold)")?.bar?.kind).toBe("time-bar");
  const axis = p.items.find((i) => i.k === "path" && i.bar?.axis);
  expect(axis?.k === "path" && axis.ink).toBe("line-2");
  expect(compile(apartSrc(" | apart | roomy"), 5).errors.map((e) => e.msg).join()).toContain("| apart");
  expect(compile(apartSrc(" | spread"), 5).errors.length).toBe(1);
});

// ---------------------------------------------------------------- (d) the zoom inset's caption bracket, and its slot beside a lone panel
const zoomHead = (zoom: string) => `panels
time: -120..1 | minutes before the cut-over
ticks: -120 two hours, -60 one hour, 0 cut-over
zoom: ${zoom}
window: -120..0 | the backup window
zoom row job p1 "Final copy": +job -1.72..0.29
zoom labels: -3 three, -2 two, -1 one, 1 after
at 0 [solid]: cut-over`;
const zoomSteps = [
  { title: "Overview", raw: "", line: 20 },
  { title: "Copies", raw: "beside 1, 1\nlist Copies\n  first: full\n  last: delta", line: 22 },
  { title: "Again", raw: "beside 1, 1\nlist Copies\n  first: full\n  last: delta", line: 30 },
  { title: "Restore", raw: "grid 3\n  job: one\n  job: two\n  job: three", line: 40 },
];
const zc = (zoom: string) => compile(zoomHead(zoom), 4, zoomSteps);

test("'| bracket' draws the inset's words as one stable caption bracket: decorative with no marker edge, from the inset's first step", () => {
  const c = zc("-3..1 | the last 3 minutes before the cut-over | bracket @1..2");
  expect(c.errors).toEqual([]);
  for (const w of [1150, 390]) {
    const p = layoutStage(c.model, w), bars = p.items.filter((i) => i.id?.endsWith(":bracket"));
    expect(bars.length).toBe(1);
    const b = bars[0]; expect(b.bar?.ignore).toBe(1);
    expect(b.bar?.edge).toBeUndefined(); expect(b.bar?.from).toBeUndefined();
    expect(on(b, 1)).toBe(true); expect(on(b, 2)).toBe(true); expect(on(b, 3)).toBe(false);
    const words = texts(p, "the last 3 minutes");
    expect(words.length).toBeGreaterThan(0);
    for (const t of words) { expect(on(t, 1)).toBe(true); expect(t.y).toBeLessThan((b as any).pts[1][1] + 1); } // the words over the bracket
    expect(texts(p, "(-3..1)").length).toBe(0);
  }
  expect(stageLlm(c)).toContain("Zoom -3 to 1: the last 3 minutes before the cut-over (a bracket over the inset).");
  // without the flag the caption stays as it was: plain words with the range, no bracket
  const plain = zc("-3..1 | the last 3 minutes @1..2"), q = layoutStage(plain.model, 1150);
  expect(plain.errors).toEqual([]);
  expect(texts(q, "the last 3 minutes (-3..1)").length).toBe(1);
  expect(q.items.some((i) => i.id?.endsWith(":bracket"))).toBe(false);
  // "| below" may follow; a bracket needs words
  expect(zc("-3..1 | words | bracket | below").errors).toEqual([]);
  expect(zc("-3..1 | bracket").errors.map((e) => e.msg).join()).toContain("a zoom bracket carries the inset's words");
});

test("the inset takes a lone panel's right slot from step 1 when a later full-width panel only shows after the inset has gone", () => {
  const c = zc("-3..1 | the last 3 minutes | bracket @1..2");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1150);
  const panel = p.items.find((i) => i.k === "box" && i.cls === "stg-region" && i.from === 2) as Extract<Item, { k: "box" }>;
  const caption = texts(p, "the last 3 minutes")[0], overview = texts(p, "minutes before the cut-over")[0];
  expect(panel && caption && overview).toBeTruthy();
  expect(panel.w).toBeLessThan(600);
  expect(caption.x).toBeGreaterThan(panel.x + panel.w);       // right of the half-width panel
  expect(Math.abs(caption.y - panel.y)).toBeLessThan(40);      // at the panel row's top, already in step 1
  expect(on(caption, 1)).toBe(true);
  expect(overview.y).toBeGreaterThan(caption.y + 40);          // the overview under both
  // control: an inset that still shows in step 4 must not sit in the slot over the full-width grid
  const d = zc("-3..1 | the last 3 minutes | bracket"), r = layoutStage(d.model, 1150);
  const grid = r.items.filter((i) => i.k === "box" && i.cls === "stg-region" && i.from === 4) as Extract<Item, { k: "box" }>[];
  const cap = texts(r, "the last 3 minutes")[0];
  expect(grid.length).toBeGreaterThan(0);
  for (const g of grid) expect(cap.y > g.y + g.h || cap.x > g.x + g.w || cap.x + 10 < g.x).toBe(true);
});

test("a step's note beside the inset stays in the left column under its panel: it never covers the inset or the overview", () => {
  const ss = zoomSteps.map((s, i) => (i === 1 ? { ...s, raw: s.raw + "\nnote: deltas only after the first copy" } : s));
  const c = compile(zoomHead("-3..1 | the last 3 minutes | bracket @1..2"), 4, ss);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1150), box = (i: any) => i.k === "box" ? { x: i.x, y: i.y, w: i.w, h: i.h } : i.k === "path" ? { x: Math.min(...i.pts.map((q: number[]) => q[0])), y: Math.min(...i.pts.map((q: number[]) => q[1])), w: Math.max(...i.pts.map((q: number[]) => q[0])) - Math.min(...i.pts.map((q: number[]) => q[0])), h: Math.max(...i.pts.map((q: number[]) => q[1])) - Math.min(...i.pts.map((q: number[]) => q[1])) } : { x: i.x, y: i.y - 12, w: measure(i.s, "sub"), h: 14 };
  const meet = (a: any, b: any) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const note = p.items.filter((i) => on(i, 2) && !on(i, 1) && !on(i, 3) && (i.k === "text" ? /deltas only/.test(i.s) : i.k === "box" && i.fill !== "none")).filter((i) => i.k === "text" || p.items.some((t) => t.k === "text" && /deltas only/.test(t.s) && meet(box(i), box(t))));
  const inset = p.items.filter((i) => on(i, 2) && (i.id?.startsWith("time-inset") || (i.k === "text" && /the last 3 minutes|Final copy/.test(i.s))));
  const overview = texts(p, "minutes before the cut-over");
  expect(note.length).toBeGreaterThan(0); expect(inset.length).toBeGreaterThan(3);
  for (const n of note) { for (const i of inset) expect(meet(box(n), box(i))).toBe(false); for (const o of overview) expect(meet(box(n), box(o))).toBe(false); }
});

// ---------------------------------------------------------------- phone: an apart cell keeps its word; a row span's caption stays under its bracket
test("on a phone an apart cell's word that does not fit level stands on end inside its cell, with no footnote", () => {
  const c = compile(apartSrc(" | apart"), 5);
  expect(c.errors).toEqual([]);
  for (const w of [356, 326]) {
    const p = layoutStage(c.model, w), cells = cellBoxes(p);
    expect(texts(p, ": wait").length).toBe(0);                 // no "4: wait" footnote
    const wait = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s === "wait");
    expect(wait.length).toBe(1); expect(wait[0].rotate).toBe(90);
    const cell = cells.find((b) => b.bar?.label === "wait")!;
    expect(wait[0].x).toBeGreaterThan(cell.x); expect(wait[0].x).toBeLessThan(cell.x + cell.w);
    expect(measure("wait", "chip")).toBeLessThanOrEqual(cell.h);   // the whole word fits the cell's height
  }
  // desktop keeps its level words
  const d = layoutStage(c.model, 1150);
  expect(d.items.filter((i) => i.k === "text" && i.s === "wait" && !i.rotate).length).toBe(1);
});

test("on a phone a row span's caption wraps to its bracket and stays centred under it", () => {
  const c = compile(apartSrc(" | apart"), 5, steps(5).map((s, i) => (i === 3 ? { ...s, raw: "keep span r2 7..9 [line] [accent]: a cold cache for two whole days" } : s)));
  expect(c.errors).toEqual([]);
  for (const w of [356, 326]) {
    const p = layoutStage(c.model, w), line = p.items.find((i) => i.k === "path" && /:span:/.test(i.id || "")) as Extract<Item, { k: "path" }>;
    const lo = Math.min(...line.pts.map((q) => q[0])), hi = Math.max(...line.pts.map((q) => q[0])), y = Math.max(...line.pts.map((q) => q[1]));
    const caps = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.y > y && i.y < y + 80 && /cold|cache|days|whole|two/.test(i.s));
    expect(caps.length).toBeGreaterThan(0);
    for (const t of caps) { const mid = t.x + measure(t.s, "sub") / 2; expect(mid).toBeGreaterThanOrEqual(lo - 2); expect(mid).toBeLessThanOrEqual(hi + 2); }
  }
});

test("a tick label takes one tone, in either order with @N; two tones are refused", () => {
  const src = (ticks: string) => `time: 0..11 | hours\ncells: 1 | apart\nticks: ${ticks}\nrow job r1 "Old": +up 0..11`;
  const c = compile(src(`0 Mon, 3 "Thu ▲ alarm" [bad], 7 "Mon ▲ cold" @3 [accent], 9 "Wed ▲ warm" [warn] @5, 10 Thu (server)`), 5);
  expect(c.errors).toEqual([]);
  for (const w of [1150, 356]) {
    const p = layoutStage(c.model, w), ink = (word: string) => [...new Set(texts(p, word).map((t) => t.ink))];
    expect(ink("alarm")).toEqual(["bad:ink"]); expect(ink("cold")).toEqual(["acc:ink"]); expect(ink("warm")).toEqual(["warn:ink"]);
    expect(ink("Thu")).toContain("role:server:ink"); expect(ink("Mon")).toContain("muted");
    for (const t of texts(p, "cold")) expect(on(t, 2)).toBe(false);
    for (const t of texts(p, "warm")) { expect(on(t, 4)).toBe(false); expect(on(t, 5)).toBe(true); }
  }
  expect(stageLlm(c)).toContain("3 (Thu ▲ alarm, bad)");
  expect(stageLlm(c)).toContain("7 (Mon ▲ cold, accent, from step 3)");
  expect(compile(src(`3 "Thu" [bad] [warn]`), 5).errors.map((e) => e.msg).join()).toContain("a tick label takes one tone");
});

test("phone headers too wide for their columns stand on end inside their own column when the turned digits fit it (rc.2 MUST 7), else level on staggered rows with a leader; every short cell word stays in its own cell (staggered), no footnote", () => {
  const ticks = Array.from({ length: 32 }, (_, i) => `${840 + i}.5 ${40 + i}`).join(", ");
  const c = compile(`time: 840..872 | ticks\ncells: 1 | headers\nticks: ${ticks}\nrow job a "Old owner": x1 840..872\nrow server b "New owner": +x1 840..848 @2; x1 848..872 @3`, 3);
  expect(c.errors).toEqual([]);
  for (const w of [356, 326]) {
    const p = layoutStage(c.model, w), heads = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^[4-7]\d$/.test(i.s) && !i.tip);
    expect(heads.length).toBe(32);
    setPhoneFont(true);
    try { const headerCells = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && /:header:/.test(i.id || "")); for (const h of heads) expect(tiedToCell(p.items, h, headerCells)).toBe(""); } finally { setPhoneFont(false); }
    const foot = p.items.filter((i) => i.k === "text" && /^\d+(–\d+)?: /.test(i.s));
    expect(foot.length).toBe(0);                                         // never a footnote for a short word, never a merged run
    for (const step of [1, 2, 3]) {
      const on = (i: Item) => (!i.from || i.from <= step) && (!i.to || i.to >= step);
      const words = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s === "x1" && on(i));
      expect(words.length).toBe([32, 40, 64][step - 1]);                   // one word per cell in every step
      for (const t of words) { expect(t.rotate).toBeUndefined(); expect(t.f).toBe("chip"); /* chip = 11 px on a phone */ }
      for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (words[i].y === words[j].y) expect(Math.abs(words[i].x - words[j].x)).toBeGreaterThanOrEqual(measure("x1", "chip"));
    }
  }
});

test("an inset's own words head the panel row: the lone panels beside it start below them, in every such step; a full-width panel keeps the top", () => {
  const c = compile(zoomHead("-3..1 | the last 3 minutes | bracket @1..2"), 4, zoomSteps);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1150), panels = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.kind === "panel");
  const two = panels.find((b) => b.from === 2)!, three = panels.find((b) => b.from === 3)!, four = panels.find((b) => b.from === 4)!;
  const words = texts(p, "the last 3 minutes")[0], bracket = p.items.find((i) => i.id?.endsWith(":bracket")) as Extract<Item, { k: "path" }>;
  expect(two.y).toBe(three.y);                                            // the same list never moves between steps 2 and 3
  expect(two.y).toBeGreaterThan(Math.max(...bracket.pts.map((q) => q[1])) - 1); // below the inset's words and bracket
  expect(two.y - (words.y - 12)).toBeGreaterThanOrEqual(24);              // about the original's 30 px of head room
  expect(four.y).toBeLessThan(two.y);                                     // the full-width grid keeps the row's top
  const narrow = layoutStage(c.model, 356), n2 = narrow.items.find((i) => i.k === "box" && i.bar?.kind === "panel" && i.from === 2) as Extract<Item, { k: "box" }>;
  expect(n2.y).toBeLessThan(40);                                          // a phone stacks: no head room above the panel
});

test("an apart row's span caption has no grey backing box (its row frame is unpainted)", () => {
  const c = compile(`time: 0..10\ncells: 1 | apart\nrow job a "": x 0..4; y 4..10\nrow server b "": z 0..10`, 1, [{ title: "One", raw: "span b 4..9 [line] [accent]: cold for five ticks", line: 8 }, { title: "Two", raw: "", line: 10 }]);
  expect(c.errors).toEqual([]);
  for (const w of [1150, 356]) {
    const p = layoutStage(c.model, w);
    const grey = p.items.filter((i) => i.k === "box" && i.fill === "surface-2" && i.cls === "stg-time-caption-mask");
    expect(grey.length).toBe(0);
  }
});

test("a state takes its own role, spelled as on a connector: one row, each tile in its role's colour; one role per state; undeclared refused", () => {
  const c = compile(`time: 0..8\ncells: 1 | apart\nrow job r "": a 0..3 (job); wait 3..4 @1 [dashed]; b 4..8 (server)`, 2);
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1150), cells = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.kind === "chip");
  const at = (x: number) => cells.filter((b) => Math.abs(b.x - cells[0].x - x * (cells[1].x - cells[0].x)) < 2);
  expect(at(0)[0].fill).toBe("role:job:soft");
  expect(at(5)[0].fill).toBe("role:server:soft");
  expect(at(5)[0].role).toBe("server"); expect(at(0)[0].role).toBe("job");   // the tile carries its own role (data-role), not the row's
  expect(at(3)[0].fill).toBe("surface-2");                                // the dashed wait stays neutral
  expect(compile(`time: 0..8\nrow job r "": a 0..3 (job) (server)`, 2).errors[0].msg).toContain("one role");
  expect(compile(`time: 0..8\nrow job r "": a 0..3 (nobody)`, 2).errors[0].msg).toContain("not a role of this page");
  expect(compile(`time: 0..8\nrow job r "": +a 0..3; b 3..8`, 2).errors).toEqual([]); // the row's role stays the default
});

test("in an apart grid a [below] marker is its words alone, starting on the tile at its tick, in its tone: no marker line", () => {
  const head = `time: 0..8\ncells: 1 | apart\nticks: 0.5 t1, 1.5 t2, 2.5 t3, 3.5 t4, 4.5 t5, 5.5 t6, 6.5 t7, 7.5 t8\nrow job a "": a 0..3 (job); wait 3..4 [dashed]; b 4..8 (server)`;
  const c = compile(head, 2, [{ title: "One", raw: "keep at 3 [below] [bad]: ▲ a dies", line: 8 }, { title: "Two", raw: "", line: 10 }]);
  expect(c.errors).toEqual([]);
  for (const w of [1150, 390, 356]) {
    const p = layoutStage(c.model, w);
    expect(p.items.filter((i) => i.k === "path" && i.bar?.value === 3).length).toBe(0);  // no line, so no extra edge
    const words = texts(p, "▲ a dies")[0], tile = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.kind === "chip").sort((x, y) => x.x - y.x)[3];
    expect(words.ink).toBe("bad:ink");
    expect(words.x).toBeGreaterThanOrEqual(tile.x); expect(words.x).toBeLessThan(tile.x + Math.min(8, tile.w / 2)); // starts on its tile: its ▲ on the tile, whatever its width
    expect(words.y).toBeGreaterThan(tile.y + tile.h);
    const label = texts(p, "t4")[0]; expect(label.y).toBeLessThan(tile.y);                 // the tick label stays above its tile
  }
  const ruled = layoutStage(compile(head.replace("cells: 1 | apart\n", "cells: 1\n"), 2, [{ title: "One", raw: "keep at 3 [below] [bad]: ▲ a dies", line: 8 }, { title: "Two", raw: "", line: 10 }]).model, 1150);
  expect(ruled.items.filter((i) => i.k === "path" && i.bar?.value === 3).length).toBe(1);   // a ruled grid keeps its marker line
});

test("[below] marker words share a shelf with words of other steps: a later step's words sit right under their tick; words of the same steps still stack", () => {
  const head = `time: 0..20\nrow job a "Writer": +x 0..20`;
  const ss = [{ title: "One", raw: "at 4 [below]: first words here", line: 8 }, { title: "Two", raw: "at 5 [below]: second words here", line: 10 }, { title: "Three", raw: "keep at 4 [below]: early words that run long\nkeep at 5 [below]: late words that run long", line: 12 }];
  const c = compile(head, 3, ss); expect(c.errors).toEqual([]);
  for (const w of [1150, 356]) {
    const p = layoutStage(c.model, w), y = (s: string) => texts(p, s)[0].y;
    expect(y("second words here")).toBe(y("first words here"));          // steps 1 and 2 never show together
    expect(y("late words that run long")).toBeGreaterThan(y("early words that run long"));                        // step 3 shows both: they stack
    expect(y("early words that run long")).toBe(y("first words here"));
  }
});

test("phone staggered words (13's shape: long words over several-cell runs next to short ones) never cross a word, another tile or the stage edge", () => {
  const head = `time: 0..8\ncells: 1\nrow job a "Writer": +sort, envelopes 0..2; ok 2..3; +polls /release 3..5; +sorted: stopped 5..8\nrow server b "Desk": +to 2/3 desks 0..3 @2; x 3..4 @2; +to 3 desks 4..8 @2`;
  const c = compile(head, 3); expect(c.errors).toEqual([]);
  for (const w of [390, 360]) {
    setPhoneFont(true); const size = (t: Extract<Item, { k: "text" }>) => ({ w: measure(t.s, t.f), h: fontSize(t.f) }); setPhoneFont(false);
    const p = layoutStage(c.model, w);
    setPhoneFont(true);
    const T = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text"), tiles = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.kind === "chip");
    const bb = (t: Extract<Item, { k: "text" }>) => { const m = measure(t.s, t.f), h = fontSize(t.f); const x = t.rotate ? t.x - h : t.anchor === "middle" ? t.x - m / 2 : t.anchor === "end" ? t.x - m : t.x; return t.rotate ? { x, y: t.y - m / 2, w: h, h: m } : { x, y: t.y - h * .8, w: m, h }; };
    const on = (i: Item, s: number) => (!i.from || i.from <= s) && (!i.to || i.to >= s);
    for (let s = 1; s <= 3; s++) {
      const v = T.filter((t) => on(t, s));
      for (let i = 0; i < v.length; i++) {
        const A = bb(v[i]); expect(A.x).toBeGreaterThanOrEqual(-0.5); expect(A.x + A.w).toBeLessThanOrEqual(w + 0.5);
        for (let j = i + 1; j < v.length; j++) { const B = bb(v[j]); expect(Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) <= 1 || Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) <= 1).toBe(true); }
        if (v[i].tip && !v[i].rotate) for (const b of tiles.filter((b) => on(b, s))) { const inside = A.x >= b.x - 1 && A.x + A.w <= b.x + b.w + 1, ox = Math.min(A.x + A.w, b.x + b.w) - Math.max(A.x, b.x), oy = Math.min(A.y + A.h, b.y + b.h) - Math.max(A.y, b.y); expect(inside || ox <= 1 || oy <= 1).toBe(true); }
      }
    }
    setPhoneFont(false);
    if (w === 390) expect(T.filter((t) => /^\d+(–\d+)?: /.test(t.s)).length).toBe(0); // every cell keeps its own word (at 360 a word wider than three cells takes its per-cell footnote)
    void size;
  }
});

test("'height: N lines' under a window: its frame keeps at least N text lines, the ruler inside; never smaller; refused without a window or outside 1..12", () => {
  const head = (extra: string) => `time: -120..1 | seconds\nticks: -120, -60, 0\nwindow: -120..0 | the rate window\n${extra}at 0: now`;
  const frame = (src: string, w: number) => { const c = compile(src, 2); expect(c.errors).toEqual([]); const p = layoutStage(c.model, w); return { p, f: p.items.find((i): i is Extract<Item, { k: "box" }> => i.k === "box" && !!i.id?.endsWith(":window"))! }; };
  for (const w of [1150, 390]) {
    const plain = frame(head(""), w), tall = frame(head("height: 9 lines\n"), w), small = frame(head("height: 2 lines\n"), w);
    expect(tall.f.h).toBeGreaterThanOrEqual(9 * 18);
    expect(tall.f.y).toBe(plain.f.y);                                       // the frame grows under its ruler; its top and words stay
    expect(tall.p.h - plain.p.h).toBe(tall.f.h - plain.f.h);                // the stage grows by exactly that
    expect(small.f.h).toBe(plain.f.h);                                      // never smaller than its content
    const axis = (p: typeof plain.p) => p.items.find((i) => i.k === "path" && i.id?.endsWith("-x")) as Extract<Item, { k: "path" }>;
    expect(axis(tall.p).pts[0][1]).toBe(axis(plain.p).pts[0][1]);           // the ruler stays inside, where it was
    expect(tall.f.from ?? 1).toBe(1); expect(tall.f.to ?? 0).toBe(0);      // one frame for every step: nothing moves
  }
  expect(compile(`time: 0..10\nheight: 4 lines\nat 5: x`, 2).errors[0].msg).toContain("follows window");
  expect(compile(head("height: 13 lines\n"), 2).errors[0].msg).toContain("1 to 12");
  expect(compile(head("height: 4\n"), 2).errors[0].msg).toContain("height: N lines");
  expect(compile(head("height: 4 lines\nheight: 5 lines\n"), 2).errors[0].msg).toContain("once");
});

test("phone stagger words keep 10 px from their line neighbours and a page backing over marker lines", () => {
  const head = `time: 0..7\ncells: 1\nrow job a "Writer": +print, all envelopes 0..2; ok 2..3; +sorted: envelopes 3..5; +sorted: stopped 5..7`; // rc.3: words up to 104 px stand on end and phrases that fit level stay in their cells, so the staggered ones here are longer, with a word wider than the cell, in wider cells
  const c = compile(head, 2, [{ title: "One", raw: "keep at 3: releaseTick", line: 8 }, { title: "Two", raw: "", line: 10 }]); expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 390), words = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.f === "chip" && !!i.tip && i.anchor === "middle" && !i.rotate);
  expect(words.length).toBeGreaterThan(3);
  setPhoneFont(true);
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (words[i].y === words[j].y) {
    const gap = Math.abs(words[i].x - words[j].x) - (measure(words[i].s, "chip") + measure(words[j].s, "chip")) * .6; expect(gap).toBeGreaterThanOrEqual(9.5);
  }
  setPhoneFont(false);
  for (const t of words) expect(p.items.some((m) => m.k === "box" && m.cls === "stg-time-caption-mask" && m.x <= t.x && m.x + m.w >= t.x && m.y <= t.y && m.y + m.h >= t.y - 8)).toBe(true);
});

test("apart grid: the [below] marker words come right under the row, then the span line, its caption last; a span takes a (role) tone", () => {
  const head = `time: 0..10\ncells: 1 | apart\nrow job r "": a 0..3 (job); wait 3..4 [dashed]; b 4..10 (server)`;
  const c = compile(head, 2, [{ title: "One", raw: "keep at 7 [below] [accent]: ▲ new bin a, cold\nkeep span r 7..9 [line] (server): cold for 18 ticks", line: 8 }, { title: "Two", raw: "", line: 10 }]);
  expect(c.errors).toEqual([]);
  for (const w of [1150, 390]) {
    const p = layoutStage(c.model, w), mk = texts(p, "▲ new bin a, cold")[0], cap = texts(p, "cold for 18 ticks")[0];
    const line = p.items.find((i): i is Extract<Item, { k: "path" }> => i.k === "path" && i.ink === "role:server:line")!;
    const tiles = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.kind === "chip"), rowBottom = Math.max(...tiles.map((b) => b.y + b.h));
    expect(mk.y).toBeGreaterThan(rowBottom); expect(line.pts[0][1]).toBeGreaterThan(mk.y); expect(cap.y).toBeGreaterThan(line.pts[0][1]);
    expect(cap.ink).toBe("role:server:ink");
  }
});

test("a phone tick label that misses the first row by a little slides right (at most half its width) to stay on it, clear of the next", () => {
  const head = `time: 0..11\ncells: 1 | apart\nticks: 0 t1, 1 t2, 2 t3, 3 t4, 4 t5, 5 t6, 6 t7, 7 t8…t28, 9 t29, 10 t30\nrow job r "": a 0..3 (job); wait 3..4 [dashed]; b 4..7 (server); b (a is cold) 7..9 (server) [wide]; a 9..11 (job)`;
  const c = compile(head, 2); expect(c.errors).toEqual([]);
  for (const w of [390, 356]) {
    const p = layoutStage(c.model, w), labels = p.items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && /^t\d/.test(i.s));
    expect(labels.length).toBe(10);
    expect(new Set(labels.map((t) => t.y)).size).toBe(1);                 // one row
    setPhoneFont(true); const sorted = [...labels].sort((x, y) => x.x - y.x);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x + measure(sorted[i - 1].s, "sub")); setPhoneFont(false);
  }
});

test("apart grid: the span line starts right under the marker words shown by its first step; a later marker that needs its own row goes under the caption (phone), in the row when it fits (desktop)", () => {
  const head = `time: 0..11\ncells: 1 | apart\nrow job r "": a 0..3 (job); wait 3..4 [dashed]; b 4..7 (server); b (a is cold) 7..9 (server) [wide]; a 9..11 (job)`;
  const raw = ["keep at 3 [below] [bad]: ▲ a dies", "keep at 7 [below] [accent]: ▲ new bin a, cold", "keep span r 7..9 [line] (server): cold for 18 ticks = 4 min 30 s", "keep at 9 [below] [warn]: ▲ a warm again"];
  const c = compile(head, 3, [{ title: "One", raw: raw[0] + "\n" + raw[1], line: 8 }, { title: "Two", raw: raw[2], line: 10 }, { title: "Three", raw: raw[3], line: 12 }]);
  expect(c.errors).toEqual([]);
  for (const w of [1150, 390]) {
    const p = layoutStage(c.model, w), y = (s: string) => (p.items.find((i): i is Extract<Item, { k: "text" }> => i.k === "text" && s.startsWith(i.s) && i.s.length > 2) as Extract<Item, { k: "text" }>).y; // a marker may wrap before the stage edge: its first line
    const line = p.items.find((i): i is Extract<Item, { k: "path" }> => i.k === "path" && i.ink === "role:server:line")!.pts[0][1];
    expect(line - y("▲ new bin a, cold")).toBeLessThan(14);                    // right under the words beside it
    expect(y("cold for 18 ticks = 4 min 30 s")).toBeGreaterThan(line);
    if (w > 400) expect(y("▲ a warm again")).toBe(y("▲ a dies"));               // fits the marker row
    else expect(y("▲ a warm again")).toBeGreaterThan(y("cold for 18 ticks = 4 min 30 s")); // needs its own row: under the caption
  }
});

test("a dot's words that would cross the stage's right edge end 12 px left of the dot; elsewhere they stay centred under it", () => {
  const c = compile(`time: -120..1 | seconds\nticks: -120, -60, 0\ndot -1.72 [warn]: newest sample\ndot -60 [warn]: middle sample`, 2); expect(c.errors).toEqual([]);
  for (const w of [1150, 390]) {
    const p = layoutStage(c.model, w); setPhoneFont(w < 400);
    const dot = (v: number) => p.items.find((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.cls === "scn-shape stg-ruler-dot" && i.bar?.value === v)!;
    const edge = texts(p, "newest sample")[0], mid = texts(p, "middle sample")[0], dx = (b: Extract<Item, { k: "box" }>) => b.x + b.w / 2;
    expect(Math.round(edge.x + measure(edge.s, "sub"))).toBe(Math.round(dx(dot(-1.72)) - 12));
    expect(Math.abs(mid.x + measure(mid.s, "sub") / 2 - dx(dot(-60)))).toBeLessThan(1);
    setPhoneFont(false);
  }
});

test("an axis span's caption left of its line ends at the line's gap and neither it nor its backing covers the line's start", () => {
  const c = compile(`time: -120..1 | seconds\nticks: -120, -105, -90, -75, -60, -45, -30, -15, 0`, 2, [{ title: "One", raw: "keep span axis -17.45..0 [line] [bad]: 17.45 s after the last change", line: 8 }, { title: "Two", raw: "", line: 10 }]);
  expect(c.errors).toEqual([]);
  for (const w of [1178, 1150]) {
    const p = layoutStage(c.model, w), line = p.items.find((i): i is Extract<Item, { k: "path" }> => i.k === "path" && i.ink === "bad:line")!;
    const start = Math.min(...line.pts.map((q) => q[0])), y = line.pts[0][1], k = p.items.indexOf(line);
    const covers = p.items.filter((b, j) => j > k && b.k === "box" && b.fill !== "none" && b.x < start + 1 && b.x + b.w > start + 1 && b.y <= y && b.y + b.h >= y);
    expect(covers.length).toBe(0);
    const cap = texts(p, "17.45 s after the last change")[0]; expect(cap.anchor).toBe("end"); expect(cap.x).toBeLessThanOrEqual(start - 8);
  }
});

test("axis spans whose lines and one-line words never meet share a row; ones that would meet keep their own rows", () => {
  const c = compile(`time: -120..1 | seconds\nticks: -120, -60, 0`, 2, [{ title: "One", raw: "keep span axis -120..-107.45 [line] [good]: until the first change\nkeep span axis -17.45..0 [line] [bad]: 17.45 s after the last change", line: 8 }, { title: "Two", raw: "", line: 10 }]);
  expect(c.errors).toEqual([]);
  const y = (w: number, ink: string) => (layoutStage(c.model, w).items.find((i) => i.k === "path" && i.ink === ink) as Extract<Item, { k: "path" }>).pts[0][1];
  expect(y(1178, "good:line")).toBe(y(1178, "bad:line"));
  expect(y(356, "good:line")).not.toBe(y(356, "bad:line"));
  const p = layoutStage(c.model, 1178), cap = (s: string) => texts(p, s)[0];
  setPhoneFont(false); const g = cap("until the first change"), b = cap("17.45 s after the last change");
  expect(g.x + measure(g.s, "sub") * 1.2 + 8).toBeLessThan(b.x - measure(b.s, "sub") * 1.2);   // the words never meet
});

test("an inset with its own bracket draws no range box on the main axis; a plain inset keeps it", () => {
  const head = (z: string) => `time: -120..1 | seconds\nticks: -120, -60, 0\nzoom: ${z}\nzoom ticks: -3, -2, -1, 1`;
  const box = (z: string) => layoutStage(compile(head(z), 3, zoomSteps).model, 1150).items.filter((i) => i.id === "time-zoom-window").length;
  expect(box("-3..1 | the last 3 minutes | bracket @1..2")).toBe(0);
  expect(box("-3..1 | the last 3 minutes @1..2")).toBe(1);
});

test("'height: N lines' right after 'notes:' gives every step's note one frame at least N text lines tall, room under its words; nothing changes without it", () => {
  const steps = [{ title: "One", raw: "note: Today | two names, so the tiers never touch", line: 8 }, { title: "Two", raw: "note: Key | the office, not the server", line: 10 }, { title: "Three", raw: "note: Root | the only sender", line: 12 }];
  const head = (extra: string) => `notes: above\n${extra}time: 0..10\nrow job a "A": +x 0..10`;
  const notes = (src: string, w: number) => { const c = compile(src, 3, steps); expect(c.errors).toEqual([]); const p = layoutStage(c.model, w); return { p, n: p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.cls === "stg-note-strip") }; };
  for (const w of [1178, 356]) {
    const plain = notes(head(""), w), tall = notes(head("height: 8 lines\n"), w);
    expect(tall.n.length).toBe(3);
    for (const b of tall.n) { expect(b.h).toBeGreaterThanOrEqual(8 * 18); expect(b.y).toBe(tall.n[0].y); expect(b.h).toBe(tall.n[0].h); } // one frame for every step: nothing moves
    const words = texts(tall.p, "two names, so the tiers never touch")[0]; expect(words.y).toBeLessThan(tall.n[0].y + 60); // words at the top, room under them
    expect(tall.p.h - plain.p.h).toBe(tall.n[0].h - plain.n[0].h);
  }
  expect(compile(head("height: 13 lines\n"), 3, steps).errors[0].msg).toContain("1 to 12");
  expect(compile(head("height: 8\n"), 3, steps).errors[0].msg).toContain("height: N lines");
  // a time window's own height line is untouched
  expect(compile(`time: -120..1\nwindow: -120..0 | rate\nheight: 4 lines`, 2).errors).toEqual([]);
});

test("a note's last part 'height: N lines' sizes its step's frame: the same frame in every step, words unchanged, refusals", () => {
  const mk = (h: string) => [{ title: "One", raw: `note: Today | two names, so the tiers never touch${h}`, line: 8 }, { title: "Two", raw: `note: Key | the office, not the server${h}`, line: 10 }, { title: "Three", raw: `note: Root | the only sender${h}`, line: 12 }];
  const head = `notes: above\ntime: 0..10\nrow job a "A": +x 0..10`;
  const notes = (h: string, w: number) => { const c = compile(head, 3, mk(h)); expect(c.errors).toEqual([]); const p = layoutStage(c.model, w); return { p, n: p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.cls === "stg-note-strip") }; };
  for (const w of [1178, 356]) {
    const plain = notes("", w), tall = notes(" | height: 8 lines", w);
    expect(tall.n.length).toBe(3);
    for (const b of tall.n) { expect(b.h).toBeGreaterThanOrEqual(8 * 18); expect(b.y).toBe(tall.n[0].y); expect(b.h).toBe(tall.n[0].h); }
    expect(texts(tall.p, "height: 8 lines")).toEqual([]); // the part is a size, never drawn
    expect(texts(tall.p, "the only sender").length).toBe(texts(plain.p, "the only sender").length);
    expect(tall.p.h - plain.p.h).toBe(tall.n[0].h - plain.n[0].h);
  }
  expect(compile(head, 3, mk(" | height: 13 lines")).errors[0].msg).toContain("1 to 12");
  expect(compile(head, 3, mk(" | height: 8")).errors[0].msg).toContain("height: N lines");
});

test("rc.2 MUST 2, 3: a one-step marker's words sit by their own line (not the block's bottom left); one at a setup marker's time (even one a point names) draws too, stacked", () => {
  const src = `time: 0..60 | seconds\nrow job j1 "build": queued 0..4; +running 4..31; done 31..60\nrow job j2 "test": queued 0..31; +running 31..52; done 52..60\nat 30: 30 s, review starts\nplot: 0..100 | percent complete\npoint job half at 30: 50 | Halfway`;
  const steps = [{ title: "One", raw: "span j1 4..31: 27 s", line: 8 }, { title: "Two", raw: "at 30: halfway", line: 10 }, { title: "Three", raw: "at 52: tests pass", line: 12 }];
  const c = compile(src, 3, steps); expect(c.errors).toEqual([]);
  for (const w of [1178, 356]) {
    const p = layoutStage(c.model, w), line = (step: number) => p.items.find((i): i is Extract<Item, { k: "path" }> => i.k === "path" && i.from === step && i.to === step && i.pts.length === 2 && i.pts[0][0] === i.pts[1][0])!;
    const word = (s: string) => { const t = texts(p, s); expect(t.length).toBe(1); return t[0]; };
    for (const [s, k] of [["tests pass", 3], ["halfway", 2]] as const) {
      const t = word(s), x = line(k).pts[0][0], tw = measure(s, "sub");
      expect(t.x).toBeLessThanOrEqual(x + 1); expect(t.x + tw).toBeGreaterThanOrEqual(x - 1); expect(t.x).toBeGreaterThan(x - tw - 2); // over its own line (centred, or clamped at the stage's edge)
      expect(t.y).toBeLessThan(Math.min(...line(k).pts.map((q) => q[1]))); // above the rows its line crosses
      expect(t.from).toBe(k); expect(t.to).toBe(k);
    }
    const setup = word("30 s, review starts"), half = word("halfway");
    expect(half.y).toBeGreaterThanOrEqual(setup.y + 18); // stacked, both shown in step 2
  }
});

test("24 lane: '_ 6.5 [x] [bad]' is an X on that row's line at 6.5 (no cell); 'at <row> N: words' puts words on that row's line at N; nothing reserved, so nothing moves", () => {
  const rows = (x: string) => `time: -0.5..27 | seconds\nticks: 0, 4, 8, 12, 16, 20, 24\nrow job e "pod 0": +alive 0..6.5; _ 6.5..7 [bad]${x}; +gone 7..27\nrow job p1 "pod 1": waiting 0..23; +holds 23..27`;
  const steps = (s3: string) => [{ title: "One", raw: "foot: a", line: 8 }, { title: "Two", raw: "foot: b", line: 10 }, { title: "Three", raw: s3, line: 12 }];
  const plain = compile(rows(""), 3, steps("foot: c")), marked = compile(rows("; _ 6.5 [x] [bad] @3"), 3, steps("at p1 23: takes it"));
  expect(marked.errors).toEqual([]);
  for (const w of [1178, 356]) {
    const p0 = layoutStage(plain.model, w), p = layoutStage(marked.model, w);
    expect(p.h).toBe(p0.h);
    const cells = (q: Plan) => q.items.filter((i) => i.k === "box" && /stg-time-cell|stg-seg/.test(i.cls ?? "")).length; expect(cells(p)).toBe(cells(p0)); // the X is no cell
    const xs = p.items.filter((i): i is Extract<Item, { k: "path" }> => i.k === "path" && i.cls === "stg-time-x");
    expect(xs.length).toBe(2); for (const s of xs) { expect(s.from).toBe(3); expect(s.ink).toBe("bad:line"); }
    const cx = (xs[0].pts[0][0] + xs[0].pts[1][0]) / 2, cy = (xs[0].pts[0][1] + xs[0].pts[1][1]) / 2;
    const alive = p.items.find((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.x < cx && i.x + i.w <= cx + 1 && i.x + i.w >= cx - 30 && i.y < cy && i.y + i.h > cy); expect(alive).toBeDefined(); // on pod 0's row, at 6.5 (the end of 'alive')
    const t = texts(p, "takes it")[0]; expect(t.from).toBe(3); expect(t.to).toBe(3);
    const stroke = p.items.find((i): i is Extract<Item, { k: "path" }> => i.k === "path" && !!i.id?.includes("row-at:p1:23"))!;
    expect(Math.abs(t.x - stroke.pts[0][0]) < 8 || Math.abs(t.x + measure("takes it", "sub") - stroke.pts[0][0]) < 8).toBe(true); // beside its stroke
    expect(t.y).toBeGreaterThan(stroke.pts[0][1]); expect(t.y).toBeLessThan(stroke.pts[1][1] + 6); // on pod 1's row
  }
  expect(stageLlm(marked)).toContain("At 6.5 seconds on pod 0: an X.");
  expect(stageLlm(marked)).toContain("At 23 seconds on pod 1: takes it.");
  expect(compile(rows("; _ 6.5 [x] [wide]"), 3, steps("foot: c")).errors[0].msg).toContain("[x] marks one time");
  expect(compile(rows(""), 3, steps("at p1 23")).errors[0].msg).toContain("at <row> N");
});
