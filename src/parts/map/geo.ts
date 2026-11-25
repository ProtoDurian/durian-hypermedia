// Regions for the map part (the format, the format): countries (ISO 3166-1 alpha-2, "DE") and US states ("US-CA").
// The boundaries are our own file, made from Natural Earth (public domain) by the boundary packer: simplified, rounded to
// 1/20 degree and delta-encoded (site/src/geo-world.ts and geo-us.ts, loaded only by a map that uses them). The names, label
// points and boxes (tools/geo-names.ts) are small and have no polygons: the parser, doccheck and the LLM view use only those.
// This module is pure (no DOM): the lookup, the colour scale, the number words and the decoder.
import { US_STATES, WORLD, type GeoRow } from "./geo-names";

/** Load-time caps a host may lower (an object a host can write to before the page draws): they sit outside the parse budget. */
export const GEO_LIMITS = {
  /** the most polygon points the page decodes in one map; over it, every k-th point is kept (the shapes get coarser, never refused) */
  geoPoints: 60_000,
  /** the most filled regions in one map */
  fills: 300,
  /** the most arcs in one map */
  arcs: 200,
};

const BY_CODE = new Map<string, GeoRow>();
for (const r of WORLD) BY_CODE.set(r[0], r);
for (const r of US_STATES) BY_CODE.set(r[0], r);
export const regionRow = (code: string): GeoRow | undefined => BY_CODE.get(code);
export const isUsState = (code: string): boolean => code.startsWith("US-");
export const regionName = (code: string): string => BY_CODE.get(code)?.[1] ?? code;
/** the label point of a region, where an arc between regions starts and ends */
export const regionPoint = (code: string): { lat: number; lng: number } | null => { const r = BY_CODE.get(code); return r ? { lat: r[2], lng: r[3] } : null; };
/** the corners of a region's box (south-west, north-west, north-east, south-east), for fitting a camera */
export const regionBox = (code: string): { lat: number; lng: number }[] => {
  const r = BY_CODE.get(code); if (!r) return [];
  return [{ lat: r[5], lng: r[4] }, { lat: r[7], lng: r[4] }, { lat: r[7], lng: r[6] }, { lat: r[5], lng: r[6] }];
};
export const CODE_COUNT = BY_CODE.size;

/** "DE (Germany), DK (Denmark)": the codes that look like what was written, for a refusal that names the fix */
export function suggestRegions(raw: string): string[] {
  const t = raw.trim(), up = t.toUpperCase().replace(/[\s_]+/g, "-"), low = t.toLowerCase();
  const out: string[] = [];
  const add = (r: GeoRow) => { const s = `${r[0]} (${r[1]})`; if (!out.includes(s) && out.length < 4) out.push(s); };
  if (BY_CODE.has(up)) add(BY_CODE.get(up)!);
  if (/^US-?[A-Z]{2}$/.test(up) && BY_CODE.has(`US-${up.slice(-2)}`)) add(BY_CODE.get(`US-${up.slice(-2)}`)!);
  for (const r of BY_CODE.values()) if (r[1].toLowerCase() === low) add(r);
  for (const r of BY_CODE.values()) if (low.length >= 3 && r[1].toLowerCase().startsWith(low)) add(r);
  for (const r of BY_CODE.values()) if (up.length === 2 && r[0].startsWith(up[0]) && !r[0].includes("-")) add(r);
  return out;
}

