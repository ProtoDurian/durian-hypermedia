// histogram as primitives (lane chwire; port of the Histogram of src/parts/chart-kinds/view.tsx). Keys: `bin:<i>:<series>` for a bar,
// `mark:<i>:*` for p50/p95, `t:x:<tick>` for the x words. Counts keep the scale still through `ctx.max` (the largest count of the story).
import type { Prim } from "../../types";
import { keyOf } from "../axis";
import type { View } from "../../../parts/chart-kinds/compute";
import { niceTicks, fitTicks } from "../../../parts/chart-kinds/layout";
import { frame, fullOf, markPrims, paint, pct, r2, roundTicksAcross, seriesKey, tickOf, LINE } from "./axisframe";
import type { KindImpl } from "./common";

type H = Extract<View, { kind: "histogram" }>;
const TOP_CHIPS = 22;

export const histogram: KindImpl = {
  kind: "histogram",
  height: () => 320,
  build(view, rect, ctx) {
    const v = view as H, f = v.fmt, e = v.edges, n = e.length - 1, phone = ctx.phone;
    const prims: Prim[] = [];
    // the largest count of this step and of every step of the story: the y scale never moves between steps
    let maxC = 1;
    for (const s of v.series) for (const c of s.counts) if (c > maxC) maxC = c;
    for (const row of ctx.max ?? []) for (const c of row) if (Number.isFinite(c) && c > maxC) maxC = c;
    const key = v.series.length > 1 ? seriesKey(v.series, { x: rect.x, y: rect.y, w: rect.w, h: 0 }, ctx) : { prims: [] as Prim[], h: 0 };
    // charts2: on a phone a millisecond axis names its unit once, in the title ("latency (ms)"), and its ticks are bare numbers
    const bare = phone && f.format === "duration-ms" && e[n] < 1000, xLabel = bare && v.xLabel && !/\(ms\)/.test(v.xLabel) ? `${v.xLabel} (ms)` : v.xLabel;
    const word = (x: number): string => (bare ? String(x) : tickOf(f, x));
    const fr = frame({ rect, ctx, fmt: f, lo: 0, hi: maxC, zero: true, whole: true, yLabel: v.yLabel, xLabel, topExtra: v.marks.length ? TOP_CHIPS : 0, keyH: key.h, lines: 1, tick: (t) => tickOf({ format: "number" }, t) });
    const { plot } = fr, span = e[n] - e[0] || 1;
    const mx = (x: number): number => plot.x + ((x - e[0]) / span) * plot.w;
    prims.push(...fr.decor);
    const gap = mx(e[1]) - mx(e[0]) > 8 ? 2 : mx(e[1]) - mx(e[0]) > 3 ? 1 : 0;
    const multi = v.series.length > 1;
    v.series.forEach((s, si) => {
      const p = paint(s.tone);
      s.counts.forEach((c, i) => {
        const x0 = mx(e[i]) + gap / 2, w = Math.max(1, mx(e[i + 1]) - mx(e[i]) - gap), top = fr.y(c), h = Math.max(0, plot.y + plot.h - top);
        prims.push({ k: "rect", key: `bin:${i}:${si}`, rect: { x: r2(x0), y: r2(top), w: r2(w), h: r2(h) }, fill: "role", role: p.role, tone: p.tone, edge: "none", r: r2(Math.min(4, w / 3, h / 2)), cls: `kd-bar ${p.cls}${multi ? " kd-over" : ""}${c > 0 ? "" : " kd-gap"}` });
      });
    });
    // x words: round values, each kept only where it clears the one before
    // charts2: durations on round units of time (50, 100, 150 ms), as many as fit with a gap; other formats: up to 5 on a phone
    const across = roundTicksAcross(e[0], e[n], plot.w, f, word, ctx);
    const xs = across.length ? across : fitTicks(niceTicks(e[0], e[n], phone ? 5 : 6).filter((x) => x >= e[0] - 1e-9 && x <= e[n] + 1e-9), mx, word);
    for (const x of xs) {
      const label = word(x), w = ctx.measure(label, "sub");
      prims.push({ k: "text", key: `t:x:${keyOf(String(x))}`, x: r2(Math.max(rect.x + w / 2, Math.min(rect.x + rect.w - w / 2, mx(x)))), y: r2(plot.y + plot.h + LINE), lines: [label], font: "sub", anchor: "middle", ink: "muted", cls: "kd-tick" });
    }
    const mk = markPrims(v.marks, plot, mx, true, ctx);
    prims.push(...mk.prims, ...key.prims);
    // one popover per bin; the marks (p50, p95) after them; a pick area over the whole plot that the page resolves to the bin under the pointer
    const marks = v.series.length ? Array.from({ length: n }, (_, i) => ({
      key: `bin:${i}`, kind: "bin",
      rect: { x: r2(mx(e[i])), y: r2(plot.y), w: r2(Math.max(2, mx(e[i + 1]) - mx(e[i]))), h: r2(plot.h) },
      title: `${fullOf(f, e[i])} to ${fullOf(f, e[i + 1])}`,
      meta: v.series.length === 1 ? `${v.series[0].counts[i]} of ${v.series[0].n} values · ${pct(v.series[0].counts[i] / v.series[0].n)}` : undefined,
      text: v.series.length > 1 ? v.series.map((s) => `${s.name}: ${s.counts[i]} (${pct(s.counts[i] / s.n)})`).join("\n") : undefined,
    })) : [];
    return { prims, marks: [...marks, ...mk.marks, { key: "pick", kind: "pick", skip: true, rect: { x: plot.x, y: plot.y, w: plot.w, h: plot.h }, title: "" }] };
  },
};
