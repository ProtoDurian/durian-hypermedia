// Faint states (0.7.0-rc.3; both rc.2 reviews, colour item): a state shape that is empty, remaining, gone, waiting or idle
// (a counted unit of no group, a bin's empty slot and its waiting chips, an idle stretch on a time row, a soft dot, a
// sheet's empty cell) drew
// its edge in the page hairline (--line: 1.3:1 in dark, 1.2:1 in light), so in dark it disappeared (samples 07, 14, 32,
// 34). Those shapes now draw their edge in --scn-faint-edge: 3:1 on the stage, the page and every family fill, in both
// themes. Frames, cells and guides keep the hairline (they carry no state).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, parseHex } from "./helpers/colour-maths";
import { jsonOf, parseDoc } from "../../src/core/dh-lib";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument, BudgetError } from "../../src/core/stage-budget";
import { paint } from "../../src/ui/stage";

const ROOT = join(import.meta.dir, "../..");
const css = readFileSync(join(ROOT, "src/ui/theme.css"), "utf8");
const block = (start: string) => { const i = css.indexOf(start); let d = 0; const j = css.indexOf("{", i); for (let k = j; k < css.length; k++) { if (css[k] === "{") d++; else if (css[k] === "}" && --d === 0) return css.slice(j + 1, k); } return ""; };
const decls = (b: string) => Object.fromEntries([...b.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map((m) => [m[1], m[2].trim()]));
const LIGHT = { ...decls(block(":root {")), ...decls(css.slice(css.lastIndexOf("/* the stage's own edges"))) };
const THEMES = { light: LIGHT, "dark (media)": { ...LIGHT, ...decls(block("@media (prefers-color-scheme: dark)")) }, dark: { ...LIGHT, ...decls(block(':root[data-theme="dark"] {')) } };
const res = (v: string, vars: Record<string, string>, d = 0): string => { const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v.trim()); return !m || d > 20 ? v.trim() : vars[m[1]] !== undefined ? res(vars[m[1]], vars, d + 1) : m[2] !== undefined ? res(m[2], vars, d + 1) : `unset ${m[1]}`; };

// every state shape of every fixture stage, laid out wide and on a phone
const shapes: { f: string; item: any }[] = [];
const dir = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? dir(join(d, e.name)) : e.name.endsWith(".dh.md") ? [join(d, e.name)] : []));
for (const f of dir(join(ROOT, "fixtures"))) {
  beginDocument(); let stages: any[];
  try { stages = (jsonOf(parseDoc(f, readFileSync(f, "utf8"))).blocks ?? []).filter((b: any) => b.type === "animation" && b.stage).map((b: any) => b.stage); } catch { continue; }
  for (const s of stages) for (const w of [1000, 360]) {
    let items: any[];
    try { beginDocument(); const c = compileStage(s.src.head, s.src.steps, s.src.base, s.src.info, s.roles); if (c.errors.length) continue; items = layoutStage(c.model, w).items as any[]; }
    catch (e) { if (e instanceof BudgetError) continue; throw e; } // the work-limit fixtures stop on purpose
    for (const it of items) {
      const cls = String(it.cls ?? "");
      // the empty look: a state shape with no colour of its own (a plain token chip, filled "surface" and carrying words, is not one)
      const state = (/\bstg-(unit|seg|time-dot|chip|slot)\b/.test(cls) && (it.fill === "surface-2" || it.fill === "none")) || (cls === "stg-cell" && it.dash && it.fill === "none");
      if (it.k === "box" && state) shapes.push({ f: f.slice(ROOT.length + 1), item: it });
    }
  }
}

describe("faint states: an edge everyone can see", () => {
  test("the samples the reviews named have state shapes to check", () => {
    for (const n of ["07-", "14-", "32-", "34-"]) expect(shapes.some((s) => s.f.includes(`/${n}`))).toBe(true);
  });
  test("no state shape draws its edge in the page hairline", () => {
    expect([...new Set(shapes.filter((s) => s.item.stroke === "line" || s.item.stroke === "line-2").map((s) => `${s.f}: ${s.item.cls}`))]).toEqual([]);
  });
  test("the faint states of 07, 14, 32 and 34 draw in --scn-faint-edge", () => {
    for (const n of ["07-", "14-", "32-", "34-"]) expect(shapes.some((s) => s.f.includes(`/${n}`) && paint(s.item.stroke, {}) === "var(--scn-faint-edge)")).toBe(true);
    expect(shapes.some((s) => s.item.cls === "stg-slot")).toBe(true);
  });
  test("a sheet's empty cell (\"_\", filled on a later step) draws in --scn-faint-edge", () => {
    beginDocument();
    const c = compileStage('sheet: s\nhub g: G\n  plain r "R": 1 2 _\n=> desk out: O', [{ title: "One: x", raw: "", line: 6 }, { title: "Two: y", raw: "fill r 3: 4", line: 8 }], 1, {}, { hub: 1, plain: 0, desk: 2 });
    expect(c.errors).toEqual([]);
    const empty = (layoutStage(c.model, 1000).items as any[]).filter((i) => i.k === "box" && i.cls === "stg-cell" && i.dash && i.fill === "none");
    expect(empty.length).toBe(1);
    expect(paint(empty[0].stroke, {})).toBe("var(--scn-faint-edge)");
  });
  for (const [name, vars] of Object.entries(THEMES)) test(`${name}: --scn-faint-edge is 3:1 on the stage, the page and every family fill`, () => {
    const edge = res("var(--scn-faint-edge)", vars); expect(edge).toMatch(/^#[0-9A-F]{6}$/i);
    const backs = ["--surface", "--surface-2", "--bg", ...[0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((k) => [`--c${k}-soft`, `--c${k}-plane`])];
    const under = backs.map((b) => [b, res(`var(${b})`, vars)] as const).filter(([, h]) => /^#[0-9A-F]{6}$/i.test(h))
      .map(([b, h]) => [b, contrast(parseHex(edge), parseHex(h))] as const).filter(([, r]) => r < 3).map(([b, r]) => `${b} ${r.toFixed(2)}`);
    expect(under).toEqual([]);
  });
});
