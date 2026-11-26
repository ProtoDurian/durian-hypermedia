// bar, line and area (grouped, stacked, 100% stacked, floating, horizontal, mixed, second axis, time axis).
import type { Prim, Rect } from "../../types";
import { keyOf, tickText } from "../axis";
import { makeFrame, r2, LINE_PX, type Ctx, type Frame } from "./frame";
import { readMax, readXy, type Ser, type XyModel } from "./model";
import { annotations, buildKey, catTitle, keyPrims, litCls, valueText, type Built, type Mark } from "./shared";
import type { ChartSpec } from "../../types";

type P = [number, number];

/** a smooth path through points: gentle cubic curves (tension 0.25), never past the two points they join */
export function curve(pts: P[], first: boolean, straight = false): string {
  if (!pts.length) return "";
  let d = first ? `M${r2(pts[0][0])} ${r2(pts[0][1])}` : "";
  if (straight) { for (let i = 1; i < pts.length; i++) d += `L${r2(pts[i][0])} ${r2(pts[i][1])}`; return pts.length === 1 && !first ? `L${r2(pts[0][0])} ${r2(pts[0][1])}` : d; }
  if (pts.length === 1) return d + (first ? "" : `L${r2(pts[0][0])} ${r2(pts[0][1])}`);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const c1y = Math.max(lo, Math.min(hi, p1[1] + (p2[1] - p0[1]) * 0.25 / 1.0 * 0.5)), c2y = Math.max(lo, Math.min(hi, p2[1] - (p3[1] - p1[1]) * 0.25 / 1.0 * 0.5));
    const dx = (p2[0] - p1[0]) / 3;
    d += `C${r2(p1[0] + dx)} ${r2(c1y)} ${r2(p2[0] - dx)} ${r2(c2y)} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d;
}
/** runs of points between gaps */
export function runs(pts: (P | null)[]): P[][] {
  const out: P[][] = []; let cur: P[] = [];
  for (const p of pts) { if (p) cur.push(p); else if (cur.length) { out.push(cur); cur = []; } }
  if (cur.length) out.push(cur);
  return out;
}

export function markerPrims(key: string, kind: string, x: number, y: number, role: string, r: number): Prim[] {
  switch (kind) {
    case "none": return [];
    case "square": return [{ k: "box", key, shape: "box", rect: { x: r2(x - r), y: r2(y - r), w: 2 * r, h: 2 * r }, role, tone: null, cls: "xy-marker" }];
    case "diamond": return [{ k: "box", key, shape: "diamond", rect: { x: r2(x - r - 1), y: r2(y - r - 1), w: 2 * r + 2, h: 2 * r + 2 }, role, tone: null, cls: "xy-marker" }];
    case "triangle": return [{ k: "path", key, d: `M${r2(x)} ${r2(y - r - 1)}L${r2(x + r + 1)} ${r2(y + r)}L${r2(x - r - 1)} ${r2(y + r)}Z`, role, width: "line", fill: "role", cls: "xy-marker" }];
    case "plus": return [{ k: "path", key, d: `M${r2(x - r - 1)} ${r2(y)}L${r2(x + r + 1)} ${r2(y)}M${r2(x)} ${r2(y - r - 1)}L${r2(x)} ${r2(y + r + 1)}`, role, width: "line", cls: "xy-marker" }];
    case "cross": return [{ k: "path", key, d: `M${r2(x - r)} ${r2(y - r)}L${r2(x + r)} ${r2(y + r)}M${r2(x + r)} ${r2(y - r)}L${r2(x - r)} ${r2(y + r)}`, role, width: "line", cls: "xy-marker" }];
    default: return [{ k: "dot", key, x: r2(x), y: r2(y), r, role, cls: "xy-marker" }];
  }
}

/** the pixel points of a line series (null where it has no value) */
export function linePoints(m: XyModel, f: Frame, s: Ser, top?: number[]): (P | null)[] {
  if (s.pts) return s.pts.map((p) => (Number.isFinite(p.y) && f.time ? ([f.time(p.x), f.val(s.axis, p.y)] as P) : null));
  return s.y.map((v, i) => { const y = top ? top[i] : v; return Number.isFinite(y) ? ([f.mid(i), f.val(s.axis, y)] as P) : null; });
}

export function linePrims(f: Frame, s: Ser, pts: (P | null)[], base: number[] | null, area: boolean, withMarkers: boolean): Prim[] {
  const out: Prim[] = [], rs = runs(pts);
  const dashed = s.line === "dashed";
  const cls = s.line === "dotted" ? "xy-line xy-dotted" : "xy-line";
  const k = keyOf(s.name) || `s${s.i}`;
  const st = !!f.scale[s.axis]?.log; // a curve between points of a log axis would misstate the data
  if (area) {
    // the polygon: the top curve, then back along the base (0, or the series below when stacked)
    const bottom = f.val(s.axis, 0), floor = Math.max(f.plot.y, Math.min(f.plot.y + f.plot.h, Number.isFinite(bottom) ? bottom : f.plot.y + f.plot.h));
    let d = "";
    for (const run of rs) {
      const idx = run.map((p) => pts.indexOf(p));
      const back: P[] = idx.map((i) => [pts[i]![0], base ? base[i] : floor] as P).reverse();
      d += curve(run, true, st) + `L${r2(back[0][0])} ${r2(back[0][1])}` + (base ? curve(back, false, st) : `L${r2(back[back.length - 1][0])} ${r2(back[back.length - 1][1])}`) + "Z";
    }
    out.push({ k: "path", key: `a:${k}`, d: d || "M0 0", role: s.role, width: "thin", fill: "soft", cls: "xy-area" });
  }
  out.push({ k: "path", key: `l:${k}`, d: rs.map((r) => curve(r, true, st)).join("") || "M0 0", role: s.role, dashed, width: "line", cls });
  if (withMarkers && s.marker !== "none") {
    const r = s.marker ? 4 : 2.5;
    pts.forEach((p, i) => { if (p) out.push(...markerPrims(`m:${k}:${s.pts ? i : keyOf(f.n ? String(i) : "")}`, s.marker || "circle", p[0], p[1], s.role, r)); });
  }
  return out;
}

export function buildCategory(spec: ChartSpec, values: number[][], rect: Rect, ctx: Ctx): Built {
  const m = readXy(spec, values);
  const horizontal = m.horizontal;
  const vis = m.sers.filter((s) => !s.hidden);
  const bars = vis.filter((s) => s.kind === "bar");
  const key = buildKey(m, rect, ctx);
  const mx = ctx.max?.length ? readMax(spec, ctx.max) : undefined;
  // charts2: a chart of lines only does not force 0 into its value axis (format/48: loans of 760 to 1000 sat in the top quarter); bars,
  // areas and stacks still start at 0. Decided from every series, hidden or not, so hiding one never moves the base. A chart with steps
  // or controls (`mx`, the largest numbers of every state) keeps 0: its lowest number moves from state to state and the scale must not.
  const linesOnly = !mx && !m.stacked && m.sers.length > 0 && m.sers.every((s) => s.kind === "line");
  const f = makeFrame({ m, mx, rect, ctx, keyH: key.h, zeroBase: !linesOnly, bandBars: bars.length > 0 });
  const kp = keyPrims(key.items, { x: rect.x, y: rect.y + (m.title ? LINE_PX + 4 : 0), w: rect.w, h: key.h });
  const an = annotations(m, f, ctx);
  const prims: Prim[] = [...an.under, ...f.decor];
  const marks: Mark[] = [...kp.marks];
  const n = m.x.length;

  // ---- stacks: cumulative tops and bottoms per series
  const main = m.kind === "area" ? "area" : m.kind;
  const stackable = (s: Ser) => s.kind === main && s.axis === "y" && s.lo === null && !s.pts;
  const total = m.x.map((_, i) => vis.filter(stackable).reduce((a, s) => a + (Number.isFinite(s.y[i]) ? Math.abs(s.y[i]) : 0), 0));
  const top: Record<number, number[]> = {}, bot: Record<number, number[]> = {};
  if (m.stacked) {
    const pos = m.x.map(() => 0), neg = m.x.map(() => 0);
    for (const s of vis.filter(stackable)) {
      top[s.i] = []; bot[s.i] = [];
      s.y.forEach((raw, i) => {
        const v = Number.isFinite(raw) ? (m.stacked === "percent" && total[i] ? (100 * raw) / total[i] : raw) : 0;
        if (v >= 0) { bot[s.i][i] = pos[i]; pos[i] += v; top[s.i][i] = pos[i]; } else { bot[s.i][i] = neg[i]; neg[i] += v; top[s.i][i] = neg[i]; }
        if (!Number.isFinite(raw)) top[s.i][i] = bot[s.i][i];
      });
    }
  }

  // ---- bars
  const slots = m.stacked ? bars.filter((s) => !stackable(s)).length + (bars.some(stackable) ? 1 : 0) : bars.length;
  let slot = 0; const stackSlot = new Map<number, number>();
  for (const s of bars) { if (m.stacked && stackable(s)) { if (!stackSlot.has(-1)) stackSlot.set(-1, slot++); stackSlot.set(s.i, stackSlot.get(-1)!); } else stackSlot.set(s.i, slot++); }
  const groupW = Math.min(f.size * 0.82, slots * 84), slotW = groupW / Math.max(1, slots), barW = Math.min(slotW * 0.9, 76);
  const barPrims: Prim[] = [], labelPrims: Prim[] = [];
  for (const s of bars) {
    const j = stackSlot.get(s.i) ?? 0, sk = keyOf(s.name) || `s${s.i}`;
    for (let i = 0; i < n; i++) {
      const c = f.mid(i) - groupW / 2 + j * slotW + (slotW - barW) / 2;
      let lo: number, hi: number;
      const raw = s.y[i];
      if (m.stacked && stackable(s)) { lo = bot[s.i][i]; hi = top[s.i][i]; if (hi < lo) [lo, hi] = [hi, lo]; }
      else if (s.lo) { lo = s.lo[i]; hi = raw; }
      else { lo = 0; hi = raw; if (hi < lo) [lo, hi] = [hi, lo]; }
      const empty = !Number.isFinite(hi) || !Number.isFinite(lo);
      const a = empty ? f.val(s.axis, 0) : f.val(s.axis, lo), b = empty ? a : f.val(s.axis, hi);
      let r: Rect;
      if (horizontal) r = { x: r2(Math.min(a, b)), y: r2(c), w: r2(Math.abs(b - a)), h: r2(barW) };
      else r = { x: r2(c), y: r2(Math.min(a, b)), w: r2(barW), h: r2(Math.abs(b - a)) };
      const rad = Math.max(0, Math.min(5, (horizontal ? r.h : r.w) / 2, (horizontal ? r.w : r.h) / 2));
      barPrims.push({ k: "rect", key: `b:${keyOf(m.x[i]) || i}:${sk}`, rect: r, fill: "role", role: s.role, edge: "none", r: rad, cls: (empty ? "xy-bar xy-gap" : "xy-bar") + litCls(ctx, m.x[i]) });
      if (m.showValues && !empty) {
        const label = tickText(s.lo ? hi : raw, m.ax.y.format, m.ax.y.currency);
        const w = ctx.measure(label, "small-b");
        const inside = !!(m.stacked && stackable(s));
        if (horizontal ? (inside ? r.w > w + 6 : true) : w <= slotW + 10) {
          if (horizontal) labelPrims.push({ k: "text", key: `v:${keyOf(m.x[i]) || i}:${sk}`, x: inside ? r.x + r.w / 2 : r.x + r.w + 4, y: r.y + r.h / 2 + 4, lines: [label], font: "small-b", anchor: inside ? "middle" : "start", ink: "ink", cls: "xy-value" });
          else if (!inside || r.h > 18) labelPrims.push({ k: "text", key: `v:${keyOf(m.x[i]) || i}:${sk}`, x: r.x + r.w / 2, y: inside ? r.y + r.h / 2 + 4 : r.y - 4, lines: [label], font: "small-b", anchor: "middle", ink: "ink", cls: "xy-value" });
        }
      }
    }
  }
  prims.push(...barPrims);

  // ---- areas, lines and their markers
  const withMarkers = true;
  for (const s of vis.filter((x) => x.kind === "area" || x.kind === "line")) {
    const area = s.kind === "area";
    const stacked = !!m.stacked && stackable(s);
    const pts = linePoints(m, f, s, stacked ? top[s.i] : undefined);
    const base = stacked ? (bot[s.i] ?? []).map((v) => f.val(s.axis, v)) : null;
    prims.push(...linePrims(f, { ...s, marker: s.marker }, pts, base, area, withMarkers));
  }
  prims.push(...an.over, ...labelPrims, ...kp.prims);

  // ---- marks: one per category, the way a hover lists every series at that place
  marks.push(...an.marks);
  for (let i = 0; i < n; i++) {
    const lines: string[] = [];
    for (const s of vis) {
      if (s.pts) continue;
      const raw = s.y[i];
      if (!Number.isFinite(raw)) continue;
      const ax = s.axis;
      let t: string;
      if (s.lo) t = `${valueText(m, s.lo[i], ax)} to ${valueText(m, raw, ax)}`;
      else if (m.stacked === "percent" && stackable(s)) t = `${Math.round((100 * raw / (total[i] || 1)) * 10) / 10}% (${valueText(m, raw, ax)})`;
      else t = valueText(m, raw, ax);
      lines.push(`${s.name}: ${t}`);
    }
    const mid = f.mid(i), sz = f.size;
    marks.push({ key: `cat:${keyOf(m.x[i]) || i}`, kind: "bar", title: catTitle(m, i), text: lines.join("\n"),
      rect: horizontal ? { x: f.plot.x, y: mid - sz / 2, w: f.plot.w, h: sz } : (() => { const x0 = Math.max(f.plot.x, mid - sz / 2), x1 = Math.min(f.plot.x + f.plot.w, mid + sz / 2); return { x: x0, y: f.plot.y, w: Math.max(1, x1 - x0), h: f.plot.h }; })() }); // eng-stagebars: a time axis's first and last points sit on the plot's edge: the hit area stays inside it
  }
  for (const s of vis) if (s.pts) s.pts.forEach((p, i) => { if (f.time && Number.isFinite(p.y)) marks.push({ key: `pt:${keyOf(s.name)}:${i}`, kind: "point", title: s.name, meta: String(p.x), text: valueText(m, p.y, s.axis), series: s.i, rect: { x: f.time(p.x) - 8, y: f.val(s.axis, p.y) - 8, w: 16, h: 16 } }); });
  return { prims, marks };
}
