// The chart-kinds part's view (format version 11): histogram, boxplot, violin, funnel, waterfall, treemap, sunburst and
// calendar, drawn as our own SVG or HTML: token colours, real text, the one popover on every bin, box, stage, block,
// arc and day (hover, tap, focus), the arrow keys to walk the data, steps through the kit's player. Static draws one
// step whole. The numbers come from compute.ts (read once, when the part is parsed); the two tree layouts run again at
// each zoom, paid from a budget of their own.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import { Stepper, stepKeys, useSteps, usePopover, type PopData } from "../kit/view";
import type { PartViewProps } from "../types";
import { fmtValue } from "./fmt";
import { cutWord, fitTicks, niceTicks, placeValues, rotRoom, sunburstLayout, treemapLayout, xLab, type TNode } from "./layout";
import { pct as pctText, type Day, type View } from "./compute";
import type { ChartKindsData } from "./part";

type Pop = ReturnType<typeof usePopover>;
type Fmt = (x: number, compact?: boolean) => string;
type Hit = { id: string; data: PopData };
type Host = React.RefObject<HTMLElement | null>;
const W = { cannot: "This chart cannot be drawn:", root: "All", table: "Table", tapHint: "Click or tap a block with a path to open it; the path above takes you back.", ringHint: "Click or tap a ring to open it; the centre or the path above takes you back.", swipe: "Swipe the days sideways; arrow keys move between days.", binsAria: "Arrow keys walk the bins." };
/** the width a chart is drawn at before the first measure (the server's HTML) */
const FIRST_WIDTH = 640;

const pct = (x: number) => `${x >= 0.1 || x === 0 ? (x * 100).toFixed((x * 100) % 1 === 0 ? 0 : 1) : (x * 100).toFixed(1)}%`;
const trunc = (s: string, n: number) => (s.length <= n ? s : s.slice(0, Math.max(1, n - 1)) + "…");
const tcls = (t: string) => `ck-t-${t}`;
const fmtOf = (v: { fmt: { format: string; currency?: string } }): Fmt => (x, c) => fmtValue(x, v.fmt.format, v.fmt.currency, c);
/** the room the tick words on the left need (the axis title sits to the left of them) */
const leftOf = (labels: string[]) => Math.max(52, Math.ceil(34 + Math.max(0, ...labels.map((l) => l.length)) * 6.8));
function XLabels({ names, cx, y, lab }: { names: string[]; cx: (i: number) => number; y: number; lab: { rot: boolean; every: number; max: number } }) {
  return <>{names.map((n, i) => i % lab.every === 0 && (lab.rot
    ? <text key={i} className="ck-tick" transform={`translate(${cx(i)} ${y - 8}) rotate(-90)`} textAnchor="end" dy="0.35em">{cutWord(n, lab.max)}</text>
    : <text key={i} className="ck-tick" x={cx(i)} y={y} textAnchor="middle">{n}</text>))}</>;
}
/** open a card for an element from code (the arrow keys): the popover's own focus handler does it */
const showCard = (pop: Pop, id: string, data: PopData, el: Element) => (pop.bind(id, data).onFocus as (e: { currentTarget: Element }) => void)({ currentTarget: el });
/** the layouts that run again at a zoom pay from a budget of this part's own, never the page's */
const layoutBudget = () => new Budget(partLimitsOf(), null, null, "the chart-kinds part");

/** one tab stop on the plot: the arrow keys walk its hits (each opens its card), Esc closes (popover) */
function useWalk(hits: Hit[], pop: Pop, host: Host, vertical = false) {
  const at = useRef(-1);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    let i = at.current;
    if (e.key === keys[1] || (!vertical && e.key === "ArrowDown")) i = Math.min(hits.length - 1, i + 1);
    else if (e.key === keys[0] || (!vertical && e.key === "ArrowUp")) i = Math.max(0, i < 0 ? 0 : i - 1);
    else if (e.key === "Home") i = 0; else if (e.key === "End") i = hits.length - 1;
    else return;
    e.preventDefault();
    at.current = i;
    const h = hits[i], el = host.current?.querySelector(`[data-hit="${h.id}"]`);
    if (el) showCard(pop, h.id, h.data, el);
  };
  return { tabIndex: 0, onKeyDown, onBlur: () => { at.current = -1; } };
}

/** the extra height a chart with long names reserves for upright names (it depends on the names only, never on the width) */
const upright = (names: string[]): number => (names.some((n) => n.length > 5) ? Math.max(50, rotRoom(names) - 46) : 0);
// The height of a chart never depends on the width it is measured at: the page is drawn for an assumed width and measured
// after it hydrates, and a height that changed with the width would move the controls under a tap.
function heightOf(v: View): number {
  switch (v.kind) {
    case "histogram": return 300;
    case "boxplot": case "violin": return 340 + upright(v.stats.map((s) => s.name));
    case "waterfall": return 340 + upright(v.rows.map((r) => r.name));
    case "funnel": return v.stages.length * 86 - 26 + 8;
    case "treemap": return 420;
    default: return 0;
  }
}

