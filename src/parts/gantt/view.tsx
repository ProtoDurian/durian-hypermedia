// The gantt part's view (format version 11): our own SVG and date code. Bars in the section's colour, progress as a
// darker fill, done bars faint with a tick, milestones as diamonds, `after` as thin right-angle arrows, a `today` line,
// steps (progress, done, move), the one popover on every bar, and Day, Week and Month buttons. On a phone the task
// names sit above their bars and the time scale scrolls sideways inside the part's own box. Static draws one step whole.
import React, { useId, useMemo, useRef, useState } from "react";
import { Budget, partLimitsOf } from "../../core/budget";
import { Stepper, colBase, colInk, cx, stepKeys, useSteps, usePopover } from "../kit/view";
import { familyOf } from "../kit/text";
import type { PartViewProps } from "../types";
import { scheduleGantt, spanText, type GanttSpec, type Sched } from "./part";
import { GANTT, layoutGantt, xOf, type Scale } from "./layout";
import { DAY, tickLabel } from "./time";

/** the part's own words (the renderer's shared words come from `ui`) */
const W = {
  day: "Day", week: "Week", month: "Month", scale: "Time scale", today: "Today", waitsFor: "Waits for", progress: "Progress", done: "Done", milestone: "Milestone",
  moved: "moved", critical: "On the longest chain", task: "Task", start: "Start", end: "End", cannot: "This gantt cannot be drawn:",
  hint: "Hover or tap a bar for its dates.", hintPhone: "↔ Swipe the chart to see all of it",
};
/** the room a gantt is laid out in before the first measure (the server's HTML) */
const FIRST_WIDTH = 760;
// a layout made while drawing pays from a budget of its own (a new one for each layout): the page's budget was charged
// when the page was parsed, and a render (every step click) must never spend it
const scratch = () => new Budget(partLimitsOf(), null, null, "the gantt part");
const SCALE_LIST: Scale[] = ["day", "week", "month"];

