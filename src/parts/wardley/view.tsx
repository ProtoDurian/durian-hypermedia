// The wardley part's view (format version 11): our own SVG, placed by the pure layout (the word placer), so the box is
// the same before and after the script runs. A step builds the map up; `evolve` under a step moves the component along
// its dashed arrow; `highlight` rings one. A phone lays the map out at the width it has (300 px at least; narrower, it scrolls in its own box). Static draws one
// step whole.
import React, { useId, useMemo } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import { Lines, Stepper, cx, newAt, shownAt, stepKeys, useSteps } from "../kit/view";
import type { PartViewProps } from "../types";
import { STAGES, type Evolve, type WardleySpec } from "./part";
import { WM, layoutWardley } from "./layout";

// a layout made while drawing pays from a budget of its own (made per spec): the page's budget was charged when the
// page was parsed, and a render (every step click) must never spend it
const scratch = () => new Budget(partLimitsOf(), null, null, "the wardley part");

export default function WardleyView({ data: spec, ui, static: stp, stage }: PartViewProps<WardleySpec>) {
  const id = useId().replace(/:/g, "");
  // the width inside the box (the card's 1 px border and the box's 8 px side padding, each side): a phone lays the map out at that width (MUST 5, rc.3 review)
  const room = stage.width > 0 ? Math.floor(stage.width) - 18 : WM.w, lw = Math.min(WM.w, room);
  const L = useMemo(() => layoutWardley(spec, scratch(), lw), [spec, lw]), n = spec.steps.length, titles = spec.steps.map((s) => s.title);
  const st = useSteps(n, stp, titles), i = st.i, { h, r, t, b } = WM, w = L.w, l = L.l;
  const by = useMemo(() => new Map(spec.comps.map((c, k) => [c.id, k])), [spec]);
  const evolvesOf = useMemo(() => { const m = new Map<string, Evolve[]>(); for (const e of spec.evolves) { const o = m.get(e.id); if (o) o.push(e); else m.set(e.id, [e]); } return m; }, [spec]);
  // where each component is at this step: moved along its evolve arrow when the step has come
  const at = (k: number) => {
    const c = spec.comps[k], ev = evolvesOf.get(c.id)?.find((e) => shownAt(e.step, i, n));
    return ev ? { x: L.px(ev.to), y: L.py(c.v), moved: true, ev } : { x: L.px(c.e), y: L.py(c.v), moved: false, ev: null as Evolve | null };
  };
  const lit = new Set(spec.highlights.filter((q) => n < 2 || q.step === i).map((q) => q.id));
  const stageW = (w - l - r) / 4;
  return (
    <div className="dh-dg dh-wardley" data-dh-static={st.sx.on || undefined} tabIndex={n > 1 ? 0 : undefined} onKeyDown={stepKeys(st, n)}>
      <div className="dh-box" data-dh-slot="box">
        <div className="dh-inner" style={{ minWidth: `${L.minW}px`, maxWidth: `${w * 1.5}px` }}>
          <svg className="dh-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={spec.title || "Wardley map"} style={{ aspectRatio: `${w} / ${h}` }}>
            <defs><marker id={`${id}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" className="wm-evolve-head" /></marker></defs>
            {STAGES.map((s, k) => (
              <g key={s} data-dh-slot="stage">
                <rect x={l + k * stageW} y={t} width={stageW} height={h - t - b} className={cx("wm-band", k % 2 === 1 && "is-alt")} />
                <text x={l + k * stageW + stageW / 2} y={h - b + 18} textAnchor="middle" className="wm-axis">{s}</text>
              </g>
            ))}
            <g data-dh-slot="axis"><line x1={l} y1={h - b} x2={w - r} y2={h - b} className="wm-axis-line" /><line x1={l} y1={t} x2={l} y2={h - b} className="wm-axis-line" />
              <text x={l + (w - l - r) / 2} y={h - 6} textAnchor="middle" className="wm-axis">evolution →</text>
              <text transform={`translate(14 ${t + (h - t - b) / 2}) rotate(-90)`} textAnchor="middle" className="wm-axis">visible ↑</text></g>
            {spec.groups.map((g) => {
              if (!shownAt(g.step, i, n)) return null;
              const pts = g.ids.map((q) => by.get(q)).filter((q): q is number => q !== undefined).map(at); if (!pts.length) return null;
              const x1 = Math.min(...pts.map((q) => q.x)) - 22, x2 = Math.max(...pts.map((q) => q.x)) + 22, y1 = Math.min(...pts.map((q) => q.y)) - 22, y2 = Math.max(...pts.map((q) => q.y)) + 22;
              return <g key={g.id} className="wm-group"><rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={14} /><text x={x1 + 8} y={y1 + 14} className="wm-group-label">{g.label}</text></g>;
            })}
            {spec.needs.map((nd, k) => {
              const a = by.get(nd.a), q = by.get(nd.b); if (a === undefined || q === undefined || !shownAt(nd.step, i, n)) return null;
              if (!shownAt(spec.comps[a].step, i, n) || !shownAt(spec.comps[q].step, i, n)) return null;
              const pa = at(a), pb = at(q);
              return <line key={k} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} data-dh-slot="need" className={cx("wm-need", newAt(nd.step, i, n) && "is-new")} />;
            })}
            {spec.pipelines.map((p) => { const k = by.get(p.id); if (k === undefined || !shownAt(p.step, i, n)) return null; const y = L.py(spec.comps[k].v); return <rect key={p.id} data-dh-slot="pipeline" x={L.px(p.from)} y={y - 7} width={L.px(p.to) - L.px(p.from)} height={14} rx={7} className="wm-pipeline" />; })}
            {spec.inertia.map((q) => { const k = by.get(q.id); if (k === undefined || !shownAt(q.step, i, n)) return null; const p = at(k); return <line key={q.id} data-dh-slot="inertia" x1={p.x + 14} y1={p.y - 10} x2={p.x + 14} y2={p.y + 10} className="wm-inertia" />; })}
            {spec.comps.map((c, k) => {
              if (!shownAt(c.step, i, n)) return null;
              const p = at(k), lab = L.labels[k];
              return (
                <g key={c.id} data-dh-slot={c.anchor ? "anchor" : "component"} className={cx("wm-comp", c.anchor && "is-anchor", lit.has(c.id) && "is-lit", newAt(c.step, i, n) && "is-new")}>
                  {p.moved && <>
                    <circle cx={L.px(c.e)} cy={L.py(c.v)} r={5} className="wm-ghost" />
                    <line x1={L.px(c.e) + 6} y1={L.py(c.v)} x2={p.x - 8} y2={p.y} className="wm-evolve" data-dh-slot="evolve" markerEnd={`url(#${id}-a)`} />
                  </>}
                  {lit.has(c.id) && <circle cx={p.x} cy={p.y} r={12} className="wm-ring" />}
                  {c.anchor ? <rect x={p.x - 5} y={p.y - 5} width={10} height={10} rx={2} className="wm-dot" /> : <circle cx={p.x} cy={p.y} r={6} className="wm-dot" />}
                  {p.moved && lab.evBox
                    ? <text x={lab.evTx} y={lab.evBox.b - 4} textAnchor={lab.evAnchor} className="wm-label">{lab.evText}</text>
                    : <text x={lab.tx} y={lab.ty} textAnchor={lab.anchorEnd} className="wm-label">{lab.text}</text>}
                </g>
              );
            })}
            {spec.notes.map((nt, k) => shownAt(nt.step, i, n) && (
              <g key={k} data-dh-slot="note" className="wm-note"><rect x={L.notes[k].x} y={L.notes[k].y - 14} width={L.notes[k].w} height={L.notes[k].lines.length * 15 + 8} rx={5} /><Lines lines={L.notes[k].lines} x={L.notes[k].x + 6} y={L.notes[k].y} lh={15} anchor="start" /></g>
            ))}
          </svg>
        </div>
      </div>
      {(stage.width <= 0 || L.minW > room) && <p className="wardley-hint">{ui.hintDiagram ?? "↔ Swipe to see the whole drawing"}</p>}
      <Stepper n={n} titles={titles} st={st} ui={ui} />
    </div>
  );
}
