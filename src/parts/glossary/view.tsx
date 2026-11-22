// The glossary block's view (format version 11): the list of terms, each with an anchor (#term-<id>) that the card's "All terms"
// link goes to. Every element is a React element: no HTML string reaches the page.
import React from "react";
import type { PartViewProps } from "../types";
import type { GlossaryData } from "./part";
import { Segs } from "./segs";

/** the part's own words */
const W = { glossary: "Glossary", also: "also", none: "This glossary has no terms." };

export default function GlossaryView({ data }: PartViewProps<GlossaryData>) {
  return (
    <div className="glossary" data-dh-slot="frame">
      <div className="glossary-title" data-dh-slot="title">{data.title ?? W.glossary}<span className="glossary-count">{data.terms.length}</span></div>
      {data.terms.length ? (
        <dl className="glossary-list" data-dh-slot="list">
          {data.terms.map((t) => (
            <div className="glossary-item" key={t.id} id={`term-${t.id}`} data-dh-slot="term">
              <dt>{t.label}{t.also.length > 0 && <span className="glossary-also"> · {W.also} {t.also.join(", ")}</span>}</dt>
              <dd><Segs segs={t.segs} /></dd>
            </div>
          ))}
        </dl>
      ) : <p className="glossary-empty">{W.none}</p>}
    </div>
  );
}
