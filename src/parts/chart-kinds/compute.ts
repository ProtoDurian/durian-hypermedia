// The chart kinds, read: one chart's YAML value to the numbers every reader uses (doccheck, the LLM view and the browser
// all draw from this one result). Pure. Every loop over author data charges the budget it is given before the work.
// A wrong chart still returns: its errors say the line's key and the fix, and no view is made.
import type { Budget } from "../../core/budget";
import { COLOUR_WORDS } from "../kit/text";
import { FORMATS, fmtValue, unitOf } from "./fmt";
import { boxStats, kde, quantile, sortNum, sunburstLayout, treemapLayout, type Stat, type TNode } from "./layout";

export const KINDS = ["histogram", "boxplot", "violin", "funnel", "waterfall", "treemap", "sunburst", "calendar"];
/** the caps one parse reads (from ctx.limits) */
export interface Caps { values: number; violinValues: number; bins: number; categories: number; series: number; marks: number; stages: number; steps: number; treeNodes: number; treeDepth: number; days: number; label: number }
export type CapsSource = { chartKindsValues: number; chartKindsViolinValues: number; chartKindsBins: number; chartKindsCategories: number; chartKindsSeries: number; chartKindsMarks: number; chartKindsStages: number; chartKindsSteps: number; chartKindsTreeNodes: number; chartKindsTreeDepth: number; chartKindsDays: number; chartKindsLabel: number };
export const capsOf = (l: CapsSource): Caps => ({ values: l.chartKindsValues, violinValues: l.chartKindsViolinValues, bins: l.chartKindsBins, categories: l.chartKindsCategories, series: l.chartKindsSeries, marks: l.chartKindsMarks, stages: l.chartKindsStages, steps: l.chartKindsSteps, treeNodes: l.chartKindsTreeNodes, treeDepth: l.chartKindsTreeDepth, days: l.chartKindsDays, label: l.chartKindsLabel });

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

export const TONES = ["1", "2", "3", "4", "5", "6", "7", "8", "accent", ...COLOUR_WORDS];
/** a tone as the family word the CSS tokens use: 3 and c3 are c3, accent is acc */
export const toneWord = (t: unknown, dflt = "acc"): string => { const s = String(t ?? dflt); return s.length === 1 && s >= "1" && s <= "8" ? `c${s}` : s === "accent" ? "acc" : s; };
const FAMILY = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];

const COMMON = ["kind", "title", "steps", "tone"];
const KEYS: Record<string, string[]> = {
  histogram: [...COMMON, "x", "y", "data", "series", "bins", "bin", "from", "to", "marks"],
  boxplot: [...COMMON, "x", "y", "data", "marks"],
  violin: [...COMMON, "x", "y", "data", "marks", "bandwidth"],
  funnel: [...COMMON, "y", "data"],
  waterfall: [...COMMON, "x", "y", "data"],
  treemap: [...COMMON, "y", "data", "depth"],
  sunburst: [...COMMON, "y", "data", "depth"],
  calendar: [...COMMON, "y", "data", "from", "to", "week"],
};
const STEP_KEYS = ["title", "data", "series", "marks", "bins", "bin", "from", "to", "tone", "depth", "bandwidth"];
const AXIS_KEYS = ["label", "format", "currency", "values"];

export interface Fmt { format: string; currency?: string }
export interface Mark { label: string; value: number; text: string }
export interface Day { date: string; day: number; value: number | null; col: number; row: number }
export type View =
  | { kind: "histogram"; title: string; xLabel: string; yLabel: string; fmt: Fmt; edges: number[]; series: { name: string; tone: string; counts: number[]; n: number }[]; marks: Mark[]; skipped: number }
  | { kind: "boxplot" | "violin"; title: string; xLabel: string; yLabel: string; fmt: Fmt; tone: string; stats: Stat[]; kde?: { at: number[]; dens: number[] }[]; densMax?: number; marks: Mark[] }
  | { kind: "funnel"; title: string; yLabel: string; fmt: Fmt; tone: string; stages: { name: string; value: number; ofFirst: number; ofPrev: number | null }[] }
  | { kind: "waterfall"; title: string; xLabel: string; yLabel: string; fmt: Fmt; rows: { name: string; change: number; total: number; from: number; to: number; type: "start" | "up" | "down" | "total" }[] }
  | { kind: "treemap" | "sunburst"; title: string; yLabel: string; fmt: Fmt; tone: string; nodes: TNode[]; depth: number }
  | { kind: "calendar"; title: string; yLabel: string; fmt: Fmt; tone: string; days: Day[]; cols: number; week: "mon" | "sun"; lo: number; hi: number; months: { label: string; col: number; ym: string }[]; from: string; to: string };
/** an error or a warning: the top-level key of the chart it is about (the line it names), and what to do */
export interface Issue { key: string; msg: string }
export interface Computed { errors: Issue[]; warnings: Issue[]; view?: View; stepTitle?: string }
interface Ctx extends Computed { b: Budget; caps: Caps }
const err = (c: Ctx, key: string, msg: string) => { c.errors.push({ key, msg }); };

