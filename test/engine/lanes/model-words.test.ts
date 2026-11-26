// Lanes draw from the Model: in every frame of every lanes fence (the stage fixtures and the generic-test scenes, as
// written and tweaked), at 1280 and 390, what a card shows is what the core's states say: its title and lines, its state
// chip, its tone and dim, its tokens and record values, its pills' places; and none of the old stage's card items is
// left in the decor. (review M1, item 1: the old stage is called for geometry only.)
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import { cardWords } from "../../../src/engine/layouts/lanes/cards";
import { cardSteps, recordKeysOf, tokensOf } from "../../../src/engine/layouts/lanes/words";
import type { Compiled, Prim, Rect } from "../../../src/engine/types";
import { fencesOf, type Fence } from "../parse/fixtures";
import { ROOT } from "./helper";

const dirs = ["fixtures/stage", "fixtures/gt", "fixtures/gt/tweaked"];
const all: Fence[] = dirs.flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith(".dh.md")).sort().flatMap((f) => fencesOf(join(ROOT, d, f), undefined, `${d.replace("fixtures/", "")}/${f}`)));
const lanes: { f: Fence; c: Compiled }[] = [];
const broken: string[] = [];
for (const f of all) {
  let c: Compiled; try { c = compile(f.src); } catch { broken.push(f.id); continue; }
  if (c.model.layout !== "lanes") continue;
  if (c.problems.some((p) => !p.warn)) { broken.push(f.id); continue; }
  lanes.push({ f, c });
}

const norm = (s: string) => s.replace(/\s+/g, "");
/** the drawn words say the written ones: whole, or cut with an ellipsis */
const says = (drawn: string, want: string) => { const d = norm(drawn), w = norm(want); return d === w || (d.endsWith("…") && w.startsWith(d.slice(0, -1))); };
const bare = (s: string) => { let e = s.length; while (e > 1 && (s[e - 1] === "," || s[e - 1] === ";")) e--; return s.slice(0, e); };
const within = (x: number, y: number, r: Rect) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5;

