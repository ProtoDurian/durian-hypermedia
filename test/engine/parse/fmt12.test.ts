// fmt12: a migrated block tells the same story as the old one, on the page (the page review's items that were wrong only in format 12).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allFixtureFences, fencesOf, ROOT } from "./fixtures";
import { migrate } from "../../../src/engine/parse/migrate";
import { parse12, stepTitle } from "../../../src/engine/parse/parse12";
import { stepLine } from "../../../src/engine/parse/print12";
import { compile } from "../../../src/engine/pipeline";

const fx = (rel: string) => readFileSync(join(ROOT, "fixtures", rel), "utf8");
const page12 = (fm: string, body: string) => `---\nformat: 12\n${fm}---\n\n\`\`\`animation\n${body}\n\`\`\`\n`;
const one = (text: string) => fencesOf("p.dh.md", text, "p")[0].src;

describe("captions: an old step line with a colon in it stays whole", () => {
  test("the CDN miss: the last caption is the whole line, not the words after the colon", () => {
    const out = migrate(fx("format/61-animation-by-a-new-author-a-cdn-miss-then-a-hit.dh.md"));
    expect(out).toContain("@step The edge has a copy\\: a hit.");
    const s = parse12(one(out)).steps.at(-1)!;
    expect(s.caption).toBe("The edge has a copy: a hit. It answers at once, with no trip to the origin.");
  });
  test("a format 12 title still ends at its colon", () => expect(stepTitle("Insert: 6 goes right")).toEqual(["Insert", "6 goes right"]));
  test("stepLine reads back as the same title and caption, for every step line of the fixtures", () => {
    const cases: [string, string][] = [["a: b", "a: b"], ["Start: x", "Start: x"], ["Title", "a sentence: with a colon"], ["T: odd", "c"], ["x".repeat(60) + ": y", "x".repeat(60) + ": y"]];
    for (const f of allFixtureFences()) for (const l of f.src.body.split("\n")) { const m = /^@step\s+(.*)$/.exec(l); if (m) cases.push([m[1].trim(), m[1].trim()]); }
    for (const [t, c] of cases) expect(stepTitle(stepLine(t, c))).toEqual([t, c]);
  });
});

describe("roles of one block: `role name cN: words`", () => {
  test("a graph family keeps its words, so the colour key is drawn", () => {
    const out = migrate(fx("format/55a-animation-eight-colours-told-apart-by-everyone.dh.md"));
    const c = compile(one(out));
    const key = Object.entries(c.model.roles).filter(([, r]) => r.label).map(([k]) => k);
    expect(key.length).toBe(8);
    expect(c.model.roles.user).toEqual({ colour: 1, label: "people" });
  });
  test("a block role wins over a page role of the same name, inside its block only", () => {
    const m = parse12(one(page12("roles:\n  app: c1\n", "role app c3: the app\napp a: one\n@step Go: a.\nlight a")));
    expect(m.problems).toEqual([]);
    expect(m.roles.app).toEqual({ colour: 3, label: "the app" });
  });
  test("two blocks of one page give one family name two colours", () => {
    const text = `---\nformat: 12\n---\n\n\`\`\`animation\nrole web c2: web\nweb a: a\n@step Go: a.\nlight a\n\`\`\`\n\n\`\`\`animation\nrole web c5: web too\nweb b: b\n@step Go: b.\nlight b\n\`\`\`\n`;
    const [f1, f2] = fencesOf("p.dh.md", text, "p");
    expect(parse12(f1.src).roles.web.colour).toBe(2);
    expect(parse12(f2.src).roles.web.colour).toBe(5);
  });
  test("a role line after a thing is refused, with the fix", () => {
    const m = parse12(one(page12("", "plain a: one\nrole app c3\n@step Go: a.\nlight a")));
    expect(m.problems.map((p) => p.msg).join()).toContain("goes before the first thing");
  });
  test("without words, a block role colours but adds nothing to the key", () => {
    const m = parse12(one(page12("", "role app c3\napp a: one\n@step Go: a.\nlight a")));
    expect(m.problems).toEqual([]);
    expect(m.roles.app).toEqual({ colour: 3, label: null });
  });
});

describe("axis words keep a space before a unit that is a word", () => {
  const words = (rel: string, width: number) => {
    const c = compile(one(migrate(readFileSync(join(ROOT, rel), "utf8"))));
    const p = c.plan(width), out = new Set<string>();
    for (let k = 0; k < c.states.length; k++) for (const x of p.frame(k)) if (x.k === "text") for (const l of x.lines) out.add(l);
    return [...out];
  };
  for (const [rel, want] of [["fixtures/gt/12-monthly-budget.dh.md", "1500 dollars"], ["fixtures/gt/tweaked/12-monthly-budget.dh.md", "dollars"], ["fixtures/gt/09-election-count.dh.md", "thousand votes"]] as const)
    for (const w of [1280, 390]) test(`${rel} at ${w}`, () => {
      const ws = words(rel, w);
      expect(ws.filter((s) => /\d(dollars|thousand)/.test(s))).toEqual([]);
      expect(ws.some((s) => s.includes(want) && /\d /.test(s))).toBe(true);
    });
});

