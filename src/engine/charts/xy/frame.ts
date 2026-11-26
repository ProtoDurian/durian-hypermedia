// The frame of a category/value chart (bar, line, area, candlestick) and a number/number chart (scatter, bubble):
// room for the key, the value axes and the category labels, the scales, and the grid, ticks and labels as primitives.
// Keys of the decor are fixed names (`g:y:<tick>`), so a step that moves the scale glides.
import type { Prim, Rect, Font } from "../../types";
import { linearScale, logScale, tickText, allWhole, clip, keyOf, type Scale } from "../axis";
import type { Ser, XyModel, AxisId } from "./model";
import { timeTicks, tickLabel, fmtTime, type TimeUnit } from "../../../core/chart-time";
import { ticksEvery, TIME_UNITS } from "../../../core/pagecharts";

export interface Ctx { phone: boolean; look: string; measure: (text: string, font: Font) => number; step?: number; prev?: number[][] | null; max?: number[][]; lit?: string[] }
export const LINE_PX = 16;      // height of one line of 12 px type (stage-core LINE_H.sub)
const KEY_GAP = 8;

/** charts2: the height of one row of annotation tags above the plot */
export const ANN_ROW = 22;
export interface Frame {
  plot: Rect;
  /** charts2: the band above the plot that holds the event and range tags (0 when there are none) */
  annH?: number;
  horizontal: boolean;
  /** the category axis: `n` bands; `mid(i)` and `size` in px along the category direction (x, or y when horizontal) */
  n: number; mid(i: number): number; size: number;
  /** a time value to px along the category direction (time axis only) */
  time: ((t: number) => number) | null;
  scale: Record<AxisId, Scale | null>;
  /** a value to px along the value direction (y when vertical, x when horizontal) */
  val(axis: AxisId, v: number): number;
  /** the number axis of a scatter: x */
  xs: Scale | null;
  px(v: number): number;
  decor: Prim[];
}

const ink = "muted" as const;
export const fontOf = (_phone: boolean): Font => "sub";

/** the value domain of an axis from the series that sit on it */
function domainOf(m: XyModel, axis: AxisId): { lo: number; hi: number; whole: boolean; all: number[] } {
  const all: number[] = [];
  const on = m.sers.filter((s) => s.axis === axis && !s.hidden);
  const bars = on.filter((s) => s.kind === "bar" || s.kind === "area" || (s.kind === "line" && m.kind !== "candlestick"));
  const stack = m.stacked && axis === "y";
  const stackable = on.filter((s) => s.kind === (m.kind === "area" ? "area" : m.kind) && s.lo === null);
  if (stack) {
    const pos = m.x.map(() => 0), neg = m.x.map(() => 0);
    for (const s of stackable) s.y.forEach((v, i) => { if (Number.isFinite(v)) (v >= 0 ? (pos[i] += v) : (neg[i] += v)); });
    if (m.stacked === "percent") all.push(0, 100); else all.push(...pos, ...neg);
  }
  for (const s of on) {
    if (stack && stackable.includes(s)) continue;
    if (s.kind === "candles") { for (const c of s.candles ?? []) if (c) all.push(c[1], c[2]); continue; }
    if (s.pts) { for (const p of s.pts) all.push(p.y); continue; }
    for (const v of s.y) if (Number.isFinite(v)) all.push(v);
    if (s.lo) for (const v of s.lo) if (Number.isFinite(v)) all.push(v);
  }
  void bars;
  const fin = all.filter(Number.isFinite);
  return { lo: fin.length ? Math.min(...fin) : 0, hi: fin.length ? Math.max(...fin) : 1, whole: allWhole(fin), all: fin };
}

function key(ser: Ser): string { return keyOf(ser.name) || `s${ser.i}`; }

/** the key's items and their rects (a row of marks and words above the plot; wraps) */
export interface KeyItem { i: number; label: string; role: string; shape: "bar" | "line" | "point" | "up" | "down" | "heat" | "area" | "size"; line: string; marker: string; rect: Rect; hidden: boolean }
export function keyLayout(items: Omit<KeyItem, "rect">[], width: number, ctx: Ctx): { items: KeyItem[]; h: number } {
  const out: KeyItem[] = []; let x = 0, y = 0, rowH = LINE_PX + 2;
  for (const it of items) {
    const w = 22 + ctx.measure(it.label, "sub") * 1.1 + 14;
    if (x > 0 && x + w > width) { x = 0; y += rowH; }
    out.push({ ...it, rect: { x, y, w: Math.min(w, width), h: rowH } });
    x += w;
  }
  return { items: out, h: items.length ? y + rowH : 0 };
}

