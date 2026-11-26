// scatter, bubble, candlestick and heatmap.
import type { ChartSpec, Prim, Rect } from "../../types";
import { keyOf, tickText, clip } from "../axis";
import { makeFrame, r2, wrapWords, LINE_PX, type Ctx } from "./frame";
import { readXy } from "./model";
import { annotations, buildKey, catTitle, keyPrims, litCls, valueText, type Built, type Mark } from "./shared";
import { linePoints, linePrims } from "./category";

// ------------------------------------------------------------------ scatter and bubble
export function buildPoints(spec: ChartSpec, values: number[][], rect: Rect, ctx: Ctx): Built {
  const m = readXy(spec, values), bubble = m.kind === "bubble";
  const mx = ctx.max?.length ? readXy(spec, ctx.max) : undefined;
  // charts2: a bubble chart's key says what a bubble's size means: the smallest and the largest size (over every state, so it never moves)
  const sizes = [...m.sers, ...(mx?.sers ?? [])].flatMap((s) => (s.pts ?? []).map((p) => p.r)).filter((v): v is number => Number.isFinite(v));
  const plainNum = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const sizeKey = bubble && sizes.length ? [{ label: `${m.words.size}: ${plainNum(Math.min(...sizes))} to ${plainNum(Math.max(...sizes))}`, shape: "size" as const, role: "muted" }] : [];
  const key = buildKey(m, rect, ctx, sizeKey);
  const f = makeFrame({ m, mx, rect, ctx, keyH: key.h, numbers: true });
  const kp = keyPrims(key.items, { x: rect.x, y: rect.y + (m.title ? LINE_PX + 4 : 0), w: rect.w, h: key.h });
  const prims: Prim[] = [...f.decor], marks: Mark[] = [...kp.marks];
  const maxR = Math.max(1, ...m.sers.flatMap((s) => (s.pts ?? []).map((p) => p.r ?? 0)), ...(mx ? mx.sers.flatMap((s) => (s.pts ?? []).map((p) => p.r ?? 0)) : []));
  for (const s of m.sers) {
    if (s.hidden) continue;
    const sk = keyOf(s.name) || `s${s.i}`;
    (s.pts ?? []).forEach((p, j) => {
      const x = f.px(p.x), y = f.val("y", p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const r = bubble ? 4 + 20 * Math.sqrt((p.r ?? 0) / maxR) : 4;
      prims.push({ k: "dot", key: `p:${sk}:${j}`, x: r2(x), y: r2(y), r: r2(r), role: s.role, cls: bubble ? "xy-bubble" : "xy-point" });
      marks.push({ key: `p:${sk}:${j}`, kind: "point", series: s.i, title: s.name, text: `(${valueText(m, p.x, "x")}, ${valueText(m, p.y)})${bubble ? `, ${m.words.size.toLowerCase()} ${valueText(m, p.r ?? 0)}` : ""}`, rect: { x: x - Math.max(r, 8), y: y - Math.max(r, 8), w: 2 * Math.max(r, 8), h: 2 * Math.max(r, 8) } });
    });
  }
  prims.push(...kp.prims);
  return { prims, marks };
}

// ------------------------------------------------------------------ candlestick (lines on top)
export function buildCandles(spec: ChartSpec, values: number[][], rect: Rect, ctx: Ctx): Built {
  const m = readXy(spec, values);
  const mx = ctx.max?.length ? readXy(spec, ctx.max) : undefined;
  const lines = m.sers.filter((s) => s.kind === "line");
  lines.forEach((s, k) => { if (!spec.series[s.i]?.role && !spec.opts?.[`s${s.i}.tone`]) s.role = `c${(k % 8) + 1}`; });
  const key = buildKey(m, rect, ctx, [{ label: m.words.up, shape: "up", role: "good" }, { label: m.words.down, shape: "down", role: "bad" }]);
  const f = makeFrame({ m, mx, rect, ctx, keyH: key.h, bandBars: true });
  const kp = keyPrims(key.items, { x: rect.x, y: rect.y + (m.title ? LINE_PX + 4 : 0), w: rect.w, h: key.h });
  const an = annotations(m, f, ctx);
  const prims: Prim[] = [...an.under, ...f.decor], marks: Mark[] = [...kp.marks];
  const candles = m.sers.find((s) => s.kind === "candles" && !s.hidden);
  const bw = Math.max(3, Math.min(f.size * 0.63, 28));
  m.x.forEach((_, i) => {
    const c = candles?.candles?.[i], ck = keyOf(m.x[i]) || String(i), x = f.mid(i);
    if (!c) { prims.push({ k: "path", key: `w:${ck}`, d: `M${r2(x)} ${r2(f.plot.y + f.plot.h)}L${r2(x)} ${r2(f.plot.y + f.plot.h)}`, role: "good", width: "line", cls: "xy-wick xy-gap" }, { k: "rect", key: `c:${ck}`, rect: { x: r2(x - bw / 2), y: r2(f.plot.y + f.plot.h), w: r2(bw), h: 0 }, fill: "none", role: "good", edge: "none", cls: "xy-candle xy-gap" }); return; }
    const [o, h, l, cl] = c, up = cl >= o, role = up ? "good" : "bad";
    const yo = f.val("y", o), yc = f.val("y", cl), top = Math.min(yo, yc), hh = Math.max(3, Math.abs(yo - yc));
    prims.push({ k: "path", key: `w:${ck}`, d: `M${r2(x)} ${r2(f.val("y", h))}L${r2(x)} ${r2(f.val("y", l))}`, role, width: "line", cls: `xy-wick ${up ? "xy-up" : "xy-down"}${litCls(ctx, m.x[i])}` });
    prims.push({ k: "rect", key: `c:${ck}`, rect: { x: r2(x - bw / 2), y: r2(top), w: r2(bw), h: r2(hh) }, fill: up ? "soft" : "role", role, edge: "role", r: 2, cls: `xy-candle ${up ? "xy-up" : "xy-down"}${litCls(ctx, m.x[i])}` });
  });
  for (const s of lines) if (!s.hidden) prims.push(...linePrims(f, s, linePoints(m, f, s), null, false, false));
  prims.push(...an.over, ...kp.prims);
  marks.push(...an.marks);
  m.x.forEach((_, i) => {
    const c = candles?.candles?.[i];
    const rows: string[] = c ? ["open", "high", "low", "close"].map((w, j) => `${m.words[w]}: ${valueText(m, c[j])}`) : [];
    for (const s of lines) if (Number.isFinite(s.y[i])) rows.push(`${s.name}: ${valueText(m, s.y[i], s.axis)}`);
    marks.push({ key: `cat:${keyOf(m.x[i]) || i}`, kind: "candle", title: catTitle(m, i), text: rows.join("\n"), rect: { x: f.mid(i) - f.size / 2, y: f.plot.y, w: f.size, h: f.plot.h } });
  });
  return { prims, marks };
}

// ------------------------------------------------------------------ heatmap
export const HEAT_LEVELS = 20;
/** the class of a cell: xy-h<k> (low to high), or xy-hp<k> above the diverging middle and xy-hn<k> below it; k is 0..19 */
export function heatClass(v: number, lo: number, hi: number, diverge?: number): { cls: string; t: number } {
  const q = (t: number) => Math.max(0, Math.min(HEAT_LEVELS - 1, Math.round(t * (HEAT_LEVELS - 1))));
  if (diverge === undefined) { const t = hi > lo ? (v - lo) / (hi - lo) : 1; return { cls: `xy-h${q(t)}`, t }; }
  if (v >= diverge) { const t = hi > diverge ? (v - diverge) / (hi - diverge) : 1; return { cls: `xy-hp${q(t)}`, t }; }
  const t = diverge > lo ? (diverge - v) / (diverge - lo) : 1;
  return { cls: `xy-hn${q(t)}`, t };
}
export function buildHeat(spec: ChartSpec, values: number[][], rect: Rect, ctx: Ctx): Built {
  const m = readXy(spec, values);
  const mx = ctx.max?.length ? readXy(spec, ctx.max) : undefined;
  const rows = m.sers, cols = m.x;
  const nums = [...rows.flatMap((s) => s.y), ...(mx ? mx.sers.flatMap((s) => s.y) : [])].filter(Number.isFinite);
  const lo = nums.length ? Math.min(...nums) : 0, hi = nums.length ? Math.max(...nums) : 1;
  const prims: Prim[] = [], marks: Mark[] = [];
  const keyH = LINE_PX + 10;
  const rowLabelW = Math.min(rect.w * 0.3, Math.max(0, ...rows.map((s) => ctx.measure(clip(s.name, 14), "sub"))) + 8);
  const catLines = ctx.phone ? 2 : 2;
  const top = m.ax.y.label ? LINE_PX + 4 : 0;
  const grid: Rect = { x: rect.x + rowLabelW, y: rect.y + top, w: Math.max(40, rect.w - rowLabelW), h: Math.max(40, rect.h - top - keyH - (m.ax.x.label ? LINE_PX : 0) - catLines * LINE_PX - 10) };
  const cw = grid.w / Math.max(1, cols.length), ch = grid.h / Math.max(1, rows.length);
  // column labels, thinned to fit
  let stride = 1; const widest = Math.max(0, ...cols.map((c) => ctx.measure(clip(c, 12), "sub")));
  while (stride < cols.length && cw * stride < widest + 6) stride++;
  cols.forEach((c, j) => { if (j % stride === 0) wrapWords(c, cw * stride - 4, ctx, catLines).forEach((l, k) => prims.push({ k: "text", key: `c:${keyOf(c) || j}:${k}`, x: r2(grid.x + (j + 0.5) * cw), y: r2(grid.y + grid.h + LINE_PX + k * LINE_PX), lines: [l], font: "sub", anchor: "middle", ink: "muted", cls: "xy-cat" })); });
  rows.forEach((s, r) => prims.push({ k: "text", key: `r:${keyOf(s.name) || r}`, x: r2(grid.x - 6), y: r2(grid.y + (r + 0.5) * ch + 4), lines: [clip(s.name, 14)], font: "sub", anchor: "end", ink: "muted", cls: "xy-cat" }));
  rows.forEach((s, r) => cols.forEach((c, j) => {
    const v = s.y[j], ok = Number.isFinite(v);
    const rc: Rect = { x: r2(grid.x + j * cw + 0.5), y: r2(grid.y + r * ch + 0.5), w: r2(Math.max(0, cw - 1)), h: r2(Math.max(0, ch - 1)) };
    const hc = ok ? heatClass(v, lo, hi, m.heat.diverge) : null;
    const k = `h:${keyOf(s.name) || r}:${keyOf(c) || j}`;
    prims.push({ k: "rect", key: k, rect: rc, fill: ok ? "role" : "none", role: m.heat.tone ?? "c1", edge: "none", r: 2, cls: hc ? `xy-heat ${hc.cls}` : "xy-heat xy-empty" });
    if (ok && rc.w >= 28 && rc.h >= 28) prims.push({ k: "text", key: `n:${k}`, x: r2(rc.x + rc.w / 2), y: r2(rc.y + rc.h / 2 + 4), lines: [tickText(v, m.ax.y.format, m.ax.y.currency)], font: "small-b", anchor: "middle", ink: "ink", cls: `xy-num ${hc!.t > 0.55 ? "xy-on-hi" : "xy-on-lo"}` });
    marks.push({ key: k, kind: "cell", title: `${s.name} · ${c}`, text: ok ? valueText(m, v) : m.words.empty, series: s.i, rect: rc });
  }));
  // the key: low, a ramp, high
  const ky = grid.y + grid.h + catLines * LINE_PX + 10 + (m.ax.x.label ? LINE_PX : 0), loT = tickText(lo), hiT = tickText(hi), rw = Math.min(160, rect.w - ctx.measure(loT, "sub") - ctx.measure(hiT, "sub") - 24);
  const x0 = rect.x + rect.w / 2 - (rw + ctx.measure(loT, "sub") + ctx.measure(hiT, "sub") + 16) / 2;
  prims.push({ k: "text", key: "hk:lo", x: r2(x0), y: r2(ky + 12), lines: [loT], font: "sub", anchor: "start", ink: "muted", cls: "xy-tick" });
  const rx = x0 + ctx.measure(loT, "sub") + 8;
  for (let k = 0; k < HEAT_LEVELS; k++) {
    const t = k / (HEAT_LEVELS - 1);
    const cls = m.heat.diverge === undefined ? `xy-h${k}` : (k < HEAT_LEVELS / 2 ? `xy-hn${HEAT_LEVELS - 1 - 2 * k}` : `xy-hp${2 * (k - HEAT_LEVELS / 2)}`);
    void t;
    prims.push({ k: "rect", key: `hk:${k}`, rect: { x: r2(rx + (k * rw) / HEAT_LEVELS), y: r2(ky + 2), w: r2(rw / HEAT_LEVELS + 0.5), h: 10 }, fill: "role", role: m.heat.tone ?? "c1", edge: "none", cls: `xy-heat ${cls}` });
  }
  prims.push({ k: "text", key: "hk:hi", x: r2(rx + rw + 8), y: r2(ky + 12), lines: [hiT], font: "sub", anchor: "start", ink: "muted", cls: "xy-tick" });
  if (m.ax.x.label) prims.push({ k: "text", key: "title:x", x: r2(grid.x + grid.w), y: r2(grid.y + grid.h + catLines * LINE_PX + LINE_PX + 4), lines: [m.ax.x.label], font: "sub", anchor: "end", ink: "muted", cls: "xy-title" });
  if (m.ax.y.label) prims.push({ k: "text", key: "title:y", x: r2(rect.x), y: r2(rect.y + 12), lines: [m.ax.y.label], font: "sub", anchor: "start", ink: "muted", cls: "xy-title" });
  return { prims, marks };
}
