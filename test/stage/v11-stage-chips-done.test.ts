// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// in the chips track ('form: chips') the phases before the step's place are
// drawn DONE (the good tone: a green chip, its words readable), the step's own phase is lit, later ones are faded; no
// phase stays lit after its step, and each phase's words show once, in its own chip, at every step.
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import { type Item, FONT, PHONE_FONT, measure, textLayout } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const PHASES = ["1 Waiting", "2 Told", "3 Planned", "4 Moved", "5 Finished"];
const AT = [0, 1, 2, 2, 4, 2]; // the steps' places: 1, 2, 3, 3 (again), 5, then back to 3
const compile = () => compileStage(`track: ops ${PHASES.join(", ")}\nform: chips`, AT.map((a, i) => ({ title: `S${i + 1}: step ${i + 1}`, raw: `at ${PHASES[a]}`, line: 10 + 3 * i })), 1, {}, { ops: 1 });
const shownAt = (it: Item, k: number) => (it.on ? it.on.includes(k) : k >= (it.from ?? 1) && (!it.to || k <= it.to));
const chipsOf = (items: Item[]) => items.filter((i): i is Box => i.k === "box" && i.bar?.kind === "track" && !i.bar?.tone);
const doneOf = (items: Item[]) => items.filter((i): i is Box => i.k === "box" && i.bar?.kind === "track" && i.bar?.tone === "good");
const inside = (t: Text, b: Box) => t.x > b.x && t.x < b.x + b.w && t.y > b.y && t.y < b.y + b.h;

for (const w of [1000, 340]) for (const k of [1, 3, 6]) test(`step ${k} of 6 at ${w}: done before the place, lit at it, faded after`, () => {
  const c = compile(); expect(c.errors).toEqual([]);
  const items = layoutStage(c.model, w).items, cs = chipsOf(items), done = doneOf(items), place = AT[k - 1];
  expect(cs.length).toBe(5);
  cs.forEach((b, i) => {
    const layer = done.find((d) => d.bar?.id === b.bar?.id && shownAt(d, k)), words = items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && inside(t, b));
    if (i < place) { // done: a green chip over the phase's place, its words in the done tone, not faded, not lit
      if (!layer) throw new Error(`phase ${i + 1} is not drawn done at step ${k}`);
      expect([layer.x, layer.y, layer.w, layer.h]).toEqual([b.x, b.y, b.w, b.h]);
      expect([layer.fill, layer.stroke, !!layer.dim?.includes(k), !!layer.hot?.includes(k)]).toEqual(["good:soft", "good:line", false, false]);
      expect(b.hot?.includes(k) ?? false).toBe(false);
      for (const t of words) { expect(t.ink).toBe("good:ink"); expect(t.dim?.includes(k) ?? false).toBe(false); }
    } else if (i === place) { // lit, its own paint, no done layer
      expect(layer).toBeUndefined(); expect(b.hot).toContain(k); expect(b.dim?.includes(k) ?? false).toBe(false);
      for (const t of words) expect(t.ink.startsWith("good")).toBe(false);
    } else { // faded, no done layer, words in muted ink at full strength
      expect(layer).toBeUndefined(); expect(b.dim).toContain(k); expect(b.hot?.includes(k) ?? false).toBe(false);
      for (const t of words) expect(t.ink).toBe("muted");
    }
  });
  expect(cs.filter((b) => b.hot?.includes(k)).length).toBe(1); // only the step's own phase is lit
});

test("no phase stays lit after its step: the last phase, lit at step 5, is faded at step 6", () => {
  const items = layoutStage(compile().model, 1000).items, last = chipsOf(items)[4];
  expect(last.hot).toEqual([5]); expect(last.dim).toContain(6);
  expect(doneOf(items).some((d) => d.bar?.id === last.bar?.id && shownAt(d, 6))).toBe(false);
});

for (const w of [1000, 340]) test(`each phase's words show once, in its own chip, at every step (${w})`, () => {
  const items = layoutStage(compile().model, w).items, cs = chipsOf(items);
  const words = PHASES.flatMap((p) => p.split(" "));
  for (let k = 1; k <= 6; k++) {
    const ts = items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && PHASES.includes(t.s));
    expect(ts.map((t) => t.s).sort()).toEqual([...PHASES].sort()); // every phase's label once: none twice, none missing
    for (const t of ts) expect(inside(t, cs[PHASES.indexOf(t.s)])).toBe(true);
    expect(items.some((t) => t.k === "text" && shownAt(t, k) && words.includes(t.s))).toBe(false); // no lone number or name run
  }
});