// ---------------------------------------------------------------- reading
function readFmt(axis: any, name: string, c: Ctx): Fmt {
  if (!isObj(axis) || (axis.format === undefined && axis.currency === undefined)) return { format: "number" };
  const f = axis.format === undefined ? "number" : String(axis.format);
  if (!FORMATS.includes(f)) { err(c, name, `${name}.format must be one of ${FORMATS.join(", ")} (got ${JSON.stringify(axis.format)})`); return { format: "number" }; }
  if (axis.currency !== undefined) {
    if (f !== "money") { err(c, name, `${name}.currency goes with format: money; add it or remove currency`); return { format: f }; }
    const cur = axis.currency;
    let ok = typeof cur === "string" && cur.length === 3;
    if (ok) for (const ch of cur) if (ch < "A" || ch > "Z") ok = false;
    if (!ok) { err(c, name, `${name}.currency must be an ISO 4217 code such as EUR (got ${JSON.stringify(cur)})`); return { format: f }; }
    try { new Intl.NumberFormat("en", { style: "currency", currency: cur }); } catch { err(c, name, `${name}.currency "${cur}" is not a currency code`); }
  }
  return { format: f, currency: f === "money" ? (axis.currency ?? "USD") : undefined };
}
const axisLabel = (a: any, dflt = "") => (isObj(a) && typeof a.label === "string" ? a.label : dflt);
function checkAxis(a: any, name: string, c: Ctx) {
  if (a === undefined) return;
  if (!isObj(a)) { err(c, name, `${name} must be an object such as { label: Latency, format: duration-ms }`); return; }
  for (const k of Object.keys(a)) if (!AXIS_KEYS.includes(k)) err(c, name, `${name}: unknown key "${k}" (keys: ${AXIS_KEYS.join(", ")})`);
  if (a.label !== undefined && typeof a.label !== "string") err(c, name, `${name}.label must be text`);
}
function readTone(d: any, c: Ctx, dflt: string): string {
  if (d.tone === undefined) return dflt;
  if (!TONES.includes(String(d.tone))) { err(c, "tone", `tone must be c1 to c8 (or 1 to 8), acc, good, warn, bad or muted (got ${JSON.stringify(d.tone)})`); return dflt; }
  return toneWord(d.tone);
}
function numberList(v: any, what: string, key: string, c: Ctx, max: number): number[] | null {
  if (!Array.isArray(v)) { err(c, key, `${what} must be a list of numbers, like [12, 15, 18]`); return null; }
  if (v.length === 0) { err(c, key, `${what} is empty; give at least one number`); return null; }
  if (v.length > max) { err(c, key, `${what} has ${v.length} values; at most ${max} (aggregate them, or keep a sample)`); return null; }
  c.b.charge(v.length, v.length);
  for (let i = 0; i < v.length; i++) if (!num(v[i])) { err(c, key, `${what}[${i + 1}] is ${JSON.stringify(v[i])}, not a number; every value must be a number`); return null; }
  return v as number[];
}
/** "p95" or "p99.9": the number after the p (a percentile written as one or two digits, optionally a point and digits), else null */
function percentOf(s: string): number | null {
  if (s.length < 2 || s[0] !== "p" || s.length > 12) return null;
  let i = 1, whole = 0;
  while (isDigit(s[i])) { i++; whole++; }
  if (whole < 1 || whole > 2) return null;
  if (i < s.length) { if (s[i] !== ".") return null; i++; let f = 0; while (isDigit(s[i])) { i++; f++; } if (!f || i !== s.length) return null; }
  return Number(s.slice(1));
}
/** marks: p50, p95, p99.9, mean, or a plain number; each becomes a dashed line with its label */
function readMarks(d: any, pooled: () => number[], fmt: Fmt, c: Ctx): Mark[] {
  if (d.marks === undefined) return [];
  if (!Array.isArray(d.marks)) { err(c, "marks", `marks must be a list such as [p50, p95, p99] (percentiles of the data, or plain numbers)`); return []; }
  if (d.marks.length > c.caps.marks) { err(c, "marks", `at most ${c.caps.marks} marks (this chart has ${d.marks.length}); keep the ones that matter`); return []; }
  c.b.charge(d.marks.length);
  const out: Mark[] = [];
  let sorted: number[] | null = null;
  const all = () => (sorted ??= pooled());
  d.marks.forEach((m: any, i: number) => {
    if (num(m)) { out.push({ label: fmtValue(m, fmt.format, fmt.currency), value: m, text: `A fixed line at ${fmtValue(m, fmt.format, fmt.currency)}.` }); return; }
    const s = String(m), p = percentOf(s);
    if (s === "mean") { const a = all(); c.b.charge(a.length); let t = 0; for (const x of a) t += x; out.push({ label: "mean", value: t / a.length, text: `The mean of ${a.length} values.` }); return; }
    if (p === null || p <= 0 || p >= 100) { err(c, "marks", `marks[${i + 1}] ${JSON.stringify(m)} is not a mark; write p50, p95, p99.9 (a percentile above 0 and below 100), mean, or a number`); return; }
    const a = all(), v = quantile(a, p / 100);
    out.push({ label: s, value: v, text: `${s.slice(1)}% of the ${a.length} values are at or below ${fmtValue(v, fmt.format, fmt.currency)}.` });
  });
  return out;
}

