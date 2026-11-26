// What every xy kind returns, and the parts they share: the key, the marks (one popover each), and annotations.
import type { Prim, Rect } from "../../types";
import { fullText, keyOf, clip } from "../axis";
import type { Ctx, Frame, KeyItem } from "./frame";
import { keyLayout, LINE_PX, r2 } from "./frame";
import type { Ann, XyModel } from "./model";
import { fmtTime } from "../../../core/chart-time";

/** A mark the page can put one popover on: a bar, a point, a candle, a cell, an annotation, a key item. */
export interface Mark { key: string; kind: "bar" | "point" | "candle" | "cell" | "ann" | "key"; rect: Rect; title: string; meta?: string; text?: string; series?: number }
export interface Built { prims: Prim[]; marks: Mark[] }

export const GLYPH_W = 22;

/** the key above the plot: a glyph and the series' name; a hidden series is struck (cls xy-off) */
export function keyPrims(items: KeyItem[], rect: Rect): { prims: Prim[]; marks: Mark[] } {
  const prims: Prim[] = [], marks: Mark[] = [];
  for (const it of items) {
    const x = rect.x + it.rect.x, y = rect.y + it.rect.y, cy = y + LINE_PX / 2 + 1, off = it.hidden ? " xy-off" : "";
    const k = `key:${it.i}`;
    if (it.shape === "bar") prims.push({ k: "rect", key: `${k}:g`, rect: { x, y: cy - 5, w: 12, h: 10 }, fill: "role", role: it.role, edge: "none", r: 3, cls: `xy-key${off}` });
    else if (it.shape === "up") prims.push({ k: "rect", key: `${k}:g`, rect: { x, y: cy - 5, w: 12, h: 10 }, fill: "soft", role: "good", edge: "role", r: 2, cls: `xy-key xy-up${off}` });
    else if (it.shape === "down") prims.push({ k: "rect", key: `${k}:g`, rect: { x, y: cy - 5, w: 12, h: 10 }, fill: "role", role: "bad", edge: "role", r: 2, cls: `xy-key xy-down${off}` });
    // charts2: an area's swatch is its faint fill with its line round it, as the area is drawn (format/16: a mint fill beside a dark green line swatch)
    else if (it.shape === "area") prims.push({ k: "rect", key: `${k}:g`, rect: { x, y: cy - 5, w: 12, h: 10 }, fill: "soft", role: it.role, edge: "role", r: 2, cls: `xy-key xy-key-area${off}` });
    // charts2: a bubble chart's size key: a small and a large circle, the label names the smallest and largest size (format/26 had no key)
    else if (it.shape === "size") { prims.push({ k: "dot", key: `${k}:g`, x: x + 3, y: cy + 2, r: 2.5, role: "muted", cls: `xy-key xy-bubble${off}` }); prims.push({ k: "dot", key: `${k}:m`, x: x + 11, y: cy, r: 5, role: "muted", cls: `xy-key xy-bubble${off}` }); }
    else if (it.shape === "line") {
      prims.push({ k: "path", key: `${k}:g`, d: `M${r2(x)} ${r2(cy)}L${r2(x + 16)} ${r2(cy)}`, role: it.role, dashed: it.line === "dashed", width: "line", cls: `xy-key ${it.line === "dotted" ? "xy-dotted" : ""}${off}` });
      if (it.marker && it.marker !== "none") prims.push({ k: "dot", key: `${k}:m`, x: x + 8, y: cy, r: 3, role: it.role, cls: `xy-key${off}` });
    } else prims.push({ k: "dot", key: `${k}:g`, x: x + 6, y: cy, r: 4.5, role: it.role, cls: `xy-key${off}` });
    prims.push({ k: "text", key: `${k}:t`, x: x + GLYPH_W, y: cy + 4, lines: [it.label], font: "sub", anchor: "start", ink: "muted", cls: `xy-keytext${off}` });
    marks.push({ key: k, kind: "key", rect: { x, y, w: it.rect.w, h: it.rect.h }, title: it.label, series: it.i });
  }
  return { prims, marks };
}

