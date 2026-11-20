// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// chart-config: turns an evaluated chart (tools/chart.ts) into a Chart.js config. Pure apart from reading CSS tokens
// through the `tok` function it is given, so a test can run it without a browser.
import { chartMeta, type ChartSeries } from "../core/chart";

export type Tok = (name: string) => string;
export interface Look { tok: Tok; narrow: boolean; reduce: boolean }
const BASE_TONES = ["good", "warn", "bad", "muted", "accent"];
const fmt = (v: any) => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })) : String(v ?? ""));
export { fmt as fmtChartNum };
// a log axis labels the powers of ten, and 2 and 5 of each when the axis spans three decades or fewer
const logTick = (narrow: boolean) => function (this: any, v: any) {
  const e = Math.floor(Math.log10(v)), man = Math.round(v / 10 ** e);
  const span = Math.log10(this.max / this.min);
  return man === 1 || (!narrow && span <= 3 && (man === 2 || man === 5)) ? fmt(v) : "";
};

// default colour order: --series-1..5, then --c6..--c8 (a seventh series or slice starts again)
export const defaultColor = (tok: Tok, k: number) => (k % 8 < 5 ? tok(`--series-${(k % 8) + 1}`) : tok(`--c${(k % 8) + 1}`));
export function toneColor(tok: Tok, tone: string | undefined, k: number) {
  if (tone && /^[1-8]$/.test(tone)) return tok(`--c${tone}`);
  if (tone && BASE_TONES.includes(tone)) return tone === "muted" ? tok("--faint") : tone === "accent" ? tok("--acc") : tok(`--${tone}`);
  return defaultColor(tok, k);
}
// long labels wrap onto several lines on a narrow chart
export const wrap = (s: string, n: number): string | string[] => {
  if (s.length <= n) return s;
  const out: string[] = []; let line = "";
  for (const w of s.split(" ")) { if (line && (line + " " + w).length > n) { out.push(line); line = w; } else line = line ? line + " " + w : w; }
  if (line) out.push(line);
  return out;
};

