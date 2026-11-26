// The http part's view (format version 11): a request and its response as two cards. A method chip and the address (the
// query split into names and values the reader can edit), the headers and the body as sections that open and close (a
// short one starts open, a long one closed), the body as a JSON tree that folds, the status as a chip coloured by its
// class, and Copy as curl for the request as edited (nothing is sent: it is a reading aid). Static draws the whole message:
// every header, the whole tree, no section button, no field, no copy button.
// Every element is a React element; the copy button writes through the clipboard API only.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useStatic } from "../kit/static";
import { cx } from "../kit/view";
import type { PartViewProps } from "../types";
import type { Header, HttpData, JNode } from "./part";
import { OPEN_BODY_ROWS, OPEN_HEADERS, bodyRows, curlOf, editedReq, splitTarget, statusClass } from "./part";

const PARAMS = 200, FIELD_MAX = 1000;
const METHOD_TONE: Record<string, string> = { GET: "c2", HEAD: "c2", QUERY: "c2", POST: "c1", PUT: "c3", PATCH: "c4", DELETE: "c7", OPTIONS: "c6", TRACE: "c6", CONNECT: "c6" };
// a label the host's translation may override (ui.<key>), else the English one
const u = (ui: unknown, key: string, d: string): string => ((ui as Record<string, string> | undefined)?.[key]) ?? d;
const W = { cannot: "This message cannot be drawn:", body: "Body" };

type Edits = Record<number, string>;
/** a text field that looks like the text it replaces: as wide as its words (mono font, so ch is exact) */
function Field({ value, label, onChange, grow }: { value: string; label: string; onChange: (v: string) => void; grow?: boolean }) {
  return <input type="text" className={cx("http-edit", grow && "is-grow")} value={value} aria-label={label} spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={FIELD_MAX} onChange={(e) => onChange(e.target.value)} style={grow ? undefined : { width: `${Math.max(3, value.length + 1)}ch` }} />;
}

function UrlView({ target, host, edit, on, onEdit }: { target: string; host?: string; edit: Edits; on: boolean; onEdit: (i: number, v: string) => void }) {
  const { head, params } = splitTarget(target);
  return (
    <span className="http-url" data-dh-slot="request-line">
      {host && !target.toLowerCase().startsWith("http") && <span className="http-host">{host}</span>}
      <span className="http-path">{head}</span>
      {params.length > 0 && (
        <span className="http-q">?{params.slice(0, PARAMS).map((p, i) => <span key={i}>{i ? <i>&amp;</i> : null}<b>{p.name}</b>{p.value === null ? null : <>=<em>{on ? <Field value={i in edit ? edit[i] : p.value} label={`Value of ${p.name}`} onChange={(v) => onEdit(i, v)} /> : p.value}</em></>}</span>)}{params.length > PARAMS ? "&…" : null}</span>
      )}
    </span>
  );
}

