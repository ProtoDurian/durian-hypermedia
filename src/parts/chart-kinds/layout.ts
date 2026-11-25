// The numbers of the chart kinds that are not parsing: quantiles, box statistics, a kernel density, round ticks, and the
// two tree layouts (squarified treemap, sunburst). Pure. Every function that loops over data charges the budget it is
// given (steps for loop turns, values for what it keeps) before it does the work; the view makes a budget of its own for
// the layouts it runs again at a zoom, never the page's.
import type { Budget } from "../../core/budget";

export const KDE_GRID = 48;
export interface Stat { name: string; n: number; min: number; q1: number; median: number; q3: number; max: number; mean: number; lo: number; hi: number; outliers: number[] }
export interface TNode { id: number; name: string; value: number; depth: number; parent: number; children: number[]; tone: string; path: string; share: number }
export interface Rect { id: number; x: number; y: number; w: number; h: number; depth: number; header: boolean }
export interface Arc { id: number; a0: number; a1: number; ring: number }

/** the q-quantile (0 to 1) of sorted values, by linear interpolation between neighbours */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * Math.min(1, Math.max(0, q)), lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
/** a sorted copy; a sort costs about n log n steps, charged first */
export function sortNum(a: number[], b: Budget): number[] {
  b.charge(a.length * Math.max(1, Math.ceil(Math.log2(a.length + 1))), a.length);
  return a.slice().sort((p, q) => p - q);
}
export function boxStats(name: string, values: number[], b: Budget): Stat {
  const s = sortNum(values, b), n = s.length;
  b.charge(4 * n);
  const q1 = quantile(s, 0.25), median = quantile(s, 0.5), q3 = quantile(s, 0.75), iqr = q3 - q1;
  const fenceLo = q1 - 1.5 * iqr, fenceHi = q3 + 1.5 * iqr;
  let lo = s[0], hi = s[n - 1], sum = 0, first = true;
  const outliers: number[] = [];
  for (const v of s) {
    sum += v;
    if (v < fenceLo || v > fenceHi) outliers.push(v);
    else { if (first) { lo = v; first = false; } hi = v; }
  }
  return { name, n, min: s[0], q1, median, q3, max: s[n - 1], mean: sum / n, lo, hi, outliers };
}
/** a Gaussian kernel density of sorted values over `grid` evenly spaced points from min to max */
export function kde(sorted: number[], bandwidth: number | undefined, b: Budget, grid = KDE_GRID): { at: number[]; dens: number[]; h: number } {
  const n = sorted.length, lo = sorted[0], hi = sorted[n - 1];
  b.charge(n * grid + 3 * n, grid * 2);
  let sum0 = 0;
  for (const v of sorted) sum0 += v;
  const mean = sum0 / n;
  let ss = 0;
  for (const v of sorted) ss += (v - mean) ** 2;
  const sd = Math.sqrt(ss / Math.max(1, n - 1));
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  let h = bandwidth ?? 0.9 * Math.min(sd || Infinity, iqr / 1.34 || Infinity) * Math.pow(n, -0.2);
  if (!Number.isFinite(h) || h <= 0) h = (hi - lo) / 10 || 1;
  const at: number[] = [], dens: number[] = [];
  const c = 1 / (n * h * Math.sqrt(2 * Math.PI));
  for (let g = 0; g < grid; g++) {
    const x = hi === lo ? lo : lo + ((hi - lo) * g) / (grid - 1);
    let sum = 0;
    for (let i = 0; i < n; i++) { const z = (x - sorted[i]) / h; sum += Math.exp(-0.5 * z * z); }
    at.push(x); dens.push(sum * c);
  }
  return { at, dens, h };
}
export const niceNum = (x: number, round: boolean): number => {
  const e = Math.floor(Math.log10(x)), f = x / 10 ** e;
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
  return nf * 10 ** e;
};
/** about `count` tick values from lo to hi, on round numbers (the axis may reach a little past both); at most 60 */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceNum((hi - lo) / Math.max(1, count - 1), true);
  const a = Math.floor(lo / step) * step, c = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = a, i = 0; v <= c + step / 2 && i < 60; v += step, i++) out.push(Math.round(v / step) * step);
  return out;
}

