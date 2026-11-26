// The log view (pass 11, DESIGN 8.3): levels coloured by token, a LogQL filter box (reader queries on their own budget),
// level chips, and the author's highlights (a lit edge, a reason chip, a list that jumps to each).
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterEntries, type Entry } from "./logql";
import { Budget } from "../../core/budget";
import type { PartViewProps } from "../types";
import { useSteps } from "../kit/view";
import type { QueryCaps } from "./query";


type Hl = { text: string; kind: "filter" | "lines"; query?: string; from?: number; to?: number; colour: string; why: string; matched: number[] };
type E = Entry & { last?: number };
type D = { title: string; entries: E[]; labels: Record<string, string>; highlights: Hl[]; filter: string; lines: number; time: string; caps: QueryCaps };
const LEVELS = ["debug", "info", "warn", "error"];
// what a level word means to a reader (the key names only the levels that occur in the log)
const LEVEL_MEANS: Record<string, string> = { error: "something failed", warn: "worth a look", info: "normal progress", debug: "detail for developers" };
const LEVEL_RE = /\b(trace|debug|dbg|info|notice|warn|warning|error|err|fatal|panic|crit|critical)\b/i;

const rangeText = (ns: number[]) => { const o: string[] = []; let a = ns[0], b = ns[0]; for (let i = 1; i <= ns.length; i++) { if (ns[i] === b + 1) { b = ns[i]; continue; } o.push(a === b ? `${a}` : `${a}–${b}`); a = b = ns[i]; } return o.join(", "); };
const hlName = (h: Hl) => (h.kind === "lines" ? `line${h.to !== h.from ? "s" : ""} ${h.from}${h.to !== h.from ? `–${h.to}` : ""}` : `${h.matched.length > 1 ? "lines" : "line"} ${rangeText(h.matched) || "none"}`);
const shortTime = (t: string) => t.match(/(\d{2}:\d{2}:\d{2})/)?.[1] ?? t;
const ms = (t: string | null) => { if (!t) return NaN; if (/^\d{9,13}$/.test(t)) return t.length > 10 ? +t : +t * 1000; return Date.parse(t.replace(" ", "T").replace(",", ".")); };

// the line text as pieces: matched words and the level word get their own span
function pieces(body: string, marks: [number, number][], shift: number): React.ReactNode[] {
  type R = { a: number; b: number; cls: string };
  const rs: R[] = marks.map(([a, b]) => ({ a: a - shift, b: b - shift, cls: "lg-m" })).filter((r) => r.b > 0).map((r) => ({ ...r, a: Math.max(0, r.a) }));
  const lm = body.match(LEVEL_RE);
  if (lm && lm.index !== undefined && lm.index < 40) rs.push({ a: lm.index, b: lm.index + lm[0].length, cls: "lg-lv" });
  rs.sort((x, y) => x.a - y.a);
  const out: React.ReactNode[] = []; let at = 0, k = 0;
  for (const r of rs) {
    if (r.a < at) continue;
    if (r.a > at) out.push(body.slice(at, r.a));
    out.push(<span key={k++} className={r.cls}>{body.slice(r.a, r.b)}</span>);
    at = r.b;
  }
  if (at < body.length) out.push(body.slice(at));
  return out;
}

/** The key: what the colours and marks of this log mean. Only what occurs in this log is named. */
export function LogKey({ counts, highlights, folded, search }: { counts: Record<string, number>; highlights: Hl[]; folded: boolean; search: boolean }) {
  const levels = [...LEVELS, ...Object.keys(counts).filter((l) => !LEVELS.includes(l))].filter((l) => (counts[l] ?? 0) > 0);
  return (
    <div className="lg-key" role="group" aria-label="Key" data-dh-slot="key">
      <div className="lg-key-h">Key</div>
      <ul className="lg-key-list">
        {levels.map((l) => <li key={l} className="lg-key-i"><span className={`lg-key-lv lv-${l}`}>{l}</span><span className="lg-key-t">{LEVEL_MEANS[l] ?? "a line of this level"}</span></li>)}
        {highlights.map((h, i) => <li key={`h${i}`} className="lg-key-i"><span className={`lg-key-edge tone-${h.colour}`} aria-hidden="true" /><span className="lg-key-t"><b>Marked by the author</b>: {h.why}</span></li>)}
        {search ? <li className="lg-key-i"><span className="lg-key-mark lg-m">words</span><span className="lg-key-t">the words your search matched</span></li> : null}
        {folded ? <li className="lg-key-i"><span className="chip lg-rep">×3</span><span className="lg-key-t">the same line, repeated that many times in a row</span></li> : null}
      </ul>
    </div>
  );
}