function check(c: Compiled, w: number): string[] {
  const bad: string[] = [], m = c.model, cs = cardSteps(m), plan = c.plan(w);
  for (let k = 0; k < c.states.length; k++) {
    const st = c.states[k]; if (st.scene) continue;
    const frame = plan.frame(k), rects = plan.rects(k);
    const byKey = new Map<string, Prim>(frame.map((p) => [p.key, p]));
    // a card's lines with looks of their own are one text per line (t:id:lines, t:id:lines:1 ...)
    const text = (key: string) => { const p = byKey.get(key); if (p?.k !== "text") return undefined; const ws = [...p.lines]; for (let i = 1; byKey.get(`${key}:${i}`)?.k === "text"; i++) ws.push(...(byKey.get(`${key}:${i}`) as Extract<Prim, { k: "text" }>).lines); return ws.join(" "); };
    const tops: Rect[] = [];
    const lanesWords = frame.filter((p) => p.k === "text" && !p.key.startsWith("t:")).map((p) => (p as any).lines.join(" ")).join(" ");
    for (const id of m.order) {
      const t = m.things[id], s = st.things[id], r = rects[id];
      if (!s?.visible || !r || t.chart || t.shape === "token" || t.shape === "ref") continue;
      const at = `${k}:${id}`;
      if (!t.parent) tops.push(r);
      if (t.shape === "pill" && t.parent) {
        const got = text(`t:${id}:title`);
        if (got === undefined || !says(got, t.title)) bad.push(`${at} pill words ${got} != ${t.title}`);
        continue;
      }
      const want = cardWords(t, s, cs[k]);
      const title = text(`t:${id}:title`), lines = text(`t:${id}:lines`);
      if (want.title ? title === undefined || !says(title, want.title) : title !== undefined) bad.push(`${at} title ${title} != ${want.title}`);
      // the phone writes the lines every card of a lane shares once, under the lane heading ("each: ..."), not in each card
      const folded = lines === undefined && norm(lanesWords).includes(norm(`each: ${want.lines.join(" ")}`));
      if (want.lines.length ? !folded && (lines === undefined || !says(lines, want.lines.join(" "))) : lines !== undefined) bad.push(`${at} lines ${lines} != ${want.lines.join(" | ")}`);
      // a tag is a chip on the strip above the card; a state word is written in the card's corner; a state gone is not written
      const chip = byKey.get(`t:${id}:is`), got = chip?.k === "chip" ? chip.words : chip?.k === "text" ? chip.lines.join(" ") : null;
      const wantIs = cs[k].stateTone[id]?.gone ? null : s.is;
      if (got !== wantIs) bad.push(`${at} chip ${got} != ${wantIs}`);
      const box = byKey.get(`t:${id}`);
      if (box?.k !== "box") { bad.push(`${at} no box`); continue; }
      const gone = !!cs[k].stateTone[id]?.gone;
      const tone = gone ? null : s.tone && s.tone !== "off" ? s.tone : null;
      if ((box.tone ?? null) !== tone) bad.push(`${at} tone ${box.tone} != ${tone}`);
      if (!!box.dim !== (s.dim || gone)) bad.push(`${at} dim ${box.dim} != ${s.dim}`);
      tokensOf(t.keys).forEach((tok, i) => { const got = text(`t:${id}:tok${i}:t`); if (got === undefined || !says(got, bare(tok))) bad.push(`${at} token ${i} ${got} != ${tok}`); });
      recordKeysOf(t.keys).forEach((key, j) => { const got = text(`t:${id}:val${j}`), v = cs[k].fill[id]?.[key] ?? "..."; if (got === undefined || !says(got, v)) bad.push(`${at} value ${key} ${got} != ${v}`); });
    }
    // nothing of the old stage's cards is left in the decor: no decor text inside a card (an `inside` chip's words stay:
    // that layout word is the lanes layout's own)
    // the lanes' own words that may sit over a card: a line's words (the stage keeps some into the next step, and the
    // setup shows the first step's), a say, a relation's label, an `inside` chip
    const facts = [...m.setup, ...m.steps.flatMap((x) => x.facts)];
    const own = norm([...facts.flatMap((x) => (x.k === "rel" || x.k === "say" ? [x.words ?? ""] : x.k === "layout" && x.word === "inside" ? [x.arg.slice(x.arg.indexOf(": ") + 2)] : [])),
      ...Object.values(m.relations).map((r) => r.label ?? "")].join("\u0001"));
    const lanesOwn = (p: Extract<Prim, { k: "text" }>) => p.font === "chip" && own.includes(norm(p.lines.join(" ")));
    for (const p of frame) if (p.k === "text" && !p.key.startsWith("t:") && !lanesOwn(p) && tops.some((r) => within(p.x, p.y, r))) bad.push(`${k} stray "${p.lines.join(" ")}" in a card`);
  }
  return bad;
}

