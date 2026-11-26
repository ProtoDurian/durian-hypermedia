// The data explorer (pass 11, DESIGN 8.2): a foldable tree, search, copy a path, a table view, and a jq-subset query box.
// Drawn at build time and hydrated. The reader's query runs on its own small budget (tools/jq.ts runReaderQuery), so a bad
// query shows "too much work: make it smaller" and the tab stays live.
import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { runReaderQuery, JQ_SUBSET, type J } from "../log/jq";

import { Budget, BudgetError } from "../../core/budget";
import type { PartViewProps } from "../types";
import { useSteps } from "../kit/view";
import type { ExploreData as D, ExploreCaps } from "./part";
const Context=createContext<D|null>(null);
const useData=()=>useContext(Context)!;
const fresh=(d:D)=>new Budget({steps:d.caps.steps,values:d.caps.values,chars:d.caps.chars},null,null,"the explore view");
const isObj = (v: J): v is { [k: string]: J } => !!v && typeof v === "object" && !Array.isArray(v);
const isCont = (v: J) => Array.isArray(v) || isObj(v);
const keyPath = (base: string, k: string | number) => (typeof k === "number" ? `${base}[${k}]` : /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? `${base}.${k}` : `${base}[${JSON.stringify(k)}]`);
const kindOf = (v: J) => (v === null ? "null" : typeof v === "boolean" ? "bool" : typeof v === "number" ? "number" : typeof v === "string" ? "string" : Array.isArray(v) ? "array" : "object");
const countOf = (v: J) => (Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : `${Object.keys(v as object).length} key${Object.keys(v as object).length === 1 ? "" : "s"}`);

// every path that holds the needle (key or scalar text), and every ancestor of one
function findMatches(roots: J[], needle: string, limits: ExploreCaps, budget: Budget): { hits: Set<string>; open: Set<string>; n: number; cut: boolean } {
  const hits = new Set<string>(), open = new Set<string>(); let seen = 0, cut = false;
  const walk = (v: J, path: string, key: string): boolean => {
    const cost=1+path.length+key.length+(typeof v==="string"?v.length:0);
    if(budget.steps+cost>budget.limits.steps){cut=true;return false;}
    budget.charge(cost);
    if (++seen > limits.searchNodes) { cut = true; return false; }
    let any = false;
    if (key && key.toLowerCase().includes(needle)) { hits.add(path); any = true; }
    if (Array.isArray(v)) { for(let i=0;i<v.length&&!cut;i++)if(walk(v[i],keyPath(path,i),String(i)))any=true; }
    else if (isObj(v)) for (const k of Object.keys(v)) { if(cut)break; if (walk(v[k], keyPath(path, k), k)) any = true; }
    else if (v !== null && String(v).toLowerCase().includes(needle)) { hits.add(path + "\u0000v"); any = true; }
    if (any && isCont(v)) open.add(path);
    return any;
  };
  roots.forEach((r, i) => walk(r, `#${i}`, ""));
  return { hits, open, n: [...hits].length, cut };
}

function Scalar({ v, hit }: { v: J; hit: boolean }) {
  const EXPLORER_LIMITS=useData().display;
  const kind = kindOf(v);
  let text = kind === "string" ? JSON.stringify(v) : String(v);
  const cut = text.length > EXPLORER_LIMITS.stringCut;
  if (cut) text = text.slice(0, EXPLORER_LIMITS.stringCut) + "…";
  return <span className={`dx-v dx-${kind}${hit ? " is-hit" : ""}`} data-dh-slot="value" title={cut ? String(v) : undefined}>{text}</span>;
}

