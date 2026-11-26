// Reads a ChartSpec + numbers (types.ts ChartDraw) into the one model every xy kind draws from.
// The input words are listed in ./INPUT.md (what `opts` and the number layout mean). Pure.
import type { ChartSpec } from "../../types";
import { parseTime } from "../../../core/chart-time";

export type SerKind = "bar" | "line" | "area" | "candles" | "scatter" | "bubble";
export type AxisId = "y" | "y2";
export interface AxisInfo { /** the reader can switch this axis between log and linear: the room for its tick words is the larger of the two */ toggle?: boolean; unit?: string; every?: number; label: string; min?: number; max?: number; log: boolean; time: boolean; format: string; currency: string }
export interface Pt { x: number; y: number; r?: number }
export interface Ser {
  i: number; name: string; role: string; kind: SerKind; axis: AxisId;
  line: "solid" | "dashed" | "dotted"; marker: string; hidden: boolean;
  /** category kinds: one number per category (NaN = no value); a floating bar's low end is `lo`, its high end `y` */
  y: number[]; lo: number[] | null;
  /** scatter, bubble, and category series written as (time, value) points */
  pts: Pt[] | null;
  /** candles: [open, high, low, close] per period (null = none) */
  candles: (number[] | null)[] | null;
}
export interface Ann {
  kind: "event" | "range" | "threshold"; label: string; text: string; tone: string; when: string;
  from?: number; to?: number; y?: number; y2?: number; axis: AxisId; fill?: "above" | "below"; goal?: boolean;
}
export interface XyModel {
  kind: string; x: string[]; xt: number[] | null; tz: string;
  sers: Ser[]; ax: { x: AxisInfo; y: AxisInfo; y2: AxisInfo };
  horizontal: boolean; stacked: false | true | "percent"; showValues: boolean; hasY2: boolean;
  /** the author's own ticks of the value axis (a stage bar chart's `axis 0, 0.5, 1`) */
  axisTicks: number[] | null; title: string | null;
  anns: Ann[]; heat: { diverge?: number; tone?: string };
  words: Record<string, string>;
  /** the names of every series the story ever shows (`key.reserve`, JSON): the key keeps room for them all, so a step that adds a series does not move the plot */
  keyReserve: string[];
}

const num = (s: string | undefined): number | undefined => { if (s === undefined || s === "") return undefined; const n = Number(s); return Number.isFinite(n) ? n : undefined; };
const axisOf = (o: Record<string, string>, id: string): AxisInfo => ({
  toggle: o[`${id}.toggle`] === "1", unit: o[`${id}.unit`], every: num(o[`${id}.every`]), label: o[`${id}.label`] ?? "", min: num(o[`${id}.min`]), max: num(o[`${id}.max`]),
  log: o[`${id}.scale`] === "log", time: o[`${id}.scale`] === "time", format: o[`${id}.format`] ?? "number", currency: o[`${id}.currency`] ?? "USD",
});
export const DEFAULT_WORDS: Record<string, string> = { open: "Open", high: "High", low: "Low", close: "Close", up: "Up: close at or above open", down: "Down: close below open", size: "Size", empty: "no value" };

/** the colour role of series k when it names none: c1..c8 (a ninth starts again) */
export const defaultRole = (k: number): string => `c${(k % 8) + 1}`;

