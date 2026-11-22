// trace: the source of a ```trace part (DESIGN 12.1): the spans of one request across services, drawn as a waterfall.
// A span line is `<service> <name> <start> <end> [key=value ...] [colour]`, nested by indenting (the parent holds the child), or
// flat with `parent=<id>` for a list pasted from a tracing tool. `@log <service> <time> <level> "text"` puts a log line on a span;
// `@service <id> [colour] "label"` names and colours a service. Pure: no DOM. Every loop charges the document's budget.
import { BudgetError, Budget, partLimitsOf } from "../../core/budget";
import { definePart } from "../types";
import type { LIMITS } from "./limits";
import { checkAttrs, bodyLines, colourMsg, familyOf, isId, COLOUR_WORDS, indentOf, numberText, tokens, pair, logLine, serviceLine, numberOrder, type Issue11, type Src } from "./source";
import { placeLogs, flameRows } from "./layout";
import { fmtNum, type FlameSpec, type Frame } from "../flame/part";

export const TRACE_KEYS = ["unit", "trace", "open", "critical"];
export const LEVELS = ["debug", "info", "warn", "error"] as const;
export type Level = (typeof LEVELS)[number];
export interface Span {
  id: number; key: string; service: string; name: string; depth: number; parent: number; start: number; end: number;
  /** the time the span itself ran: its length minus what its children cover */
  self: number; attrs: { k: string; v: string }[]; error: string | null; colour: string | null; line: number; logs: number[]; critical: boolean;
}
export interface TraceLog { id: number; service: string; time: number; level: Level; text: string; span: number; line: number }
export interface Service { id: string; label: string; colour: string; spans: number }
export interface TraceSpec {
  title: string; unit: string; trace: string; /** levels open at the start; 0 means all */ open: number; critical: boolean;
  spans: Span[]; /** child span ids of each span, in start order */ children: number[][]; roots: number[]; /** every span id, parents before children, siblings in start order */ order: number[];
  logs: TraceLog[]; services: Service[]; origin: number; length: number; /** the spans on the critical path, in order */ path: number[];
  errors: Issue11[]; warnings: Issue11[];
}

const unq = (v: string) => { if (!v.startsWith('"')) return v; try { return JSON.parse(v); } catch { return v.slice(1, -1); } };