function Tree({ roots, search, hits, forced, copy }: { roots: J[]; search: string; hits: Set<string>; forced: Set<string>; copy: (p: string) => void }) {
  const d=useData(), EXPLORER_LIMITS=d.display, budget=fresh(d);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, number>>({});
  const isOpen = (path: string, depth: number) => forced.has(path) || (open[path] ?? depth < 2);
  const node = (k: string | number | null, v: J, path: string, depth: number): React.ReactNode => {
    budget.charge(1+path.length,1,path.length);
    const cont = isCont(v), o = cont && isOpen(path, depth);
    const keyHit = k !== null && hits.has(path);
    const label = k === null ? <span className="dx-root">{root(path)}</span> : <span className={`dx-k${keyHit ? " is-hit" : ""}`} data-dh-slot="key">{typeof k === "number" ? k : k}</span>;
    const shownPath = path.replace(/^#\d+/, "") || ".";
    const row = (
      <div className="dx-row" data-dh-slot="node">
        {cont ? <button type="button" className="dx-tog" aria-expanded={o} aria-label={`${o ? "Fold" : "Unfold"} ${shownPath}`} onClick={() => setOpen((s) => ({ ...s, [path]: !o }))}><span aria-hidden="true">{o ? "▾" : "▸"}</span></button> : <span className="dx-tog dx-leaf" aria-hidden="true" />}
        {label}<span className="dx-colon" aria-hidden="true">{k === null ? "" : ":"}</span>
        {cont ? <span className="dx-sum">{Array.isArray(v) ? "[" : "{"}{!o ? ` ${countOf(v)} ` : ""}{!o ? (Array.isArray(v) ? "]" : "}") : ""}{o && k !== null ? <span className="dx-count"> {countOf(v)}</span> : null}</span> : <Scalar v={v} hit={hits.has(path + "\u0000v")} />}
        <button type="button" className="dx-copy" data-dh-slot="path" aria-label={`Copy path ${shownPath}`} title={shownPath} onClick={() => copy(shownPath)}><svg className="dx-copy-i" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg><span className="dx-copy-t">{shownPath}</span></button>
      </div>
    );
    if (!cont || !o) return <li key={path} className="dx-li">{row}</li>;
    budget.charge(Array.isArray(v)?v.length:Object.keys(v as object).length);
    const entries: [string | number, J][] = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.keys(v as object).map((kk) => [kk, (v as any)[kk]]);
    const lim = EXPLORER_LIMITS.rowsPerNode + (more[path] ?? 0);
    return (
      <li key={path} className="dx-li">{row}
        <ul className="dx-ul" role="group">
          {entries.slice(0, lim).map(([kk, vv]) => node(kk, vv, keyPath(path, kk), depth + 1))}
          {entries.length > lim ? <li className="dx-li"><button type="button" className="dx-more" onClick={() => setMore((s) => ({ ...s, [path]: (s[path] ?? 0) + EXPLORER_LIMITS.rowsPerNode }))}>Show {Math.min(EXPLORER_LIMITS.rowsPerNode, entries.length - lim)} more of {entries.length - lim}</button></li> : null}
        </ul>
      </li>
    );
  };
  const root = (p: string) => (roots.length > 1 ? `result ${+p.slice(1) + 1}` : "");
  void search;
  try { return <ul className="dx-ul dx-tree" role="tree" data-dh-slot="tree">{roots.map((r, i) => node(null, r, `#${i}`, 0))}</ul>; }
  catch(e) { if(!(e instanceof BudgetError))throw e;return <p className="dx-err" role="alert">This tree needs too much work to draw. Use a query to show fewer values.</p>; }
}

function TableView({ rows }: { rows: { [k: string]: J }[] }) {
  const EXPLORER_LIMITS=useData().display;
  const cols = [...new Set(rows.slice(0, EXPLORER_LIMITS.tableRows).flatMap((r) => Object.keys(r)))].slice(0, EXPLORER_LIMITS.tableCols);
  const cell = (v: J) => (v === undefined ? "" : isCont(v) ? JSON.stringify(v) : String(v));
  return (
    <div className="dx-table-wrap" tabIndex={0} role="region" aria-label="Table view">
      <table className="dx-table"><thead><tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.slice(0, EXPLORER_LIMITS.tableRows).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className={`dx-${kindOf(r[c] ?? null)}`}>{cell(r[c])}</td>)}</tr>)}</tbody></table>
      {rows.length > EXPLORER_LIMITS.tableRows ? <p className="dx-note">The first {EXPLORER_LIMITS.tableRows} of {rows.length} rows.</p> : null}
    </div>
  );
}

