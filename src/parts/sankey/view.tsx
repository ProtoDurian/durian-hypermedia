// The sankey part's view (format version 11): d3-sankey's layout, our own SVG, token colours, text in the DOM (real
// <text>), steps that build the bands up, the one popover on every flow and node (hover, tap, focus), and a narrow layout
// that runs top to bottom. Static draws one step whole.
// The drawing is as wide as the card holds (innerWidth), the end columns keep the room their labels need (found from where
// the columns really sit). Full labels wrap on backing plates, with their positions planned across every step.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stepper, colBase, stepKeys, useSteps, usePopover } from "../kit/view";
import type { PartViewProps } from "../types";
import { flowShare, nodeLabel, type SankeySpec } from "./part";
import { pathOf, LABEL_PX, innerWidth } from "./layout";
import { labelledLayout, type Measure } from "./labels";

const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
/** the part's own words (the renderer's shared words come from `ui`) */
const W = { hint: "Hover or tap a flow or a node.", cannot: "This sankey cannot be drawn:", inFlow: "In", outFlow: "Out", from: "From", to: "To", amount: "amount", share: "Share", of: "of" };
/** before the first measure (the server's HTML) the reader's width is not known: a wide drawing and a phone drawing are both made, and
 *  CSS shows the one that fits the card (container query, 600 px). A phone reader's first paint is then already the right shape. */
const FIRST_WIDTH = 760, PHONE_FIRST_WIDTH = 358;