// ---------------------------------------------------------------- histogram
function histogram(d: any, c: Ctx): View | undefined {
  const cap = c.caps;
  const fmt = readFmt(d.x, "x", c);
  const tone = readTone(d, c, "c1");
  if (d.data !== undefined && d.series !== undefined) { err(c, "series", `give the values as data (one set) or as series (up to ${cap.series} sets, drawn over each other), not both`); return; }
  let sets: { name: string; values: number[] }[] = [];
  if (d.series !== undefined) {
    if (!Array.isArray(d.series) || d.series.length === 0) { err(c, "series", `series must be a list of { name, data: [numbers] }`); return; }
    if (d.series.length > cap.series) { err(c, "series", `at most ${cap.series} series on a histogram (this one has ${d.series.length}); keep the ones that compare`); return; }
    let total = 0;
    for (let i = 0; i < d.series.length; i++) {
      const s = d.series[i];
      if (!isObj(s) || typeof s.name !== "string") { err(c, "series", `series ${i + 1} needs a name and data: { name: Before, data: [12, 15, 18] }`); return; }
      for (const k of Object.keys(s)) if (!["name", "data", "tone"].includes(k)) err(c, "series", `series "${s.name}": unknown key "${k}" (keys: name, data, tone)`);
      if (s.tone !== undefined && !TONES.includes(String(s.tone))) { err(c, "series", `series "${s.name}": tone must be c1 to c8, acc, good, warn, bad or muted (got ${JSON.stringify(s.tone)})`); return; }
      const v = numberList(s.data, `series "${s.name}" data`, "series", c, cap.values - total);
      if (!v) return;
      total += v.length;
      sets.push({ name: s.name, values: v });
    }
  } else {
    if (d.data === undefined) { err(c, "kind", `a histogram needs data: [the raw values, one per observation]`); return; }
    const v = numberList(d.data, "data", "data", c, cap.values);
    if (!v) return;
    sets = [{ name: axisLabel(d.y, "Count") || "Count", values: v }];
  }
  if (d.bins !== undefined && d.bin !== undefined) { err(c, "bins", `give bins (how many) or bin (how wide), not both`); return; }
  if (d.bins !== undefined && (!Number.isInteger(d.bins) || d.bins < 1)) { err(c, "bins", `bins must be a whole number from 1 to ${cap.bins} (got ${JSON.stringify(d.bins)})`); return; }
  if (d.bins !== undefined && d.bins > cap.bins) { err(c, "bins", `bins is ${d.bins}; at most ${cap.bins} (a wider bin tells the story better)`); return; }
  if (d.bin !== undefined && (!num(d.bin) || d.bin <= 0)) { err(c, "bin", `bin must be a number above 0 (the width of one bin, got ${JSON.stringify(d.bin)})`); return; }
  for (const k of ["from", "to"]) if (d[k] !== undefined && !num(d[k])) { err(c, k, `${k} must be a number (the ${k === "from" ? "lowest" : "highest"} value the bins cover)`); return; }
  let lo = Infinity, hi = -Infinity, count = 0;
  for (const s of sets) count += s.values.length;
  c.b.charge(count);
  for (const s of sets) for (const v of s.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (d.from !== undefined) lo = d.from;
  if (d.to !== undefined) hi = d.to;
  if (!(hi > lo)) { if (hi === lo && d.from === undefined && d.to === undefined) { hi = lo + 1; } else { err(c, "from", `from must be below to (got ${lo} and ${hi})`); return; } }
  let n = d.bins ?? 20;
  if (d.bin !== undefined) {
    n = Math.ceil((hi - lo) / d.bin - 1e-9);
    if (n > cap.bins) { err(c, "bin", `bin ${d.bin} over the range ${lo} to ${hi} makes ${n} bins; at most ${cap.bins} (use a wider bin)`); return; }
    n = Math.max(1, n);
  }
  const width = d.bin !== undefined ? d.bin : (hi - lo) / n;
  c.b.charge(n + 1, (n + 1) * (sets.length + 1));
  const edges: number[] = [];
  for (let i = 0; i <= n; i++) edges.push(lo + width * i);
  let skipped = 0;
  const series = sets.map((s, si) => {
    const counts: number[] = new Array(n).fill(0);
    c.b.charge(s.values.length);
    for (const v of s.values) {
      if (v < lo || v > edges[n] + (d.bin === undefined ? 1e-9 : 0)) { skipped++; continue; }
      counts[Math.min(n - 1, Math.floor((v - lo) / width))]++;
    }
    return { name: s.name, tone: sets.length > 1 ? toneWord(d.series[si].tone, FAMILY[si]) : tone, counts, n: s.values.length };
  });
  if (skipped) c.warnings.push({ key: "from", msg: `${skipped} value${skipped === 1 ? " is" : "s are"} outside from and to, so they are not counted` });
  const marks = readMarks(d, () => { const all: number[] = []; for (const s of sets) for (const v of s.values) all.push(v); return sortNum(all, c.b); }, fmt, c);
  return { kind: "histogram", title: String(d.title ?? ""), xLabel: axisLabel(d.x), yLabel: axisLabel(d.y, "Count"), fmt, edges, series, marks, skipped };
}

// ---------------------------------------------------------------- box plot and violin
function boxLike(d: any, c: Ctx): View | undefined {
  const cap = c.caps;
  const fmt = readFmt(d.y, "y", c);
  const tone = readTone(d, c, "c1");
  if (d.data === undefined) { err(c, "kind", `a ${d.kind} needs data: [[values for the first category], [values for the second], ...]`); return; }
  if (!Array.isArray(d.data) || d.data.length === 0 || !d.data.every(Array.isArray)) { err(c, "data", `data must be a list with one list of numbers per category: [[12, 15], [9, 14, 20]]`); return; }
  if (d.data.length > cap.categories) { err(c, "data", `at most ${cap.categories} categories (this chart has ${d.data.length}); keep the ones that compare`); return; }
  const names = isObj(d.x) && Array.isArray(d.x.values) ? d.x.values.map(String) : null;
  if (!names) { err(c, "x", `name the categories with x: { values: [Mon, Tue, ...] }, one per list in data`); return; }
  if (names.length !== d.data.length) { err(c, "x", `x.values has ${names.length} names but data has ${d.data.length} lists; give one name per list`); return; }
  const max = d.kind === "violin" ? cap.violinValues : cap.values;
  let total = 0;
  const lists: number[][] = [];
  for (let i = 0; i < d.data.length; i++) {
    const v = numberList(d.data[i], `data[${i + 1}] (${names[i]})`, "data", c, max - total);
    if (!v) return;
    total += v.length; lists.push(v);
  }
  if (d.bandwidth !== undefined && (!num(d.bandwidth) || d.bandwidth <= 0)) { err(c, "bandwidth", `bandwidth must be a number above 0 (how smooth the violin is, in the units of the data)`); return; }
  const stats = lists.map((v, i) => boxStats(names[i], v, c.b));
  const out: View = { kind: d.kind, title: String(d.title ?? ""), xLabel: axisLabel(d.x), yLabel: axisLabel(d.y), fmt, tone, stats, marks: [] };
  if (d.kind === "violin") {
    let top = 0;
    out.kde = lists.map((v) => { const k = kde(sortNum(v, c.b), d.bandwidth, c.b); for (const x of k.dens) if (x > top) top = x; return { at: k.at, dens: k.dens }; });
    out.densMax = top;
  }
  out.marks = readMarks(d, () => { const all: number[] = []; for (const l of lists) for (const v of l) all.push(v); return sortNum(all, c.b); }, fmt, c);
  return out;
}

// ---------------------------------------------------------------- funnel
function funnel(d: any, c: Ctx): View | undefined {
  const cap = c.caps;
  const fmt = readFmt(d.y, "y", c);
  const tone = readTone(d, c, "acc");
  if (!Array.isArray(d.data) || d.data.length < 2) { err(c, "data", `a funnel needs data: a list of at least 2 stages, each [name, count] or { name, value }`); return; }
  if (d.data.length > cap.stages) { err(c, "data", `at most ${cap.stages} stages (this funnel has ${d.data.length}); merge some`); return; }
  c.b.charge(d.data.length, d.data.length);
  const raw: { name: string; value: number }[] = [];
  for (let i = 0; i < d.data.length; i++) {
    const s = d.data[i];
    const name = Array.isArray(s) ? s[0] : isObj(s) ? s.name : undefined;
    const value = Array.isArray(s) ? s[1] : isObj(s) ? s.value : undefined;
    if (Array.isArray(s) && s.length !== 2) { err(c, "data", `stage ${i + 1} is a list of ${s.length}; write [name, count]`); return; }
    if (typeof name !== "string" || !name) { err(c, "data", `stage ${i + 1} needs a name: [Visited, 12000] or { name: Visited, value: 12000 }`); return; }
    if (!num(value) || value < 0) { err(c, "data", `stage "${name}" needs a count that is a number of 0 or more (got ${JSON.stringify(value)})`); return; }
    raw.push({ name, value });
  }
  if (raw[0].value <= 0) { err(c, "data", `the first stage "${raw[0].name}" must be above 0: the other stages are shown as shares of it`); return; }
  raw.forEach((s, i) => { if (i && s.value > raw[i - 1].value) c.warnings.push({ key: "data", msg: `stage "${s.name}" (${s.value}) is larger than "${raw[i - 1].name}" (${raw[i - 1].value}); a funnel's stages usually fall` }); });
  return { kind: "funnel", title: String(d.title ?? ""), yLabel: axisLabel(d.y, "Count"), fmt, tone, stages: raw.map((s, i) => ({ ...s, ofFirst: s.value / raw[0].value, ofPrev: i ? (raw[i - 1].value ? s.value / raw[i - 1].value : null) : null })) };
}

// ---------------------------------------------------------------- waterfall
function waterfall(d: any, c: Ctx): View | undefined {
  const cap = c.caps;
  const fmt = readFmt(d.y, "y", c);
  if (d.tone !== undefined) err(c, "tone", `a waterfall colours rises, falls and totals by what they are (good, bad, accent); remove tone`);
  if (!Array.isArray(d.data) || d.data.length < 2) { err(c, "data", `a waterfall needs data: [100, 20, -35, "="]: a start, changes up and down, and "=" where a total shows`); return; }
  if (d.data.length > cap.categories) { err(c, "data", `at most ${cap.categories} steps (this waterfall has ${d.data.length}); merge some`); return; }
  const names = isObj(d.x) && Array.isArray(d.x.values) ? d.x.values.map(String) : null;
  if (!names) { err(c, "x", `name the steps with x: { values: [Start, Hiring, ...] }, one per entry in data`); return; }
  if (names.length !== d.data.length) { err(c, "x", `x.values has ${names.length} names but data has ${d.data.length} entries; give one name per entry`); return; }
  c.b.charge(d.data.length, d.data.length);
  const rows: Extract<View, { kind: "waterfall" }>["rows"] = [];
  let run = 0;
  for (let i = 0; i < d.data.length; i++) {
    const v = d.data[i];
    if (v === "=" || v === "total") {
      if (i === 0) { err(c, "data", `the first entry is the start, a number; "=" shows a total after some changes`); return; }
      rows.push({ name: names[i], change: run, total: run, from: 0, to: run, type: "total" });
    } else if (num(v)) {
      if (i === 0) { run = v; rows.push({ name: names[i], change: v, total: v, from: 0, to: v, type: "start" }); }
      else { rows.push({ name: names[i], change: v, total: run + v, from: run, to: run + v, type: v >= 0 ? "up" : "down" }); run += v; }
    } else { err(c, "data", `data[${i + 1}] (${names[i]}) is ${JSON.stringify(v)}; write a number, or "=" for a total`); return; }
  }
  return { kind: "waterfall", title: String(d.title ?? ""), xLabel: axisLabel(d.x), yLabel: axisLabel(d.y), fmt, rows };
}

// ---------------------------------------------------------------- treemap and sunburst: one tree
/** the tree as a flat list, parents before children, each level sorted by size; iterative, so a deep input cannot
 *  overflow the stack, and it stops at the depth cap (a tree written as a pattern costs no more than the cap allows) */
export function flattenTree(data: any, rootName: string, c: Ctx): TNode[] | null {
  const roots = Array.isArray(data) ? data : [data];
  const nodes: TNode[] = [];
  const make = (name: string, parent: number, depth: number, path: string): TNode => { const n: TNode = { id: nodes.length, name, value: 0, depth, parent, children: [], tone: "", path, share: 1 }; nodes.push(n); if (parent >= 0) nodes[parent].children.push(n.id); return n; };
  const top = make(rootName, -1, 0, "");
  if (!roots.length) { err(c, "data", `data is empty; give { name, value } or { name, children: [...] }`); return null; }
  c.b.charge(roots.length);
  const stack: { raw: any; parent: number; depth: number; path: string }[] = [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ raw: roots[i], parent: 0, depth: 1, path: "" });
  while (stack.length) {
    const { raw, parent, depth, path } = stack.pop()!;
    c.b.charge(2, 2);
    if (!isObj(raw)) { err(c, "data", `${path || "an entry"} must be an object { name, value } or { name, children }`); return null; }
    const keys = Object.keys(raw);
    c.b.charge(keys.length);
    for (const k of keys) if (!["name", "value", "children", "tone"].includes(k)) { err(c, "data", `${typeof raw.name === "string" && raw.name ? `"${raw.name.slice(0, 30)}"` : "an entry"}: unknown key "${k.slice(0, 30)}" (keys: name, value, children, tone)`); return null; }
    if (typeof raw.name !== "string" || !raw.name.trim()) { err(c, "data", `${path ? `inside ${path}: ` : ""}an entry has no name; write { name: Backend, value: 40 }`); return null; }
    if (raw.name.length > c.caps.label) { err(c, "data", `the name "${raw.name.slice(0, 30)}..." is ${raw.name.length} characters; keep names to ${c.caps.label}`); return null; }
    if (depth > c.caps.treeDepth) { err(c, "data", `"${path} / ${raw.name}" is nested ${depth} levels deep; at most ${c.caps.treeDepth} (flatten the branch, or keep the levels that matter)`); return null; }
    if (nodes.length > c.caps.treeNodes) { err(c, "data", `more than ${c.caps.treeNodes} entries; keep the big ones and group the rest as one entry`); return null; }
    const here = path ? `${path} / ${raw.name}` : raw.name;
    c.b.charge(0, 0, here.length);
    const n = make(raw.name, parent, depth, here);
    if (raw.tone !== undefined) {
      if (depth !== 1) { err(c, "data", `"${here}": tone goes on a top-level entry; its branch takes it`); return null; }
      if (!TONES.includes(String(raw.tone))) { err(c, "data", `"${here}": tone must be c1 to c8, acc, good, warn, bad or muted (got ${JSON.stringify(raw.tone)})`); return null; }
      n.tone = toneWord(raw.tone);
    }
    const kids = raw.children;
    if (kids !== undefined && (!Array.isArray(kids) || kids.length === 0)) { err(c, "data", `"${here}": children must be a non-empty list (or leave it out and give a value)`); return null; }
    if (kids) {
      c.b.charge(kids.length);
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ raw: kids[i], parent: n.id, depth: depth + 1, path: here });
    } else {
      if (!num(raw.value) || raw.value <= 0) { err(c, "data", `"${here}" needs a value above 0 (or children): { name: ${raw.name}, value: 12 }`); return null; }
      n.value = raw.value;
    }
  }
  // a branch is the sum of what is in it: children come after their parent, so one pass from the end sums every level
  c.b.charge(3 * nodes.length, nodes.length);
  for (let i = nodes.length - 1; i > 0; i--) { const n = nodes[i]; if (n.children.length) { let s = 0; for (const k of n.children) s += nodes[k].value; n.value = s; } }
  let sum = 0;
  for (const k of top.children) sum += nodes[k].value;
  top.value = sum;
  c.b.charge(nodes.length * Math.max(1, Math.ceil(Math.log2(nodes.length + 1))));
  for (const n of nodes) { n.children.sort((a, b) => nodes[b].value - nodes[a].value || a - b); n.share = top.value ? n.value / top.value : 0; }
  // a branch takes the colour of its top-level entry (the author's tone, or the family in order of size); parents come first
  top.children.forEach((k, i) => { if (!nodes[k].tone) nodes[k].tone = FAMILY[i % 8]; });
  for (const n of nodes) if (n.depth > 1) n.tone = nodes[n.parent].tone;
  top.tone = "acc";
  return nodes;
}
function treeKind(d: any, c: Ctx): View | undefined {
  const fmt = readFmt(d.y, "y", c);
  if (d.tone !== undefined) err(c, "tone", `${d.kind} colours each branch from its top-level entry; set tone on an entry in data, not on the chart`);
  if (d.data === undefined) { err(c, "kind", `a ${d.kind} needs data: a tree { name, value } (leaves) or { name, children: [...] }`); return; }
  const depth = d.depth === undefined ? (d.kind === "treemap" ? 2 : 3) : d.depth;
  if (!Number.isInteger(depth) || depth < 1 || depth > (d.kind === "treemap" ? 4 : 5)) { err(c, "depth", `depth must be a whole number from 1 to ${d.kind === "treemap" ? 4 : 5} (how many levels show at once; the rest open when you click)`); return; }
  const nodes = flattenTree(d.data, "All", c);
  if (!nodes) return;
  // run the layout once now, so that its work is charged to the page and a bad tree is refused here
  if (d.kind === "treemap") treemapLayout(nodes, 0, 720, 420, depth, c.b); else sunburstLayout(nodes, 0, depth, c.b);
  return { kind: d.kind, title: String(d.title ?? ""), yLabel: axisLabel(d.y, "Size"), fmt, tone: "acc", nodes, depth };
}

