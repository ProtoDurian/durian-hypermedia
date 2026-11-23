// The chart part: Chart.js, with the reader's controls feeding the chart's declared functions (core/chart.ts, core/expr.ts).
// Format version 11 adds: steps (one control row, a caption), a time axis (our own date adapter), annotations (our own plugin,
// a real button over each, one shared popover), value formats, heatmaps (chartjs-chart-matrix), line styles and markers with
// their own key, a log and linear switch and the calculator layout. core/chart11.ts and core/pagecharts.ts hold the rules.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { chartMeta, type ChartControl } from "../core/chart";
import { evalChart11, fmtValue, EMPTY_EXT, type Eval11 } from "../core/chart11";
import { plotHeight, fmtChartNum } from "./chart-config";
import { chartConfig11, heatKey, toneColour } from "./chart-config11";
import { ANN_OPTS, type AnnRect } from "./chart-ann";
import { usePopover } from "../parts/kit/popover";
import { Controls } from "./parts";
import { useBreakout } from "./pagecharts";
import type { Val } from "../core/expr";
import type { Ui } from "./ui";
import { useStatic, StaticSteps, type StaticProp } from "../parts/kit/static";
import { toggleOf, applyScale, placeLabels } from "../core/pagecharts";
import { Calculator, ScaleToggle, KeyList, PW } from "./pagecharts";
import type { KeyItem } from "./pagecharts-config";

type Spec = any;
const css = (el: Element, v: string) => getComputedStyle(el).getPropertyValue(v).trim();
const fmtNum = fmtChartNum;
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };

