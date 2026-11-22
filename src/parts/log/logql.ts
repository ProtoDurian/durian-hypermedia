// The "LogQL subset" of the log view (pass 11, helper "data"): the query half of Grafana Loki's LogQL, our own reader.
// It runs at parse time (the author's `filter=` and `@highlight` lines) and in the browser (the reader's filter box),
// each reader query on its own budget (tools/budget.ts). No metric queries.
//
// Supported:
//   a stream selector   {level="error", app=~"shop|cart", env!="dev"}   (labels and the fields read from each line)
//   line filters        |= "text"   != "text"   |~ "regex"   !~ "regex"    (regex: tools/re.ts, never backtracks)
//   parsers             | json   | logfmt                                 (accepted; fields are always read)
//   label filters       | status >= 500   | duration > 2s   | path =~ "/cart.*"   | level="error" and status=500   (and, or, a comma)
//   plain words         a box that starts with neither { nor | means  |= "words"
// Not supported (said by name): metric queries (rate, count_over_time, sum by ...), line_format, label_format, unwrap, pattern, regexp,
//   unpack, drop, keep, decolorize, ip(), and the `by` / `without` clauses.
import { BudgetError, type Budget } from "../../core/budget";
import { DEFAULT_CAPS, type QueryCaps } from "./query";
import { compileRegex, RegexError, type Re } from "./re";

export interface Entry { n: number; time: string | null; level: string | null; msg: string; raw: string; fields: Record<string, string>; repeat: number }
export type Matcher = { name: string; op: "=" | "!=" | "=~" | "!~"; value: string; re?: Re };
export type Cond = { name: string; op: "=" | "!=" | "=~" | "!~" | ">" | ">=" | "<" | "<="; value: string; re?: Re };
export type Stage =
  | { k: "line"; op: "|=" | "!=" | "|~" | "!~"; value: string; re?: Re }
  | { k: "parse"; name: "json" | "logfmt" }
  | { k: "label"; any: Cond[][] };   // an or of ands
export interface LogQuery { selector: Matcher[]; stages: Stage[]; source: string }
export class LogQLError extends Error { constructor(msg: string, public at: number) { super(msg); } }

const unsup = (what: string, at: number): never => { throw new LogQLError(`LogQL subset: ${what} is not supported`, at); };
const UNSUPPORTED_STAGES = ["line_format", "label_format", "unwrap", "pattern", "regexp", "unpack", "drop", "keep", "decolorize", "ip", "distinct"];
const METRIC = ["rate", "count_over_time", "bytes_over_time", "bytes_rate", "sum", "avg", "min", "max", "count", "topk", "bottomk", "stddev", "stdvar", "quantile_over_time", "absent_over_time", "sort", "sort_desc", "label_replace", "vector", "rate_counter", "first_over_time", "last_over_time"];