// ---------------------------------------------------------------- calendar heatmap
/** days since 1970-01-01 of "YYYY-MM-DD" (a real date), or null */
export function dayNum(s: string): number | null {
  if (s.length !== 10 || s[4] !== "-" || s[7] !== "-") return null;
  for (let i = 0; i < 10; i++) if (i !== 4 && i !== 7 && !isDigit(s[i])) return null;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), dd = +s.slice(8, 10);
  const t = Date.UTC(y, m - 1, dd);
  const x = new Date(t);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === dd ? Math.round(t / 86400000) : null;
}
export const dateOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const asDate = (v: unknown): number | null => (typeof v === "string" ? dayNum(v) : v instanceof Date && Number.isFinite(v.getTime()) ? dayNum(v.toISOString().slice(0, 10)) : null);
function calendar(d: any, c: Ctx): View | undefined {
  const fmt = readFmt(d.y, "y", c);
  const tone = readTone(d, c, "acc");
  if (!Array.isArray(d.data) || d.data.length === 0) { err(c, "data", `a calendar needs data: [["2026-11-20", 4], ...], one pair of a date and a number per day`); return; }
  if (d.data.length > c.caps.days) { err(c, "data", `at most ${c.caps.days} days of data (this has ${d.data.length}); show a year at a time`); return; }
  const week = d.week === undefined ? "mon" : d.week;
  if (week !== "mon" && week !== "sun") { err(c, "week", `week must be mon or sun (the day a week starts on, got ${JSON.stringify(d.week)})`); return; }
  c.b.charge(d.data.length * 2, d.data.length);
  const byDay = new Map<number, number>();
  let first = Infinity, last = -Infinity;
  for (let i = 0; i < d.data.length; i++) {
    const p = d.data[i];
    if (!Array.isArray(p) || p.length !== 2) { err(c, "data", `data[${i + 1}] must be a pair [date, number], like ["2026-11-20", 4]`); return; }
    const dn = asDate(p[0]);
    if (dn === null) { err(c, "data", `data[${i + 1}] ${JSON.stringify(typeof p[0] === "string" ? p[0].slice(0, 30) : p[0])} is not a date; write it as 2026-11-20 (year-month-day)`); return; }
    if (!num(p[1])) { err(c, "data", `data[${i + 1}] (${dateOf(dn)}) needs a number (got ${JSON.stringify(p[1])})`); return; }
    if (byDay.has(dn)) { err(c, "data", `the date ${dateOf(dn)} is in data twice (data[${i + 1}]); add the two numbers into one`); return; }
    byDay.set(dn, p[1]);
    if (dn < first) first = dn;
    if (dn > last) last = dn;
  }
  for (const k of ["from", "to"] as const) if (d[k] !== undefined) { const v = asDate(d[k]); if (v === null) { err(c, k, `${k} must be a date like 2026-01-01 (got ${JSON.stringify(typeof d[k] === "string" ? d[k].slice(0, 30) : d[k])})`); return; } if (k === "from") first = v; else last = v; }
  if (first > last) { err(c, "from", `from ${dateOf(first)} is after to ${dateOf(last)}; swap them`); return; }
  for (const k of byDay.keys()) if (k < first || k > last) { err(c, "data", `the date ${dateOf(k)} in data is outside from and to (${dateOf(first)} to ${dateOf(last)}); widen them or remove it`); return; }
  if (last - first + 1 > c.caps.days) { err(c, "to", `from and to cover ${last - first + 1} days; at most ${c.caps.days} (show a year at a time)`); return; }
  // weeks run in columns; the first column starts on the week's first day on or before `first`
  const dow = (n: number) => ((n + 4) % 7 + 7) % 7; // 0 = Sunday (1970-01-01 was a Thursday)
  const row = (n: number) => (week === "sun" ? dow(n) : (dow(n) + 6) % 7);
  const startCol0 = first - row(first);
  const days: Day[] = [];
  let lo = Infinity, hi = -Infinity;
  c.b.charge(2 * (last - first + 1), last - first + 1, 10 * (last - first + 1));
  for (let n = first; n <= last; n++) {
    const v = byDay.get(n) ?? null;
    if (v !== null) { if (v < lo) lo = v; if (v > hi) hi = v; }
    days.push({ date: dateOf(n), day: n, value: v, col: Math.floor((n - startCol0) / 7), row: row(n) });
  }
  const cols = days[days.length - 1].col + 1;
  const months: { label: string; col: number; ym: string }[] = [];
  let lastYm = "";
  for (const day of days) {
    const ym = day.date.slice(0, 7);
    if (ym !== lastYm && (day.row === 0 || !months.length)) { months.push({ label: MONTHS[+ym.slice(5) - 1], col: day.col, ym }); lastYm = ym; }
    else if (ym !== lastYm) { lastYm = ym; months.push({ label: MONTHS[+ym.slice(5) - 1], col: day.col + 1, ym }); }
  }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  return { kind: "calendar", title: String(d.title ?? ""), yLabel: axisLabel(d.y, "Value"), fmt, tone, days, cols, week, lo, hi, months, from: dateOf(first), to: dateOf(last) };
}

