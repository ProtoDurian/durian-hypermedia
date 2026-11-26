// calendar heatmap as primitives (lane chwire, sub-lane B). Contract: ./common.ts KindImpl.
// A cell is a `rect` keyed `day:<date>` (a week a column, a weekday a row), its tone ramp a class `kd-c0..kd-c19` (the old part's
// colour mix of the tone into the page's low colour, in 20 steps; a day without data is dashed and empty). Month words sit on
// the first column of each month (`month:<yyyy-mm>`), weekday words at the left (`wd:<n>`, every second row), and the key
// (low value, a ramp of 10 cells, high value) under the last weeks (`key:*`).
//
// Width: a calendar never scrolls sideways. When the weeks do not fit in the room at full size, the year wraps into strips (the way
// a paragraph wraps lines): each strip is a run of whole weeks with its own weekday words at the left and its own month words on top,
// the cells shrink a little before a new strip is added (a cell is never under 15 px on a phone, 19 px elsewhere), and the key
// sits under the last strip. A day keeps its key whatever the strip it is in, so days glide when the room changes.
import type { Prim, Rect } from "../../types";
import { toneProps, fmtOf } from "./treemap";
import type { KBuilt, KCtx, KindImpl, KMark } from "./common";
import type { Day, View } from "../../../parts/chart-kinds/compute";

type Cal = Extract<View, { kind: "calendar" }>;
const CELL = 24, GAP = 3, STEP = CELL + GAP, HEAD = 22, LEFT = 34, KEY_H = 26, RAMP_N = 10, RAMP_W = 120, LEVELS = 20;
const SGAP = 6;
// charts2: on a wide room the cells grow with it (the step is at most MAX_STEP: cell 41 px) and the grid sits in the middle of what is left over
const MAX_STEP = 44;
/** the strips of a calendar in a room of w px: how many, the weeks in each, the step (cell + gap) and the height of one */
export function stripsOf(cols: number, w: number, phone: boolean): { n: number; per: number; step: number; cell: number; h: number } {
  const avail = Math.max(STEP, w - LEFT), min = phone ? 18 : 22;
  const grow = Math.max(STEP, MAX_STEP);
  let n = 1, per = cols, step = Math.min(grow, Math.floor(avail / Math.max(1, per)));
  while (step < min && n < cols) { n++; per = Math.ceil(cols / n); step = Math.min(grow, Math.floor(avail / per)); }
  step = Math.max(step, 8);
  return { n, per, step, cell: step - GAP, h: HEAD + 7 * step };
}
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayName = (d: Day): string => `${DAY_NAMES[new Date(d.day * 86400000).getUTCDay()]} ${d.date}`;
const f1 = (n: number): number => Math.round(n * 100) / 100;
/** the colour step (0..19) of a value between lo and hi */
const level = (x: number, lo: number, hi: number): number => Math.min(LEVELS - 1, Math.max(0, Math.round(((x - lo) / (hi - lo || 1)) * (LEVELS - 1))));

