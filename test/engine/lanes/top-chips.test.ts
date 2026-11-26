// eng-lanes2: the lanes' chips of words (a card's state chip, a line's words, a say) are `eng-top`: the pipeline draws
// them after the lines, so no line runs through their words (the old stage drew them last too).
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { compile } from "../../../src/engine/pipeline";
import type { Prim } from "../../../src/engine/types";
import { fencesOf, ROOT } from "../parse/fixtures";

const top = (p: Prim) => /(^|\s)eng-top(\s|$)/.test(p.cls ?? "");
const cases: [string, number, string][] = [["03-oauth-login", 390, "has token"], ["08-restaurant-order", 390, "3 of 3 plates"], ["03-oauth-login", 1280, "has token"], ["08-restaurant-order", 1280, "3 of 3 plates"]];

describe("lanes: chips of words are drawn over the lines", () => {
  for (const [name, w, chip] of cases) test(`gt ${name} at ${w}: "${chip}" and every chip come after every line`, () => {
    const [fe] = fencesOf(join(ROOT, "fixtures/gt", name + ".dh.md")), c = compile(fe.src), p = c.plan(w);
    let seen = false;
    for (let k = 0; k < c.states.length; k++) {
      const f = p.frame(k), lastLine = f.map((q) => q.key.startsWith("rel:")).lastIndexOf(true), firstTop = f.findIndex(top);
      if (lastLine >= 0 && firstTop >= 0) expect(firstTop).toBeGreaterThan(lastLine);
      // every prim after the first eng-top one is eng-top (they keep their own order, at the end)
      if (firstTop >= 0) expect(f.slice(firstTop).every(top)).toBe(true);
      const hit = f.find((q) => q.k === "chip" && q.words === chip);
      if (hit) { seen = true; expect(top(hit)).toBe(true); }
    }
    expect(seen).toBe(true);
  });
  test("a line's words in the lanes' decor are eng-top, box and words", () => {
    const [fe] = fencesOf(join(ROOT, "fixtures/stage/01-animation-a-composed-stage.dh.md")), c = compile(fe.src);
    const f = c.plan(1000).frame(1), get = f.filter((q) => q.k === "text" && q.lines.includes("GET"));
    expect(get.length).toBeGreaterThan(0);
    for (const g of get) expect(top(g)).toBe(true);
  });
});

describe("lanes: every line of a say chip is over the cards", () => {
  test("gt 03 at 1280 step 2: 'password checked,' and 'consent given' are both eng-top", () => {
    const [fe] = fencesOf(join(ROOT, "fixtures/gt/03-oauth-login.dh.md")), f = compile(fe.src).plan(1280).frame(2);
    for (const w of ["password checked,", "consent given"]) {
      const q = f.find((p) => p.k === "text" && p.lines.join(" ") === w);
      expect(q ? top(q) : `missing ${w}`).toBe(true);
    }
  });
});

describe("a lit frame or chip has the stage's thick lit border (stg-w-hot), only in the step it is lit", () => {
  const hot = (p: Prim) => /(^|\s)stg-w-hot(\s|$)/.test(p.cls ?? "");
  test("stage 20 (sheet family): the dashed crate frame at step 3 is stg-w-hot, at step 2 not", () => {
    const [fe] = fencesOf(join(ROOT, "fixtures/stage/20-animation-boxes-inside-boxes.dh.md")), p = compile(fe.src).plan(1280);
    const frame = (k: number) => p.frame(k).find((q) => q.k === "rect" && q.rect.w > 1000 && /stg-dash/.test(q.cls ?? ""));
    expect(frame(3) && hot(frame(3)!)).toBe(true);
    expect(frame(2) ? hot(frame(2)!) : false).toBe(false);
  });
  test("example-layers 9 (lanes decor): the lit dashed frame at step 1 is stg-w-hot", () => {
    const fe = fencesOf(join(ROOT, "fixtures/stage/example-layers.dh.md"))[8], f = compile(fe.src).plan(1280).frame(1);
    const fr = f.find((q) => q.k === "rect" && q.rect.w > 1000 && /stg-dash/.test(q.cls ?? ""));
    expect(fr && hot(fr)).toBe(true);
  });
});

describe("lanes decor: a panel keeps the stage's paint, a lit card's badges are lit", () => {
  test("example-layers 8 step 3: the 'switch passes it on' panel is white (pf-surface) with a line-2 border at full opacity", () => {
    const fe = fencesOf(join(ROOT, "fixtures/stage/example-layers.dh.md"))[7], f = compile(fe.src).plan(1280).frame(3);
    const panel = f.find((q) => q.k === "rect" && q.rect.w > 1000 && /scn-frame/.test(q.cls ?? ""));
    expect(panel?.k === "rect" ? `${panel.fill} ${panel.edge} ${/pf-surface/.test(panel.cls ?? "")} ${/ps-line-2/.test(panel.cls ?? "")}` : "none").toBe("band line true true");
  });
  test("stage 01: at step 1 (s0 lit) its worker badges are stg-w-hot; at step 4 not", () => {
    const [fe] = fencesOf(join(ROOT, "fixtures/stage/01-animation-a-composed-stage.dh.md")), c = compile(fe.src), p = c.plan(1280);
    const badge = (k: number) => p.frame(k).find((q) => q.key === "t:s0:badge:a");
    expect(/stg-w-hot/.test(badge(1)?.cls ?? "")).toBe(true);
    expect(/stg-w-hot/.test(badge(4)?.cls ?? "")).toBe(false);
  });
});
