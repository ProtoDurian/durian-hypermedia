// radar (lane chradial): the x list names the axes (at least three), each series is one outline. The scale starts at 0 (or
// `min`), tops at a round number (or `max`), and has up to four rings. A series outline is one path with the same
// commands whatever its numbers, and each point a dot with its own key, so a change glides.
import type { ChartDraw, ChartSpec, Prim, Rect } from "../../types";
import { type DrawCtx, optN, TAU, cats, key, legend, legendCols, niceTicks, num, polyPath, pt, roleOf, tickText } from "./common";

const PAD = 8, PITCH = 20, LH = 14;
/** an axis name on at most two lines (cut at spaces), each no wider than `w` */
function lines(name: string, w: number, ctx: DrawCtx): string[] {
  if (ctx.measure(name, "sub") <= w) return [name];
  const out: string[] = []; let cur = "";
  for (const word of name.split(" ")) { if (cur && ctx.measure(`${cur} ${word}`, "sub") > w) { out.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word; }
  if (cur) out.push(cur);
  return out.length > 2 ? [out[0], out.slice(1).join(" ")] : out;
}

function draw(spec: ChartSpec, values: number[][], rect: Rect, ctx: DrawCtx): Prim[] {
  const n = Math.max(3, spec.x.length, ...values.map((v) => v.length)), names = cats(spec, n), rows = values.length ? values : [[]];
  const all = rows.flat().map((v) => num(v)), lo = Math.min(optN(spec, "min", 0), ...all), top0 = Math.max(optN(spec, "max", -Infinity), ...all, ...ctx.max.flat(), lo + 1e-9);
  const ticks = niceTicks(lo, top0, 4), hiT = ticks[ticks.length - 1], span = hiT - lo || 1;
  const prims: Prim[] = [], many = rows.length > 1;
  const keyH = many ? Math.ceil(rows.length / legendCols(rows.map((_, s) => spec.series[s]?.name ?? `series ${s + 1}`), rect.w - 2 * PAD, ctx, 3)) * PITCH + PAD : 0;
  // room for the axis names round the outline: as wide as the widest name (at most a third of the width), two lines tall
  const maxLabel = Math.min(rect.w / 3, Math.max(...names.map((nm) => ctx.measure(nm, "sub"))));
  const lw = lines(names.reduce((a, b) => (ctx.measure(b, "sub") > ctx.measure(a, "sub") ? b : a), ""), maxLabel, ctx);
  const ph = (lw.length - 1) * LH, R = Math.max(40, Math.min(rect.w / 2 - PAD - maxLabel - 6, (rect.h - keyH) / 2 - PAD - LH - ph - 4));
  const cx = rect.x + rect.w / 2, cy = rect.y + PAD + LH + ph + R, ang = (i: number) => (i / n) * TAU, at = (v: number, i: number) => pt(cx, cy, ((v - lo) / span) * R, ang(i));
  // rings and spokes
  ticks.slice(1).forEach((t, i) => prims.push({ k: "path", key: key("ring", i), d: polyPath(Array.from({ length: n }, (_, i) => pt(cx, cy, ((t - lo) / span) * R, ang(i)))), role: null, width: "thin", fill: "none", cls: "ch-grid" }));
  for (let i = 0; i < n; i++) { const [x, y] = pt(cx, cy, R, ang(i)); prims.push({ k: "path", key: key("spoke", i), d: `M${cx} ${cy}L${x} ${y}`, role: null, width: "thin", fill: "none", cls: "ch-grid" }); }
  // axis names
  names.forEach((nm, i) => {
    const [x, y] = pt(cx, cy, R + 8, ang(i)), s = Math.sin(ang(i)), c = Math.cos(ang(i)), ls = lines(nm, maxLabel, ctx);
    const anchor = s > 0.3 ? "start" : s < -0.3 ? "end" : "middle", dy = c > 0.5 ? -(ls.length - 1) * LH : c < -0.5 ? LH - 2 : -((ls.length - 1) * LH) / 2 + 4;
    prims.push({ k: "text", key: key("axis", i), x, y: y + dy, lines: ls, font: "sub", anchor, ink: "ink" });
  });
  // one outline and its points per series
  rows.forEach((row, s) => {
    const role = spec.series[s]?.role ?? roleOf(s), ps = names.map((_, i) => at(num(row[i], lo), i));
    prims.push({ k: "path", key: key("area", s), d: polyPath(ps), role, fill: "soft", cls: "ch-area" });
    ps.forEach((p, i) => prims.push({ k: "dot", key: key("pt", s, i), x: p[0], y: p[1], r: 3.5, role }));
  });
  // charts2: the ring numbers sit half way between the first two spokes, on the ring's edge, drawn over the outlines (a point is on a
  // spoke, so a number on the first spoke hid under it)
  const half = Math.PI / n;
  ticks.slice(1).forEach((t, i) => { const [x, y] = pt(cx, cy, ((t - lo) / span) * R * Math.cos(half), half); prims.push({ k: "text", key: key("tick", i), x: x + 2, y: y + 4, lines: [tickText(spec, t, ctx)], font: "sub", anchor: "start", ink: "muted", cls: "ch-halo" }); });
  if (many) prims.push(...legend(rows.map((_, s) => ({ id: String(s), label: spec.series[s]?.name ?? `series ${s + 1}`, role: spec.series[s]?.role ?? roleOf(s) })), { x: rect.x + PAD, y: cy + R + 2 * LH + 10, w: rect.w - 2 * PAD, h: keyH }, legendCols(rows.map((_, s) => spec.series[s]?.name ?? `series ${s + 1}`), rect.w - 2 * PAD, ctx, 3), ctx, PITCH).prims);
  return prims;
}

export const RADAR: ChartDraw = {
  kind: "radar", draw,
  llm: (spec, values) => {
    const n = Math.max(spec.x.length, ...values.map((v) => v.length)), names = cats(spec, n);
    return [`Radar${spec.title ? `: ${spec.title}` : ""}, ${n} axes (${names.join(", ")}).`, ...values.map((row, s) => `${spec.series[s]?.name ?? `Series ${s + 1}`}: ${names.map((nm, i) => `${nm} ${num(row[i])}`).join(", ")}.`)];
  },
};