// ---------------------------------------------------------------- one chart, with its steps
const BUILD: Record<string, (d: any, c: Ctx) => View | undefined> = { histogram, boxplot: boxLike, violin: boxLike, funnel, waterfall, treemap: treeKind, sunburst: treeKind, calendar };
function checkKeys(d: any, c: Ctx) {
  const keys = Object.keys(d);
  c.b.charge(1 + keys.length);
  for (const k of keys) if (!KEYS[d.kind].includes(k)) err(c, k, `unknown key "${k.slice(0, 30)}" for a ${d.kind} (keys: ${KEYS[d.kind].join(", ")})`);
  checkAxis(d.x, "x", c); checkAxis(d.y, "y", c);
  if (d.title !== undefined && typeof d.title !== "string") err(c, "title", `title must be text`);
}
/** the chart a step shows: the chart as written with each step's changes on top of the one before */
function specAt(d: any, k: number, c: Ctx): any {
  const steps: any[] = Array.isArray(d.steps) ? d.steps : [];
  const spec: any = { ...d }; delete spec.steps;
  for (let i = 0; i <= k && i < steps.length; i++) {
    const st = steps[i];
    if (!isObj(st)) { err(c, "steps", `step ${i + 1} must be an object with a title and what it changes (data, marks, ...)`); continue; }
    for (const key of Object.keys(st)) { if (!STEP_KEYS.includes(key)) err(c, "steps", `step ${i + 1}: unknown key "${key.slice(0, 30)}" (keys: ${STEP_KEYS.join(", ")})`); else if (key !== "title") spec[key] = st[key]; }
    if (st.title !== undefined && typeof st.title !== "string") err(c, "steps", `step ${i + 1}: title must be text`);
  }
  return spec;
}
/** compute every step of a chart; `steps[0]` is the chart as written. Charges the budget (a BudgetError goes up to the caller). */
export function compute(d: any, b: Budget, caps: Caps): { errors: Issue[]; warnings: Issue[]; steps: Computed[] } {
  const errors: Issue[] = [], warnings: Issue[] = [], steps: Computed[] = [];
  if (!isObj(d) || !KINDS.includes(d.kind)) return { errors: [{ key: "kind", msg: `kind must be one of ${KINDS.join(", ")}` }], warnings, steps };
  const raw: any[] = Array.isArray(d.steps) ? d.steps : [];
  if (d.steps !== undefined) {
    if (!Array.isArray(d.steps)) errors.push({ key: "steps", msg: `steps must be a list (each with a title, and the data it changes)` });
    else if (raw.length === 1) errors.push({ key: "steps", msg: `a chart with steps needs at least 2 (or none); add a second step, or remove steps` });
    else if (raw.length > caps.steps) errors.push({ key: "steps", msg: `at most ${caps.steps} steps (this chart has ${raw.length}); merge some` });
  }
  if (errors.length) return { errors, warnings, steps };
  const head: Ctx = { b, caps, errors: [], warnings: [] };
  checkKeys(d, head);
  errors.push(...head.errors);
  const n = Math.max(1, raw.length);
  for (let k = 0; k < n; k++) {
    const ctx: Ctx = { b, caps, errors: [], warnings: [], stepTitle: typeof raw[k]?.title === "string" ? raw[k].title : undefined };
    const spec = specAt(d, k, ctx);
    if (!ctx.errors.length) {
      if (k > 0) for (const key of Object.keys(spec)) if (!KEYS[d.kind].includes(key)) err(ctx, "steps", `a ${d.kind} has no ${key} to change in a step`);
      if (!ctx.errors.length) ctx.view = BUILD[d.kind](spec, ctx);
    }
    steps.push({ errors: ctx.errors, warnings: ctx.warnings, view: ctx.view, stepTitle: ctx.stepTitle });
    for (const e of ctx.errors) {
      const msg = n > 1 ? `step ${k + 1}: ${e.msg}` : e.msg;
      if (!errors.some((x) => x.msg === msg) && !(k > 0 && steps[0].errors.some((x) => x.msg === e.msg))) errors.push({ key: k > 0 ? "steps" : e.key, msg });
    }
    if (k === 0) warnings.push(...ctx.warnings);
    if (ctx.errors.length) break;
  }
  return { errors, warnings, steps };
}

