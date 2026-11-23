// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// "stageforms": (1) a light lasts one step, in every block that lights things (BLOCKS 1.0 rule 1: "Light up for one
// step: light"; `keep` is the word for "from now on").
// Each block below is lit at step 2, nothing is written at step 3, and it is lit again at step 4. The expected steps come
// from the source written here, not from the engine: what the page draws with the halo is read from the plan with the
// renderer's own rule (site/src/stage.tsx: an item shown in step k is drawn `stg-hot` when its `hot` names k, or when
// its class says so outright), at the wide (1000) and the phone (340) width.
import { beforeEach, describe, expect, test } from "bun:test";
import { compileStage, layoutStage, stageLlm } from "../../src/core/stage";
import { FONT, type Item } from "../../src/core/stage-core";
import { beginDocument } from "../../src/core/stage-budget";

const ROLES = { client: 1, server: 2, store: 3, ops: 4, job: 5, desk: 6, eng: 7, app: 8, shop: 1, till: 2, office: 3 };
const split = (src: string) => {
  const i = src.indexOf("@step "), head = i < 0 ? src : src.slice(0, i);
  const steps = i < 0 ? [] : src.slice(i).split(/^@step /m).slice(1).map((s, k) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl < 0 ? undefined : nl), raw: nl < 0 ? "" : s.slice(nl + 1), line: 100 + k }; });
  return { head, steps };
};
const compile = (src: string) => { const { head, steps } = split(src); return compileStage(head, steps, 1, {}, ROLES); };
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
/** the renderer's halo rule, read off the plan; and the accent paint a block lights with instead (bars, columns: no tone word is written here) */
const ACC = /(^| )acc:/;
const haloAt = (it: Item, k: number) => shownAt(it, k) && (!!(it as any).hot?.includes(k) || /\bstg-hot\b/.test((it as any).cls ?? "") || ACC.test(`${(it as any).fill ?? ""} ${(it as any).stroke ?? ""} ${(it as any).ink ?? ""}`));
const key = (it: Item) => `${it.k}:${(it as any).id ?? ""}:${Math.round((it as any).x ?? 0)}:${Math.round((it as any).y ?? 0)}`;
const halo = (items: Item[], k: number) => new Set(items.filter((it) => haloAt(it, k)).map(key));
beforeEach(() => beginDocument());

/** four steps: lit at 2 by `light`, nothing at 3, lit again at 4 */
const fourSteps = (light: string, first = "") => `@step One: nothing lit.\n${first}\n@step Two: lit.\n${light}\n@step Three: nothing written.\n@step Four: lit again.\n${light}\n`;

const BLOCKS: { name: string; src: string }[] = [
  { name: "a card (stage)", src: `## Browsers\nclient b1, b2: laptop; phone | sends GET\n## Servers\nserver s0: api 0 | answers\n${fourSteps("light s0")}` },
  { name: "a pill (cards)", src: `## Shelves\nserver sa: shelf A | by the door\n  pill p1,p2: rye; spelt\n${fourSteps("light p1: sold")}` },
  { name: "a group's partial (sheet)", src: `sheet: two shops | 3 tills\nshop s0 "north": shop north | owns 2 tills\n  till t1 "till 1": 10 12 15\n  till t2 "till 2": 4 5 9\nshop s1: shop south | owns 1 till\n  till t3 "till 3": 7 8 9\n=> office out: head office | adds the partials\n${fourSteps("light s0", "sum s0: partial | a = 37 + 18 = 55 -> (55, 2)")}` },
  { name: "the outcome column (sheet)", src: `sheet: two shops | 3 tills\nshop s0 "north": shop north | owns 2 tills\n  till t1 "till 1": 10 12 15\nshop s1: shop south | owns 1 till\n  till t3 "till 3": 7 8 9\n=> office out: head office | adds the partials\n${fourSteps("light out")}` },
  { name: "a row (sheet)", src: `sheet: two shops | 3 tills\nshop s0 "north": shop north | owns 2 tills\n  till t1 "till 1": 10 12 15\n  till t2 "till 2": 4 5 9\n${fourSteps("light t1")}` },
  { name: "a matrix card (matrix)", src: `matrix: Tickets | by team\ncolumn in: Intake\ncolumn fx: Fix\ndesk d: Front desk | first contact\n  in: [t1] New ticket | by email\neng e: Engineering\n  fx: [t4] Patch\n${fourSteps("light t1")}` },
  { name: "a matrix cell (matrix)", src: `matrix: Tickets | by team\ncolumn in: Intake\ncolumn fx: Fix\ndesk d: Front desk | first contact\n  in: [t1] New ticket | by email\neng e: Engineering\n  fx: [t4] Patch\n${fourSteps("light d.in: two wait")}` },
  { name: "a column (columns)", src: `columns 6 store: books returned | books\n  labels: Jan, Feb, Mar, Apr, May, Jun\n${fourSteps("light Mar", "counts 6: 4, 3, 5, 2, 6, 1")}` },
  { name: "a bin (bins)", src: `bins: Sorting | parcels\nitems p1..p4: one; two; three; four\nbin ops a "Light": under 1 kg\nbin server b "Heavy": over 1 kg\n${fourSteps("light a: light ones", "into a: p1, p2")}` },
  { name: "a bar (bars)", src: `bars 4 server: day · cups | ×\n  axis 0, 1, 2\n  labels: Mon, Tue, Wed, Thu\n${fourSteps("light Wed: the busiest", "values: 0.7 0.8 1.4 1.0")}` },
  { name: "a wrapper (nest)", src: `nest: The packet | outside in\n  ops fr: frame | 117 bytes | to a\n  app rq: request | 37 bytes | GET /\n${fourSteps("light rq")}` },
];

