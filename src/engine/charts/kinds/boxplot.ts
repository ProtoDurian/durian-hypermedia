// boxplot as primitives (lane chwire; port of BoxViolin of src/parts/chart-kinds/view.tsx). The violin (./violin.ts) shares this frame:
// `statsBuild(view, rect, ctx, violin)`. Keys: `box:<name>:<part>` (w whiskers, cap, r box, m median, mean, o:<j> outliers), a
// violin's `v` (always the same number of curves). The range keeps still through `ctx.max` row 4 (the largest max of the story).
import type { Prim } from "../../types";
import type { View } from "../../../parts/chart-kinds/compute";
import { frame, fullOf, markPrims, nameLines, nameWords, paint, r2, uniqKeys, LINE } from "./axisframe";
import type { KBuilt, KCtx, KMark, KindImpl } from "./common";

type S = Extract<View, { kind: "boxplot" | "violin" }>;
const BASE_H = 340;
/** the height never depends on the width: the lines the names may take come from the names */
export const statsHeight = (v: S): number => BASE_H + (nameLines(v.stats.map((s) => s.name)) - 1) * LINE;

export function statsBuild(v: S, rect: { x: number; y: number; w: number; h: number }, ctx: KCtx, violin: boolean): KBuilt {
  const f = v.fmt, n = v.stats.length;
  const names = v.stats.map((s) => s.name), keys = uniqKeys(names);
  let lo = Math.min(...v.stats.map((s) => s.min), ...v.marks.map((m) => m.value));
  let hi = Math.max(...v.stats.map((s) => s.max), ...v.marks.map((m) => m.value));
  for (const x of ctx.max?.[4] ?? []) if (Number.isFinite(x) && x > hi) hi = x;
  // charts2: the axis starts a little under the smallest value (6% of the range, never under 0 for data that is not negative), so the lowest whisker is off the axis line
  if (lo < hi) { const under = lo - (hi - lo) * 0.06; lo = lo >= 0 ? Math.max(0, under) : under; }
  const lines = nameLines(names);
  const fr = frame({ rect, ctx, fmt: f, lo, hi, yLabel: v.yLabel, xLabel: v.xLabel, topExtra: v.marks.length ? 6 : 0, lines });
  const { plot, y } = fr, band = plot.w / Math.max(1, n), cx = (i: number): number => plot.x + band * (i + 0.5);
  const bw = Math.max(12, Math.min(56, band * 0.56)), p = paint(v.tone);
  const prims: Prim[] = [...fr.decor], marks: KMark[] = [];
  v.stats.forEach((s, i) => {
    const x = cx(i), B = `box:${keys[i]}`;
    const cls = p.cls;
    if (violin && v.kde && v.densMax) {
      const k = v.kde[i], hw = (d: number): number => (d / v.densMax!) * (band * 0.46);
      const right = k.at.map((a, j) => `${j ? "L" : "M"}${r2(x + hw(k.dens[j]))} ${r2(y(a))}`).join("");
      const left = k.at.slice().reverse().map((a, j) => `L${r2(x - hw(k.dens[k.at.length - 1 - j]))} ${r2(y(a))}`).join("");
      prims.push({ k: "path", key: `${B}:v`, d: `${right}${left}Z`, role: p.role, width: "thin", fill: "soft", cls: `kd-violin ${cls}` });
      prims.push({ k: "path", key: `${B}:w`, d: `M${r2(x)} ${r2(y(s.lo))}L${r2(x)} ${r2(y(s.hi))}`, role: p.role, width: "line", cls: `kd-whisker ${cls}` });
      prims.push({ k: "rect", key: `${B}:r`, rect: { x: r2(x - 4), y: r2(y(s.q3)), w: 8, h: r2(Math.max(2, y(s.q1) - y(s.q3))) }, fill: "role", role: p.role, tone: p.tone, edge: "none", r: 3, cls: `kd-ibox ${cls}` });
      prims.push({ k: "dot", key: `${B}:m`, x: r2(x), y: r2(y(s.median)), r: 3.4, role: null, hollow: true, cls: "kd-median-dot" });
    } else {
      prims.push({ k: "path", key: `${B}:w`, d: `M${r2(x)} ${r2(y(s.hi))}L${r2(x)} ${r2(y(s.q3))}M${r2(x)} ${r2(y(s.q1))}L${r2(x)} ${r2(y(s.lo))}`, role: p.role, width: "line", cls: `kd-whisker ${cls}` });
      prims.push({ k: "path", key: `${B}:cap`, d: `M${r2(x - bw / 4)} ${r2(y(s.hi))}L${r2(x + bw / 4)} ${r2(y(s.hi))}M${r2(x - bw / 4)} ${r2(y(s.lo))}L${r2(x + bw / 4)} ${r2(y(s.lo))}`, role: p.role, width: "line", cls: `kd-cap ${cls}` });
      prims.push({ k: "rect", key: `${B}:r`, rect: { x: r2(x - bw / 2), y: r2(y(s.q3)), w: r2(bw), h: r2(Math.max(2, y(s.q1) - y(s.q3))) }, fill: "soft", role: p.role, tone: p.tone, edge: "role", r: 5, cls: `kd-boxr ${cls}` });
      prims.push({ k: "path", key: `${B}:m`, d: `M${r2(x - bw / 2)} ${r2(y(s.median))}L${r2(x + bw / 2)} ${r2(y(s.median))}`, role: null, width: "hot", cls: "kd-median" });
      prims.push({ k: "box", key: `${B}:mean`, shape: "diamond", rect: { x: r2(x - 4), y: r2(y(s.mean) - 4), w: 8, h: 8 }, role: p.role, tone: p.tone, cls: `kd-mean ${cls}` });
    }
    s.outliers.slice(0, 40).forEach((o, j) => prims.push({ k: "dot", key: `${B}:o:${j}`, x: r2(x), y: r2(y(o)), r: 3, role: p.role, tone: p.tone, hollow: true, cls: `kd-out ${cls}` }));
    marks.push({
      key: B, kind: violin ? "violin" : "box", rect: { x: r2(plot.x + band * i), y: r2(plot.y), w: r2(band), h: r2(plot.h) },
      title: s.name, meta: `${s.n} values`,
      text: `min ${fullOf(f, s.min)} · p25 ${fullOf(f, s.q1)} · median ${fullOf(f, s.median)} · p75 ${fullOf(f, s.q3)} · max ${fullOf(f, s.max)}${s.outliers.length ? ` · ${s.outliers.length} outlier${s.outliers.length === 1 ? "" : "s"}` : ""}`,
    });
  });
  prims.push(...nameWords(names, keys, cx, plot.y + plot.h + LINE, band, ctx, lines, [rect.x, rect.x + rect.w])); // charts2: inside the edges
  const mk = markPrims(v.marks, plot, y, false, ctx);
  prims.push(...mk.prims);
  return { prims, marks: [...marks, ...mk.marks] };
}

export const boxplot: KindImpl = {
  kind: "boxplot",
  height: (v) => statsHeight(v as S),
  build: (v, rect, ctx) => statsBuild(v as S, rect, ctx, false),
};
