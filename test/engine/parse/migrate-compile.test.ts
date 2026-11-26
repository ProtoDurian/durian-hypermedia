// eng-migrate2: every old animation migrates to format 12 and compiles clean. For every animation fence of fixtures/format,
// fixtures/stage and the generality scenes (gt, gt/tweaked): `migrate` -> format 12 text -> parse12 -> compile gives no
// refusal (the doccheck and the layouts at 1280 and 390), and tells the same story as the old block: the core's states at
// every step are equal. The 7 DESIGN examples (already format 12) compile clean at both widths too.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "./fixtures";
import { migrate } from "../../../src/engine/parse/migrate";
import { compile } from "../../../src/engine/pipeline";
import type { Compiled, StepState } from "../../../src/engine/types";

const refusals = (c: Compiled) => { c.plan(1280); c.plan(390); return c.problems.filter((p) => !p.warn).map((p) => `${p.line}: ${p.msg}`); };
/** what the core says is true at a step (the layouts' own state is theirs to keep) */
/** fmt12: what the reader reads: each step's caption and title, and the roles the colour key names (with their words) */
const words = (c: Compiled) => ({ steps: c.model.steps.map((s) => [s.title, s.caption]), key: Object.entries(c.model.roles).filter(([, r]) => r.label).map(([k, r]) => [k, r.colour, r.label]) });
const story = (s: StepState) => ({ things: s.things, relations: s.relations, focus: s.focus, zoom: s.zoom, layersApart: s.layersApart, scene: s.scene, inner: s.inner && Object.fromEntries(Object.entries(s.inner).map(([k, v]) => [k, { things: v.things, relations: v.relations }])) });

const pages: { label: string; path: string }[] = [];
for (const dir of ["fixtures/format", "fixtures/stage", "test/engine/parse/gt", "test/engine/parse/gt/tweaked"]) {
  for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith(".dh.md")).sort()) {
    const path = join(ROOT, dir, f);
    if (/^`{3,}animation\b/m.test(readFileSync(path, "utf8"))) pages.push({ label: `${dir}/${f}`, path });
  }
}

test("every page with an animation is here", () => expect(pages.length).toBeGreaterThanOrEqual(80));

describe("migrate, then compile: no refusal, the same story", () => {
  for (const p of pages) test(p.label, () => {
    const text = readFileSync(p.path, "utf8");
    const out = migrate(text);
    expect(out).toContain("format: 12");
    const olds = fencesOf(p.path, text, "old"), news = fencesOf(p.path, out, "new");
    expect(news.length).toBe(olds.length);
    news.forEach((fe, i) => {
      expect(fe.src.format12).toBe(true);
      const c = compile(fe.src), o = compile(olds[i].src);
      expect(c.model.origin).toBe("format12");
      expect(refusals(c)).toEqual([]);
      expect(c.states.length).toBe(o.states.length);
      c.states.forEach((s, k) => expect(story(s)).toEqual(story(o.states[k])));
      expect(words(c)).toEqual(words(o)); // fmt12: the same captions, titles and colour key
    });
  });
});

describe("the DESIGN examples compile clean at 1280 and 390", () => {
  const dir = join(import.meta.dir, "design");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".dh.md")).sort()) test(f, () => {
    const fe = fencesOf(join(dir, f), undefined, f)[0];
    expect(refusals(compile(fe.src))).toEqual([]);
  });
});

describe("one hop per beat", () => {
  const page = (steps: string) => `---\nformat: 12\nroles:\n  app: c1\n---\n\n\`\`\`animation\n## A\napp c: client\n## B\napp r: relay\n## C\napp s: server\n${steps}\n@step End: done.\nlight s\n\`\`\`\n`;
  const run = (steps: string) => refusals(compile(fencesOf("p.dh.md", page(steps), "p")[0].src));
  test("a relay in one beat is refused", () => expect(run("@step Go: c to s.\nc -> r: hello\nr -> s: hello").join()).toContain("one hop per step"));
  test("then splits it into two beats, played in order", () => {
    expect(run("@step Go: c to s.\nc -> r: hello\nthen\nr -> s: hello")).toEqual([]);
    const c = compile(fencesOf("p.dh.md", page("@step Go: c to s.\nc -> r: hello\nthen\nr -> s: hello"), "p")[0].src);
    expect(c.motions[1].beats).toBe(2);
    expect(c.motions[1].events.filter((e) => e.k === "send").map((e) => ("beat" in e ? e.beat : -1))).toEqual([0, 1]);
  });
  test("migrate writes then between the hops of a chain", () => {
    const out = migrate(readFileSync(join(ROOT, "test/engine/parse/gt/02-tcp-handshake.dh.md"), "utf8"));
    expect(out).toMatch(/c -> r[^\n]*\nthen\nr -> s/);
  });
});
