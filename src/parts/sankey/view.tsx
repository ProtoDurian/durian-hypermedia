// The sankey part's view (format version 11): d3-sankey's layout, our own SVG, token colours, text in the DOM (real
// <text>), steps that build the bands up, the one popover on every flow and node (hover, tap, focus), and a narrow layout
// that runs top to bottom. Static draws one step whole.
// The drawing is as wide as the card holds (innerWidth), the end columns keep the room their labels need (found from where
// the columns really sit), a label that still does not fit ends with an ellipsis, and the height does not follow the width.
import React, { useMemo, useRef, useState } from "react";
import { Stepper, colBase, stepKeys, useSteps, usePopover } from "../kit/view";
import type { PartViewProps } from "../types";
import { flowShare, nodeLabel, type SankeySpec } from "./part";
import { layoutSankey, pathOf, LABEL_PX, innerWidth, labelMargins, fitLabel } from "./layout";

const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
/** the part's own words (the renderer's shared words come from `ui`) */
const W = { hint: "Hover or tap a flow or a node.", cannot: "This sankey cannot be drawn:", inFlow: "In", outFlow: "Out", from: "From", to: "To", amount: "amount", share: "Share", of: "of" };
/** the stage width a sankey is laid out at before the first measure (the server's HTML) */
const FIRST_WIDTH = 760;

