// The gantt's layout (format version 11): pure. Where the rows, the scale, the ticks and the weekend bands go for the
// tasks at one step and one width. One row height for every width, so the part is the same height before and after the
// script measures it, and the control row under it never moves.
import type { Budget } from "../../core/budget";
import { DAY, add, partsOf, startOf, timeTicks, type TimeUnit } from "./time";
import type { GanttSpec, Sched } from "./part";

export const GANTT = { namesW: 190, row: 52, head: 34, section: 28, bar: 18, phoneBelow: 640 };
/** pixels a day takes at each scale */
export const SCALES = { day: 32, week: 14, month: 5 } as const;
export type Scale = keyof typeof SCALES;
export type GRow = { kind: "section"; name: string; y: number } | { kind: "task"; s: Sched; y: number; cy: number };
export interface GanttLayout {
  /** the names sit above the bars and the scale scrolls inside its box */
  phone: boolean;
  scale: Scale; ppd: number; min: number; max: number; days: number; timeW: number; svgW: number; totalH: number;
  rows: GRow[];
  ticks: { t: number[]; unit: TimeUnit }; labelUnit: TimeUnit;
  weekends: number[];
}
/** the x of a time */
export const xOf = (l: GanttLayout, t: number) => ((t - l.min) / DAY) * l.ppd;

/** `width`: the room of the part's body, in CSS pixels. `scale`: the reader's choice, or null for the one that fits. */
export function layoutGantt(spec: GanttSpec, sched: Sched[], width: number, scale: Scale | null, budget?: Budget): GanttLayout {
  const tz = spec.tz;
  const phone = width < GANTT.phoneBelow;
  const min = add(startOf(spec.extent.min, "day", tz), -1, "day", tz), max = add(startOf(spec.extent.max, "day", tz), 2, "day", tz);
  const days = Math.max(1, Math.round((max - min) / DAY));
  budget?.charge(8 + sched.length + spec.sections.length, sched.length);
  const avail = phone ? width - 8 : width - GANTT.namesW - 8;
  const auto: Scale = (["day", "week", "month"] as Scale[]).find((s) => days * SCALES[s] <= avail) ?? "month";
  const cur = scale ?? auto;
  // no scale chosen: the whole span fills the width (up to 64 px a day); a chosen scale keeps its own width
  const ppd = scale ? SCALES[scale] : Math.max(SCALES.month, Math.min(64, avail / days));
  const timeW = Math.ceil(days * ppd);
  const rows: GRow[] = [];
  let y = GANTT.head;
  spec.sections.forEach((name, k) => {
    const g = sched.filter((s) => s.section === k);
    if (!g.length) return;
    if (name) { rows.push({ kind: "section", name, y }); y += GANTT.section; }
    for (const s of g) { rows.push({ kind: "task", s, y, cy: y + (phone ? GANTT.row - 17 : GANTT.row / 2) }); y += GANTT.row; }
  });
  const totalH = y + 6;
  const ticks = timeTicks(min, max, tz, Math.max(3, Math.floor(timeW / (cur === "day" ? 36 : 84))), budget);
  const labelUnit: TimeUnit = ticks.unit; // a label says what its tick is on: weekly ticks read "Dec 7", never "Dec 2026" twice
  const weekends: number[] = [];
  if (cur === "day" && days <= 800) {
    budget?.charge(days);
    for (let t = min; t < max; t = add(t, 1, "day", tz)) { const dw = partsOf(t, tz).dow; if (dw === 0 || dw === 6) weekends.push(t); }
  }
  return { phone, scale: cur, ppd, min, max, days, timeW, svgW: timeW + 8, totalH, rows, ticks: { t: ticks.t, unit: ticks.unit }, labelUnit, weekends };
}
