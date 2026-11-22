// This package is the source of this file: edit it here. It began as a copy synced from a private prototype (scripts/sync.ts, now frozen).
// The chart part: Chart.js, with the reader's controls feeding the chart's declared functions (tools/chart.ts, tools/expr.ts).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { evalChart, chartMeta, type ChartControl } from "../core/chart";
import { chartConfig, plotHeight, fmtChartNum } from "./chart-config";
import type { Val } from "../core/expr";
import type { Ui } from "./ui";

type Spec = any;
const css = (el: Element, v: string) => getComputedStyle(el).getPropertyValue(v).trim();
const fmtNum = fmtChartNum;

export function Chart({ spec, controls, initial, ui }: { spec: Spec; controls: ChartControl[]; initial: ReturnType<typeof evalChart>; ui: Ui }) {
  const start = useMemo(() => Object.fromEntries(controls.filter((c) => c.kind !== "button").map((c) => [c.name, c.value as Val])), []);
  const [vals, setVals] = useState<Record<string, Val>>(start);
  const data = useMemo(() => (Object.keys(vals).length ? evalChart(spec, vals) : initial), [vals]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<any>(null);
  const [theme, setTheme] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false); // under 480 px: shorter labels, tighter legend
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => setNarrow((box.current?.clientWidth ?? 999) < 480));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const meta = chartMeta(spec);
  const height = plotHeight(spec, data, narrow);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)"); const on = () => setTheme((t) => t + 1); mq.addEventListener("change", on);
    return () => { mo.disconnect(); mq.removeEventListener("change", on); };
  }, []);
  useEffect(() => {
    let dead = false;
    (async () => {
      const { Chart: C, registerables } = await import("chart.js");
      C.register(...registerables);
      if (dead || !canvas.current) return;
      const el = canvas.current;
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || !!document.querySelector('[data-dh-motion="off"]');
      const cfg = chartConfig(spec, data, { tok: (n) => css(el, n), narrow, reduce, words: ui.candleWords });
      if (chart.current && chart.current.config.type === cfg.type) { chart.current.data = cfg.data; chart.current.options = cfg.options; chart.current.update(); }
      else { chart.current?.destroy(); chart.current = new C(el, cfg); }
    })();
    return () => { dead = true; };
  }, [data, theme, narrow]);
  useEffect(() => () => chart.current?.destroy(), []);
  const set = (k: string, v: Val) => setVals((s) => ({ ...s, [k]: v }));
  return (
    <div className="chart">
      {spec.title && <div className="chart-title">{spec.title}</div>}
      <div className="chart-canvas" ref={box} style={height ? { height } : undefined}><canvas ref={canvas} role="img" aria-label={spec.title ?? ui.chart} /></div>
      {meta.candle && !data.error && <div className="candle-key"><span className="ck ck-up" aria-hidden="true" />{ui.candleUp ?? "Up: close at or above open"}<span className="ck ck-down" aria-hidden="true" />{ui.candleDown ?? "Down: close below open"}</div>}
      {data.error && <div className="cw-error">{data.error}</div>}
      {controls.length > 0 && (
        <div className="chart-ctl">
          {controls.map((c) => {
            if (c.kind === "slider") return (
              <label key={c.name} className="cc cc-slider"><span className="cc-label">{c.label ?? c.name}</span>
                <input type="range" min={c.min} max={c.max} step={c.step ?? 1} value={vals[c.name] as number} onChange={(e) => set(c.name, +e.currentTarget.value)} />
                <output className="cc-val">{fmtNum(vals[c.name])}</output></label>
            );
            if (c.kind === "select") return (
              <label key={c.name} className="cc"><span className="cc-label">{c.label ?? c.name}</span>
                <select value={String(vals[c.name])} onChange={(e) => set(c.name, c.options!.find((o) => String(o) === e.currentTarget.value)!)}>{c.options!.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select></label>
            );
            if (c.kind === "toggle") return <label key={c.name} className="cc cc-toggle"><input type="checkbox" checked={!!vals[c.name]} onChange={(e) => set(c.name, e.currentTarget.checked)} /><span className="cc-label">{c.label ?? c.name}</span></label>;
            return <button key={c.name} type="button" className="btn btn-s" onClick={() => setVals((s) => ({ ...s, ...(c.set as any) }))}>{c.label ?? c.name}</button>;
          })}
          {controls.some((c) => c.kind !== "button") && <button type="button" className="btn btn-s btn-quiet" onClick={() => setVals(start)}>{ui.reset}</button>}
        </div>
      )}
      <details className="chart-table"><summary>{ui.table}</summary>
        <div className="table-wrap">
          {meta.candle ? (
            <table><thead><tr><th>{(spec.x?.label) ?? ui.candlePeriod ?? "period"}</th>{["open", "high", "low", "close"].map((w) => <th key={w}>{ui.candleWords?.[w] ?? w}</th>)}{data.series.filter((s) => s.kind === "line").map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
              <tbody>{data.x.map((x, j) => { const c = data.series.find((s) => s.kind !== "line")?.data[j]; return <tr key={j}><th>{String(x)}</th>{[0, 1, 2, 3].map((i) => <td key={i}>{c ? fmtNum(c[i]) : ""}</td>)}{data.series.filter((s) => s.kind === "line").map((s) => <td key={s.name}>{fmtNum(s.data[j])}</td>)}</tr>; })}</tbody></table>
          ) : meta.points ? (
            <table><thead><tr><th>series</th><th>{(spec.x?.label) ?? "x"}</th><th>{spec.y?.label ?? "y"}</th>{spec.kind === "bubble" && <th>size</th>}</tr></thead>
              <tbody>{data.series.flatMap((s) => s.data.map((p: any, j: number) => <tr key={s.name + j}><th>{s.name}</th><td>{fmtNum(p.x)}</td><td>{fmtNum(p.y)}</td>{spec.kind === "bubble" && <td>{fmtNum(p.r)}</td>}</tr>))}</tbody></table>
          ) : (
            <table><thead><tr><th>{(spec.xLabel ?? spec.x?.label) ?? ""}</th>{data.series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
              <tbody>{data.x.map((x, j) => <tr key={j}><th>{String(x)}</th>{data.series.map((s) => <td key={s.name}>{Array.isArray(s.data[j]) ? `${fmtNum(s.data[j][0])}–${fmtNum(s.data[j][1])}` : fmtNum(s.data[j])}</td>)}</tr>)}</tbody></table>
          )}
        </div>
      </details>
    </div>
  );
}