describe("a light lasts one step, in every block", () => {
  for (const b of BLOCKS) test(b.name, () => {
    const c = compile(b.src);
    expect(c.errors).toEqual([]);
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w);
      const h2 = halo(p.items, 2), h3 = halo(p.items, 3), h4 = halo(p.items, 4);
      expect(h2.size).toBeGreaterThan(0);                 // lit in its step
      expect([...h3].filter((x) => h2.has(x))).toEqual([]); // not in the next, where nothing is written
      expect([...h3]).toEqual([]);                          // and nothing else lit there either
      for (const x of h2) expect(h4.has(x)).toBe(true);     // lit again where written again
    }
  });
});

describe("time cells and segments: a [lit] or [bad] state is lit in its first step only", () => {
  const T = `time: 0..8 | ticks\ncells: 1\nrow job a "writer": +writes 0..2; dies 2..3 @2 [bad]; down 3..8 @3 [dashed]\nrow server b "backup": skips 0..2 [dashed]; +writes 2..8 @2 [lit]\n@step One: normal.\n@step Two: a dies.\n@step Three: b carries on.\n@step Four: still.\n`;
  const S = T.replace("cells: 1\n", "");
  for (const [name, src] of [["cells", T], ["segments", S]] as const) test(name, () => {
    const c = compile(src);
    expect(c.errors).toEqual([]);
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w);
      expect(halo(p.items, 2).size).toBeGreaterThan(0);
      expect([...halo(p.items, 3)]).toEqual([]);
      expect([...halo(p.items, 4)]).toEqual([]);
      // the [bad] state keeps its tone (thick border and cross) while it shows; [lit] is not thick after its step
      const boxes = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && /stg-(time-cell|seg)/.test(i.cls ?? ""));
      const bad = boxes.filter((i) => i.stroke === "bad:line"), lit = boxes.filter((i) => (i.from ?? 1) === 2 && i.stroke !== "bad:line");
      expect(bad.length).toBeGreaterThan(0); expect(bad.every((i) => i.thick)).toBe(true);
      expect(lit.length).toBeGreaterThan(0); expect(lit.some((i) => i.thick)).toBe(false);
    }
  });
});

test("a sheet's partial card is drawn like the original's: a plain border, the halo only in its lit step", () => {
  const c = compile(BLOCKS[2].src);
  expect(c.errors).toEqual([]);
  for (const w of [1000, 340]) {
    const p = layoutStage(c.model, w), sum = p.items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.id === "sum:s0");
    expect(sum.length).toBe(1);
    expect(sum[0].thick).toBeFalsy();               // a thick role border reads as lit on every later step
    expect(sum[0].hot).toEqual([2, 4]);
  }
});