export default function SankeyView({ data: spec, ui, static: stp, stage }: PartViewProps<SankeySpec>) {
  const host = useRef<HTMLDivElement>(null);
  const nSteps = spec.steps.length, st = useSteps(nSteps, stp, spec.steps), step = nSteps > 1 ? st.i : Infinity;
  const [hover, setHover] = useState<{ kind: "flow" | "node"; k: number } | null>(null);
  const pop = usePopover(host, ui.close);
  const [measure, setMeasure] = useState<Measure>(() => (text: string) => text.length * LABEL_PX);
  useEffect(() => {
    // one measure, made once the page's font is there (a measure with the stand-in font, then another with the real one, drew every label twice)
    let active = true;
    const update = () => {
      if (!active || !host.current) return;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = "500 12px " + getComputedStyle(host.current).getPropertyValue("--font-sans");
      setMeasure(() => (text: string) => ctx.measureText(text).width);
    };
    if (!document.fonts || document.fonts.status === "loaded") update();
    else void document.fonts.ready.then(update);
    return () => { active = false; };
  }, []);
  const pre = !stage.width;
  const plans = useMemo(() => {
    if (spec.errors.length || !spec.flows.length) return null;
    const widths = pre ? [innerWidth(FIRST_WIDTH), innerWidth(PHONE_FIRST_WIDTH)] : [innerWidth(stage.width)];
    return widths.map((w) => labelledLayout(spec, w, measure));
  }, [spec, pre, stage.width, measure]);
  const lay = plans?.[0].layout;
  if (!plans || !lay) return <div className="sankey"><div className="cw-error">{W.cannot} {spec.errors[0]?.msg ?? "it has no flows"}</div></div>;
  const shown = (appear: number) => appear <= step;
  const lit = hover ? (hover.kind === "flow" ? pathOf(spec, hover.k) : new Set(spec.flows.map((f, k) => (f.from === lay.nodes[hover.k].id || f.to === lay.nodes[hover.k].id ? k : -1)).filter((k) => k >= 0))) : null;
  const litNodes = lit ? new Set([...lit].flatMap((k) => [spec.flows[k].from, spec.flows[k].to])) : null;
  const nodeShown = (id: string) => spec.flows.some((f) => shown(f.appear) && (f.from === id || f.to === id));
  const unit = spec.unit ? ` ${spec.unit}` : "";
  return (
    <div className={`sankey dh-pop-host${lay.vertical ? " is-vertical" : ""}`} ref={host} data-dh-static={st.sx.on || undefined} tabIndex={nSteps > 1 ? 0 : undefined} onKeyDown={stepKeys(st, nSteps)}>
      {spec.title && <div className="sankey-title">{spec.title}</div>}
      {plans.map((planned, drawn) => {
      const lay = planned.layout;
      return (
      <div key={drawn} className={pre ? `sankey-box ${drawn ? "is-pre-phone" : "is-pre-wide"}` : "sankey-box"}>
        <svg width={lay.width} height={lay.height} viewBox={`0 0 ${lay.width} ${lay.height}`} role="group" aria-label={spec.title || "Sankey"}>
          <g className="sankey-links">
            {lay.links.map((l) => {
              const f = spec.flows[l.i];
              const on = shown(f.appear), dim = lit && !lit.has(l.i);
              const share = Math.round(flowShare(spec, f, step) * 100);
              const d = { title: `${nodeLabel(spec, f.from)} → ${nodeLabel(spec, f.to)}`, meta: `${num(f.amount)}${unit} · ${share}% ${W.of} ${nodeLabel(spec, f.from)}` };
              return (
                <g key={l.i} className={`sk-flow${on ? "" : " is-hidden"}${lit && lit.has(l.i) ? " is-lit" : ""}${dim ? " is-dim" : ""}`} data-dh-slot="band" role="button" tabIndex={on ? 0 : -1} aria-hidden={on ? undefined : true}
                  aria-label={`${d.title}: ${d.meta}`} {...pop.bind(`f${l.i}`, d)}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover({ kind: "flow", k: l.i }); }} onPointerLeave={() => setHover(null)} onFocus={(e) => { setHover({ kind: "flow", k: l.i }); pop.bind(`f${l.i}`, d).onFocus(e); }} onBlur={(e) => { setHover(null); pop.bind(`f${l.i}`, d).onBlur(e); }}>
                  <path d={l.d} fill="none" stroke={colBase(l.colour)} strokeWidth={l.width} pathLength={1} className="sk-band" />
                  <path d={l.d} fill="none" stroke="transparent" strokeWidth={Math.max(l.width, 24)} className="sk-hit" />
                </g>
              );
            })}
          </g>
          <g className="sankey-nodes">
            {lay.nodes.map((n, k) => {
              const on = nodeShown(n.id), dim = litNodes && !litNodes.has(n.id), a = planned.labels.get(n.id)!;
              const d = { title: n.label, meta: `${W.inFlow} ${num(n.inV)}${unit} · ${W.outFlow} ${num(n.outV)}${unit}` };
              return (
                <g key={n.id} className={`sk-node${on ? "" : " is-hidden"}${dim ? " is-dim" : ""}`} data-dh-slot="node" role="button" tabIndex={on ? 0 : -1} aria-hidden={on ? undefined : true} aria-label={`${d.title}: ${d.meta}`} {...pop.bind(`n${k}`, d)}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover({ kind: "node", k }); }} onPointerLeave={() => setHover(null)} onFocus={(e) => { setHover({ kind: "node", k }); pop.bind(`n${k}`, d).onFocus(e); }} onBlur={(e) => { setHover(null); pop.bind(`n${k}`, d).onBlur(e); }}>
                  <rect x={n.x} y={n.y} width={Math.max(n.w, 2)} height={Math.max(n.h, 2)} rx={3} fill={colBase(n.colour)} className="sk-rect" />
                  <rect x={n.x - 6} y={n.y - 4} width={Math.max(24, n.w + 12)} height={Math.max(24, n.h + 8)} fill="transparent" />
                  {a.lead && <line x1={a.lead.x} x2={a.lead.x} y1={a.lead.y0} y2={a.lead.y1} className="sk-lead" />}
                  <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={4} className="sk-plate" />
                  <text x={a.x + 4} y={a.y + 14} className="sk-label" data-dh-slot="node-label">{a.lines.map((line, i) => <tspan key={i} x={a.x + 4} dy={i ? 16 : 0}>{line}{i < a.lines.length - 1 ? " " : ""}</tspan>)}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      );
      })}
      <Stepper n={nSteps} titles={spec.steps} st={st} ui={ui} />
      {!st.sx.on && <p className="sankey-hint">{W.hint}</p>}
      <details className="chart-table"><summary>{ui.table}</summary>
        <div className="table-wrap"><table><thead><tr><th>{W.from}</th><th>{W.to}</th><th>{spec.unit || W.amount}</th><th>{W.share}</th></tr></thead>
          <tbody>{spec.flows.filter((f) => shown(f.appear)).map((f, k) => <tr key={k}><td>{nodeLabel(spec, f.from)}</td><td>{nodeLabel(spec, f.to)}</td><td>{num(f.amount)}</td><td>{Math.round(flowShare(spec, f, step) * 100)}%</td></tr>)}</tbody></table></div>
      </details>
      {pop.node}
    </div>
  );
}
