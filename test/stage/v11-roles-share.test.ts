// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
// Pass 11 (a review's long page): a page may give one colour to several roles (a long page
// has more roles than the 9 colours); ONE stage may not draw two roles of one colour, so no scene is ambiguous. Before, the
// page refused every role after the first of a colour, so a later scene's roles (book, note, bad, catalogue) were unknown and drew
// in --stg-unknown (slate panels with dark words in light, pale with white words in dark).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { paint } from "../../src/ui/stage";
import { compileStage, layoutStage } from "../../src/core/stage";
import { pageRoles, rolesUsed, sameColourRoles } from "../../src/core/stage-roles";
import { jsonOf, parseDoc } from "../../src/core/dh-lib";
import { checkDoc } from "../../src/core/doccheck";
import { beginDocument } from "../../src/core/stage-budget";

const ROLES = "roles:\n  shelf: c0\n  reader: c1\n  desk: c2\n  note: c0\n  book: c1\n  catalogue: c2\n  bad: c3\n  page: c8\n";
const page = (body: string, fm = ROLES) => parseDoc("t.dh.md", `---\ntitle: T\n${fm}---\n\n# T\n\n${body}\n`);
// the first scene of a page: shelves, readers and desks
const SCENE_A = "```animation\ntitle: The library\n## Shelves\nshelf p1: shelf one | holds atlases\n## Readers\nreader e0: reader 0 | visits weekly\n## Desks\ndesk m0: desk 0 | adds loans\n@step One: a book is lent.\np1 -> e0: lend\n@step Two: the desk adds.\ne0 -> m0: loan\n```";
// a later scene: a shopping list, a pantry, a recipe card and a pot, with a part left out
const SCENE_B = "```animation\ntitle: a soup for six\n## the pantry\nnote r: the shopping list | leeks and salt\nbook a: Leeks | two bunches\nbook c: Stock | one litre\n## the stove\ncatalogue p: the pot | simmers for twenty minutes\npage v: the recipe card | step 4 of 6\nbad b: left out | a burnt onion\n@step Shop: the list is ticked.\nr -> a: buy\n@step Cook: the pot fills.\nc -> p: pour\nv -> p: stir\n```";