// (2) a toned foot line (22 Nov): "foot (warn): words", the tone or a role in brackets before the colon, as
// "say db (client): words" does; any other bracket is refused (it was dropped silently before)
describe("a foot line in a tone or a role's colour", () => {
  const scene = (foot: string) => `## Writers\nclient a: writer a\n## Store\nstore db: the store\n@step One: normal.\nfoot: 2 ticks, 2 writes\n@step Two: late.\n${foot}\n`;
  const footText = (items: Item[], s: string) => items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text" && i.s === s);
  test("a tone draws the line in that tone's ink, in its step only", () => {
    const c = compile(scene("foot (warn): store: t3 not written yet"));
    expect(c.errors).toEqual([]);
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w), t = footText(p.items, "store: t3 not written yet");
      expect(t.length).toBe(1); expect(t[0].ink).toBe("warn:ink");
      expect(shownAt(t[0], 2)).toBe(true); expect(shownAt(t[0], 1)).toBe(false);
      expect(footText(p.items, "2 ticks, 2 writes")[0].ink).toBe("muted"); // a plain foot stays muted
    }
  });
  test("every tone, and a role", () => {
    for (const [word, ink] of [["good", "good:ink"], ["bad", "bad:ink"], ["accent", "acc:ink"], ["store", "role:store:line"]]) {
      const c = compile(scene(`foot (${word}): the words`)); expect(c.errors).toEqual([]);
      expect(footText(layoutStage(c.model, 1000).items, "the words")[0].ink).toBe(ink);
    }
  });
  test("any other bracket is refused, naming the fix", () => {
    for (const bad of ["foot (loud): the words", "foot warn: the words", "foot (warn: the words"]) {
      const c = compile(scene(bad));
      expect(c.errors.length).toBe(1);
      expect(c.errors[0].msg).toContain('"foot (warn): words"');
    }
  });
  test("the LLM view keeps the words", () => {
    const c = compile(scene("foot (warn): store: t3 not written yet"));
    expect(stageLlm(c)).toContain("store: t3 not written yet");
  });
});

// (4) a band above its lanes (22 Nov): "## Rule above A..B" (or "role id above A..B: title" for a lone card),
// the same band as "under", placed over lanes A to B. Read from the drawn boxes: the band's region ends above every
// lane card's top, spans the named lanes' width, and nothing moves between steps.
describe("a band above its lanes", () => {
  const TREE = `## Sum\nclient a: the sum | by 7 labels\n## Rate\nserver c: the rate | over 2 min\n## Metric\nstore v: the metric | with matchers\n`;
  const steps = `@step One: the rule.\n@step Two: the tree.\na -> c\nc -> v\n@step Three: the plan.\n`;
  const box = (items: Item[], pred: (i: any) => boolean) => items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && pred(i));
  for (const [name, band] of [["## _ above A..B", `## _ above Sum..Metric\nops r: the rule, as written | sum by (...) (rate(...))\n`], ["role id above A..B: title", `ops r above Sum..Metric: the rule, as written | sum by (...) (rate(...))\n`], ["a titled band", `## Rule above Sum..Metric\nops r: the rule, as written | sum by (...) (rate(...))\n`]] as const)
    test(name, () => {
      const c = compile(TREE + band + `## _ under Sum..Metric\nops p: the plan | what every evaluator runs\n` + steps);
      expect(c.errors).toEqual([]);
      for (const w of [1000, 340]) {
        const p = layoutStage(c.model, w), card = (id: string) => box(p.items, (i) => i.id === id)[0];
        const r = card("r"), pl = card("p"), lanes = ["a", "c", "v"].map(card);
        expect(r && pl && lanes.every(Boolean)).toBe(true);
        for (const l of lanes) { expect(r.y + r.h).toBeLessThan(l.y); expect(pl.y).toBeGreaterThan(l.y + l.h); }
        if (w === 1000) { // as wide as the lanes it names
          const x0 = Math.min(...lanes.map((l) => l.x)), x1 = Math.max(...lanes.map((l) => l.x + l.w));
          expect(Math.abs(r.x - x0)).toBeLessThan(1); expect(Math.abs(r.x + r.w - x1)).toBeLessThan(1);
        }
        if (name === "a titled band") { const reg = box(p.items, (i) => i.cls === "stg-region" && i.bar?.label === "Rule")[0]; expect(reg).toBeTruthy(); expect(reg.y + reg.h).toBeLessThanOrEqual(Math.min(...lanes.map((l) => l.y))); }
        // every drawn box keeps one place over the steps (one item per box: nothing redrawn elsewhere)
        expect(box(p.items, (i) => i.id === "r").length).toBe(1);
      }
    });
  test("the LLM view says above", () => {
    const c = compile(TREE + `## Rule above Sum..Metric\nops r: the rule\n` + steps);
    expect(stageLlm(c)).toContain("Rule (above Sum to Metric): the rule.");
  });
  test("a band above names lanes that exist", () => {
    const c = compile(TREE + `## Rule above Sum..Nope\nops r: the rule\n` + steps);
    expect(c.errors.map((e) => e.msg).join(" ")).toContain(`"Nope" is not a lane`);
  });
  test("a connector from a band above to a lane card ends on that card's top", () => {
    const c = compile(TREE + `## Rule above Sum..Metric\nops r: the rule\n@step One: parse.\nr -> a: parsed\n@step Two: done.\n`);
    expect(c.errors).toEqual([]);
    for (const w of [1000, 340]) {
      const p = layoutStage(c.model, w), a = box(p.items, (i) => i.id === "a")[0], r = box(p.items, (i) => i.id === "r")[0];
      const e = p.items.find((i): i is Extract<Item, { k: "path" }> => i.k === "path" && (i as any).id === "r>a")!;
      expect(e).toBeTruthy();
      const [sx, sy] = e.pts[0], [ex, ey] = e.pts.at(-1)!;
      expect(Math.abs(sy - (r.y + r.h))).toBeLessThan(2); expect(Math.abs(ey - a.y)).toBeLessThan(2);
      expect(sx).toBeGreaterThanOrEqual(r.x); expect(ex).toBeGreaterThanOrEqual(a.x); expect(ex).toBeLessThanOrEqual(a.x + a.w);
    }
  });
});

