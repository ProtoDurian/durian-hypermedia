// 0.7.0-rc.3 review (a phone: a lit [bad] cell's X stood over its words and read 'it died'; on the wide
// stage the same cell was its thick border alone): a [bad] cell draws its X only BESIDE its words (30 px or more of room) or
// in a cell without words; a worded [bad] cell is its thick border alone in every form. Public fixtures.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStage, layoutStage, STAGE_WORK, STAGE_MEMORY } from "../../src/core/stage";
import { beginDocument, newBudget } from "../../src/core/stage-budget";
import { measure, type Item } from "../../src/core/stage-core";

const FIX: Record<string, string> = { "Test: cells exchange a copy": "10-test-cells-exchange-a-copy.dh.md", "Test: roomy rows across a phone": "31-test-roomy-rows-across-a-phone.dh.md" };
const file = (title: string) => readFileSync(join(import.meta.dir, "../../fixtures/stage", FIX[title]), "utf8");
const rolesOf = (src: string) => { const fm = src.slice(0, src.indexOf("\n---\n", 4)), r: Record<string, number> = {}; for (const m of fm.slice(Math.max(0, fm.indexOf("\nroles:\n"))).matchAll(/^  ([a-z][\w-]*): (?:c(\d)|\{[^}]*colour: c(\d)[^}]*\})/gm)) r[m[1]] = +(m[2] ?? m[3]); return r; };
let roles: Record<string, number> = {};
const section = (title: string) => { const src = file(title); roles = rolesOf(src); return src.match(/^```animation[^\n]*\n([\s\S]*?)^```$/m)![1]; };
const lay = (src: string, w: number) => {
  const parts = src.split(/^@step /m), steps = parts.slice(1).map((s, i) => { const nl = s.indexOf("\n"); return { title: s.slice(0, nl), raw: s.slice(nl + 1), line: i + 1 }; });
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); const c = compileStage(parts[0], steps, 1, {}, roles); expect(c.errors).toEqual([]);
  beginDocument(newBudget(STAGE_WORK, STAGE_MEMORY)); return layoutStage(c.model, w).items;
};
type Path = Extract<Item, { k: "path" }>; type Text = Extract<Item, { k: "text" }>; type Box = Extract<Item, { k: "box" }>;
const xs = (its: Item[]) => its.filter((i): i is Path => i.k === "path" && i.ink === "bad:line" && (i as { curve?: string }).curve === "round" && i.pts.length === 2 && i.pts[0][0] !== i.pts[1][0] && i.pts[0][1] !== i.pts[1][1]);
// a stroke's cell: the smallest time cell holding its middle; the X may stand only beside that cell's words, never above or on them
const besideWords = (its: Item[], x: Path) => {
  const cx = (x.pts[0][0] + x.pts[1][0]) / 2, cy = (x.pts[0][1] + x.pts[1][1]) / 2;
  const cell = its.filter((b): b is Box => b.k === "box" && String(b.cls).includes("stg-time-cell") && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  const words = its.filter((t): t is Text => t.k === "text" && !!cell && t.x >= cell.x && t.x <= cell.x + cell.w && t.y >= cell.y && t.y <= cell.y + cell.h + 4);
  const xl = Math.min(x.pts[0][0], x.pts[1][0]);
  return words.every((t) => { const tw = measure(t.s, t.f), r = t.anchor === "middle" ? t.x + tw / 2 : t.x + tw; return xl >= r + 8; });
};

for (const title of ["Test: cells exchange a copy", "Test: roomy rows across a phone"]) for (const w of [1178, 766, 356]) test(`${title} at ${w}: a worded [bad] cell's X only beside its words`, () => {
  const its = lay(section(title), w);
  for (const x of xs(its)) expect(besideWords(its, x)).toBe(true);
  if (w === 356) expect(xs(its)).toEqual([]); // a phone cell has no room beside its words: border alone
});
