// The sequence part's view (format version 11): our own SVG, placed by the pure layout, so the box is the same before
// and after the script runs; a step changes what is shown, never the size. The heads stay at the top while the box
// scrolls; three or more participants scroll sideways in the part's own box. Static draws one step whole.
import React, { useId, useMemo } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import { Lines, Stepper, cx, newAt, oldAt, shownAt, stepKeys, useSteps } from "../kit/view";
import type { PartViewProps } from "../types";
import type { SeqItem, SeqSpec } from "./part";
import { SEQ, layoutSequence } from "./layout";

// a layout made while drawing pays from a budget of its own (made per spec): the page's budget was charged when the
// page was parsed, and a render (every step click) must never spend it
const scratch = () => new Budget(partLimitsOf(), null, null, "the sequence part");

function Icon({ kind, x, y }: { kind: string; x: number; y: number }) {
  if (kind === "actor") return <g transform={`translate(${x},${y})`} className="seq-icon"><circle cx="7" cy="4" r="3" /><path d="M1 14c0-4 3-6 6-6s6 2 6 6" /></g>;
  if (kind === "database") return <g transform={`translate(${x},${y})`} className="seq-icon"><ellipse cx="7" cy="3" rx="6" ry="2.5" /><path d="M1 3v9c0 1.5 2.7 2.5 6 2.5s6-1 6-2.5V3" /></g>;
  if (kind === "queue") return <g transform={`translate(${x},${y})`} className="seq-icon"><path d="M1 3h12M1 7h12M1 11h12" /></g>;
  if (kind === "service") return <g transform={`translate(${x},${y})`} className="seq-icon"><rect x="1.5" y="1.5" width="11" height="11" rx="2.5" /><circle cx="7" cy="7" r="2" /></g>;
  return null;
}

