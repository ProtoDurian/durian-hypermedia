// fmt12: the room a chart thing needs when a layout places it as one of its members (a `[chart dots]` at the top of a graph
// scene, DESIGN example G). Without it the graph layout gave a chart a card's size (about 160 x 60), and the chart drew far
// outside it: columns spilled below the stage and month names ran together. A chart takes the width its parent can give;
// its height is what its drawing reaches at that width (kinds that size themselves: dots, units, spans), or a chart's
// usual height for kinds that fill any box they are given (bar, line, pie ...).
import type { ChartCtx, LayoutCtx, LayoutInput, Prim, Thing } from "../types";
import { CHART } from "../charts";

const num = (v: string[]) => v.map((x) => Number(String(x).replace(/,/g, "")) || 0);
/** the largest number of each series and category over the story (the chart's size never changes between steps) */
function most(input: LayoutInput, t: Thing): number[][] {
  const spec = t.chart!;
  const at = (k: number) => spec.series.map((ser, s) => { const st = input.states[k]?.things[t.id]; const w = s === 0 ? st?.values : st?.series?.[s]; return w ? num(w) : ser.values; });
  const rows = input.states.length ? input.states.map((_, k) => at(k)) : [spec.series.map((s) => s.values)];
  return rows[0].map((row, s) => Array.from({ length: Math.max(row.length, ...rows.map((r) => r[s]?.length ?? 0)) }, (_, j) => Math.max(0, ...rows.map((r) => r[s]?.[j] ?? 0))));
}
/** how far down a drawing reaches (text baselines plus their descent) */
function bottom(prims: Prim[]): number {
  let b = 0;
  for (const p of prims) {
    if (p.k === "rect" || p.k === "box") b = Math.max(b, p.rect.y + p.rect.h);
    else if (p.k === "dot") b = Math.max(b, p.y + p.r);
    else if (p.k === "text") b = Math.max(b, p.y + 5 + 15 * (p.lines.length - 1));
    else if (p.k === "chip") b = Math.max(b, p.y + 12);
  }
  return b;
}

export function chartRoom(input: LayoutInput, ctx: LayoutCtx, t: Thing): [number, number] {
  const spec = t.chart!, draw = CHART[spec.kind];
  const w = Math.max(160, Math.round((input.avail ?? ctx.width) - 32)); // the stage keeps 16 px on each side
  const usual = ctx.phone ? 240 : Math.min(340, Math.max(200, Math.round(w * 0.42)));
  if (!draw) return [w, usual];
  const max = most(input, t);
  const cctx: ChartCtx = { phone: ctx.phone, look: ctx.look, measure: ctx.measure, step: 0, prev: null, max, lit: [] };
  try {
    const a = bottom(draw.draw(spec, max, { x: 0, y: 0, w, h: 600 }, cctx)), b = bottom(draw.draw(spec, max, { x: 0, y: 0, w, h: 1200 }, cctx));
    return Math.abs(a - b) < 1 && a > 0 ? [w, Math.ceil(a + 6)] : [w, usual]; // the same at two heights: it sizes itself
  } catch { return [w, usual]; }
}
