// Annotations on a chart, like Grafana's (pass 11, DESIGN 4.3): our own Chart.js plugin. It draws the lines and bands on the canvas
// and tells the page where each one is, so the page can put a real button over it (keyboard, tap, popover). The canvas text of
// chartjs-plugin-annotation is not used: its labels have no keyboard and no token look.
import type { Ann } from "../core/chart11";

export interface AnnOpts {
  anns: Ann[];
  time: boolean;
  /** a CSS colour for a tone word, soft or base, read from the tokens */
  colour: (tone: string, kind: "base" | "soft") => string;
  dark: boolean;
  onLayout: (rects: AnnRect[]) => void;
  /** half the distance between neighbouring x values, in the units of the axis (a hover this close to an event shows it) */
  tol: number;
}
export interface AnnRect { i: number; kind: Ann["kind"]; x: number; x2: number; y: number; y2: number; plot: { left: number; right: number; top: number; bottom: number }; /** a goal's label keeps off the data: x and y pairs of the drawn lines and points (p11 pagecharts) */ pts?: number[] }
/** where the visible line series are drawn: their points and, between two points, a point about every 12 px (flat x, y pairs; at most 600 pairs) */
export function dataPoints(chart: any): number[] {
  const out: number[] = [];
  const cap = 1200;
  chart.data.datasets.forEach((ds: any, i: number) => {
    if (!chart.isDatasetVisible(i)) return;
    const type = String(ds.type ?? chart.config.type);
    if (type !== "line" && type !== "scatter") return;
    let px = NaN, py = NaN;
    for (const el of chart.getDatasetMeta(i).data as any[]) {
      const x = el.x, y = el.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { px = NaN; continue; }
      if (type === "line" && Number.isFinite(px)) { const n = Math.floor(Math.hypot(x - px, y - py) / 12); for (let k = 1; k <= n; k++) out.push(px + ((x - px) * k) / (n + 1), py + ((y - py) * k) / (n + 1)); }
      out.push(x, y); px = x; py = y;
    }
  });
  if (out.length <= cap) return out.map((v) => Math.round(v));
  const stride = Math.ceil(out.length / 2 / (cap / 2)), thin: number[] = [];
  for (let k = 0; k < out.length; k += 2 * stride) thin.push(Math.round(out[k]), Math.round(out[k + 1]));
  return thin;
}