// ---------- numbers ----------
const sig3 = (n: number) => { const s = String(+n.toPrecision(3)); return s; };
/** a number in few characters for a legend or a table: 1250000 is "1.25 M"; 83.24 is "83.2" */
export function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${sig3(v / 1e12)} T`;
  if (a >= 1e9) return `${sig3(v / 1e9)} B`;
  if (a >= 1e6) return `${sig3(v / 1e6)} M`;
  if (a >= 1e4) return `${sig3(v / 1e3)} k`;
  return Number.isInteger(v) ? String(v) : sig3(v);
}

// ---------- the colour scale ----------
export type ScaleKind = "heat" | "steps";
export type Scale = { kind: ScaleKind; unit: string; diverge: number | null; min: number | null; max: number | null; bins: number; none: string };
export type Range = { lo: number; hi: number; mid: number | null };
/** the range of a scale: the written min and max, or the values' own (and the middle, when it diverges) */
export function rangeOf(values: number[], s: Scale): Range {
  let lo = s.min ?? (values.length ? Math.min(...values) : 0), hi = s.max ?? (values.length ? Math.max(...values) : 1);
  if (s.diverge !== null) { const d = Math.max(Math.abs(lo - s.diverge), Math.abs(hi - s.diverge)); if (s.min === null) lo = s.diverge - d; if (s.max === null) hi = s.diverge + d; }
  if (hi <= lo) hi = lo + 1;
  return { lo, hi, mid: s.diverge };
}
/** how a value is coloured: `pct` percent of `a` mixed into `b`, in oklab. The words are the tokens: hi, neg, lo, mid. */
export type Mix = { a: "hi" | "neg"; b: "lo" | "mid"; pct: number; bin: number };
export function mixOf(v: number, r: Range, s: Scale): Mix {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  if (r.mid !== null) {
    const up = v >= r.mid, t = clamp(up ? (v - r.mid) / (r.hi - r.mid) : (r.mid - v) / (r.mid - r.lo));
    const tt = s.kind === "steps" ? binned(t, s.bins) : t;
    return { a: up ? "hi" : "neg", b: "mid", pct: Math.round(10 + 90 * tt), bin: Math.round(tt * (s.bins - 1)) * (up ? 1 : -1) };
  }
  const t = clamp((v - r.lo) / (r.hi - r.lo)), tt = s.kind === "steps" ? binned(t, s.bins) : t;
  return { a: "hi", b: "lo", pct: Math.round(14 + 86 * tt), bin: Math.min(s.bins - 1, Math.floor(t * s.bins)) };
}
const binned = (t: number, n: number) => Math.min(n - 1, Math.floor(t * n)) / (n - 1);
/** the CSS colour of a mix (the legend, the map and the table all use this one string) */
export const mixCss = (m: Mix): string => `color-mix(in oklab, var(--map-heat-${m.a}) ${m.pct}%, var(--map-heat-${m.b}))`;
/** the edges of the bins of a stepped scale (bins + 1 numbers) */
export function binEdges(r: Range, bins: number): number[] { return Array.from({ length: bins + 1 }, (_, i) => r.lo + ((r.hi - r.lo) * i) / bins); }

// ---------- the boundary data (client side) ----------
export type Pt = [number, number]; // [lng, lat]
export type RegionPoly = Pt[][][]; // polygons > rings > points
const b36 = (s: string) => parseInt(s, 36);
const unzig = (n: number) => (n & 1 ? -(n + 1) / 2 : n / 2);
/** decode one packed file (one line per region, in the order of `rows`) into degrees; `limit` caps the points kept */
export function decodeRegions(data: string, rows: GeoRow[], q: number, limit: number = GEO_LIMITS.geoPoints): Map<string, RegionPoly> {
  const lines = data.split("\n"), out = new Map<string, RegionPoly>();
  let total = 0;
  for (const ln of lines) total += (ln.match(/,/g)?.length ?? 0) / 2 + 1;
  const keep = Math.max(1, Math.ceil(total / Math.max(1000, limit)));
  lines.forEach((ln, i) => {
    const row = rows[i]; if (!row || !ln) return;
    out.set(row[0], ln.split("/").map((poly) => poly.split(";").map((ring) => {
      const nums = ring.split(",").map(b36), pts: Pt[] = []; let x = 0, y = 0;
      for (let k = 0; k + 1 < nums.length; k += 2) { x += unzig(nums[k]); y += unzig(nums[k + 1]); pts.push([x / q, y / q]); }
      if (keep === 1 || pts.length <= 8) return pts;
      const thin = pts.filter((_, j) => j % keep === 0);
      return thin.length >= 3 ? thin : pts.slice(0, 3);
    })));
  });
  return out;
}
/** is a [lng, lat] point inside a region (even-odd over every ring) */
export function inRegion(poly: RegionPoly, lng: number, lat: number): boolean {
  for (const p of poly) {
    let inside = false;
    for (const ring of p) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}
export { US_STATES, WORLD };
export type { GeoRow };
