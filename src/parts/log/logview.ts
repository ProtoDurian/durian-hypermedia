// The log view part (pass 11, helper "data"): reading a log body, its @highlight lines, and its LLM view.
// Shared by the parser (dh-lib, doccheck) and the page. Line reading charges the document's budget.
import { type Budget } from "../../core/budget";
import { LogQLError, parseLogQL, runLogQL, type Entry, type LogQuery } from "./logql";

import { LIMITS } from "./limits";
import { DEFAULT_CAPS, type QueryCaps } from "./query";
export const LOG_KEYS = ["id", "title", "labels", "filter", "llm", "fold", "time", "static"];
export const HL_COLOURS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "acc", "good", "warn", "bad", "muted"];
export const LEVELS = ["debug", "info", "warn", "error"];
const LEVEL_WORDS: Record<string, string> = { trace: "debug", debug: "debug", dbg: "debug", info: "info", notice: "info", warn: "warn", warning: "warn", error: "error", err: "error", fatal: "error", panic: "error", crit: "error", critical: "error" };

export interface Highlight { line: number; text: string; kind: "filter" | "lines"; query?: string; from?: number; to?: number; colour: string; why: string; matched: number[] }
export interface LogSpec { entries: Entry[]; labels: Record<string, string>; highlights: Highlight[]; errors: { line: number; msg: string }[]; filter: string; lines: number }

const TIME_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{2}:\d{2}:\d{2}(?:[.,]\d+)?|\d{9,13})\s+/;
const PAIR_RE = /^([A-Za-z_][\w.\-]*)=("(?:[^"\\]|\\.)*"|\S*)/;

function logfmt(rest: string): { msg: string; fields: Record<string, string> } {
  const fields: Record<string, string> = Object.create(null);
  const words: string[] = [];
  let s = rest, seenPair = false;
  while (s.length) {
    const m = s.match(PAIR_RE);
    if (m) {
      seenPair = true;
      let v = m[2];
      if (v.startsWith('"')) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
      fields[m[1]] = v; s = s.slice(m[0].length).replace(/^\s+/, "");
    } else {
      const w = s.match(/^\S+\s*/)![0];
      if (!seenPair) words.push(w.trim());
      else if (!seenPair) words.push(w.trim());
      s = s.slice(w.length);
    }
  }
  return { msg: words.join(" "), fields };
}
function jsonLine(raw: string): Entry | null {
  if (!raw.startsWith("{")) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const fields: Record<string, string> = Object.create(null);
  for (const [k, v] of Object.entries(o)) fields[k] = typeof v === "string" ? v : JSON.stringify(v);
  const pick = (...ks: string[]) => { for (const k of ks) if (fields[k] !== undefined) { const v = fields[k]; delete fields[k]; return v; } return null; };
  const time = pick("time", "ts", "timestamp", "@timestamp", "t");
  const lv = pick("level", "lvl", "severity");
  const msg = pick("msg", "message") ?? "";
  return { n: 0, time, level: lv ? LEVEL_WORDS[lv.toLowerCase()] ?? lv.toLowerCase() : null, msg, raw, fields, repeat: 1 };
}
export function parseLogLine(raw: string, n: number): Entry {
  const j = jsonLine(raw);
  if (j) { j.n = n; return j; }
  let rest = raw, time: string | null = null, level: string | null = null;
  const t = rest.match(TIME_RE);
  if (t) { time = t[1]; rest = rest.slice(t[0].length); }
  const lm = rest.match(/^\[?([A-Za-z]+)\]?:?\s+/);
  if (lm && LEVEL_WORDS[lm[1].toLowerCase()]) { level = LEVEL_WORDS[lm[1].toLowerCase()]; rest = rest.slice(lm[0].length); }
  else { const kv = rest.match(/(?:^|\s)level=(\w+)/); if (kv && LEVEL_WORDS[kv[1].toLowerCase()]) level = LEVEL_WORDS[kv[1].toLowerCase()]; }
  const { msg, fields } = logfmt(rest);
  if (fields.level && LEVEL_WORDS[fields.level.toLowerCase()]) { level = level ?? LEVEL_WORDS[fields.level.toLowerCase()]; }
  if (!time && (fields.time || fields.ts)) time = fields.time ?? fields.ts;
  return { n, time, level, msg, raw, fields, repeat: 1 };
}

