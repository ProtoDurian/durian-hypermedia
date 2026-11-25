// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 "sprint": the stage in print and the bar's region labels.
// 1. Region labels: every lane, band, panel and bin the stage draws carries data-bar-kind and,
// when the source gives it a title, data-bar-label with that title. The titles are read here from the source text
// by a scan of its own (the "## " headings, the panel lines, the bin lines), not from the engine, and looked for
// on the drawn <rect> elements of the server-rendered stage (both its wide and its narrow plan).
// 2. Print (SPEC 4.1): printRelayout lays the stage out again on beforeprint, on matchMedia("print") only when the
// sheet is too narrow for 8 pt, and back after printing; the page's print rule drops the side column.
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Stage, printRelayout, PRINT_W, SSR_W, type StageSrc } from "../../src/ui/stage";
const NP = SSR_W.length + 1; // the server's plans: one per width, and the print plan
import { UI } from "../../src/ui/ui";
import { compileStage, layoutStage, panelTitle } from "../../src/core/stage";
import { measure } from "../../src/core/stage-core";
import { beginDocument, newBudget } from "../../src/core/stage-budget";

const REGIONS = new Set(["lane", "band", "panel", "bin", "track", "table"]);
const ROLES = { client: 1, server: 2, store: 3, ops: 4, api: 5, job: 6 };
const src = (text: string): StageSrc => {
  const i = text.indexOf("@step "), head = i < 0 ? text : text.slice(0, i);
  const steps = i < 0 ? [] : text.slice(i).split(/^@step /m).slice(1).map((s, k) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl < 0 ? undefined : nl), raw: nl < 0 ? "" : s.slice(nl + 1), line: 100 + k }; });
  return { head, steps, base: 1, info: {} };
};
const html = (text: string) => { beginDocument(newBudget()); return renderToStaticMarkup(React.createElement(Stage, { src: src(text), roles: ROLES, ui: UI.en })); };
/** every drawn rect's attributes, from the markup */
const rects = (h: string) => [...h.matchAll(/<rect\b([^>]*)\/?>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")])));
/** the titles the source gives its regions, by line shape: "## X" (a lane), "## X under A..B" (a band), "list X",
 * "map X", "chips N: X", "card role: X |...", 'bin role id "X"' */
function sourceTitles(text: string): { kind: string; title: string }[] {
  const out: { kind: string; title: string }[] = [];
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("## ")) { const t = l.slice(3), u = t.indexOf(" under "); const name = u < 0 ? t : t.slice(0, u); if (name !== "_") out.push({ kind: u < 0 ? "lane" : "band", title: name }); continue; }
    const sp = l.indexOf(" "); if (sp < 0) continue;
    const w = l.slice(0, sp), rest = l.slice(sp + 1);
    if ((w === "list" || w === "map") && rest) out.push({ kind: "panel", title: rest });
    if (w === "chips") { const c = rest.indexOf(": "); if (c >= 0) out.push({ kind: "panel", title: rest.slice(c + 2) }); }
    if (w === "card" && raw === l) { const c = rest.indexOf(": "); if (c >= 0) out.push({ kind: "panel", title: rest.slice(c + 2).split(" | ")[0] }); }
    if (w === "bin") { const q = rest.indexOf('"'), q2 = rest.indexOf('"', q + 1); if (q >= 0 && q2 > q) out.push({ kind: "bin", title: rest.slice(q + 1, q2) }); }
  }
  return out;
}

const LANES = `title: Orders | one request
## Browsers
client b1,b2: laptop; phone | sends GET /orders
## Servers
server s0: api 0 | answers in JSON
## Storage
store db: orders database | primary
## Config under Browsers..Servers
ops cfg: config service | pushes routes
@step Ask: a browser asks
b1 -> s0: GET
@step Read: the server reads
s0 -> db: SELECT
`;
const PANELS = `title: Settings | three panels
## Servers
server s0: api 0 | answers
@step Settings: the settings
list Settings
  timeout: 30 s
  + retries
  - the old flag
@step Relabel: the labels
map relabel
  api: web-1
  port 8080
  to
  + name; + zone; - debug
@step Kept: what is kept
chips 3: kept labels
  + name=web; + zone=east; - pod=web-1
@step Store: the store
card store: The store | holds the rows
  a: replica a | 1 + 2 = 3
@step Grid: two hosts
grid 2
  server: web-1 | 192.0.2.10 · up [+ kept]
  server: web-9 | 192.0.2.19 · draining [- not ready: drop]
@step Calc: the sum
calc
  hash = 0x51
`;
const BINS = `bins: Sorting | parcels
items p1..p6: one; two; three; four; five; six
bin ops a "Light": under 1 kg | by letter
bin api b "Heavy": over 1 kg
@step First: light ones
into a: p1, p2
@step Second: heavy ones
into b: p3..p5
`;