// ---------------------------------------------------------------- histogram, box plot, violin: one axis frame
function YAxis({ ticks, y, x0, x1, f, label }: { ticks: number[]; y: (v: number) => number; x0: number; x1: number; f: Fmt; label?: string }) {
  return <g className="ck-axis" aria-hidden="true">
    {ticks.map((t) => <g key={t}><line className="ck-grid" x1={x0} x2={x1} y1={y(t)} y2={y(t)} /><text className="ck-tick" x={x0 - 8} y={y(t) + 4} textAnchor="end">{f(t, true)}</text></g>)}
    {label && <text className="ck-axis-title" transform={`translate(12 ${(y(ticks[0]) + y(ticks[ticks.length - 1])) / 2}) rotate(-90)`} textAnchor="middle">{label}</text>}
  </g>;
}
function Marks({ marks, mx, plot, pop, vertical, y }: { marks: Extract<View, { kind: "histogram" }>["marks"]; mx: (v: number) => number; plot: { l: number; r: number; t: number; b: number }; pop: Pop; vertical: boolean; y?: (v: number) => number }) {
  return <g>{marks.map((m, i) => {
    const d: PopData = { title: m.label, text: m.text };
    const cw = Math.max(34, m.label.length * 8 + 10);
    const chip = (x: number, yy: number) => <g transform={`translate(${x} ${yy})`}><rect className="ck-chip" width={cw} height={18} rx={9} /><text className="ck-chip-t" x={cw / 2} y={13} textAnchor="middle">{m.label}</text></g>;
    if (vertical) {
      const x = mx(m.value);
      return <g key={i} className="ck-mark" tabIndex={0} role="button" aria-label={`${m.label}: ${m.text}`} data-hit={`mark-${i}`} {...pop.bind(`mark-${i}`, d)}>
        <line x1={x} x2={x} y1={plot.t - 4} y2={plot.b} />
        <rect className="ck-mark-hit" x={x - 12} y={plot.t - 24} width={24} height={plot.b - plot.t + 24} />
        {chip(Math.min(plot.r - 40, Math.max(plot.l, x - 20)), plot.t - 22)}
      </g>;
    }
    const yy = y!(m.value);
    return <g key={i} className="ck-mark" tabIndex={0} role="button" aria-label={`${m.label}: ${m.text}`} data-hit={`mark-${i}`} {...pop.bind(`mark-${i}`, d)}>
      <line x1={plot.l} x2={plot.r} y1={yy} y2={yy} />
      <rect className="ck-mark-hit" x={plot.l} y={yy - 12} width={plot.r - plot.l} height={24} />
      {chip(plot.r - cw, yy - 22)}
    </g>;
  })}</g>;
}