/** A part of a message that opens and closes: a button with its name and size, and the content under it. Static: the content alone. */
function Section({ name, size, open: start, on, children }: { name: string; size: string; open: boolean; on: boolean; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(start);
  if (!on) return <>{children}</>;
  return (
    <div className={cx("http-sec", open && "is-open")}>
      <button type="button" className="http-sec-h" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span className={cx("chev", open && "is-open")} aria-hidden="true" /><span className="http-sec-t">{name}</span><span className="http-sec-n">{size}</span></button>
      <div id={id} className="http-sec-b" hidden={!open}>{children}</div>
    </div>
  );
}

function Headers({ list, edit, onEdit, on }: { list: Header[]; edit?: Edits; onEdit?: (i: number, v: string) => void; on: boolean }) {
  return (
    <div className="http-heads" data-dh-slot="headers">
      <dl>{list.map((h, i) => <div key={i}><dt>{h.name}</dt><dd>{on && edit && onEdit ? <Field grow value={i in edit ? edit[i] : h.value} label={`Value of the ${h.name} header`} onChange={(v) => onEdit(i, v)} /> : h.value}</dd></div>)}</dl>
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

const CopyIcon = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8.5" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 3.5v-.4A1.6 1.6 0 0 0 8.9 1.5H3.6A1.6 1.6 0 0 0 2 3.1v6.3a1.6 1.6 0 0 0 1.6 1.6h.4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;

export default function HttpView({ data, ui, static: stp }: PartViewProps<HttpData>) {
  const sx = useStatic(stp, 0);
  const [done, setDone] = useState<"" | "yes" | "no">("");
  const [qEdit, setQEdit] = useState<Edits>({});
  const [hEdit, setHEdit] = useState<Edits>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const req0 = data.req;
  // the request as the reader has edited it, and its curl (the author's own when nothing is edited)
  const dirty = Object.keys(qEdit).length + Object.keys(hEdit).length > 0;
  const req = useMemo(() => (req0 && dirty ? editedReq(req0, qEdit, hEdit) : req0), [req0, dirty, qEdit, hEdit]);
  const curl = useMemo(() => (!req0 ? null : dirty && req ? curlOf(req) : data.curl), [req0, req, dirty, data.curl]);
  if (data.plain) {
    return (
      <div className="http http-plain" data-dh-static={sx.on || undefined}>
        {data.errors[0] && <div className="cw-error">{W.cannot} {data.errors[0].msg}</div>}
        {data.src && <pre className="http-src" tabIndex={0}>{data.src}</pre>}
      </div>
    );
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(curl!); setDone("yes"); } catch { setDone("no"); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(""), 1800);
  };
  const res = data.res;
  const live = !sx.on;
  const host = req0?.headers.find((h) => h.name.toLowerCase() === "host")?.value;
  const setQ = (i: number, v: string) => setQEdit((e) => ({ ...e, [i]: v }));
  const setH = (i: number, v: string) => setHEdit((e) => ({ ...e, [i]: v }));
  const rows = (b: string, t: JNode | null) => bodyRows(b, t);
  const lines = (n: number) => `${n} ${n === 1 ? u(ui, "httpRow", "row") : u(ui, "httpRows", "rows")}`;
  return (
    <div className="http" data-dh-static={sx.on || undefined}>
      {data.title && <div className="http-title">{data.title}</div>}
      {req && req0 && (
        <section className="http-msg http-req" aria-label={u(ui, "httpRequest", "Request")}>
          <div className="http-line">
            <span className={`http-method tone-${METHOD_TONE[req.method] ?? "c1"}`} data-method={req.method.toLowerCase()}>{req.method}</span>
            <UrlView target={req0.target} host={host} edit={qEdit} on={live} onEdit={setQ} />
            <span className="http-ver">{req.version}</span>
            {curl && live && (
              <span className="http-acts">
                {dirty && <button type="button" className="http-reset" onClick={() => { setQEdit({}); setHEdit({}); }}>{u(ui, "httpReset", "Reset edits")}</button>}
                <button type="button" className="http-copy" onClick={copy} aria-live="polite"><CopyIcon />{done === "yes" ? u(ui, "httpCopied", "Copied") : done === "no" ? u(ui, "httpCopyFail", "Copy failed") : u(ui, "httpCurl", "Copy as curl")}</button>
              </span>
            )}
          </div>
          {live && (req0.headers.length > 0 || req0.target.includes("?")) && <p className="http-hint">{u(ui, "httpHint", "Values are editable: the address and the curl follow. Nothing is sent.")}</p>}
          {req.headers.length > 0 && <Section name={u(ui, "httpHeaders", "Headers")} size={String(req.headers.length)} open={req.headers.length <= OPEN_HEADERS} on={live}><Headers list={req0.headers} edit={hEdit} onEdit={setH} on={live} /></Section>}
          {req.body && <Section name={u(ui, "httpBody", "Body")} size={lines(rows(req.body, data.reqTree))} open={rows(req.body, data.reqTree) <= OPEN_BODY_ROWS} on={live}><Body text={req.body} tree={data.reqTree} all={sx.on} /></Section>}
          {curl && live && <Section name="curl" size={u(ui, "httpCurlSize", "as edited")} open={false} on={live}><pre className="http-curl" tabIndex={0} aria-label="curl command" data-dh-slot="curl">{curl}</pre></Section>}
        </section>
      )}
      {req && res && <div className="http-arrow" aria-hidden="true"><svg viewBox="0 0 16 22" width="16" height="22"><path d="M8 1v17m0 0-5-5m5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
      {res && (
        <section className="http-msg http-res" aria-label={u(ui, "httpResponse", "Response")}>
          <div className="http-line">
            <span className={`http-status tone-${statusClass(res.status)}`} data-class={`${Math.floor(res.status / 100)}xx`} data-dh-slot="status"><b>{res.status}</b>{res.reason && <span>{res.reason}</span>}</span>
            <span className="http-ver">{res.version}</span>
          </div>
          {res.headers.length > 0 && <Section name={u(ui, "httpHeaders", "Headers")} size={String(res.headers.length)} open={res.headers.length <= OPEN_HEADERS} on={live}><Headers list={res.headers} on={false} /></Section>}
          {res.body && <Section name={u(ui, "httpBody", "Body")} size={lines(rows(res.body, data.resTree))} open={rows(res.body, data.resTree) <= OPEN_BODY_ROWS} on={live}><Body text={res.body} tree={data.resTree} all={sx.on} /></Section>}
        </section>
      )}
    </div>
  );
}
