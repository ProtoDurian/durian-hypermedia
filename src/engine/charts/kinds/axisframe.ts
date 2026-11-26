// What histogram, boxplot, violin and waterfall share: the frame with a value axis (grid, ticks, an axis title above it, the base
// line, the x title), the words under the bars, the key of a histogram's series and the dashed marks (p50, p95) with their chip.
// Port of src/parts/chart-kinds/view.tsx YAxis / Marks / XLabels, drawn as primitives (no rotated words: a long name wraps to two
// lines or the row is thinned, as the xy charts do). Keys are fixed names, so a step that moves the scale glides.
import type { Font, Prim, Rect, Tone } from "../../types";
import { keyOf, linearScale, tickText, type Scale } from "../axis";
import { durationText } from "../../../parts/chart-kinds/fmt";
import { wrapWords } from "../xy/frame";
import type { Fmt, Mark } from "../../../parts/chart-kinds/compute";
import { fmtValue } from "../../../parts/chart-kinds/fmt";
import type { KCtx, KMark } from "./common";

/** the height of one line of 12 px type, as the stage's `sub` line */
export const LINE = 16;
export const r2 = (v: number): number => Math.round(v * 100) / 100;
/** a share as a percent with at most one decimal and no trailing zero: 0.82 is 82%, 0.0125 is 1.3% */
export const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`;
/** a value as a card shows it (full, never compact) */
export const fullOf = (f: Fmt, x: number): string => fmtValue(x, f.format, f.currency);
// charts2: durations step on round units of time and their tick words are short ("300ms", "1m30s", not "300 ms", "1m 30s")
const isDur = (f: Fmt): boolean => f.format === "duration" || f.format === "duration-ms";
/** round steps of time, in the format's own unit: seconds for `duration`, milliseconds for `duration-ms` (10 s, 15 s, 30 s, 1 min, 2 min, 5 min ...) */
const STEPS_S = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 172800, 604800];
const STEPS_MS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];
const stepsOf = (f: Fmt): number[] => (f.format === "duration-ms" ? STEPS_MS : STEPS_S);
/** a duration as a tick word: seconds or milliseconds in, "300ms", "45s", "1m30s", "2h" out */
export function shortDuration(x: number, ms: boolean): string {
  const s = ms ? x / 1000 : x;
  if (s === 0) return "0";
  if (Math.abs(s) < 1) return `${+(s * 1000).toFixed(2)}ms`;
  return durationText(s).replace(/ /g, "");
}
/** a value as an axis tick shows it (short) */
export const tickOf = (f: Fmt, x: number): string => (isDur(f) ? shortDuration(x, f.format === "duration-ms") : tickText(x, f.format, f.currency));
/** a linear scale for a duration axis on round time steps (null for any other format); at most `count` ticks */
function durationScale(lo: number, hi: number, count: number, f: Fmt, zero?: boolean): Scale | null {
  if (!isDur(f) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi <= lo) hi = lo + 1;
  const steps = stepsOf(f);
  for (const st of steps) {
    const a = Math.floor(lo / st + 1e-9) * st, b = Math.ceil(hi / st - 1e-9) * st, n = Math.round((b - a) / st) + 1;
    if (n > Math.max(2, count)) continue;
    const ticks: number[] = [];
    for (let k = 0; k < n; k++) ticks.push(+(a + k * st).toPrecision(12));
    return { lo: a, hi: b, log: false, ticks, at: (v) => (b === a ? 0 : (v - a) / (b - a)) };
  }
  return null;
}
/** round values inside [lo, hi] for a horizontal axis `w` px long: the finest step whose words (measured) fit side by side with 12 px between; at least two when two fit */
export function roundTicksAcross(lo: number, hi: number, w: number, f: Fmt, word: (x: number) => string, ctx: KCtx): number[] {
  const steps = isDur(f) ? stepsOf(f) : null;
  const ticksOf = (st: number): number[] => { const out: number[] = []; for (let k = Math.ceil(lo / st - 1e-9), i = 0; k * st <= hi + 1e-9 && i < 80; k++, i++) out.push(+(k * st).toPrecision(12)); return out; };
  const fits = (ts: number[]): boolean => ts.length * (Math.max(0, ...ts.map((t) => ctx.measure(word(t), "sub"))) + 12) <= w + 12;
  if (steps) { for (const st of steps) { const ts = ticksOf(st); if (ts.length >= 2 && fits(ts)) return ts; if (ts.length < 2) break; } }
  return [];
}

/** a View's tone word (c1..c8, acc, good, warn, bad, muted) as the role, the tone and the class a primitive carries */
export function paint(tone: string): { role: string | null; tone: Tone | null; cls: string } {
  const t = tone === "acc" ? "accent" : tone;
  const cls = `kd-t-${tone === "accent" ? "acc" : tone}`;
  if (/^c[1-8]$/.test(t)) return { role: t, tone: null, cls };
  if (t === "good" || t === "bad" || t === "warn" || t === "accent") return { role: t, tone: t, cls };
  if (t === "muted") return { role: "muted", tone: null, cls };
  return { role: "c1", tone: null, cls: "kd-t-c1" };
}

/** keys that stay unique when two categories share a name */
export function uniqKeys(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((n, i) => { let k = keyOf(n) || String(i); if (seen.has(k)) k = `${k}~${i}`; seen.add(k); return k; });
}

/** the lines of words under the bars: 2 when any name is long or has a space (decided from the names only, so the height never depends on the width) */
export const nameLines = (names: string[]): number => (names.some((n) => n.length > 6 || n.includes(" ")) ? 2 : 1);

/** the words under the bars: wrapped to the band, thinned (every k-th) when even one word is wider than its band */
/** charts2: the words under the bars, kept inside `room` (the chart's left and right edge): a name wider than its band at either end
 *  slides in instead of being cut by the drawing's edge (format/66 at 390: "Novembe") */
export function nameWords(names: string[], keys: string[], cx: (i: number) => number, y: number, band: number, ctx: KCtx, maxLines: number, room?: [number, number]): Prim[] {
  const out = nameWordsFree(names, keys, cx, y, band, ctx, maxLines);
  if (!room) return out;
  return out.map((p) => {
    if (p.k !== "text") return p;
    const half = (Math.max(...p.lines.map((l) => ctx.measure(l, "sub"))) * 1.12) / 2 + 1; // the page's face is a little wider than the measure
    return { ...p, x: r2(Math.max(room[0] + half, Math.min(room[1] - half, p.x))) };
  });
}
function nameWordsFree(names: string[], keys: string[], cx: (i: number) => number, y: number, band: number, ctx: KCtx, maxLines: number): Prim[] {
  // a name wraps at its spaces and is cut with an ellipsis past the band; names are dropped (every k-th kept) only when even a short cut does not fit
  const widest = Math.max(0, ...names.map((n) => Math.max(0, ...n.split(/\s+/).map((wd) => ctx.measure(wd, "sub")))));
  // names of one word that are wider than their band but fit two bands: every second one sits a line lower (nothing cut, nothing dropped)
  // (eng-stagebars: also names with a space, when each fits one line of two bands)
  if (maxLines >= 2 && names.length > 1 && widest > band - 4 && widest <= 2 * band - 8 && names.every((n) => ctx.measure(n, "sub") <= 2 * band - 4)) {
    const w2 = 2 * band - 4, st: Prim[] = [];
    names.forEach((n, i) => wrapWords(n, w2, ctx, 1).forEach((l) => st.push({ k: "text", key: `c:${keys[i]}:0`, x: r2(cx(i)), y: r2(y + (i % 2) * LINE), lines: [l], font: "sub", anchor: "middle", ink: "muted", cls: "kd-cat" })));
    return st;
  }
  let stride = 1;
  while (stride < names.length && band * stride < Math.min(widest, 34) + 4) stride++;
  const w = Math.max(24, band * stride - 4), out: Prim[] = [];
  names.forEach((n, i) => {
    if (i % stride) return;
    wrapWords(n, w, ctx, maxLines).forEach((l, j) => out.push({ k: "text", key: `c:${keys[i]}:${j}`, x: r2(cx(i)), y: r2(y + j * LINE), lines: [l], font: "sub", anchor: "middle", ink: "muted", cls: "kd-cat" }));
  });
  return out;
}

export interface FrameIn {
  rect: Rect; ctx: KCtx; fmt: Fmt;
  /** the value domain (the scale reaches round numbers around it) */
  lo: number; hi: number; zero?: boolean; whole?: boolean;
  yLabel: string; xLabel: string;
  /** px above the plot besides the key and the y title (a histogram's chips) */
  topExtra?: number; keyH?: number;
  /** lines of words under the plot (0 when the kind draws its own x words) */
  lines: number;
  /** a tick's words (default: the short form of the format) */
  tick?: (t: number) => string;
}
export interface Frame { plot: Rect; scale: Scale; y(v: number): number; decor: Prim[]; top: number; /** the unit is in the axis title, not on the ticks */ bare: boolean }

/** room, scale and the decor: grid lines, tick words, the base line, the axis titles */
export function frame(a: FrameIn): Frame {
  const { rect, ctx } = a;
  const gap = ctx.phone ? 4 : 6, keyH = a.keyH ?? 0;
  const titleH = a.yLabel ? LINE + 2 : 0;
  const top = keyH + (keyH ? 6 : 0) + titleH + (a.topExtra ?? 0) + (a.yLabel ? 11 : 6);
  const bottom = a.lines * LINE + 8 + (a.xLabel ? LINE + 2 : 0);
  const h = Math.max(60, rect.h - top - bottom);
  const count = Math.max(3, Math.min(6, Math.floor(h / 40)));
  const scale = durationScale(a.lo, a.hi, count, a.fmt, a.zero) ?? linearScale(a.lo, a.hi, count, { zero: a.zero, whole: a.whole });
  // charts2: on a phone a millisecond axis drops the unit from its ticks ("100", "200", "300") and names it in the axis title: "response (ms)"
  const bareMs = ctx.phone && !a.tick && a.fmt.format === "duration-ms" && scale.ticks.every((t) => Math.abs(t) < 1000);
  const word = a.tick ?? (bareMs ? (t: number) => String(t) : (t: number) => tickOf(a.fmt, t));
  const yTitle = bareMs && a.yLabel && !/\(ms\)/.test(a.yLabel) ? `${a.yLabel} (ms)` : a.yLabel;
  const tw = Math.max(0, ...scale.ticks.map((t) => ctx.measure(word(t), "sub")));
  const left = Math.ceil(tw) + gap + 2;
  const plot: Rect = { x: rect.x + left, y: rect.y + top, w: Math.max(40, rect.w - left - 8), h };
  const y = (v: number): number => plot.y + (1 - scale.at(v)) * plot.h;
  const decor: Prim[] = [];
  for (const t of scale.ticks) {
    const p = y(t), k = keyOf(String(t));
    decor.push({ k: "path", key: `g:y:${k}`, d: `M${r2(plot.x)} ${r2(p)}L${r2(plot.x + plot.w)} ${r2(p)}`, role: null, width: "thin", cls: "kd-grid" });
    decor.push({ k: "text", key: `t:y:${k}`, x: r2(plot.x - gap), y: r2(p + 4), lines: [word(t)], font: "sub", anchor: "end", ink: "muted", cls: "kd-tick" });
  }
  const by = plot.y + plot.h;
  decor.push({ k: "path", key: "axis:base", d: `M${r2(plot.x)} ${r2(by)}L${r2(plot.x + plot.w)} ${r2(by)}`, role: null, width: "thin", cls: "kd-axis" });
  if (a.yLabel) decor.push({ k: "text", key: "title:y", x: rect.x, y: rect.y + keyH + (keyH ? 6 : 0) + LINE - 3, lines: [yTitle], font: "sub", anchor: "start", ink: "muted", cls: "kd-title" });
  if (a.xLabel) decor.push({ k: "text", key: "title:x", x: r2(plot.x + plot.w), y: rect.y + rect.h - 3, lines: [a.xLabel], font: "sub", anchor: "end", ink: "muted", cls: "kd-title" });
  return { plot, scale, y, decor, top, bare: bareMs };
}

/** the key of a histogram with several series: a swatch and a name each, wrapped to rows */
export function seriesKey(items: { name: string; tone: string }[], rect: Rect, ctx: KCtx): { prims: Prim[]; h: number } {
  const prims: Prim[] = [];
  let x = 0, row = 0;
  items.forEach((it, i) => {
    const w = 18 + ctx.measure(it.name, "sub") + 14;
    if (x > 0 && x + w > rect.w) { x = 0; row++; }
    const p = paint(it.tone), cy = rect.y + row * (LINE + 2) + LINE / 2 + 1;
    prims.push({ k: "rect", key: `key:${i}:g`, rect: { x: r2(rect.x + x), y: r2(cy - 5), w: 12, h: 10 }, fill: "role", role: p.role, tone: p.tone, edge: "none", r: 3, cls: `kd-key ${p.cls}` });
    prims.push({ k: "text", key: `key:${i}:t`, x: r2(rect.x + x + 18), y: r2(cy + 4), lines: [it.name], font: "sub", anchor: "start", ink: "muted", cls: "kd-keytext" });
    x += w;
  });
  return { prims, h: items.length ? (row + 1) * (LINE + 2) : 0 };
}

/** a chip's width: its words and the stage's chip padding */
export const chipWidth = (words: string, ctx: KCtx): number => Math.ceil(ctx.measure(words, "chip" as Font)) + 14;
export const CHIP_H = 18;
/** a chip primitive sits at its centre (x) and the baseline of its words (y), 13 px under its top, as the xy charts' goal chips and the chart painter draw it */
const CHIP_BASE = 13;

/** the dashed marks (p50, p95 ...): a line over the whole plot and a chip with the name, one popover each. `vertical`: the value is on the
 *  x axis (a histogram); else on the y axis. */
export function markPrims(marks: Mark[], plot: Rect, pos: (v: number) => number, vertical: boolean, ctx: KCtx): { prims: Prim[]; marks: KMark[] } {
  const prims: Prim[] = [], out: KMark[] = [];
  marks.forEach((m, i) => {
    const k = `mark:${i}`, cw = Math.max(34, chipWidth(m.label, ctx));
    const p = pos(m.value);
    if (vertical) {
      prims.push({ k: "path", key: `${k}:l`, d: `M${r2(p)} ${r2(plot.y - 4)}L${r2(p)} ${r2(plot.y + plot.h)}`, role: null, dashed: true, width: "line", cls: "kd-mark" });
      prims.push({ k: "chip", key: `${k}:c`, x: r2(Math.min(plot.x + plot.w - cw, Math.max(plot.x, p - 20)) + cw / 2), y: r2(plot.y - 22 + CHIP_BASE), words: m.label, role: null, cls: "kd-chip" });
      out.push({ key: k, kind: "mark", rect: { x: r2(p - 12), y: r2(plot.y - 24), w: 24, h: r2(plot.h + 24) }, title: m.label, text: m.text });
    } else {
      prims.push({ k: "path", key: `${k}:l`, d: `M${r2(plot.x)} ${r2(p)}L${r2(plot.x + plot.w)} ${r2(p)}`, role: null, dashed: true, width: "line", cls: "kd-mark" });
      prims.push({ k: "chip", key: `${k}:c`, x: r2(plot.x + plot.w - cw / 2), y: r2(p - 22 + CHIP_BASE), words: m.label, role: null, cls: "kd-chip" });
      out.push({ key: k, kind: "mark", rect: { x: r2(plot.x), y: r2(p - 24), w: r2(plot.w), h: 36 }, title: m.label, text: m.text });
    }
  });
  return { prims, marks: out };
}