function Histogram({ v, w, pop, host }: { v: Extract<View, { kind: "histogram" }>; w: number; pop: Pop; host: Host }) {
  const gid = useId();
  const f = fmtOf(v);
  const narrow = w < 480, H = heightOf(v);
  const plot = { l: 58, r: w - 14, t: 34, b: H - 40 };
  const e = v.edges, n = e.length - 1;
  const mx = (x: number) => plot.l + ((x - e[0]) / (e[n] - e[0])) * (plot.r - plot.l);
  const maxC = Math.max(1, ...v.series.flatMap((s) => s.counts));
  const yt = niceTicks(0, maxC, 5); const ymax = yt[yt.length - 1] || 1;
  const y = (c: number) => plot.b - (c / ymax) * (plot.b - plot.t);
  const xt = fitTicks(niceTicks(e[0], e[n], narrow ? 3 : 6).filter((x) => x >= e[0] - 1e-9 && x <= e[n] + 1e-9), mx, (x) => f(x, true));
  const gap = (mx(e[1]) - mx(e[0])) > 8 ? 2 : (mx(e[1]) - mx(e[0])) > 3 ? 1 : 0;
  const hits: Hit[] = Array.from({ length: n }, (_, i) => ({ id: `bin-${i}`, data: { title: `${f(e[i])} to ${f(e[i + 1])}`, meta: v.series.length === 1 ? `${v.series[0].counts[i]} of ${v.series[0].n} values · ${pct(v.series[0].counts[i] / v.series[0].n)}` : undefined, text: v.series.length > 1 ? v.series.map((s) => `${s.name}: ${s.counts[i]} (${pct(s.counts[i] / s.n)})`).join("\n") : undefined } }));
  const walk = useWalk([...hits, ...v.marks.map((m, i) => ({ id: `mark-${i}`, data: { title: m.label, text: m.text } }))], pop, host);
  // one pick area over the whole plot: the bin under the pointer (so a thin bin is still easy to hit on a phone)
  const last = useRef(-1);
  const pickAt = (ev: React.MouseEvent | React.PointerEvent, toggle: boolean) => {
    const r = (ev.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor(((ev.clientX - r.left) / r.width) * n)));
    const h = hits[i], el = host.current?.querySelector(`[data-hit="${h.id}"]`);
    if (!el) return;
    if (toggle && pop.openId === h.id && last.current === i) { pop.hide(); last.current = -1; return; }
    last.current = i; showCard(pop, h.id, h.data, el);
  };
  return <>
    {v.series.length > 1 && <div className="ck-legend">{v.series.map((s) => <span key={s.name} className={`ck-key ${tcls(s.tone)}`}><i />{s.name}</span>)}</div>}
    <svg className="ck-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-label={`Histogram, ${n} bins. ${W.binsAria}`} {...walk}>
      <defs>{v.series.map((s, i) => <linearGradient key={i} id={`${gid}-g${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className={`ck-stop-a ${tcls(s.tone)}`} /><stop offset="1" className={`ck-stop-b ${tcls(s.tone)}`} /></linearGradient>)}</defs>
      <YAxis ticks={yt} y={y} x0={plot.l} x1={plot.r} f={(x) => x.toLocaleString("en-US")} label={v.yLabel} />
      <g className="ck-bars">{v.series.map((s, si) => s.counts.map((c, i) => c > 0 && <rect key={`${si}-${i}`} className="ck-bar" style={{ animationDelay: `${Math.min(i, 30) * 12}ms`, opacity: v.series.length > 1 ? 0.62 : 1 }} fill={`url(#${gid}-g${si})`} x={mx(e[i]) + gap / 2} width={Math.max(1, mx(e[i + 1]) - mx(e[i]) - gap)} y={y(c)} height={plot.b - y(c)} rx={Math.min(4, (mx(e[1]) - mx(e[0])) / 3)} />))}</g>
      <line className="ck-base" x1={plot.l} x2={plot.r} y1={plot.b} y2={plot.b} />
      <g className="ck-axis" aria-hidden="true">{xt.map((x, i) => <text key={i} className="ck-tick" x={mx(x)} y={plot.b + 18} textAnchor="middle">{f(x, true)}</text>)}<text className="ck-axis-title" x={(plot.l + plot.r) / 2} y={H - 6} textAnchor="middle">{v.xLabel}</text></g>
      <g>{hits.map((h, i) => <rect key={h.id} className="ck-pick" data-hit={h.id} x={mx(e[i])} width={Math.max(2, mx(e[i + 1]) - mx(e[i]))} y={plot.t} height={plot.b - plot.t} />)}</g>
      <rect className="ck-hit" x={plot.l} y={plot.t} width={plot.r - plot.l} height={plot.b - plot.t} onPointerMove={(ev) => { if (ev.pointerType === "mouse") pickAt(ev, false); }} onPointerLeave={(ev) => { if (ev.pointerType === "mouse") pop.hide(); }} onClick={(ev) => pickAt(ev, true)} />
      <Marks marks={v.marks} mx={mx} plot={plot} pop={pop} vertical />
    </svg>
  </>;
}

function BoxViolin({ v, w, pop, host }: { v: Extract<View, { kind: "boxplot" | "violin" }>; w: number; pop: Pop; host: Host }) {
  const f = fmtOf(v);
  const H = heightOf(v);
  const plot = { l: 62, r: w - 14, t: 30, b: H - 46 };
  const lo = Math.min(...v.stats.map((s) => s.min)), hi = Math.max(...v.stats.map((s) => s.max), ...v.marks.map((m) => m.value));
  const yt = niceTicks(Math.min(lo, ...v.marks.map((m) => m.value)), hi, 5);
  plot.l = leftOf(yt.map((x) => f(x, true)));
  const lab = xLab(v.stats.map((s) => s.name), (plot.r - plot.l) / v.stats.length);
  plot.b = H - (lab.rot ? rotRoom(v.stats.map((s) => s.name)) : 46);
  const y0 = yt[0], y1 = yt[yt.length - 1];
  const y = (x: number) => plot.b - ((x - y0) / (y1 - y0 || 1)) * (plot.b - plot.t);
  const band = (plot.r - plot.l) / v.stats.length, cx = (i: number) => plot.l + band * (i + 0.5);
  const bw = Math.max(12, Math.min(56, band * 0.56));
  const hits: Hit[] = v.stats.map((s, i) => ({ id: `cat-${i}`, data: { title: s.name, meta: `${s.n} values`, text: `min ${f(s.min)} · p25 ${f(s.q1)} · median ${f(s.median)} · p75 ${f(s.q3)} · max ${f(s.max)}${s.outliers.length ? ` · ${s.outliers.length} outlier${s.outliers.length === 1 ? "" : "s"}` : ""}` } }));
  const walk = useWalk([...hits, ...v.marks.map((m, i) => ({ id: `mark-${i}`, data: { title: m.label, text: m.text } }))], pop, host);
  return (
    <svg className="ck-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-label={`${v.kind === "violin" ? "Violin" : "Box"} plot, ${v.stats.length} categories. Arrow keys walk the categories.`} {...walk}>
      <YAxis ticks={yt} y={y} x0={plot.l} x1={plot.r} f={f} label={v.yLabel} />
      <line className="ck-base" x1={plot.l} x2={plot.r} y1={plot.b} y2={plot.b} />
      {v.stats.map((s, i) => {
        const x = cx(i), tone = tcls(v.tone);
        if (v.kind === "violin" && v.kde && v.densMax) {
          const k = v.kde[i], hw = (d: number) => (d / v.densMax!) * (band * 0.46);
          const right = k.at.map((a, j) => `${j ? "L" : "M"}${(x + hw(k.dens[j])).toFixed(1)} ${y(a).toFixed(1)}`).join("");
          const left = k.at.slice().reverse().map((a, j) => `L${(x - hw(k.dens[k.at.length - 1 - j])).toFixed(1)} ${y(a).toFixed(1)}`).join("");
          return <g key={i} className={`ck-viol ${tone}`} style={{ animationDelay: `${i * 40}ms` }}>
            <path className="ck-violin" d={`${right}${left}Z`} />
            <line className="ck-whisker" x1={x} x2={x} y1={y(s.lo)} y2={y(s.hi)} />
            <rect className="ck-ibox" x={x - 4} y={y(s.q3)} width={8} height={Math.max(2, y(s.q1) - y(s.q3))} rx={3} />
            <circle className="ck-median-dot" cx={x} cy={y(s.median)} r={3.4} />
            {s.outliers.slice(0, 40).map((o, j) => <circle key={j} className="ck-out" cx={x} cy={y(o)} r={3} />)}
          </g>;
        }
        return <g key={i} className={`ck-bx ${tone}`} style={{ animationDelay: `${i * 40}ms` }}>
          <line className="ck-whisker" x1={x} x2={x} y1={y(s.hi)} y2={y(s.q3)} /><line className="ck-whisker" x1={x} x2={x} y1={y(s.q1)} y2={y(s.lo)} />
          <line className="ck-cap" x1={x - bw / 4} x2={x + bw / 4} y1={y(s.hi)} y2={y(s.hi)} /><line className="ck-cap" x1={x - bw / 4} x2={x + bw / 4} y1={y(s.lo)} y2={y(s.lo)} />
          <rect className="ck-boxr" x={x - bw / 2} y={y(s.q3)} width={bw} height={Math.max(2, y(s.q1) - y(s.q3))} rx={5} />
          <line className="ck-median" x1={x - bw / 2} x2={x + bw / 2} y1={y(s.median)} y2={y(s.median)} />
          <path className="ck-mean" d={`M${x} ${y(s.mean) - 4}l4 4-4 4-4-4z`} />
          {s.outliers.slice(0, 40).map((o, j) => <circle key={j} className="ck-out" cx={x} cy={y(o)} r={3} />)}
        </g>;
      })}
      <g className="ck-axis" aria-hidden="true"><XLabels names={v.stats.map((s) => s.name)} cx={cx} y={plot.b + 18} lab={lab} /><text className="ck-axis-title" x={(plot.l + plot.r) / 2} y={H - 8} textAnchor="middle">{v.xLabel}</text></g>
      <g>{hits.map((h, i) => <rect key={h.id} className="ck-hit" data-hit={h.id} x={plot.l + band * i} width={band} y={plot.t} height={plot.b - plot.t} {...pop.bind(h.id, h.data)} onFocus={undefined} onBlur={undefined} />)}</g>
      <Marks marks={v.marks} mx={() => 0} plot={plot} pop={pop} vertical={false} y={y} />
    </svg>
  );
}

// ---------------------------------------------------------------- funnel
function Funnel({ v, w, pop, host }: { v: Extract<View, { kind: "funnel" }>; w: number; pop: Pop; host: Host }) {
  const f = fmtOf(v);
  const head = 24, band = 36, gap = 26, cw = w - 8, mid = w / 2;
  const n = v.stages.length, blockH = head + band + gap;
  const H = heightOf(v);
  const max = v.stages[0].value || 1;
  const wd = (x: number) => Math.max(6, (x / max) * cw);
  const hits: Hit[] = v.stages.map((s, i) => ({ id: `st-${i}`, data: { title: s.name, meta: `${f(s.value)} · ${pct(s.ofFirst)} of the first`, text: s.ofPrev === null ? undefined : `${pct(s.ofPrev)} of the stage before; ${pct(1 - s.ofPrev)} dropped out.` } }));
  const walk = useWalk(hits, pop, host, true);
  return (
    <svg className={`ck-svg ck-funnel ${tcls(v.tone)}`} width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-label={`Funnel, ${n} stages. Arrow keys walk the stages.`} {...walk}>
      {v.stages.map((s, i) => {
        const y0 = i * blockH, top = wd(s.value), bot = i < n - 1 ? wd(v.stages[i + 1].value) : top * 0.82;
        const by = y0 + head;
        const t = n > 1 ? i / (n - 1) : 0;
        const d = `M${mid - top / 2} ${by}H${mid + top / 2}L${mid + bot / 2} ${by + band}H${mid - bot / 2}Z`;
        return <g key={i} className="ck-stage" style={{ animationDelay: `${i * 70}ms` }}>
          <text className="ck-st-name" x={4} y={y0 + 16}>{trunc(s.name, Math.max(6, Math.floor((w - 92) / 7.6)))}</text>
          <text className="ck-st-val" x={w - 4} y={y0 + 16} textAnchor="end">{f(s.value)}</text>
          <path className="ck-fun" d={d} style={{ ["--chart-kinds-ramp" as string]: `${Math.round(100 - t * 52)}%` }} />
          {bot > 44 && <text className="ck-fun-pct" x={mid} y={by + band / 2 + 4.5} textAnchor="middle">{pct(s.ofFirst)}</text>}
          {i < n - 1 && s.value > 0 && <g className="ck-drop" transform={`translate(${mid} ${by + band + 3})`}><rect x={-34} width={68} height={18} rx={9} /><text y={13} textAnchor="middle">{`−${pct(1 - v.stages[i + 1].value / s.value)}`}</text></g>}
          <rect className="ck-hit" data-hit={`st-${i}`} x={0} y={y0} width={w} height={blockH - gap + 4} {...pop.bind(`st-${i}`, hits[i].data)} onFocus={undefined} onBlur={undefined} />
        </g>;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- waterfall
function Waterfall({ v, w, pop, host }: { v: Extract<View, { kind: "waterfall" }>; w: number; pop: Pop; host: Host }) {
  const f = fmtOf(v);
  const H = heightOf(v);
  const plot = { l: 62, r: w - 14, t: 30, b: H - 46 };
  const vals = v.rows.flatMap((r) => [r.from, r.to]).concat(0);
  const yt = niceTicks(Math.min(...vals), Math.max(...vals), 5);
  plot.l = leftOf(yt.map((x) => f(x, true)));
  const lab = xLab(v.rows.map((r) => r.name), (plot.r - plot.l) / v.rows.length);
  plot.b = H - (lab.rot ? rotRoom(v.rows.map((r) => r.name)) : 46);
  const y0 = yt[0], y1 = yt[yt.length - 1];
  const y = (x: number) => plot.b - ((x - y0) / (y1 - y0 || 1)) * (plot.b - plot.t);
  const band = (plot.r - plot.l) / v.rows.length, cx = (i: number) => plot.l + band * (i + 0.5), bw = Math.max(10, Math.min(60, band * 0.62));
  // the value over each bar: kept only where it has the room (totals first); the others are in the card and the LLM view
  const labels = v.rows.map((r) => (r.type === "total" || r.type === "start" ? f(r.type === "total" ? r.total : r.change, true) : `${r.change >= 0 ? "+" : "−"}${f(Math.abs(r.change), true)}`));
  const shown = placeValues(v.rows.map((r, i) => ({ text: labels[i], at: cx(i), first: r.type === "total" || r.type === "start" })));
  const hits: Hit[] = v.rows.map((r, i) => ({ id: `wf-${i}`, data: { title: r.name, meta: r.type === "total" ? `Total ${f(r.total)}` : r.type === "start" ? `Start ${f(r.change)}` : `${r.change >= 0 ? "+" : ""}${f(r.change)} → ${f(r.total)}`, text: r.type === "up" || r.type === "down" ? `Running total goes from ${f(r.from)} to ${f(r.to)}.` : undefined } }));
  const walk = useWalk(hits, pop, host);
  return (
    <svg className="ck-svg" width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="group" aria-label={`Waterfall, ${v.rows.length} steps. Arrow keys walk the steps.`} {...walk}>
      <YAxis ticks={yt} y={y} x0={plot.l} x1={plot.r} f={f} label={v.yLabel} />
      <line className="ck-base" x1={plot.l} x2={plot.r} y1={y(0)} y2={y(0)} />
      {v.rows.map((r, i) => {
        const top = y(Math.max(r.from, r.to)), h = Math.max(2, Math.abs(y(r.from) - y(r.to)));
        const next = v.rows[i + 1];
        const tone = r.type === "up" ? "ck-t-good" : r.type === "down" ? "ck-t-bad" : "ck-t-acc";
        const label = labels[i];
        return <g key={i} className={`ck-wf ${tone}`} style={{ animationDelay: `${i * 60}ms` }}>
          {next && <line className="ck-conn" x1={cx(i) + bw / 2} x2={cx(i + 1) - bw / 2} y1={y(r.to)} y2={y(r.to)} />}
          <rect className="ck-wfbar" x={cx(i) - bw / 2} y={top} width={bw} height={h} rx={4} />
          {shown[i] && <text className="ck-wf-val" x={cx(i)} y={r.type === "down" ? top + h + 16 : top - 8} textAnchor="middle">{label}</text>}
        </g>;
      })}
      <g className="ck-axis" aria-hidden="true"><XLabels names={v.rows.map((r) => r.name)} cx={cx} y={plot.b + 18} lab={lab} /><text className="ck-axis-title" x={(plot.l + plot.r) / 2} y={H - 8} textAnchor="middle">{v.xLabel}</text></g>
      <g>{hits.map((h, i) => <rect key={h.id} className="ck-hit" data-hit={h.id} x={plot.l + band * i} width={band} y={plot.t} height={plot.b - plot.t} {...pop.bind(h.id, h.data)} onFocus={undefined} onBlur={undefined} />)}</g>
    </svg>
  );
}

// ---------------------------------------------------------------- treemap and sunburst: one tree, a zoom
function useZoom(nodes: TNode[]) {
  const [root, setRoot] = useState(0);
  useEffect(() => { setRoot(0); }, [nodes]);
  const crumbs: number[] = [];
  for (let i = root; i >= 0; i = nodes[i].parent) crumbs.unshift(i);
  return { root, setRoot, crumbs };
}
function Crumbs({ nodes, crumbs, setRoot, label }: { nodes: TNode[]; crumbs: number[]; setRoot: (i: number) => void; label: string }) {
  const nm = (c: number) => (c === 0 ? W.root : nodes[c].name);
  return <nav className="ck-crumbs" aria-label={label}>{crumbs.map((c, i) => i < crumbs.length - 1
    ? <React.Fragment key={c}><button type="button" className="ck-crumb" onClick={() => setRoot(c)}>{nm(c)}</button><span aria-hidden="true">›</span></React.Fragment>
    : <span key={c} className="ck-crumb-now" aria-current="true">{nm(c)}</span>)}</nav>;
}
const nodeData = (nodes: TNode[], id: number, f: Fmt, whole: TNode, zoomHint: boolean): PopData => {
  const n = nodes[id], par = n.parent >= 0 ? nodes[n.parent] : null;
  return { title: n.name, meta: `${f(n.value)} · ${pct(n.value / (whole.value || 1))} of ${id === 0 ? "all" : whole.id === 0 ? "the whole" : whole.name}`, text: `${par && par.id !== 0 ? `In ${par.path}. ` : ""}${par && par.id !== whole.id ? `${pct(n.value / (par.value || 1))} of ${par.name}. ` : ""}${n.children.length ? `${n.children.length} inside${zoomHint ? "; click to open" : ""}.` : ""}`.trim() || undefined };
};

function Treemap({ v, w, pop }: { v: Extract<View, { kind: "treemap" | "sunburst" }>; w: number; pop: Pop }) {
  const { root, setRoot, crumbs } = useZoom(v.nodes);
  const f = fmtOf(v);
  const H = heightOf(v);
  const rects = useMemo(() => { try { return treemapLayout(v.nodes, root, w, H, v.depth, layoutBudget()); } catch { return []; } }, [v, root, w, H]);
  const whole = v.nodes[root];
  const ordered = rects.slice().sort((a, b) => a.id - b.id);
  const grid = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const els = [...(grid.current?.querySelectorAll<HTMLElement>("button.ck-tile") ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    let j = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = Math.min(els.length - 1, i + 1); else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = Math.max(0, i - 1); else if (e.key === "Home") j = 0; else if (e.key === "End") j = els.length - 1; else if (e.key === "Backspace" && root !== 0) { e.preventDefault(); setRoot(v.nodes[root].parent); return; } else return;
    e.preventDefault(); els[j]?.focus();
  };
  return <>
    <Crumbs nodes={v.nodes} crumbs={crumbs} setRoot={setRoot} label="Treemap path" />
    <div className="ck-tm" ref={grid} style={{ width: w, height: H }} onKeyDown={onKey} role="group" aria-label={`Treemap of ${whole.name}. Arrow keys move, Enter opens a branch, Backspace goes up.`}>
      {ordered.map((r) => {
        const n = v.nodes[r.id], branch = n.children.length > 0;
        const small = r.w < 24 || r.h < 24;
        const style: React.CSSProperties = { left: r.x, top: r.y, width: r.w, height: r.h, zIndex: r.depth, ["--chart-kinds-lvl" as string]: String(r.depth) };
        const cls = `ck-tile ${tcls(n.tone)}${r.header ? " has-head" : ""}${branch ? " is-branch" : ""}`;
        const label = r.header && r.w >= 52 ? <span className="ck-head"><span className="ck-tn">{n.name}</span>{r.w >= 120 && <span className="ck-tv ck-tv-head">{f(n.value)}</span>}</span> : r.w >= 52 && r.h >= 30 ? <><span className="ck-tn">{n.name}</span>{!r.header && r.h >= 46 && <span className="ck-tv">{f(n.value)}</span>}</> : null;
        if (small) return <div key={r.id} className={cls + " ck-tile-tiny"} style={style} aria-hidden="true" />;
        const bind = pop.bind(`n-${r.id}`, nodeData(v.nodes, r.id, f, whole, true));
        return <button key={r.id} type="button" className={cls} style={style} data-hit={`n-${r.id}`} aria-label={`${n.name}, ${f(n.value)}${branch ? ", open" : ""}`}
          {...bind}
          onClick={(e) => { if (branch) { pop.hide(); setRoot(r.id); } else bind.onClick(e); }}>
          {label}
        </button>;
      })}
    </div>
    <p className="ck-hint">{W.tapHint}</p>
  </>;
}

const TAU = Math.PI * 2;
function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, pad: number): string {
  const p = Math.min(pad, (a1 - a0) / 3);
  a0 += p / 2; a1 -= p / 2;
  const pt = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  const big = a1 - a0 > Math.PI ? 1 : 0;
  if (a1 - a0 >= TAU - 0.001) return `M${pt(r1, 0)}A${r1} ${r1} 0 1 1 ${pt(r1, Math.PI)}A${r1} ${r1} 0 1 1 ${pt(r1, 0)}M${pt(r0, 0)}A${r0} ${r0} 0 1 0 ${pt(r0, Math.PI)}A${r0} ${r0} 0 1 0 ${pt(r0, 0)}Z`;
  return `M${pt(r1, a0)}A${r1} ${r1} 0 ${big} 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 ${big} 0 ${pt(r0, a0)}Z`;
}
function Sunburst({ v, w, pop }: { v: Extract<View, { kind: "treemap" | "sunburst" }>; w: number; pop: Pop }) {
  const { root, setRoot, crumbs } = useZoom(v.nodes);
  const f = fmtOf(v);
  const size = Math.min(w, 460), cx = size / 2, cy = size / 2, R = size / 2 - 4;
  const r0 = R * 0.26, ring = (R - r0) / v.depth;
  const arcs = useMemo(() => { try { return sunburstLayout(v.nodes, root, v.depth, layoutBudget()); } catch { return []; } }, [v, root]);
  const whole = v.nodes[root];
  const walk = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const els = [...(walk.current?.querySelectorAll<SVGElement>("[data-arc]") ?? [])] as unknown as HTMLElement[];
    const i = els.indexOf(document.activeElement as HTMLElement);
    let j = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = Math.min(els.length - 1, i + 1); else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = Math.max(0, i - 1); else if (e.key === "Home") j = 0; else if (e.key === "End") j = els.length - 1; else if (e.key === "Backspace" && root !== 0) { e.preventDefault(); setRoot(v.nodes[root].parent); return; } else return;
    e.preventDefault(); els[j]?.focus();
  };
  return <>
    <Crumbs nodes={v.nodes} crumbs={crumbs} setRoot={setRoot} label="Sunburst path" />
    <div className="ck-sb" ref={walk} onKeyDown={onKey}>
      <svg className="ck-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="group" aria-label={`Sunburst of ${whole.name}. Arrow keys move, Enter opens a branch, Backspace goes up.`}>
        {arcs.map((a) => {
          const n = v.nodes[a.id], branch = n.children.length > 0;
          const rin = r0 + (a.ring - 1) * ring, rout = r0 + a.ring * ring;
          const mid = (a.a0 + a.a1) / 2, rm = (rin + rout) / 2, len = (a.a1 - a.a0) * rm, chord = (a.a1 - a.a0) * rout;
          const tiny = chord < 24 || rout - rin < 24;
          const flip = mid > Math.PI;
          const deg = (mid * 180) / Math.PI - 90 + (flip ? 180 : 0);
          const room = Math.floor((rout - rin - 8) / 7);
          const inner = len >= 56 && rout - rin >= 26;
          const common = { className: `ck-arc ${tcls(n.tone)}${branch ? " is-branch" : ""}`, style: { ["--chart-kinds-lvl" as string]: String(a.ring), animationDelay: `${a.ring * 80}ms` } as React.CSSProperties };
          if (tiny) return <path key={a.id} {...common} d={arcPath(cx, cy, rin, rout, a.a0, a.a1, 0.012)} aria-hidden="true" style={{ ...common.style, pointerEvents: "none" }} />;
          const bind = pop.bind(`n-${a.id}`, nodeData(v.nodes, a.id, f, whole, true));
          return <g key={a.id} data-arc="1" data-hit={`n-${a.id}`} tabIndex={0} role="button" aria-label={`${n.name}, ${f(n.value)}, ${pct(n.value / (whole.value || 1))}${branch ? ", open" : ""}`} {...bind}
            onClick={(e: React.MouseEvent) => { if (branch) { pop.hide(); setRoot(a.id); } else bind.onClick(e); }}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (branch) { pop.hide(); setRoot(a.id); } else bind.onClick(e as unknown as React.MouseEvent); } }}>
            <path {...common} d={arcPath(cx, cy, rin, rout, a.a0, a.a1, 0.012)} />
            {inner && <text className="ck-arc-t" transform={`translate(${cx + rm * Math.sin(mid)} ${cy - rm * Math.cos(mid)}) rotate(${deg})`} textAnchor="middle" dy="0.34em">{trunc(n.name, Math.min(room * 2, Math.floor(len / 6.5)))}</text>}
          </g>;
        })}
        <g className="ck-core" tabIndex={root !== 0 ? 0 : -1} role={root !== 0 ? "button" : undefined} aria-label={root !== 0 ? `Up to ${v.nodes[whole.parent].name}` : undefined}
          onClick={() => { if (root !== 0) { pop.hide(); setRoot(whole.parent); } }}
          onKeyDown={(e) => { if (root !== 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setRoot(whole.parent); } }}>
          <circle cx={cx} cy={cy} r={r0 - 3} />
          <text x={cx} y={cy - 4} textAnchor="middle" className="ck-core-n">{trunc(root === 0 ? W.root : whole.name, 14)}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="ck-core-v">{f(whole.value)}</text>
        </g>
      </svg>
    </div>
    <p className="ck-hint">{W.ringHint}</p>
  </>;
}

// ---------------------------------------------------------------- calendar heatmap
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function Calendar({ v, pop }: { v: Extract<View, { kind: "calendar" }>; pop: Pop }) {
  const f = fmtOf(v);
  const cell = 24, gap = 3, step = cell + gap, head = 22;
  const [at, setAt] = useState(() => Math.max(0, v.days.length - 1));
  useEffect(() => { setAt(Math.max(0, v.days.length - 1)); }, [v]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [v]);
  const wdNames = v.week === "mon" ? WD : [WD[6], ...WD.slice(0, 6)];
  const range = v.hi - v.lo || 1;
  const col = (d: Day) => d.value === null ? undefined : `color-mix(in oklab, var(--chart-kinds-tone) ${Math.round(8 + ((d.value - v.lo) / range) * 92)}%, var(--chart-kinds-heat-lo))`;
  const dayName = (d: Day) => `${DAY_NAMES[new Date(d.day * 86400000).getUTCDay()]} ${d.date}`;
  const dataOf = (d: Day): PopData => ({ title: dayName(d), meta: d.value === null ? "No data" : `${v.yLabel}: ${f(d.value)}` });
  const onKey = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 7 : e.key === "ArrowLeft" ? -7 : e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "Home" ? -9999 : e.key === "End" ? 9999 : 0;
    if (!d) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(v.days.length - 1, at + d));
    setAt(j);
    requestAnimationFrame(() => { scroller.current?.querySelector<HTMLElement>(`[data-i="${j}"]`)?.focus(); });
  };
  return <>
    <div className={`ck-cal ${tcls(v.tone)}`}>
      <div className="ck-cal-wd" style={{ height: head + 7 * step }} aria-hidden="true">{wdNames.map((n, i) => <span key={n} style={{ top: head + i * step, height: cell }}>{i % 2 === 0 ? n : ""}</span>)}</div>
      <div className="ck-cal-scroll" ref={scroller}>
        <div className="ck-cal-in" style={{ width: v.cols * step, height: head + 7 * step }} onKeyDown={onKey} role="grid" aria-label={`${v.yLabel} by day, ${v.from} to ${v.to}. Arrow keys move between days.`}>
          {v.months.map((m) => <span key={m.ym} className="ck-cal-m" style={{ left: m.col * step }}>{m.label}</span>)}
          {v.days.map((d, i) => {
            const data = dataOf(d), bind = pop.bind(`d-${i}`, data);
            return <button key={d.date} type="button" role="gridcell" className={`ck-day${d.value === null ? " is-empty" : ""}`} data-i={i} data-hit={`d-${i}`} tabIndex={i === at ? 0 : -1}
              style={{ left: d.col * step, top: head + d.row * step, width: cell, height: cell, background: col(d) }} aria-label={`${dayName(d)}: ${d.value === null ? "no data" : f(d.value)}`}
              {...bind} onFocus={(e) => { setAt(i); bind.onFocus(e); }} />;
          })}
        </div>
      </div>
    </div>
    <div className={`ck-cal-key ${tcls(v.tone)}`} aria-hidden="true"><span>{f(v.lo)}</span><span className="ck-cal-ramp" /><span>{f(v.hi)}</span></div>
    {v.cols * step > 360 && <p className="ck-hint">{W.swipe}</p>}
  </>;
}

// ---------------------------------------------------------------- the table (the text form) and the frame
function tableOf(v: View): { cols: string[]; rows: string[][] } {
  const f = fmtOf(v);
  switch (v.kind) {
    case "histogram": return { cols: ["from", "to", ...v.series.map((s) => (v.series.length > 1 ? s.name : "count"))], rows: v.series[0].counts.map((_, i) => [f(v.edges[i]), f(v.edges[i + 1]), ...v.series.map((s) => String(s.counts[i]))]) };
    case "boxplot": case "violin": return { cols: ["category", "min", "p25", "median", "p75", "max", "outliers"], rows: v.stats.map((s) => [s.name, f(s.min), f(s.q1), f(s.median), f(s.q3), f(s.max), s.outliers.length ? s.outliers.slice(0, 12).map((o) => f(o)).join(", ") + (s.outliers.length > 12 ? `, ... (${s.outliers.length})` : "") : "none"]) };
    case "funnel": return { cols: ["stage", "count", "of the first", "of the one before"], rows: v.stages.map((s) => [s.name, f(s.value), pctText(s.ofFirst), s.ofPrev === null ? "" : pctText(s.ofPrev)]) };
    case "waterfall": return { cols: ["step", "change", "running total"], rows: v.rows.map((r) => [r.name, r.type === "total" ? "total" : f(r.change), f(r.total)]) };
    case "treemap": case "sunburst": return { cols: ["name", "value", "share", "path"], rows: v.nodes.slice(1).map((n) => [`${"· ".repeat(n.depth - 1)}${n.name}`, f(n.value), pctText(n.share), n.path]) };
    case "calendar": return { cols: ["date", "value"], rows: v.days.filter((d) => d.value !== null).map((d) => [d.date, f(d.value!)]) };
  }
}

export default function ChartKindsView({ data, ui, static: stp, stage }: PartViewProps<ChartKindsData>) {
  const host = useRef<HTMLDivElement>(null);
  const pop = usePopover(host, ui.close);
  const n = data.stepped ? data.steps.length : 0;
  const titles = useMemo(() => data.steps.map((s) => s.title), [data]);
  const st = useSteps(n, stp, titles);
  const w = Math.max(280, Math.round(stage.width || FIRST_WIDTH));
  const cur = data.steps[Math.min(st.i, data.steps.length - 1)];
  if (data.errors.length || !cur) return <div className="ck"><div className="cw-error">{W.cannot} {data.errors[0]?.msg ?? "it has no data"}</div></div>;
  const v = cur.view;
  const t = tableOf(v);
  return (
    <div className={`ck ck-${v.kind} dh-pop-host`} ref={host} data-dh-kind={v.kind} data-dh-static={st.sx.on || undefined} tabIndex={n > 1 ? 0 : undefined} onKeyDown={stepKeys(st, n)}>
      {v.title && <div className="ck-title">{v.title}</div>}
      <div className="ck-box" key={st.i} style={heightOf(v) ? { minHeight: heightOf(v) } : undefined}>
        {v.kind === "histogram" && <Histogram v={v} w={w} pop={pop} host={host} />}
        {(v.kind === "boxplot" || v.kind === "violin") && <BoxViolin v={v} w={w} pop={pop} host={host} />}
        {v.kind === "funnel" && <Funnel v={v} w={w} pop={pop} host={host} />}
        {v.kind === "waterfall" && <Waterfall v={v} w={w} pop={pop} host={host} />}
        {v.kind === "treemap" && <Treemap v={v} w={w} pop={pop} />}
        {v.kind === "sunburst" && <Sunburst v={v} w={w} pop={pop} />}
        {v.kind === "calendar" && <Calendar v={v} pop={pop} />}
      </div>
      <Stepper n={n} titles={titles} st={st} ui={ui} />
      <details className="chart-table"><summary>{ui.table || W.table}</summary>
        <div className="table-wrap"><table><thead><tr>{t.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{t.rows.map((row, i) => <tr key={i}>{row.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody></table></div>
      </details>
      {pop.node}
    </div>
  );
}
