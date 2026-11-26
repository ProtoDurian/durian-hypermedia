// render3: a format 12 graph scene on a page of many roles is raised (raise.ts). The page's roles are the Model's roles too;
// raise12 wrote a family for every one of them, the graph engine names at most 8, so on the showcase page (37 roles) every
// raised scene was refused and ranked instead (all 31 graph scenes of the page).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { compile } from "../../../src/engine/pipeline";
import { migrate } from "../../../src/engine/parse/migrate";
import { raise12 } from "../../../src/engine/layouts/graph/raise";
import { compileScene } from "../../../src/core/scene";
import { atSizes } from "../../../src/engine/render/font";

const FILE = "fixtures/format/51-animation-replicas-and-failover.dh.md";
/** the page with 30 more roles in its front matter (as one page of many samples has) */
const manyRoles = (page: string) => page.replace(/^---\n/, `---\nroles:\n${Array.from({ length: 30 }, (_, i) => `  r${i}: c${(i % 8) + 1}`).join("\n")}\n`);

describe("a format 12 graph scene on a page of many roles", () => {
  const text = readFileSync(join(ROOT, FILE), "utf8");
  const c = compile(fencesOf(join(ROOT, FILE), manyRoles(migrate(text)), "many")[0].src);
  test("is raised: the graph engine takes its words", () => {
    expect(Object.keys(c.model.roles).length).toBeGreaterThan(30);
    const src = raise12(c.model, c.states)!;
    expect(src).not.toBeNull();
    const wide = compileScene(src.head, [{ title: "Setup", raw: src.setup ?? "", line: src.base }, ...src.steps], src.base, src.info);
    expect(wide.errors).toEqual([]);
  });
  test("and laid out as its old form is", () => {
    const old = compile(fencesOf(join(ROOT, FILE), text, "old")[0].src);
    for (const w of [1178, 356]) atSizes(w < 480, () => expect([w, c.plan(w).w, c.plan(w).h]).toEqual([w, old.plan(w).w, old.plan(w).h]));
  });
});