// ---------------------------------------------------------------- the LLM view
const mdTable = (cols: string[], rows: string[][]) => {
  const cell = (s: string) => s.split("|").join("\\|").split("\n").join(" ");
  return `| ${cols.map(cell).join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n")}`;
};
export const pct = (x: number) => `${(x * 100) % 1 === 0 ? (x * 100).toFixed(0) : (x * 100).toFixed(1)}%`;
function viewText(v: View): string {
  const f = (x: number) => fmtValue(x, v.fmt.format, v.fmt.currency);
  const unit = unitOf(v.fmt) ? ` (${unitOf(v.fmt)})` : "";
  switch (v.kind) {
    case "histogram": {
      const cols = ["from", "to", ...v.series.map((s) => (v.series.length > 1 ? s.name : "count"))];
      const rows = v.series[0].counts.map((_, i) => [f(v.edges[i]), f(v.edges[i + 1]), ...v.series.map((s) => String(s.counts[i]))]);
      return mdTable(cols, rows) + (v.marks.length ? `\n\nMarks: ${v.marks.map((m) => `${m.label} = ${f(m.value)}`).join(", ")}` : "") + `\n\n${v.series.map((s) => `${s.name}: ${s.n} values`).join("; ")}.`;
    }
    case "boxplot": case "violin": {
      const rows = v.stats.map((s) => [s.name, f(s.min), f(s.q1), f(s.median), f(s.q3), f(s.max), s.outliers.length ? s.outliers.slice(0, 12).map(f).join(", ") + (s.outliers.length > 12 ? `, ... (${s.outliers.length})` : "") : "none"]);
      return mdTable([v.xLabel || "category", `min${unit}`, "p25", "median", "p75", "max", "outliers"], rows) + (v.marks.length ? `\n\nMarks: ${v.marks.map((m) => `${m.label} = ${f(m.value)}`).join(", ")} (over all values)` : "") + `\n\nValues per category: ${v.stats.map((s) => `${s.name} ${s.n}`).join(", ")}.`;
    }
    case "funnel": return mdTable(["stage", `count${unit}`, "of the first", "of the one before"], v.stages.map((s) => [s.name, f(s.value), pct(s.ofFirst), s.ofPrev === null ? "" : pct(s.ofPrev)]));
    case "waterfall": return mdTable(["step", `change${unit}`, "running total"], v.rows.map((r) => [r.name, r.type === "total" ? "total" : r.type === "start" ? `start ${f(r.change)}` : `${r.change >= 0 ? "+" : ""}${f(r.change)}`, f(r.total)]));
    case "treemap": case "sunburst": {
      const lines: string[] = [];
      const stack = [...v.nodes[0].children].reverse();
      while (stack.length) { const id = stack.pop()!; const n = v.nodes[id]; lines.push(`${"  ".repeat(n.depth - 1)}- ${n.name}: ${f(n.value)} (${pct(n.share)})`); for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]); }
      return `${v.yLabel}${unit}, total ${f(v.nodes[0].value)}:\n\n${lines.join("\n")}`;
    }
    case "calendar": {
      const by = new Map<string, Day[]>();
      for (const d of v.days) if (d.value !== null) { const ym = d.date.slice(0, 7); let a = by.get(ym); if (!a) by.set(ym, (a = [])); a.push(d); }
      const rows = [...by.entries()].map(([ym, ds]) => { const best = ds.reduce((a, b) => (b.value! > a.value! ? b : a)); return [`${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`, String(ds.length), f(ds.reduce((a, b) => a + b.value!, 0)), `${best.date} (${f(best.value!)})`]; });
      return `${v.yLabel}${unit} by day, ${v.from} to ${v.to}:\n\n${mdTable(["month", "days with data", "total", "busiest day"], rows)}`;
    }
  }
}
/** what an LLM reads in place of the chart: the table of every step */
export function llmText(kind: string, title: string, steps: Computed[]): string {
  const out: string[] = [`Chart (${kind})${title ? `: ${title}` : ""}`, ""];
  steps.forEach((s, k) => {
    if (steps.length > 1) out.push(`Step ${k + 1}: ${s.stepTitle ?? ""}`.trimEnd(), "");
    out.push(viewText(s.view!));
    if (k < steps.length - 1) out.push("");
  });
  return out.join("\n");
}
