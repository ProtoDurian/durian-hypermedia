// The tree and calendar chart kinds (treemap, sunburst, calendar) as primitives: every sample fence of those kinds at 390 and 1280
// px, with every open node of a tree. Checks: no NaN, stable keys, marks inside the chart, no two words over each other, the LLM
// view equal to the old part's.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { Budget } from "../../../src/core/budget";
import { measure, setPhoneFont } from "../../../src/core/stage-core";
import { parseChartKinds } from "../../../src/parts/chart-kinds/part";
import { llmText, type View } from "../../../src/parts/chart-kinds/compute";
import { LIMITS } from "../../../src/parts/chart-kinds/limits";
import { KINDS, kindBuild, kindHeight, kindWidth, specOfView } from "../../../src/engine/charts/kinds";
import { treemap, crumbs, treeHint } from "../../../src/engine/charts/kinds/treemap";
import { sunburst } from "../../../src/engine/charts/kinds/sunburst";
import { rotOf } from "../../../src/engine/charts/rot"; // eng-polish
import { calendar, dayName, stripsOf } from "../../../src/engine/charts/kinds/calendar";
import type { KBuilt } from "../../../src/engine/charts/kinds/common";
import type { Prim, Rect } from "../../../src/engine/types";

const MINE = ["treemap", "sunburst", "calendar"];
const FILES = [
  "src/parts/chart-kinds/sample.md",
  ...readdirSync("src/parts/chart-kinds/fixtures").map((f) => `src/parts/chart-kinds/fixtures/${f}`),
  ...readdirSync("fixtures/format").filter((f) => /chart/.test(f)).map((f) => `fixtures/format/${f}`),
  "fixtures/parts/samples.dh.md",
];
const big = () => new Budget({ steps: 1e12, values: 1e12, chars: 1e12 });
interface Fence { name: string; kind: string; views: View[] }
const FENCES: Fence[] = [];
for (const f of FILES) {
  let n = 0;
  for (const m of readFileSync(f, "utf8").matchAll(/^```chart\n([\s\S]*?)^```/gm)) {
    n++;
    const d = parseChartKinds(m[1], 1, 1, LIMITS, big());
    if (MINE.includes(d.kind) && d.steps.length) FENCES.push({ name: `${f.split("/").pop()}#${n}`, kind: d.kind, views: d.steps.map((s) => s.view) });
  }
}
const ctxOf = (w: number) => { const phone = w < 480; setPhoneFont(phone); return { phone, look: "stage" as const, measure, step: 0, prev: null, max: [], lit: [] }; };
const fmtNum = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x);
function allFinite(o: unknown): boolean {
  if (typeof o === "number") return Number.isFinite(o);
  if (Array.isArray(o)) return o.every(allFinite);
  if (o && typeof o === "object") return Object.values(o).every(allFinite);
  return true;
}
const inside = (r: Rect, o: Rect) => r.x >= o.x - 0.5 && r.y >= o.y - 0.5 && r.x + r.w <= o.x + o.w + 0.5 && r.y + r.h <= o.y + o.h + 0.5;
/** the box of a word (its baseline is y) */
function boxOf(p: Extract<Prim, { k: "text" }>, w: (s: string) => number): Rect {
  const tw = Math.max(...p.lines.map(w)), x = p.anchor === "start" ? p.x : p.anchor === "end" ? p.x - tw : p.x - tw / 2;
  return { x, y: p.y - 10, w: tw, h: 13 };
}
const over = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
// eng-polish: a word turned along a ring or an arc (kd-rot class) is a turned box: two words are over each other when their turned boxes are (separating axes)
type Quad = [number, number][];
function quadOf(p: Extract<Prim, { k: "text" }>): Quad {
  const tw = Math.max(...p.lines.map((l) => measure(l, p.font))), t = (rotOf(p.cls) * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t);
  const ox = p.anchor === "start" ? 0 : p.anchor === "end" ? -tw : -tw / 2;
  return ([[ox, -10], [ox + tw, -10], [ox + tw, 3], [ox, 3]] as Quad).map(([x, y]) => [p.x + x * co - y * si, p.y + x * si + y * co]);
}
function quadsOver(a: Quad, b: Quad): boolean {
  for (const q of [a, b]) for (let i = 0; i < 4; i++) {
    const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % 4], nx = y1 - y0, ny = x0 - x1;
    const pr = (z: Quad) => z.map(([x, y]) => x * nx + y * ny), pa = pr(a), pb = pr(b);
    if (Math.max(...pa) <= Math.min(...pb) + 0.5 * Math.hypot(nx, ny) || Math.max(...pb) <= Math.min(...pa) + 0.5 * Math.hypot(nx, ny)) return false;
  }
  return true;
}
const wordsOver = (a: Extract<Prim, { k: "text" }>, b: Extract<Prim, { k: "text" }>): boolean => (rotOf(a.cls) || rotOf(b.cls) ? quadsOver(quadOf(a), quadOf(b)) : over(boxOf(a, (s) => measure(s, a.font)), boxOf(b, (s) => measure(s, b.font))));
/** every open node a tree can be zoomed to (the whole, and up to 6 branches) */
const nodesOf = (v: View) => (v.kind === "treemap" || v.kind === "sunburst" ? v.nodes : []);
const zooms = (v: View): number[] => (v.kind === "calendar" ? [0] : [0, ...nodesOf(v).filter((n) => n.children.length).map((n) => n.id).slice(0, 6)]);
function draw(v: View, w: number, zoom = 0, at?: number, roomW?: number): { built: KBuilt; rect: Rect } {
  const ctx = ctxOf(w);
  const { spec } = specOfView(v, { zoom });
  const h = kindHeight(spec, roomW ?? w), need = kindWidth(spec);
  const rect: Rect = { x: 10, y: 7, w: roomW ?? Math.max(w, need ?? 0), h };
  return { built: kindBuild(spec, rect, { ...ctx, at }), rect };
}

