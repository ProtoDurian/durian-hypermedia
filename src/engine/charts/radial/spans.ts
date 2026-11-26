// spans (lane chradial): time rows as bars, the chart kind of the stage's time rows. One row per name in x; the first
// series holds each row's start, the second its end (a single series: each value is how long the row runs, from 0). A row
// whose start and end are the same is a marker (a dot). The axis runs from opts.min (default: the earliest start, or 0)
// to a round number at or above the latest end (or opts.max); opts.unit is written after the axis numbers.
import type { ChartDraw, ChartSpec, Prim, Rect } from "../../types";
import { type DrawCtx, optN, cats, key, niceTicks, num, roleOf, tickText } from "./common";

const ROW = 26, AXIS = 22;
function bounds(spec: ChartSpec, values: number[][], n: number): { s: number[]; e: number[] } {
  const a = values[0] ?? [], b = values[1];
  const s = Array.from({ length: n }, (_, i) => (b ? num(a[i]) : 0)), e = Array.from({ length: n }, (_, i) => (b ? num(b[i], num(a[i])) : num(a[i])));
  return { s: s.map((v, i) => Math.min(v, e[i])), e: e.map((v, i) => Math.max(v, s[i])) };
}
function draw(spec: ChartSpec, values: number[][], rect: Rect, ctx: DrawCtx): Prim[] {
  const n = Math.max(spec.x.length, ...values.map((v) => v.length)), names = cats(spec, n), { s, e } = bounds(spec, values, n), prims: Prim[] = [];
  const lo = Math.min(optN(spec, "min", Infinity), ...(s.length ? s : [0])), lo0 = Number.isFinite(lo) ? lo : 0;
  const ticks = niceTicks(lo0, Math.max(optN(spec, "max", -Infinity), ...e, lo0 + 1e-9), 5), hi = ticks[ticks.length - 1], t0 = ticks[0], span = hi - t0 || 1;
  const labelW = Math.min(rect.w * 0.35, Math.max(...names.map((nm) => ctx.measure(nm, "sub"))) + 8), x0 = rect.x + labelW, w = rect.w - labelW - 14;
  const rowH = Math.min(ROW, (rect.h - AXIS) / Math.max(1, n)), unit = spec.opts.unit ?? spec.unit ?? "";
  const X = (v: number) => x0 + ((v - t0) / span) * w;
  const bottom = rect.y + n * rowH;
  ticks.forEach((t, i) => {
    prims.push({ k: "path", key: key("grid", i), d: `M${X(t)} ${rect.y}L${X(t)} ${bottom}`, role: null, width: "thin", fill: "none", cls: "ch-grid" });
    const last = i === ticks.length - 1;
    prims.push({ k: "text", key: key("tick", i), x: X(t), y: bottom + 15, lines: [tickText(spec, t, ctx) + (last && unit ? ` ${unit}` : "")], font: "sub", anchor: last && unit ? "end" : "middle", ink: "muted" });
  });
  names.forEach((nm, i) => {
    const y = rect.y + i * rowH, role = spec.series[0]?.role ?? roleOf(i), mid = y + rowH / 2;
    prims.push({ k: "text", key: key("row", i), x: rect.x, y: mid + 4, lines: [ctx.measure(nm, "sub") > labelW - 8 ? nm.slice(0, Math.max(1, Math.floor(nm.length * (labelW - 8) / ctx.measure(nm, "sub")) - 1)) + "..." : nm], font: "sub", anchor: "start", ink: "ink" });
    if (e[i] - s[i] < 1e-9) prims.push({ k: "dot", key: key("span", i), x: X(s[i]), y: mid, r: 5, role });
    else prims.push({ k: "rect", key: key("span", i), rect: { x: X(s[i]), y: y + rowH * 0.2, w: Math.max(2, X(e[i]) - X(s[i])), h: rowH * 0.6 }, fill: "role", edge: "role", role, r: 4, cls: "ch-span" });
  });
  return prims;
}
export const SPANS: ChartDraw = {
  kind: "spans", draw,
  llm: (spec, values) => {
    const n = Math.max(spec.x.length, ...values.map((v) => v.length)), names = cats(spec, n), { s, e } = bounds(spec, values, n), u = spec.opts.unit ?? spec.unit ?? "";
    return [`Spans${spec.title ? `: ${spec.title}` : ""}: ${names.map((nm, i) => (e[i] === s[i] ? `${nm} at ${s[i]}${u}` : `${nm} ${s[i]} to ${e[i]}${u}`)).join(", ")}.`];
  },
};
