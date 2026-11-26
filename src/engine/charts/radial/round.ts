// pie, doughnut, polar (lane chradial): our own SVG. A slice is one path with the same commands whatever its angle
// (common.ringPath), keyed by its category, so a slice that grows or shrinks glides; the legend and the labels keep
// their keys too. More than one series draws one ring per series (pie and doughnut), the first series in the middle.
import type { ChartDraw, ChartKind, ChartSpec, Prim, Rect } from "../../types";
import { type DrawCtx, optN, TAU, cats, circlePath, fmtNum, key, legend, legendCols, niceTicks, num, pt, ringPath, roleOf, tickText, wholeShares } from "./common";

const PAD = 8, PITCH = 20;
/** where the circle and its key go inside the rect: side by side when wide, the key below when not */
function frame(r: Rect, labels: string[], ctx: DrawCtx): { cx: number; cy: number; R: number; key: Rect; cols: number } {
  const side = r.w >= 380 && r.w >= 1.3 * r.h;
  if (side) {
    const D = Math.max(60, Math.min(r.h - 2 * PAD, r.w * 0.5 - PAD)), lh = labels.length * PITCH, kw = r.w - D - 4 * PAD;
    return { cx: r.x + PAD + D / 2, cy: r.y + r.h / 2, R: D / 2, key: { x: r.x + D + 3 * PAD, y: r.y + Math.max(PAD, (r.h - lh) / 2), w: kw, h: lh }, cols: 1 };
  }
  const cols = legendCols(labels, r.w - 2 * PAD, ctx, 2), lh = Math.ceil(labels.length / cols) * PITCH;
  const D = Math.max(60, Math.min(r.w - 2 * PAD, r.h - lh - 3 * PAD));
  return { cx: r.x + r.w / 2, cy: r.y + PAD + D / 2, R: D / 2, key: { x: r.x + PAD, y: r.y + 2 * PAD + D, w: r.w - 2 * PAD, h: lh }, cols };
}

function drawRound(kind: "pie" | "doughnut", spec: ChartSpec, values: number[][], rect: Rect, ctx: DrawCtx): Prim[] {
  const rows = values.length ? values : [[]], n = Math.max(...rows.map((v) => v.length), spec.x.length), names = cats(spec, n);
  const vs = (rows[0] ?? []).map((v) => Math.max(0, num(v))), total = vs.reduce((a, b) => a + b, 0);
  const sh0 = wholeShares(names.map((_, i) => vs[i] ?? 0)); // charts2: the shares add up to 100%
  const labels = names.map((nm, i) => `${nm}  ${fmtNum(spec, num(rows[0]?.[i]), ctx)}${total > 0 ? ` (${sh0[i]}%)` : ""}`);
  const f = frame(rect, labels, ctx), prims: Prim[] = [];
  const hole = kind === "doughnut" ? 0.55 : 0, rings = rows.length, inner = f.R * hole, band = (f.R - inner) / rings;
  rows.forEach((row, s) => {
    const sv = names.map((_, i) => Math.max(0, num(row[i]))), st = sv.reduce((a, b) => a + b, 0), sh = wholeShares(sv);
    let a = 0;
    sv.forEach((v, i) => {
      const sweep = st > 0 ? (v / st) * TAU : 0, a0 = a, a1 = a + sweep; a = a1;
      const r0 = inner + band * s, r1 = r0 + band;
      prims.push({ k: "path", key: key("slice", s, i), d: ringPath(f.cx, f.cy, r0, r1, a0, a1), role: roleOf(i), fill: "role", cls: "ch-slice" });
      const rm = (r0 + r1) / 2, [lx, ly] = pt(f.cx, f.cy, rm, (a0 + a1) / 2), txt = `${st > 0 ? sh[i] : 0}%`;
      // a percentage sits in its slice only when it fits there; the key always carries it
      if (st > 0 && v > 0 && sweep * rm >= ctx.measure(txt, "sub") + 6 && band >= 16) prims.push({ k: "text", key: key("pct", s, i), x: lx, y: ly + 4, lines: [txt], font: "sub", anchor: "middle", ink: "ink" });
    });
  });
  prims.push(...legend(names.map((id, i) => ({ id: String(i), label: labels[i], role: roleOf(i) })), f.key, f.cols, ctx, PITCH).prims);
  return prims;
}

function drawPolar(spec: ChartSpec, values: number[][], rect: Rect, ctx: DrawCtx): Prim[] {
  const row = values[0] ?? [], n = Math.max(row.length, spec.x.length), names = cats(spec, n);
  const vs = names.map((_, i) => Math.max(0, num(row[i]))), hi = Math.max(optN(spec, "max", 0), ...vs, ...ctx.max.flat(), 1e-9), ticks = niceTicks(0, hi, 4), top = ticks[ticks.length - 1];
  const labels = names.map((nm, i) => `${nm}  ${fmtNum(spec, vs[i], ctx)}`), f = frame(rect, labels, ctx), prims: Prim[] = [];
  // rings first (behind), then the wedges, then the numbers on the first spoke
  ticks.slice(1).forEach((t, i) => prims.push({ k: "path", key: key("ring", i), d: circlePath(f.cx, f.cy, (t / top) * f.R), role: null, width: "thin", fill: "none", cls: "ch-grid" }));
  for (let i = 0; i < n; i++) { const [x, y] = pt(f.cx, f.cy, f.R, (i / n) * TAU); prims.push({ k: "path", key: key("spoke", i), d: `M${f.cx} ${f.cy}L${x} ${y}`, role: null, width: "thin", fill: "none", cls: "ch-grid" }); }
  names.forEach((_, i) => {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, r1 = (vs[i] / top) * f.R;
    prims.push({ k: "path", key: key("slice", 0, i), d: ringPath(f.cx, f.cy, 0, r1, a0, a1), role: roleOf(i), fill: "role", cls: "ch-slice" });
  });
  ticks.slice(1).forEach((t, i) => prims.push({ k: "text", key: key("tick", i), x: f.cx + 3, y: f.cy - (t / top) * f.R + 12, lines: [tickText(spec, t, ctx)], font: "sub", anchor: "start", ink: "muted", cls: "ch-halo" }));
  prims.push(...legend(names.map((id, i) => ({ id: String(i), label: labels[i], role: roleOf(i) })), f.key, f.cols, ctx, PITCH).prims);
  return prims;
}


const llmRound = (name: string) => (spec: ChartSpec, values: number[][]): string[] => {
  const row = values[0] ?? [], names = cats(spec, row.length), t = row.reduce((a, b) => a + Math.max(0, num(b)), 0), sh = wholeShares(names.map((_, i) => num(row[i]))); // charts2
  return [`${name}${spec.title ? `: ${spec.title}` : ""}${spec.unit ? ` (${spec.unit})` : ""}: ${names.map((nm, i) => `${nm} ${num(row[i])}${name === "Polar area" || !(t > 0) ? "" : ` (${sh[i]}%)`}`).join(", ")}.`];
};
const round = (kind: ChartKind, name: string, draw: ChartDraw["draw"]): ChartDraw => ({ kind, draw, llm: llmRound(name) });
export const ROUND: ChartDraw[] = [
  round("pie", "Pie", (s, v, r, c) => drawRound("pie", s, v, r, c)),
  round("doughnut", "Doughnut", (s, v, r, c) => drawRound("doughnut", s, v, r, c)),
  round("polar", "Polar area", (s, v, r, c) => drawPolar(s, v, r, c)),
];