/** the chart's own words (English for every language for now; the renderer's shared words come from `ui`) */
const WORDS = { annList: "Show the annotations as a list" };
export function Chart({ spec: specIn, controls, initial, ui, static: stp }: { spec: Spec; controls: ChartControl[]; initial: Omit<Eval11, "ext"> & { ext?: Eval11["ext"] }; ui: Ui; static?: StaticProp }) {
  const w = WORDS, pw = PW(ui);
  const tg = useMemo(() => toggleOf(specIn), [specIn]); // p11 pagecharts: the log and linear switch
  const [logOn, setLogOn] = useState(tg?.start === "log");
  const [hidden, setHidden] = useState<number[]>([]);
  const hiddenRef = useRef<number[]>([]);
  const [keyItems, setKeyItems] = useState<KeyItem[]>([]);
  const start = useMemo(() => Object.fromEntries(controls.filter((c) => c.kind !== "button").map((c) => [c.name, c.value as Val])), []);
  const [vals, setVals] = useState<Record<string, Val>>(start);
  const nSteps = Array.isArray(specIn.steps) ? specIn.steps.length : 0;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  // static (SPEC 4.1): the chosen step (the last by default) with the controls at their first values, no motion, no controls
  const titles = Array.isArray(specIn.steps) ? specIn.steps.map((x: any) => String(x?.title ?? "")) : [];
  const sx = useStatic(stp, nSteps, titles), shown = sx.on ? sx.i : step, used = sx.on ? start : vals;
  // the reader's scale choice; static shows the author's (SPEC 4.1)
  const logNow = tg ? (sx.on ? tg.start === "log" : logOn) : false;
  const spec = useMemo(() => (tg ? applyScale(specIn, tg, logNow ? "log" : "linear") : specIn), [specIn, logNow]);
  const calc = useMemo(() => (spec.layout === "calculator" ? (evalChart11(spec, start, 0).ext.pc?.calc ?? null) : null), [spec]);
  useEffect(() => { if (sx.on) setPlaying(false); }, [sx.on]);
  // the page's own first evaluation is reused until the reader moves something (a step, a control, the scale switch)
  const data = useMemo(() => (shown === 0 && used === start && spec === specIn && initial && !initial.error ? { ...initial, ext: initial.ext ?? EMPTY_EXT } as Eval11 : evalChart11(spec, used, shown)), [used, shown, spec]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<any>(null);
  const [theme, setTheme] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  useBreakout(host, !!calc);
  const [narrow, setNarrow] = useState(false); // under 480 px: shorter labels, tighter legend
  const [rects, setRects] = useState<AnnRect[]>([]);
  const pop = usePopover(host, ui.close);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => setNarrow((box.current?.clientWidth ?? 999) < 480));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const meta = chartMeta(spec.kind === "heatmap" ? { ...spec, kind: "bar" } : spec);
  const heat = spec.kind === "heatmap";
  const height = heat ? Math.max(narrow ? 200 : 220, 70 + data.series.length * (narrow ? 34 : 40)) : plotHeight(spec, data, narrow);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)"); const on = () => setTheme((t) => t + 1); mq.addEventListener("change", on);
    return () => { mo.disconnect(); mq.removeEventListener("change", on); };
  }, []);
  // Play: one step at a time, then stop at the last
  useEffect(() => {
    if (!playing) return;
    if (step >= nSteps - 1) { setPlaying(false); return; }
    const t = window.setTimeout(() => setStep((s) => s + 1), 1800);
    return () => clearTimeout(t);
  }, [playing, step, nSteps]);
  useEffect(() => {
    let dead = false;
    (async () => {
      const mod = await import("chart.js");
      const { Chart: C, registerables } = mod;
      C.register(...registerables);
      if (data.ext.time) (await import("./chart-time-adapter")).installTimeAdapter(mod._adapters as any);
      if (heat) { const mx = await import("chartjs-chart-matrix"); C.register(mx.MatrixController, mx.MatrixElement); }
      if (dead || !canvas.current || data.error) return;
      const el = canvas.current;
      const reduce = sx.on || matchMedia("(prefers-reduced-motion: reduce)").matches || !!document.querySelector('[data-dh-motion="off"]');
      const tol = data.ext.time ? (data.ext.timesMs.length > 1 ? (data.ext.timesMs[data.ext.timesMs.length - 1] - data.ext.timesMs[0]) / (data.ext.timesMs.length - 1) / 2 : 0) : 0.5;
      const dark = isDark();
      ANN_OPTS.set(el, { anns: data.ext.anns, time: data.ext.time, dark, tol, colour: (tone, kind) => toneColour((n) => css(el, n), tone, kind), onLayout: (r) => setRects((old) => (JSON.stringify(old) === JSON.stringify(r) ? old : r)) });
      const cfg = chartConfig11(spec, data, { tok: (n) => css(el, n), narrow, reduce, words: ui.candleWords }, tol);
      if (!data.ext.anns.length) setRects((r) => (r.length ? [] : r));
      const items: KeyItem[] = cfg.dhKey ?? [];
      setKeyItems((old) => (JSON.stringify(old) === JSON.stringify(items) ? old : items));
      if (chart.current && chart.current.config.type === cfg.type) { chart.current.data = cfg.data; chart.current.options = cfg.options; chart.current.update(); }
      else { chart.current?.destroy(); chart.current = new C(el, cfg); }
      if (hiddenRef.current.length) { for (const i of hiddenRef.current) chart.current.setDatasetVisibility(i, false); chart.current.update("none"); }
    })();
    return () => { dead = true; };
  }, [data, theme, narrow, sx.on]);
  useEffect(() => () => chart.current?.destroy(), []);
  const boxW = box.current?.clientWidth ?? 640;
  const labelAt = useMemo(() => new Map(placeLabels(rects.filter((r) => r.kind === "threshold" && data.ext.anns[r.i]).map((r) => ({ i: r.i, text: data.ext.anns[r.i].label, x: r.x, x2: r.x2, y: r.y, y2: r.y2 })), boxW, rects.find((r) => r.pts)?.pts).map((p) => [p.i, p])), [rects, data, boxW]);
  const set = (k: string, v: Val) => setVals((s) => ({ ...s, [k]: v }));
  const toggleKey = (i: number) => { // p11 pagecharts: the key's buttons show and hide a series
    const next = hiddenRef.current.includes(i) ? hiddenRef.current.filter((x) => x !== i) : [...hiddenRef.current, i];
    hiddenRef.current = next; setHidden(next);
    if (chart.current) { chart.current.setDatasetVisibility(i, !next.includes(i)); chart.current.update(); }
  };
  const f = (v: any, axis: "x" | "y" | "y2" = "y") => { const o = data.ext.formats[axis]; return o ? fmtValue(v, o.format, o.currency) : fmtNum(v); };
  const key = heat ? heatKey((n) => (canvas.current ? css(canvas.current, n) : ""), data) : null;
  return (
    <div className="chart" ref={host} data-dh-part="chart" data-dh-layout={calc ? "calculator" : undefined} data-dh-static={sx.on || undefined}>
      {spec.title && <div className="chart-title">{spec.title}</div>}
      {calc && <Calculator calc={calc} controls={controls} vals={used} set={set} reset={() => setVals(start)} vars={data.vars} isStatic={sx.on} w={pw} error={data.error} />}
      {(!calc || calc.hasChart) && <div className="chart-canvas" ref={box} data-dh-scale={tg ? (logNow ? "log" : "linear") : undefined} style={height ? { height } : undefined}>
        <canvas ref={canvas} role="img" aria-label={spec.title ?? ui.chart} />
        {rects.map((r) => {
          const n = data.ext.anns[r.i]; if (!n) return null;
          const id = `ann-${r.i}`;
          const zone = data.ext.time ? ` (${data.ext.tz})` : "";
          const d = { title: n.label, meta: `${n.when}${zone}`, text: n.text };
          if (n.kind === "threshold") {
            return <button key={id} type="button" className={`ann ann-threshold tone-${n.tone}`} data-dh-slot="ann-threshold" style={(() => { const p = labelAt.get(r.i); return p?.side === "left" ? { left: r.x + 4, top: p.top } : p?.side === "mid" ? { left: Math.max(0, (r.x + r.x2) / 2), transform: "translateX(-50%)", top: p.top } : { right: Math.max(4, boxW - r.x2 + 4), top: p?.top ?? Math.max(0, r.y2 - 26) }; })()} {...pop.bind(id, d)}><span>{n.label}</span></button>;
          }
          const left = n.kind === "range" ? r.x : r.x - 12, width = n.kind === "range" ? Math.max(24, r.x2 - r.x) : 24;
          return <button key={id} type="button" className={`ann ann-${n.kind} tone-${n.tone}`} data-dh-slot="ann-marker" aria-label={`${n.label}, ${n.when}`} style={{ left, width, top: r.plot.bottom - 24 }} {...pop.bind(id, d)}><i aria-hidden="true" /></button>;
        })}
      </div>}
      {keyItems.length > 0 && <KeyList items={keyItems} hidden={hidden} onToggle={toggleKey} live={!sx.on} w={pw} />}
      {tg && !sx.on && !data.error && <ScaleToggle log={logNow} onChange={setLogOn} w={pw} />}
      {heat && key && <div className="heat-key" data-dh-slot="heat-key" aria-hidden="true"><span>{fmtNum(key.lo)}</span><span className={`heat-bar${key.diverge !== undefined ? " is-diverge" : ""}${key.tone ? ` tone-${key.tone}` : ""}`} /><span>{fmtNum(key.hi)}</span></div>}
      {meta.candle && !data.error && <div className="candle-key"><span className="ck-item"><span className="ck ck-up" aria-hidden="true" /><span>{ui.candleUp ?? "Up: close at or above open"}</span></span><span className="ck-item"><span className="ck ck-down" aria-hidden="true" /><span>{ui.candleDown ?? "Down: close below open"}</span></span></div>}
      {data.error && !calc && <div className="cw-error">{data.error}</div>}
      {nSteps > 1 && sx.on && <StaticSteps titles={titles} i={sx.i} print={sx.print} />}
      {nSteps > 1 && !sx.on && (
        <div className="chart-steps">
          <Controls ui={ui} i={step} n={nSteps} onGo={(k) => { setPlaying(false); setStep(Math.max(0, Math.min(nSteps - 1, k))); }} playing={playing} onPlay={() => { if (playing) setPlaying(false); else { if (step >= nSteps - 1) setStep(0); setPlaying(true); } }} />
          <p className="step-cap" aria-live="polite">{spec.steps[step]?.title}</p>
        </div>
      )}
      {controls.length > 0 && !sx.on && !calc && (
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
      {(!calc || calc.hasChart) && <details className="chart-table"><summary>{ui.table}</summary>
        <div className="table-wrap">
          {heat ? (
            <table><thead><tr><th>{`${spec.y?.label ?? ""}${spec.y?.label && spec.x?.label ? " \\ " : ""}${spec.x?.label ?? ""}`}</th>{data.x.map((x) => <th key={String(x)}>{String(x)}</th>)}</tr></thead>
              <tbody>{data.series.map((s) => <tr key={s.name}><th>{s.name}</th>{s.data.map((v: any, j: number) => <td key={j}>{v === null ? "" : fmtNum(v)}</td>)}</tr>)}</tbody></table>
          ) : meta.candle ? (
            <table><thead><tr><th>{(spec.x?.label) ?? ui.candlePeriod ?? "period"}</th>{["open", "high", "low", "close"].map((w) => <th key={w}>{ui.candleWords?.[w] ?? w}</th>)}{data.series.filter((s) => s.kind === "line").map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
              <tbody>{data.x.map((x, j) => { const c = data.series.find((s) => s.kind !== "line")?.data[j]; return <tr key={j}><th>{String(x)}</th>{[0, 1, 2, 3].map((i) => <td key={i}>{c ? f(c[i]) : ""}</td>)}{data.series.filter((s) => s.kind === "line").map((s) => <td key={s.name}>{f(s.data[j], s.axis === "y2" ? "y2" : "y")}</td>)}</tr>; })}</tbody></table>
          ) : meta.points ? (
            <table><thead><tr><th>series</th><th>{(spec.x?.label) ?? "x"}</th><th>{spec.y?.label ?? "y"}</th>{spec.kind === "bubble" && <th>size</th>}</tr></thead>
              <tbody>{data.series.flatMap((s) => s.data.map((p: any, j: number) => <tr key={s.name + j}><th>{s.name}</th><td>{f(p.x, "x")}</td><td>{f(p.y)}</td>{spec.kind === "bubble" && <td>{fmtNum(p.r)}</td>}</tr>))}</tbody></table>
          ) : (
            <table><thead><tr><th>{(spec.xLabel ?? spec.x?.label) ?? ""}</th>{data.series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
              <tbody>{data.x.map((x, j) => <tr key={j}><th>{String(x)}</th>{data.series.map((s) => { const ax = s.axis === "y2" ? "y2" : "y"; return <td key={s.name}>{Array.isArray(s.data[j]) ? `${f(s.data[j][0], ax)}–${f(s.data[j][1], ax)}` : f(s.data[j], ax)}</td>; })}</tr>)}</tbody></table>
          )}
        </div>
      </details>}
      {data.ext.anns.length > 0 && <details className="chart-table chart-anns"><summary>{w.annList}</summary><ul>{data.ext.anns.map((n, i) => <li key={i}><strong>{n.label}</strong> · {n.when}{n.text ? ` · ${n.text}` : ""}</li>)}</ul></details>}
      {pop.node}
    </div>
  );
}
