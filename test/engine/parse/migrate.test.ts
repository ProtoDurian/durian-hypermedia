// Lane parse: migrate, then parse12, gives the same story as the old block (every animation fence of the fixtures).
import { describe, expect, test } from "bun:test";
import { allFixtureFences, fencesOf } from "./fixtures";
import { lowerBlock, migrate } from "../../../src/engine/parse/migrate";
import { print12 } from "../../../src/engine/parse/print12";
import { parse12 } from "../../../src/engine/parse/parse12";
import { asStepLines, shape } from "./roundtrip";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const roundtrip = (src: Parameters<typeof lowerBlock>[0]) => {
  const m1 = lowerBlock(src);
  const text = print12(m1);
  const roles = { ...src.roles }; for (const [k, v] of Object.entries(m1.roles)) if (!(k in roles)) roles[k] = v.colour || 1;
  const fence = { ...src.fence }; if (m1.origin === "graph10" && !fence.look) fence.look = "classic";
  const m2 = parse12({ body: text, line0: 1, fence, roles, format12: true });
  return { m1, m2, text };
};
const fences = allFixtureFences().filter((f) => !f.id.startsWith("hostile/"));

describe("print12 then parse12 gives the same story, on every fixture fence", () => {
  for (const f of fences) test(f.id, () => {
    const { m1, m2, text } = roundtrip(f.src);
    expect(m2.problems.filter((p) => !p.warn).map((p) => `${p.line}: ${p.msg}\n${text.split("\n")[p.line - 1] ?? ""}`)).toEqual([]);
    expect(shape(asStepLines(m2), { beats: false })).toEqual(shape(m1, { beats: false })); // fmt12: lasting step lines // eng-migrate2: then between a relay's hops
  });
});

describe("migrate rewrites a page", () => {
  const page = readFileSync(join(import.meta.dir, "../../../fixtures/format/48-animation-binary-search-tree-insert.dh.md"), "utf8");
  test("front matter gets format: 12, the fence keeps its look, and the page reads again", () => {
    const out = migrate(page);
    expect(out).toContain("format: 12");
    expect(out).toContain("```animation look=classic");
    expect(out).toContain("layout: graph");
    const again = fencesOf("page.dh.md", out, "page");
    expect(again[0].src.format12).toBe(true);
    const m = parse12(again[0].src);
    expect(m.problems).toEqual([]);
    expect(Object.keys(m.things)).toContain("n6");
  });
  test("a page already in format 12 is returned as it is", () => { const out = migrate(page); expect(migrate(out)).toBe(out); });
  // fmt12: a family is a role of its block, with its words (the colour key keeps them; two blocks never clash on one page)
  test("graph families become roles of their block, with their words", () => {
    const p = readFileSync(join(import.meta.dir, "../../../fixtures/format/70-3d-a-database-in-three-regions.dh.md"), "utf8");
    const out = migrate(p);
    expect(out).not.toContain("roles:");
    expect(out).toMatch(/^layout: layers\nrole user c1: users\nrole db c2: database\nrole copy c3: copying\n/m);
    const m = parse12(fencesOf("p.dh.md", out, "p")[0].src);
    expect(m.problems).toEqual([]);
    expect(m.roles.db).toEqual({ colour: 2, label: "database" });
    expect(m.things.db1.role).toBe("db");
  });
});