// (3) a flat track (22 Nov): "form: chips" under track: lays the phases as one row of two-line chips (the
// phase's first word over the rest), no arrows between them; on a phone the row may wrap (never cut, never under 11 px)
describe("a track in the chips form", () => {
  const T = `track: ops 0 lights on, 0b doors open, 0c till ready | job J first sale, P stock check, 1+2 restock and label, 3 close till, 4 count cash | ops 5 sweep up\nform: chips\n@step One: zero.\nat 0 lights on\n@step Two: J.\nat J first sale\n`;
  const phases = ["0 lights on", "0b doors open", "0c till ready", "J first sale", "P stock check", "1+2 restock and label", "3 close till", "4 count cash", "5 sweep up"];
  const chips = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.kind === "track" && !i.bar?.tone); // the chips, not their done layers
  const texts = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "text" }> => i.k === "text");
  test("one row at 1000, no arrows, the number over the name, every word whole", () => {
    const c = compile(T); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 1000), cs = chips(p.items);
    expect(cs.length).toBe(9);
    expect(new Set(cs.map((b) => Math.round(b.y))).size).toBe(1);                         // one row
    expect(p.items.some((i) => i.k === "tri" || (i.k === "path" && (i as any).bar?.edge))).toBe(false); // no arrows
    for (let i = 1; i < cs.length; i++) expect(cs[i].x).toBeGreaterThanOrEqual(cs[i - 1].x + cs[i - 1].w); // no overlap
    phases.forEach((ph, i) => {
      const b = cs[i], sp = ph.indexOf(" "), num = ph.slice(0, sp), rest = ph.slice(sp + 1);
      const inside = texts(p.items).filter((t) => shownAt(t, 1) && t.x >= b.x && t.x <= b.x + b.w && t.y > b.y && t.y <= b.y + b.h); // the words one step shows
      // one run per chip: the number, then the name's lines
      expect(inside.length).toBe(1); const n = inside[0], br = n.breaks ?? [];
      expect(n.s.slice(0, br[0]).trimEnd()).toBe(num); expect(n.pitch).toBeGreaterThan(0);  // the number on top, its own line
      expect(n.s.slice(br[0]).split(" ").filter(Boolean).join(" ").replace(/ /g, "")).toBe(rest.replace(/ /g, "")); // nothing cut, nothing lost
      expect(FONT[n.f].size).toBeGreaterThanOrEqual(11);
    });
  });
  test("on a phone the row wraps; nothing under 11 px, nothing outside the stage, nothing moves between steps", () => {
    const c = compile(T); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, 340), cs = chips(p.items);
    expect(cs.length).toBe(9);
    for (const b of cs) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(340); }
    for (const t of texts(p.items)) expect(FONT[t.f].size).toBeGreaterThanOrEqual(11);
    for (const b of cs) expect(b.on === undefined && !b.to).toBe(true); // one place for every step
  });
  test("the step's place lights its chip in that step only", () => {
    const c = compile(T), cs = chips(layoutStage(c.model, 1000).items);
    expect(cs[0].hot).toEqual([1]); expect(cs[3].hot).toEqual([2]);
  });
  test("no destination phase: at step n only that step's phase is marked (22 Nov)", () => {
    const c = compile(T);
    for (const w of [1000, 340]) {
      const cs = chips(layoutStage(c.model, w).items);
      expect(cs.some((b) => b.thick)).toBe(false);                          // the last phase is not drawn as the destination
      const at = [0, 3];                                                     // the source: step 1 "at 0 lights on", step 2 "at J first sale"
      for (const k of [1, 2]) expect(cs.map((b, i) => [i, !!b.hot?.includes(k)]).filter(([, h]) => h).map(([i]) => i)).toEqual([at[k - 1]]);
    }
  });
  test("any other form is refused", () => {
    const c = compile(T.replace("form: chips", "form: flat"));
    expect(c.errors.map((e) => e.msg).join(" ")).toContain(`"form: chips"`);
  });
});

