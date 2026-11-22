// chart-config11: the pass 11 additions to a Chart.js config (time axis, value formats, annotations, heatmap).
// chartConfig (chart-config.ts) still makes the base config; this adds to it. Pure apart from the `tok` function it is given.
import { chartConfig, type Look } from "./chart-config";
import { fmtValue, type Eval11, type Ext } from "../core/chart11";
import { TIME_FORMATS } from "./chart-time-adapter";
import { annPlugin, annsNear } from "./chart-ann";
import { applyPcConfig, type KeyItem } from "./pagecharts-config"; // p11 pagecharts

// ---- colours: tokens are hex; mixing is in OKLab, as the CSS ramps are
type RGB = [number, number, number];
export function parseColour(s: string): RGB {
  const t = s.trim();
  let m = t.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as RGB;
  m = t.match(/^#([0-9a-f]{6})/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as RGB;
  m = t.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [128, 128, 128];
}
const lin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const gam = (x: number) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)));
function toLab([r, g, b]: RGB): RGB {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
export function mix(a: RGB, b: RGB, t: number): RGB { const A = toLab(a), B = toLab(b); return fromLab([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
export const rgb = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
/** relative luminance, 0 to 1 */
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** the colour of a tone word, base or soft, from the tokens */
export function toneColour(tok: (n: string) => string, tone: string, kind: "base" | "soft"): string {
  const w = /^[1-8]$/.test(tone) ? `c${tone}` : tone === "accent" ? "acc" : tone;
  if (w === "muted") return kind === "base" ? tok("--faint") : tok("--surface-3");
  if (/^c[1-8]$/.test(w) || ["acc", "good", "warn", "bad"].includes(w)) return kind === "base" ? tok(`--${w}`) : tok(`--${w}-soft`);
  return tok("--acc");
}

export type Look11 = Look;
/** the heat ramp of a value: 0 to 1 along lo to hi, or on both sides of `diverge` */
export function heatRamp(tok: (n: string) => string, tone: string | undefined, diverge: number | undefined, lo: number, hi: number): (v: number) => { fill: string; lum: number } {
  const cLo = parseColour(tok("--heat-lo")), cHi = parseColour(tone ? toneColour(tok, tone, "base") : tok("--heat-hi")), cMid = parseColour(tok("--heat-mid")), cNeg = parseColour(tok("--heat-neg"));
  return (v) => {
    let c: RGB;
    if (diverge === undefined) c = mix(cLo, cHi, hi > lo ? (v - lo) / (hi - lo) : 1);
    else if (v >= diverge) c = mix(cMid, cHi, hi > diverge ? (v - diverge) / (hi - diverge) : 1);
    else c = mix(cMid, cNeg, diverge > lo ? (diverge - v) / (diverge - lo) : 1);
    return { fill: rgb(c), lum: luminance(c) };
  };
}
const CELL_NUM = 28; // a cell shows its number when it is at least this many px each way
const heatNumbers = {
  id: "dhHeatNumbers",
  afterDatasetsDraw(chart: any, _a: any, o: any) {
    if (!o) return;
    const meta = chart.getDatasetMeta(0), ds = chart.data.datasets[0], ctx = chart.ctx;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `600 12px ${o.font}`;
    meta.data.forEach((el: any, i: number) => {
      const w = el.width, h = el.height;
      if (w < CELL_NUM || h < CELL_NUM) return;
      const d = ds.data[i];
      if (d.v === null || d.v === undefined) return;
      ctx.fillStyle = d.lum > 0.45 ? o.dark : o.light;
      ctx.fillText(String(d.v), el.x + w / 2, el.y + h / 2);
    });
    ctx.restore();
  },
};

/** the whole config of a heatmap */
export function heatConfig(spec: any, data: Eval11, look: Look11): any {
  const { tok, reduce, narrow } = look;
  const font = { family: tok("--font-sans") || "system-ui", size: 12 };
  const ink = tok("--muted");
  const rows = data.series.map((s) => s.data as (number | null)[]);
  const nums = rows.flat().filter((v): v is number => typeof v === "number");
  const lo = nums.length ? Math.min(...nums) : 0, hi = nums.length ? Math.max(...nums) : 1;
  const ramp = heatRamp(tok, data.ext.heat?.tone, data.ext.heat?.diverge, lo, hi);
  const xs = data.x.map(String), ys = data.series.map((s) => s.name);
  const cells = ys.flatMap((y, r) => xs.map((x, c) => { const v = rows[r][c]; const k = typeof v === "number" ? ramp(v) : null; return { x, y, v, fill: k?.fill ?? null, lum: k?.lum ?? 1 }; }));
  const nx = xs.length, ny = ys.length;
  const title = (o: any) => ({ display: !!o?.label, text: o?.label, color: ink, font });
  const gap = 1;
  const catTicks = (labels: string[]) => ({ color: ink, font, autoSkip: true, autoSkipPadding: 4, maxRotation: narrow ? 90 : 0, minRotation: narrow ? 90 : 0, callback(this: any, v: any) { return String(this.getLabelForValue(v)); } });
  return {
    type: "matrix",
    data: { datasets: [{
      label: spec.series?.[0]?.name ?? "value", data: cells,
      backgroundColor: (c: any) => c.raw?.fill ?? "transparent",
      borderColor: tok("--surface"), borderWidth: 1,
      width: ({ chart }: any) => ((chart.chartArea || {}).width ?? 0) / nx - gap,
      height: ({ chart }: any) => ((chart.chartArea || {}).height ?? 0) / ny - gap,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: reduce ? false : { duration: 350 },
      plugins: {
        legend: { display: false }, dhHeatNumbers: { font: tok("--font-sans") || "system-ui", dark: tok("--ink"), light: "#fff" },
        tooltip: { callbacks: { title: (items: any[]) => (items[0] ? `${items[0].raw.y} · ${items[0].raw.x}` : ""), label: (c: any) => `${spec.series?.[0]?.name ?? "value"}: ${c.raw.v === null ? "no value" : c.raw.v}` } },
      },
      scales: {
        x: { type: "category", labels: xs, offset: true, grid: { display: false }, border: { display: false }, ticks: catTicks(xs), title: title(spec.x), position: "bottom" },
        y: { type: "category", labels: ys, offset: true, reverse: true, grid: { display: false }, border: { display: false }, ticks: { ...catTicks(ys), maxRotation: 0, minRotation: 0 }, title: title(spec.y) },
      },
      layout: { padding: 2 },
    },
    plugins: [heatNumbers],
  };
}
export const heatKey = (tok: (n: string) => string, data: Eval11) => {
  const nums = data.series.flatMap((s) => s.data as any[]).filter((v): v is number => typeof v === "number");
  return { lo: nums.length ? Math.min(...nums) : 0, hi: nums.length ? Math.max(...nums) : 0, diverge: data.ext.heat?.diverge, tone: data.ext.heat?.tone };
};

/** a config for any chart written with the pass 11 words */
export function chartConfig11(spec: any, data: Eval11, look: Look11, tol = 0): any {
  if (spec.kind === "heatmap") return heatConfig(spec, data, look);
  const cfg = chartConfig(spec, data, look);
  const ext: Ext = data.ext;
  const { tok } = look;
  const font = { family: tok("--font-sans") || "system-ui", size: 12 };
  // ---- value formats on the ticks, the tooltip
  const axisFmt = (id: string) => (id === "y2" ? ext.formats.y2 : ext.formats.y);
  for (const id of ["y", "y2"] as const) {
    const f = ext.formats[id], sc = cfg.options.scales[id];
    if (f && sc && sc.type !== "logarithmic") sc.ticks = { ...sc.ticks, callback: (v: any) => fmtValue(Number(v), f.format, f.currency, true) };
  }
  if (ext.formats.x && cfg.options.scales.x) cfg.options.scales.x.ticks = { ...cfg.options.scales.x.ticks, callback: (v: any) => fmtValue(Number(v), ext.formats.x!.format, ext.formats.x!.currency, true) };
  const cb = cfg.options.plugins.tooltip.callbacks, old = cb.label;
  if (ext.formats.y || ext.formats.y2 || ext.formats.x) {
    cb.label = (c: any) => {
      const f = axisFmt(c.dataset.yAxisID ?? "y");
      if (c.dataset.rawValues || c.dataset.candles) return old(c);
      if (c.raw && typeof c.raw === "object" && !Array.isArray(c.raw) && "x" in c.raw) { const fx = ext.formats.x; return `${c.dataset.label}: (${fx ? fmtValue(c.raw.x, fx.format, fx.currency) : c.raw.x}, ${f ? fmtValue(c.raw.y, f.format, f.currency) : c.raw.y})`; }
      if (!f) return old(c);
      if (Array.isArray(c.raw)) return `${c.dataset.label}: ${fmtValue(c.raw[0], f.format, f.currency)} to ${fmtValue(c.raw[1], f.format, f.currency)}`;
      return `${c.dataset.label}: ${fmtValue(c.raw, f.format, f.currency)}`;
    };
  }
  // ---- the time axis
  if (ext.time && cfg.options.scales.x) {
    const bar = cfg.type === "bar";
    const old = cfg.options.scales.x;
    cfg.options.scales.x = {
      type: "time", offset: bar, grid: old.grid, title: old.title, border: old.border,
      adapters: { date: { tz: ext.tz } },
      time: { tooltipFormat: ext.dateOnly ? "yyyy-MM-dd" : TIME_FORMATS.datetime, displayFormats: TIME_FORMATS },
      ticks: { color: tok("--muted"), font, autoSkip: true, autoSkipPadding: 8, maxRotation: 0, major: { enabled: true } },
    };
    if (ext.timePoints) for (const d of cfg.data.datasets) d.spanGaps = true;
    // the x values are the times themselves, so Chart.js reads them through our adapter
  }
  // ---- annotations
  if (ext.anns.length) {
    cfg.options.layout = { ...(cfg.options.layout ?? {}), padding: { top: 6, right: 8, bottom: 2, left: 2 } };
    const ac = cb.afterBody;
    cb.afterBody = (items: any[]) => {
      const base = ac ? ac(items) : [];
      const it = items[0]; if (!it) return base;
      const xv = ext.time ? it.parsed.x : it.dataIndex;
      const near = annsNear(ext.anns, xv, tol);
      return [...(Array.isArray(base) ? base : base ? [base] : []), ...near.map((n) => `${n.kind === "range" ? "▭" : "◆"} ${n.label}`)];
    };
  }
  cfg.plugins = [...(cfg.plugins ?? []), ...(ext.anns.length ? [annPlugin] : [])];
  cfg.dhKey = applyPcConfig(cfg, ext.pc, tok) as KeyItem[]; // p11 pagecharts: line styles, markers, the time axis' own bounds; the key's items
  return cfg;
}
export { annPlugin };