export function parseLogQL(src: string, budget?: Budget, caps: QueryCaps = DEFAULT_CAPS): LogQuery {
  budget?.charge(src.length);
  if(src.length>caps.maxQueryChars) throw new LogQLError(`LogQL: the query is too long (${caps.maxQueryChars} characters at most)`,0);
  let p = 0;
  const err = (msg: string, at = p): never => { throw new LogQLError(`LogQL: ${msg} (at character ${at + 1})`, at); };
  const ws = () => { while (p < src.length && /\s/.test(src[p])) p++; };
  const ident = () => { const m = src.slice(p).match(/^[A-Za-z_][A-Za-z0-9_.]*/); if (!m) return err("expected a label name"); p += m[0].length; return m[0]; };
  const str = (): string => {
    ws();
    const q = src[p];
    if (q !== '"' && q !== "`") return err('expected a quoted string like "text"');
    p++; let out = "";
    for (;;) {
    budget?.charge(1);
      if (p >= src.length) return err("a string is never closed");
      const c = src[p++];
      if (c === q) break;
      if (q === '"' && c === "\\") { const e = src[p++]; const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" }; out += e in map ? map[e] : "\\" + e; continue; }
      out += c;
    }
    return out;
  };
  const rx = (v: string, at: number): Re => { try { return compileRegex(v, "", caps, budget); } catch (e) { if (e instanceof RegexError) return err(e.message, at); throw e; } };
  const q: LogQuery = { selector: [], stages: [], source: src };
  ws();
  if (!src.trim()) return q;
  // a box that starts with neither { nor | (and no metric word) is plain words
  const first = src.trimStart();
  const word = first.match(/^([A-Za-z_]+)\s*(\(|by\b|without\b)/);
  if (word && METRIC.includes(word[1])) unsup(`\`${word[1]}(...)\` (a metric query; the log view filters lines)`, p);
  if (first[0] !== "{" && first[0] !== "|" && first[0] !== "!") { q.stages.push({ k: "line", op: "|=", value: src.trim() }); return q; }
  if (src[p] === "{") {
    p++;
    for (;;) {
    budget?.charge(1);
      ws();
      if (src[p] === "}") { p++; break; }
      const name = ident(); ws();
      const at = p;
      const op = src.startsWith("=~", p) ? "=~" : src.startsWith("!~", p) ? "!~" : src.startsWith("!=", p) ? "!=" : src[p] === "=" ? "=" : null;
      if (!op) return err(`expected =, !=, =~ or !~ after ${name}`);
      p += op.length;
      const value = str();
      q.selector.push({ name, op, value, re: op === "=~" || op === "!~" ? rx(`^(?:${value})$`, at) : undefined });
      ws();
      if (src[p] === ",") { p++; continue; }
      if (src[p] === "}") { p++; break; }
      return err('expected "," or "}" in the stream selector');
    }
  }
  const cmpOps = ["==", "=~", "!~", "!=", ">=", "<=", ">", "<", "="] as const;
  const cond = (): Cond => {
    ws(); const name = ident(); ws();
    const at = p;
    const op = cmpOps.find((o) => src.startsWith(o, p));
    if (!op) return err(`expected a comparison after ${name} (=, !=, >, >=, <, <=, =~, !~)`);
    p += op.length;
    ws();
    let value: string;
    if (src[p] === '"' || src[p] === "`") value = str();
    else { const m = src.slice(p).match(/^-?[0-9][0-9a-zA-Z_.µ]*/); if (!m) return err(`expected a number, a duration like 2s, or a quoted string after ${name} ${op}`); value = m[0]; p += m[0].length; }
    const o = op === "==" ? "=" : op;
    const c: Cond = { name, op: o, value };
    if (o === "=~" || o === "!~") c.re = rx(`^(?:${value})$`, at);
    return c;
  };
  for (;;) {
    budget?.charge(1);
    ws();
    if (p >= src.length) break;
    if (src.startsWith("|=", p) || src.startsWith("|~", p) || src.startsWith("!=", p) || src.startsWith("!~", p)) {
      const op = src.slice(p, p + 2) as "|=" | "!=" | "|~" | "!~"; const at = p; p += 2;
      const value = str();
      q.stages.push({ k: "line", op, value, re: op === "|~" || op === "!~" ? rx(value, at) : undefined });
      continue;
    }
    if (src[p] === "|") {
      p++; ws();
      const w = src.slice(p).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? "";
      if (w === "json" || w === "logfmt") { p += w.length; ws(); if (src[p] === "-") return unsup(`\`| ${w}\` with flags`, p); q.stages.push({ k: "parse", name: w }); if (/^[A-Za-z_]/.test(src.slice(p)) && /^[A-Za-z_]+\s*(=|,)/.test(src.slice(p))) unsup(`\`| ${w}\` with named fields`, p); continue; }
      if (UNSUPPORTED_STAGES.includes(w)) unsup(`\`| ${w}\``, p);
      if (!w) return err("expected a stage after |: json, logfmt, or a label filter like status >= 500");
      // a label filter: conds joined by and / or / a comma
      const ors: Cond[][] = [[]];
      for (;;) {
    budget?.charge(1);
        ors[ors.length - 1].push(cond()); ws();
        const rest = src.slice(p);
        if (/^and\b/.test(rest)) { p += 3; continue; }
        if (rest[0] === ",") { p++; continue; }
        if (/^or\b/.test(rest)) { p += 2; ors.push([]); continue; }
        break;
      }
      q.stages.push({ k: "label", any: ors });
      continue;
    }
    if (src[p] === "{") return err("a stream selector { } comes first, before the stages");
    return err(`unexpected "${src[p]}"; a stage starts with |=, !=, |~, !~ or |`);
  }
  return q;
}

// ------------------------------------------------------------ running
const DUR: Record<string, number> = { ns: 1e-9, us: 1e-6, "µs": 1e-6, ms: 1e-3, s: 1, m: 60, h: 3600, d: 86400 };
/** "2s", "350ms", "1m30s" to seconds; null when it is not a duration */
export function durationOf(s:string):number|null { let i=0,t=0; while(i<s.length){const start=i;while(i<s.length && s[i]>="0" && s[i]<="9")i++;if(i===start)return null;if(s[i]==="."){i++;const p=i;while(i<s.length && s[i]>="0" && s[i]<="9")i++;if(i===p)return null;}const n=Number(s.slice(start,i)),u=i;while(i<s.length && "nsuµmhd".includes(s[i]))i++;const unit=s.slice(u,i);if(!Object.hasOwn(DUR,unit))return null;t+=n*DUR[unit];}return i?t:null;}
const BYTES: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
function bytesOf(s: string): number | null { const m = s.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|kib|mib|gib)$/); return m ? Number(m[1]) * BYTES[m[2]] : null; }
function numeric(s: string): number | null { if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s)) return Number(s); return durationOf(s) ?? bytesOf(s); }

