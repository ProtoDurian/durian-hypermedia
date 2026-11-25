// Names on the 3D stage are placed like words on a page (SPEC.md 6.14). The placement runs in the browser (WebGL), so
// the numbers come from scripts/names3d-check.ts on a built example; these tests hold the rules in the source.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "../src/ui/anim3d.ts"), "utf8");
const count = (s: string) => src.split(s).length - 1;

describe("3D names are placed like words on a page", () => {
  test("a name is a fact: no rule hides one or fades it to a ghost; with no spot it keeps its own place, shown", () => {
    // the two name placers (a thing's or a layer's name, a container's name) end at their own place, at full strength
    expect(count("return [0, 0, 1];")).toBe(2);
    expect(src).not.toContain("GHOST");
    // an arrow's label the step does not use was hidden when it found no spot
    expect(src).not.toContain('p.el.style.opacity = "0"; continue;');
  });
  test("two names on one line keep 16 px apart, in every placer, before the old search is asked", () => {
    expect(src).toMatch(/const sameLine = \(a: R4, b: R4\) => \{[^\n]*< 16; \};/);
    // a container's name and a token's pill: first never on one line with another word, then as before
    expect(count("for (const strictPh of [true, false])")).toBe(2);
    // a thing's or a layer's name: a spot by its own box, not on one line with another, before the old search
    expect(src).toContain("if (byBox(r, ob) && onStage(r) && !fixed.some((f) => hits(r, f) || sameLine(r, f))) return [dx, dy, 1];");
  });
  test("every layer's name holds its own row until it is placed", () => {
    // the step's layer's name, placed first, took the row of a layer's name placed later: both on one line
    expect(src).toContain("const layerRes = new Map<HTMLElement");
    expect(src).toContain("{ const res = layerRes.get(p.el); if (res) fixed.splice(fixed.indexOf(res), 1); }");
  });
  test("the check that counts them is in the package", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
    expect(pkg.scripts.names3d).toBe("bun example/build.tsx && bun scripts/names3d-check.ts");
    expect(readFileSync(join(import.meta.dir, "../scripts/names3d-check.ts"), "utf8")).toContain("dh3corners");
  });
});
