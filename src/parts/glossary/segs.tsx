// A meaning's small Markdown as React elements (shared by the block's list and the card). Real elements: no HTML string.
import React from "react";
import type { DefSeg } from "./terms";

export function Segs({ segs }: { segs: DefSeg[] }) {
  return <>{segs.map((s, i) => (s.href ? <a key={i} href={s.href} rel="noreferrer noopener" target="_blank">{s.t}</a> : s.code ? <code key={i}>{s.t}</code> : s.b ? <strong key={i}>{s.t}</strong> : s.i ? <em key={i}>{s.t}</em> : <React.Fragment key={i}>{s.t}</React.Fragment>))}</>;
}