/** category labels: wrapped to the band, thinned when the bands are too narrow, never rotated */
function catLabels(labels: string[], bandW: number, ctx: Ctx, maxLines: number): { show: (string[] | null)[]; lines: number } {
  const n = labels.length;
  const widest = Math.max(0, ...labels.map((l) => ctx.measure(clip(l, 16), "sub")));
  let stride = 1;
  while (stride < n && bandW * stride < Math.min(widest, 70) + 6) stride++;
  const w = Math.max(24, bandW * stride - 4);
  const show = labels.map((l, i) => (i % stride === 0 ? wrapWords(l, w, ctx, maxLines) : null));
  return { show, lines: Math.max(1, ...show.map((s) => s?.length ?? 0)) };
}
export function wrapWords(text: string, w: number, ctx: Ctx, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean), out: string[] = []; let line = "";
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (line && ctx.measure(t, "sub") > w) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  let r = out.length ? out : [""];
  if (r.length > maxLines) { r = r.slice(0, maxLines); r[maxLines - 1] = r[maxLines - 1] + "…"; }
  return r.map((l) => { let s = l; while (s.length > 2 && ctx.measure(s, "sub") > w + 2) s = s.slice(0, -2) + "…"; return s; });
}

const text = (k: string, x: number, y: number, s: string, anchor: "start" | "middle" | "end", cls: string): Prim => ({ k: "text", key: k, x, y, lines: [s], font: "sub", anchor, ink, cls });
const line = (k: string, d: string, cls: string): Prim => ({ k: "path", key: k, d, role: null, width: "thin", cls });

export interface FrameIn { m: XyModel; /** the model of the largest numbers over the whole story: the scale never changes per step */ mx?: XyModel; rect: Rect; ctx: Ctx; keyH: number; /** scatter and bubble: both axes are numbers */ numbers?: boolean; zeroBase?: boolean; bandBars?: boolean }

/** charts2: a log axis' room past the data: a fifth more, but none past a power of ten the data already sits on (format/24: points from 1
 *  drew a whole empty decade from 0.1) */