// ---- layouts
/** squarified treemap (Bruls, Huizing, van Wijk): rows of tiles whose shapes stay near square. Children come sorted by
 *  size, so a row's largest area is its first and its smallest the last added: each step is O(1), the layout linear. */
function squarify(ids: number[], vals: number[], x: number, y: number, w: number, h: number, b: Budget): { id: number; x: number; y: number; w: number; h: number }[] {
  const out: { id: number; x: number; y: number; w: number; h: number }[] = [];
  let total = 0;
  for (const v of vals) total += v;
  if (total <= 0 || w <= 0 || h <= 0) return out;
  const area = (v: number) => (v / total) * w * h; // the box left over, shared out by what is left to place
  let i = 0;
  b.charge(ids.length * 3, ids.length);
  while (i < ids.length) {
    const side = Math.min(w, h);
    const row = [i];
    let rowArea = area(vals[i]), maxA = rowArea, minA = rowArea;
    const s2 = side * side;
    const worst = (sum: number, mx: number, mn: number) => Math.max((s2 * mx) / (sum * sum), (sum * sum) / (s2 * mn));
    let cur = worst(rowArea, maxA, minA);
    let j = i + 1;
    while (j < ids.length) {
      const a = area(vals[j]);
      const nw = worst(rowArea + a, maxA, Math.min(minA, a));
      if (nw > cur) break;
      row.push(j); rowArea += a; minA = Math.min(minA, a); cur = nw; j++;
    }
    const thick = rowArea / side;
    let off = 0;
    for (const k of row) {
      const len = area(vals[k]) / thick;
      if (w >= h) out.push({ id: ids[k], x, y: y + off, w: thick, h: len }); else out.push({ id: ids[k], x: x + off, y, w: len, h: thick });
      off += len;
    }
    for (const k of row) total -= vals[k];
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    i = j;
  }
  return out;
}
/** the rectangles of the children of `root` (and of theirs, down `levels` levels), in a box w by h; a branch with room keeps a header strip */
export function treemapLayout(nodes: TNode[], root: number, w: number, h: number, levels: number, b: Budget, header = 28, pad = 3): Rect[] {
  const out: Rect[] = [];
  const queue: { id: number; x: number; y: number; w: number; h: number; level: number }[] = [{ id: root, x: 0, y: 0, w, h, level: 0 }];
  for (let qi = 0; qi < queue.length; qi++) {
    const q = queue[qi];
    const n = nodes[q.id];
    b.charge(1);
    if (!n.children.length || q.level >= levels) continue;
    const showHeader = q.level > 0 && q.h > header + 40 && q.w > 70;
    const ix = q.x + (q.level > 0 ? pad : 0), iy = q.y + (q.level > 0 ? (showHeader ? header : pad) : 0);
    const iw = q.w - (q.level > 0 ? pad * 2 : 0), ih = q.h - (q.level > 0 ? (showHeader ? header : pad) + pad : 0);
    const rects = squarify(n.children, n.children.map((c) => nodes[c].value), ix, iy, iw, ih, b);
    for (const r of rects) {
      const rn = nodes[r.id];
      out.push({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, depth: q.level + 1, header: rn.children.length > 0 && q.level + 1 < levels && r.h > header + 40 && r.w > 70 });
      queue.push({ ...r, level: q.level + 1 });
    }
    b.charge(rects.length, rects.length);
  }
  return out;
}
/** the arcs of the descendants of `root`, `levels` rings out; angles in radians from the top, clockwise; ring 1 is next to the centre */
export function sunburstLayout(nodes: TNode[], root: number, levels: number, b: Budget): Arc[] {
  const out: Arc[] = [];
  const queue: { id: number; a0: number; a1: number; ring: number }[] = [{ id: root, a0: 0, a1: Math.PI * 2, ring: 0 }];
  for (let qi = 0; qi < queue.length; qi++) {
    const q = queue[qi];
    const n = nodes[q.id];
    b.charge(1 + n.children.length, n.children.length);
    if (!n.children.length || q.ring >= levels) continue;
    let a = q.a0;
    for (const c of n.children) {
      const span = ((q.a1 - q.a0) * nodes[c].value) / (n.value || 1);
      out.push({ id: c, a0: a, a1: a + span, ring: q.ring + 1 });
      queue.push({ id: c, a0: a, a1: a + span, ring: q.ring + 1 });
      a += span;
    }
  }
  return out;
}