export default function GanttView({ data: spec, ui, static: stp, stage }: PartViewProps<GanttSpec>) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<Scale | null>(null);
  const nSteps = spec.steps.length, st = useSteps(nSteps, stp, spec.steps), step = st.i;
  const pop = usePopover(host, ui.close);
  const arrow = `gtarrow${useId().split(":").join("")}`;
  // the stage's width less the part's own border and padding (12 px each side on a phone, 16 px otherwise)
  const room = Math.max(240, (stage.width || FIRST_WIDTH) - (stage.width && stage.width < 600 ? 26 : 34));
  const failed = spec.errors.length > 0 || !spec.tasks.length;
  const sched = useMemo(() => (failed ? [] : scheduleGantt(spec, step)), [spec, step, failed]);
  const L = useMemo(() => (failed ? null : layoutGantt(spec, sched, room, scale, scratch())), [spec, sched, room, scale, failed]);
  if (!L) return <div className="gantt dh-pop-host"><div className="cw-error">{W.cannot} {spec.errors[0]?.msg ?? "it has no tasks"}</div></div>;
  const tz = spec.tz, phone = L.phone, X = (t: number) => xOf(L, t);
  const byId = new Map(sched.map((s) => [s.id, s]));
  const rowOf = new Map<string, number>();
  L.rows.forEach((r) => { if (r.kind === "task") rowOf.set(r.s.id, r.cy); });
  const labels = new Map(spec.tasks.map((t) => [t.id, t.label]));
  const labelOf = (id: string) => labels.get(id) ?? id;
  const colourOf = (s: Sched) => s.colour ?? familyOf(s.section);
  const dayLen = (s: Sched) => Math.max(1, Math.round((s.end - s.start) / DAY));
  const desc = (s: Sched) => {
    const x = spanText(s, tz);
    const lines: string[] = [];
    if (s.after.length) lines.push(`${W.waitsFor}: ${s.after.map(labelOf).join(", ")}`);
    if (!s.milestone) lines.push(s.done ? W.done : s.progress > 0 ? `${W.progress}: ${Math.round(s.progress)}%` : "");
    if (s.moved) lines.push(W.moved);
    if (s.critical) lines.push(W.critical);
    return { title: s.label, meta: s.milestone ? `${W.milestone} · ${x.start}` : `${x.start} → ${x.end}${x.whole ? ` · ${dayLen(s)} ${dayLen(s) === 1 ? "day" : "days"}` : ""}`, text: lines.filter(Boolean).join(" · ") };
  };
  const todayAt = spec.today !== undefined && spec.today >= L.min && spec.today <= L.max ? X(spec.today) : null;
  return (
    <div className={cx("gantt dh-pop-host", phone && "is-phone")} ref={host} data-dh-static={st.sx.on || undefined} data-dh-motion={stage.motion === "off" ? "off" : undefined} tabIndex={nSteps > 1 ? 0 : undefined} onKeyDown={stepKeys(st, nSteps)}>
      {spec.title && <div className="gantt-title">{spec.title}</div>}
      {!st.sx.on && (
        <div className="gantt-bar" data-dh-slot="scale-buttons" role="group" aria-label={W.scale}>
          {SCALE_LIST.map((s) => <button key={s} type="button" className="btn btn-s" aria-pressed={L.scale === s} onClick={() => setScale(s)}>{W[s]}</button>)}
        </div>
      )}
      <div className="gantt-body" style={{ minHeight: L.totalH + 1 }}>
        {!phone && (
          <div className="gantt-names" style={{ width: GANTT.namesW, paddingTop: GANTT.head }} aria-hidden="true">
            {L.rows.map((r, k) => r.kind === "section" ? <div key={k} className="gn-section" style={{ height: GANTT.section }}>{r.name}</div> : <div key={k} className="gn-task" style={{ height: GANTT.row }} title={r.s.label}><span>{r.s.label}</span></div>)}
          </div>
        )}
        <div className="gantt-scroll">
          <svg width={L.svgW} height={L.totalH} viewBox={`0 0 ${L.svgW} ${L.totalH}`} role="group" aria-label={spec.title || "Gantt"}>
            <defs><marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L7,4 L0,7 Z" className="gt-arrowhead" /></marker></defs>
            <g data-dh-slot="scale" className="gt-scale">
              {L.weekends.map((t) => <rect key={t} x={X(t)} y={GANTT.head} width={L.ppd} height={L.totalH - GANTT.head} className="gt-weekend" />)}
              {L.ticks.t.map((t, k) => <g key={t}><line x1={X(t)} x2={X(t)} y1={GANTT.head - 6} y2={L.totalH} className="gt-grid" /><text x={X(t) + 4} y={GANTT.head - 12} className="gt-tick">{tickLabel(t, L.labelUnit, tz, k === 0)}</text></g>)}
            </g>
            {L.rows.map((r, k) => r.kind === "section" && (
              <g key={`s${k}`} data-dh-slot="section"><rect x={0} y={r.y} width={L.svgW} height={GANTT.section} className="gt-sec-bg" />{phone && <text x={8} y={r.y + GANTT.section / 2} dominantBaseline="central" className="gt-sec-text">{r.name}</text>}</g>
            ))}
            {todayAt !== null && (
              <g data-dh-slot="today" className="gt-today"><line x1={todayAt} x2={todayAt} y1={GANTT.head - 4} y2={L.totalH} /><text x={todayAt + 4} y={GANTT.head + 12} className="gt-today-label">{W.today}</text></g>
            )}
            <g data-dh-slot="dependency" className="gt-deps">
              {sched.flatMap((s) => s.after.map((a) => {
                const p = byId.get(a);
                if (!p) return null;
                const x1 = X(p.end), x2 = X(s.start), y1 = rowOf.get(p.id)!, y2 = rowOf.get(s.id)!, mx = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 10));
                return <path key={`${a}>${s.id}`} d={`M${x1},${y1}H${mx}V${y2}H${x2 - 1}`} className="gt-dep" markerEnd={`url(#${arrow})`} />;
              }))}
            </g>
            {L.rows.map((r) => {
              if (r.kind !== "task") return null;
              const s = r.s, x = X(s.start), wd = Math.max(s.milestone ? 0 : 4, X(s.end) - x), cy = r.cy, c = colourOf(s), d = desc(s);
              const hitW = s.milestone ? 24 : Math.max(24, wd + 4);
              return (
                <g key={s.id} className={cx("gt-task", s.done && "is-done", s.critical && "is-critical", s.milestone && "is-milestone")} data-dh-slot="task" style={{ transform: `translate(${x}px, 0)` }}
                  role="button" tabIndex={0} aria-label={`${d.title}: ${d.meta}${d.text ? `. ${d.text}` : ""}`} {...pop.bind(`t${s.id}`, d)}>
                  {phone && <text x={Math.max(4 - x, 0)} y={r.y + 14} className="gt-name">{s.label}</text>}
                  {s.milestone ? (
                    <path data-dh-slot="milestone" d={`M0,${cy - 10}L10,${cy}L0,${cy + 10}L-10,${cy}Z`} fill={colBase(c)} className="gt-diamond" />
                  ) : (
                    <>
                      <rect data-dh-slot="bar" x={0} y={cy - GANTT.bar / 2} width={wd} height={GANTT.bar} rx={5} fill={colBase(c)} className="gt-barrect" style={{ width: wd }} />
                      {s.progress > 0 && <rect data-dh-slot="progress" x={0} y={cy - GANTT.bar / 2} width={(wd * Math.min(100, s.progress)) / 100} height={GANTT.bar} rx={5} className="gt-prog" style={{ width: (wd * Math.min(100, s.progress)) / 100 }} fill={colInk(c)} />}
                      {s.done && <path d={`M${Math.max(6, wd - 18)},${cy}l4,4l8,-8`} className="gt-tick-done" fill="none" />}
                    </>
                  )}
                  <rect x={s.milestone ? -12 : -(hitW - wd) / 2} y={cy - 14} width={hitW} height={28} fill="transparent" />
                  {!phone && wd > 90 && <text x={8} y={cy} dominantBaseline="central" className="gt-inbar">{Math.round(s.progress) > 0 && !s.done ? `${Math.round(s.progress)}%` : ""}</text>}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {!st.sx.on && <p className="gantt-hint">{phone ? W.hintPhone : W.hint}</p>}
      <Stepper n={nSteps} titles={spec.steps} st={st} ui={ui} />
      <details className="chart-table"><summary>{ui.table}</summary>
        <div className="table-wrap"><table><thead><tr><th>{W.task}</th><th>{W.start}</th><th>{W.end}</th><th>{W.waitsFor}</th></tr></thead>
          <tbody>{sched.map((s) => { const x = spanText(s, tz); return <tr key={s.id}><th>{s.label}{s.milestone ? ` (${W.milestone.toLowerCase()})` : s.done ? ` (${W.done.toLowerCase()})` : s.progress ? ` (${Math.round(s.progress)}%)` : ""}</th><td>{x.start}</td><td>{x.end}</td><td>{s.after.map(labelOf).join(", ")}</td></tr>; })}</tbody></table></div>
      </details>
      {pop.node}
    </div>
  );
}