export function parseTrace(src: Src, limits: typeof LIMITS, b: Budget = new Budget(partLimitsOf(), null, null, "the trace part")): TraceSpec {
  const TRACE_CAPS = { spans: limits.traceSpans, lines: limits.traceLines, depth: limits.traceDepth, name: limits.traceName, attrs: limits.traceAttrs, value: limits.traceValue, logs: limits.traceLogs, services: limits.traceServices, text: limits.traceText };
  const errors: Issue11[] = [], warnings: Issue11[] = [];
  checkAttrs(src, TRACE_KEYS, "trace", errors, b);
  const spec: TraceSpec = { title: src.attrs.title ?? "", unit: src.attrs.unit ?? "ms", trace: src.attrs.trace ?? src.attrs.id ?? "", open: 0, critical: true, spans: [], children: [], roots: [], order: [], logs: [], services: [], origin: 0, length: 0, path: [], errors, warnings };
  if (src.attrs.unit !== undefined && !/^[A-Za-zµ]{1,8}$/.test(src.attrs.unit)) errors.push({ line: src.line, msg: `trace: unit= is a short word like ms, s or us (got "${src.attrs.unit}")` });
  if (src.attrs.trace !== undefined && !isId(src.attrs.trace)) errors.push({ line: src.line, msg: `trace: trace= is an id (letters, digits, - _ .), the same as a log line's trace= field (got "${src.attrs.trace}")` });
  if (src.attrs.open !== undefined) { if (numberText(src.attrs.open, false) && !src.attrs.open.includes(".") && +src.attrs.open >= 1 && +src.attrs.open <= limits.traceOpen) spec.open = +src.attrs.open; else errors.push({ line: src.line, msg: `trace: open= is how many levels of spans are open at the start, a whole number from 1 to ${limits.traceOpen} (got "${src.attrs.open}")` }); }
  if (src.attrs.critical !== undefined) { if (src.attrs.critical === "on" || src.attrs.critical === "off") spec.critical = src.attrs.critical === "on"; else errors.push({ line: src.line, msg: `trace: critical= is on or off (got "${src.attrs.critical}")` }); }
  if (src.steps.length) errors.push({ line: src.steps[0].line, msg: `trace takes no @step lines` });
  const lines = bodyLines(src.body, src.bodyLine, b);
  if (lines.length > TRACE_CAPS.lines) { errors.push({ line: src.line, msg: `trace: at most ${TRACE_CAPS.lines} lines (this one has ${lines.length}); keep the slow spans and the failed ones, and fold the rest into their parents` }); return spec; }
  b.charge(lines.length * 6, lines.length * 4);
  if (!lines.length) { errors.push({ line: src.line, msg: `trace: no spans; write "service name start end" lines, like "web GET /cart 0 182"` }); return spec; }

  // ---- 1. read the lines
  interface Raw { span: Span; indent: number; parentKey: string | null; parentLine: number; hasId: boolean }
  const raws: Raw[] = [];
  const logsRaw: { l: { text: string; line: number }; m: string[] }[] = [];
  const svcRaw: { line: number; id: string; colour?: string; label?: string }[] = [];
  const stack: { indent: number; id: number }[] = [];
  const ids = new Map<string, number>();
  let full = false;
  for (const l of lines) {
    b.charge(4 + l.text.length, 2, l.text.length);
    if (l.text.trim().startsWith("@")) {
      const t = l.text.trim();
      if (/^@log\b/.test(t)) {
        const m = logLine(t);
        if (!m || !numberText(m[2])) errors.push({ line: l.line, msg: `trace: a log line is @log <service> <time> <level> "text", like @log api 120 warn "prices query over 80 ms"` });
        else logsRaw.push({ l, m });
      } else if (/^@service\b/.test(t)) {
        const m = serviceLine(t);
        if (!m) errors.push({ line: l.line, msg: `trace: a service line is @service <id> [colour] "label", like @service db [c5] "Postgres"` });
        else if (m[2] !== undefined && !COLOUR_WORDS.includes(m[2].trim())) errors.push({ line: l.line, msg: `trace: ${colourMsg(m[2].trim())}` });
        else svcRaw.push({ line: l.line, id: m[1], colour: m[2]?.trim(), label: m[3] });
      } else errors.push({ line: l.line, msg: `trace: unknown line "${t.split(/\s/)[0]}" (lines: @log, @service, or a span "service name start end")` });
      continue;
    }
    if (full) continue;
    const lead = indentOf(l.text);
    const m = [l.text, l.text.slice(0, lead), l.text.slice(lead)];
    if (/\t/.test(m[1])) { errors.push({ line: l.line, msg: `trace: indent with spaces, not tabs` }); continue; }
    const readTokens = tokens(m[2]);
    const toks = readTokens ?? [];
    b.charge(toks.length + 1, toks.length);
    let colour: string | null = null;
    if (toks.length && /^\[[^\]]*\]$/.test(toks[toks.length - 1])) {
      const w = toks.pop()!.slice(1, -1).trim();
      if (!COLOUR_WORDS.includes(w)) { errors.push({ line: l.line, msg: `trace: ${colourMsg(w)}` }); continue; }
      colour = w;
    }
    const pairs: { k: string; v: string }[] = [];
    while (toks.length > 3 && pair(toks[toks.length - 1]) !== null) { const t = pair(toks.pop()!)!; pairs.push({ k: t[0], v: unq(t[1]) }); }
    pairs.reverse();
    if (toks.length < 4 || !numberText(toks[toks.length - 1]) || !numberText(toks[toks.length - 2])) {
      errors.push({ line: l.line, msg: `trace: a span line is "service name start end" with its times as numbers, then key=value pairs, then a [colour] if you want one (got "${m[2].slice(0, 60)}")` });
      continue;
    }
    const end = +toks.pop()!, start = +toks.pop()!, service = toks.shift()!, name = toks.join(" ");
    if (!isId(service)) { errors.push({ line: l.line, msg: `trace: the service "${service.slice(0, 40)}" is an id: letters, digits, - _ . (the name comes after it, and may have spaces)` }); continue; }
    if (name.length > TRACE_CAPS.name) { errors.push({ line: l.line, msg: `trace: a span name is at most ${TRACE_CAPS.name} characters` }); continue; }
    if (!Number.isFinite(end - start)) { errors.push({ line: l.line, msg: `trace: the span length is not finite; scale the times down` }); continue; }
    if (end < start) { errors.push({ line: l.line, msg: `trace: "${name}" ends (${fmtNum(end)}) before it starts (${fmtNum(start)}); swap them` }); continue; }
    if (pairs.length > TRACE_CAPS.attrs) { errors.push({ line: l.line, msg: `trace: a span has at most ${TRACE_CAPS.attrs} key=value pairs` }); continue; }
    if (pairs.some((p) => p.v.length > TRACE_CAPS.value)) { errors.push({ line: l.line, msg: `trace: a value is at most ${TRACE_CAPS.value} characters; cut it` }); continue; }
    if (raws.length >= TRACE_CAPS.spans) { errors.push({ line: l.line, msg: `trace: more than ${TRACE_CAPS.spans} spans; keep the slow and failed ones and fold the rest into their parents` }); full = true; continue; }
    let key = name, parentKey: string | null = null, error: string | null = null, hasId = false;
    const attrs: { k: string; v: string }[] = [];
    let bad = false;
    for (const p of pairs) {
      if (p.k === "id") { if (!isId(p.v)) { errors.push({ line: l.line, msg: `trace: id=${p.v.slice(0, 30)} is an id: letters, digits, - _ .` }); bad = true; } else { key = p.v; hasId = true; } }
      else if (p.k === "parent") parentKey = p.v;
      else if (p.k === "error") error = p.v || "error";
      else attrs.push(p);
    }
    if (bad) continue;
    const id = raws.length;
    const sp: Span = { id, key, service, name, depth: 0, parent: -1, start, end, self: 0, attrs, error, colour, line: l.line, logs: [], critical: false };
    if (hasId) { if (ids.has(key)) { errors.push({ line: l.line, msg: `trace: id=${key} is used twice (first on line ${raws[ids.get(key)!].span.line}); an id names one span` }); continue; } ids.set(key, id); }
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) { b.charge(1); stack.pop(); }
    if (parentKey === null) {
      if (!stack.length && indent > 0 && !raws.length) { errors.push({ line: l.line, msg: `trace: the first span is not indented; start with the root at the left edge` }); continue; }
      if (stack.length) sp.parent = stack[stack.length - 1].id;
    }
    raws.push({ span: sp, indent, parentKey, parentLine: l.line, hasId });
    if (parentKey === null) stack.push({ indent, id });
  }
  void svcRaw;
  b.charge(raws.length * 36, raws.length * 8);
  spec.spans = raws.map((r) => r.span);
  const spans = spec.spans;

  // ---- 2. parent= links: resolve them, and refuse a loop (walked once, each span at most once)
  for (const r of raws) {
    if (r.parentKey === null) continue;
    const to = ids.get(r.parentKey);
    if (to === undefined) { errors.push({ line: r.parentLine, msg: `trace: parent=${r.parentKey.slice(0, 40)} names no span; give the parent span id=${r.parentKey.slice(0, 40)}, or nest this line under it` }); continue; }
    r.span.parent = to;
  }
  const state = new Uint8Array(spans.length); // 0 new, 1 on the walk now, 2 done
  let looped = false;
  for (let s = 0; s < spans.length && !looped; s++) {
    if (state[s]) continue;
    const walk: number[] = [];
    let at = s;
    while (at >= 0 && state[at] === 0) { b.charge(1, 1); state[at] = 1; walk.push(at); at = spans[at].parent; }
    if (at >= 0 && state[at] === 1) {
      const ring = walk.slice(walk.indexOf(at)).map((i) => spans[i].name);
      errors.push({ line: spans[at].line, msg: `trace: the parents of ${ring.slice(0, 4).map((n) => `"${n}"`).join(", ")}${ring.length > 4 ? ` and ${ring.length - 4} more` : ""} go round in a circle; a span has one parent and a trace is a tree, so remove one parent= link` });
      looped = true;
    }
    for (const i of walk) state[i] = 2;
  }
  if (looped) return spec;
  // children and the order of the rows
  spec.children = spans.map(() => []);
  for (const s of spans) if (s.parent < 0) spec.roots.push(s.id); else spec.children[s.parent].push(s.id);
  spec.roots = numberOrder(numberOrder(spec.roots, (x) => spans[x].end, b), (x) => spans[x].start, b);
  for (let k = 0; k < spec.children.length; k++) { b.charge(1); spec.children[k] = numberOrder(numberOrder(spec.children[k], (x) => spans[x].end, b), (x) => spans[x].start, b); }
  b.charge(spans.length * 3, spans.length);
  const order: number[] = [], todo: number[] = [...spec.roots].reverse();
  while (todo.length) { b.charge(1); const id = todo.pop()!; order.push(id); const k = spec.children[id]; for (let i = k.length - 1; i >= 0; i--) { b.charge(1); todo.push(k[i]); } }
  spec.order = order;
  for (const id of order) { const s = spans[id]; s.depth = s.parent < 0 ? 0 : spans[s.parent].depth + 1; }
  const deepest = spans.reduce((m, s) => (s.depth > m.depth ? s : m), spans[0] ?? ({ depth: 0 } as Span));
  if (deepest.depth > TRACE_CAPS.depth) errors.push({ line: deepest.line, msg: `trace: nested deeper than ${TRACE_CAPS.depth} levels; fold the inner spans into their parent` });
  // a child runs inside its parent's time
  for (const s of spans) {
    if (s.parent < 0) continue;
    const p = spans[s.parent];
    if (s.start < p.start || s.end > p.end) errors.push({ line: s.line, msg: `trace: "${s.name}" (${fmtNum(s.start)} to ${fmtNum(s.end)}) is outside its parent "${p.name}" (${fmtNum(p.start)} to ${fmtNum(p.end)}); a child runs inside its parent's time, so fix a time or move the line` });
  }

  // ---- 3. services, in order of first use; @service lines name and colour them
  const svc = new Map<string, Service>();
  for (const s of spans) { let v = svc.get(s.service); if (!v) { v = { id: s.service, label: s.service, colour: "", spans: 0 }; svc.set(s.service, v); } v.spans++; }
  if (svc.size > TRACE_CAPS.services) errors.push({ line: src.line, msg: `trace: ${svc.size} services; at most ${TRACE_CAPS.services} (merge the small ones into one service name)` });
  for (const r of svcRaw) {
    const v = svc.get(r.id);
    if (!v) { errors.push({ line: r.line, msg: `trace: @service ${r.id} names a service no span uses (services: ${[...svc.keys()].slice(0, 8).join(", ")})` }); continue; }
    if (r.colour) v.colour = r.colour;
    if (r.label !== undefined) v.label = r.label.slice(0, limits.traceServiceLabel);
  }
  // the family colours go to the services in order of first use, skipping the ones an @service line chose
  const taken = new Set([...svc.values()].map((v) => v.colour).filter(Boolean));
  let next = 0;
  for (const v of svc.values()) { if (v.colour) continue; let c = familyOf(next++); for (let t = 0; t < 8 && taken.has(c); t++) c = familyOf(next++); v.colour = c; }
  spec.services = [...svc.values()];

  // ---- 4. self time (the length minus what the children cover) and the logs on spans
  for (const s of spans) {
    const kids = spec.children[s.id];
    let covered = 0, hi = -Infinity;
    for (const k of kids.map((x) => spans[x])) { const a = Math.max(k.start, hi); if (k.end > a) covered += k.end - a; if (k.end > hi) hi = k.end; }
    s.self = Math.max(0, s.end - s.start - covered);
  }
  b.charge(logsRaw.length * 4 + spans.length, logsRaw.length);
  if (logsRaw.length > TRACE_CAPS.logs) errors.push({ line: logsRaw[TRACE_CAPS.logs].l.line, msg: `trace: more than ${TRACE_CAPS.logs} @log lines; keep the ones that matter` });
  // logs: first check each one by itself, then place them with one pass over the spans of its service (each span looks up the
  // logs inside its time with a binary search), so the work follows the spans plus the logs, not their product
  const bySvc = new Map<string, number[]>();
  for (const s of spans) { const a = bySvc.get(s.service) ?? []; a.push(s.id); bySvc.set(s.service, a); }
  const names = new Map<string, Set<string>>();
  for (const s of spans) { let n = names.get(s.service); if (!n) { n = new Set(); names.set(s.service, n); } n.add(s.key); n.add(s.name); }
  interface L1 { line: number; service: string; time: number; level: Level; text: string; want: string | undefined; best: number; ord: number }
  const ok: L1[] = [];
  for (const { l, m } of logsRaw.slice(0, TRACE_CAPS.logs)) {
    const service = m[1], time = +m[2], level = m[3].toLowerCase(), text = m[4].replace(/\\(.)/g, "$1");
    if (!(LEVELS as readonly string[]).includes(level)) { errors.push({ line: l.line, msg: `trace: the level "${m[3]}" is not known; use ${LEVELS.join(", ")}` }); continue; }
    if (text.length > TRACE_CAPS.text) { errors.push({ line: l.line, msg: `trace: a log text is at most ${TRACE_CAPS.text} characters` }); continue; }
    const mine = bySvc.get(service);
    if (!mine) { errors.push({ line: l.line, msg: `trace: the log names the service "${service}", which no span uses (services: ${[...svc.keys()].slice(0, 8).join(", ")})` }); continue; }
    if (m[5] !== undefined && !names.get(service)!.has(m[5])) { errors.push({ line: l.line, msg: `trace: span=${m[5]} is not a ${service} span (use a span's id= or its name)` }); continue; }
    b.charge(2, 1);
    ok.push({ line: l.line, service, time, level: level as Level, text, want: m[5], best: -1, ord: ok.length });
  }
  placeLogs(spans, ok, b);
  for (const g of ok) {
    if (g.best < 0) {
      const mine = bySvc.get(g.service)!;
      const ranges = mine.slice(0, 3).map((i) => `${fmtNum(spans[i].start)}–${fmtNum(spans[i].end)}`).join(", ");
      errors.push({ line: g.line, msg: `trace: the log at ${fmtNum(g.time)} is outside every ${g.service} span${g.want !== undefined ? ` named ${g.want}` : ""} (they run ${ranges}${mine.length > 3 ? ", ..." : ""}); fix the time or the service` });
      continue;
    }
    const lg: TraceLog = { id: spec.logs.length, service: g.service, time: g.time, level: g.level, text: g.text, span: g.best, line: g.line };
    spec.logs.push(lg); spans[g.best].logs.push(lg.id);
  }
  for (const s of spans) { b.charge(1); s.logs = numberOrder(s.logs, (id) => spec.logs[id].time, b); }

  // ---- 5. the axis and the critical path
  if (spans.length) { spec.origin = Math.min(...spec.roots.map((r) => spans[r].start)); const length = Math.max(...spec.roots.map((r) => spans[r].end)) - spec.origin; if (Number.isFinite(length)) spec.length = length; else errors.push({ line: src.line, msg: "trace: the trace length is not finite; scale the times down" }); }
  if (spans.length > 1 && spec.roots.length > 1) warnings.push({ line: spans[spec.roots[1]].line, msg: `trace: ${spec.roots.length} spans at the left edge; a trace usually has one root (indent the others under it)` });
  if (spec.length <= 0 && spans.length) warnings.push({ line: spans[0].line, msg: `trace: the whole trace has no length (every start equals its end); check the times` });
  markCritical(spec, b);
  spec.path = spec.order.filter((i) => spans[i].critical);
  if (!spans.length && !errors.length) errors.push({ line: src.line, msg: `trace: no spans` });
  return spec;
}

