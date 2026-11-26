// units (lane chradial): counted units, a waffle (src/core/stage-units.ts, ported: its measured rules stay). Each square
// stands for exactly one item, the unassigned remainder included, so the total can be counted directly.
// The spec: x names the groups (kept, added, removed ...), each series is one row of counts, opts.total the squares in a row
// (default: the counts' sum). One series draws a grid with a key under it; more than one draws a panel: a row of squares per
// series, in the series' role, with a badge (opts.badges, comma list; default the series name's first letter). A group
// named "leaving" has a thick edge, "gone" is faint, the remainder is muted.
import type { ChartDraw, ChartSpec, Prim, Rect, Tone } from "../../types";
import { type DrawCtx, optN, cats, key, num, roleOf } from "./common";

const TONE: Record<string, Tone> = { kept: "good", added: "accent", removed: "bad" };
type Cell = { group: string; tone: Tone | null; role: string | null; lit: boolean; dim: boolean };

function draw(spec: ChartSpec, values: number[][], rect: Rect, ctx: DrawCtx): Prim[] {
  const rows = values.length ? values : [[]], n = Math.max(spec.x.length, ...rows.map((v) => v.length)), names = cats(spec, n), prims: Prim[] = [];
  const panel = rows.length > 1, totalOpt = Math.round(optN(spec, "total", 0)), badges = (spec.opts.badges ?? "").split(",").map((s) => s.trim());
  const totals = rows.map((r) => Math.max(totalOpt, r.reduce((a, b) => a + Math.max(0, Math.round(num(b))), 0)));
  // the cells of a row, group by group, then the remainder
  const cellsOf = (r: number[], total: number, s: number): Cell[] => {
    const out: Cell[] = [];
    names.forEach((g, j) => { for (let k = 0; k < Math.max(0, Math.round(num(r[j]))) && out.length < total; k++) out.push({ group: g, tone: panel ? null : TONE[g] ?? null, role: panel ? spec.series[s]?.role ?? roleOf(s) : TONE[g] ? null : roleOf(j), lit: g === "leaving", dim: g === "gone" }); });
    while (out.length < total) out.push({ group: "remaining", tone: null, role: null, lit: false, dim: true });
    return out;
  };
  // eng-stagebars: a unit is a small square (the stage's: soft fill, line edge, radius 2), not a card box (a box primitive rounds to a circle at this size)
  const cellPrim = (id: string, c: Cell, x: number, y: number, w: number, h: number, r = 2): Prim => ({ k: "rect", key: id, rect: { x, y, w, h }, fill: c.dim ? "band" : "soft", role: c.dim ? null : c.role, tone: c.dim ? null : c.tone, edge: c.dim ? "line" : c.tone || c.role ? "role" : "line", r, cls: c.lit ? "ch-unit xy-thick" : c.dim ? "ch-unit stg-box ps-scn-faint-edge" : "ch-unit" }); // eng-polish: a remaining (or gone) unit is the stage's: surface-2 fill, the faint edge at full strength, no role colour
  const legendRows = (y: number, groups: string[], column = false): number => {
    let x = rect.x + 4, yy = y;
    for (const g of groups) {
      const w = ctx.measure(`${g} ${totalOf(g)}`, "sub") + 34;
      if (column ? x > rect.x + 4 : x + w > rect.x + rect.w && x > rect.x + 4) { x = rect.x + 4; yy += 18; } // eng-polish: column = one group per row (the stage's key)
      const c = cellsFor(g);
      prims.push({ ...cellPrim(key("keyc", g), c, x, yy + 1, 12, 12) }, { k: "text", key: key("keyt", g), x: x + 18, y: yy + 11, lines: [`${g} ${totalOf(g)}`], font: "sub", anchor: "start", ink: "ink" });
      x += w;
    }
    return yy + 18 - y;
  };
  const sums = (g: string) => rows.reduce((a, r) => a + Math.max(0, Math.round(num(r[names.indexOf(g)]))), 0);
  const totalOf = (g: string) => (g === "remaining" ? totals.reduce((a, b) => a + b, 0) - names.reduce((a, g2) => a + sums(g2), 0) : sums(g));
  const cellsFor = (g: string): Cell => ({ group: g, tone: !panel ? TONE[g] ?? null : null, role: panel ? spec.series[0]?.role ?? roleOf(0) : TONE[g] ? null : roleOf(Math.max(0, names.indexOf(g))), lit: g === "leaving", dim: g === "gone" || g === "remaining" });
  const groupsShown = [...names.filter((g) => sums(g) > 0), ...(totalOf("remaining") > 0 ? ["remaining"] : [])];

  if (!panel) {
    const total = totals[0], cells = cellsOf(rows[0] ?? [], total, 0);
    // squares: as the stage had them, 32 across at most, a power of two near the square root of twice the total, 18 px apart
    const heading = `${total} units`, hh = 22, keyH = legendRowsHeight(groupsShown, ctx, rect.w, true) + 6;
    let cols = Math.max(1, Math.min(32, 2 ** Math.ceil(Math.log2(Math.sqrt(total * 2))), Math.floor((rect.w - 8) / 18)));
    const rowsN = () => Math.ceil(total / cols);
    let pitch = Math.min(18, (rect.w - 8) / cols);
    // too tall for the rect: more squares across, then smaller ones
    while (rowsN() * pitch + hh + keyH > rect.h && cols < Math.floor((rect.w - 8) / 6)) { cols++; pitch = Math.min(18, (rect.w - 8) / cols); }
    pitch = Math.max(6, Math.min(pitch, (rect.h - hh - keyH) / rowsN()));
    const size = Math.max(4, pitch * 0.78);
    prims.push({ k: "text", key: "units:total", x: rect.x + 4, y: rect.y + 15, lines: [heading], font: "lane", anchor: "start", ink: "ink" });
    cells.forEach((c, i) => prims.push(cellPrim(key("u", i), c, rect.x + 4 + (i % cols) * pitch, rect.y + hh + Math.floor(i / cols) * pitch, size, size)));
    legendRows(rect.y + hh + rowsN() * pitch + 8, groupsShown, true);
    return prims;
  }
  // a panel: one row of upright squares per series on a wide stage, small ones on a phone
  let y = rect.y;
  rows.forEach((r, s) => {
    const total = totals[s], wide = !ctx.phone || total * 14 <= rect.w - 34, fit = Math.max(1, Math.floor((rect.w - 34) / 11));
    const cols = wide ? Math.max(1, Math.min(40, total, Math.floor((rect.w - 34) / (ctx.phone ? 14 : 4)))) : Math.max(1, Math.ceil(total / Math.ceil(total / Math.min(40, fit))));
    const pitch = Math.min(wide ? 20 : 13, (rect.w - 34) / cols), size = Math.max(2, Math.min(wide ? 17 : 9, wide ? pitch * 0.85 : pitch - 2)), tall = wide ? Math.round(size * 1.35) : size, rowPitch = wide ? Math.max(12, tall + 5) : tall + 3;
    const role = spec.series[s]?.role ?? roleOf(s), badge = (badges[s] || spec.series[s]?.name || String(s + 1))[0];
    prims.push({ k: "chip", key: key("badge", s), x: rect.x + 12, y: y + tall / 2, words: badge, role });
    cellsOf(r, total, s).forEach((c, i) => prims.push(cellPrim(key("u", s, i), c, rect.x + 30 + (i % cols) * pitch, y + Math.floor(i / cols) * rowPitch, size, tall, wide ? 3 : 1)));
    y += Math.max(18, Math.ceil(total / cols) * rowPitch) + 8;
  });
  legendRows(y, groupsShown);
  return prims;
}
/** the height the key under the grid takes at this width */
function legendRowsHeight(groups: string[], ctx: DrawCtx, w: number, column = false): number {
  if (column) return groups.length * 18;
  let x = 4, rows = groups.length ? 1 : 0;
  for (const g of groups) { const t = ctx.measure(`${g} 000`, "sub") + 34; if (x + t > w && x > 4) { x = 4; rows++; } x += t; }
  return rows * 18;
}

export const UNITS: ChartDraw = {
  kind: "units", draw,
  llm: (spec, values) => {
    const rows = values.length ? values : [[]], n = Math.max(spec.x.length, ...rows.map((v) => v.length)), names = cats(spec, n), t = Math.round(optN(spec, "total", 0));
    const one = (r: number[], label: string) => { const tot = Math.max(t, r.reduce((a, b) => a + Math.max(0, Math.round(num(b))), 0)); return `${label}${tot} units: ${names.map((g, j) => (num(r[j]) ? `${g} ${Math.round(num(r[j]))}` : "")).filter(Boolean).join(", ")}.`; };
    return [...(spec.title ? [`${spec.title}:`] : []), ...rows.map((r, s) => one(r, rows.length > 1 ? `${spec.series[s]?.name ?? `Row ${s + 1}`}: ` : ""))];
  },
};