// the review (bar point 4): the number and the name are ONE text run ("2 Announced", one style, as the original's
// label), the number on the first line, the name under it, each line centred inside its chip (1280, 390 and 360 stages)
for (const w of [1000, 340, 326]) test(`a chip's label is one run, number over name, every line inside its chip (${w})`, () => {
  const items = layoutStage(compile().model, w).items, cs = chipsOf(items), narrow = w < 600;
  cs.forEach((b, i) => {
    const ts = items.filter((t): t is Text => t.k === "text" && shownAt(t, 1) && inside(t, b));
    expect(ts.length).toBe(1); const t = ts[0];
    expect(t.s).toBe(PHASES[i]); expect(t.breaks).toEqual([PHASES[i].indexOf(" ") + 1]); expect(t.pitch).toBeGreaterThanOrEqual((narrow ? PHONE_FONT[t.f] : undefined) ?? FONT[t.f].size);
    const starts = [0, ...t.breaks!], L = textLayout(t.s, t.breaks!, t.x, t.pitch!, (a, z) => measure(t.s.slice(a, z), t.f));
    expect(Math.abs(t.x - (b.x + b.w / 2))).toBeLessThan(0.01); // centred on the chip
    expect(L.x).toBe(t.x); // drawn with text-anchor middle at the chip's centre
    starts.forEach((a, j) => {
      const e = j + 1 < starts.length ? starts[j + 1] : t.s.length, line = t.s.slice(a, e).trimEnd(), lw = measure(line, t.f);
      const x = L.lines[j].x, y = t.y + j * t.pitch!; expect(L.lines[j].w).toBeCloseTo(lw, 6);
      expect(j ? line : line).toBe(j ? PHASES[i].slice(PHASES[i].indexOf(" ") + 1) : PHASES[i].split(" ")[0]); // the number on top
      expect(Math.abs(x + lw / 2 - t.x)).toBeLessThan(0.01);                // each line centred
      expect(x).toBeGreaterThanOrEqual(b.x + 2); expect(x + lw).toBeLessThanOrEqual(b.x + b.w - 2); expect(y).toBeLessThan(b.y + b.h - 2); expect(y - 11).toBeGreaterThan(b.y);
      // the per-character offsets put line j's start where its centre meets the first line's centre (before the anchor shift)
      if (j) { const prev = starts[j - 1]; expect(L.dx[a] + measure(t.s.slice(prev, a), t.f) + (L.lines[j - 1].x - L.lines[j].x)).toBeCloseTo(0, 6); }
    });
  });
});

