// sunburst as primitives (lane chwire, sub-lane B). Contract: ./common.ts KindImpl.
// One `path` per arc, keyed `arc:<node id>`; every arc is a ring slice of the same commands (4 curves out, a line, 4 curves back,
// ringPath of the radial kinds), so a zoom or a changed number glides a slice from the old angles to the new. The words are
// `text` prims (`arc:<id>:n`): level where the whole name sits inside its own slice, else along the ring, else along the arc, else cut with "…",
// else left out (eng-polish: arcWord; whatever is drawn lies wholly on its own arc). The centre is a dot with the open
// node's name and value; with a node open, a click on it goes up one (mark `core`, which the arrow keys skip).
// crumbs() and treeHint() come from ./treemap (the page asks either file).
import type { Prim, Rect } from "../../types";
import { rotCls } from "../rot";
import { sunburstLayout } from "../../../parts/chart-kinds/layout";
import { ringPath, TAU, pt } from "../radial/common";
import { crumbs, treeHint, ROOT_NAME, cut, fmtOf, layoutBudget, nodeData, toneProps } from "./treemap";
import type { KBuilt, KCtx, KindImpl, KMark } from "./common";

export { crumbs, treeHint };
const MAX_SIZE = 460, PAD_ANGLE = 0.012, CORE = 0.26;
const f1 = (n: number): number => Math.round(n * 100) / 100;

/** the bounding box of a ring slice (its corners and a few points along both edges) */
function boxOf(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): Rect {
  const xs: number[] = [], ys: number[] = [];
  const steps = Math.max(2, Math.ceil(((a1 - a0) / TAU) * 48));
  for (let i = 0; i <= steps; i++) for (const r of [r0, r1]) { const [x, y] = pt(cx, cy, r, a0 + ((a1 - a0) * i) / steps); xs.push(x); ys.push(y); }
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: f1(x0), y: f1(y0), w: f1(Math.max(...xs) - x0), h: f1(Math.max(...ys) - y0) };
}
/** is a text box of w by h centred at (x, y) and turned `ang` radians (clockwise, 0 = level) inside the slice (radii r0..r1, angles a0..a1) with a margin of m px? */
// eng-polish: the box may be turned (a word along the ring or along the arc); 5 by 3 points, so a long word's middle is checked too
function sits(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, x: number, y: number, w: number, h: number, m: number, ang = 0): boolean {
  const span = a1 - a0, co = Math.cos(ang), si = Math.sin(ang);
  for (const dy of [-1, 0, 1]) for (const dx of [-1, -0.5, 0, 0.5, 1]) {
    const ox = (dx * w) / 2, oy = (dy * h) / 2;
    const px = x + ox * co - oy * si - cx, py = y + ox * si + oy * co - cy, r = Math.hypot(px, py);
    if (r < r0 + m || r > r1 - m) return false;
    if (span >= TAU - 0.001) continue;
    let d = Math.atan2(px, -py) - a0;
    d = ((d % TAU) + TAU) % TAU;
    if (d > span - m / Math.max(r, 1)) return false;
    if (d < m / Math.max(r, 1)) return false;
  }
  return true;
}

/** eng-polish: where an arc's word goes. A turn of 0 is level; else `turn` is the degrees (clockwise) the word is turned about (x, y). */
export interface ArcWord { text: string; x: number; y: number; turn: number }
const NAME_H = 14, NAME_M = 2;
/** The word of an arc (full angles a0..a1, ring rin..rout), measured by `measure`: the whole name level where it sits inside the slice, else the
 *  whole name along the ring (outward on the right half, inward on the left), else the whole name along the arc, else cut with "…" the roomier way
 *  of the two, else none (the popover and the table have every name). Every word drawn lies wholly on its own arc: the centre, the next ring and the
 *  next arc are never under it (checked by the corners and the edges of the word's box, turned as the word is). */
export function arcWord(name: string, measure: (s: string, font: "small-b") => number, cx: number, cy: number, rin: number, rout: number, a0: number, a1: number): ArcWord | null {
  const mid = (a0 + a1) / 2, rm = (rin + rout) / 2, w = measure(name, "small-b");
  for (const dr of [0, -4, 4, -8, 8]) for (const da of [0, -0.15, 0.15, -0.3, 0.3]) {
    const [qx, qy] = pt(cx, cy, rm + dr, mid + da * (a1 - a0));
    if (sits(cx, cy, rin, rout, a0, a1, qx, qy - 2, w, NAME_H, NAME_M)) return { text: name, x: qx, y: qy + 2, turn: 0 };
  }
  const deg = (mid * 180) / Math.PI, [qx, qy] = pt(cx, cy, rm, mid);
  const wrap = (t: number) => ((((t + 180) % 360) + 360) % 360) - 180;
  const dirs = [
    { tangent: false, turn: wrap(deg > 180 ? deg + 90 : deg - 90), room: rout - rin - 8 },   // along the ring's radius, reads upright
    { tangent: true, turn: wrap(deg > 90 && deg < 270 ? deg + 180 : deg), room: (a1 - a0) * rm - 10 },   // along the arc, reads upright
  ];
  const put = (text: string, turn: number): ArcWord | null => {
    const r = (turn * Math.PI) / 180;
    return sits(cx, cy, rin, rout, a0, a1, qx, qy, measure(text, "small-b"), NAME_H, NAME_M, r) ? { text, x: qx - 4.5 * Math.sin(r), y: qy + 4.5 * Math.cos(r), turn } : null;
  };
  for (const d of dirs) { const r = put(name, d.turn); if (r) return r; }
  // cut with an ellipsis the roomier way first, the other way if that has no room
  for (const d of [...dirs].sort((p, q) => q.room - p.room)) {
    if (d.room <= 0) continue;
    for (let s = name.slice(0, -1); s.length >= 2; s = s.slice(0, -1)) { const r = put(s + "…", d.turn); if (r) return r; }
  }
  return null;
}

