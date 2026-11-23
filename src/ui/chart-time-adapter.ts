// Our own date adapter for Chart.js's time scale (pass 11, DESIGN 4.2): about 60 lines on tools/chart-time.ts, which is on
// Intl.DateTimeFormat. It replaces the date library Chart.js would otherwise ask for, so no dependency is added.
// The zone comes from the scale's `adapters.date.tz` option.
import * as T from "../core/chart-time";

export const TIME_FORMATS = { datetime: "yyyy-MM-dd HH:mm", millisecond: "HH:mm:ss", second: "HH:mm:ss", minute: "HH:mm", hour: "HH:mm", day: "MMM d", week: "MMM d", month: "MMM yyyy", quarter: "MMM yyyy", year: "yyyy" };
let installed = false;
/** `adapters` is Chart.js's own `_adapters` export; called once, before the first time chart is made */
export function installTimeAdapter(adapters: { _date: { override: (members: Record<string, unknown>) => void } }) {
  if (installed) return;
  installed = true;
  const tzOf = (a: any): string => (a.options && a.options.tz) || "UTC";
  adapters._date.override({
    _id: "dh",
    formats: () => TIME_FORMATS,
    parse(this: any, value: unknown) { return value == null ? null : T.parseTime(value as any, tzOf(this)); },
    format(this: any, time: number, fmt: string) { return T.fmtTime(time, fmt, tzOf(this)); },
    add(this: any, time: number, amount: number, unit: T.TimeUnit) { return T.add(time, amount, unit, tzOf(this)); },
    diff(this: any, a: number, b: number, unit: T.TimeUnit) { return T.diff(a, b, unit, tzOf(this)); },
    startOf(this: any, time: number, unit: string, weekday?: number) {
      if (unit === "isoWeek") return T.startOf(time, "week", tzOf(this), (Number(weekday) || 1) % 7);
      return T.startOf(time, unit as T.TimeUnit, tzOf(this));
    },
    endOf(this: any, time: number, unit: string) { return T.endOf(time, (unit === "isoWeek" ? "week" : unit) as T.TimeUnit, tzOf(this)); },
  });
}
