// dots (lane chradial): counted columns, the kind that was the stage's `columns` block (src/core/stage-columns.ts, ported:
// its measured rules stay). One column per category in x, one dot per counted thing, stacked from the bottom. Columns
// keep their places for all of x, so adding columns moves nothing; a column exists once the series has a number for it.
// What the stage's `light` said comes in with ChartCtx: lit (the categories lit in this step: frame in the role colour, new
// dots warm), prev (the counts one step before: dots above them are new), max (the most dots a column holds in any step, so
// the columns' height never changes between steps). One more word, spec.opts:
//   opts.every label every K-th column (default: as often as the labels fit)
import type { ChartDraw, ChartSpec, Prim, Rect } from "../../types";
import { type DrawCtx, optN, cats, key, num, roleOf } from "./common";

const MAX_DOTS = 6000;
/** words cut into at most 2 rows that fit w (the caption above the columns) */
function wrapRows(text: string, w: number, m: DrawCtx["measure"]): string[] {
  const rows: string[] = []; let cur = "";
  for (const wd of text.split(/\s+/).filter(Boolean)) { const t = cur ? cur + " " + wd : wd; if (!cur || m(t, "sub") <= w) cur = t; else { rows.push(cur); cur = wd; } }
  if (cur) rows.push(cur);
  return rows.length > 2 ? [rows[0], rows.slice(1).join(" ")] : rows;
}

function draw(spec: ChartSpec, values: number[][], rect: Rect, ctx: DrawCtx): Prim[] {
  const row = (values[0] ?? []).map((v) => Math.max(0, Math.round(num(v)))), n = Math.max(spec.x.length, row.length), names = cats(spec, n);
  const prev = (ctx.prev?.[0] ?? []).map((v) => Math.max(0, Math.round(num(v)))), lit = new Set(ctx.lit);
  const most = Math.max(1, optN(spec, "max", 0), ...(ctx.max[0] ?? []).map((v) => Math.round(num(v))), ...row), role = spec.series[0]?.role ?? roleOf(0), prims: Prim[] = [];
  // columns: one row of slots on a wide stage; a phone splits them into rows of at most 16 when a column would be under 6 wide
  const perLine = ctx.phone && rect.w / n < 6 ? Math.min(n, 16) : n, lines = Math.ceil(n / perLine);
  // eng-stagebars: the stage's own geometry (core/stage-columns.ts): the caption above, the columns from 2% to 98% of the stage's width, 19.6% of it tall
  const Ws = rect.w + 28, left = ctx.phone ? 0 : Math.max(0, 0.02 * Ws - 14), span = ctx.phone ? rect.w : Math.min(rect.w - left, 0.96 * Ws);
  let capH = 0;
  if (spec.title) { const rows = wrapRows(spec.title, rect.w, ctx.measure); rows.forEach((s, q) => prims.push({ k: "text", key: key("cap", q), x: rect.x, y: rect.y + 12 + 15 * q, lines: [s], font: "sub", anchor: "start", ink: "muted" })); capH = rows.length * 15 + 6; }
  const pitch = span / perLine, gap = Math.max(1.5, pitch * 0.0825), colW = pitch - gap;
  const labelW = Math.max(...names.map((l) => ctx.measure(l, "sub"))) + 6, every = Math.max(1, Math.round(optN(spec, "every", 0))) || [1, 2, 4, 5, 10, 20, 32, 64].find((e) => e * pitch >= labelW) || n;
  // dots across a column: one per 6.2 px of its width (3.6 on a phone), 1 to 6; a phone with one row of columns keeps them at most half full
  const across = Math.max(1, Math.min(6, Math.round(colW / (ctx.phone ? 3.6 : 6.2)))), dp = colW / across, dot = Math.min(dp * (ctx.phone ? 0.8 : 0.76), 7);
  const rowsNeed = Math.ceil(most / across), colH = Math.max(rowsNeed * dp + 6, ctx.phone ? (lines === 1 ? 2 * (rowsNeed * dp + 6) : 0) : 0.196 * Ws);
  const lineH = colH + 20, y0 = ctx.phone ? capH : Math.max(capH, 0.044 * Ws - 8);
  let dots = 0;
  for (let L = 0; L < lines; L++) {
    const a = L * perLine, b = Math.min(n, a + perLine) - 1, top = rect.y + y0 + L * lineH, bottom = top + colH;
    for (let i = a; i <= b; i++) {
      if (i >= row.length) continue;
      const x = rect.x + left + (i - a) * pitch + gap / 2, isLit = lit.has(names[i]), c = row[i], before = prev[i] ?? (isLit ? 0 : c);
      prims.push({ k: "rect", key: key("col", i), rect: { x, y: top, w: colW, h: colH }, fill: "faint", edge: "line", role: null, r: 4, cls: isLit ? "ch-col ch-lit xy-thick" : "ch-col" }); // a lit column's frame is the accent, thick (css.ts .ch-lit)
      for (let d = 0; d < c && ++dots < MAX_DOTS; d++) {
        const dx = x + (d % across) * dp + dp / 2 + 0.4, dy = bottom - 3 - Math.floor(d / across) * dp - dp / 2;
        // a lit column warms only the dots that came since the step before; a dot already there keeps its colour
        prims.push({ k: "dot", key: key("dot", i, d), x: dx, y: dy, r: dot / 2, role, tone: isLit && d >= before ? "warn" : null, ...(isLit && d >= before ? { cls: "ch-warm" } : {}) });
      }
      if (i % every === 0 || (isLit && ctx.measure(names[i], "sub") <= pitch * every)) prims.push({ k: "text", key: key("lab", i), x: x + colW / 2, y: bottom + 14, lines: [names[i]], font: "sub", anchor: "middle", ink: isLit ? "role" : "muted", role: isLit ? role : null });
    }
  }
  return prims;
}

export const DOTS: ChartDraw = {
  kind: "dots", draw,
  llm: (spec, values) => {
    const row = (values[0] ?? []).map((v) => num(v)), names = cats(spec, row.length), tot = row.reduce((a, b) => a + b, 0), unit = spec.unit ? ` ${spec.unit}` : "";
    const lit: string[] = [];
    return [`Dots${spec.title ? `: ${spec.title}` : ""}${spec.unit ? ` (one dot per ${spec.unit.replace(/s$/, "")})` : ""}: ${row.length} columns, ${tot}${unit} in all${row.length ? ` (${Math.min(...row)} to ${Math.max(...row)} a column)` : ""}: ${names.map((nm, i) => `${nm} ${row[i]}`).join(", ")}.`];
  },
};
