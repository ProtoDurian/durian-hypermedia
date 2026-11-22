// The gantt part (format version 11): tasks on a time scale, a line each. Parse, the schedule at each step, the checks
// and the LLM view; pure. The drawing is view.tsx's, laid out by layout.ts.
//
//   ```gantt title="Release 2.0" today=2026-12-09
//   section Build
//   design "Design" 2026-12-01 .. 2026-12-04 done
//   api "API" after design 8d 60%
//   launch "Launch" milestone after api
//   @step The API slips
//   move api 2026-12-14
//   ```
//
//   <id> "label" <start> <end or length> [progress%] [done] [colour]    start: a date, a date and time, or `after <id> ...`
//   <id> "label" milestone <date | after <id> ...>                      a point
//   section <name>                                                      groups the lines after it
//   under a step: progress <id> 80%   done <id>   move <id> <date>      (and tasks under a step appear in it)
// Dates are wall-clock in `tz=` (default UTC). A date alone is a whole day; the end date after `..` is the last day of the bar.
import { definePart } from "../types";
import { COLOUR_WORDS, isSpace, mdTable, scanLines } from "../kit/text";
import type { Budget } from "../../core/budget";
import { DAY, add, addLength, fmtTime, isDateOnly, nextWorkday, parseLength, parsePercent, parseTime, partsOf, scanIso, validZone } from "./time";

/** a label longer than this gets a warning */
export const GANTT_LABEL = 60;
export interface GTask {
  id: string; label: string; section: number; milestone: boolean;
  startAt?: number; startDate: boolean; after: string[]; endAt?: number; endDate: boolean; len?: { n: number; unit: string };
  progress: number; done: boolean; colour?: string; appear: number; line: number;
}
export type GOp = { kind: "progress"; id: string; value: number; appear: number; line: number } | { kind: "done"; id: string; appear: number; line: number } | { kind: "move"; id: string; at: number; appear: number; line: number };
export interface GIssue { line: number; msg: string }
export interface GanttSpec {
  title: string; tz: string; today?: number; workdays: boolean; critical: boolean;
  sections: string[]; tasks: GTask[]; ops: GOp[]; steps: string[]; order: number[];
  /** the whole time the chart covers over every step, so the axis stays put as the steps go */
  extent: { min: number; max: number };
  errors: GIssue[]; warnings: GIssue[];
}
export type GanttLimits = { ganttTasks: number; ganttSteps: number; ganttSections: number; ganttDeps: number; ganttSpanDays: number };
/** what parse reads of the part's input */
export interface GanttInput { head: string; steps: { title: string; line: number; raw: string }[]; attrs: Record<string, string>; bodyLine: number; line: number }

// ---- hand scans (no regular expression over author text) ----
const isIdChar = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "." || c === "-";
/** an echo of author text in a message, cut short */
const q = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s);
const skip = (s: string, i: number) => { while (i < s.length && isSpace(s[i])) i++; return i; };
/** the words of a line, split at white space */
function words(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length;) {
    i = skip(s, i);
    const a = i;
    while (i < s.length && !isSpace(s[i])) i++;
    if (i > a) out.push(s.slice(a, i));
  }
  return out;
}
/** `<id> "label" rest`: null when the line is not a task line */
export function taskLine(t: string): { id: string; label: string; rest: string } | null {
  let i = 0;
  while (i < t.length && isIdChar(t[i])) i++;
  if (!i || !isSpace(t[i])) return null;
  const id = t.slice(0, i);
  i = skip(t, i);
  if (t[i] !== '"') return null;
  const e = t.indexOf('"', i + 1);
  if (e < 0) return null;
  return { id, label: t.slice(i + 1, e), rest: t.slice(skip(t, e + 1)) };
}
/** `progress|done|move <id> rest`: null when the line is not a step command */
export function opLine(t: string): { kind: "progress" | "done" | "move"; id: string; rest: string } | null {
  for (const kind of ["progress", "done", "move"] as const) {
    if (!t.startsWith(kind) || !isSpace(t[kind.length])) continue;
    const a = skip(t, kind.length);
    let i = a;
    while (i < t.length && isIdChar(t[i])) i++;
    if (i === a) return null;
    return { kind, id: t.slice(a, i), rest: t.slice(skip(t, i)) };
  }
  return null;
}
/** `section <name>`: the name, or null */
function sectionLine(t: string): string | null {
  if (!t.startsWith("section") || !isSpace(t[7])) return null;
  const name = t.slice(8).trim();
  if (!name) return null;
  return name.length >= 2 && name.startsWith('"') && name.endsWith('"') ? name.slice(1, -1) : name;
}
const colourMsg = (bad: string) => `"[${q(bad)}]" is not a colour word; use ${COLOUR_WORDS.map((w) => `[${w}]`).join(" ")} (no hex values)`;
/** `[word]` at the end of a line: the line without it, the word, and the word when it is not a colour word */
export function takeColour(s: string): { text: string; colour?: string; bad?: string } {
  const e = s.trimEnd(), close = e.length - 1;
  if (close < 1 || e[close] !== "]") return { text: s.trim() };
  const open = e.indexOf("[", e.lastIndexOf("]", close - 1) + 1);
  if (open < 0 || open >= close) return { text: s.trim() };
  const w = e.slice(open + 1, close).trim(), text = e.slice(0, open).trim();
  return COLOUR_WORDS.includes(w) ? { text, colour: w } : { text, bad: w };
}
/** a token that is a date, a date and time, with an optional offset (the shape only) */
const isIsoToken = (s: string) => scanIso(s) !== null;