export interface KeyBuild { items: KeyItem[]; h: number }
export function buildKey(m: XyModel, rect: Rect, ctx: Ctx, extra: { label: string; shape: KeyItem["shape"]; role: string }[] = []): KeyBuild {
  const base = m.sers.filter((s) => !(s.kind === "candles")).map((s) => ({
    i: s.i, label: s.name, role: s.role, shape: (s.kind === "line" ? "line" : s.kind === "scatter" || s.kind === "bubble" ? "point" : s.kind === "area" ? "area" : "bar") as KeyItem["shape"],
    line: s.line, marker: s.marker, hidden: s.hidden,
  }));
  const show = base.length > 1 || extra.length > 0 || base.some((s) => s.marker || s.line !== "solid");
  const items: Omit<KeyItem, "rect">[] = [...(show ? base : []), ...extra.map((e, j) => ({ i: 1000 + j, label: e.label, role: e.role, shape: e.shape, line: "solid", marker: "", hidden: false }))];
  const k = keyLayout(items, rect.w, ctx);
  if (m.keyReserve.length < 2) return k;
  const room = keyLayout(m.keyReserve.map((label, i) => ({ i, label, role: "c1", shape: "bar" as const, line: "solid", marker: "", hidden: false })), rect.w, ctx).h;
  return { items: k.items, h: Math.max(k.h, room) };
}

/** `when` words for an annotation, in the chart's zone */
export function whenText(a: Ann, m: XyModel): string {
  if (a.when) return a.when;
  const f = (v: number | undefined) => (v === undefined ? "" : m.xt ? fmtTime(v, "yyyy-MM-dd HH:mm", m.tz) : m.x[Math.round(v)] ?? String(v));
  if (a.kind === "range") return `${f(a.from)} to ${f(a.to)}`;
  if (a.kind === "event") return f(a.from);
  return a.y2 !== undefined ? `${a.y} to ${a.y2}` : String(a.y);
}

/** Goal lines, bands, events and ranges: faint fills under the data, dashed edges over it, a chip for each goal's name.
 *  Returns the two layers so a kind can put the data between them. */
