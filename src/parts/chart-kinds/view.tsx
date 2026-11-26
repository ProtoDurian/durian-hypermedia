// The chart-kinds part's view (format version 11): histogram, boxplot, violin, funnel, waterfall, treemap, sunburst and
// calendar. The numbers come from compute.ts (read once, when the part is parsed); the drawing is primitives from
// src/engine/charts/kinds (the same renderer the chart part uses), painted as SVG with the page's tokens, one popover on every
// bin, box, stage, block, arc and day (hover, tap, focus), the arrow keys to walk the data, steps through the kit's player
// (a step glides to the next), a tree opened by a click with its path above. Static draws one step whole.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stepper, stepKeys, useSteps, usePopover } from "../kit/view";
import { reducedMotion } from "../../ui/parts";
import type { PartViewProps } from "../types";
import { fmtValue } from "./fmt";
import { pct as pctText, type View } from "./compute";
import type { ChartKindsData } from "./part";
import { ChartCanvas } from "../../engine/charts/page";
import { specOfView, numbersOf, crumbs, treeHint, fmtOf as kindFmt } from "../../engine/charts/kinds";

import type { PMark } from "../../engine/charts/build";

type Fmt = (x: number, compact?: boolean) => string;
const W = { cannot: "This chart cannot be drawn:", table: "Table" };
const fmtOf = (v: { fmt: { format: string; currency?: string } }): ((x: number) => string) => kindFmt(v);

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

export default function ChartKindsView({ data, ui, static: stp }: PartViewProps<ChartKindsData>) {
  const host = useRef<HTMLDivElement>(null);
  const pop = usePopover(host, ui.close);
  const n = data.stepped ? data.steps.length : 0;
  const titles = useMemo(() => data.steps.map((s) => s.title), [data]);
  const st = useSteps(n, stp, titles);
  const [zoom, setZoom] = useState(0);
  useEffect(() => { setZoom(0); }, [data]);
  const [anim, setAnim] = useState(true);
  useEffect(() => { setAnim(!reducedMotion()); }, []);
  const cur = data.steps[Math.min(st.i, data.steps.length - 1)];
  const v = cur?.view;
  // the drawing of every step, read once: a step glides to the next because the primitives keep their keys
  const drawn = useMemo(() => (v ? specOfView(v, { zoom }) : null), [v, zoom]);
  const maxv = useMemo(() => {
    if (!data.steps.length) return undefined;
    const out: number[][] = [];
    for (const s of data.steps) numbersOf(s.view).forEach((row, i) => row.forEach((x, j) => { out[i] ??= []; if (Number.isFinite(x) && !(out[i][j] >= x)) out[i][j] = x; }));
    return out;
  }, [data]);
  if (data.errors.length || !cur || !v || !drawn) return <div className="ck"><div className="cw-error">{W.cannot} {data.errors[0]?.msg ?? "it has no data"}</div></div>;
  const t = tableOf(v), tree = v.kind === "treemap" || v.kind === "sunburst";
  const path = tree ? crumbs(v, zoom) : [];
  const onMark = (m: PMark): boolean => { if (m.zoom !== undefined && tree) { pop.hide(); setZoom(m.zoom); return true; } return false; };
  const label = v.title || `${v.kind} chart`;
  return (
    <div className={`ck ck-${v.kind} dh-pop-host`} ref={host} data-dh-kind={v.kind} data-dh-static={st.sx.on || undefined} tabIndex={n > 1 ? 0 : undefined} onKeyDown={(e) => { if (tree && e.key === "Backspace" && zoom !== 0) { e.preventDefault(); setZoom(v.nodes[zoom].parent); } else stepKeys(st, n)(e); }}>
      {v.title && <div className="ck-title">{v.title}</div>}
      {tree && <nav className="ck-crumbs" aria-label={v.kind === "sunburst" ? "Sunburst path" : "Treemap path"}>{path.map((c, i) => i < path.length - 1
        ? <React.Fragment key={c.id}><button type="button" className="ck-crumb" onClick={() => setZoom(c.id)}>{c.name}</button><span aria-hidden="true">›</span></React.Fragment>
        : <span key={c.id} className="ck-crumb-now" aria-current="true">{c.name}</span>)}</nav>}
      <div className="ck-box">
        <ChartCanvas spec={drawn.spec} values={drawn.values} max={maxv} step={st.i} animate={anim && !st.sx.on} interactive={!st.sx.on} label={label} pop={pop} onMark={onMark} />
      </div>
      {tree && <p className="ck-hint">{treeHint(v)}</p>}
      <Stepper n={n} titles={titles} st={st} ui={ui} />
      <details className="chart-table"><summary>{ui.table || W.table}</summary>
        <div className="table-wrap"><table><thead><tr>{t.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{t.rows.map((row, i) => <tr key={i}>{row.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody></table></div>
      </details>
      {pop.node}
    </div>
  );
}
