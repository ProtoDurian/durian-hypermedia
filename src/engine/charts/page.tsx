// The chart part (```chart) on our renderer: the chart is primitives (src/engine/charts/*) painted as SVG with the page's tokens,
// the reader's controls (slider, dropdown, step, toggle) set new numbers and the primitives glide to them by key (every kind:
// bars, lines, slices, radar corners), one popover per mark (a bar's category, a point, a slice, an annotation), the key's
// buttons show and hide a series, static and print draw one step whole with no motion and no popovers, reduced motion draws
// the end state. The numbers still come from the old evaluator (core/chart11.ts) through ./legacy.ts, so formulas, steps,
// formats and the calculator layout mean what they meant. `ChartCanvas` is the drawing alone; the chart-kinds part uses it too.
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec, Rect } from "../types";
import { chartMeta, type ChartControl } from "../../core/chart";
import { fmtValue, EMPTY_EXT } from "../../core/chart11";
import { usePopover } from "../../parts/kit/popover";
import { Controls } from "../../ui/parts";
import { useBreakout, Calculator, ScaleToggle, PW } from "../../ui/pagecharts";
import type { Val } from "../../core/expr";
import type { Ui } from "../../ui/ui";
import { useStatic, StaticSteps, type StaticProp } from "../../parts/kit/static";
import { toggleOf, applyScale, caseValues } from "../../core/pagecharts";
import { measure, FONT, type Font } from "../../core/stage-core";
import { atSizes } from "../render/font";
import { evalChart11 } from "../../core/chart11";
import { chartFrom, type Legacy } from "./legacy";
import { buildChart, kindHeight, kindWidth, isKindsChart, type PMark } from "./build";
import { Prims, useGlide, fontPx } from "./paint";

type Pop = ReturnType<typeof usePopover>;
/** the width a chart is drawn at before the first measure (the server's HTML) */
export const FIRST_WIDTH = 640;
const PHONE_W = 480;
/** the page draws the kinds' words in its own face, a little wider than the stage measure: they plan for it, so no tick is cut at an edge and no two values touch */
const wider: typeof measure = (s, f) => measure(s, f) * 1.12;
/** the width of a word as the browser draws it in the page's own face (a canvas measure), once the page is up; the stage measure before that */
function domMeasure(el: Element | null, phone: boolean): typeof measure | null {
  try {
    const c = document.createElement("canvas").getContext("2d");
    if (!c || !el) return null;
    const fam = getComputedStyle(el).fontFamily || "sans-serif", seen = new Map<string, number>();
    return (s: string, f: Font) => {
      const k = f + "|" + s, hit = seen.get(k);
      if (hit !== undefined) return hit;
      c.font = `${FONT[f].weight} ${fontPx(f, phone)}px ${fam}`;
      const w = c.measureText(s).width;
      seen.set(k, w);
      return w;
    };
  } catch { return null; }
}
const reduced = (): boolean => typeof matchMedia === "function" && (matchMedia("(prefers-reduced-motion: reduce)").matches || !!document.querySelector('[data-dh-motion="off"]'));

/** the height of a chart that is not one of the eight kinds (it never depends on the width inside a phone or desktop class) */
export function heightOf(spec: ChartSpec, d: any, narrow: boolean): number {
  const n = spec.x.length, ns = spec.series.length;
  if (spec.kind === "heatmap") return Math.max(narrow ? 200 : 220, 70 + ns * (narrow ? 34 : 40)) + 60;
  if (d?.horizontal) return Math.max(narrow ? 240 : 260, 64 + n * (d.stacked ? 34 : 18 + 20 * Math.max(1, ns))) + 40;
  return narrow ? 300 : 340;
}