test("there are samples of every kind of this lane", () => {
  for (const k of MINE) expect(FENCES.filter((f) => f.kind === k).length).toBeGreaterThan(0);
});
describe("tree and calendar kinds", () => {
  for (const fe of FENCES) for (const w of [390, 1280]) {
    test(`${fe.name} (${fe.kind}) at ${w}`, () => {
      for (const v of fe.views) for (const z of zooms(v)) {
        const { built, rect } = draw(v, w, z);
        // no NaN, every key once
        expect(allFinite(built.prims)).toBe(true);
        expect(allFinite(built.marks)).toBe(true);
        const keys = built.prims.map((p) => p.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(built.prims.length).toBeGreaterThan(0);
        // every mark inside the chart, and its words as the old popover's
        for (const m of built.marks) { expect(inside(m.rect, rect)).toBe(true); expect(m.title.length).toBeGreaterThan(0); expect(m.rect.w).toBeGreaterThan(0); }
        expect(new Set(built.marks.map((m) => m.key)).size).toBe(built.marks.length);
        // every drawn thing inside the chart
        for (const p of built.prims) {
          if (p.k === "rect" || p.k === "box") expect(inside(p.rect, rect)).toBe(true);
          if (p.k === "dot") expect(inside({ x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, h: 2 * p.r }, rect)).toBe(true);
        }
        // no two words over each other, none too small, none outside
        const words = built.prims.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text");
        const bx = words.map((p) => boxOf(p, (s) => measure(s, p.font)));
        for (let i = 0; i < bx.length; i++) {
          expect(inside(bx[i], { x: rect.x - 1, y: rect.y - 12, w: rect.w + 2, h: rect.h + 24 })).toBe(true);
          expect(["sub", "small-b"]).toContain(words[i].font);
          for (let j = i + 1; j < bx.length; j++) if (wordsOver(words[i], words[j])) throw new Error(`${fe.name} zoom ${z}: "${words[i].lines[0]}" over "${words[j].lines[0]}"`);
        }
        // the LLM view is the old part's
        const draw0 = KINDS.find((k) => k.kind === v.kind)!;
        expect(draw0.llm(specOfView(v).spec, [])).toEqual(llmText(v.kind, v.title, [{ errors: [], warnings: [], view: v }]).split("\n"));
      }
    });
  }
  for (const fe of FENCES.filter((f) => f.views.length > 1)) test(`${fe.name}: a step keeps the keys of the shapes`, () => {
    for (let k = 1; k < fe.views.length; k++) {
      const a = fe.views[k - 1], b = fe.views[k];
      const same = a.kind === "calendar" ? b.kind === "calendar" && a.days.length === b.days.length : nodesOf(a).length > 0 && nodesOf(a).length === nodesOf(b).length;
      if (!same) continue;
      const shapes = (v: View) => draw(v, 1280).built.prims.filter((p) => p.k !== "text").map((p) => p.key).sort();
      expect(shapes(b)).toEqual(shapes(a));
    }
  });
});

describe("heights and widths", () => {
  test("a height never depends on the width inside a phone or a desktop class", () => {
    for (const fe of FENCES) for (const v of fe.views) {
      const { spec } = specOfView(v);
      if (v.kind === "calendar") continue; // a calendar wraps its weeks into strips: its height follows the room (see "calendar")
      if (v.kind === "sunburst") continue; // charts2: a ring chart is as tall as it is wide (up to 460 px), so no band is left empty
      expect(kindHeight(spec, 320)).toBe(kindHeight(spec, 479));
      expect(kindHeight(spec, 480)).toBe(kindHeight(spec, 1600));
    }
  });
  test("no kind needs a width of its own (a calendar wraps instead of scrolling sideways)", () => {
    for (const fe of FENCES) for (const v of fe.views) expect(kindWidth(specOfView(v).spec)).toBeNull();
  });
});

describe("treemap", () => {
  const fe = FENCES.find((f) => f.kind === "treemap")!, v = fe.views[0];
  test("every block is keyed by its node, the words by theirs; zooming keeps the shared blocks' keys", () => {
    if (v.kind !== "treemap") throw new Error("kind");
    const a = draw(v, 1280, 0).built, branch = v.nodes.find((n) => n.depth === 1 && n.children.length)!;
    const b = draw(v, 1280, branch.id).built;
    for (const p of [...a.prims, ...b.prims]) expect(p.key).toMatch(/^tile:\d+(:[nv])?$/);
    const ka = new Set(a.prims.map((p) => p.key)), shared = b.prims.filter((p) => ka.has(p.key));
    expect(shared.length).toBeGreaterThan(0);
    for (const m of a.marks) if (m.zoom !== undefined) expect(v.nodes[m.zoom].children.length).toBeGreaterThan(0);
  });
  test("the card of a block has the old words", () => {
    if (v.kind !== "treemap") throw new Error("kind");
    const m = draw(v, 1280).built.marks[0], n = v.nodes[Number(m.key.slice(5))];
    expect(m.title).toBe(n.name);
    expect(m.meta).toMatch(/ · [\d.]+% of (the whole|all)$/);
  });
  test("the path and the hint", () => {
    if (v.kind !== "treemap") throw new Error("kind");
    expect(crumbs(v, 0)).toEqual([{ id: 0, name: "All" }]);
    const n = v.nodes.find((x) => x.depth === 2)!;
    expect(crumbs(v, n.id).map((c) => c.id)).toEqual([0, n.parent, n.id]);
    expect(treeHint(v)).toContain("block");
  });
  test("a tree of one block still draws", () => {
    const one = { ...v, nodes: nodesOf(v).slice(0, 2).map((n, i) => (i === 0 ? { ...n, children: [1] } : { ...n, children: [], parent: 0 })) } as View;
    expect(allFinite(treemap.build(one, { x: 0, y: 0, w: 300, h: 420 }, { ...ctxOf(300), zoom: 0 }).prims)).toBe(true);
  });
});

describe("sunburst", () => {
  const fe = FENCES.find((f) => f.kind === "sunburst")!, v = fe.views[0];
  test("every arc has the same commands, the centre has the open node, the way up is a mark the arrows skip", () => {
    if (v.kind !== "sunburst") throw new Error("kind");
    const cmds = (d: string) => d.replace(/[-\d.\s,]+/g, "");
    const a = draw(v, 1280, 0).built;
    const shapes = new Set(a.prims.filter((p) => p.k === "path").map((p) => cmds((p as Extract<Prim, { k: "path" }>).d)));
    expect(shapes.size).toBe(1);
    expect(a.marks.some((m) => m.key === "core")).toBe(false);
    const branch = v.nodes.find((n) => n.depth === 1 && n.children.length)!;
    const b = draw(v, 1280, branch.id).built;
    const up = b.marks.find((m) => m.key === "core")!;
    expect(up.zoom).toBe(0); expect(up.skip).toBe(true); expect(up.title).toBe("Up to All");
    expect(b.prims.find((p) => p.key === "core:n" && p.k === "text")).toBeTruthy();
    for (const p of b.prims) if (p.k === "path") expect(cmds(p.d)).toBe([...shapes][0]);
  });
  test("a whole ring (one entry that is everything) is still a ring", () => {
    if (v.kind !== "sunburst") throw new Error("kind");
    const one = { ...v, nodes: nodesOf(v).slice(0, 2).map((n, i) => (i === 0 ? { ...n, children: [1] } : { ...n, children: [], parent: 0 })) } as View;
    const b = sunburst.build(one, { x: 0, y: 0, w: 460, h: 460 }, { ...ctxOf(460), zoom: 0 });
    expect(allFinite(b.prims)).toBe(true);
  });
});

describe("calendar", () => {
  const fe = FENCES.find((f) => f.kind === "calendar")!, v = fe.views[0];
  test("a cell per day keyed by its date, a mark per day, a ramp of the tone", () => {
    if (v.kind !== "calendar") throw new Error("kind");
    const b = draw(v, 1280).built;
    for (const d of v.days) expect(b.prims.some((p) => p.key === `day:${d.date}`)).toBe(true);
    expect(b.marks.length).toBe(v.days.length);
    const m = b.marks.find((x) => x.key === `day:${v.days.find((d) => d.value !== null)!.date}`)!;
    expect(m.title).toBe(dayName(v.days.find((d) => d.value !== null)!));
    expect(m.meta).toContain(`${v.yLabel}: `);
    expect(b.prims.filter((p) => p.key.startsWith("key:") && p.k === "rect").length).toBe(10);
  });
  test("a room narrower than the weeks wraps them into strips: every day, a weekday column per strip, nothing outside, no scroll", () => {
    if (v.kind !== "calendar" || v.cols < 10) return;
    for (const room of [256, 326, 390, 700]) {
      const r = draw(v, room, 0, undefined, room), s = stripsOf(v.cols, room, room < 480);
      expect(allFinite(r.built.prims)).toBe(true);
      expect(r.built.marks.length).toBe(v.days.length);
      for (const m of r.built.marks) expect(inside(m.rect, { x: 10, y: 7, w: room, h: r.rect.h })).toBe(true);
      for (let k = 0; k < s.n; k++) expect(r.built.prims.some((p) => p.key === (k === 0 ? "wd:0" : `wd:${k}:0`))).toBe(true);
      expect(s.per * s.n).toBeGreaterThanOrEqual(v.cols);
      expect(s.step).toBeGreaterThanOrEqual(room < 480 ? 18 : Math.min(22, s.step));
      if (s.n > 1) expect(s.per * s.step + 34).toBeLessThanOrEqual(room);
    }
  });
  test("the strips: the whole year in one strip when it fits at full size, more strips (not tiny cells) as the room narrows", () => {
    expect(stripsOf(53, 1600, false).n).toBe(1);
    const phone = stripsOf(53, 326, true), wide = stripsOf(53, 700, false);
    expect(phone.n).toBeGreaterThan(wide.n); expect(phone.step).toBeGreaterThanOrEqual(18); expect(wide.step).toBeGreaterThanOrEqual(22);
    expect(stripsOf(12, 326, true).n).toBe(1);
    for (const w of [240, 326, 390, 479, 480, 700, 1280]) { const s = stripsOf(53, w, w < 480); expect(s.n * s.per).toBeGreaterThanOrEqual(53); expect(s.per * s.step + 34).toBeLessThanOrEqual(Math.max(w, 34 + s.per * s.step)); }
  });
  test("a day keeps its key when the room changes (it glides to its new strip)", () => {
    if (v.kind !== "calendar") return;
    const a = new Set(draw(v, 326, 0, undefined, 326).built.prims.map((p) => p.key)), b = new Set(draw(v, 1280, 0, undefined, 1280).built.prims.map((p) => p.key));
    for (const d of v.days) { expect(a.has(`day:${d.date}`)).toBe(true); expect(b.has(`day:${d.date}`)).toBe(true); }
  });
  test("the week's first day sets the weekday words", () => {
    if (v.kind !== "calendar") return;
    const words = (week: "mon" | "sun") => (calendar.build({ ...v, week }, { x: 0, y: 0, w: 2000, h: 300 }, { ...ctxOf(1280), zoom: 0 }).prims.filter((p) => p.key.startsWith("wd:")) as Extract<Prim, { k: "text" }>[]).map((p) => p.lines[0]);
    expect(words("mon")[0]).toBe("Mon"); expect(words("sun")[0]).toBe("Sun");
  });
  test("numbers are finite everywhere", () => { expect(fmtNum(34 + 1 * 27)).toBe(true); });
});

describe("a changed number keeps the keys (a step, a control)", () => {
  const changed = (v: View): View => {
    const c = structuredClone(v);
    if (c.kind === "calendar") { const d = c.days.find((x) => x.value !== null)!; d.value = d.value! * 3 + 1; c.hi = Math.max(c.hi, d.value); return c; }
    { const nodes = nodesOf(c); const leaf = nodes.find((n) => !n.children.length && n.depth > 0)!; const add = leaf.value * 2; for (let i = leaf.id; i >= 0; i = nodes[i].parent) { nodes[i].value += add; if (nodes[i].parent < 0) break; } }
    return c;
  };
  for (const fe of FENCES) test(`${fe.name}: shapes keep their keys`, () => {
    const a = fe.views[0], b = changed(a);
    for (const w of [390, 1280]) for (const z of zooms(a)) {
      const shapes = (v: View) => draw(v, w, z).built.prims.filter((p) => p.k !== "text").map((p) => p.key).sort();
      if (a.kind !== "treemap") expect(shapes(b)).toEqual(shapes(a));
      else expect(new Set(shapes(b))).toEqual(new Set(shapes(a)));
    }
  });
});

describe("a big tree", () => {
  const body = (n: number) => {
    const kids = (k: number) => Array.from({ length: k }, (_, i) => `{ name: "Part ${k}-${i}", value: ${1 + ((i * 7) % 13)} }`).join(", ");
    return `kind: ${n === 0 ? "treemap" : "sunburst"}\ndepth: 3\ndata:\n${Array.from({ length: 12 }, (_, i) => `  - { name: "Group number ${i}", children: [${kids(10 + (i % 5))}] }`).join("\n")}\n`;
  };
  for (const n of [0, 1]) for (const w of [390, 1280]) test(`${n === 0 ? "treemap" : "sunburst"} of 150 leaves at ${w}`, () => {
    const d = parseChartKinds(body(n), 1, 1, LIMITS, big());
    expect(d.errors).toEqual([]);
    const v = d.steps[0].view;
    const t0 = performance.now();
    for (const z of zooms(v)) {
      const { built, rect } = draw(v, w, z);
      expect(allFinite(built.prims)).toBe(true);
      for (const m of built.marks) expect(inside(m.rect, rect)).toBe(true);
      const words = built.prims.filter((p): p is Extract<Prim, { k: "text" }> => p.k === "text");
      const bx = words.map((p) => boxOf(p, (s) => measure(s, p.font)));
      for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (wordsOver(words[i], words[j])) throw new Error(`zoom ${z}: "${words[i].lines[0]}" over "${words[j].lines[0]}"`);
    }
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
