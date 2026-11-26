// Lane gate2: the layout-quality checks (core/check-layout.ts) run on the plan of real fixtures at 1000 and 390 px.
// Each finding is a warning with the step's line; a story that breaks no rule says nothing; the same finding in the
// next step is said once; the same finding at both widths is one message.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import { checkLayout, layoutFindings, MIN_PX } from "../../../src/engine/core/check-layout";
import { atSizes, phoneNow } from "../../../src/engine/render/font";
import { fencesOf, ROOT } from "../parse/fixtures";

const draw = (file: string, n = 0) => { const fe = fencesOf(join(ROOT, "fixtures", file + ".dh.md"))[n]; expect(fe).toBeDefined(); return compile(fe.src); };

/** a made-up format 12 story built to overlap: two tokens sit at the same thing in step 1, one leaves in step 2 */
const OVERLAP = `plain a [box]: Alpha
plain b [box]: Beta
plain k1 [token]: first token
plain k2 [token]: second token
a -> b
@step One: both tokens sit at a
show k1,k2
k1 at a
k2 at a
@step Two: one leaves
k1 at b
`;
const overlapStory = () => compile({ body: OVERLAP, line0: 1, fence: {}, roles: {}, format12: true });

describe("layout checks: what each finds", () => {
  test("crossing lines: git rebase draws two lines that cross, and the message names them and the step", () => {
    const c = draw("gt/01-git-rebase");
    const f = layoutFindings(c).filter((x) => x.kind === "cross");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].msg).toMatch(/two lines cross \(c -> d and e -> c2\)/);
    expect(f[0].line).toBe(c.model.steps[f[0].step - 1].src.line);
  });
  test("small words: a story with eight tiny boxes is drawn under 11 px at a width that shrinks it", () => {
    const c = draw("format/69-3d-the-seven-network-layers-and-a-scene-inside-the-scene"); // 0.7.0 made 52 readable on a phone
    const f = layoutFindings(c).filter((x) => x.kind === "small");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].msg).toContain(`under ${MIN_PX} px`);
  });
  test("still things that move: a thing no step moves is found elsewhere in the next step", () => {
    // render3: was format 47 (its pointer drifted: the core dropped `at` a cell); a queue whose jobs close up still moves things
    const c = draw("format/60-animation-by-a-new-author-a-queue-with-workers");
    const f = layoutFindings(c).filter((x) => x.kind === "moved");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].msg).toMatch(/does not move|do not move/);
  });
  test("overlaps: words over words are found, named by their words, with the step's line; a step that clears them says nothing", () => {
    const c = overlapStory();
    const f = layoutFindings(c).filter((x) => x.kind === "overlap");
    expect(f.length).toBe(2); // step 1, at 1000 and at 390; step 2 is clean
    expect(f.every((x) => x.step === 1 && x.line === 6)).toBe(true);
    expect(f[0].msg).toContain('"first token" over "second token"');
  });
});

describe("layout checks: how they report", () => {
  test("a clean story says nothing", () => {
    expect(layoutFindings(draw("format/48-animation-binary-search-tree-insert")).filter((x) => x.kind === "cross" || x.kind === "small")).toEqual([]);
  });
  test("doccheck problems: warnings only, each with a line, the width in the words, sorted by line", () => {
    const ps = checkLayout(draw("gt/01-git-rebase"));
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) { expect(p.warn).toBe(true); expect(p.line).toBeGreaterThan(0); expect(p.msg).toMatch(/^step \d+, at (1000|390|1000 and 390) px: /); }
    expect(ps.map((p) => p.line)).toEqual([...ps.map((p) => p.line)].sort((a, b) => a - b));
  });
  test("the same finding in the next step is said once", () => {
    const c = draw("gt/01-git-rebase");
    const f = layoutFindings(c, [1000]).filter((x) => x.kind === "cross");
    const steps = f.map((x) => x.step);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    // the crossing pair (c -> d and e -> c2) stays on screen for several steps, yet is named once
    expect(f.filter((x) => x.msg.includes("c -> d and e -> c2")).length).toBe(1);
  });
  test("the same finding at both widths is one message", () => {
    const c = overlapStory();
    const per = layoutFindings(c).filter((x) => x.kind === "overlap");
    expect(per.filter((x) => x.width === 1000).length).toBe(1);
    expect(per.filter((x) => x.width === 390).length).toBe(1);
    const merged = checkLayout(c).filter((p) => /overlap/.test(p.msg));
    expect(merged.length).toBe(1);
    expect(merged[0].msg.startsWith("step 1, at 1000 and 390 px:")).toBe(true);
  });
  test("it leaves the stage's font flag as it found it (phone on or off)", () => {
    const c = draw("format/69-3d-the-seven-network-layers-and-a-scene-inside-the-scene"); // 0.7.0 made 52 readable on a phone
    for (const was of [false, true]) {
      atSizes(was, () => { layoutFindings(c); expect(phoneNow()).toBe(was); });
    }
    expect(phoneNow()).toBe(false);
  });
});
