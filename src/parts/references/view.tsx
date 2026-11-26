// The references list (format version 11): one entry per reference, each with an anchor, its number in ieee, "cited N times" and a
// link back to each mark. Every element is a React element: no HTML string reaches the page.
import React from "react";
import type { PartViewProps } from "../types";
import type { RefsData } from "./part";
import { useDh } from "../../react/context";
import { applyUrlPolicy } from "../../safety";

/** the part's own words */
const W = { title: "References", cited: (n: number) => (n === 1 ? "cited once" : `cited ${n} times`), back: "Back to the text", never: "not cited" };

export default function ReferencesView({ data }: PartViewProps<RefsData>) {
  const ieee = data.style === "ieee";
  const { urlPolicy } = useDh();
  const link = (h: string) => applyUrlPolicy(h, "link", urlPolicy);   // a reference's link goes through the host's urlPolicy like every other link
  return (
    <div className="refs" data-dh-slot="frame">
      <div className="refs-title" data-dh-slot="title">{data.title ?? W.title}<span className="refs-count">{data.entries.length}</span></div>
      <ol className={`refs-list${ieee ? " refs-ieee" : ""}`} data-dh-slot="list">
        {data.entries.map((e) => (
          <li className="refs-item" key={e.id} id={`${data.idPrefix}ref-${e.id}`} data-dh-slot="entry">
            <span className="refs-text">{ieee && <span className="refs-num">[{e.num}] </span>}{e.segs.map((s, k) => (s.href && link(s.href) ? <a key={k} href={link(s.href)!} rel="noreferrer">{s.t}</a> : s.href ? <span key={k} className="dh-link-off">{s.t}</span> : s.i ? <i key={k}>{s.t}</i> : <React.Fragment key={k}>{s.t}</React.Fragment>))}</span>
            <span className="refs-uses" data-dh-slot="uses">
              {e.uses ? <>{W.cited(e.uses)}: {Array.from({ length: e.uses }, (_, k) => <a key={k} href={`#${data.idPrefix}cite-${e.id}-${k + 1}`} aria-label={`${W.back} (${k + 1})`}>{k + 1}</a>)}</> : W.never}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