interface Row { text: string; line: number; appear: number; head: boolean }

/** The gantt's data from the part's input. Wrong input still returns data (its errors inside). */
export function parseGantt(input: GanttInput, lim: GanttLimits, budget?: Budget): GanttSpec {
  const errors: GIssue[] = [], warnings: GIssue[] = [];
  const attrs = input.attrs;
  const spec: GanttSpec = { title: attrs.title ?? "", tz: "UTC", workdays: attrs.workdays === "on", critical: attrs.critical === "on", sections: [], tasks: [], ops: [], steps: input.steps.map((s) => s.title), order: [], extent: { min: 0, max: DAY }, errors, warnings };
  const OPTIONS = ["title", "today", "workdays", "critical", "tz", "static", "id", "llm"];
  for (const k of Object.keys(attrs)) if (!OPTIONS.includes(k)) errors.push({ line: input.line, msg: `unknown option "${q(k)}" (options: title, today, workdays, critical, tz, static)` });
  for (const k of ["workdays", "critical"]) if (attrs[k] !== undefined && attrs[k] !== "on" && attrs[k] !== "off") errors.push({ line: input.line, msg: `${k}= is on or off (got "${q(attrs[k])}")` });
  if (attrs.tz !== undefined) { if (validZone(attrs.tz)) spec.tz = attrs.tz; else errors.push({ line: input.line, msg: `tz="${q(attrs.tz)}" is not an IANA zone name such as America/Los_Angeles` }); }
  const tz = spec.tz;
  if (attrs.today !== undefined) { const t = parseTime(attrs.today, tz); if (t === null) errors.push({ line: input.line, msg: `today="${q(attrs.today)}" is not a date; write today=2026-12-09` }); else spec.today = t; }
  budget?.charge(2 + input.steps.length, 0, 0);
  if (input.steps.length > lim.ganttSteps) { errors.push({ line: input.steps[0].line, msg: `at most ${lim.ganttSteps} steps (this one has ${input.steps.length}); merge some` }); return spec; }

  // the lines, each with the step it is written under (the first step also holds what came before the first @step)
  const rows: Row[] = [];
  const chunks = [{ text: input.head, line: input.bodyLine, appear: 0, head: true }, ...input.steps.map((s, j) => ({ text: s.raw, line: s.line + 1, appear: j, head: false }))];
  for (const ch of chunks) for (const l of scanLines(ch.text, ch.line, budget).lines) rows.push({ text: l.text.trim(), line: l.line, appear: ch.appear, head: ch.head });

  // the ids first, so a task may wait for one written below it
  const declared = new Map<string, number>();
  for (const r of rows) { const m = sectionLine(r.text) === null ? taskLine(r.text) : null; if (m && !declared.has(m.id)) declared.set(m.id, r.appear); }
  budget?.charge(rows.length, declared.size, 0);
  const known = () => `${[...declared.keys()].slice(0, 8).map((k) => q(k, 20)).join(", ")}${declared.size > 8 ? ", …" : ""}`;

  let section = -1, deps = 0, stop = false;
  const idsSeen = new Set<string>();
  for (const r of rows) {
    if (stop) break;
    const t = r.text, line = r.line;
    const sec = sectionLine(t);
    if (sec !== null) {
      if (spec.sections.length >= lim.ganttSections) { errors.push({ line, msg: `at most ${lim.ganttSections} sections` }); continue; }
      spec.sections.push(sec); section = spec.sections.length - 1;
      continue;
    }
    const tm = taskLine(t);
    if (!tm) {
      const om = opLine(t);
      if (!om) { errors.push({ line, msg: `line not understood: "${q(t, 50)}"; a task is: id "Label" 2026-12-01 .. 2026-12-04, or id "Label" after other 8d, or: section Name` }); continue; }
      if (!input.steps.length || r.head) { errors.push({ line, msg: `"${om.kind}" changes a task as time passes, so it goes under an @step line` }); continue; }
      const id = om.id, rest = om.rest;
      if (!declared.has(id)) { errors.push({ line, msg: `${om.kind} ${q(id)}: there is no task "${q(id)}" (tasks: ${known()})` }); continue; }
      if (om.kind === "done") { if (rest) errors.push({ line, msg: `write: done ${q(id)}` }); else spec.ops.push({ kind: "done", id, appear: r.appear, line }); }
      else if (om.kind === "progress") {
        const pm = parsePercent(rest);
        if (pm === null) errors.push({ line, msg: `write: progress ${q(id)} 80%` });
        else if (pm > 100) errors.push({ line, msg: `progress ${pm}% is over 100%` });
        else spec.ops.push({ kind: "progress", id, value: pm, appear: r.appear, line });
      } else {
        const at = isIsoToken(rest) ? parseTime(rest, tz) : null;
        if (at === null) errors.push({ line, msg: `write: move ${q(id)} 2026-12-12 (a date or a date and time)` }); else spec.ops.push({ kind: "move", id, at, appear: r.appear, line });
      }
      continue;
    }
    const { id, label, rest: restRaw } = tm;
    if (spec.tasks.length >= lim.ganttTasks) { errors.push({ line, msg: `more than ${lim.ganttTasks} tasks; split it or merge small tasks` }); stop = true; break; }
    if (idsSeen.has(id)) { errors.push({ line, msg: `the task "${q(id)}" is written twice; give each task its own id` }); continue; }
    idsSeen.add(id);
    if (label.length > GANTT_LABEL) warnings.push({ line, msg: `the label "${label.slice(0, 24)}..." is ${label.length} characters; keep it under ${GANTT_LABEL}` });
    const c = takeColour(restRaw);
    if (c.bad !== undefined) errors.push({ line, msg: colourMsg(c.bad) });
    const toks = words(c.text);
    budget?.charge(1 + (toks.length >> 2), 1, 0);
    const task: GTask = { id, label, section: Math.max(section, 0), milestone: false, startDate: false, after: [], endDate: false, progress: 0, done: false, colour: c.colour, appear: r.appear, line };
    if (section < 0 && !spec.sections.length) spec.sections.push("");
    let i = 0, bad = false;
    const fail = (msg: string) => { errors.push({ line, msg: `${q(id)}: ${msg}` }); bad = true; };
    if (toks[i] === "milestone") { task.milestone = true; i++; }
    if (toks[i] === "after") {
      i++;
      while (i < toks.length && toks[i] !== ".." && parseLength(toks[i]) === null && parsePercent(toks[i]) === null && toks[i] !== "done") task.after.push(toks[i++]);
      if (!task.after.length) fail(`"after" needs the id of a task (after design)`);
      for (const a of task.after) {
        if (!declared.has(a)) fail(`after ${q(a)}: there is no task "${q(a)}" (tasks: ${known()})`);
        else if (a === id) fail(`a task cannot come after itself`);
        else if (declared.get(a)! > r.appear) fail(`after ${q(a)}: "${q(a)}" first appears in a later step; a task can only wait for one that is already there`);
      }
      deps += task.after.length;
      if (deps > lim.ganttDeps) { errors.push({ line, msg: `more than ${lim.ganttDeps} "after" arrows; keep the few that matter` }); stop = true; break; }
    } else if (toks[i] && isIsoToken(toks[i])) {
      const t0 = parseTime(toks[i], tz);
      if (t0 === null) fail(`"${q(toks[i])}" is not a real date`); else { task.startAt = t0; task.startDate = isDateOnly(toks[i]); }
      i++;
    } else fail(`needs a start: a date (2026-12-01) or after <task>; got ${toks[i] ? `"${q(toks[i])}"` : "nothing"}`);
    if (!bad && !task.milestone) {
      if (toks[i] === "..") {
        const e = toks[i + 1];
        const te = e && isIsoToken(e) ? parseTime(e, tz) : null;
        if (te === null) fail(`".." is followed by an end date (.. 2026-12-04); got ${e ? `"${q(e)}"` : "nothing"}`);
        else {
          task.endDate = isDateOnly(e);
          task.endAt = task.endDate ? add(te, 1, "day", tz) : te;
          if (task.startAt !== undefined && (task.endDate ? task.endAt <= task.startAt : task.endAt < task.startAt)) fail(`ends (${e}) before it starts (${q(toks[0] === "milestone" ? toks[1] : toks[0])}); swap them`);
        }
        i += 2;
      } else if (toks[i] && parseLength(toks[i]) !== null && parsePercent(toks[i]) === null) {
        const len = parseLength(toks[i])!;
        if (!len.known) fail(`"${q(toks[i])}" has an unknown length unit "${q(len.unit, 12)}"; use m (minutes), h (hours), d (days) or w (weeks)`);
        else if (!(len.n > 0)) fail(`a length is above 0 (got ${q(toks[i])})`);
        else if ((len.n * (len.unit === "w" ? 7 : len.unit === "d" ? 1 : len.unit === "h" ? 1 / 24 : 1 / 1440)) > lim.ganttSpanDays) fail(`"${q(toks[i])}" is longer than the ${lim.ganttSpanDays} days a gantt may span`);
        else task.len = { n: len.n, unit: len.unit };
        i++;
      } else fail(`needs an end: a length (3d, 2w, 4h, 90m) or .. 2026-12-04; got ${toks[i] ? `"${q(toks[i])}"` : "nothing"}`);
    } else if (!bad && task.milestone && (toks[i] === ".." || (toks[i] && parseLength(toks[i]) !== null && parsePercent(toks[i]) === null))) fail(`a milestone is a point: no end or length`);
    for (; i < toks.length && !bad; i++) {
      const pm = parsePercent(toks[i]);
      if (pm !== null) { if (pm > 100) fail(`progress ${q(toks[i])} is over 100%`); else task.progress = pm; }
      else if (toks[i] === "done") task.done = true;
      else fail(`"${q(toks[i])}" is not understood here; after the end only a progress (60%), done, or a colour [warn] may come`);
    }
    if (!bad) spec.tasks.push(task);
  }
  if (!spec.tasks.length && !errors.length) errors.push({ line: input.line, msg: `no tasks; write one per line: id "Label" 2026-12-01 .. 2026-12-04` });

  // what drawing and reading it will cost: every task, arrow and step command is worked out at every step
  const frames = Math.max(1, input.steps.length);
  budget?.charge(rows.length + (spec.tasks.length + deps + 4) * (frames + 4) * 2 + spec.ops.length * 2, spec.tasks.length * (frames + 1) * 3);

  // a loop of `after`s, then the order the schedule is worked out in (a task comes after everything it waits for)
  const idx = new Map(spec.tasks.map((t, k) => [t.id, k]));
  const indeg = spec.tasks.map((t) => { let n = 0; for (const a of t.after) if (idx.has(a)) n++; return n; });
  const next = spec.tasks.map(() => [] as number[]);
  spec.tasks.forEach((t, k) => { for (const a of t.after) if (idx.has(a)) next[idx.get(a)!].push(k); });
  const queue: number[] = [];
  indeg.forEach((n, k) => { if (!n) queue.push(k); });
  for (let h = 0; h < queue.length; h++) { const k = queue[h]; spec.order.push(k); for (const n of next[k]) if (--indeg[n] === 0) queue.push(n); }
  if (spec.order.length < spec.tasks.length) {
    const placed = new Set(spec.order);
    const left = spec.tasks.filter((_, k) => !placed.has(k));
    errors.push({ line: left[0].line, msg: `a loop of "after"s among ${left.slice(0, 8).map((x) => q(x.id, 20)).join(", ")}${left.length > 8 ? ", …" : ""}; a task cannot wait, directly or through others, for itself` });
    spec.order = spec.tasks.map((_, k) => k);
  }
  // a command on a task that is not there yet
  for (const o of spec.ops) { const k = idx.get(o.id); if (k !== undefined && spec.tasks[k].appear > o.appear) errors.push({ line: o.line, msg: `${o.kind} ${q(o.id)}: "${q(o.id)}" first appears in a later step` }); }

  if (!errors.length) {
    spec.extent = ganttExtent(spec);
    const days = Math.round((spec.extent.max - spec.extent.min) / DAY);
    if (days > lim.ganttSpanDays) errors.push({ line: input.line, msg: `the chart would span ${days} days (${fmtTime(spec.extent.min, "yyyy-MM-dd", tz)} to ${fmtTime(spec.extent.max, "yyyy-MM-dd", tz)}); a gantt covers at most ${lim.ganttSpanDays}: check the years of the dates, moves and today=` });
  }
  return spec;
}

