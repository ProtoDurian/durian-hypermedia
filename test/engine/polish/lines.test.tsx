// eng-polish: a line the step sends along draws hot (the stage's 2.2 px at full strength), an arrowhead is the stage's size, and a
// send's dot stops short of the head instead of hiding it.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../../../src/index";
import { tryEngine } from "../../../src/engine/bridge";
import { beginDocument } from "../../../src/core/stage-budget";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { CHART } from "../../../src/engine/charts";
import { Draw, HEAD_ROOM, polyAt, wholeOf } from "../../../src/engine/render/svg";
import type { Prim } from "../../../src/engine/types";
import { useStandin } from "../render/standin";

const ROOT = join(import.meta.dir, "../../..");
let restore = () => {};
beforeAll(() => { restore = useStandin(); });
afterAll(() => restore());
beforeEach(() => { beginDocument(); });
const c3 = () => {
  setPhoneFont(false);
  const p = parse(readFileSync(join(ROOT, "fixtures/gt/03-oauth-login.dh.md"), "utf8"), { path: "x.dh.md" });
  return tryEngine((p as any).blocks.find((b: any) => b.type === "animation")).c!;
};

describe("a line the step sends along draws hot", () => {
  test("the relation of this step's send is a hot path; a step that sends nothing along it is not", () => {
    const c = c3(), plan = c.plan(1280);
    const rel = (k: number, id: string) => (plan.frame(k) as Prim[]).find((p) => p.k === "path" && p.key === `rel:${id}`) as Extract<Prim, { k: "path" }> | undefined;
    const id = Object.keys(c.model.relations).find((r) => r.startsWith("b->a"))!;
    expect(rel(1, id)?.width).toBe("hot");
    expect(rel(2, id)?.width).toBeUndefined();   // step 2 only lights the login server; step 3 sends the code along this line again
    expect(rel(3, id)?.width).toBe("hot"); expect(rel(5, id)?.width).toBeUndefined();
  });
  test("drawn: a hot line is 2.2 px and at full strength", () => {
    const c = c3(), plan = c.plan(1280);
    const html = renderToString(<Draw c={c} plan={plan} from={1} to={1} t={1} cam={wholeOf(plan)} still={true} />);
    expect(html).toContain("--lk-line-hot-w, 2.2px");
  });
});

describe("arrowheads and the dot", () => {
  test("a head is 10 px long, as the stage's", () => {
    const c = c3(), plan = c.plan(1280);
    const html = renderToString(<Draw c={c} plan={plan} from={1} to={1} t={1} cam={wholeOf(plan)} still={true} />);
    const heads = [...html.matchAll(/class="stg-head" d="M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)Z"/g)];
    expect(heads.length).toBeGreaterThan(0);
    for (const m of heads) { const [tx, ty, ax, ay, bx, by] = m.slice(1).map(Number); expect(Math.hypot(tx - (ax + bx) / 2, ty - (ay + by) / 2)).toBeCloseTo(10, 0); }
  });
  test("a send's dot at rest stops HEAD_ROOM short of the line's end, so the head shows", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const end = polyAt(pts, 1, HEAD_ROOM);
    expect(end.x).toBeCloseTo(100 - HEAD_ROOM, 5);
    expect(HEAD_ROOM).toBeGreaterThan(10 + 4.2);        // past the head and the dot's own radius
    expect(polyAt(pts, 1).x).toBe(100);                  // no head: to the end
    expect(polyAt([{ x: 0, y: 0 }, { x: 20, y: 0 }], 1, HEAD_ROOM).x).toBeGreaterThan(7); // a short line keeps its dot on it
  });
});

describe("a wrapped category word on a horizontal bar chart (format 15)", () => {
  test("its two lines are 18 px apart, so the probe sees them apart", () => {
    setPhoneFont(false);
    const spec = { kind: "bar", title: "", unit: null, x: ["Edit files by hand", "Run the template once", "Ask every question", "Replay all answers"], series: [{ name: "seconds", role: null, values: [95, 12, 31, 48] }], flags: ["horizontal"], opts: {} } as any;
    const ctx = { phone: false, look: "stage" as const, measure, step: 0, prev: null, max: [[95, 12, 31, 48]], lit: [] as string[] };
    const f = CHART.bar.draw(spec, [[95, 12, 31, 48]], { x: 0, y: 0, w: 800, h: 330 }, ctx) as Prim[];
    const a = f.find((q) => q.k === "text" && q.lines[0] === "Run the template") as Extract<Prim, { k: "text" }>;
    const b = f.find((q) => q.k === "text" && q.lines[0] === "once") as Extract<Prim, { k: "text" }>;
    expect(a && b).toBeTruthy();
    expect(b.y - a.y).toBe(18);
  });
});
