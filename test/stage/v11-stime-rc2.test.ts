// @ts-nocheck: ported as written from the private prototype, which does not typecheck its tests (bun test runs them)
import { beforeEach, expect, test } from "bun:test";
import { compileStage, layoutStage } from "../../src/core/stage";
import { beginDocument } from "../../src/core/stage-budget";
import type { Item } from "../../src/core/stage-core";
beforeEach(() => beginDocument());
const roles = { job: 1, server: 2 };
const compile = (head: string, ...raw: string[]) => compileStage(head, raw.map((raw, i) => ({ title: "Step " + (i + 1), raw, line: 20 + i * 4 })), 1, {}, roles);
const shown = (i: Item, k: number) => i.on ? i.on.includes(k) : k >= (i.from || 1) && (!i.to || k <= i.to);
type Box = Extract<Item, { k: "box" }>;
const barHead = "bars 4 server: orders\n  axis 0, 0.5, 1, 1.5\n  labels: Mon, Thu, Fri, Sat";
test("move-arrow clearance never erases a bar top", () => {
  const c = compile(barHead, "values: 0.7 1 1.4 1.3", "values: 0.9 1 1.2 1.2\nmove 2 from Fri to Mon");
  expect(c.errors).toEqual([]);
  for (const w of [1178, 356]) {
    const p = layoutStage(c.model, w), bars = p.items.filter((i): i is Box => i.k === "box" && i.cls?.includes("stg-bar") && shown(i, 2));
    const halo = p.items.findIndex(i => i.k === "path" && i.ink === "surface" && shown(i, 2));
    expect(halo).toBeGreaterThanOrEqual(0);
    for (const bar of bars) expect(halo).toBeLessThan(p.items.indexOf(bar));
    expect(p.items.findIndex(i => i.k === "path" && i.arrow && shown(i, 2))).toBeGreaterThan(p.items.indexOf(bars.at(-1)!));
  }
});
test("at-cap bars lose automatic giving warnings, while authored peak and tone highlights remain", () => {
  const c = compile(barHead, "values: 0.7 1 1.4 1.3\npeak: busiest\nlimit 1.2: cap", "values: 0.9 1 1.2 1.2\nmove 2 from Fri to Mon", "tone Sat bad");
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 1178), bar = (name: string, k: number) => p.items.find((i): i is Box => i.k === "box" && i.cls?.includes("stg-bar") && i.bar?.label === name && shown(i, k))!;
  expect(bar("Fri", 1).fill).toBe("bad:line"); expect(bar("Sat", 1).fill).toBe("warn:line");
  expect(bar("Fri", 2).fill).toBe("bad:line"); expect(bar("Sat", 2).fill).toBe("bad:line");
  expect(bar("Mon", 2).fill).toBe("good:line"); expect(bar("Sat", 3).fill).toBe("bad:line");
});
test("equal-column clocks share cell widths and corresponding marker positions at wide and phone sizes", () => {
  const c = compile('time minutes: 0..8 | minutes\nruler: none\ncells: 1\nrow job m "Minutes": +_ 0..4 [numbered]; _ 4..8 @2 [numbered]\ntime ticks: 40..48 | ticks\nruler: none\ncells: 1\nrow server r "": +_ 40..44 [numbered]; _ 44..48 @2 [numbered]', "keep at minutes 3 [guide] [below]: minute\nkeep at ticks 43 [solid] [plain] [below]: tick", "");
  expect(c.errors).toEqual([]);
  for (const w of [1178, 1158, 356, 326]) {
    const p = layoutStage(c.model, w), cell = (row: string) => p.items.find((i): i is Box => i.k === "box" && !!i.cls?.includes("stg-time-cell") && i.id?.includes(":cell:" + row + ":"))!;
    expect(cell("m").x).toBe(cell("r").x); expect(cell("m").w).toBe(cell("r").w);
    const marks = p.items.filter(i => i.k === "path" && i.id?.includes(":at:"));
    expect(marks).toHaveLength(2);
    if (marks[0].k === "path" && marks[1].k === "path") expect(marks[0].pts[0][0]).toBe(marks[1].pts[0][0]);
  }
});
test("the export plot labels sit on their own value lines in the overview and inset", () => {
  const c = compile('time: 0..60 | seconds\nrow job work: prepare 0..24; render 24..36\nplot: 0..100 | percent\npoint job start at 0: 0 | Start\npoint job prepared at 24: 25 | Prepared\npoint job halfway at 30: 50 | Halfway\npoint job rendered at 36: 75 | Rendered\npoint job finish at 60: 100 | Complete\nzoom: 24..36 | Detail', "", "");
  expect(c.errors).toEqual([]);
  for (const w of [1178, 356]) {
    const p = layoutStage(c.model, w);
    for (const word of ["Rendered", "Complete"]) for (const label of p.items.filter(i => i.k === "text" && i.s === word)) {
      if (label.k !== "text") continue;
      const point = p.items.filter((i): i is Box => i.k === "box" && i.id?.endsWith(":point:" + (word === "Complete" ? "finish" : "rendered"))).sort((a, b) => Math.abs(a.y - label.y) - Math.abs(b.y - label.y))[0];
      expect(point).toBeDefined();
      const yy = point.y + point.h / 2;
      expect(Math.abs(label.y - 4 - yy)).toBeLessThan(.01);
    }
  }
});
test("column sharing leaves unequal grids and explicit row-label layouts independent", () => {
  for (const extra of ["", "row labels: beside\n"]) {
    const head = 'time minutes: 0..8 | minutes\nruler: none\ncells: 1\nrow job m "Minutes": +_ 0..8 [numbered]\n';
    const second = `time ticks: 40..${extra ? 48 : 44} | ticks\n${extra}ruler: none\ncells: 1\nrow server r "": +_ 40..${extra ? 48 : 44} [numbered]`;
    const alone = compile(second), together = compile(head + second);
    expect(alone.errors).toEqual([]); expect(together.errors).toEqual([]);
    const cell = (p: ReturnType<typeof layoutStage>) => p.items.find((i): i is Box => i.k === "box" && !!i.cls?.includes("stg-time-cell") && i.id?.includes(":cell:r:"))!;
    const a = cell(layoutStage(alone.model, 1178)), b = cell(layoutStage(together.model, 1178));
    expect([b.x, b.w]).toEqual([a.x, a.w]);
  }
});
test("dense plot labels that need another shelf keep a leader to their datum", () => {
  const c = compile('time: 0..10\nplot: 0..100 | progress\npoint job a at 4: 50 | Preparing export\npoint job b at 5: 50 | Rendering export\npoint job c at 6: 50 | Delivering export');
  expect(c.errors).toEqual([]);
  const p = layoutStage(c.model, 356);
  const leaders = p.items.filter(i => i.k === "path" && i.id?.includes(":point-label:"));
  expect(leaders.length).toBeGreaterThan(0);
  for (const leader of leaders) if (leader.k === "path") {
    const datum = p.items.find((i): i is Box => i.k === "box" && i.id === leader.id!.replace(":point-label:", ":point:"))!;
    expect(leader.pts[0]).toEqual([datum.x + datum.w / 2, datum.y + datum.h / 2]);
    expect(leader.ink).toBe("role:job:line");
  }
});