export const sunburst: KindImpl = {
  kind: "sunburst",
  // charts2: a ring chart is as tall as it is wide, up to 460 px (never under 240), so no band is left empty above or below it; the width is the
  // room the page measured, so the height is the same at every tap
  height: (_v, w) => Math.round(Math.max(240, Math.min(w, MAX_SIZE))),
  build(v, rect, ctx: KCtx): KBuilt {
    if (v.kind !== "sunburst") throw new Error("sunburst: not a sunburst view");
    const root = v.nodes[ctx.zoom ?? 0] ? ctx.zoom ?? 0 : 0;
    const whole = v.nodes[root];
    const f = fmtOf(v);
    const size = Math.max(40, Math.min(rect.w, rect.h, MAX_SIZE)), cx = f1(rect.x + rect.w / 2), cy = f1(rect.y + rect.h / 2), R = size / 2 - 4;
    const r0 = R * CORE;
    let arcs: ReturnType<typeof sunburstLayout> = [];
    try { arcs = sunburstLayout(v.nodes, root, v.depth, layoutBudget()); } catch { arcs = []; }
    // charts2: the rings share the room by the levels the tree really has under the open node (depth: 3 on a two-level tree left the outer third empty)
    const ring = (R - r0) / Math.max(1, Math.min(v.depth, ...(arcs.length ? [Math.max(...arcs.map((a) => a.ring))] : [v.depth])));
    const prims: Prim[] = [], marks: KMark[] = [];
    for (const a of arcs) {
      const n = v.nodes[a.id], branch = n.children.length > 0;
      const rin = r0 + (a.ring - 1) * ring, rout = r0 + a.ring * ring;
      const p = Math.min(PAD_ANGLE, (a.a1 - a.a0) / 3), a0 = a.a0 + p / 2, a1 = a.a1 - p / 2;
      const t = toneProps(n.tone);
      const mid = (a.a0 + a.a1) / 2, rm = (rin + rout) / 2, chord = (a.a1 - a.a0) * rout;
      const tiny = chord < 24 || rout - rin < 24;
      prims.push({ k: "path", key: `arc:${a.id}`, d: ringPath(cx, cy, rin, rout, a0, a1), role: t.role, fill: "role", width: "thin", cls: `kd-arc ${t.cls} kd-r${Math.min(5, a.ring)}${branch ? " kd-branch" : ""}${tiny ? " kd-tiny" : ""}` });
      if (tiny) continue;
      // eng-polish: the word along the ring, else along the arc, else cut with an ellipsis, else none (arcWord); it lies wholly on its own arc
      const word = arcWord(n.name, ctx.measure as (s: string, font: "small-b") => number, cx, cy, rin, rout, a.a0, a.a1);
      if (word) prims.push({ k: "text", key: `arc:${a.id}:n`, x: f1(word.x), y: f1(word.y), lines: [word.text], font: "small-b", anchor: "middle", ink: "ink", cls: `kd-an${word.turn ? " " + rotCls(word.turn) : ""}` });
      const d = nodeData(v.nodes, a.id, f, whole);
      marks.push({ key: `arc:${a.id}`, kind: "arc", rect: boxOf(cx, cy, rin, rout, a0, a1), title: d.title, meta: d.meta, text: d.text, zoom: branch ? a.id : undefined });
    }
    // the centre: the open node's name and value
    const cr = r0 - 3, room = Math.max(10, 2 * cr - 10);
    prims.push({ k: "dot", key: "core", x: cx, y: cy, r: f1(cr), role: null, cls: "kd-core" });
    const name = cut(ctx.measure, root === 0 ? ROOT_NAME : whole.name, room, "small-b");
    let val = f(whole.value);
    if (ctx.measure(val, "sub") > room) val = fmtOf(v, true)(whole.value);
    if (name) prims.push({ k: "text", key: "core:n", x: cx, y: f1(cy - 2), lines: [name], font: "small-b", anchor: "middle", ink: "ink", cls: "kd-cn" });
    if (ctx.measure(val, "sub") <= room) prims.push({ k: "text", key: "core:v", x: cx, y: f1(cy + 15), lines: [val], font: "sub", anchor: "middle", ink: "muted", cls: "kd-cv" });
    if (root !== 0) {
      const up = whole.parent;
      marks.push({ key: "core", kind: "up", rect: { x: f1(cx - cr), y: f1(cy - cr), w: f1(2 * cr), h: f1(2 * cr) }, title: `Up to ${up === 0 ? ROOT_NAME : v.nodes[up].name}`, zoom: up, skip: true });
    }
    return { prims, marks };
  },
};
