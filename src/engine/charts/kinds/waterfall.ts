// waterfall as primitives (lane chwire; port of the Waterfall of src/parts/chart-kinds/view.tsx). Keys: `wf:<name>` a bar, `wf:<name>:c` the
// dashed link to the next bar, `wf:<name>:v` its value (only where it has the room). The scale keeps still through `ctx.max` row 1
// (the largest running total of the story).
import type { Prim } from "../../types";
import type { View } from "../../../parts/chart-kinds/compute";
import { frame, fullOf, nameLines, nameWords, paint, r2, tickOf, uniqKeys, LINE } from "./axisframe";
import type { KMark, KindImpl } from "./common";

type W = Extract<View, { kind: "waterfall" }>;
const BASE_H = 340;

export const waterfall: KindImpl = {
  kind: "waterfall",
  height: (view) => BASE_H + (nameLines((view as W).rows.map((r) => r.name)) - 1) * LINE,
  build(view, rect, ctx) {
    const v = view as W, f = v.fmt, n = v.rows.length;
    const names = v.rows.map((r) => r.name), keys = uniqKeys(names), lines = nameLines(names);
    const vals = v.rows.flatMap((r) => [r.from, r.to]).concat(0);
    let hi = Math.max(...vals);
    for (const x of ctx.max?.[1] ?? []) if (Number.isFinite(x) && x > hi) hi = x;
    // charts2: when every running total stays well above 0 the axis starts at a round value under the lowest one (the changes get the
    // height, not the top 15%); the base bars (start, totals) then carry a break mark so nobody reads them as from zero
    const low = Math.min(...v.rows.map((r) => (r.type === "total" || r.type === "start" ? r.to : Math.min(r.from, r.to))));
    const cut = low > 0 && (hi - low) / hi < 0.6;
    const fr = frame({ rect, ctx, fmt: f, lo: cut ? low - (hi - low) * 0.35 : Math.min(...vals), hi, zero: !cut, yLabel: v.yLabel, xLabel: v.xLabel, lines });
    const { plot, y: y0 } = fr, y = (x: number): number => Math.max(plot.y, Math.min(plot.y + plot.h, y0(x))) /* charts2: a bar never reaches under the axis */, band = plot.w / Math.max(1, n), cx = (i: number): number => plot.x + band * (i + 0.5), bw = Math.max(10, Math.min(60, band * (ctx.phone ? 0.52 : 0.62)));
    const prims: Prim[] = [...fr.decor], marks: KMark[] = [];
    const zero = Math.max(plot.y, Math.min(plot.y + plot.h, y(0)));
    prims.push({ k: "path", key: "axis:zero", d: `M${r2(plot.x)} ${r2(zero)}L${r2(plot.x + plot.w)} ${r2(zero)}`, role: null, width: "thin", cls: "kd-axis kd-zero" });
    const rects = v.rows.map((r, i) => { const t = y(Math.max(r.from, r.to)), h = Math.max(2, Math.abs(y(r.from) - y(r.to))); return { x: cx(i) - bw / 2 - 2, y: t - 2, w: bw + 4, h: h + 4 }; });
    // the value over each bar: kept only where it has the room (totals first); the others are in the card and the LLM view
    const labels = v.rows.map((r) => (r.type === "total" || r.type === "start" ? tickOf(f, r.type === "total" ? r.total : r.change) : `${r.change >= 0 ? "+" : "−"}${tickOf(f, Math.abs(r.change))}`));
    // charts2: a value is kept where its box clears every bar and every value already placed (totals first, then the larger changes). It tries
    // its words in full over its own bar, then without the unit ("+12.5k"), then on the other side of the bar, before it is left out.
    const shortOf = (t: string): string => t.replace(/[^\d.,kMBT+−-]/g, "");
    const shown = v.rows.map(() => false), words = labels.slice(), at = v.rows.map(() => 0), boxes: { x: number; y: number; w: number; h: number }[] = [];
    const hit = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }): boolean => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    const order = v.rows.map((_, i) => i).sort((i, j) => (+(v.rows[j].type === "total" || v.rows[j].type === "start") - +(v.rows[i].type === "total" || v.rows[i].type === "start")) || Math.abs(v.rows[j].change) - Math.abs(v.rows[i].change));
    for (const i of order) {
      const r = v.rows[i], top = y(Math.max(r.from, r.to)), bot = y(Math.min(r.from, r.to)), base = r.type === "total" || r.type === "start";
      const above = top - 8, below = bot + 16, first = r.type === "down" ? below : above;
      const spots = base ? [above] : [first, first === above ? below : above];
      done: for (const yy of spots) for (const t of [labels[i], shortOf(labels[i])]) {
        const w = ctx.measure(t, "small-b") + 4, box = { x: cx(i) - w / 2, y: yy - 12, w, h: 15 };
        if (box.y < plot.y - 14 || box.y + box.h > plot.y + plot.h + 2) continue;
        if (rects.some((q, j) => j !== i && hit(box, q)) || boxes.some((q) => hit(box, q))) continue;
        boxes.push(box); shown[i] = true; words[i] = t; at[i] = yy; break done;
      }
    }
    const links: Prim[] = [], values: Prim[] = [], breaks: Prim[] = [];
    v.rows.forEach((r, i) => {
      const K = `wf:${keys[i]}`, tone = r.type === "up" ? "good" : r.type === "down" ? "bad" : "acc", p = paint(tone);
      const top = y(Math.max(r.from, r.to)), h = Math.max(2, Math.abs(y(r.from) - y(r.to)));
      prims.push({ k: "rect", key: K, rect: { x: r2(cx(i) - bw / 2), y: r2(top), w: r2(bw), h: r2(h) }, fill: "role", role: p.role, tone: p.tone, edge: "role", r: 4, cls: `kd-wfbar ${p.cls}` });
      // charts2: the break mark of a base bar on a cut axis: a slanted band in the card's colour across the bar, a little above its foot
      if (cut && (r.type === "total" || r.type === "start")) { const yb = Math.min(plot.y + plot.h - 8, top + h - 12); breaks.push({ k: "path", key: `${K}:brk`, d: `M${r2(cx(i) - bw / 2 - 3)} ${r2(yb + 3)}L${r2(cx(i) + bw / 2 + 3)} ${r2(yb - 3)}`, role: null, width: "line", cls: "kd-wf-break" }); }
      if (i < n - 1) links.push({ k: "path", key: `${K}:c`, d: `M${r2(cx(i) + bw / 2)} ${r2(y(r.to))}L${r2(cx(i + 1) - bw / 2)} ${r2(y(r.to))}`, role: null, dashed: true, width: "thin", cls: "kd-conn" });
      if (shown[i]) values.push({ k: "text", key: `${K}:v`, x: r2(cx(i)), y: r2(at[i]), lines: [words[i]], font: "small-b", anchor: "middle", ink: "ink", cls: "kd-wf-val" });
      marks.push({
        key: K, kind: "bar", rect: { x: r2(plot.x + band * i), y: r2(plot.y), w: r2(band), h: r2(plot.h) },
        title: r.name,
        meta: r.type === "total" ? `Total ${fullOf(f, r.total)}` : r.type === "start" ? `Start ${fullOf(f, r.change)}` : `${r.change >= 0 ? "+" : ""}${fullOf(f, r.change)} → ${fullOf(f, r.total)}`,
        text: r.type === "up" || r.type === "down" ? `Running total goes from ${fullOf(f, r.from)} to ${fullOf(f, r.to)}.` : undefined,
      });
    });
    prims.push(...links, ...breaks, ...values, ...nameWords(names, keys, cx, plot.y + plot.h + LINE, band, ctx, lines, [rect.x, rect.x + rect.w])); // charts2: inside the edges
    return { prims, marks };
  },
};