export const calendar: KindImpl = {
  kind: "calendar",
  height: (v, w) => { if (v.kind !== "calendar") return 0; const s = stripsOf(v.cols, w, w < 480); return s.n * s.h + (s.n - 1) * SGAP + KEY_H; },
  width: () => null,
  build(v, rect, ctx: KCtx): KBuilt {
    if (v.kind !== "calendar") throw new Error("calendar: not a calendar view");
    const f = fmtOf(v), fc = fmtOf(v, ctx.phone);
    const t = toneProps(v.tone);
    const lastData = v.days.reduce((a, d, i) => (d.value !== null ? i : a), v.days.length - 1);
    const at = Math.max(0, Math.min(v.days.length - 1, ctx.at ?? lastData));
    const s = stripsOf(v.cols, rect.w, ctx.phone);
    // charts2: the grid is centred in the room (a calendar that cannot grow past MAX_STEP leaves the same room on both sides)
    const ox = Math.max(0, Math.floor((rect.w - LEFT - s.per * s.step + GAP) / 2)), X = rect.x + ox, x0 = X + LEFT, top = (i: number) => rect.y + i * (s.h + SGAP);
    const stripOf = (col: number) => Math.min(s.n - 1, Math.floor(col / s.per));
    const colX = (col: number) => f1(x0 + (col - stripOf(col) * s.per) * s.step);
    const prims: Prim[] = [], marks: KMark[] = [];
    // weekday words (at the left of every strip)
    const names = v.week === "mon" ? WD : [WD[6], ...WD.slice(0, 6)];
    for (let k = 0; k < s.n; k++) names.forEach((nm, i) => { if (i % 2 === 0) prims.push({ k: "text", key: k === 0 ? `wd:${i}` : `wd:${k}:${i}`, x: X, y: f1(top(k) + HEAD + i * s.step + s.step / 2 + 4), lines: [nm], font: "sub", anchor: "start", ink: "muted", cls: "kd-wd" }); });
    // month words: on the first column of the month, never over the one before it (in its strip)
    let edge = -Infinity, edgeStrip = -1;
    for (const m of v.months) {
      const k = stripOf(m.col), x = colX(m.col), w = ctx.measure(m.label, "sub");
      if (k !== edgeStrip) edge = -Infinity;
      if (x < edge + 6 && edge !== -Infinity) continue;
      if (x + w > rect.x + rect.w) continue; // charts2: the room's right edge
      prims.push({ k: "text", key: `month:${m.ym}`, x, y: f1(top(k) + 15), lines: [m.label], font: "sub", anchor: "start", ink: "muted", cls: "kd-month" });
      edge = x + w; edgeStrip = k;
    }
    // the days
    v.days.forEach((d, i) => {
      const k = stripOf(d.col);
      const r: Rect = { x: colX(d.col), y: f1(top(k) + HEAD + d.row * s.step), w: s.cell, h: s.cell };
      prims.push({ k: "rect", key: `day:${d.date}`, rect: r, fill: d.value === null ? "none" : "role", role: t.role, tone: t.tone, edge: "line", r: s.cell < 20 ? 4 : s.cell < 32 ? 6 : 8,
        cls: `kd-day ${t.cls}${d.value === null ? " kd-empty" : ` kd-c${level(d.value, v.lo, v.hi)}`}${i === at ? " kd-at" : ""}` });
      marks.push({ key: `day:${d.date}`, kind: "day", rect: r, title: dayName(d), meta: d.value === null ? "No data" : `${v.yLabel}: ${f(d.value)}` });
    });
    // the key under the last strip: low value, a ramp, high value
    const hi = fc(v.hi), lo = fc(v.lo), hw = ctx.measure(hi, "sub"), lw = ctx.measure(lo, "sub"), keyW = lw + 8 + RAMP_W + 8 + hw;
    const lastCols = v.cols - (s.n - 1) * s.per, end = Math.max(x0 + Math.max(lastCols, s.n > 1 ? s.per : lastCols) * s.step - GAP, X + keyW), ky = top(s.n - 1) + HEAD + 7 * s.step + 6;
    const rx = end - hw - 8 - RAMP_W;
    prims.push({ k: "text", key: "key:hi", x: f1(end), y: f1(ky + 14), lines: [hi], font: "sub", anchor: "end", ink: "muted", cls: "kd-keyt" });
    for (let i = 0; i < RAMP_N; i++) prims.push({ k: "rect", key: `key:${i}`, rect: { x: f1(rx + (i * RAMP_W) / RAMP_N), y: f1(ky + 3), w: f1(RAMP_W / RAMP_N + (i < RAMP_N - 1 ? 0.5 : 0)), h: 10 }, fill: "role", role: t.role, tone: t.tone, edge: "none", r: 0,
      cls: `kd-key ${t.cls} kd-c${Math.round((i / (RAMP_N - 1)) * (LEVELS - 1))}` });
    prims.push({ k: "text", key: "key:lo", x: f1(rx - 8), y: f1(ky + 14), lines: [lo], font: "sub", anchor: "end", ink: "muted", cls: "kd-keyt" });
    return { prims, marks };
  },
};