describe("the DESIGN examples draw the story they tell", () => {
  const design = (f: string) => compile(fencesOf(join(ROOT, "test/engine/parse/design", f), undefined, f)[0].src);
  for (const w of [1280, 390]) {
    test(`a binary search tree: a child with no side takes the free one (${w})`, () => {
      const c = design("e-bst.dh.md"), r = c.plan(w).rects(c.states.length - 1), cx = (id: string) => r[id].x + r[id].w / 2;
      expect(cx("n3")).toBeLessThan(cx("n8")); expect(cx("n10")).toBeGreaterThan(cx("n8"));
      expect(cx("n1")).toBeLessThan(cx("n3")); expect(cx("n6")).toBeGreaterThan(cx("n3"));
      expect(cx("n14")).toBeGreaterThan(cx("n10"));
    });
    test(`counted columns: the chart fits the stage, wide enough for its month names (${w})`, () => {
      const c = design("g-columns.dh.md"), p = c.plan(w);
      expect(p.w).toBeLessThanOrEqual(w);
      for (let k = 0; k < c.states.length; k++) for (const x of p.frame(k)) {
        if (x.k === "dot") expect(x.y + x.r).toBeLessThanOrEqual(p.h);
        if (x.k === "text") expect(x.y).toBeLessThanOrEqual(p.h);
      }
      const labs = p.frame(2).filter((x) => x.k === "text" && /^[A-Z][a-z]{2}$/.test(x.lines[0])) as { x: number; lines: string[] }[];
      expect(labs.length).toBeGreaterThan(2);
      const xs = labs.map((l) => l.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(24); // no two names run together
    });
    test(`three regions: each region its own place (${w})`, () => {
      const c = design("f-regions.dh.md"), r = c.plan(w).rects(1);
      const ys = ["db1", "db2", "db3"].map((id) => r[id].y);
      expect(new Set(ys.map(Math.round)).size).toBe(3);
      expect(c.states.every((s) => s.layersApart)).toBe(true);
    });
  }
});

describe("a line an old graph step draws keeps its label on later steps", () => {
  test("93: task gen and push stay on their lines, with no dot (they were never sends)", () => {
    const out = migrate(fx("format/93-animation-inline-marks.dh.md"));
    expect(out).toContain("dev -> repo: task gen\nrepo -> ci: push\nhide dev->repo, repo->ci\n");
    expect(out).toContain("show repo->ci");
    const c = compile(one(out));
    expect(c.model.relations["dev->repo"].label).toBe("task gen");
    expect(c.states.map((s) => s.relations["repo->ci"].visible)).toEqual([false, false, true, true]);
    expect(c.motions.flatMap((m) => m.events).filter((e) => e.k === "send")).toEqual([]);
  });
});

describe("a migrated 3D scene is laid out as its old form", () => {
  const stage = (t: string) => t.replace(/^(`{3,}animation\b.*?)(\s+look=classic)?$/gm, "$1 look=stage");
  for (const f of ["format/64-3d-the-stateless-replay-system-in-layers.dh.md", "format/65-3d-kubernetes-cluster-to-container.dh.md", "format/67-3d-a-request-through-the-network-layers.dh.md", "format/70-3d-a-database-in-three-regions.dh.md"])
    test(f, () => {
      const text = fx(f), o = compile(one(stage(text))), m = compile(one(stage(migrate(text))));
      for (const w of [1280, 390]) {
        const po = o.plan(w), pm = m.plan(w);
        expect([pm.w, pm.h]).toEqual([po.w, po.h]);
        for (let k = 0; k < o.states.length; k++) expect(pm.rects(k)).toEqual(po.rects(k));
      }
    });
});

describe("look= on the fence reaches the engine", () => {
  test("a graph-engine fence with look=stage, a format 12 fence with look=classic", async () => {
    const { parse } = await import("../../../src/index");
    const { tryEngine } = await import("../../../src/engine/bridge");
    const look = (t: string) => tryEngine((parse(t, { path: "p.dh.md", engine: "new" }).blocks as any[]).find((b) => b.type === "animation")).c!.model.look;
    const old = fx("format/47-animation-the-engine.dh.md");
    expect(look(old)).toBe("classic"); // a graph-engine block's own look
    expect(look(old.replace(/^(`{3,}animation\b.*)$/m, "$1 look=stage"))).toBe("stage");
    const f12 = migrate(old); expect(f12).toMatch(/^`{3,}animation look=classic$/m);
    expect(look(f12)).toBe("classic"); // migrate keeps the old look
    expect(look(f12.replace(/ look=classic$/m, ""))).toBe("stage"); // format 12's own look
  });
});

test("68: the router's queue, routing table and rows sit as in the old form (table, row, pos= in a free group, zoom into)", () => {
  const stage = (t: string) => t.replace(/^(`{3,}animation\b.*?)(\s+look=classic)?$/gm, "$1 look=stage");
  const text = fx("format/68-3d-a-message-through-a-router-in-segments.dh.md"), o = compile(one(stage(text))), m = compile(one(stage(migrate(text))));
  for (const w of [1280, 390]) {
    const a = o.plan(w).rects(1), b = m.plan(w).rects(1);
    for (const id of ["ha", "msg", "q", "rt", "r1", "r2"]) expect(b[id]).toEqual(a[id]);
  }
});

test("a tree node with children draws its words in its middle, as a leaf does (8, 3, 10 in the BST example)", () => {
  const c = compile(fencesOf(join(ROOT, "test/engine/parse/design/e-bst.dh.md"), undefined, "e")[0].src);
  for (const w of [1280, 390]) {
    const p = c.plan(w), k = c.states.length - 1, r = p.rects(k);
    for (const id of ["n8", "n3", "n10", "n1"]) {
      const t = p.frame(k).find((x) => x.k === "text" && x.id === id) as { x: number; anchor: string } | undefined;
      expect(t?.anchor).toBe("middle");
      expect(Math.abs(t!.x - (r[id].x + r[id].w / 2))).toBeLessThan(1);
    }
  }
});