/** The critical path: from the end of the trace walk back; the child that ended last is what its parent waited for, then the
 *  child that ended last before that one began, and so on; every span chosen is looked at the same way inside. Charges the budget. */
function markCritical(spec: TraceSpec, b: Budget) {
  const spans = spec.spans;
  const pick = (kids: number[], limit: number) => {
    const sorted = numberOrder(numberOrder(kids, (x) => spans[x].start, b), (x) => -spans[x].end, b);
    b.charge(sorted.length * 2, sorted.length);
    const out: number[] = []; let t = limit;
    for (const k of sorted) { const s = spans[k]; if (s.end > t || s.end <= s.start) continue; out.push(k); t = s.start; }
    return out;
  };
  const todo = pick(spec.roots, spec.origin + spec.length);
  while (todo.length) {
    const id = todo.pop()!;
    spans[id].critical = true;
    for (const k of pick(spec.children[id], spans[id].end)) todo.push(k);
    b.charge(1);
  }
}

// ---------------------------------------------------------------- helpers for the page and the LLM view
const span1 = (spec: TraceSpec, id: number) => spec.spans[id];
export const lenOf = (s: Span) => s.end - s.start;
export const fmtLen = (v: number, unit: string) => `${fmtNum(v)}${unit ? ` ${unit}` : ""}`;
/** the spans whose service, name or any value contains the text (case does not matter); a reader's search gets a budget of its own */
export function searchSpans(spec: TraceSpec, q: string, b: Budget = new Budget(partLimitsOf(), null, null, "the trace search")): { ids: number[]; total: number } {
  b.charge(1 + q.length, 0, q.length);
  const t = q.trim().toLowerCase();
  if (!t) return { ids: [], total: 0 };
  const ids: number[] = [];
  for (const s of spec.spans) {
    b.charge(s.attrs.length);
    b.charge(2 + Math.ceil((s.name.length + s.service.length + s.attrs.reduce((n, a) => n + a.k.length + a.v.length, 0)) / 16));
    if (s.name.toLowerCase().includes(t) || s.service.toLowerCase().includes(t) || (s.error ?? "").toLowerCase().includes(t) || s.attrs.some((a) => a.v.toLowerCase().includes(t) || a.k.toLowerCase().includes(t))) ids.push(s.id);
  }
  const hit = new Set(ids), covered = spec.spans.map(() => false);
  b.charge(spec.spans.length, spec.spans.length);
  let total = 0;
  for (const id of spec.order) { b.charge(1); const s = spec.spans[id], above = s.parent >= 0 && covered[s.parent]; covered[id] = above || hit.has(id); if (hit.has(id) && !above) total += lenOf(s); }
  return { ids, total };
}