// the review (22 Nov): a faded chip keeps its dim look, but its words read at 4.5:1 or more on its fill, light and dark.
// Measured from the theme's own tokens (site/src/theme.css, stage.css), not from the engine: the chip's fill drawn at
// the dim opacity over the stage's background, the word's ink (at the dim opacity too when the word is dimmed) over that.
describe("a faded chip's words stay readable", () => {
  const css = (f: string) => require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../src/ui", f), "utf8") as string;
  /** the custom properties of one selector's blocks in a stylesheet, the last one winning */
  const vars = (src: string, sel: string) => {
    const out: Record<string, string> = {}; let i = 0;
    while ((i = src.indexOf(sel + " {", i)) >= 0) {
      const a = src.indexOf("{", i), b = src.indexOf("}", a);
      for (const m of src.slice(a + 1, b).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
      i = b;
    }
    return out;
  };
  const theme = css("theme.css"), stage = css("stage.css");
  const light = { ...vars(theme, ":root"), ...vars(stage, ":root") };
  const dark = { ...light, ...vars(theme, ':root[data-theme="dark"]'), ...vars(stage, ':root[data-theme="dark"]') };
  const hex = (v: Record<string, string>, name: string): number[] => {
    let s = v[name]; for (let n = 0; s && s.startsWith("var(") && n < 8; n++) s = v[s.slice(4, s.indexOf(")")).split(",")[0].trim()];
    const m = /^#([0-9a-f]{6})$/i.exec(s ?? ""); if (!m) throw new Error(`${name} is not a colour: ${s}`);
    return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  };
  const ROLE_N: Record<string, number> = { ops: 4, job: 5 }; // the test's own roles -> colours (ROLES above)
  const token = (p: string) => { const [a, b, c] = p.split(":"); if (a === "role") return c === "line" ? `--c${ROLE_N[b]}` : `--c${ROLE_N[b]}-${c}`; return `--${a}${b ? "-" + b : ""}`; };
  const over = (fg: number[], a: number, bg: number[]) => fg.map((x, i) => x * a + bg[i] * (1 - a));
  const lum = (c: number[]) => { const l = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const T = `track: ops 0 lights on, 0b doors open | job J first sale, P stock check | ops 5 sweep up\nform: chips\n@step One: zero.\nat 0 lights on\n@step Two: J.\nat J first sale\n`;
  for (const [name, v] of [["light", light], ["dark", dark]] as const) test(name, () => {
    const c = compile(T); expect(c.errors).toEqual([]);
    const dimA = Number(v["--stg-dim"]), bg = hex(v, "--stg-bg");
    expect(dimA).toBeGreaterThan(0); expect(dimA).toBeLessThan(1);
    let seen = 0;
    for (const w of [1000, 340]) {
      const items = layoutStage(c.model, w).items;
      for (const b of items.filter((i): i is Extract<Item, { k: "box" }> => i.k === "box" && i.bar?.kind === "track")) for (const k of [1, 2]) {
        const boxDim = !!b.dim?.includes(k); if (!boxDim) continue;
        const fill = over(hex(v, token(b.fill)), dimA, bg);
        const words = items.filter((t): t is Extract<Item, { k: "text" }> => t.k === "text" && shownAt(t, k) && t.x > b.x && t.x < b.x + b.w && t.y > b.y && t.y < b.y + b.h);
        expect(words.length).toBeGreaterThan(0);
        for (const t of words) { const ink = over(hex(v, token(t.ink)), t.dim?.includes(k) ? dimA : 1, fill); expect([t.s, Math.round(ratio(ink, fill) * 100) / 100 >= 4.5]).toEqual([t.s, true]); seen++; }
      }
    }
    expect(seen).toBeGreaterThan(8);
  });
});