export default function LogView({ data: d, static: stp }: PartViewProps<D>) {
  const {sx}=useSteps(0,stp);
  const uid = useId();
  const [filter, setFilter] = useState(d.filter);
  const [on, setOn] = useState<Record<string, boolean>>({ debug: true, info: true, warn: true, error: true });
  const [mode, setMode] = useState<"as-written" | "relative">(d.time === "relative" ? "relative" : "as-written");
  const [note, setNote] = useState<number | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const rows = useRef<Record<number, HTMLLIElement | null>>({});
  const res = useMemo(() => (filter.trim() ? filterEntries(filter, d.entries, d.labels, new Budget({steps:d.caps.steps,values:d.caps.values,chars:d.caps.chars},null,null,"the log query"), d.caps) : null), [filter, d]);
  const out = res && res.ok ? res.out : null;
  const lit = (e: E) => d.highlights.map((h, i) => ({ h, i })).filter(({ h }) => h.matched.some((n) => n >= e.n && n <= (e.last ?? e.n)));
  const counts: Record<string, number> = {}; for (const e of d.entries) { const l = e.level ?? "info"; counts[l] = (counts[l] ?? 0) + e.repeat; }
  const t0 = useMemo(() => { for (const e of d.entries) { const t = ms(e.time); if (!Number.isNaN(t)) return t; } return NaN; }, [d]);
  const shown = d.entries.map((e, i) => ({ e, i })).filter(({ e, i }) => (on[e.level ?? "info"] ?? true) && (!out || out.keep[i]));
  const hiddenBy = (e: E) => !(on[e.level ?? "info"] ?? true);
  useEffect(() => { if (jump !== null) { const el = rows.current[jump]; if (el) { el.scrollIntoView?.({ block: "center" }); el.focus?.(); } setJump(null); } }, [jump, shown.length]);
  const goto = (h: Hl) => {
    const n = h.matched[0]; if (n === undefined) return;
    const e = d.entries.find((x) => n >= x.n && n <= (x.last ?? x.n))!;
    if (hiddenBy(e) || (out && !out.keep[d.entries.indexOf(e)])) { setFilter(""); setOn({ debug: true, info: true, warn: true, error: true }); }
    setJump(e.n);
  };
  const timeText = (e: E) => {
    if (!e.time) return "";
    if (mode === "relative") { const t = ms(e.time); if (!Number.isNaN(t) && !Number.isNaN(t0)) return `+${((t - t0) / 1000).toFixed(t - t0 < 10000 ? 2 : 1)}s`; }
    return e.time;
  };
  return (
    <div className="lg" data-dh-static={sx.on || undefined}>
      <div className="lg-head">{d.title ? <span className="lg-title">{d.title}</span> : null}{Object.entries(d.labels).map(([k, v]) => <span key={k} className="chip lg-label">{k}={v}</span>)}</div>
      {d.highlights.length ? (
        <div className="lg-hls" data-dh-slot="highlight">
          <div className="lg-hls-h">Highlights</div>
          <ol className="lg-hl-list">{d.highlights.map((h, i) => (
            <li key={i}><button type="button" className={`lg-hl tone-${h.colour}`} aria-pressed={note === i} onClick={() => { setNote(note === i ? null : i); goto(h); }}><b>{hlName(h)}</b> {h.why}</button></li>
          ))}</ol>
          {note !== null ? <div className="lg-note" role="status" aria-live="polite"><b>{hlName(d.highlights[note])}</b> {d.highlights[note].kind === "filter" ? <code>{d.highlights[note].query}</code> : null} {d.highlights[note].why}</div> : null}
        </div>
      ) : null}
      <div className="lg-bar" data-dh-slot="filter">
        <label className="lg-lab" htmlFor={`${uid}f`}>LogQL</label>
        <input id={`${uid}f`} className="lg-input" type="text" spellCheck={false} autoCapitalize="off" autoComplete="off" value={filter} onChange={(e) => setFilter(e.target.value)} maxLength={d.caps.readerQueryChars} placeholder={'{level="error"} |= "timeout"   or just words'} aria-describedby={`${uid}s`} />
        {filter ? <button type="button" className="lg-btn" onClick={() => setFilter("")} aria-label="Clear the filter">Clear</button> : null}
      </div>
      <div className="lg-bar2">
        <div className="lg-levels" role="group" aria-label="Levels" data-dh-slot="levels">{LEVELS.map((l) => (
          <button key={l} type="button" className={`lg-lvbtn lv-${l}`} aria-pressed={on[l]} onClick={() => setOn((s) => ({ ...s, [l]: !s[l] }))}>{l} <span className="lg-n">{counts[l] ?? 0}</span></button>
        ))}</div>
        <button type="button" className="lg-btn" aria-pressed={mode === "relative"} onClick={() => setMode(mode === "relative" ? "as-written" : "relative")}>{mode === "relative" ? "Times: from the first line" : "Times: as written"}</button>
      </div>
      <div id={`${uid}s`} className="lg-status" role="status" aria-live="polite">
        {res && !res.ok ? <span className="lg-err">{res.message}</span> : <span>{shown.reduce((n, { e }) => n + e.repeat, 0)} of {d.lines} lines{out ? ` match ${filter.trim()}` : ""}</span>}
      </div>
      <ol className="lg-lines" data-dh-slot="lines" start={1}>
        {shown.map(({ e, i }) => {
          const hl = lit(e); const cut = e.time ? e.raw.indexOf(e.time) + e.time.length : 0;
          const body = e.raw.slice(cut).replace(/^\s+/, ""); const shift = e.raw.length - body.length;
          return (
            <li key={e.n} ref={(el) => { rows.current[e.n] = el; }} tabIndex={0} data-trace={e.fields.trace} data-span={e.fields.span} className={`lg-line lv-${e.level ?? "info"}${hl.length ? ` is-lit tone-${hl[0].h.colour}` : ""}`} data-n={e.n} data-hl={hl.length ? hl[0].h.colour : undefined}>
              <span className="lg-no" data-dh-slot="time">{e.n}{e.last && e.last !== e.n ? `–${e.last}` : ""}</span>
              {e.time ? <span className="lg-time"><span className="lg-t-full">{timeText(e)}</span><span className="lg-t-short">{mode === "relative" ? timeText(e) : shortTime(e.time)}</span></span> : null}
              <span className="lg-msg" data-dh-slot="message">{pieces(body, out?.marks[i] ?? [], shift)}</span>
              {e.repeat > 1 ? <span className="chip lg-rep" data-dh-slot="fold" title={`lines ${e.n}–${e.last}`}>×{e.repeat}</span> : null}
              {e.fields.span ? <button type="button" className="lg-trace-link" data-dh-slot="trace-link" aria-label={`Show span ${e.fields.span} in the trace`} onClick={() => document.dispatchEvent(new CustomEvent("dh-trace-focus", { detail: { trace: e.fields.trace ?? "", span: e.fields.span } }))}>Show span</button> : null}
              {hl.map(({ h, i: hi }) => <button key={hi} type="button" className={`lg-why tone-${h.colour}`} aria-label={`Highlight: ${h.why}`} onClick={() => setNote(note === hi ? null : hi)}>{h.why}</button>)}
            </li>
          );
        })}
      </ol>
      <LogKey counts={counts} highlights={d.highlights} folded={d.entries.some((e) => e.repeat > 1)} search={!sx.on} />
      {!shown.length ? <p className="lg-empty">No line matches. Clear the filter or turn a level back on.</p> : null}
      <details className="lg-subset"><summary>What the filter understands (LogQL subset)</summary>
        <p><b>Has:</b> a selector {"{"}level="error", app=~"shop|cart"{"}"} over the labels and the fields of each line; line filters |= != |~ !~ ; | json and | logfmt; field filters like | status &gt;= 500 and | duration &gt; 2s (joined by and, or, a comma). Plain words mean |= "words".</p>
        <p><b>Missing:</b> metric queries (rate, count_over_time, sum by ...), line_format, label_format, unwrap, pattern, regexp, unpack, drop, keep.</p></details>
    </div>
  );
}
