// A meaning's small Markdown as React elements (shared by the block's list and the card). Real elements: no HTML string.
// A link goes through the host's urlPolicy like every other link; a refused one is shown as its text.
import React from "react";
import { useDh } from "../../react/context";
import { applyUrlPolicy } from "../../safety";
import type { DefSeg } from "./terms";

export function Segs({ segs }: { segs: DefSeg[] }) {
  const { urlPolicy } = useDh();
  return <>{segs.map((s, i) => {
    if (s.href) {
      const href = applyUrlPolicy(s.href, "link", urlPolicy);
      return href == null ? <span key={i} className="dh-link-off">{s.t}</span> : <a key={i} href={href} rel="noreferrer noopener" target="_blank">{s.t}</a>;
    }
    return s.code ? <code key={i}>{s.t}</code> : s.b ? <strong key={i}>{s.t}</strong> : s.i ? <em key={i}>{s.t}</em> : <React.Fragment key={i}>{s.t}</React.Fragment>;
  })}</>;
}