export default function SankeyView({ data: spec, ui, static: stp, stage }: PartViewProps<SankeySpec>) {
  const host = useRef<HTMLDivElement>(null);
  const width = innerWidth(stage.width || FIRST_WIDTH);
  const nSteps = spec.steps.length, st = useSteps(nSteps, stp, spec.steps), step = nSteps > 1 ? st.i : Infinity;
  const [hover, setHover] = useState<{ kind: "flow" | "node"; k: number } | null>(null);
  const pop = usePopover(host, ui.close);
  const lay = useMemo(() => {
    if (spec.errors.length || !spec.flows.length) return null;
    // columns first, to know whether a narrow stage turns it: more than 3 columns under 520 px runs top to bottom
    const probe = layoutSankey(spec, 700, 300, false);
    const vertical = width < 520 && probe.columns > 3;
    const maxCol = Math.max(1, ...Array.from({ length: probe.columns }, (_, c) => probe.nodes.filter((n) => n.col === c).length));
    if (vertical) return layoutSankey(spec, width, Math.max(360, probe.columns * 96), true, 14, 14);
    // the first and last columns by where they really sit (a sink that is not in the deepest column still sits at the right edge)
    const lo = Math.min(...probe.nodes.map((n) => n.x)), hi = Math.max(...probe.nodes.map((n) => n.x + n.w));
    const m = labelMargins(probe.nodes.filter((n) => n.x <= lo + 1).map((n) => n.label.length), probe.nodes.filter((n) => n.x + n.w >= hi - 1).map((n) => n.label.length), width);
    return layoutSankey(spec, width, Math.max(320, Math.min(560, maxCol * 40 + 60)), false, 14, 14, m);
  }, [spec, width]);
  if (!lay) return <div className="sankey"><div className="cw-error">{W.cannot} {spec.errors[0]?.msg ?? "it has no flows"}</div></div>;
  const shown = (appear: number) => appear <= step;
  const lit = hover ? (hover.kind === "flow" ? pathOf(spec, hover.k) : new Set(spec.flows.map((f, k) => (f.from === lay.nodes[hover.k].id || f.to === lay.nodes[hover.k].id ? k : -1)).filter((k) => k >= 0))) : null;
  const litNodes = lit ? new Set([...lit].flatMap((k) => [spec.flows[k].from, spec.flows[k].to])) : null;
  const nodeShown = (id: string) => spec.flows.some((f) => shown(f.appear) && (f.from === id || f.to === id));
  const unit = spec.unit ? ` ${spec.unit}` : "";
  // a vertical sankey: the label sits above its bar, or below it when the next bar of the row is too close; cut with an ellipsis to the room it has
  const vlabel = new Map<string, { x: number; y: number; text: string }>();
  if (lay.vertical) {
    for (let c = 0; c < lay.columns; c++) {
      const row = lay.nodes.filter((n) => n.col === c && nodeShown(n.id)).sort((a, b) => a.x - b.x);
      const lastEnd: [number, number] = [-Infinity, -Infinity]; // the right end of the last label drawn above, and below
      row.forEach((n) => {
        const want = n.label.length * LABEL_PX + 6, above = n.x >= lastEnd[0] ? 0 : n.x >= lastEnd[1] ? 1 : 0;
        const next = row.find((m) => m.x > n.x);
        const room = Math.max(3, Math.floor(((next && next.x - n.x < want ? next.x - n.x : lay.width - n.x) - 6) / LABEL_PX));
        const text = n.label.length > room ? n.label.slice(0, Math.max(1, room - 1)) + "…" : n.label;
        const x = Math.min(n.x, lay.width - (text.length * LABEL_PX + 4));
        lastEnd[above] = x + text.length * LABEL_PX + 8;
        vlabel.set(n.id, { x: Math.max(2, x), y: above === 0 ? n.y - 9 : n.y + n.h + 10, text });
      });
    }
  }
  const anchor = (n: (typeof lay.nodes)[number]) => {
    if (lay.vertical) { const v = vlabel.get(n.id) ?? { x: n.x, y: n.y - 9, text: n.label }; return { x: v.x, y: v.y, a: "start" as const, text: v.text }; }
    if (n.col === 0) return { x: n.x - 6, y: n.y + n.h / 2, a: "end" as const, text: fitLabel(n.label, n.x - 8) };
    return { x: n.x + n.w + 6, y: n.y + n.h / 2, a: "start" as const, text: fitLabel(n.label, lay.width - (n.x + n.w + 8)) };
  };
  return (
    <div className={`sankey dh-pop-host${lay.vertical ? " is-vertical" : ""}`} ref={host} data-dh-static={st.sx.on || undefined} tabIndex={nSteps > 1 ? 0 : undefined} onKeyDown={stepKeys(st, nSteps)}>
      {spec.title && <div className="sankey-title">{spec.title}</div>}
      <div className="sankey-box">
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
              const on = nodeShown(n.id), dim = litNodes && !litNodes.has(n.id), a = anchor(n);
              const d = { title: n.label, meta: `${W.inFlow} ${num(n.inV)}${unit} · ${W.outFlow} ${num(n.outV)}${unit}` };
              return (
                <g key={n.id} className={`sk-node${on ? "" : " is-hidden"}${dim ? " is-dim" : ""}`} data-dh-slot="node" role="button" tabIndex={on ? 0 : -1} aria-hidden={on ? undefined : true} aria-label={`${d.title}: ${d.meta}`} {...pop.bind(`n${k}`, d)}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setHover({ kind: "node", k }); }} onPointerLeave={() => setHover(null)} onFocus={(e) => { setHover({ kind: "node", k }); pop.bind(`n${k}`, d).onFocus(e); }} onBlur={(e) => { setHover(null); pop.bind(`n${k}`, d).onBlur(e); }}>
                  <rect x={n.x} y={n.y} width={Math.max(n.w, 2)} height={Math.max(n.h, 2)} rx={3} fill={colBase(n.colour)} className="sk-rect" />
                  <rect x={n.x - 6} y={n.y - 4} width={n.w + 12} height={n.h + 8} fill="transparent" />
                  <text x={a.x} y={a.y} textAnchor={a.a} dominantBaseline="central" className="sk-label" data-dh-slot="node-label">{a.text}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <Stepper n={nSteps} titles={spec.steps} st={st} ui={ui} />
      <p className="sankey-hint">{W.hint}</p>
      <details className="chart-table"><summary>{ui.table}</summary>
        <div className="table-wrap"><table><thead><tr><th>{W.from}</th><th>{W.to}</th><th>{spec.unit || W.amount}</th><th>{W.share}</th></tr></thead>
          <tbody>{spec.flows.filter((f) => shown(f.appear)).map((f, k) => <tr key={k}><td>{nodeLabel(spec, f.from)}</td><td>{nodeLabel(spec, f.to)}</td><td>{num(f.amount)}</td><td>{Math.round(flowShare(spec, f, step) * 100)}%</td></tr>)}</tbody></table></div>
      </details>
      {pop.node}
    </div>
  );
}
