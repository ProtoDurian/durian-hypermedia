// compact-num: a number as short axis words for a narrow chart: 1000 is 1k, 1500 is 1.5k, 2000000 is 2M. Below 1000 the number is
// left alone. Pure; the charts use it for tick labels only (a tooltip and a table keep the whole number).
const UNITS: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"]];
/** at most 2 decimals under 10, 1 under 100, none from 100, with no trailing zeros */
const short = (q: number): string => { const s = q.toFixed(q < 10 ? 2 : q < 100 ? 1 : 0); return s.includes(".") ? s.replace(/\.?0+$/, "") : s; };
export function compactNum(v: number): string {
  const a = Math.abs(v);
  if (!Number.isFinite(v) || a < 1000) return Number.isInteger(v) ? String(v) : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  let i = UNITS.findIndex(([u]) => a >= u);
  let s = short(a / UNITS[i][0]);
  if (s === "1000" && i > 0) { i--; s = "1"; } // 999.9k rounds to 1000k: that is 1M
  return `${v < 0 ? "-" : ""}${s}${UNITS[i][1]}`;
}