const RAW_CHUNK = 1000;
/** The source as plain text: line numbers, no search, no query. Read only; the lines scroll sideways rather than wrap. */
export function RawView({ text, lang }: { text: string; lang: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const [shown, setShown] = useState(RAW_CHUNK);
  const width = String(lines.length).length;
  return (
    <div className="dx-raw" data-dh-slot="raw" role="region" tabIndex={0} aria-label={`Raw ${lang} source, ${lines.length} line${lines.length === 1 ? "" : "s"}`} style={{ ["--dx-gutter" as string]: `${width + 1}ch` }}>
      <ol className="dx-raw-ol">{lines.slice(0, shown).map((l, i) => <li key={i} className="dx-raw-li">{l || "\u200b"}</li>)}</ol>
      {lines.length > shown ? <button type="button" className="dx-more" onClick={() => setShown(shown + RAW_CHUNK)}>Show {Math.min(RAW_CHUNK, lines.length - shown)} more of {lines.length - shown} lines</button> : null}
    </div>
  );
}

function DataExplorer({ d, staticOn }: { d: D; staticOn: boolean }) {
  const uid = useId();
  const [view, setView] = useState<"rich" | "raw">("rich");
  const [q, setQ] = useState(d.query);
  const [search, setSearch] = useState("");
  const [table, setTable] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useMemo(() => (q.trim() ? runReaderQuery(q, d.value, d.caps) : null), [q, d.value]);
  const roots: J[] = run ? (run.ok ? run.results : []) : [d.value];
  const needle = search.trim().toLowerCase();
  const found = useMemo(() => (needle ? findMatches(roots, needle, d.display, fresh(d)) : null), [needle, run, d.value]);  // eslint-disable-line
  const copy = (p: string) => {
    try { navigator.clipboard?.writeText(p).then(() => setMsg(`Copied ${p}`), () => setMsg(`Path: ${p}`)); } catch { setMsg(`Path: ${p}`); }
    if (!navigator.clipboard) setMsg(`Path: ${p}`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2500);
  };
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const v = d.value;
  const starters = useMemo(() => {
    const s: string[] = [];
    if (Array.isArray(v)) s.push("length", ".[0]", "map(keys) | add | unique");
    else if (isObj(v)) { s.push("keys"); for (const k of Object.keys(v).slice(0, 3)) s.push(isCont(v[k]) ? `.${/^[A-Za-z_]\w*$/.test(k) ? k : `["${k}"]`} | length` : `.${/^[A-Za-z_]\w*$/.test(k) ? k : `["${k}"]`}`); }
    return s.slice(0, 4);
  }, [v]);
  const tableRows = roots.length === 1 && Array.isArray(roots[0]) && roots[0].length > 1 && (roots[0] as J[]).every(isObj) ? (roots[0] as { [k: string]: J }[]) : null;
  const err = run && !run.ok ? run : null;
  return (
    <div className="dx" data-lang={d.lang} data-dh-static={staticOn || undefined}>
      <div className="dx-head">{d.title ? <span className="dx-title">{d.title}</span> : null}<span className="chip dx-lang">{d.lang}</span>
        <div className="dx-switch" role="group" aria-label="View" data-dh-slot="switch">
          <button type="button" className="dx-sw" aria-pressed={view === "rich"} onClick={() => setView("rich")}>Rich</button>
          <button type="button" className="dx-sw" aria-pressed={view === "raw"} onClick={() => setView("raw")}>Raw</button>
        </div></div>
      {view === "raw" ? <RawView text={d.raw} lang={d.lang} /> : <>
      <div className="dx-q" data-dh-slot="query">
        <label className="dx-lab" htmlFor={`${uid}q`}>jq</label>
        <input id={`${uid}q`} className="dx-input" type="text" spellCheck={false} autoCapitalize="off" autoComplete="off" value={q} placeholder="a jq query, like  .items[] | select(.n > 1)" maxLength={d.caps.readerQueryChars} onChange={(e) => setQ(e.target.value)} aria-describedby={`${uid}h`} />
        {q ? <button type="button" className="dx-btn" onClick={() => setQ("")} aria-label="Clear the query">Clear</button> : null}
      </div>
      {starters.length ? <div className="dx-chips" role="group" aria-label="Starter queries">{starters.map((s) => <button key={s} type="button" className="dx-chip" onClick={() => setQ(s)}>{s}</button>)}</div> : null}
      <div className="dx-status" id={`${uid}h`} role="status" aria-live="polite" data-dh-slot="result">
        {err ? <span className={`dx-err dx-err-${err.kind}`}>{err.message}</span> : run ? <span>{roots.length} result{roots.length === 1 ? "" : "s"}</span> : <span>Type a jq query to look inside the data.</span>}
      </div>
      <div className="dx-tools">
        <input className="dx-input dx-search" type="search" aria-label="Search keys and values" placeholder="Search keys and values" value={search} onChange={(e) => setSearch(e.target.value)} />
        {found ? <span className="dx-count-hits" role="status">{found.n} match{found.n === 1 ? "" : "es"}{found.cut ? " (stopped early)" : ""}</span> : null}
        {tableRows ? <button type="button" className="dx-btn" aria-pressed={table} onClick={() => setTable(!table)}>{table ? "Tree" : "Table"}</button> : null}
      </div>
      <div className="dx-body">
        {err ? null : table && tableRows ? <TableView rows={tableRows} /> : roots.length ? <Tree roots={roots} search={needle} hits={found?.hits ?? new Set()} forced={found?.open ?? new Set()} copy={copy} /> : <p className="dx-note">The query gives no result.</p>}
      </div>
      <div className="dx-copied" role="status" aria-live="polite">{msg}</div>
      <details className="dx-subset"><summary>What the query box understands (jq subset)</summary><p><b>Has:</b> {JQ_SUBSET.has}.</p><p><b>Missing:</b> {JQ_SUBSET.lacks}.</p></details>
      </>}
    </div>
  );
}

export default function ExploreView({data,static:stp}:PartViewProps<D>){const {sx}=useSteps(0,stp);return <Context.Provider value={data}><DataExplorer d={data} staticOn={sx.on}/></Context.Provider>;}