// the done words are readable: the done tone's ink on the done chip's fill, from the theme's own tokens, light and dark
test("a done chip's words read at 4.5:1 or more, light and dark", () => {
  const css = (f: string) => require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "../../src/ui", f), "utf8") as string;
  const vars = (src: string, sel: string) => { const out: Record<string, string> = {}; let i = 0; while ((i = src.indexOf(sel + " {", i)) >= 0) { const a = src.indexOf("{", i), b = src.indexOf("}", a); for (const m of src.slice(a + 1, b).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim(); i = b; } return out; };
  const theme = css("theme.css"), light = vars(theme, ":root"), dark = { ...light, ...vars(theme, ':root[data-theme="dark"]') };
  const hex = (v: Record<string, string>, name: string) => { const m = /^#([0-9a-f]{6})$/i.exec(v[name] ?? ""); if (!m) throw new Error(`${name} is not a colour`); return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)); };
  const lum = (c: number[]) => { const l = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const items = layoutStage(compile().model, 1000).items, layer = doneOf(items)[0];
  const ink = items.find((t): t is Text => t.k === "text" && shownAt(t, 3) && inside(t, layer))!.ink;
  for (const v of [light, dark]) expect(ratio(hex(v, `--${ink.replace(":", "-")}`), hex(v, `--${layer.fill.replace(":", "-")}`))).toBeGreaterThanOrEqual(4.5);
});

// the review: before the first place (steps with no "at" yet, or a track never placed) no phase is reached:
// every phase is future, drawn as the original's pills: a plain surface chip with a dashed grey border, its words in ink;
// none is filled in its role, none is lit, none is done.
const FUT = ["", "", `at ${PHASES[2]}`, `at ${PHASES[4]}`];
const compileF = (raws = FUT) => compileStage(`track: ops ${PHASES.join(", ")}\nform: chips`, raws.map((raw, i) => ({ title: `S${i + 1}: step ${i + 1}`, raw, line: 10 + 3 * i })), 1, {}, { ops: 1 });
const futureOf = (items: Item[]) => items.filter((i): i is Box => i.k === "box" && i.bar?.kind === "track" && i.bar?.tone === "future");
for (const w of [1000, 340]) test(`steps before the first place draw every phase future (${w})`, () => {
  const c = compileF(); expect(c.errors).toEqual([]);
  const items = layoutStage(c.model, w).items, cs = chipsOf(items), fut = futureOf(items);
  for (const k of [1, 2]) cs.forEach((b, i) => {
    const layer = fut.find((f) => f.bar?.id === b.bar?.id && shownAt(f, k));
    if (!layer) throw new Error(`phase ${i + 1} is not drawn future at step ${k}`);
    expect([layer.x, layer.y, layer.w, layer.h]).toEqual([b.x, b.y, b.w, b.h]);
    expect([layer.fill, layer.stroke, !!layer.dash, !!layer.hot?.includes(k), !!layer.dim?.includes(k)]).toEqual(["surface", "line-2", true, false, false]);
    expect(shownAt(b, k)).toBe(false); // the role-filled chip is not under it (its solid border would show through the dashes)
    expect(doneOf(items).some((d) => d.bar?.id === b.bar?.id && shownAt(d, k))).toBe(false);
    const words = items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && inside(t, b));
    expect(words.length).toBeGreaterThan(0); for (const t of words) { expect(t.ink).toBe("ink"); expect(t.hot?.includes(k) ?? false).toBe(false); expect(t.dim?.includes(k) ?? false).toBe(false); }
  });
  // from the first place on: no future layer; step 3 = done 1-2, lit 3, faded 4-5; the chip itself shows again, in its place
  for (const k of [3, 4]) { expect(fut.some((f) => shownAt(f, k))).toBe(false); for (const b of cs) expect(shownAt(b, k)).toBe(true); }
  expect(cs[2].hot).toEqual([3]); expect(doneOf(items).filter((d) => shownAt(d, 3)).length).toBe(2);
  // each word once at every step, future steps too
  const words = PHASES.flatMap((p) => p.split(" "));
  for (let k = 1; k <= 4; k++) { expect(items.filter((t): t is Text => t.k === "text" && shownAt(t, k) && PHASES.includes(t.s)).map((t) => t.s).sort()).toEqual([...PHASES].sort()); expect(items.some((t) => t.k === "text" && shownAt(t, k) && words.includes(t.s))).toBe(false); }
});
test("a chips track that is never placed is future on every step; a step without a place after one keeps the old plain look", () => {
  const never = layoutStage(compileF(["", ""]).model, 1000).items;
  expect(futureOf(never).filter((f) => shownAt(f, 1) && shownAt(f, 2)).length).toBe(5);
  const later = layoutStage(compileF([`at ${PHASES[0]}`, ""]).model, 1000).items;
  expect(futureOf(later).length).toBe(0);
});

// the review (23 Nov): "form: chips | arrows" draws a small arrow between neighbouring chips of one row, as the strip
// does; never across a wrap (desktop and phone alike). "form: chips" alone keeps no arrows.
const compileA = (form: string) => compileStage(`track: ops ${PHASES.join(", ")}\nform: ${form}`, AT.map((a, i) => ({ title: `S${i + 1}: step ${i + 1}`, raw: `at ${PHASES[a]}`, line: 10 + 3 * i })), 1, {}, { ops: 1 });
const tris = (items: Item[]) => items.filter((i): i is Extract<Item, { k: "tri" }> => i.k === "tri");
for (const w of [1000, 340]) test(`form: chips | arrows: one arrow between row neighbours, none across a wrap (${w})`, () => {
  const c = compileA("chips | arrows"); expect(c.errors).toEqual([]);
  const items = layoutStage(c.model, w).items, cs = chipsOf(items), ts = tris(items);
  const rows = new Set(cs.map((b) => b.y)).size; if (w === 340) expect(rows).toBeGreaterThan(1);
  expect(ts.length).toBe(cs.length - rows);
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1], b = cs[i], t = ts.filter((x) => x.y > b.y && x.y < b.y + b.h && x.x - 1 >= a.x + a.w - 0.5 && x.x + 7 <= b.x + 0.5);
    expect(t.length).toBe(a.y === b.y ? 1 : 0); // in the gap between them, inside the chips' height; none across the wrap
  }
  for (const t of ts) expect(t.from === undefined && t.to === undefined && t.on === undefined).toBe(true); // on every step
  for (let i = 1; i < cs.length; i++) if (cs[i].y === cs[i - 1].y) expect(cs[i].x).toBeGreaterThanOrEqual(cs[i - 1].x + cs[i - 1].w + 12); // room for the arrow
});
test("form: chips alone has no arrows; any other mark after chips is refused with the two forms", () => {
  expect(tris(layoutStage(compileA("chips").model, 1000).items).length).toBe(0);
  const bad = compileA("chips | lines"); expect(bad.errors.length).toBeGreaterThan(0);
  expect(bad.errors[0].msg).toContain(`"form: chips | arrows"`); expect(bad.errors[0].line).toBe(2);
});
