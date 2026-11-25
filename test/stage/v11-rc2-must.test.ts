// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// rc.2 fresh review, MUST-FIX 4, 5 and 8: general fixes in the stage.
// 4. A phase track: only the current phase has the thick role border and full ink; the last phase ("publish" in the
// public samples 02, 13 and 24) was drawn thick and never faded, so two phases read as "now".
// 5. Phone: the carry chip ("one package", 02 and 24) stays inside the stage; a token mark's remark ("dropped: optional",
// 17) that does not fit after its chip ends on the card's inner edge, aligned there, so the browser's own width decides.
// 8. Column dots: an unlit dot looks the same in both themes, the role's own colour, 3:1 on the stage (21 light: cream on
// pale grey); a lit column's dots are stronger in both.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import { paint } from "../../src/ui/stage";
import type { Item } from "../../src/core/stage-core";

beforeEach(() => beginDocument());
type Box = Extract<Item, { k: "box" }>; type Text = Extract<Item, { k: "text" }>;
const ROLES = { job: 1, cache: 2, store: 5, plain: 0 };
const TRACK = "track: job fetch, resolve | cache lookup | job build, test | store publish\ncarry: one package\nwhere: a monorepo of 40 packages · the main branch";
const trackSteps = [["Resolve: listed.", "at resolve"], ["Cache: hashed.", "at lookup"], ["Publish: renamed.", "at publish"]].map(([t, r], i) => ({ title: t, raw: r, line: 10 + 3 * i }));

describe("MUST 4: only the current phase looks current", () => {
  for (const w of [1000, 358]) test(`the last phase is thick and in full ink only in its own step (${w})`, () => {
    const c = compileStage(TRACK, trackSteps, 1, {}, ROLES); expect(c.errors).toEqual([]);
    const items = layoutStage(c.model, w).items as any[];
    const phases = items.filter((i) => i.k === "box" && i.cls === "stg-phase") as Box[];
    expect(phases.length).toBe(6);
    const last = phases.at(-1) as any;
    expect(last.thick ?? false).toBe(false); // no phase is thick on every step
    expect(last.hot).toEqual([3]);
    expect(last.dim).toEqual([1, 2]); // faded like every phase that is not the step's place
    const lastWords = items.find((i) => i.k === "text" && i.s === "publish") as any;
    expect(lastWords.dim).toEqual([1, 2]);
    for (const p of phases.slice(0, -1) as any[]) expect(p.thick ?? false).toBe(false);
  });
});

describe("MUST 5: nothing past its frame on a phone", () => {
  for (const w of [358, 334, 300]) test(`the carry chip stays inside the stage (${w})`, () => {
    const c = compileStage(TRACK, trackSteps, 1, {}, ROLES);
    const p = layoutStage(c.model, w), chips = (p.items as Box[]).filter((i) => i.k === "box" && i.cls === "stg-chip");
    expect(chips.length).toBeGreaterThan(0);
    for (const b of chips) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(p.w); }
  });
  const RECIPE = "title: Reading a recipe line | words become a plan\n## _\nplain q: the line\n  tokens: mix ( flour, sugar, salt ) then bake ( 180C, 25min )\nstore r: the plan\n  keys: Action; Inputs; Then; Heat; Time";
  const recipeSteps = [["Read: x", ""], ["Mix: x", "mark q mix, flour, sugar, salt: accent"], ["Drop: x", "mark q salt: bad dropped: optional"], ["Bake: x", "mark q bake, 180C, 25min: accent"]].map(([t, r], i) => ({ title: t, raw: r, line: 10 + 3 * i }));
  for (const w of [1000, 358, 334]) test(`a remark that does not fit after its chip ends on the card's inner edge (${w})`, () => {
    const c = compileStage(RECIPE, recipeSteps, 1, {}, ROLES); expect(c.errors).toEqual([]);
    const p = layoutStage(c.model, w), items = p.items as any[];
    const card = items.find((i) => i.k === "box" && i.bar?.kind === "card" && i.bar?.label === "the line") as Box;
    const rm = items.find((i) => i.k === "text" && i.s === "dropped: optional") as Text;
    const salt = items.find((i) => i.k === "box" && i.cls === "stg-chip" && i.bar?.label === "salt") as Box;
    if (w === 1000) { expect(rm.anchor ?? "start").toBe("start"); expect(rm.x).toBe(salt.x); } // room after the chip: under it
    else { expect(rm.anchor).toBe("end"); expect(rm.x).toBeLessThan(card.x + card.w - 4); expect(rm.x).toBeGreaterThan(salt.x); }
  });
});

describe("MUST 8: unlit dots look the same in both themes, 3:1", () => {
  const css = readFileSync(join(import.meta.dir, "../../src/ui/theme.css"), "utf8");
  const block = (start: string) => { const i = css.indexOf(start); let d = 0; const j = css.indexOf("{", i); for (let k = j; k < css.length; k++) { if (css[k] === "{") d++; else if (css[k] === "}" && --d === 0) return css.slice(j + 1, k); } return ""; };
  const decls = (b: string) => Object.fromEntries([...b.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const LIGHT = decls(block(":root {")), DARK = { ...LIGHT, ...decls(block(':root[data-theme="dark"]')) }, DARKM = { ...LIGHT, ...decls(block("@media (prefers-color-scheme: dark)")) };
  const resolve = (v: string, vars: Record<string, string>, d = 0): string => { const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v.trim()); if (!m || d > 20) return v.trim(); return vars[m[1]] !== undefined ? resolve(vars[m[1]], vars, d + 1) : m[2] !== undefined ? resolve(m[2], vars, d + 1) : `unset ${m[1]}`; };
  const lum = (h: string) => { const n = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]; };
  const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  test("a plain dot is the role's own colour in light and in both dark blocks; a lit column's dot is another, stronger paint", () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const unlit = paint("role:r:dot", { r: k });
      for (const vars of [LIGHT, DARK, DARKM]) {
        expect([resolve(`var(--c${k})`, vars), resolve(`var(--c${k}-ink)`, vars)]).toContain(resolve(unlit, vars)); // the role's colour, or its ink where the colour is under 3:1 (the next test)
        expect(resolve(paint("role:r:dot-new", { r: k }), vars)).not.toBe(resolve(unlit, vars));
      }
    }
  });
  test("every unlit dot is 3:1 on the stage and the page in both themes", () => {
    for (const [name, vars] of [["light", LIGHT], ["dark", DARK], ["dark (media)", DARKM]] as const)
      for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) for (const back of ["--surface", "--surface-2", "--bg"]) {
        const dot = resolve(paint("role:r:dot", { r: k }), vars), bg = resolve(`var(${back})`, vars);
        if (ratio(dot, bg) < 3) throw new Error(`${name}: c${k} dot ${dot} on ${back} ${bg} is ${ratio(dot, bg).toFixed(2)}:1`);
      }
  });
});