export function annotations(m: XyModel, f: Frame, ctx: Ctx): { under: Prim[]; over: Prim[]; marks: Mark[] } {
  const under: Prim[] = [], over: Prim[] = [], marks: Mark[] = [];
  const p = f.plot, horizontal = f.horizontal;
  const xOf = (v: number): number => (f.time ? f.time(v) : p.x + ((v + 0.5) * p.w) / Math.max(1, f.n));
  const half = f.time ? 0 : p.w / Math.max(1, f.n) / 2;
  // charts2: the tag rows sit in the frame's band above the plot (row r of the event and range tags), else at the plot's top as before
  let tagRow = 0;
  const tagTop = (): number => { const r = tagRow++ % 3; return f.annH ? p.y - f.annH + r * 22 + 1 : p.y + 4 + r * 22; };
  m.anns.forEach((a, i) => {
    const k = `ann:${i}`, role = a.tone === "acc" ? "accent" : a.tone;
    // eng-stagebars: a hit area never reaches past the plot's right edge (an event at the edge made the page scroll sideways at 390)
    const mk = (r0: Rect) => { const rect = { ...r0, x: Math.max(0, Math.min(r0.x, p.x + p.w - r0.w)) }; marks.push({ key: k, kind: "ann", rect, title: a.label, meta: whenText(a, m) + (f.time ? ` (${m.tz})` : ""), text: a.text }); };
    if (a.kind === "event" && a.from !== undefined) {
      const x = r2(xOf(a.from));
      over.push({ k: "path", key: `${k}:l`, d: `M${x} ${r2(p.y)}L${x} ${r2(p.y + p.h)}`, role, dashed: true, width: "line", cls: "xy-ann" });
      over.push({ k: "box", key: `${k}:m`, shape: "diamond", rect: { x: x - 5, y: p.y + p.h - 12, w: 10, h: 10 }, role, tone: null, cls: "xy-ann-mark" });
      const cw = Math.min(p.w - 8, ctx.measure(clip(a.label, 24), "chip") * 1.15 + 24), right = x + 6 + cw <= p.x + p.w, cx = right ? x + 6 : x - 6 - cw, cy = tagTop();
      over.push({ k: "chip", key: `${k}:c`, x: r2(cx + cw / 2), y: r2(cy + 14), words: clip(a.label, 24), role, cls: "xy-ann-chip" });
      mk({ x: x - 12, y: p.y + p.h - 24, w: 24, h: 24 });
    } else if (a.kind === "range" && a.from !== undefined && a.to !== undefined) {
      const x0 = Math.max(p.x, xOf(a.from) - half), x1 = Math.min(p.x + p.w, xOf(a.to) + half);
      under.push({ k: "rect", key: `${k}:r`, rect: { x: r2(x0), y: p.y, w: r2(Math.max(2, x1 - x0)), h: p.h }, fill: "soft", role, edge: "none", cls: "xy-ann-fill" });
      over.push({ k: "path", key: `${k}:l`, d: `M${r2(x0)} ${r2(p.y)}L${r2(x0)} ${r2(p.y + p.h)}M${r2(x1)} ${r2(p.y)}L${r2(x1)} ${r2(p.y + p.h)}`, role, dashed: true, width: "thin", cls: "xy-ann" });
      over.push({ k: "box", key: `${k}:m`, shape: "box", rect: { x: r2(x0), y: p.y + p.h - 5, w: r2(Math.max(2, x1 - x0)), h: 5 }, role, tone: null, cls: "xy-ann-mark" });
      const cw = Math.min(p.w - 8, ctx.measure(clip(a.label, 24), "chip") * 1.15 + 24), cx = Math.max(p.x + 2, Math.min(p.x + p.w - cw - 2, x0 + 4)), cy = tagTop();
      over.push({ k: "chip", key: `${k}:c`, x: r2(cx + cw / 2), y: r2(cy + 14), words: clip(a.label, 24), role, cls: "xy-ann-chip" });
      mk({ x: x0, y: p.y + p.h - 24, w: Math.max(24, x1 - x0), h: 24 });
    } else if (a.kind === "threshold" && a.y !== undefined) {
      const ax = a.axis === "y2" && f.scale.y2 ? "y2" : "y";
      const y1 = f.val(ax, a.y), y2 = a.y2 !== undefined ? f.val(ax, a.y2) : y1;
      const x0 = a.goal && a.from !== undefined ? Math.max(p.x, xOf(a.from) - half) : p.x, x1 = a.goal && a.to !== undefined ? Math.min(p.x + p.w, xOf(a.to) + half) : p.x + p.w;
      if (horizontal) return;
      if (a.y2 !== undefined) under.push({ k: "rect", key: `${k}:r`, rect: { x: r2(x0), y: r2(Math.min(y1, y2)), w: r2(x1 - x0), h: r2(Math.abs(y2 - y1)) }, fill: "soft", role, edge: "none", cls: "xy-ann-fill" });
      else if (a.fill === "above") under.push({ k: "rect", key: `${k}:r`, rect: { x: r2(x0), y: p.y, w: r2(x1 - x0), h: r2(Math.max(0, y1 - p.y)) }, fill: "soft", role, edge: "none", cls: "xy-ann-fill" });
      else if (a.fill === "below") under.push({ k: "rect", key: `${k}:r`, rect: { x: r2(x0), y: r2(y1), w: r2(x1 - x0), h: r2(Math.max(0, p.y + p.h - y1)) }, fill: "soft", role, edge: "none", cls: "xy-ann-fill" });
      over.push({ k: "path", key: `${k}:l`, d: `M${r2(x0)} ${r2(y1)}L${r2(x1)} ${r2(y1)}${a.y2 !== undefined ? `M${r2(x0)} ${r2(y2)}L${r2(x1)} ${r2(y2)}` : ""}`, role, dashed: true, width: "line", cls: "xy-ann" });
      const top = Math.min(y1, y2), w = Math.min(p.w - 8, ctx.measure(clip(a.label, 28), "chip") * 1.15 + 24);
      const cx = Math.max(p.x, Math.min(p.x + p.w - w - 4, x1 - w - 4)), cy = top - 20 < p.y ? Math.max(y1, y2) + 3 : top - 20;
      over.push({ k: "chip", key: `${k}:c`, x: r2(cx + w / 2), y: r2(cy + 14), words: clip(a.label, 28), role, cls: "xy-ann-chip" });
      mk({ x: cx, y: cy, w, h: 18 });
    }
  });
  return { under, over, marks };
}

/** a value as a popover shows it */
export const valueText = (m: XyModel, v: number, axis: "x" | "y" | "y2" = "y"): string => fullText(v, m.ax[axis].format, m.ax[axis].currency);
export const catTitle = (m: XyModel, i: number): string => m.x[i] ?? "";
export { keyOf };

/** the class a mark gets when the step lights some categories: the lit ones `xy-lit`, the rest `xy-dim` */
export const litCls = (ctx: { lit?: string[] }, cat: string): string => (ctx.lit?.length ? (ctx.lit.includes(cat) ? " xy-lit" : " xy-dim") : "");