// ------------------------------------------------------------------ the drawing: primitives, glide, marks
export interface CanvasProps {
  spec: ChartSpec; values: number[][];
  /** the largest numbers over every state the reader can reach (scales stay still); absent when nothing moves (charts2: a drawing then
   *  knows the chart is still, so a lines-only axis fits its numbers; it was the current numbers, which read as "moves") */
  max?: number[][]; lit?: string[]; step?: number;
  /** the px height; absent: the kind's own */
  height?: number;
  animate: boolean; interactive: boolean;
  label: string; pop: Pop;
  /** a click or Enter on a mark: return true when it is handled (a key toggles a series, a tree opens a node) and no card opens */
  onMark?: (m: PMark) => boolean | void;
  /** set on a series' key buttons: which series are hidden (for aria-pressed) */
  hidden?: number[];
  /** the data's own height rule for charts that are not the eight kinds */
  legacy?: any;
  /** a day or node to keep in view (calendar) */
  at?: number;
  /** the part's own node: marks sit inside it (the popover's host) */
}
export function ChartCanvas(p: CanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(FIRST_WIDTH);
  useEffect(() => {
    if (!box.current) return;
    const set = () => setW(Math.max(120, Math.floor(box.current?.clientWidth || FIRST_WIDTH)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const phone = w < PHONE_W, kinds = isKindsChart(p.spec.kind);
  const [faces, setFaces] = useState(0); // 0: the server's words, 1: measured in the browser, 2: measured again when the fonts are in
  useEffect(() => { let dead = false; setFaces(1); (document.fonts?.ready ?? Promise.resolve()).then(() => { if (!dead) setFaces(2); }); return () => { dead = true; }; }, []);
  const meas = useMemo(() => (faces ? domMeasure(box.current, phone) : null) ?? (kinds ? wider : measure), [faces, phone, kinds]);
  const h = p.height ?? (kinds ? kindHeight(p.spec, w) : heightOf(p.spec, p.legacy, phone));
  const need = kinds ? kindWidth(p.spec) : null, W = Math.max(w, need ?? 0);
  const prev = useRef<number[][] | null>(null);
  const built = useMemo(() => {
    try { return atSizes(phone, () => ({ ...buildChart(p.spec, p.values, { x: 0, y: 0, w: W, h }, { phone, look: "stage", measure: meas, step: p.step ?? 0, prev: prev.current, max: p.max ?? [], lit: p.lit ?? [], at: p.at } as any), error: "" })); } // phone sizes scoped (review 2)
    catch (e) { return { prims: [], marks: [] as PMark[], error: e instanceof Error ? e.message : String(e) }; }
  }, [p.spec, p.values, p.max, p.lit, p.step, W, h, phone, p.at, meas]);
  useEffect(() => { prev.current = p.values; }, [p.values]);
  // a calendar wider than its room starts at its newest week
  useEffect(() => { const el = box.current; if (el && need && need > w) el.scrollLeft = el.scrollWidth; }, [p.spec.kind, need, w]);
  const drawn = useGlide(built.prims, p.animate);
  const marks = built.marks.filter((m) => !m.skip && m.rect.w > 0 && m.rect.h > 0);
  const lit = useMemo(() => new Set((p.lit ?? []).map((c) => c)), [p.lit]);
  return (
    <div className={`chart-canvas${need && need > w ? " chart-scroll" : ""}`} ref={box} style={{ height: h + (need && need > w ? 14 : 0) }}>
      <div className="chart-frame" style={{ width: W, height: h }}>
        <svg className="chart-svg" width={W} height={h} viewBox={`0 0 ${W} ${h}`} role="img" aria-label={p.label} data-dh-slot="chart-svg" xmlns="http://www.w3.org/2000/svg">
          <Prims drawn={drawn} phone={phone} lit={lit} />
        </svg>
        {built.error && <div className="cw-error" role="alert">{built.error}</div>}
        {p.interactive && <Marks marks={marks} pop={p.pop} onMark={p.onMark} hidden={p.hidden} />}
      </div>
    </div>
  );
}

/** one real button over each mark: focus or hover opens its card, the arrow keys walk them (one tab stop), Esc closes (popover) */
function Marks({ marks, pop, onMark, hidden }: { marks: PMark[]; pop: Pop; onMark?: (m: PMark) => boolean | void; hidden?: number[] }) {
  const [cur, setCur] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!marks.length) return null;
  const go = (i: number) => { const j = Math.max(0, Math.min(marks.length - 1, i)); setCur(j); refs.current[j]?.focus(); };
  return (
    <div className="chart-marks" role="group" aria-label="Chart" data-dh-slot="chart-marks">
      {marks.map((m, i) => {
        const key = m.kind === "key", data = { title: m.title, meta: m.meta, text: m.text };
        const bound = key ? {} : pop.bind(m.key, data);
        return (
          <button key={m.key} type="button" ref={(el) => { refs.current[i] = el; }} className={`chart-mark chart-mark-${m.kind}`} data-hit={m.key}
            style={{ left: m.rect.x, top: m.rect.y, width: m.rect.w, height: m.rect.h }} tabIndex={i === cur ? 0 : -1}
            aria-label={key ? m.title : [m.title, m.meta, m.text].filter(Boolean).join(". ")} aria-pressed={key ? !hidden?.includes(m.series ?? -1) : undefined}
            {...(bound as object)}
            onFocus={(e) => { setCur(i); (bound as any).onFocus?.(e); }}
            onClick={(e) => { if (onMark?.(m)) return; (bound as any).onClick?.(e); }}
            onKeyDown={(e) => {
              const k = e.key;
              if (k === "ArrowRight" || k === "ArrowDown") { e.preventDefault(); go(i + 1); }
              else if (k === "ArrowLeft" || k === "ArrowUp") { e.preventDefault(); go(i - 1); }
              else if (k === "Home") { e.preventDefault(); go(0); } else if (k === "End") { e.preventDefault(); go(marks.length - 1); }
            }} />
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ the numbers every state can reach
/** the largest number of every series and category over the controls' cases (or the chart's steps): a scale that stays still while a
 *  slider moves. charts2: only the sliders move (a dropdown, a toggle or a button picks another view, which gets its own scale: format/31
 *  "per call" drew its 0-6 bars on the 0-250 axis of "running total" at 20 questions), and only states with the same series and
 *  categories as now count (a slider that adds categories moves the frame anyway, so its far end must not flatten the bars) */
export function reach(spec: any, controls: ChartControl[], start: Record<string, Val>, nSteps: number, now: number[][]): number[][] {
  const out = now.map((r) => r.slice());
  const sameShape = (v: number[][]) => v.length === now.length && v.every((row, s) => row.length === now[s].length);
  const merge = (v: number[][]) => { if (nSteps <= 1 && !sameShape(v)) return; v.forEach((row, s) => { out[s] ??= []; row.forEach((x, j) => { if (Number.isFinite(x) && !(out[s][j] >= x)) out[s][j] = x; }); }); };
  const tries: [Record<string, Val>, number][] = [];
  if (nSteps > 1) for (let k = 0; k < nSteps; k++) tries.push([start, k]);
  else {
    controls = controls.filter((c) => c.kind === "slider");
    for (const c of caseValues(controls, 40)) tries.push([{ ...start, ...c }, 0]);
    // eng-stagebars: and every mix of the controls' extremes (a slider's ends with each option of a select ...), when there are few enough, so the
    // scale and the room for its words are the same in every state the reader can reach (format/31: a running total at 20 questions)
    const ext = controls.filter((c) => c.kind !== "button").map((c): [string, Val[]] => [c.name, c.kind === "slider" ? [c.min as number, c.max as number] : c.kind === "select" ? ((c.options ?? []) as Val[]) : [false, true]]);
    let mixes: Record<string, Val>[] = [{}];
    for (const [name, vs] of ext) { if (mixes.length * vs.length > 64) { mixes = []; break; } mixes = mixes.flatMap((m) => vs.map((v) => ({ ...m, [name]: v }))); }
    for (const m of mixes) tries.push([{ ...start, ...m }, 0]);
  }
  for (const [vals, k] of tries.slice(0, 110)) { try { const lg = chartFrom(spec, vals, k); if (lg && !lg.error) merge(lg.values); } catch { /* a state the evaluator refuses is not reachable */ } }
  return out;
}

const fmtChartNum = (v: any): string => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })) : String(v ?? ""));
const WORDS = { annList: "Show the annotations as a list" };
// ------------------------------------------------------------------ the chart part
export function ChartView({ spec: specIn, controls, initial, ui, static: stp }: { spec: any; controls: ChartControl[]; initial: any; ui: Ui; static?: StaticProp }) {
  const w = WORDS, pw = PW(ui);
  const tg = useMemo(() => toggleOf(specIn), [specIn]);
  const [logOn, setLogOn] = useState(tg?.start === "log");
  const [hidden, setHidden] = useState<number[]>([]);
  const start = useMemo(() => Object.fromEntries(controls.filter((c) => c.kind !== "button").map((c) => [c.name, c.value as Val])), []);
  const [vals, setVals] = useState<Record<string, Val>>(start);
  const nSteps = Array.isArray(specIn.steps) ? specIn.steps.length : 0;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const titles = Array.isArray(specIn.steps) ? specIn.steps.map((x: any) => String(x?.title ?? "")) : [];
  const sx = useStatic(stp, nSteps, titles), shown = sx.on ? sx.i : step, used = sx.on ? start : vals;
  const logNow = tg ? (sx.on ? tg.start === "log" : logOn) : false;
  const spec = useMemo(() => (tg ? applyScale(specIn, tg, logNow ? "log" : "linear") : specIn), [specIn, logNow]);
  const calc = useMemo(() => (spec.layout === "calculator" ? (evalChart11(spec, start, 0).ext.pc?.calc ?? null) : null), [spec]);
  useEffect(() => { if (sx.on) setPlaying(false); }, [sx.on]);
  const lg: Legacy | null = useMemo(() => { try { return chartFrom(spec, used, shown); } catch { return null; } }, [spec, used, shown]);
  // the page's own first evaluation carries the error text and the extras; ours is the same evaluator at the same values
  const data = lg?.data ?? (initial && !initial.error ? { ...initial, ext: initial.ext ?? EMPTY_EXT } : { x: [], series: [], vars: {}, error: initial?.error, ext: EMPTY_EXT });
  const cspec = useMemo<ChartSpec | null>(() => (lg ? (hidden.length ? { ...lg.spec, opts: { ...lg.spec.opts, hidden: hidden.join(",") } } : lg.spec) : null), [lg, hidden]);
  // charts2: the scale holds the current dropdown, toggle and button values (`used`) and the current shape: it changes when they do
  const held = JSON.stringify(controls.filter((c) => c.kind !== "slider").map((c) => used[c.name])), shapeNow = lg?.values.map((r) => r.length).join(",");
  const maxv = useMemo(() => (lg && (controls.length > 0 || nSteps > 1) && !sx.on ? reach(spec, controls, nSteps > 1 ? start : used, nSteps, lg.values) : lg?.values), [spec, controls, nSteps, sx.on, held, shapeNow]);
  const maxNow = useMemo(() => (maxv && lg ? maxv.map((r, s) => r.map((x, j) => (Number.isFinite(lg.values[s]?.[j]) ? Math.max(x, lg.values[s][j]) : x))) : undefined), [maxv, lg]);
  const host = useRef<HTMLDivElement>(null);
  useBreakout(host, !!calc);
  const pop = usePopover(host, ui.close);
  const [anim, setAnim] = useState(true);
  useEffect(() => { setAnim(!reduced()); }, []);
  useEffect(() => {
    if (!playing) return;
    if (step >= nSteps - 1) { setPlaying(false); return; }
    const t = window.setTimeout(() => setStep((s) => s + 1), 1800);
    return () => clearTimeout(t);
  }, [playing, step, nSteps]);
  const meta = chartMeta(spec.kind === "heatmap" ? { ...spec, kind: "bar" } : spec);
  const heat = spec.kind === "heatmap";
  const set = (k: string, v: Val) => setVals((s) => ({ ...s, [k]: v }));
  const toggleKey = (m: PMark) => { if (m.kind !== "key" || m.series === undefined || m.series >= 1000) return !!(m.kind === "key"); setHidden((h) => (h.includes(m.series!) ? h.filter((x) => x !== m.series) : [...h, m.series!])); return true; };
  const f = (v: any, axis: "x" | "y" | "y2" = "y") => { const o = data.ext.formats[axis]; return o ? fmtValue(v, o.format, o.currency) : fmtChartNum(v); };
  const fmtNum = fmtChartNum;
  const ok = !data.error && cspec && lg;
  return (
    <div className="chart" ref={host} data-dh-part="chart" data-dh-layout={calc ? "calculator" : undefined} data-dh-static={sx.on || undefined}>
      {spec.title && <div className="chart-title">{spec.title}</div>}
      {calc && <Calculator calc={calc} controls={controls} vals={used} set={set} reset={() => setVals(start)} vars={data.vars} isStatic={sx.on} w={pw} error={data.error} />}
      {ok && (!calc || calc.hasChart) && (
        <div data-dh-scale={tg ? (logNow ? "log" : "linear") : undefined}>
          <ChartCanvas spec={cspec!} values={lg!.values} max={controls.length > 0 || nSteps > 1 ? maxNow : undefined} step={shown} animate={anim && !sx.on} interactive={!sx.on} label={spec.title ?? ui.chart} pop={pop} onMark={toggleKey} hidden={hidden} legacy={spec} />
        </div>
      )}
      {tg && !sx.on && !data.error && <ScaleToggle log={logNow} onChange={setLogOn} w={pw} />}
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
            <table><thead><tr><th>{`${spec.y?.label ?? ""}${spec.y?.label && spec.x?.label ? " \\ " : ""}${spec.x?.label ?? ""}`}</th>{data.x.map((x: any) => <th key={String(x)}>{String(x)}</th>)}</tr></thead>
              <tbody>{data.series.map((s: any) => <tr key={s.name}><th>{s.name}</th>{s.data.map((v: any, j: number) => <td key={j}>{v === null ? "" : fmtNum(v)}</td>)}</tr>)}</tbody></table>
          ) : meta.candle ? (
            <table><thead><tr><th>{(spec.x?.label) ?? ui.candlePeriod ?? "period"}</th>{["open", "high", "low", "close"].map((x) => <th key={x}>{ui.candleWords?.[x] ?? x}</th>)}{data.series.filter((s: any) => s.kind === "line").map((s: any) => <th key={s.name}>{s.name}</th>)}</tr></thead>
              <tbody>{data.x.map((x: any, j: number) => { const c = data.series.find((s: any) => s.kind !== "line")?.data[j]; return <tr key={j}><th>{String(x)}</th>{[0, 1, 2, 3].map((i) => <td key={i}>{c ? f(c[i]) : ""}</td>)}{data.series.filter((s: any) => s.kind === "line").map((s: any) => <td key={s.name}>{f(s.data[j], s.axis === "y2" ? "y2" : "y")}</td>)}</tr>; })}</tbody></table>
          ) : meta.points ? (
            <table><thead><tr><th>series</th><th>{(spec.x?.label) ?? "x"}</th><th>{spec.y?.label ?? "y"}</th>{spec.kind === "bubble" && <th>size</th>}</tr></thead>
              <tbody>{data.series.flatMap((s: any) => s.data.map((q: any, j: number) => <tr key={s.name + j}><th>{s.name}</th><td>{f(q.x, "x")}</td><td>{f(q.y)}</td>{spec.kind === "bubble" && <td>{fmtNum(q.r)}</td>}</tr>))}</tbody></table>
          ) : (
            <table><thead><tr><th>{(spec.xLabel ?? spec.x?.label) ?? ""}</th>{data.series.map((s: any) => <th key={s.name}>{s.name}</th>)}</tr></thead>
              <tbody>{data.x.map((x: any, j: number) => <tr key={j}><th>{String(x)}</th>{data.series.map((s: any) => { const ax = s.axis === "y2" ? "y2" : "y"; return <td key={s.name}>{Array.isArray(s.data[j]) ? `${f(s.data[j][0], ax)}–${f(s.data[j][1], ax)}` : f(s.data[j], ax)}</td>; })}</tr>)}</tbody></table>
          )}
        </div>
      </details>}
      {data.ext.anns.length > 0 && <details className="chart-table chart-anns"><summary>{w.annList}</summary><ul>{data.ext.anns.map((n: any, i: number) => <li key={i}><strong>{n.label}</strong> · {n.when}{n.text ? ` · ${n.text}` : ""}</li>)}</ul></details>}
      {pop.node}
    </div>
  );
}
export type { Rect };