export interface Sched { id: string; label: string; section: number; milestone: boolean; start: number; end: number; progress: number; done: boolean; colour?: string; after: string[]; critical: boolean; moved: boolean }
interface State { progress: number; done: boolean; move: number | undefined }
const stateOf = (spec: GanttSpec): { st: State[]; at: Map<string, number> } => ({ st: spec.tasks.map((t) => ({ progress: t.progress, done: t.done, move: undefined })), at: new Map(spec.tasks.map((t, k) => [t.id, k])) });
function apply(o: GOp, st: State[], at: Map<string, number>) {
  const k = at.get(o.id);
  if (k === undefined) return;
  if (o.kind === "progress") st[k].progress = o.value; else if (o.kind === "done") { st[k].done = true; st[k].progress = 100; } else st[k].move = o.at;
}
/** the tasks as they stand at a frame, given the state the steps' commands made */
function place(spec: GanttSpec, st: State[], at: Map<string, number>, frame: number): Sched[] {
  const tz = spec.tz;
  const out: (Sched | null)[] = spec.tasks.map(() => null);
  for (const k of spec.order) {
    const t = spec.tasks[k];
    if (t.appear > frame) continue;
    let start: number;
    if (st[k].move !== undefined) start = st[k].move!;
    else if (t.startAt !== undefined) start = t.startAt;
    else { start = 0; for (const a of t.after) { const e = out[at.get(a) ?? -1]?.end ?? 0; if (e > start) start = e; } if (spec.workdays) start = nextWorkday(start, tz); }
    let end: number;
    if (t.milestone) end = start;
    else if (t.len) end = addLength(start, t.len.n, t.len.unit, tz, spec.workdays);
    else if (t.endAt !== undefined) end = Math.max(start, st[k].move !== undefined && t.startAt !== undefined ? start + (t.endAt - t.startAt) : t.endAt);
    else end = start;
    out[k] = { id: t.id, label: t.label, section: t.section, milestone: t.milestone, start, end, progress: st[k].progress, done: st[k].done, colour: t.colour, after: t.after, critical: false, moved: st[k].move !== undefined };
  }
  const vis = out.filter((x): x is Sched => !!x);
  if (spec.critical && vis.length) {
    // the longest chain of `after`s: from the task that ends last, back through whichever task it waited for that ended last
    const byId = new Map(vis.map((s) => [s.id, s]));
    let cur: Sched | undefined = vis[0];
    for (const s of vis) if (s.end > cur.end) cur = s;
    for (let guard = 0; cur && guard <= vis.length; guard++) {
      cur.critical = true;
      let best: Sched | undefined;
      for (const a of cur.after) { const p = byId.get(a); if (p && (!best || p.end > best.end)) best = p; }
      cur = best;
    }
  }
  return vis;
}
/** every task as it stands at a frame (0 is the first step): visible ones only, with the steps' progress, done and moves applied */
export function scheduleGantt(spec: GanttSpec, frame: number): Sched[] {
  const { st, at } = stateOf(spec);
  for (const o of spec.ops) if (o.appear <= frame) apply(o, st, at);
  return place(spec, st, at, frame);
}
/** the schedule of every frame, 0 to the last: each step's commands are applied once, so the work is steps times tasks */
export function scheduleFrames(spec: GanttSpec): Sched[][] {
  const { st, at } = stateOf(spec), out: Sched[][] = [];
  const frames = Math.max(1, spec.steps.length);
  let p = 0;
  for (let f = 0; f < frames; f++) {
    while (p < spec.ops.length && spec.ops[p].appear <= f) apply(spec.ops[p++], st, at);
    out.push(place(spec, st, at, f));
  }
  return out;
}
/** the whole time the chart covers over every step (and `today`), so the axis stays put as the steps go */
export function ganttExtent(spec: GanttSpec): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const frame of scheduleFrames(spec)) for (const s of frame) { min = Math.min(min, s.start); max = Math.max(max, s.end); }
  if (spec.today !== undefined) { min = Math.min(min, spec.today); max = Math.max(max, spec.today); }
  if (!Number.isFinite(min)) { min = 0; max = DAY; }
  if (max <= min) max = min + DAY;
  return { min, max };
}

