// pagecharts-config: the page-block additions to a Chart.js config (line styles, point markers, a time axis' bounds and tick
// unit), and the key a chart with styled series draws under itself. Pure apart from the `tok` function it is given.
import { ticksEvery, type PcExt } from "../core/pagecharts";
import { partsOf } from "../core/chart-time";

export type Tok = (name: string) => string;
const POINT: Record<string, string> = { circle: "circle", square: "rect", triangle: "triangle", diamond: "rectRot", plus: "cross", cross: "crossRot" };
// the dash patterns of the three line styles (canvas px); a dotted line has round caps so the dashes are dots
export const DASH: Record<string, number[]> = { solid: [], dashed: [9, 6], dotted: [0.1, 6] };

export interface KeyItem { label: string; colour: string; shape: "bar" | "line" | "point"; line: string; marker: string }

/** the colour a dataset draws in: scatter keeps it in the fill, the others in the border */
const colourOf = (d: any, type: string) => String(type === "scatter" || type === "bubble" ? d.backgroundColor : d.borderColor);

/** adds line styles, markers and the time axis' own options to `cfg` (made by chartConfig11); returns the key's items when a series has a style */
export function applyPcConfig(cfg: any, pc: PcExt | undefined, tok: Tok): KeyItem[] {
  if (!pc) return [];
  if (pc.time && cfg.options?.scales?.x?.type === "time") {
    const x = cfg.options.scales.x, t = pc.time;
    if (t.min !== undefined) x.min = t.min;
    if (t.max !== undefined) x.max = t.max;
    if (t.unit) {
      // our own ticks (whole units of the zone, `every` apart), so the step is the author's and not Chart.js's guess
      x.time = { ...x.time, unit: t.unit };
      const tz: string = x.adapters?.date?.tz ?? "UTC", unit = t.unit, every = t.every ?? 1;
      // a tick that starts a bigger unit (midnight, the 1st, January) is a major tick, which Chart.js labels with the date
      const major = (t: number) => { const p = partsOf(t, tz); return unit === "hour" || unit === "minute" ? p.h === 0 && p.mi === 0 : unit === "day" || unit === "week" ? p.d === 1 : unit === "month" || unit === "quarter" ? p.mo === 1 : false; };
      x.afterBuildTicks = (scale: any) => { scale.ticks = ticksEvery(scale.min, scale.max, unit, every, tz, false).map((value) => ({ value, major: major(value) })); };
    }
  }
  const styled = Object.keys(pc.styles).length > 0;
  if (!styled) return [];
  const surface = tok("--surface");
  const items: KeyItem[] = [];
  for (const d of cfg.data.datasets as any[]) {
    const type = String(d.type ?? cfg.type);
    const st = pc.styles[String(d.label)];
    const isLine = type === "line" || type === "radar";
    const isPoint = type === "scatter";
    const colour = colourOf(d, type);
    if (st?.line) {
      d.borderDash = DASH[st.line];
      d.borderCapStyle = st.line === "dotted" ? "round" : "butt";
      if (st.line === "dotted") d.borderWidth = 3;
    }
    if (st?.marker) {
      if (st.marker === "none") { d.pointRadius = 0; d.pointHoverRadius = 4; d.pointHitRadius = 8; }
      else {
        d.pointStyle = POINT[st.marker]; d.pointRadius = 5; d.pointHoverRadius = 7;
        d.pointBackgroundColor = colour;
        const stroke = st.marker === "plus" || st.marker === "cross";
        d.pointBorderColor = stroke ? colour : surface; d.pointBorderWidth = stroke ? 2.5 : 1.5;
        if (isPoint) { d.backgroundColor = colour; d.borderColor = stroke ? colour : surface; }
      }
    }
    items.push({ label: String(d.label), colour, shape: isPoint ? "point" : isLine ? "line" : "bar", line: st?.line ?? "solid", marker: st?.marker ?? (isPoint ? "circle" : "circle") });
  }
  if (cfg.options?.plugins?.legend) cfg.options.plugins.legend.display = false; // the page draws the key (it shows the dashes and the markers)
  return items;
}