const field = (record: Record<string,string>, name:string):string|undefined => Object.prototype.hasOwnProperty.call(record,name)?record[name]:undefined;
const valueOf = (e: Entry, name: string): string | undefined => (name === "level" ? e.level ?? field(e.fields,"level") : name === "message" || name === "msg" ? field(e.fields,name) ?? e.msg : field(e.fields,name));
function selMatch(m: Matcher, e: Entry, labels: Record<string, string>, budget: Budget): boolean {
  const v = field(labels,m.name) ?? valueOf(e, m.name) ?? "";
  switch (m.op) {
    case "=": return v === m.value; case "!=": return v !== m.value;
    case "=~": return m.re!.test(v, budget); default: return !m.re!.test(v, budget);
  }
}
function condMatch(c: Cond, e: Entry, labels: Record<string, string>, budget: Budget): boolean {
  const v = field(labels,c.name) ?? valueOf(e, c.name);
  if (v === undefined) return c.op === "!=" || c.op === "!~";   // a missing label: only the negative forms hold
  switch (c.op) {
    case "=": return v === c.value || (numeric(v) !== null && numeric(c.value) !== null && numeric(v) === numeric(c.value) && /^-?\d/.test(c.value));
    case "!=": return !condMatch({ ...c, op: "=" }, e, labels, budget);
    case "=~": return c.re!.test(v, budget);
    case "!~": return !c.re!.test(v, budget);
    default: {
      const a = numeric(v), b = numeric(c.value);
      if (a === null || b === null) return false;
      return c.op === ">" ? a > b : c.op === ">=" ? a >= b : c.op === "<" ? a < b : a <= b;
    }
  }
}
export interface Outcome { keep: boolean[]; marks: [number, number][][]; matched: number }
/** run a parsed query over entries (stream labels are the same for every line); `marks` are the matched words per entry (positive line filters) */
export function runLogQL(q: LogQuery, entries: Entry[], labels: Record<string, string>, budget: Budget): Outcome {
  const keep: boolean[] = new Array(entries.length), marks: [number, number][][] = new Array(entries.length);
  let matched = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    budget.charge(1 + e.raw.length * (1 + q.stages.length + q.selector.length));
    let ok = q.selector.every((m) => selMatch(m, e, labels, budget));
    const spans: [number, number][] = [];
    for (const s of q.stages) {
      if (!ok) break;
      if (s.k === "line") {
        if (s.op === "|=" || s.op === "!=") {
          const at = e.raw.indexOf(s.value);
          if (s.op === "|=") { if (at < 0) ok = false; else for (let from = at; from >= 0 && spans.length < 20; from = e.raw.indexOf(s.value, from + Math.max(1, s.value.length))) spans.push([from, from + s.value.length]); }
          else if (at >= 0) ok = false;
        } else {
          const m = s.re!.exec(e.raw, budget);
          if (s.op === "|~") { if (!m) ok = false; else spans.push([m.start, m.end]); } else if (m) ok = false;
        }
      } else if (s.k === "label") ok = s.any.some((ands) => ands.every((c) => condMatch(c, e, labels, budget)));
    }
    keep[i] = ok; marks[i] = ok ? spans : [];
    if (ok) matched++;
  }
  return { keep, marks, matched };
}
/** a reader's filter: parse + run, with plain-words problems instead of exceptions */
export function filterEntries(src: string, entries: Entry[], labels: Record<string, string>, budget: Budget, caps: QueryCaps = DEFAULT_CAPS): { ok: true; out: Outcome } | { ok: false; message: string } {
  try { return { ok: true, out: runLogQL(parseLogQL(src, budget, caps), entries, labels, budget) }; }
  catch (e: any) {
    if (e instanceof BudgetError) return { ok: false, message: "too much work: make it smaller" };
    if (e instanceof LogQLError) return { ok: false, message: e.message };
    throw e;
  }
}
