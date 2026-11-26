// render2: a format 12 graph scene is laid out by the graph engine (layouts/graph/raise.ts + legacy.ts), so the migrated
// form of an old graph block sits exactly where the old form does, at 1280 and at 390 (the page draws every sample
// migrated: service mesh, pods, eight colours, kube-proxy ... were cut at 390 or crossed by lines in the rank layout).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fencesOf, ROOT } from "../parse/fixtures";
import { migrate } from "../../../src/engine/parse/migrate";
import { compile } from "../../../src/engine/pipeline";
import { raise12, unraisable } from "../../../src/engine/layouts/graph/raise";
import { parseScene, play } from "../../../src/core/scene";
import type { Compiled } from "../../../src/engine/types";

/** fences whose migrated form lays out exactly as the old form (each thing's rect at every step, both widths) */
const SAME = [
  "07-human-only-segment", "09-still-scene", "47-animation-the-engine", "48-animation-binary-search-tree-insert",
  "49-animation-hash-table-with-a-collision", "50-animation-sharding-then-rebalancing", "51-animation-replicas-and-failover",
  "52-animation-pods-nodes-a-service", "54-animation-not-only-code", "55a-animation-eight-colours-told-apart-by-everyone",
  "56-animation-streams-meters-and-colours", "60-animation-by-a-new-author-a-queue-with-workers",
  "62-animation-one-thing-splits-travels-and-merges", // render3: 63 is ranked (raise.ts: data beside a container in a group; raised, its structures overlapped)
  "66-animation-a-packet-through-kube-proxy", "72-3d-a-2d-scene-unchanged", "81-static-live-and-still",
  "93-animation-inline-marks", "94-animation-long-paths-in-labels",
];
/** raised, a little off the old form: the old send kinds (arrow, both) and the says that migrate does not keep give the
 * graph engine other room for words; still the graph engine's layout */
const NEAR = ["53-animation-a-service-mesh", "55-animation-colour-families-the-way-a-diagram-uses-them", "57-animation-a-balancer-evens-out-the-load",
  "58-animation-one-question-becomes-three", "59-animation-the-author-sets-the-beat", "61-animation-by-a-new-author-a-cdn-miss-then-a-hit", "95-animation-sent-items"];

const pair = (name: string) => {
  const path = join(ROOT, "fixtures/format", name + ".dh.md"), text = readFileSync(path, "utf8");
  const olds = fencesOf(path, text, "old"), news = fencesOf(path, migrate(text), "new");
  return olds.map((o: { src: Parameters<typeof compile>[0] }, i: number) => ({ old: compile(o.src), now: compile(news[i].src) }));
};
const worst = (a: Compiled, b: Compiled, w: number) => {
  const pa = a.plan(w), pb = b.plan(w); let d = 0;
  for (let k = 0; k < a.states.length; k++) {
    const ra = pa.rects(k), rb = pb.rects(k);
    for (const id of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      const x = ra[id], y = rb[id];
      d = Math.max(d, !x || !y ? Infinity : Math.max(Math.abs(x.x - y.x), Math.abs(x.y - y.y), Math.abs(x.w - y.w), Math.abs(x.h - y.h)));
    }
  }
  return d;
};

describe("a migrated graph scene sits where the old one does", () => {
  for (const name of SAME) test(name, () => {
    for (const { old, now } of pair(name)) {
      expect(old.model.origin).toBe("graph10");
      expect(now.model.origin).toBe("format12");
      expect(unraisable(now.model)).toBeNull();
      for (const w of [1280, 390]) expect(worst(old, now, w)).toBeLessThan(1);
    }
  });
});

describe("raised words are words the graph engine takes", () => {
  for (const name of [...SAME, ...NEAR]) test(name, () => {
    for (const { now } of pair(name)) {
      const r = raise12(now.model, now.states)!;
      expect(r).not.toBeNull();
      const { scene, errors } = parseScene(r.head, r.steps.length ? [{ title: "Setup", raw: r.setup, line: 1 }, ...r.steps] : [], 1, r.info);
      expect([...errors, ...play(scene).errors].map((e) => e.msg)).toEqual([]);
      expect(now.problems.filter((p) => !p.warn)).toEqual([]);
    }
  });
});

describe("what is not raised is ranked as before", () => {
  const page = (body: string) => `---\nformat: 12\nroles:\n  app: c1\n---\n\n\`\`\`animation\n${body}\n\`\`\`\n`;
  const model = (body: string) => compile(fencesOf("p.dh.md", page(body), "p")[0].src);
  test("a thing with card lines (the graph engine sizes by the title only)", () => expect(unraisable(model("app a: api | line one\napp b: db\na -> b\n@step Go: a step.\nlight a").model)).toBe("card lines"));
  test("a state chip", () => { const c = model("app a: api\napp b: db\na -> b\n@step Go: a step.\na is busy"); expect(raise12(c.model, c.states)).toBeNull(); });
  test("a chart", () => expect(unraisable(model("app a: api\nplain c [chart bar]: load\nx: a, b\nc = 1 2\n@step Go: a step.\nlight a").model)).toBe("chart"));
  test("a plain graph scene is raised and draws clean at both widths", () => {
    const c = model("app a: api\napp b: db\napp c: cache\na -> b\na -> c\n@step Go: a step.\na -> b: read\n@step Then: another.\nhide c");
    expect(unraisable(c.model)).toBeNull();
    for (const w of [1280, 390]) { const p = c.plan(w); for (let k = 0; k < c.states.length; k++) expect(p.frame(k).length).toBeGreaterThan(0); }
    expect(c.problems.filter((p) => !p.warn)).toEqual([]);
    expect(c.plan(1280).rects(2).c).toBeUndefined();
  });
});