export function readXy(spec: ChartSpec, values: number[][]): XyModel {
  const o = spec.opts ?? {};
  const kind = spec.kind;
  const ax = { x: axisOf(o, "x"), y: axisOf(o, "y"), y2: axisOf(o, "y2") };
  const tz = o.tz || "UTC";
  const flags = new Set(spec.flags ?? []);
  const hiddenSet = new Set((o.hidden ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(Number));
  const words = { ...DEFAULT_WORDS };
  for (const k of Object.keys(DEFAULT_WORDS)) if (o[`word.${k}`]) words[k] = o[`word.${k}`];
  const category = kind === "bar" || kind === "line" || kind === "area" || kind === "candlestick";
  const x = spec.x.map(String);
  const sers: Ser[] = [];
  spec.series.forEach((s, i) => {
    const v = values[i] ?? s.values ?? [];
    const pfx = `s${i}.`;
    const own = (o[pfx + "kind"] as SerKind | "line" | undefined);
    const serKind: SerKind = kind === "candlestick" ? (own === "line" ? "line" : "candles") : kind === "scatter" || kind === "bubble" ? kind : (own ?? (kind as SerKind));
    const base: Ser = {
      i, name: s.name, role: s.role ?? o[pfx + "tone"] ?? defaultRole(i), kind: serKind, axis: o[pfx + "axis"] === "y2" ? "y2" : "y",
      line: o[pfx + "line"] === "dashed" || o[pfx + "line"] === "dotted" ? (o[pfx + "line"] as "dashed" | "dotted") : "solid",
      marker: o[pfx + "marker"] ?? "", hidden: hiddenSet.has(i), y: [], lo: null, pts: null, candles: null,
    };
    if (serKind === "scatter" || serKind === "bubble") {
      const w = serKind === "bubble" ? 3 : 2, pts: Pt[] = [];
      for (let j = 0; j + w <= v.length; j += w) pts.push({ x: v[j], y: v[j + 1], ...(w === 3 ? { r: v[j + 2] } : {}) });
      base.pts = pts;
    } else if (serKind === "candles") {
      base.candles = x.map((_, j) => { const c = v.slice(4 * j, 4 * j + 4); return c.length === 4 && c.every(Number.isFinite) ? c : null; });
    } else if (o[pfx + "points"] === "1") {
      const pts: Pt[] = [];
      for (let j = 0; j + 2 <= v.length; j += 2) pts.push({ x: v[j], y: v[j + 1] });
      base.pts = pts;
    } else if (o[pfx + "range"] === "1") {
      base.lo = x.map((_, j) => v[2 * j] ?? NaN); base.y = x.map((_, j) => v[2 * j + 1] ?? NaN);
    } else base.y = x.map((_, j) => (Number.isFinite(v[j]) ? v[j] : NaN));
    sers.push(base);
  });
  // a time axis: the categories are times; a series of (time, value) points carries its own
  let xt: number[] | null = null;
  if (ax.x.time && category) {
    const t = x.map((s) => parseTime(s, tz));
    if (t.every((v) => v !== null)) xt = t as number[];
  }
  const anns: Ann[] = [];
  if (o.ann) { try { const a = JSON.parse(o.ann); if (Array.isArray(a)) for (const n of a) if (n && typeof n === "object") anns.push({ kind: n.kind, label: String(n.label ?? ""), text: String(n.text ?? ""), tone: String(n.tone ?? "accent"), when: String(n.when ?? ""), from: n.from, to: n.to, y: n.y, y2: n.y2, axis: n.axis === "y2" ? "y2" : "y", fill: n.fill, goal: !!n.goal }); } catch { /* a bad list draws none; the parse lane reports it */ } }
  // a unit (a stage bar chart's `| ×`) is kept on the value ticks and in the numbers
  if (spec.unit && ax.y.format === "number") ax.y.format = `unit:${spec.unit}`;
  // reference lines (`line average: 1`, one per line): solid goal lines named by their words
  for (const l of (o.line ?? "").split("\n")) { const mm = /^\s*(.+?):\s*(-?[\d.]+)\s*$/.exec(l); if (mm) anns.push({ kind: "threshold", label: mm[1], text: "", tone: "muted", when: "", y: Number(mm[2]), axis: "y", goal: true }); }
  const axisTicks = (o.axis ?? "").split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  return {
    axisTicks: axisTicks.length >= 2 ? axisTicks : null, title: o.showTitle === "1" && spec.title ? spec.title : null,
    kind, x, xt, tz, sers, ax, horizontal: flags.has("horizontal"),
    stacked: flags.has("percent") ? "percent" : flags.has("stacked") ? true : false,
    showValues: flags.has("values"), hasY2: sers.some((s) => s.axis === "y2") || !!o["y2.label"] || o["y2.scale"] !== undefined,
    anns, heat: { diverge: num(o["heat.diverge"]), tone: o["heat.tone"] }, words,
    keyReserve: (() => { try { const a = JSON.parse(o["key.reserve"] ?? "[]"); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } })(),
  };
}

/** the model of the largest numbers over every state the reader can reach (ChartCtx.max). A control may add categories (a slider that sets
 *  how many bars there are), so the numbers of categories past this state's own count count for the scale too (eng-stagebars) */
export function readMax(spec: ChartSpec, max: number[][]): XyModel {
  const plain = (spec.kind === "bar" || spec.kind === "line" || spec.kind === "area") && !Object.keys(spec.opts ?? {}).some((k) => /^s\d+\.(range|points)$/.test(k));
  const n = plain ? Math.max(spec.x.length, ...max.map((r) => r.length)) : spec.x.length;
  return readXy(n > spec.x.length ? { ...spec, x: Array.from({ length: n }, (_, i) => spec.x[i] ?? String(i + 1)) } : spec, max);
}