export function parseLabels(s: string | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  for (const part of (s ?? "").split(",")) { const m = part.trim().match(/^([A-Za-z_][\w.]*)\s*=\s*(.*)$/); if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, ""); }
  return out;
}

export function parseLog(body: string, bodyLine: number, attrs: Record<string, string>, budget: Budget, cap = LIMITS.logLines, caps: QueryCaps = DEFAULT_CAPS): LogSpec {
  const errors: { line: number; msg: string }[] = [];
  const entries: Entry[] = [], hls: { text: string; line: number }[] = [];
  const lines = body.split("\n");
  let n = 0;
  budget.charge(body.length, 0, body.length);
  lines.forEach((l, i) => {
    budget.charge(1+l.length,1);
    if (!l.trim()) return;
    if (/^@highlight\b/.test(l)) { hls.push({ text: l, line: bodyLine + i }); return; }
    n++;
    if (n > cap) return; // counted for the problem, never kept in the document
    budget.charge(1 + (l.length >> 6), 1);
    entries.push(parseLogLine(l.trim(), n));
    (entries[entries.length - 1] as any).src = bodyLine + i;
  });
  if (n > cap) errors.push({ line: bodyLine, msg: `log has ${n} lines; at most ${cap} (cut it, or keep the lines that matter)` });
  const kept = Math.min(n, cap);
  const labels = parseLabels(attrs.labels);
  const highlights: Highlight[] = [];
  for (const h of hls) { budget.charge(h.text.length+1);
    const r = parseHighlight(h.text);
    if ("err" in r) { errors.push({ line: h.line, msg: `@highlight: ${r.err}` }); continue; }
    const hl: Highlight = { ...r.hl, matched: [] };
    if (hl.kind === "lines") {
      if (hl.from! > n || hl.to! > n) errors.push({ line: h.line, msg: `@highlight line ${hl.from}${hl.to !== hl.from ? "-" + hl.to : ""} is past the end: the log has ${n} lines` });
      for (let k = hl.from!; k <= Math.min(hl.to!, kept); k++) { budget.charge(1,1); hl.matched.push(k); };
    } else {
      try {
        const q = parseLogQL(hl.query!, budget, caps);
        const out = runLogQL(q, entries, labels, budget);
        out.keep.forEach((k, ix) => { if (k) hl.matched.push(entries[ix].n); });
        if (!hl.matched.length) errors.push({ line: h.line, msg: `@highlight ${hl.query} matches no line of this log; check the words, or point at lines with @highlight line <n>` });
      } catch (e) { if (e instanceof LogQLError) errors.push({ line: h.line, msg: `@highlight: ${e.message}` }); else throw e; }
    }
    highlights.push(hl);
  }
  let filter = attrs.filter ?? "";
  if (filter) { try { runLogQL(parseLogQL(filter, budget, caps), entries, labels, budget); } catch (e) { if (e instanceof LogQLError) errors.push({ line: bodyLine - 1, msg: `filter=: ${e.message}` }); else throw e; } }
  // repeated lines: consecutive lines equal once the time is left out
  const folded: Entry[] = [];
  const key = (e: Entry) => `${e.level}|${e.msg}|${JSON.stringify(e.fields)}`;
  for (const e of entries) { budget.charge(1+e.raw.length); const last = folded[folded.length - 1]; if (attrs.fold !== "off" && last && key(last) === key(e)) { last.repeat++; (last as any).last = e.n; } else folded.push(e); }
  return { entries: folded, labels, highlights, errors, filter, lines: kept };
}