const css = readFileSync(join(import.meta.dir, "../../src/ui/theme.css"), "utf8");
const block = (start: string) => { const i = css.indexOf(start); let d = 0; const j = css.indexOf("{", i); for (let k = j; k < css.length; k++) { if (css[k] === "{") d++; else if (css[k] === "}" && --d === 0) return css.slice(j + 1, k); } return ""; };
const decls = (b: string) => Object.fromEntries([...b.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const LIGHT = decls(block(":root {")), DARK = { ...LIGHT, ...decls(block(':root[data-theme="dark"]')) };
/** a CSS paint to a hex colour in one theme: var(--x) and var(--x, fallback), nested */
function resolve(v: string, vars: Record<string, string>, depth = 0): string {
  v = v.trim(); if (depth > 20) throw new Error(`loop at ${v}`);
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
  if (!m) return v;
  if (vars[m[1]] !== undefined) return resolve(vars[m[1]], vars, depth + 1);
  if (m[2] !== undefined) return resolve(m[2], vars, depth + 1);
  throw new Error(`${m[1]} is not set`);
}
const lum = (h: string) => { const n = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]; };
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe("roles may share a colour across a page", () => {
  test("pageRoles keeps every role of a shared colour, with no error; more than 9 names is fine", () => {
    const r = pageRoles({ roles: { shelf: "c0", reader: "c1", note: "c0", book: "c1", lend: "c0", a: "c3", b: "c4", bad: "c3", good: "c4", spare: "c4", store: "c5" } });
    expect(r.errors).toEqual([]);
    expect(r.roles).toEqual({ shelf: 0, reader: 1, note: 0, book: 1, lend: 0, a: 3, b: 4, bad: 3, good: 4, spare: 4, store: 5 });
  });
  test("a role with no colour still takes the lowest colour no role asked for", () => {
    expect(pageRoles({ roles: { a: "c1", b: "c1", c: {} } }).roles).toEqual({ a: 1, b: 1, c: 2 });
  });
  test("one stage drawing two roles of one colour is refused, naming both", () => {
    beginDocument();
    const roles = { reader: 1, book: 1, shelf: 0 };
    const c = compileStage("## A\nreader e0: reader 0\nbook t: Atlas\nshelf p: shelf", [{ title: "One: x", raw: "e0 -> t: hi", line: 6 }, { title: "Two: y", raw: "t -> p: back", line: 8 }], 1, {}, roles);
    expect(c.errors.map((e) => e.msg).join("\n")).toMatch(/draws "book" and "reader" in one colour \(c1\)/);
    expect(sameColourRoles(rolesUsed(c.model, roles), roles)).toEqual([[1, ["book", "reader"]]]);
  });
  test("two scenes of one page, each using its own roles of the shared colours: no errors; doccheck passes them", () => {
    const d = page(SCENE_A + "\n\n" + SCENE_B);
    const issues: any[] = []; checkDoc(d, undefined, issues);
    expect(issues.filter((i) => i.level === "error").map((i) => i.msg)).toEqual([]);
  });
  test("a role a scene uses that the page does not declare is a doccheck error (never a silent slate card)", () => {
    const d = page(SCENE_B, ROLES.replace("  page: c8\n", ""));
    const issues: any[] = []; checkDoc(d, undefined, issues);
    expect(issues.some((i) => i.level === "error" && /"page" is not a role of this page/.test(i.msg))).toBe(true);
  });
});

describe("two parts on one page, dark: every role resolves and each part's panel words keep their contrast", () => {
  beginDocument(); // its own page budget: this runs when the file loads, after whatever the file before it spent
  const d = page(SCENE_A + "\n\nSome words between the scenes.\n\n" + SCENE_B);
  const stages = jsonOf(d).blocks.filter((b: any) => b.type === "animation").map((b: any) => b.stage);
  test("both parts are stages that carry the whole page's roles", () => {
    expect(stages.length).toBe(2);
    for (const s of stages) expect(s.roles).toEqual({ shelf: 0, reader: 1, desk: 2, note: 0, book: 1, catalogue: 2, bad: 3, page: 8 });
  });
  for (const [k, theme] of [["light", LIGHT], ["dark", DARK]] as const)
    test(`${k}: no paint is --stg-unknown, and every word is 4.5:1 on the box it sits in (both parts)`, () => {
      beginDocument();
      let texts = 0;
      for (const [n, s] of stages.entries()) {
        const c = compileStage(s.src.head, s.src.steps, s.src.base, s.src.info, s.roles);
        expect(c.errors).toEqual([]);
        const items = layoutStage(c.model, 1000).items as any[];
        const boxes = items.filter((i) => i.k === "box" && i.w > 0 && i.h > 0 && paint(i.fill, s.roles) !== "none");
        for (const it of items) {
          for (const p of [it.fill, it.stroke, it.ink].filter(Boolean)) expect(paint(p, s.roles)).not.toContain("--stg-unknown");
          if (it.k !== "text" || !it.s?.trim() || it.ink === "muted") continue;
          const at = boxes.filter((b) => it.x >= b.x && it.x <= b.x + b.w && it.y >= b.y && it.y <= b.y + b.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
          const back = at ? resolve(paint(at.fill, s.roles), theme) : resolve("var(--surface)", theme);
          const ink = resolve(paint(it.ink, s.roles), theme);
          const r = ratio(ink, back);
          if (r < 4.5) throw new Error(`part ${n + 1}, "${it.s}": ${ink} on ${back} is ${r.toFixed(2)}:1`);
          texts++;
        }
      }
      expect(texts).toBeGreaterThan(10);
    });
});