const kv = (s: Span) => s.attrs.map((a) => ` ${a.k}=${/[\s"]/.test(a.v) ? JSON.stringify(a.v) : a.v}`).join("");
export function traceLlm(spec: TraceSpec): string {
  const u = spec.unit, S = spec.spans;
  const head = `Trace${spec.title ? `: ${spec.title}` : ""}. ${S.length} span${S.length === 1 ? "" : "s"} across ${spec.services.length} service${spec.services.length === 1 ? "" : "s"} (${spec.services.map((s) => s.id).join(", ")}); ${fmtLen(spec.length, u)} in all. Each line is a span: its service, name, when it started and ended (${u || "units"}) and how long it took; indented lines are inside the line above; "log" lines belong to the span above them.`;
  const out = [head, ""];
  for (const id of spec.order) {
    const s = span1(spec, id), pad = "  ".repeat(s.depth);
    out.push(`${pad}${s.service} ${s.name} ${fmtNum(s.start)}–${fmtNum(s.end)} (${fmtLen(lenOf(s), u)})${kv(s)}${s.error !== null ? ` ERROR: ${s.error}` : ""}`);
    for (const l of s.logs) { const g = spec.logs[l]; out.push(`${pad}  log ${fmtNum(g.time)} ${g.level}: ${g.text}`); }
  }
  out.push("");
  out.push(`Critical path (what the end waited for): ${spec.path.map((i) => S[i].name).join(" > ") || "none"}`);
  const slow = numberOrder(numberOrder(S, (s) => -lenOf(s)), (s) => -s.self).slice(0, 5);
  out.push("", "Slowest spans (by the time each ran itself, children left out):");
  for (const s of slow) out.push(`- ${s.name} (${s.service}): ${fmtLen(s.self, u)} of its own, ${fmtLen(lenOf(s), u)} in all`);
  const bad = S.filter((s) => s.error !== null);
  out.push("", bad.length ? "Errors:" : "Errors: none.");
  for (const s of bad) out.push(`- ${s.name} (${s.service}) at ${fmtNum(s.start)}–${fmtNum(s.end)}: ${s.error}`);
  return out.join("\n");
}
/** The row of each span in the flame view. Spans that ran side by side inside one parent (parallel work) cannot share a row, so they go
 *  into lanes (a span joins the first lane that is free at its start), and a lane's rows come after the rows of the lanes before it. */