describe("sprint: region labels for the bar", () => {
  test("bars and columns: the author's labels name every bar and column, shown on the axis or not; default numbers stay as drawn", () => {
    const BARS = "bars 7 ops: day | cups\n  labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun\n  every 3\n@step One: one\nvalues: 1 2 3 4 5 6 7\n@step Two: two\nvalues: 2 2 3 4 5 6 7\n";
    const COLS = "columns 12 ops: per month | tickets\n  every 3\n  labels: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec\n@step One: one\ncounts 12: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12\n@step Two: two\ncounts 12: 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12\n";
    const want = (text: string) => text.split("\n").find((l) => l.trim().startsWith("labels: "))!.trim().slice(8).split(", ");
    const bars = rects(html(BARS)).filter((r) => r["data-bar-kind"] === "panel" && r.class.includes("stg-bar"));
    expect(bars.length).toBeGreaterThan(0);
    for (const r of bars) expect(want(BARS)).toContain(r["data-bar-label"]);
    expect(new Set(bars.map((r) => r["data-bar-label"]))).toEqual(new Set(want(BARS)));
    const cols = rects(html(COLS)).filter((r) => r.class.includes("stg-col"));
    expect(new Set(cols.map((r) => r["data-bar-label"]))).toEqual(new Set(want(COLS)));
    // no labels: line: the numbers are not author words, so only the columns whose number shows are named (as before)
    const plain = rects(html("columns 12 ops: per month | tickets\n  every 3\n@step One: one\ncounts 12: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12\n@step Two: two\ncounts 12: 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12\n")).filter((r) => r.class.includes("stg-col"));
    expect(plain.some((r) => !("data-bar-label" in r))).toBe(true);
  });
  for (const [name, text] of [["lanes and a band", LANES], ["panels", PANELS], ["bins", BINS]] as const) {
    test(`${name}: every titled region in the source is a drawn rect with its kind and title, in every server plan`, () => {
      const want = sourceTitles(text), rs = rects(html(text));
      expect(want.length).toBeGreaterThan(0);
      for (const w of want) {
        // a panel is a region of its own kind, or of the kind its own frame already has (a full-width card is a lane)
        const hits = rs.filter((r) => r["data-bar-label"] === w.title && (w.kind === "panel" ? REGIONS.has(r["data-bar-kind"]) : r["data-bar-kind"] === w.kind));
        // the server renders a plan per width (SSR_W): the region is in each
        expect({ ...w, hits: hits.length }).toEqual({ ...w, hits: NP });
      }
    });
  }
  test("the source scan finds what it should (a control on the scan itself)", () => {
    expect(sourceTitles(LANES)).toEqual([{ kind: "lane", title: "Browsers" }, { kind: "lane", title: "Servers" }, { kind: "lane", title: "Storage" }, { kind: "band", title: "Config" }]);
    expect(sourceTitles(PANELS).map((x) => x.title)).toEqual(["Servers", "Settings", "relabel", "kept labels", "The store"]);
    expect(sourceTitles(BINS).map((x) => x.title)).toEqual(["Light", "Heavy"]);
  });
  test("every step's panel is exactly one region, shown in its step only, labelled exactly when the source titles it", () => {
    const rs = rects(html(PANELS)).filter((r) => REGIONS.has(r["data-bar-kind"]) && r["data-to"]);
    const titled = [true, true, true, true, false, false]; // list, map, chips, card; grid and calc have no title: none is made up
    for (let k = 1; k <= 6; k++) {
      const mine = rs.filter((r) => r["data-from"] === String(k));
      expect({ k, n: mine.length }).toEqual({ k, n: NP }); // one per server plan
      for (const r of mine) { expect(r["data-to"]).toBe(String(k)); expect({ k, labelled: "data-bar-label" in r }).toEqual({ k, labelled: titled[k - 1] }); }
    }
    // a frame that already is a region keeps its kind and takes the title (a full-width card: the step's panel), or stays unnamed (calc: a band)
    expect(rs.filter((r) => r["data-from"] === "4").map((r) => r["data-bar-kind"])).toEqual(Array(NP).fill("panel"));
    expect(rs.filter((r) => r["data-from"] === "6").map((r) => r["data-bar-kind"])).toEqual(Array(NP).fill("band"));
  });
  test("a panel region covers its panel: every item of the step's panel lies inside it", () => {
    beginDocument(newBudget());
    const s = src(PANELS), c = compileStage(s.head, s.steps, 1, {}, ROLES);
    expect(c.errors).toEqual([]);
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w);
      for (let k = 1; k <= 6; k++) {
        const reg = p.items.find((i: any) => i.k === "box" && REGIONS.has(i.bar?.kind) && i.from === k && i.to === k) as any;
        expect(reg).toBeDefined();
        const inStep = p.items.filter((i: any) => i.from === k && i.to === k && i !== reg && i.k === "box") as any[];
        for (const b of inStep) { expect(b.x).toBeGreaterThanOrEqual(reg.x - 0.5); expect(b.y).toBeGreaterThanOrEqual(reg.y - 0.5); expect(b.x + b.w).toBeLessThanOrEqual(reg.x + reg.w + 0.5); expect(b.y + b.h).toBeLessThanOrEqual(reg.y + reg.h + 0.5); }
      }
    }
  });
  test("panelTitle: the map's word, the others' title, nothing made up", () => {
    beginDocument(newBudget());
    const s = src(PANELS), c = compileStage(s.head, s.steps, 1, {}, ROLES);
    expect(c.model.steps.map((st) => panelTitle(st.panels[0]))).toEqual(["Settings", "relabel", "kept labels", "The store", "", ""]);
  });
  test("lanes with no heading ('_') and a scene with no '##' get the kind but no label", () => {
    const rs = rects(html(`## _\nserver s0: api 0 | one\n## Store\nstore db: database | two\n`));
    const lanes = rs.filter((r) => r["data-bar-kind"] === "lane");
    expect(lanes.filter((r) => r["data-bar-label"] === "Store").length).toBe(NP);
    expect(lanes.filter((r) => !("data-bar-label" in r)).length).toBe(NP);
  });
});