describe("lanes: every frame draws what the core's states say", () => {
  test("the fences: every lanes fence of the stage fixtures and the generic-test scenes", () => {
    expect(lanes.length).toBeGreaterThanOrEqual(35);
    // fences the core refuses today (`set box: a => b`, eng-core2): drawn by nothing yet, so not checked here
    expect(broken.every((id) => /example-layers\.dh\.md#(8|9|11)$|20-animation-boxes-inside-boxes/.test(id))).toBe(true);
  });
  for (const { f, c } of lanes) for (const w of [1280, 390]) {
    test(`${f.id} at ${w}`, () => { expect(check(c, w)).toEqual([]); });
  }
});

describe("lanes: a step changes what a card shows through the Model", () => {
  const one = (file: string) => { const [f] = fencesOf(join(ROOT, file)); return compile(f.src); };
  test("16 pills: a moved pill sits in the slot of the card ThingState.at names, and keeps its key", () => {
    const c = one("fixtures/stage/16-animation-pills-that-move.dh.md"), p = c.plan(1280);
    expect(c.states[2].things.p3.at).toBe("w");
    const w2 = p.rects(2).w, p3 = p.rects(2).p3, p31 = p.rects(1).p3, sa = p.rects(1).sa;
    expect(within(p3.x, p3.y, w2)).toBe(true); expect(within(p31.x, p31.y, sa)).toBe(true);
    expect(p.frame(2).some((q) => q.key === "t:p3" && q.k === "box")).toBe(true);
    expect(p.frame(2).find((q) => q.key === "t:p1:note")).toMatchObject({ lines: ["sold"] });
  });
  test("17 tokens and a record: a mark tones its chips this step, a fill writes a value from its step on", () => {
    const c = one("fixtures/stage/17-animation-token-chips-and-a-record.dh.md"), p = c.plan(1280);
    const tone = (k: number, i: number) => (p.frame(k).find((q) => q.key === `t:q:tok${i}`) as any)?.tone ?? null;
    expect(tone(1, 0)).toBeNull(); expect(tone(2, 0)).toBe("accent"); expect(tone(3, 0)).toBeNull(); expect(tone(3, 4)).toBe("bad");
    expect(p.frame(3).find((q) => q.key === "t:q:tok4:r")).toMatchObject({ lines: ["dropped: optional"] });
    const val = (k: number, j: number) => (p.frame(k).find((q) => q.key === `t:r:val${j}`) as any)?.lines.join(" ");
    expect(val(1, 1)).toBe("..."); expect(val(2, 1)).toBe("flour, sugar, salt"); expect(val(3, 1)).toBe("flour, sugar"); expect(val(4, 4)).toBe("25 minutes");
  });
  test("15 cards inside cards: a holder shows its own title and lines above what it holds", () => {
    const c = one("fixtures/stage/15-animation-cards-inside-cards.dh.md"), p = c.plan(1280);
    const r = p.rects(1);
    for (const id of Object.keys(r)) {
      const t = c.model.things[id]; if (!t.container) continue;
      const title = p.frame(1).find((q) => q.key === `t:${id}:title`) as any;
      expect(title?.lines.join(" ")).toBe(t.title);
      const kids = Object.keys(r).filter((k) => c.model.things[k].parent === id);
      for (const kid of kids) expect(title.y).toBeLessThan(r[kid].y);
    }
  });
});

describe("lanes: format 12 draws what was written (review M1 1.1, row 2)", () => {
  const body = `title: Orders | a lanes page in format 12
layout: lanes
## Front
client web: web app | the shop
## Back
server api: api | answers
store db [cylinder]: orders db | primary
plain tk [token]: req
api -> db
@step One: the api asks
web -> api: GET
db is READY
tk at web
@step Two: lost and streamed
db is -
web -x api: lost
api ~> db: rows
tk at api`;
  const c = compile({ body, line0: 1, fence: {}, roles: { client: 1, server: 2, store: 3 }, format12: true });
  const p = c.plan(1000);
  test("no problem; a flag keeps its shape", () => {
    expect(c.problems.filter((x) => !x.warn)).toEqual([]);
    expect(p.frame(1).find((q) => q.key === "t:db")).toMatchObject({ k: "box", shape: "cylinder" });
  });
  test("`is -` clears the chip", () => {
    expect(p.frame(1).find((q) => q.key === "t:db:is")).toMatchObject({ words: "READY" });
    expect(p.frame(2).find((q) => q.key === "t:db:is")).toBeUndefined();
  });
  test("`-x` and `~>` stay lost and streamed (the renderer plays them from the events)", () => {
    expect(c.motions[2].events.map((e) => (e.k === "send" ? e.style : e.k))).toEqual(["lost", "stream"]);
  });
  test("a token is not a card: it sits at the thing the core says, and moves with it", () => {
    const r1 = p.rects(1), r2 = p.rects(2);
    const tk1 = p.frame(1).find((q) => q.key === "t:tk") as any, tk2 = p.frame(2).find((q) => q.key === "t:tk") as any;
    expect(tk1.x).toBeGreaterThanOrEqual(r1.web.x); expect(tk1.x).toBeLessThanOrEqual(r1.web.x + r1.web.w);
    expect(tk2.x).toBeGreaterThanOrEqual(r2.api.x); expect(tk2.x).toBeLessThanOrEqual(r2.api.x + r2.api.w);
  });
});

describe("lanes: a card's lines sit where the stage put them (its line words were placed by that)", () => {
  test("gt 05: the resolver's line is on the stage's baseline, right under its title", () => {
    const [f] = fencesOf(join(ROOT, "fixtures/gt/05-dns-lookup.dh.md")), c = compile(f.src), p = c.plan(1280);
    const r = p.rects(3).r, lines = p.frame(3).find((q) => q.key === "t:r:lines") as Extract<Prim, { k: "text" }>;
    expect(lines.y).toBeCloseTo(r.y + 10 + 18 + 16 - 3, 5); // CARD_PT + one title line + LINE_H.sub - 3 (stage-cards.ts drawCard)
  });
});

describe("lanes: a tone paints the whole card (the stage's rule)", () => {
  test("every toned card in every lanes fence gives up its role colour, so it fills with the tone; a card box keeps its id and is eng-noring (no renderer ring)", () => {
    const bad: string[] = [];
    for (const { f, c } of lanes) for (const w of [1280, 390]) {
      const p = c.plan(w);
      for (let k = 0; k < c.states.length; k++) for (const q of p.frame(k)) {
        if (q.k !== "box" || !q.key.startsWith("t:")) continue;
        const t = c.model.things[q.key.slice(2)]; if (!t || t.shape !== "box" || t.chart) continue;
        if (q.tone && q.role !== null) bad.push(`${f.id} ${w} k${k} ${t.id} tone ${q.tone} role ${q.role}`);
        if (q.id !== t.id || !/(^|\s)eng-noring(\s|$)/.test(q.cls ?? "")) bad.push(`${f.id} ${w} k${k} ${t.id} box id ${q.id} cls ${q.cls}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe("lanes: a card line's marks give it its look (the stage's rule), a badge letter is strong", () => {
  test("example-layers 4 and 12: the '* ' lines draw in the card's colour, at both widths, with the Model's words", () => {
    const fs = fencesOf(join(ROOT, "fixtures/stage/example-layers.dh.md"));
    for (const [n, id, k, words] of [[4, "cu", 3, "example, not computed"], [12, "win", 9, "painted: Hello from example.com"]] as const) for (const w of [1280, 390]) {
      const c = compile(fs[n - 1].src), f = c.plan(w).frame(k);
      const hit = f.find((q) => q.k === "text" && q.key.startsWith(`t:${id}:lines`) && q.lines[0].startsWith(words));
      expect(hit && hit.k === "text" ? `${hit.ink} ${hit.role}` : `missing at ${w}`).toBe(`role ${c.model.things[id].role}`);
    }
  });
  test("stage 01: a worker badge's letter square is the role's line colour (pf-line) and its letter the surface (pi-surface)", () => {
    const [fe] = fencesOf(join(ROOT, "fixtures/stage/01-animation-a-composed-stage.dh.md")), f = compile(fe.src).plan(1280).frame(1);
    const sq = f.find((q) => q.key === "t:s0:badge:a:l"), lt = f.find((q) => q.key === "t:s0:badge:a:lt");
    expect(sq?.cls).toContain("pf-line"); expect(sq?.cls).toContain("stg-box"); expect(lt?.cls).toContain("pi-surface");
  });
});

describe("lanes: a state word is written in the card's corner, a say keeps every line", () => {
  const [fe] = fencesOf(join(ROOT, "fixtures/stage/15-animation-cards-inside-cards.dh.md")), c = compile(fe.src);
  for (const w of [1280, 390]) test(`stage 15 at ${w}: 'open' good and 'shut' bad as corner words, the van's say has 'one driver' over the card`, () => {
    const p = c.plan(w), f1 = p.frame(1), f2 = p.frame(2);
    const is = (f: Prim[], id: string) => f.find((q) => q.key === `t:${id}:is`);
    const open = is(f1, "f1"), shut = is(f1, "f2");
    expect(open?.k === "text" ? `${open.lines[0]} ${open.tone} ${open.anchor}` : "none").toBe("open good end");
    expect(shut?.k === "text" ? `${shut.lines[0]} ${shut.tone}` : "none").toBe("shut bad");
    const say = f2.filter((q) => q.k === "text" && q.font === "chip" && /runs late|one driver/.test(q.lines.join(" ")));
    expect(say.length).toBe(2);
    expect(say.every((q) => /eng-top/.test(q.cls ?? ""))).toBe(true);
  });
});