const xPix = (chart: any, v: number) => chart.scales.x.getPixelForValue(v);
function bandHalf(chart: any, time: boolean): number {
  if (time) return 0;
  const s = chart.scales.x, n = (chart.data.labels ?? []).length;
  if (n < 2) return 0;
  return Math.abs(s.getPixelForValue(1) - s.getPixelForValue(0)) / 2;
}
export function layoutAnns(chart: any, o: AnnOpts): AnnRect[] {
  const a = chart.chartArea;
  if (!a || !chart.scales.x) return [];
  const half = bandHalf(chart, o.time);
  const bar = chart.config.type === "bar" && !o.time;
  const out: AnnRect[] = [];
  const pts = o.anns.some((n) => n.kind === "threshold") ? dataPoints(chart) : undefined;
  o.anns.forEach((n, i) => {
    const plot = { left: a.left, right: a.right, top: a.top, bottom: a.bottom };
    if (n.kind === "event") { const x = xPix(chart, n.from!); out.push({ i, kind: "event", x, x2: x, y: a.bottom, y2: a.top, plot }); }
    else if (n.kind === "range") {
      const h = bar ? half : 0;
      out.push({ i, kind: "range", x: Math.max(a.left, xPix(chart, n.from!) - h), x2: Math.min(a.right, xPix(chart, n.to!) + h), y: a.bottom, y2: a.top, plot });
    } else {
      const ys = chart.scales[n.axis];
      if (!ys) return;
      const p1 = ys.getPixelForValue(n.y!), p2 = n.y2 !== undefined ? ys.getPixelForValue(n.y2) : p1;
      // a goal that stops at a time (p11 pagecharts) is drawn between its two times only
      const h = bar && n.goal && n.from !== undefined ? half : 0;
      const x = n.goal && n.from !== undefined ? Math.max(a.left, xPix(chart, n.from) - h) : a.left, x2 = n.goal && n.to !== undefined ? Math.min(a.right, xPix(chart, n.to) + h) : a.right;
      out.push({ i, kind: "threshold", x, x2, y: Math.max(p1, p2), y2: Math.min(p1, p2), plot, pts });
    }
  });
  return out;
}
/** the page's own options for a chart's annotations (functions, so not in the Chart.js options), by canvas */
export const ANN_OPTS = new WeakMap<object, AnnOpts>();
export const annPlugin = {
  id: "dhAnn",
  afterUpdate(chart: any) { const o = ANN_OPTS.get(chart.canvas); if (o?.anns?.length) o.onLayout(layoutAnns(chart, o)); },
  beforeDatasetsDraw(chart: any) {
    const o = ANN_OPTS.get(chart.canvas);
    if (!o?.anns?.length) return;
    const ctx = chart.ctx, a = chart.chartArea;
    const rects = layoutAnns(chart, o);
    ctx.save(); ctx.beginPath(); ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); ctx.clip();
    for (const r of rects) {
      const n = o.anns[r.i];
      if (n.kind === "range") { ctx.globalAlpha = o.dark ? 0.35 : 0.55; ctx.fillStyle = o.colour(n.tone, "soft"); ctx.fillRect(r.x, a.top, Math.max(2, r.x2 - r.x), a.bottom - a.top); }
      else if (n.kind === "threshold") {
        const band = n.y2 !== undefined;
        ctx.globalAlpha = o.dark ? 0.3 : 0.5; ctx.fillStyle = o.colour(n.tone, "soft");
        if (band) ctx.fillRect(r.x, r.y2, r.x2 - r.x, r.y - r.y2);
        else if (n.fill === "above") ctx.fillRect(r.x, a.top, r.x2 - r.x, Math.max(0, r.y - a.top));
        else if (n.fill === "below") ctx.fillRect(r.x, r.y, r.x2 - r.x, Math.max(0, a.bottom - r.y));
      }
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart: any) {
    const o = ANN_OPTS.get(chart.canvas);
    if (!o?.anns?.length) return;
    const ctx = chart.ctx, a = chart.chartArea;
    const rects = layoutAnns(chart, o);
    ctx.save(); ctx.beginPath(); ctx.rect(a.left - 1, a.top - 1, a.right - a.left + 2, a.bottom - a.top + 2); ctx.clip();
    ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    for (const r of rects) {
      const n = o.anns[r.i];
      ctx.strokeStyle = o.colour(n.tone, "base"); ctx.globalAlpha = 0.95;
      ctx.beginPath();
      if (n.kind === "event") { ctx.moveTo(r.x, a.top); ctx.lineTo(r.x, a.bottom); }
      else if (n.kind === "range") { ctx.moveTo(r.x, a.top); ctx.lineTo(r.x, a.bottom); ctx.moveTo(r.x2, a.top); ctx.lineTo(r.x2, a.bottom); ctx.globalAlpha = 0.5; }
      else { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x2, r.y); if (n.y2 !== undefined) { ctx.moveTo(r.x, r.y2); ctx.lineTo(r.x2, r.y2); } }
      ctx.stroke();
    }
    ctx.restore();
  },
};
/** the annotations a hover at x (an axis value) is near: events at that x, and ranges that hold it; these join the chart's tooltip */
export function annsNear(anns: Ann[], x: number, tol: number): Ann[] {
  return anns.filter((n) => (n.kind === "event" && Math.abs(n.from! - x) <= tol) || (n.kind === "range" && x >= n.from! - tol && x <= n.to! + tol));
}