// ---------------------------------------------------------------- labels that never overlap
// The words of an axis are measured (the part's own width table at the 12 px the stylesheet sets) and placed so that no two of them
// overlap at any width: a name that does not fit level is turned upright, and when even upright words are closer than a line,
// every k-th is kept (the rest stay in the card and the LLM view). A value on a bar is kept only where it has the room.
import { textW } from "../kit/text";

/** the font size of an axis word and the height one upright word takes of its band, in px */
export const TICK_PX = 12, LINE_PX = 14;
/** characters kept of an upright word */
export const UPRIGHT_MAX = 14;
export const cutWord = (s: string, n: number): string => (s.length <= n ? s : s.slice(0, Math.max(1, n - 1)) + "…");
/** how the names under the bars fit a band each: all level, all upright, or every k-th upright */
export function xLab(names: string[], band: number): { rot: boolean; every: number; max: number } {
  const widest = Math.max(0, ...names.map((n) => textW(n, TICK_PX)));
  if (widest + 6 <= band) return { rot: false, every: 1, max: 99 };
  return { rot: true, every: Math.max(1, Math.ceil((LINE_PX + 2) / Math.max(1, band))), max: UPRIGHT_MAX };
}
/** the room under the axis an upright name needs: its length, the gap above it and the axis title below it */
export const rotRoom = (names: string[]): number => 10 + Math.ceil(Math.max(0, ...names.map((n) => textW(cutWord(n, UPRIGHT_MAX), TICK_PX)))) + 26;
/** which of these values on bars (text widths at 12 px bold, centres `at`) are drawn: priority ones first, then the rest, each only
 *  where it clears every one already placed by 4 px; the others are in the card and the LLM view */
export function placeValues(items: { text: string; at: number; first?: boolean }[]): boolean[] {
  const shown: [number, number][] = [], out = items.map(() => false);
  const clear = (l: number, r: number) => shown.every(([a, b]) => r + 4 <= a || l >= b + 4);
  for (const pass of [true, false]) items.forEach((it, i) => {
    if (!!it.first !== pass) return;
    const w = textW(it.text, TICK_PX) * 1.1, l = it.at - w / 2, r = it.at + w / 2;
    if (clear(l, r)) { shown.push([l, r]); out[i] = true; }
  });
  return out;
}
/** the x ticks of a numeric axis, left to right, each kept only where it clears the one before by 8 px */
export function fitTicks<T>(xs: T[], at: (x: T) => number, text: (x: T) => string): T[] {
  const out: T[] = [];
  let edge = -Infinity;
  for (const x of xs) {
    const w = textW(text(x), TICK_PX), c = at(x);
    if (c - w / 2 >= edge + 8) { out.push(x); edge = c + w / 2; }
  }
  return out;
}

// ---------------------------------------------------------------- the words on a sunburst's arcs
/** The name written on an arc: whole when it fits along the ring's width (radial) or along its length (tangent), else cut with
 *  "…" to the roomier way, else none (the card has every name). A ring 60 px wide cannot hold "Platform" radially, but its arc is
 *  long, so the word is laid along the arc and nothing is hidden behind the centre or the next ring. */
export function arcLabel(name: string, ringW: number, arcLen: number): { text: string; tangent: boolean } | null {
  const radial = ringW - 8, along = arcLen - 10, w = textW(name, TICK_PX);
  const ok = (room: number, across: number) => across >= LINE_PX && room > 0;   // a word 12 px high needs a line of space across it
  const canRadial = ok(radial, arcLen), canTangent = ok(along, ringW);
  if (canRadial && w <= radial) return { text: name, tangent: false };
  if (canTangent && w <= along) return { text: name, tangent: true };
  const tangent = canTangent && (!canRadial || along > radial), room = tangent ? along : radial;
  if (!(tangent ? canTangent : canRadial)) return null;
  let s = name;
  while (s.length > 1 && textW(s + "…", TICK_PX) > room) s = s.slice(0, -1);
  return s.length >= 2 && textW(s + "…", TICK_PX) <= room ? { text: s + "…", tangent } : null;
}