/** the same spans as a flame chart (the page's "Flame" view reuses the flame part): a frame is "service.name", so the flame's colour-by-group colours by service */
export function traceToFlame(spec: TraceSpec, budget: Budget = new Budget(partLimitsOf(), null, null, "the trace part")): FlameSpec {
  const depth = flameRows(spec, budget), svcColour = new Map(spec.services.map((v) => [v.id, v.colour]));
  budget.charge(spec.spans.length * 4, spec.spans.length * 2);
  const frames: Frame[] = spec.spans.map((s) => ({ id: s.id, name: `${s.service}.${s.name}`, depth: depth[s.id], parent: s.parent, start: s.start, end: s.end, self: s.self, total: lenOf(s), line: s.line, colour: s.colour ?? svcColour.get(s.service) }));
  return { form: "chart", title: "", unit: spec.unit, dir: "down", colour: "group", frames, children: spec.children, roots: spec.roots, origin: spec.origin, span: spec.length, errors: [], warnings: [] };
}
export { BudgetError };

export default definePart<TraceSpec>({ name: "trace", form: "fenced", steps: true, llmKind: "own",
 parse: (input, ctx) => parseTrace(input, ctx.limits, ctx.budget), llm: (s) => traceLlm(s),
 check: (s) => [...s.errors.map(e => ({ line: e.line, message: e.msg })), ...s.warnings.map(e => ({ line: e.line, level: "warn" as const, message: e.msg }))],
});
