// The stack trace part (pass 11, DESIGN 7.2): the error line big, each cause in its own block, threads as groups,
// library frames folded into one bar, the author's own frames marked, a frame that opens to its detail (and links to the
// code at the page's pin when the part has repo= and strip=).
import type { PartViewProps } from "../types";
import React, { useState } from "react";
import type { Block, Frame, Trace } from "./trace";
import type { StackData } from "./part";

export type D = StackData;
const KIND_LABEL: Record<string, string> = { error: "", cause: "Caused by", suppressed: "Suppressed", thread: "" };

type Item = { t: "frame"; f: Frame; i: number } | { t: "fold"; fs: Frame[]; from: number } | { t: "gap"; at: number };
function items(b: Block): Item[] {
  const out: Item[] = []; let i = 0;
  const gapAt = (n: number) => b.gaps.includes(n);
  while (i < b.frames.length) {
    if (gapAt(i)) out.push({ t: "gap", at: i });
    if (b.frames[i].lib) { let j = i; while (j < b.frames.length && b.frames[j].lib && !(j > i && gapAt(j))) j++; out.push({ t: "fold", fs: b.frames.slice(i, j), from: i }); i = j; }
    else { out.push({ t: "frame", f: b.frames[i], i }); i++; }
  }
  if (gapAt(b.frames.length) && b.frames.length) out.push({ t: "gap", at: b.frames.length });
  return out;
}
const stripPath = (file: string, strip: string) => { const f = file.replace(/^file:\/\//, ""); return strip && f.startsWith(strip) ? f.slice(strip.length) : f; };
const breakable = (s: string) => s.split(/([/.])/).map((p, i) => (p === "/" || p === "." ? <React.Fragment key={i}>{p}<wbr /></React.Fragment> : p));

function FrameRow({ f, d, pin }: { f: Frame; d: D; pin: string | undefined }) {
  const [open, setOpen] = useState(false);
  const rel = stripPath(f.file, d.strip);
  const linked = !!(f.app && d.repo && d.strip && f.file.replace(/^file:\/\//, "").startsWith(d.strip));
  const where = `${rel}${f.line != null ? `:${f.line}` : ""}${f.col != null ? `:${f.col}` : ""}`;
  return (
    <li className={`st-frame${f.app ? " is-app" : ""}`} data-dh-slot={f.app ? "frame-app" : "frame"}>
      <button type="button" className="st-fbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="st-fn" data-dh-slot="frame-fn">{breakable(f.fn)}</span>
        {f.app ? <span className="chip st-app">app</span> : null}
        <span className="st-file" data-dh-slot="frame-file">{breakable(where)}</span>
      </button>
      {open ? (
        <div className="st-detail" role="group" aria-label="Frame detail">
          <div className="st-raw">{f.raw.trim()}</div>
          {f.code ? <div className="st-code">{f.code}</div> : null}
          {linked ? <div className="st-link">Code: <span className="coderef" tabIndex={0} title={`${d.repo}/${rel}${pin ? ` · pinned ${pin}` : ""}`}>{d.repo}/{rel}{f.line != null ? `#L${f.line}` : ""}</span>{pin ? <span className="st-pin"> at pin {pin.slice(0, 7)}</span> : null}</div> : null}
        </div>
      ) : null}
    </li>
  );
}
/** the name a folded library frame goes by: the package folder after node_modules, vendor or site-packages, else the first two package parts */
const VENDOR = ["node_modules", "site-packages", "dist-packages", "vendor"];
function libName(f: Frame): string {
  const parts = f.file.replace(/^file:\/\//, "").split(/[\\/]/);
  let at = -1;
  parts.forEach((p, i) => { if (VENDOR.includes(p)) at = i; });
  if (at >= 0 && parts[at + 1]) return parts[at + 1].replace(/\.(py|js|ts|mjs|cjs)$/, "");
  return f.pkg.split("/").slice(0, 2).join("/");
}
function Fold({ fs }: { fs: Frame[] }) {
  const [open, setOpen] = useState(false);
  const pk = [...new Set(fs.map(libName))].slice(0, 4).join(", ");
  return (
    <li className="st-foldrow" data-dh-slot="fold">
      <button type="button" className="st-fold" aria-expanded={open} onClick={() => setOpen(!open)}><span aria-hidden="true">{open ? "▾" : "▸"}</span> {fs.length} library frame{fs.length === 1 ? "" : "s"}: {pk}</button>
      {open ? <ul className="st-list">{fs.map((f, i) => <li key={i} className="st-frame is-lib"><div className="st-fbtn st-static"><span className="st-fn">{breakable(f.fn)}</span><span className="st-file">{breakable(`${f.file}${f.line != null ? `:${f.line}` : ""}`)}</span></div></li>)}</ul> : null}
    </li>
  );
}
function BlockView({ b, d, pins, first }: { b: Block; d: D; pins: Record<string, string>; first: boolean }) {
  const lab = KIND_LABEL[b.kind];
  const pin=Object.prototype.hasOwnProperty.call(pins,d.repo)?pins[d.repo]:undefined;
  const body = (
    <ul className="st-list">
      {items(b).map((it, k) => it.t === "frame" ? <FrameRow key={k} f={it.f} d={d} pin={pin} /> : it.t === "fold" ? <Fold key={k} fs={it.fs} /> : <li key={k} className="st-gap" aria-label="asynchronous gap">⋯ async gap</li>)}
      {b.omitted ? <li className="st-omit">… {b.omitted} more frame{b.omitted === 1 ? "" : "s"} are the same as the trace above</li> : null}
    </ul>
  );
  if (b.kind === "thread") return <details className="st-block st-thread" data-dh-slot="thread" open={first}><summary>{b.head}</summary>{body}</details>;
  return (
    <section className={`st-block st-${b.kind}`} data-dh-slot={b.kind === "error" ? "error" : "cause"}>
      <h4 className="st-head">{lab ? <span className="st-lab">{lab}</span> : null}{b.kind === "error" ? <span className="st-errline">{b.head}</span> : <span className="st-causeline">{b.head}</span>}</h4>
      {b.note ? <p className="st-link-note">{b.note}</p> : null}
      {body}
    </section>
  );
}
export default function StacktraceView({ data: d }: PartViewProps<D>) {
  if (!d.trace) return <div className="st-err" role="alert">This trace could not be read: {d.error}</div>;
  const t = d.trace;
  let firstThread = true;
  return (
    <div className="st" data-lang={t.lang}>
      <div className="st-top">{d.title ? <span className="st-title">{d.title}</span> : null}<span className="chip">{t.lang}</span><span className="chip">{t.blocks.reduce((n, b) => n + b.frames.length, 0)} frames</span></div>
      {t.blocks.map((b, i) => { const first = b.kind === "thread" && firstThread; if (b.kind === "thread") firstThread = false; return <BlockView key={i} b={b} d={d} pins={d.pins??{}} first={first} />; })}
    </div>
  );
}