// ---- text: dates and the LLM view ----
const midnight = (t: number, tz: string) => { const p = partsOf(t, tz); return p.h === 0 && p.mi === 0 && p.s === 0; };
/** a task's start and end as text: dates (the end is the last day) for whole days, ISO times otherwise */
export function spanText(s: Sched, tz: string): { start: string; end: string; whole: boolean } {
  const whole = midnight(s.start, tz) && midnight(s.end, tz);
  if (whole) return { start: fmtTime(s.start, "yyyy-MM-dd", tz), end: s.milestone || s.end <= s.start ? "" : fmtTime(add(s.end, -1, "day", tz), "yyyy-MM-dd", tz), whole };
  return { start: fmtTime(s.start, "yyyy-MM-dd'T'HH:mm", tz), end: s.milestone ? "" : fmtTime(s.end, "yyyy-MM-dd'T'HH:mm", tz), whole };
}
const cellOf = (s: Sched) => `${s.label}${s.milestone ? " (milestone)" : s.done ? " (done)" : s.progress > 0 ? ` (${Math.round(s.progress)}%)` : ""}`;
export function ganttLlm(spec: GanttSpec): string {
  const frames = Math.max(1, spec.steps.length);
  const labels = new Map(spec.tasks.map((t) => [t.id, t.label]));
  const nameOf = (id: string) => labels.get(id) ?? id;
  const rows = (list: Sched[]) => list.map((s) => { const x = spanText(s, spec.tz); return [cellOf(s), x.start, x.end, s.after.map(nameOf).join(", ")]; });
  const cols = ["task", "start", "end", "after"];
  const out = [`Gantt${spec.title ? `: ${spec.title}` : ""}.${spec.tz !== "UTC" ? ` Times in ${spec.tz}.` : ""}${spec.workdays ? " Lengths skip Saturday and Sunday." : ""}${spec.today !== undefined ? ` Today is ${fmtTime(spec.today, "yyyy-MM-dd", spec.tz)}.` : ""}`];
  const table = (list: Sched[], sections: boolean) => {
    if (!sections) return mdTable(cols, rows(list));
    const parts: string[] = [];
    spec.sections.forEach((name, k) => { const g = list.filter((s) => s.section === k); if (g.length) parts.push(`${name ? name + "\n\n" : ""}${mdTable(cols, rows(g))}`); });
    return parts.join("\n\n");
  };
  const frame = scheduleFrames(spec);
  out.push("", ...(spec.steps.length ? [`Step 1: ${spec.steps[0]}`, ""] : []), table(frame[0], true));
  if (spec.critical) { const c = frame[frames - 1].filter((s) => s.critical).map((s) => s.label); if (c.length) out.push("", `Critical chain (the longest run of "after"s): ${c.join(", ")}.`); }
  for (let f = 1; f < frames; f++) {
    const before = new Map(frame[f - 1].map((p) => [p.id, p]));
    const changed = frame[f].filter((s) => { const o = before.get(s.id); return !o || o.start !== s.start || o.end !== s.end || o.progress !== s.progress || o.done !== s.done; });
    out.push("", `Step ${f + 1}: ${spec.steps[f]}`, "", changed.length ? table(changed, false) : "No task changes.");
  }
  return out.join("\n");
}

export default definePart<GanttSpec>({
  name: "gantt",
  form: "fenced",
  steps: true,
  llmKind: "own",
  parse: (input, ctx) => parseGantt(input, ctx.limits, ctx.budget),
  llm: (s) => ganttLlm(s),
  check: (s) => [...s.errors.map((e) => ({ line: e.line, message: e.msg })), ...s.warnings.map((w) => ({ line: w.line, level: "warn" as const, message: w.msg }))],
});