export const logPad = (v: number, dir: -1 | 1): number => (v > 0 && Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9 ? v : dir < 0 ? v / 1.2 : v * 1.2);
export function makeFrame({ m, mx, rect, ctx, keyH, numbers, zeroBase, bandBars }: FrameIn): Frame {
  const phone = ctx.phone, horizontal = m.horizontal;
  const decor: Prim[] = [];
  const vAxes: AxisId[] = m.hasY2 && !horizontal ? ["y", "y2"] : ["y"];
  // the value axis' title sits above its top tick (a horizontal chart: the category axis' title, since its value axis is under the bars); 6 px clear of the tick's word
  const titleH = (horizontal ? m.ax.x.label : m.ax.y.label || m.ax.y2.label) ? LINE_PX + 8 : 0;
  const chartTitleH = m.title ? LINE_PX + 4 : 0;
  // charts2: event and range tags sit in their own band above the plot (one 22 px row each, at most 3), never on the data (format/44: the
  // "Deploy v1.4" and "Incident 42" tags hid the peak)
  const annH = horizontal ? 0 : Math.min(3, m.anns.filter((a) => (a.kind === "event" && a.from !== undefined) || (a.kind === "range" && a.from !== undefined && a.to !== undefined)).length) * ANN_ROW;
  const topPad = chartTitleH + keyH + (keyH ? KEY_GAP : 0) + titleH + annH + 6;
  const gap = ctx.phone ? 4 : 6;

  // ---- scales
  const scales: Record<AxisId, Scale | null> = { y: null, y2: null };
  for (const id of vAxes) {
    const d = { ...domain(m, id, mx) }, a = m.ax[id];
    if (numbers) { const sp = d.hi - d.lo || 1; if (!a.log) { if (a.max === undefined) d.hi += sp * 0.05; if (a.min === undefined && d.lo !== 0) d.lo -= sp * 0.05; } else { d.lo = logPad(d.lo, -1); d.hi = logPad(d.hi, 1); } }
    const count = Math.max(3, Math.min(7, Math.floor((rect.h - topPad - 40) / 38)));
    const useLog = a.log && !m.stacked;
    scales[id] = useLog ? logScale(d.lo, d.hi, { min: a.min, max: a.max, phone }) : linearScale(d.lo, d.hi, horizontal ? Math.max(3, Math.min(6, Math.floor(rect.w / 90))) : count, {
      min: m.stacked === "percent" && id === "y" ? 0 : a.min, max: m.stacked === "percent" && id === "y" ? 100 : a.max,
      zero: zeroBase && !a.log, whole: d.whole,
    });
  }
  if (m.axisTicks && scales.y && !scales.y.log) {
    const t = m.axisTicks, lo = Math.min(...t), hi = Math.max(lo + 1e-9, Math.max(...t), domain(m, "y", mx).hi);
    scales.y = { lo, hi, log: false, ticks: t, at: (v) => (v - lo) / (hi - lo) };
  }
  // the number axis of a scatter
  let xs: Scale | null = null;
  if (numbers) {
    const xsv = m.sers.flatMap((s) => (s.pts ?? []).map((p) => p.x)).filter(Number.isFinite);
    const a = m.ax.x; let lo = xsv.length ? Math.min(...xsv) : 0, hi = xsv.length ? Math.max(...xsv) : 1;
    { const sp = hi - lo || 1; if (!a.log) { if (a.max === undefined) hi += sp * 0.05; if (a.min === undefined && lo !== 0) lo -= sp * 0.05; } else { lo = logPad(lo, -1); hi = logPad(hi, 1); } }
    xs = a.log ? logScale(lo, hi, { min: a.min, max: a.max, phone }) : linearScale(lo, hi, Math.max(3, Math.min(8, Math.floor(rect.w / 80))), { min: a.min, max: a.max, whole: allWhole(xsv) });
  }
  const fmt = (axis: AxisId | "x") => ({ f: axis === "y" && m.stacked === "percent" ? "percent" : m.ax[axis].format, c: m.ax[axis].currency });
  const tickW = (s: Scale, axis: AxisId | "x") => Math.max(0, ...s.ticks.map((t) => ctx.measure(tickText(t, fmt(axis).f, fmt(axis).c), "sub"))) * 1.1;

  // ---- room: left axis, right axis, bottom labels
  let left = 0, right = 0, bottomLines = 0, catW = 0;
  const n = m.x.length;
  const lastTickOver = 8; // half a label hangs past the last tick on the category axis
  if (horizontal) {
    const maxLabel = Math.max(0, ...m.x.map((l) => ctx.measure(clip(l, 22), "sub")));
    catW = Math.min(maxLabel * 1.1 + 12, rect.w * (phone ? 0.4 : 0.34));
    left = catW;
    bottomLines = 1;
  } else {
    if (scales.y) {
      left = tickW(scales.y, "y") + gap + 2;
      // eng-stagebars: a log and linear toggle keeps the plot where it is: the room is the larger of the two scales' tick words
      if (m.ax.y.toggle && !m.stacked) {
        const d = { ...domain(m, "y", mx) }, a = m.ax.y;
        try { const alt = scales.y.log ? linearScale(d.lo, d.hi, Math.max(3, Math.min(7, Math.floor((rect.h - topPad - 40) / 38))), { min: a.min, max: a.max, zero: zeroBase, whole: d.whole }) : logScale(d.lo, d.hi, { min: a.min, max: a.max, phone }); left = Math.max(left, tickW(alt, "y") + gap + 2); } catch { /* one scale only */ }
      }
    }
    if (scales.y2) right = tickW(scales.y2, "y2") + gap + 2;
  }
  const inner0 = rect.w - left - right;
  let showLabels: (string[] | null)[] = [], labelLines = 1;
  if (!horizontal && !numbers) {
    const bandW = n ? Math.max(1, (inner0 - 4) / n) : inner0;
    const r = catLabels(m.x, m.xt ? bandW * 2 : bandW, ctx, phone ? 2 : 3);
    showLabels = r.show; labelLines = r.lines;
  }
  const xTitleH = (horizontal ? m.ax.y.label : m.ax.x.label) ? LINE_PX + 2 : 0;
  const bottom = (horizontal ? LINE_PX + 8 : numbers || m.xt ? LINE_PX + 8 : labelLines * LINE_PX + 8) + xTitleH;
  const plot: Rect = { x: rect.x + left + (numbers ? 4 : 0), y: rect.y + topPad, w: Math.max(40, rect.w - left - right - lastTickOver * (numbers || horizontal ? 1 : 0) - (numbers ? 4 : 0)), h: Math.max(60, rect.h - topPad - bottom) };

  // ---- the category axis
  let mid = (i: number) => (horizontal ? plot.y + ((i + 0.5) * plot.h) / Math.max(1, n) : plot.x + ((i + 0.5) * plot.w) / Math.max(1, n));
  let size = (horizontal ? plot.h : plot.w) / Math.max(1, n);
  let time: Frame["time"] = null;
  let timeRange: [number, number] | null = null;
  const timePts = m.ax.x.time && !numbers ? m.sers.flatMap((s) => (s.pts ?? []).map((p) => p.x)) : [];
  if (!numbers && !horizontal && (m.xt || timePts.length)) {
    const ts = [...(m.xt ?? []), ...timePts].filter(Number.isFinite);
    let lo = m.ax.x.min ?? Math.min(...ts), hi = m.ax.x.max ?? Math.max(...ts);
    const gaps = (m.xt ?? []).slice(1).map((t, i) => t - m.xt![i]).filter((g) => g > 0);
    const minGap = gaps.length ? Math.min(...gaps) : 0;
    if (bandBars && minGap) { lo -= minGap / 2; hi += minGap / 2; }
    if (hi <= lo) hi = lo + 60_000;
    timeRange = [lo, hi];
    time = (t) => plot.x + ((t - lo) / (hi - lo)) * plot.w;
    if (m.xt) mid = (i) => time!(m.xt![i]);
    size = minGap ? Math.max(2, (minGap / (hi - lo)) * plot.w) : plot.w / Math.max(1, n);
  }
  const val = (axis: AxisId, v: number): number => {
    const s = scales[axis] ?? scales.y!;
    const t = s.at(v), inset = numbers ? 8 : 0;
    return horizontal ? plot.x + t * plot.w : plot.y + inset + (1 - t) * (plot.h - 2 * inset);
  };
  const px = (v: number): number => (xs ? plot.x + 8 + xs.at(v) * (plot.w - 16) : NaN);

  // ---- decor: grid and value ticks (fixed keys: a moved scale glides)
  const base = scales.y!;
  for (const t of base.ticks) {
    const p = val("y", t), name = `g:y:${keyOf(String(t))}`;
    const d = horizontal ? `M${r2(p)} ${r2(plot.y)}L${r2(p)} ${r2(plot.y + plot.h)}` : `M${r2(plot.x)} ${r2(p)}L${r2(plot.x + plot.w)} ${r2(p)}`;
    decor.push(line(name, d, "xy-grid"));
    const label = tickText(t, fmt("y").f, fmt("y").c);
    const lw = ctx.measure(label, "sub") * 1.05, px0 = horizontal ? Math.max(rect.x + lw / 2, Math.min(rect.x + rect.w - lw / 2, p)) : p;
    decor.push(horizontal ? text(`t:y:${keyOf(String(t))}`, px0, plot.y + plot.h + LINE_PX + 1, label, "middle", "xy-tick") : text(`t:y:${keyOf(String(t))}`, plot.x - gap, p + 4, label, "end", "xy-tick"));
  }
  if (scales.y2) for (const t of scales.y2.ticks) {
    decor.push(text(`t:y2:${keyOf(String(t))}`, plot.x + plot.w + gap, val("y2", t) + 4, tickText(t, m.ax.y2.format, m.ax.y2.currency), "start", "xy-tick"));
  }
  if (numbers && xs) {
    for (const t of xs.ticks) {
      const p = px(t);
      decor.push(line(`g:x:${keyOf(String(t))}`, `M${r2(p)} ${r2(plot.y)}L${r2(p)} ${r2(plot.y + plot.h)}`, "xy-grid"));
      const w = ctx.measure(tickText(t, m.ax.x.format, m.ax.x.currency), "sub");
      decor.push(text(`t:x:${keyOf(String(t))}`, Math.max(rect.x + w / 2, Math.min(rect.x + rect.w - w / 2, p)), plot.y + plot.h + LINE_PX, tickText(t, m.ax.x.format, m.ax.x.currency), "middle", "xy-tick"));
    }
  }
  // the baseline (value 0 or the bottom edge)
  decor.push(line("axis:base", horizontal ? `M${r2(plot.x)} ${r2(plot.y)}L${r2(plot.x)} ${r2(plot.y + plot.h)}` : `M${r2(plot.x)} ${r2(plot.y + plot.h)}L${r2(plot.x + plot.w)} ${r2(plot.y + plot.h)}`, "xy-axis"));
  // category labels
  if (horizontal) {
    for (let i = 0; i < n; i++) wrapWords(m.x[i], catW * 0.88 - 12, ctx, 2).forEach((l, j, all) => decor.push(text(`c:${keyOf(m.x[i]) || i}:${j}`, plot.x - 6, mid(i) + 4 + (j - (all.length - 1) / 2) * (LINE_PX + 2), l, "end", "xy-cat"))); // eng-polish: a wrapped category word is 18 px apart (label-check saw the two lines of "Run the template once" touch at 16)
  } else if (time && timeRange) {
    const span = timeRange[1] - timeRange[0];
    const own = m.ax.x.unit && TIME_UNITS.includes(m.ax.x.unit) ? ticksEvery(timeRange[0], timeRange[1], m.ax.x.unit, Math.max(1, Math.round(m.ax.x.every ?? 1)), m.tz, false) : null;
    const tk = own && own.length ? { t: own, unit: m.ax.x.unit as TimeUnit } : timeTicks(timeRange[0], timeRange[1], m.tz, Math.max(2, Math.floor(plot.w / 78)));
    let edge = -Infinity; // the right end of the last word kept: a word that would touch it is left out (its grid line stays)
    tk.t.forEach((t, i) => {
      const lab = tickLabel(t, tk.unit as TimeUnit, m.tz, i === 0);
      const w = ctx.measure(lab, "sub"), p = time!(t);
      // the first word starts at its tick and the last ends at its own, so neither reaches over the value axis' words or past the chart
      const first = i === 0 && p - w / 2 < plot.x, last = i === tk.t.length - 1 && p + w / 2 > rect.x + rect.w;
      decor.push(line(`g:x:${t}`, `M${r2(p)} ${r2(plot.y)}L${r2(p)} ${r2(plot.y + plot.h)}`, "xy-grid xy-grid-x"));
      const l = first ? p : last ? p - w : p - w / 2;
      if (l < edge + 6) return;
      edge = l + w;
      decor.push(text(`c:t${t}`, p, plot.y + plot.h + LINE_PX, lab, first ? "start" : last ? "end" : "middle", "xy-cat"));
    });
    void span; void fmtTime;
  } else if (!numbers) {
    showLabels.forEach((ls, i) => { if (ls) ls.forEach((l, j) => decor.push(text(`c:${keyOf(m.x[i]) || i}:${j}`, mid(i), plot.y + plot.h + LINE_PX + j * LINE_PX, l, "middle", "xy-cat"))); });
  }
  if (m.title) decor.push({ k: "text", key: "title:chart", x: rect.x, y: rect.y + 13, lines: [m.title], font: "sub", anchor: "start", ink: "muted", cls: "xy-title xy-main" });
  // axis titles: above the value axis (it costs no width), and below the category axis
  const yt = m.ax.y.label, y2t = m.ax.y2.label, xt = m.ax.x.label;
  if (yt && !horizontal) decor.push(text("title:y", rect.x, rect.y + chartTitleH + keyH + (keyH ? KEY_GAP : 0) + LINE_PX - 3, yt, "start", "xy-title"));
  if (y2t && !horizontal && scales.y2) decor.push(text("title:y2", rect.x + rect.w, rect.y + chartTitleH + keyH + (keyH ? KEY_GAP : 0) + LINE_PX - 3, y2t, "end", "xy-title"));
  if (xt && !horizontal) decor.push(text("title:x", plot.x + plot.w, rect.y + rect.h - 3, xt, "end", "xy-title"));
  if (xt && horizontal) decor.push(text("title:x", rect.x, rect.y + chartTitleH + keyH + (keyH ? KEY_GAP : 0) + LINE_PX - 3, xt, "start", "xy-title"));
  if (horizontal && yt) decor.push(text("title:y", plot.x + plot.w, rect.y + rect.h - 3, yt, "end", "xy-title"));
  return { plot, horizontal, n, mid, size, time, scale: scales, val, xs, px, decor, annH };
}
const r2 = (v: number): number => Math.round(v * 100) / 100;
export { r2 };
export { key as serKey };

/** the value domain of an axis: this step's numbers, and (in a story) the largest numbers of every step, so the scale stays still */
export function domain(m: XyModel, axis: AxisId, mx?: XyModel): { lo: number; hi: number; whole: boolean; all: number[] } {
  const a = domainOf(m, axis), b = mx ? domainOf(mx, axis) : null;
  if (!b || !b.all.length) return a;
  const all = [...a.all, ...b.all];
  return { lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi), whole: a.whole && b.whole, all };
}