export function chartConfig(spec: any, data: { x: any[]; series: ChartSeries[] }, look: Look): any {
  const { tok, narrow, reduce } = look;
  const m = chartMeta(spec);
  const grid = tok("--grid"), ink = tok("--muted");
  const font = { family: tok("--font-sans") || "system-ui", size: 12 };
  const ticks = { color: ink, font };
  const xl = typeof spec.x === "object" && !Array.isArray(spec.x) ? spec.x : {};
  const yl = spec.y ?? {};
  const title = (o: any) => ({ display: !!o?.label, text: o?.label, color: ink, font });
  const wrapAt = narrow ? 11 : 22;
  const legend = { display: data.series.length > 1 || m.round, position: "top", labels: { color: ink, font, boxWidth: 12, padding: narrow ? 8 : 12 } };
  const options: any = { responsive: true, maintainAspectRatio: false, animation: reduce ? false : { duration: 350 }, plugins: { legend, tooltip: { callbacks: {} } }, scales: {} };
  let type: string;
  let datasets: any[];
  const tipNum = (c: any) => (c.dataset.rawValues ? c.dataset.rawValues[c.dataIndex] : c.raw);

  if (m.round) {
    type = m.kind === "polar" ? "polarArea" : m.kind;
    const alpha = m.kind === "polar" ? "CC" : "";
    datasets = data.series.map((s) => ({ label: s.name, data: s.data, backgroundColor: data.x.map((_, j) => defaultColor(tok, j) + alpha), borderColor: tok("--surface"), borderWidth: 2 }));
    options.plugins.tooltip.callbacks.label = (c: any) => `${c.label}: ${fmt(c.raw)}`;
    if (m.kind === "polar") options.scales = { r: { beginAtZero: true, grid: { color: grid }, angleLines: { color: grid }, ticks: { color: ink, font, backdropColor: "transparent", z: 1 } } };
    options.layout = { padding: 4 };
  } else if (m.kind === "radar") {
    type = "radar";
    datasets = data.series.map((s, k) => { const c = toneColor(tok, s.tone, k); return { label: s.name, data: s.data, borderColor: c, backgroundColor: c + "33", pointBackgroundColor: c, pointBorderColor: tok("--surface"), borderWidth: 2, pointRadius: 3, fill: true }; });
    options.scales = { r: { beginAtZero: true, min: yl.min, max: yl.max, grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: tok("--ink") || ink, font, callback: (l: string) => wrap(l, narrow ? 10 : 18) }, ticks: { color: ink, font, backdropColor: "transparent", showLabelBackdrop: false, maxTicksLimit: 5 } } };
    options.layout = { padding: 4 };
    options.plugins.tooltip.callbacks.label = (c: any) => `${c.dataset.label}: ${fmt(c.raw)}`;
  } else if (m.points) {
    const bubble = m.kind === "bubble";
    type = m.kind;
    const maxR = Math.max(1, ...data.series.flatMap((s) => s.data.map((p: any) => p.r ?? 0)));
    datasets = data.series.map((s, k) => {
      const c = toneColor(tok, s.tone, k);
      return { label: s.name, data: bubble ? s.data.map((p: any) => ({ x: p.x, y: p.y, r: 4 + 20 * Math.sqrt(p.r / maxR), size: p.r })) : s.data, backgroundColor: bubble ? c + "99" : c, borderColor: bubble ? c : tok("--surface"), borderWidth: bubble ? 1.5 : 1, pointRadius: 4, pointHoverRadius: 6 };
    });
    const sc = (o: any, log: boolean) => ({ type: log ? "logarithmic" : "linear", min: o?.min, max: o?.max, grid: { color: grid }, ticks: log ? { ...ticks, callback: logTick(narrow), maxRotation: 0 } : ticks, title: title(o) });
    options.scales = { x: sc(xl, m.scale.x === "log"), y: sc(yl, m.scale.y === "log") };
    options.layout = { padding: bubble ? 14 : 4 };
    options.interaction = { mode: "nearest", intersect: true };
    options.plugins.tooltip.callbacks.label = (c: any) => `${c.dataset.label}: (${fmt(c.raw.x)}, ${fmt(c.raw.y)})${bubble ? `, size ${fmt(c.raw.size)}` : ""}`;
  } else {
    // bar, line, area (grouped, stacked, 100% stacked, floating, horizontal, mixed, second axis)
    type = "bar";
    const percent = m.stacked === "percent";
    const mainType = m.kind === "area" ? "line" : m.kind;
    const typeOf = (s: ChartSeries) => ((s.kind ?? m.kind) === "area" ? "line" : s.kind ?? m.kind);
    const stackable = (s: ChartSeries) => typeOf(s) === mainType && s.axis !== "y2";
    const totals = data.x.map((_, i) => data.series.filter(stackable).reduce((a, s) => a + (typeof s.data[i] === "number" ? Math.abs(s.data[i]) : 0), 0));
    const lastLine: Record<string, number> = {};
    datasets = data.series.map((s, k) => {
      const c = toneColor(tok, s.tone, k);
      const t = typeOf(s), area = (s.kind ?? m.kind) === "area";
      const pct = percent && stackable(s);
      const values = pct ? s.data.map((v: any, i: number) => (typeof v === "number" && totals[i] ? (100 * v) / totals[i] : v)) : s.data;
      const ds: any = {
        type: t, label: s.name, data: values, rawValues: pct ? s.data : undefined,
        backgroundColor: t === "line" ? c + (area ? "40" : "33") : c, borderColor: c, borderWidth: t === "line" ? 2.5 : 0, borderRadius: t === "bar" ? 5 : 0, borderSkipped: false,
        fill: area, tension: 0.25, pointRadius: t === "line" ? 2.5 : 3, order: t === "line" ? 0 : 1,
      };
      if (m.y2) ds.yAxisID = s.axis === "y2" ? "y2" : "y";
      if (m.stacked) ds.stack = stackable(s) ? "main" : `own-${k}`;
      if (m.stacked && area && stackable(s)) { const prev = lastLine[ds.yAxisID ?? "y"]; ds.fill = prev === undefined ? "origin" : prev; lastLine[ds.yAxisID ?? "y"] = k; }
      return ds;
    });
    const cat = m.horizontal ? "y" : "x", val = m.horizontal ? "x" : "y";
    const log = m.scale.y === "log";
    const catTicks = { ...ticks, autoSkip: !m.horizontal && data.x.length > 12, maxRotation: m.horizontal ? 0 : 45, callback(this: any, v: any) { return wrap(String(this.getLabelForValue(v)), wrapAt); } };
    const valTicks = percent ? { ...ticks, callback: (v: any) => `${v}%` } : log ? { ...ticks, callback: logTick(narrow) } : ticks;
    options.indexAxis = m.horizontal ? "y" : "x";
    options.interaction = { mode: "index", intersect: false };
    options.scales[cat] = { type: "category", stacked: !!m.stacked, grid: { color: grid, display: !m.horizontal }, ticks: catTicks, title: title(xl) };
    options.scales[val] = { type: log ? "logarithmic" : "linear", stacked: !!m.stacked, beginAtZero: !log, min: percent ? 0 : yl.min, max: percent ? 100 : yl.max, grid: { color: grid }, ticks: valTicks, title: title(percent ? { label: yl.label ? `${yl.label} (%)` : "%" } : yl) };
    if (m.y2) { const y2 = spec.y2 ?? {}; options.scales.y2 = { type: m.scale.y2 === "log" ? "logarithmic" : "linear", position: "right", stacked: false, beginAtZero: m.scale.y2 !== "log", min: y2.min, max: y2.max, grid: { drawOnChartArea: false, color: grid }, ticks: m.scale.y2 === "log" ? { ...ticks, callback: logTick(narrow) } : ticks, title: title(y2) }; }
    options.plugins.tooltip.callbacks.label = (c: any) => {
      const raw = c.raw;
      if (Array.isArray(raw)) return `${c.dataset.label}: ${fmt(raw[0])} to ${fmt(raw[1])}`;
      if (c.dataset.rawValues) return `${c.dataset.label}: ${Math.round(c.raw * 10) / 10}% (${fmt(tipNum(c))})`;
      return `${c.dataset.label}: ${fmt(raw)}`;
    };
  }
  return { type, data: { labels: data.x, datasets }, options };
}

// how tall the plot is: a horizontal bar chart grows with its bars, a round one is squarer
export function plotHeight(spec: any, data: { x: any[]; series: any[] }, narrow: boolean): number | undefined {
  const m = chartMeta(spec);
  if (m.horizontal) return Math.max(narrow ? 240 : 260, 64 + data.x.length * (m.stacked ? 34 : 18 + 20 * Math.max(1, data.series.length)));
  if (m.round || m.kind === "radar") return narrow ? 300 : 340;
  return undefined;
}