// @highlight <LogQL filter> [colour] "why"      @highlight line 3[-5] [colour] "why"
export function parseHighlight(text: string): { hl: Omit<Highlight, "matched"> } | { err: string } {
  let rest = text.replace(/^@highlight\s*/, "");
  let why = "";
  const strings: {start:number;end:number;value:string}[] = [];
  for(let i=0;i<rest.length;i++){if(rest[i]!==String.fromCharCode(34))continue;const start=i++;let value="",closed=false;for(;i<rest.length;i++){const c=rest[i];if(c===String.fromCharCode(34)){closed=true;break;}if(c===String.fromCharCode(92)&&i+1<rest.length)value+=rest[++i];else value+=c;}if(closed)strings.push({start,end:i+1,value});}
  const w=strings.at(-1);
  if(!w || rest.slice(w.end).trim())return {err:"end it with the reason in double quotes, like @highlight |= \"timeout\" [bad] \"why it matters\""};
  why=w.value;rest=rest.slice(0,w.start).trim();
  let colour="warn";
  if(rest.endsWith("]")){const start=rest.lastIndexOf("[");if(start>=0){const c=rest.slice(start+1,-1);if(!HL_COLOURS.includes(c))return {err:`unknown colour [${c}]; colours are ${HL_COLOURS.join(", ")}`};colour=c;rest=rest.slice(0,start).trim();}}
  if (/(\|=|!=|\|~|!~|\|)\s*$/.test(rest)) return { err: `end it with the reason in double quotes after the filter, like @highlight |= "timeout" [bad] "why it matters"` };
  if (!why.trim()) return { err: "the reason in quotes is empty; say why the line matters" };
  const ln = rest.match(/^line\s+(\d+)(?:\s*-\s*(\d+))?$/);
  if (ln) { const from = +ln[1], to = ln[2] ? +ln[2] : from; if (from < 1 || to < from) return { err: "a line range like `line 3-5` goes from a smaller to a larger number, starting at 1" }; return { hl: { line: 0, text, kind: "lines", from, to, colour, why } }; }
  if (!rest) return { err: `name what to light: a LogQL filter (|= "timeout") or lines (line 3-5)` };
  return { hl: { line: 0, text, kind: "filter", query: rest, colour, why } };
}

const range = (ns: number[]): string => {
  const out: string[] = []; let a = ns[0], b = ns[0];
  for (let i = 1; i <= ns.length; i++) { if (ns[i] === b + 1) { b = ns[i]; continue; } out.push(a === b ? `${a}` : `${a}-${b}`); a = b = ns[i]; }
  return out.join(", ");
};
/** the LLM view: highlights first, then the lines as written (folded repeats as (xN)); llm=highlights keeps only the lit lines and 2 around each */
export function logLlm(spec: LogSpec, attrs: Record<string, string>, raws: string[], budget?: Budget): string {
  budget?.charge(raws.reduce((n,s)=>n+s.length+1,0)+spec.highlights.reduce((n,h)=>n+h.matched.length*6+h.why.length,0));
  const head: string[] = [];
  for (const h of spec.highlights) {
    const where = h.matched.length ? (h.matched.length > 1 || h.kind === "lines" && h.to !== h.from ? "lines " : "line ") + range(h.matched) : "no line";
    head.push(h.kind === "lines" ? `${where}: ${h.why}` : `${where} match ${h.query}: ${h.why}`);
  }
  const keepOnly = attrs.llm === "highlights";
  const lit = new Set<number>(); for (const h of spec.highlights) for (const n of h.matched) for (let k = n - 2; k <= n + 2; k++) lit.add(k);
  const out: string[] = []; let left = 0;
  spec.entries.forEach((e) => {
    const last = (e as any).last ?? e.n;
    if (keepOnly) { let any = false; for (let k = e.n; k <= last; k++) if (lit.has(k)) any = true; if (!any) { left += last - e.n + 1; return; } }
    out.push(raws[e.n - 1] + (e.repeat > 1 ? ` (×${e.repeat})` : ""));
  });
  const info = ["log", ...(attrs.labels ? [`labels="${attrs.labels}"`] : []), ...(attrs.filter ? [`filter=${/\s/.test(attrs.filter) ? `"${attrs.filter.replace(/"/g, '\\"')}"` : attrs.filter}`] : [])].join(" ");
  const parts: string[] = [];
  if (head.length) parts.push(`Highlights: ${head.join("; ")}.`);
  parts.push("```" + info + "\n" + out.join("\n") + "\n```");
  if (left) parts.push(`(${left} other line${left === 1 ? "" : "s"} left out; the full log is on the page)`);
  return parts.join("\n\n");
}
export function logRaws(body: string): string[] { return body.split("\n").filter((l) => l.trim() && !/^@highlight\b/.test(l)).map((l) => l.trim()); }
export type { LogQuery };
