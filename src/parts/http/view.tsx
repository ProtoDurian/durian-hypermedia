// The http part's view (format version 11): a request and its response as two cards. A method chip and the address (the
// query split into names and values), the headers (folded after 6), the body (JSON as a tree that folds), the status as
// a chip coloured by its class, and Copy as curl. Static draws the whole message: every header, the whole tree, no button.
// Every element is a React element; the copy button writes through the clipboard API only.
import React, { useEffect, useRef, useState } from "react";
import { useStatic } from "../kit/static";
import { cx } from "../kit/view";
import type { PartViewProps } from "../types";
import type { Header, HttpData, JNode } from "./part";
import { statusClass } from "./part";

const FOLD = 6, PARAMS = 200;
const METHOD_TONE: Record<string, string> = { GET: "c2", HEAD: "c2", QUERY: "c2", POST: "c1", PUT: "c3", PATCH: "c4", DELETE: "c7", OPTIONS: "c6", TRACE: "c6", CONNECT: "c6" };
// a label the host's translation may override (ui.<key>), else the English one
const u = (ui: unknown, key: string, d: string): string => ((ui as Record<string, string> | undefined)?.[key]) ?? d;
const W = { cannot: "This message cannot be drawn:", body: "Body" };

function UrlView({ target, host }: { target: string; host?: string }) {
  const at = target.indexOf("?"), path = at < 0 ? target : target.slice(0, at);
  const params = at < 0 ? null : target.slice(at + 1).split("&");
  return (
    <span className="http-url" data-dh-slot="request-line">
      {host && !target.toLowerCase().startsWith("http") && <span className="http-host">{host}</span>}
      <span className="http-path">{path}</span>
      {params && (
        <span className="http-q">?{params.slice(0, PARAMS).map((kv, i) => { const e = kv.indexOf("="); return <span key={i}>{i ? <i>&amp;</i> : null}<b>{e < 0 ? kv : kv.slice(0, e)}</b>{e < 0 ? null : <>=<em>{kv.slice(e + 1)}</em></>}</span>; })}{params.length > PARAMS ? `&${params.slice(PARAMS).join("&")}` : null}</span>
      )}
    </span>
  );
}

function Headers({ list, ui, all }: { list: Header[]; ui: unknown; all: boolean }) {
  const [more, setMore] = useState(false);
  if (!list.length) return null;
  const shown = all || more ? list : list.slice(0, FOLD);
  return (
    <div className="http-heads" data-dh-slot="headers">
      <dl>{shown.map((h, i) => <div key={i}><dt>{h.name}</dt><dd>{h.value}</dd></div>)}</dl>
      {!all && list.length > FOLD && <button type="button" className="http-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? u(ui, "httpFewer", "Show fewer headers") : `${list.length - FOLD} ${list.length - FOLD === 1 ? u(ui, "httpMore1", "more header") : u(ui, "httpMore", "more headers")}`}</button>}
    </div>
  );
}

function Json({ n, last, depth, all }: { n: JNode; last: boolean; depth: number; all: boolean }) {
  const [open, setOpen] = useState(all || depth < 2);
  const key = n.key !== null ? <><span className="j-key">{JSON.stringify(n.key)}</span><span className="j-p">: </span></> : null;
  const comma = last ? "" : ",";
  if ("kids" in n) {
    const [o, c] = n.k === "obj" ? ["{", "}"] : ["[", "]"];
    if (!n.kids.length) return <div className="j-row">{key}<span className="j-p">{o}{c}{comma}</span></div>;
    const shown = all || open;
    return (
      <div className="j-node">
        <div className="j-row">
          {!all && <button type="button" className="j-fold" aria-expanded={open} aria-label={`${open ? "Fold" : "Unfold"} ${n.key ?? n.k}`} onClick={() => setOpen(!open)}><span className={cx("chev", open && "is-open")} aria-hidden="true" /></button>}
          {key}<span className="j-p">{o}</span>{!shown && <span className="j-sum"> {n.n} {n.k === "obj" ? (n.n === 1 ? "key" : "keys") : (n.n === 1 ? "item" : "items")} </span>}{!shown && <span className="j-p">{c}{comma}</span>}
        </div>
        {shown && <div className="j-kids">{n.kids.map((k, i) => <Json key={i} n={k} last={i === n.kids.length - 1} depth={depth + 1} all={all} />)}</div>}
        {shown && <div className="j-row"><span className="j-p">{c}{comma}</span></div>}
      </div>
    );
  }
  return <div className="j-row">{key}<span className={`j-${n.k}`}>{n.v}</span><span className="j-p">{comma}</span></div>;
}

function Body({ text, tree, all }: { text: string; tree: JNode | null; all: boolean }) {
  if (!text) return null;
  return <div className="http-body" data-dh-slot="body" tabIndex={0} role="region" aria-label={W.body}>{tree ? <Json n={tree} last depth={0} all={all} /> : <pre>{text}</pre>}</div>;
}

export default function HttpView({ data, ui, static: stp }: PartViewProps<HttpData>) {
  const sx = useStatic(stp, 0);
  const [done, setDone] = useState<"" | "yes" | "no">("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (data.plain) {
    return (
      <div className="http http-plain" data-dh-static={sx.on || undefined}>
        {data.errors[0] && <div className="cw-error">{W.cannot} {data.errors[0].msg}</div>}
        {data.src && <pre className="http-src" tabIndex={0}>{data.src}</pre>}
      </div>
    );
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.curl!); setDone("yes"); } catch { setDone("no"); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(""), 1800);
  };
  const { req, res } = data;
  const host = req?.headers.find((h) => h.name.toLowerCase() === "host")?.value;
  return (
    <div className="http" data-dh-static={sx.on || undefined}>
      {data.title && <div className="http-title">{data.title}</div>}
      {req && (
        <section className="http-msg http-req" aria-label={u(ui, "httpRequest", "Request")}>
          <div className="http-line">
            <span className={`http-method tone-${METHOD_TONE[req.method] ?? "c1"}`} data-method={req.method.toLowerCase()}>{req.method}</span>
            <UrlView target={req.target} host={host} />
            <span className="http-ver">{req.version}</span>
            {data.curl && !sx.on && (
              <button type="button" className="http-copy" onClick={copy} aria-live="polite">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 3.5v-.4A1.6 1.6 0 0 0 8.9 1.5H3.6A1.6 1.6 0 0 0 2 3.1v6.3a1.6 1.6 0 0 0 1.6 1.6h.4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                {done === "yes" ? u(ui, "httpCopied", "Copied") : done === "no" ? u(ui, "httpCopyFail", "Copy failed") : u(ui, "httpCurl", "Copy as curl")}
              </button>
            )}
          </div>
          <Headers list={req.headers} ui={ui} all={sx.on} />
          <Body text={req.body} tree={data.reqTree} all={sx.on} />
        </section>
      )}
      {req && res && <div className="http-arrow" aria-hidden="true"><svg viewBox="0 0 16 22" width="16" height="22"><path d="M8 1v17m0 0-5-5m5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
      {res && (
        <section className="http-msg http-res" aria-label={u(ui, "httpResponse", "Response")}>
          <div className="http-line">
            <span className={`http-status tone-${statusClass(res.status)}`} data-class={`${Math.floor(res.status / 100)}xx`} data-dh-slot="status"><b>{res.status}</b>{res.reason && <span>{res.reason}</span>}</span>
            <span className="http-ver">{res.version}</span>
          </div>
          <Headers list={res.headers} ui={ui} all={sx.on} />
          <Body text={res.body} tree={data.resTree} all={sx.on} />
        </section>
      )}
    </div>
  );
}