export default function SequenceView({ data: spec, ui, static: stp }: PartViewProps<SeqSpec>) {
  const id = useId().replace(/:/g, "");
  const L = useMemo(() => layoutSequence(spec, scratch()), [spec]), n = spec.steps.length, titles = spec.steps.map((s) => s.title);
  const st = useSteps(n, stp, titles), f = SEQ.font, lh = SEQ.lh, i = st.i;
  const many = spec.participants.length > 2;
  const vis = (it: SeqItem) => shownAt(it.step, i, n);
  const cls = (it: SeqItem) => cx(newAt(it.step, i, n) && "is-new", oldAt(it.step, i, n) && "is-old");
  // the frames of blocks: from an open to its end
  const frames: { y1: number; y2: number; depth: number; label: string[]; step: number; elses: { y: number; lines: string[] }[] }[] = [];
  const open: number[] = [];
  L.rows.forEach((r) => {
    const it = r.item;
    if (it.t === "open") { frames.push({ y1: r.y, y2: r.y + r.h, depth: it.depth, label: r.lines, step: it.step, elses: [] }); open.push(frames.length - 1); }
    else if (it.t === "else") { const fr = frames[open[open.length - 1]]; if (fr) fr.elses.push({ y: r.y, lines: r.lines }); }
    else if (it.t === "end") { const fr = frames[open.pop()!]; if (fr) fr.y2 = r.y + r.h - 2; }
  });
  return (
    <div className="dh-dg dh-seq" data-dh-static={st.sx.on || undefined} tabIndex={n > 1 ? 0 : undefined} onKeyDown={stepKeys(st, n)} aria-label={spec.title || undefined}>
      <div className={cx("dh-box", many && "seq-scroll")} data-dh-slot="box">
        <div className="dh-inner" style={{ minWidth: `${L.minW}px`, maxWidth: `${L.w * 1.5}px` }}>
          <svg className="dh-svg seq-heads" viewBox={`0 0 ${L.w} ${L.headH}`} aria-hidden="true">
            {L.heads.map((h, k) => (
              <g key={k} data-dh-slot="head" className="seq-head">
                <rect x={h.x - h.w / 2} y={4} width={h.w} height={SEQ.head - 4} rx={8} />
                <Icon kind={spec.participants[k].kind} x={h.x - h.w / 2 + 6} y={9} />
                <Lines lines={h.lines} x={h.x + (spec.participants[k].kind === "participant" ? 0 : 7)} y={h.lines.length > 1 ? 21 : 29} lh={lh} />
              </g>
            ))}
          </svg>
          <svg className="dh-svg seq-body" viewBox={`0 0 ${L.w} ${L.h}`} role="img" aria-label={spec.title || "Sequence diagram"} style={{ aspectRatio: `${L.w} / ${L.h}` }}>
            <defs>
              <marker id={`${id}-f`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="seq-arrow-fill" /></marker>
              <marker id={`${id}-o`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" className="seq-arrow-open" /></marker>
            </defs>
            {L.cols.map((x, k) => <line key={k} x1={x} y1={0} x2={x} y2={L.h} className="seq-life" data-dh-slot="life" />)}
            {frames.map((fr, k) => shownAt(fr.step, i, n) && (
              <g key={k} data-dh-slot="block" className={cx("seq-block", oldAt(fr.step, i, n) && "is-old")}>
                <rect x={4 + fr.depth * 6} y={fr.y1} width={L.w - 8 - fr.depth * 12} height={Math.max(8, fr.y2 - fr.y1)} rx={6} />
                <Lines lines={fr.label} x={12 + fr.depth * 6} y={fr.y1 + f + 1} lh={lh} anchor="start" cls="seq-tab" />
                {fr.elses.map((e, q) => <g key={q}><line x1={4 + fr.depth * 6} x2={L.w - 4 - fr.depth * 6} y1={e.y + 1} y2={e.y + 1} className="seq-else" /><Lines lines={e.lines} x={12 + fr.depth * 6} y={e.y + f + 3} lh={lh} anchor="start" cls="seq-tab" /></g>)}
              </g>
            ))}
            {L.acts.map((a, k) => shownAt(a.step, i, n) && <rect key={k} x={L.cols[a.col] - SEQ.actW / 2} y={a.y1} width={SEQ.actW} height={Math.max(4, a.y2 - a.y1)} data-dh-slot="activation" className="seq-act" />)}
            {L.rows.map((r, k) => {
              const it = r.item;
              if (it.t === "msg" && vis(it)) {
                const a = L.cols[it.from], b = L.cols[it.to], dir = b >= a ? 1 : -1, y = r.y + r.h - 8;
                const dash = it.arrow === "reply";
                const mk = it.arrow === "call" ? `url(#${id}-f)` : `url(#${id}-o)`;
                if (r.self) {
                  const x = a + SEQ.actW / 2;
                  return (
                    <g key={k} data-dh-slot="msg" className={cx("seq-msg", cls(it))}>
                      <path d={`M${x} ${y - 14}h22v14h-22`} className={cx("seq-line", dash && "is-dash")} markerEnd={mk} pathLength={1} />
                      <Lines lines={r.lines} x={x + 28} y={y - 18 + (r.lines.length > 1 ? 0 : 6)} lh={lh} anchor="start" cls="seq-text" />
                    </g>
                  );
                }
                const x1 = a + dir * (SEQ.actW / 2), x2 = it.arrow === "lost" ? b - dir * 28 : b - dir * (SEQ.actW / 2);
                return (
                  <g key={k} data-dh-slot="msg" className={cx("seq-msg", cls(it))}>
                    <line x1={x1} y1={y} x2={x2} y2={y} className={cx("seq-line", dash && "is-dash")} markerEnd={it.arrow === "lost" ? undefined : mk} pathLength={1} />
                    {it.arrow === "lost" && <path d={`M${x2 - 5} ${y - 5}l10 10m0-10l-10 10`} className="seq-x" />}
                    <Lines lines={r.lines} x={(a + b) / 2} y={r.y + f + 2} lh={lh} cls="seq-text" />
                  </g>
                );
              }
              if (it.t === "note" && vis(it)) return (
                <g key={k} data-dh-slot="note" className={cx("seq-note", cls(it))}>
                  <rect x={r.x1} y={r.y} width={r.x2 - r.x1} height={r.h} rx={5} />
                  <Lines lines={r.lines} x={(r.x1 + r.x2) / 2} y={r.y + f + 5} lh={lh} />
                </g>
              );
              return null;
            })}
          </svg>
        </div>
      </div>
      {L.minW > 330 && <p className="seq-hint">{ui.hintDiagram ?? "↔ Swipe to see the whole drawing"}</p>}
      <Stepper n={n} titles={titles} st={st} ui={ui} />
    </div>
  );
}