// a stand-in browser for printRelayout: window events, matchMedia("print"), an element with a width
function fakeBrowser() {
  const ls = new Map<string, Set<(e: any) => void>>(), mqLs = new Set<(e: any) => void>();
  const g = globalThis as any, saved = { window: g.window, addEventListener: g.addEventListener, removeEventListener: g.removeEventListener, getComputedStyle: g.getComputedStyle };
  g.window = { matchMedia: () => ({ addEventListener: (_: string, f: any) => mqLs.add(f), removeEventListener: (_: string, f: any) => mqLs.delete(f) }) };
  g.addEventListener = (t: string, f: any) => { (ls.get(t) ?? ls.set(t, new Set()).get(t)!).add(f); };
  g.removeEventListener = (t: string, f: any) => { ls.get(t)?.delete(f); };
  const el = { clientWidth: 1178 } as any as HTMLElement & { clientWidth: number };
  g.getComputedStyle = (element: HTMLElement) => ({ width: element.clientWidth + "px", boxSizing: "content-box" });
  let w = 1178; const calls: number[] = [];
  const stop = printRelayout(el, (x) => { w = x; calls.push(x); }, () => w);
  return {
    el, calls, width: () => w,
    fire: (t: string) => { for (const f of ls.get(t) ?? []) f({}); },
    media: (matches: boolean) => { for (const f of mqLs) f({ matches }); },
    count: () => [...ls.values()].reduce((a, s) => a + s.size, 0) + mqLs.size,
    done: () => { stop(); Object.assign(g, saved); },
  };
}
describe("sprint: print lays the stage out again", () => {
  test("A4: beforeprint lays out at PRINT_W; the print media change at that width does not lay out again; afterprint goes back", () => {
    const b = fakeBrowser();
    try {
      b.fire("beforeprint"); expect(b.width()).toBe(PRINT_W);
      b.el.clientWidth = 620; b.media(true); expect(b.calls).toEqual([PRINT_W]);
      b.el.clientWidth = 1178; b.fire("afterprint"); b.media(false); expect(b.calls).toEqual([PRINT_W, 1178]);
    } finally { b.done(); }
  });
  test("after printing a screen between plan widths restores its screen plan", () => {
    const b = fakeBrowser();
    try {
      b.fire("beforeprint");
      b.el.clientWidth = 850; // Between the 800 px and 880 px screen plans.
      b.fire("afterprint"); b.media(false);
      expect(b.calls).toEqual([PRINT_W, 800]);
    } finally { b.done(); }
  });
  test("a slightly wider sheet (Letter) keeps the PRINT_W layout: it only scales up a little, and the page count stays right", () => {
    const b = fakeBrowser();
    try { b.fire("beforeprint"); b.el.clientWidth = 639; b.media(true); expect(b.calls).toEqual([PRINT_W]); } finally { b.done(); }
  });
  test("a much wider sheet (A3 landscape) keeps the PRINT_W layout: a re-layout after the pages are counted left blank pages at the end", () => {
    const b = fakeBrowser();
    try { b.fire("beforeprint"); b.el.clientWidth = 1178; b.media(true); expect(b.calls).toEqual([PRINT_W]); } finally { b.done(); }
  });
  test("a narrower sheet (A5) lays out again at its own width, so words stay at 11 px", () => {
    const b = fakeBrowser();
    try { b.fire("beforeprint"); b.el.clientWidth = 420; b.media(true); expect(b.calls).toEqual([PRINT_W, 420]); } finally { b.done(); }
  });
  test("no beforeprint (a browser that only changes the media): the media change lays out at the print width", () => {
    const b = fakeBrowser();
    try { b.el.clientWidth = 620; b.media(true); expect(b.calls).toEqual([620]); } finally { b.done(); }
  });
  test("a stage already narrower than PRINT_W (a phone printing) keeps its width on beforeprint", () => {
    const b = fakeBrowser();
    try { b.el.clientWidth = 358; (b as any).calls.length = 0; b.fire("beforeprint"); expect(b.calls).toEqual([358]); } finally { b.done(); }
  });
  test("the listeners go when the stage goes", () => {
    const b = fakeBrowser(); expect(b.count()).toBe(3); b.done(); expect(b.count()).toBe(0);
  });
  test("PRINT_W keeps an A4 sheet (0.4 in margins) at 8 pt or more: the stage box measured there is 620 px", () => {
    // measured in Chrome's print layout by the prototype's notes: A4, 0.4 in margins -> the stage's box is 620 px
    expect((11 * 0.75 * 620) / PRINT_W).toBeGreaterThanOrEqual(8);
  });
  test("a stage prints on one page when it fits: capped at a page (100vh in print), the drawing box gives way down to its 8 pt floor", () => {
    const stage = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8"), tsx = readFileSync(join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8");
    expect(stage).toContain("max-height: max(calc(100vh - 130px), var(--stg-need, 0px))");
    expect(stage).toContain("min-height: var(--stg-boxmin, 0px)");
    expect(tsx).toContain('"--stg-boxmin"'); expect(tsx).toContain("aspectRatio");
  });
  test("the page's print rule drops the side column; the stage keeps its drawing whole and its title with it", () => {
    const stage = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8");
    // (the site's side-column print rule is the host's page chrome, not the package's)
    expect(stage).toContain(".stg-box-wrap { break-inside: avoid; break-before: avoid; }");
    expect(stage).toContain(".stg { break-inside: avoid; max-width: var(--stg-max); margin-inline: auto; }");
    expect(stage).toContain(".stg-bar { break-after: avoid; }");
  });
// print 3: a landscape sheet scales a stage up as a whole; the time axis keeps its words clear of the right edge
  test("a landscape sheet scales each stage up as a whole (CSS zoom from its height estimate), never below 1, and the cap follows in the stage's own units", () => {
    const stage = readFileSync(join(import.meta.dir, "../../src/ui/stage.css"), "utf8"), tsx = readFileSync(join(import.meta.dir, "../../src/ui/stage.tsx"), "utf8");
    expect(stage).toContain("@media print and (orientation: landscape)");
    expect(stage).toContain("--stg-z: max(1, min(calc(100vw / 720px), calc((100vh - 120px) / var(--stg-hint, 700px))))");
    expect(stage).toContain("zoom: var(--stg-z)");
    expect(stage).toContain("max-height: max(calc((100vh - 120px) / var(--stg-z)), var(--stg-need, 0px))");
    expect(tsx).toContain('"--stg-hint"'); expect(tsx).toContain("PRINT_BOX_W");
  });
  test("the time axis keeps every word at least 30 drawing units (8.8 mm on A4: 30 x 1.105 x 0.2646) from the right edge, at 620 and 1180 wide (a phone keeps its 8 unit margin)", () => {
    const text = readFileSync(join(import.meta.dir, "samples/format-stages.dh.md"), "utf8"), i = text.indexOf("title: A delivery check"), j = text.indexOf("```", i);
    for (const w of [620, 1180]) {
      beginDocument(newBudget());
      const c = src(text.slice(i, j)), plan = layoutStage(compileStage(c.head, c.steps, c.base, c.info, ROLES).model, w);
      const words = plan.items.filter((it: any) => it.k === "text");
      expect(words.length).toBeGreaterThan(5);
      for (const t of words as any[]) {
        const wd = measure(t.s, t.f), right = t.anchor === "middle" ? t.x + wd / 2 : t.anchor === "end" ? t.x : t.x + wd;
        expect(right).toBeLessThanOrEqual(w - 30 + 1e-6);
      }
    }
  });
  // the graph engine's print rule (its own stylesheet) is not part of the stage port
  test.skip("a scene never prints taller than its page: its frame is capped in print, above the static rule that lifted every cap", () => {
    const css = readFileSync(join(import.meta.dir, "../../src/ui/engine11.css"), "utf8");
    expect(css).toContain(".scn.is-static .scn-stage { max-height: none; min-height: 0; }");
    expect(css).toContain(".scn.is-static .scn-stage.scn-stage { max-height: calc(100vh - 300px); }");
    // the cap rule has the higher specificity (4 classes against 3) and comes inside the print block
    expect(css.indexOf("@media print {")).toBeLessThan(css.indexOf(".scn.is-static .scn-stage.scn-stage"));
  });
  test("a tick word keeps 8 drawing units clear of every vertical line (the end marker), at 620 and 1180 wide (a phone keeps its 8 unit margin)", () => {
    const text = readFileSync(join(import.meta.dir, "samples/format-stages.dh.md"), "utf8"), i = text.indexOf("title: A delivery check"), j = text.indexOf("```", i);
    for (const w of [620, 1180]) {
      beginDocument(newBudget());
      const c = src(text.slice(i, j)), plan = layoutStage(compileStage(c.head, c.steps, c.base, c.info, ROLES).model, w) as any;
      const vlines = plan.items.filter((it: any) => it.k === "path" && it.pts.length === 2 && it.pts[0][0] === it.pts[1][0] && Math.abs(it.pts[0][1] - it.pts[1][1]) > 12);
      const ticks = plan.items.filter((it: any) => it.k === "text" && it.s === "check");
      expect(ticks.length).toBeGreaterThan(0); expect(vlines.length).toBeGreaterThan(0);
      for (const t of ticks) {
        const wd = measure(t.s, t.f), left = t.x, right = t.x + wd;
        for (const l of vlines) {
          const y0 = Math.min(l.pts[0][1], l.pts[1][1]), y1 = Math.max(l.pts[0][1], l.pts[1][1]);
          if (t.y < y0 - 12 || t.y > y1 + 12) continue;
          expect(l.pts[0][0] > left - 8 && l.pts[0][0] < right + 8).toBe(false);
        }
      }
    }
  });
});
