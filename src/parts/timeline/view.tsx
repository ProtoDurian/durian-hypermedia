// The timeline part's view (format version 11): HTML cards on a line, oldest first. `dir=across` lays them out sideways
// on a wide stage; a narrow stage is always top to bottom. A hidden event keeps its room (it is only invisible), so a
// step never changes the size and the controls under the list never move. Static draws one step whole.
import React from "react";
import { Stepper, colBase, cx, newAt, shownAt, stepKeys, useSteps } from "../kit/view";
import type { PartViewProps } from "../types";
import type { TlSpec } from "./part";

export default function TimelineView({ data: spec, ui, static: stp }: PartViewProps<TlSpec>) {
  const n = spec.steps.length, titles = spec.steps.map((s) => s.title), st = useSteps(n, stp, titles), i = st.i;
  return (
    <div className={cx("dh-dg dh-tl", spec.across && "is-across")} data-dh-static={st.sx.on || undefined} tabIndex={n > 1 ? 0 : undefined} onKeyDown={stepKeys(st, n)} aria-label={spec.title || undefined}>
      <ol className="timeline-list" data-dh-slot="list">
        {spec.events.map((e, k) => (
          <li key={k} className={cx("timeline-item", newAt(e.step, i, n) && "is-new")} style={{ visibility: shownAt(e.step, i, n) ? "visible" : "hidden", ["--tc" as any]: colBase(e.colour) }} aria-hidden={!shownAt(e.step, i, n)}>
            <time className="timeline-date" data-dh-slot="date">{e.date}</time>
            <div className="timeline-card" data-dh-slot="event">
              <strong className="timeline-title">{e.title}</strong>
              {e.note && <span className="timeline-note">{e.note}</span>}
              {e.detail.length > 0 && <ul>{e.detail.map((d, q) => <li key={q}>{d}</li>)}</ul>}
            </div>
          </li>
        ))}
      </ol>
      <Stepper n={n} titles={titles} st={st} ui={ui} />
    </div>
  );
}
