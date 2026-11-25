// The calendar part : a schedule like Google Calendar, explorable, drawn by our own code.
//
//   ```calendar title="Launch week" tz=America/Los_Angeles date=2026-11-23 view=week
//   calendar eng "Engineering" [c2]
//   2026-11-23 09:00-09:15 Stand-up in eng every weekday until 2026-12-18
//   2026-11-24 14:00-15:30 Design review @ Room 4 in eng note="Bring the mock-ups"
//   2026-11-25 all day Code freeze [warn]
//   2026-11-26 .. 2026-11-27 Thanksgiving [muted]
//   2026-11-25 18:00-19:00 Call with the Sydney team tz=Australia/Sydney
//   ```
//
// This module is pure (no DOM): the parser, the repeat expander (it charges the document's budget, the page budget,
// and stops at a cap), the LLM view and the checks. The view draws the schedule with real text.
import type { Budget } from "../../core/budget";
import { colourError, dateWords, dayIso, dayNum, hm, instant, isDate, isZone, parseTime, takeColour, takeQuoted, unknownKeys, wall, weekdayOf, WEEKDAYS, WEEKDAYS_LONG, type PErr } from "../kit/places";

export const CAL_VIEWS = ["day", "week", "month", "list"];
export const CAL_KEYS = ["title", "tz", "date", "view", "hours"];
export const CAL_CAPS = { lines: 500, occurrences: 2000 };
export const REPEAT_FORMS = "every day | every weekday | every week [on Mon, Wed] | every 2 weeks | every month | every year, then optionally until <date> or times=<n>, and except <date>, <date>";

export type Repeat = { unit: "day" | "weekday" | "week" | "month" | "year"; every: number; on: number[]; until: string | null; times: number | null; except: string[] };
export type CalDef = { id: string; name: string; colour: string; line: number };
export type CalEvent = {
  line: number; title: string; cal: string; place: string; note: string; colour: string | null; tz: string;
  allDay: boolean; startDate: string; endDate: string; startMin: number; endMin: number; repeat: Repeat | null;
};
/** one expanded occurrence: instants for timed events; ISO dates for all-day ones */
export type Occ = { e: number; s: number; f: number; d0: string; d1: string };
export type CalSpec = {
  title: string; tz: string; date: string; view: string; hours: [number, number]; calendars: CalDef[]; events: CalEvent[];
  occ: Occ[]; errors: PErr[]; refused: string | null;
};

type PartLike = { body: string; bodyLine: number; steps: unknown[]; attrs: Record<string, string> };
const D = String.raw`\d{4}-\d{2}-\d{2}`;
const ID = String.raw`[A-Za-z0-9_.\-]+`;

const dayOf = (n: string): number => {
  const k = WEEKDAYS.findIndex((w) => w.toLowerCase() === n.slice(0, 3).toLowerCase());
  return k;
};

/** "every weekday until 2026-12-18" -> a repeat, or an error message */
export function parseRepeat(clause: string, start: string, cap = CAL_CAPS.occurrences): { repeat: Repeat } | { error: string } {
  // the clause cut before "until", "except", "on" (with something after) and "times=" (0.6.2: split into words first, so no look-ahead can backtrack over spaces)
  const parts: string[] = [], words = clause.trim().split(/\s+/);
  words.forEach((w, i) => { if (i > 0 && ((i < words.length - 1 && (w === "until" || w === "except" || w === "on")) || w.startsWith("times="))) parts.push(w); else if (parts.length) parts[parts.length - 1] += " " + w; else parts.push(w); });
  const m = parts[0].match(/^(?:(day|weekday|week|month|year)|(\d+)\s+(day|week|month|year)s)$/);
  if (!m) return { error: `cannot read the repeat "every ${clause.slice(0, 40)}"; the forms are: ${REPEAT_FORMS}` };
  const r: Repeat = { unit: (m[1] ?? m[3]) as Repeat["unit"], every: m[2] ? +m[2] : 1, on: [], until: null, times: null, except: [] };
  if (r.every < 1 || r.every > 99) return { error: `"every ${m[2]} ${r.unit}s" is out of range; use 2 to 99, or leave the number out` };
  for (const part of parts.slice(1)) {
    let k: RegExpMatchArray | null;
    if ((k = part.match(/^until\s+(\S+)$/))) { if (!isDate(k[1])) return { error: `"until ${k[1]}" is not an ISO date (write 2026-12-18)` }; if (dayNum(k[1]) < dayNum(start)) return { error: `"until ${k[1]}" is before the start date ${start}` }; r.until = k[1]; }
    else if ((k = part.match(/^times=(\d+)$/))) { r.times = +k[1]; if (r.times < 1 || r.times > cap) return { error: `times=${k[1]} is out of range; use 1 to ${cap}` }; }
    else if ((k = part.match(/^except\s+(.+)$/))) { for (const d of k[1].split(",").map((x) => x.trim())) { if (!isDate(d)) return { error: `"except ${d}" is not an ISO date (write 2026-11-27)` }; r.except.push(d); } }
    else if ((k = part.match(/^on\s+(.+)$/))) {
      if (r.unit !== "week") return { error: `"on ${k[1]}" only goes with "every week" or "every 2 weeks"; "every weekday" already means Monday to Friday` };
      for (const d of k[1].split(",").map((x) => x.trim())) { const w = dayOf(d); if (w < 0 || !/^[A-Za-z]{3,9}$/.test(d)) return { error: `"${d}" is not a weekday; write ${WEEKDAYS.join(", ")}` }; if (!r.on.includes(w)) r.on.push(w); }
      r.on.sort((a, b) => a - b);
    } else return { error: `cannot read "${part.slice(0, 30)}" in the repeat; the forms are: ${REPEAT_FORMS}` };
  }
  if (r.until && r.times !== null) return { error: `a repeat takes until <date> or times=<n>, not both` };
  return { repeat: r };
}
/** "every 2 weeks on Mon, Wed" */
export function repeatCore(r: Repeat): string {
  const unit = r.unit === "weekday" ? "weekday" : r.every === 1 ? r.unit : `${r.every} ${r.unit}s`;
  return `every ${unit}${r.on.length ? ` on ${r.on.map((d) => WEEKDAYS[d]).join(", ")}` : ""}`;
}
/** " until Fri 18 Dec 2026" or ", 3 times", then ", except ..." */
export function repeatEnd(r: Repeat): string {
  return `${r.times !== null ? `, ${r.times} times` : ""}${r.until ? ` until ${dateWords(r.until)}` : ""}${r.except.length ? `, except ${r.except.map(dateWords).join(", ")}` : ""}`;
}
export const repeatWords = (r: Repeat): string => repeatCore(r) + repeatEnd(r);

/** every date of a repeat, in order, up to `limit` (it stops there; `capped` says it did). Charges the document budget on every turn. */
export function repeatDates(start: string, r: Repeat, limit: number, budget?: Budget): { dates: string[]; capped: boolean } {
  const out: string[] = [];
  const s0 = dayNum(start), until = r.until ? dayNum(r.until) : Infinity;
  const exc = new Set(r.except.map(dayNum));
  const max = r.times ?? Infinity;
  let made = 0, turns = 0, capped = false;
  const hard = limit * 60 + 400;
  const take = (d: number): boolean => { // false: stop
    if (d > until || made >= max) return false;
    made++;
    if (!exc.has(d)) {
      if (out.length >= limit) { capped = true; return false; }
      out.push(dayIso(d)); budget?.charge(1, 1);
    }
    return true;
  };
  const turn = () => { budget?.charge(1); return ++turns <= hard; };
  if (r.unit === "day" || r.unit === "weekday") {
    for (let d = s0; turn(); d += r.unit === "day" ? r.every : 1) {
      if (r.unit === "weekday" && weekdayOf(dayIso(d)) > 4) { if (d > until) break; continue; }
      if (!take(d)) break;
    }
  } else if (r.unit === "week") {
    const on = r.on.length ? r.on : [weekdayOf(start)];
    const anchor = s0 - weekdayOf(start);
    outer: for (let w = 0; ; w++) {
      for (const wd of on) {
        const d = anchor + w * r.every * 7 + wd;
        if (!turn()) break outer;
        if (d < s0) continue;
        if (!take(d)) break outer;
      }
    }
  } else {
    const m = start.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
    const y0 = +m[1], mo0 = +m[2] - 1, dd = +m[3];
    for (let k = 0; turn(); k++) {
      const total = r.unit === "year" ? y0 * 12 + mo0 + k * r.every * 12 : y0 * 12 + mo0 + k * r.every;
      const y = Math.floor(total / 12), mo = total % 12;
      const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      if (dd > dim) { if (Date.UTC(y, mo, 1) / 86400000 > until) break; continue; } // that month has no such day: skipped, as iCalendar does
      if (!take(Math.floor(Date.UTC(y, mo, dd) / 86400000))) break;
    }
  }
  return { dates: out, capped };
}

// ---------- parsing ----------
export function parseCalendar(p: PartLike, budget?: Budget, caps = CAL_CAPS): CalSpec {
  const errors: PErr[] = [];
  const spec: CalSpec = { title: p.attrs.title ?? "", tz: p.attrs.tz && isZone(p.attrs.tz) ? p.attrs.tz : "UTC", date: p.attrs.date ?? "", view: p.attrs.view ?? "", hours: [8, 20], calendars: [], events: [], occ: [], errors, refused: null };
  for (const m of unknownKeys(p.attrs, CAL_KEYS, "calendar")) errors.push({ line: 0, msg: m });
  if (p.attrs.tz !== undefined && !isZone(p.attrs.tz)) errors.push({ line: 0, msg: `calendar: unknown time zone "${p.attrs.tz}"; use an IANA name like America/Los_Angeles or UTC` });
  if (p.attrs.date !== undefined && !isDate(p.attrs.date)) errors.push({ line: 0, msg: `calendar: date="${p.attrs.date}" is not an ISO date (write 2026-11-23)` });
  if (p.attrs.view !== undefined && !CAL_VIEWS.includes(p.attrs.view)) errors.push({ line: 0, msg: `calendar: view="${p.attrs.view}" is not a view; the views are ${CAL_VIEWS.join(", ")}` });
  if (p.attrs.hours !== undefined) {
    const h = p.attrs.hours.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!h || +h[1] >= +h[2] || +h[2] > 24) errors.push({ line: 0, msg: `calendar: hours="${p.attrs.hours}" is not two hours like 08-20 (the first before the second, at most 24)` });
    else spec.hours = [+h[1], +h[2]];
  }
  if (p.steps.length) errors.push({ line: 0, msg: `calendar takes no @step lines` });
  const lines = p.body.split("\n");
  const real = lines.filter((l) => l.trim() && !l.trim().startsWith("//")).length;
  if (real > caps.lines) errors.push({ line: p.bodyLine, msg: `calendar has ${real} lines; the cap is ${caps.lines}: split it into two calendars` });
  const tzOf = spec.tz;
  type Tail = { rest: string };
  const dateTok = (s: string, line: number): boolean => { if (isDate(s)) return true; errors.push({ line, msg: `calendar: "${s}" is not an ISO date; write it as 2026-11-23` }); return false; };
  const timeTok = (s: string, line: number): number | null => { const t = parseTime(s); if (t === null) errors.push({ line, msg: `calendar: "${s}" is not a 24-hour time; write 14:30` }); return t; };
  lines.forEach((raw, i) => {
    const line = p.bodyLine + i;
    budget?.charge(raw.length + 1, 1, raw.length);
    const t = raw.trim();
    if (!t || t.startsWith("//") || real > caps.lines) return;
    const c = t.match(new RegExp(String.raw`^calendar\s+(${ID})\s+"([^"]*)"\s*(.*)$`));
    if (c) {
      const col = takeColour(c[3]);
      if (col.raw !== null && !col.word) errors.push({ line, msg: colourError("calendar", col.raw) });
      if (col.rest) errors.push({ line, msg: `calendar ${c[1]}: unexpected "${col.rest.slice(0, 30)}"; a calendar line is: calendar <id> "Name" [colour]` });
      if (spec.calendars.some((x) => x.id === c[1])) { errors.push({ line, msg: `calendar id "${c[1]}" is used twice` }); return; }
      spec.calendars.push({ id: c[1], name: c[2], colour: col.word ?? "c1", line });
      return;
    }
    if (/^calendar\b/.test(t)) { errors.push({ line, msg: `calendar: a calendar line is: calendar <id> "Name" [colour]` }); return; }
    // an event line starts with a date
    const first = t.split(/\s+/)[0];
    if (!new RegExp(`^${D}$`).test(first)) { errors.push({ line, msg: `calendar: "${first}" is not an ISO date; an event line starts with a date like 2026-11-23` }); return; }
    if (!dateTok(first, line)) return;
    let rest = t.slice(first.length).trim();
    let allDay = false, startDate = first, endDate = first, startMin = 0, endMin = 0, m: RegExpMatchArray | null;
    if ((m = rest.match(new RegExp(String.raw`^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.*)$`)))) {
      const a = timeTok(m[1], line), b = timeTok(m[2], line);
      if (a === null || b === null) return;
      if (b < a) { errors.push({ line, msg: `calendar: the event ends (${m[2]}) before it starts (${m[1]}); to cross midnight write both dates: ${first} ${m[1]} .. ${dayIso(dayNum(first) + 1)} ${m[2]} Title` }); return; }
      startMin = a; endMin = b; rest = m[3];
    } else if ((m = rest.match(/^all[ -]day\s+(.*)$/i))) { allDay = true; rest = m[1]; }
    else if ((m = rest.match(new RegExp(String.raw`^\.\.\s*(${D})\s+(.*)$`)))) {
      if (!dateTok(m[1], line)) return;
      if (dayNum(m[1]) < dayNum(first)) { errors.push({ line, msg: `calendar: the span ends (${m[1]}) before it starts (${first})` }); return; }
      allDay = true; endDate = m[1]; rest = m[2];
    } else if ((m = rest.match(new RegExp(String.raw`^(\d{1,2}:\d{2})\s*\.\.\s*(${D})\s+(\d{1,2}:\d{2})\s+(.*)$`)))) {
      const a = timeTok(m[1], line), b = timeTok(m[3], line);
      if (a === null || b === null || !dateTok(m[2], line)) return;
      if (dayNum(m[2]) * 1440 + b < dayNum(first) * 1440 + a) { errors.push({ line, msg: `calendar: the event ends (${m[2]} ${m[3]}) before it starts (${first} ${m[1]})` }); return; }
      startMin = a; endDate = m[2]; endMin = b; rest = m[4];
    } else if ((m = rest.match(/^(\S+)/)) && /\d\s*(am|pm)\b|^\d{1,2}(am|pm)/i.test(rest.slice(0, 12))) {
      errors.push({ line, msg: `calendar: "${m[1]}" is not a 24-hour time; write 14:30, not a 12-hour time` }); return;
    } else { errors.push({ line, msg: `calendar: after the date write a time range (09:00-10:00), "all day", or a span (.. 2026-11-27); got "${rest.slice(0, 30)}"` }); return; }
    // the tail: a title, then in any order note="..", tz=.., [colour], @ place, in <calendar>, every ...
    const q = takeQuoted(rest, "note"); rest = q.rest;
    let tz = tzOf;
    const tzm = rest.match(/(?:^|\s)tz=(\S+)/);
    if (tzm) { rest = rest.replace(tzm[0], " ").replace(/\s+/g, " ").trim(); if (!isZone(tzm[1])) errors.push({ line, msg: `calendar: unknown time zone "${tzm[1]}"; use an IANA name like Australia/Sydney` }); else tz = tzm[1]; }
    const col = takeColour(rest); rest = col.rest;
    if (col.raw !== null && !col.word) errors.push({ line, msg: colourError("calendar event", col.raw) });
    let repeat: Repeat | null = null;
    const ev = rest.match(/\severy\s+(.*)$/);
    if (ev) {
      rest = rest.slice(0, ev.index).trim();
      const r = parseRepeat(ev[1], startDate, caps.occurrences);
      if ("error" in r) errors.push({ line, msg: `calendar: ${r.error}` }); else repeat = r.repeat;
      if (allDay && endDate !== startDate) errors.push({ line, msg: `calendar: a repeat goes with a one-day event, not a span` });
    }
    let cal = "", place = "";
    const peelIn = () => {
      const k = rest.match(/\sin\s+(\S+)$/);
      if (!k) return;
      const known = spec.calendars.some((x) => x.id === k[1]);
      if (known || (spec.calendars.length && /^[a-z][a-z0-9_.-]*$/.test(k[1]) && !cal)) {
        if (!known) { errors.push({ line, msg: `calendar: unknown calendar "${k[1]}"; the calendars are ${spec.calendars.map((x) => x.id).join(", ")} (declare one with: calendar ${k[1]} "Name" [colour])` }); }
        else cal = k[1];
        rest = rest.slice(0, k.index).trim();
      }
    };
    peelIn();
    const at = rest.match(/\s@\s*(.*)$/);
    if (at) { place = at[1].trim(); rest = rest.slice(0, at.index).trim(); peelIn(); }
    if (!rest) { errors.push({ line, msg: `calendar: the event has no title` }); return; }
    spec.events.push({ line, title: rest, cal, place, note: q.value ?? "", colour: col.word, tz, allDay, startDate, endDate, startMin, endMin, repeat });
  });
  // the default view and date come from the events
  if (!spec.date) spec.date = spec.events.length ? spec.events.reduce((a, e) => (dayNum(e.startDate) < dayNum(a) ? e.startDate : a), spec.events[0].startDate) : "1970-01-01";
  return spec;
}

/** the occurrences of every event; refuses a repeat with no end and anything over the cap; charges the document budget */
export function expandCalendar(spec: CalSpec, budget?: Budget, caps = CAL_CAPS): void {
  spec.occ = [];
  const errs = spec.errors;
  let total = 0;
  spec.events.forEach((ev, e) => {
    budget?.charge(1);
    if (total >= caps.occurrences) { errs.push({line:ev.line,msg:`calendar: more than ${caps.occurrences} occurrences; split the calendar`}); return; }
    let dates = [ev.startDate], capped = false;
    if (ev.repeat) {
      const left = caps.occurrences - total;
      const r = repeatDates(ev.startDate, ev.repeat, Math.max(0, left), budget);
      dates = r.dates; capped = r.capped;
      if (capped) errs.push({ line: ev.line, msg: ev.repeat.until === null && ev.repeat.times === null
        ? `calendar: the repeat on "${ev.title}" has no end; it stopped at the cap of ${caps.occurrences} events. Add "until <date>" (for example "until ${dayIso(dayNum(ev.startDate) + 90)}") or "times=<n>"`
        : `calendar: the repeat on "${ev.title}" makes more than the cap of ${caps.occurrences} events; end it sooner or repeat less often` });
    }
    const span = ev.allDay ? dayNum(ev.endDate) - dayNum(ev.startDate) : 0;
    for (const d of dates) {
      budget?.charge(1, 1);
      if (total >= caps.occurrences) { errs.push({line:ev.line,msg:`calendar: more than ${caps.occurrences} occurrences; end the repeat sooner`}); break; }
      total++;
      if (ev.allDay) { spec.occ.push({ e, s: 0, f: 0, d0: d, d1: dayIso(dayNum(d) + span) }); continue; }
      const endDay = ev.repeat || ev.endDate === ev.startDate ? d : dayIso(dayNum(d) + (dayNum(ev.endDate) - dayNum(ev.startDate)));
      spec.occ.push({ e, s: instant(d, ev.startMin, ev.tz), f: instant(endDay, ev.endMin, ev.tz), d0: d, d1: endDay });
    }
  });
  if (!spec.view) {
    if (!spec.occ.length) spec.view = "week";
    else {
      const days = spec.occ.map((o) => wall(o.s || dayNum(o.d0) * 86400000, spec.tz).date);
      const lo = Math.min(...days.map(dayNum)), hi = Math.max(...days.map(dayNum));
      spec.view = hi - lo <= 6 || spec.occ.length === 0 ? "week" : "month";
    }
  }
}

/** parse and expand; a spent budget refuses the part with its message (the renderer draws the plain list) */
export function calendarOf(p: PartLike, budget?: Budget, caps = CAL_CAPS): CalSpec {
  const spec = parseCalendar(p, budget, caps);
  if (!spec.errors.length) expandCalendar(spec, budget, caps);
  return spec;
}

/** warnings: two events of one calendar that start and end at the same time */
export function calendarWarnings(spec: CalSpec): PErr[] {
  const seen = new Map<string, number>(), out: PErr[] = [];
  for (const ev of spec.events) {
    if (ev.repeat || ev.allDay) continue;
    const k = `${ev.cal}|${ev.startDate}|${ev.startMin}|${ev.endDate}|${ev.endMin}|${ev.tz}`;
    if (seen.has(k)) out.push({ line: ev.line, msg: `calendar: "${ev.title}" overlaps the event at line ${seen.get(k)} exactly (same calendar, same time)` }); else seen.set(k, ev.line);
  }
  return out;
}

// ---------- the LLM view ----------
const calName = (spec: CalSpec, id: string) => spec.calendars.find((c) => c.id === id)?.name ?? "";
const range = (a: number, b: number) => `${hm(a)}-${hm(b)}`;
export function calendarLlm(spec: CalSpec): string {
  const out: string[] = [`Calendar: ${spec.title || "untitled"} (times in ${spec.tz}).`];
  const tail = (ev: CalEvent) => `${ev.title}${ev.place ? `, ${ev.place}` : ""}${calName(spec, ev.cal) ? ` (${calName(spec, ev.cal)})` : ""}`;
  const reps = spec.events.filter((e) => e.repeat);
  if (reps.length) {
    out.push("", "Repeats:");
    for (const ev of reps) {
      const when = ev.allDay ? "all day" : range(ev.startMin, ev.endMin);
      out.push(`- ${repeatCore(ev.repeat!).replace(/^every/, "Every")} ${when} from ${dateWords(ev.startDate)}${repeatEnd(ev.repeat!)}: ${tail(ev)}${ev.note ? `. ${ev.note}` : ""}`);
    }
  }
  const singles = spec.events.filter((e) => !e.repeat).map((ev) => {
    const s = ev.allDay ? 0 : instant(ev.startDate, ev.startMin, ev.tz), f = ev.allDay ? 0 : instant(ev.endDate, ev.endMin, ev.tz);
    const ws = ev.allDay ? { date: ev.startDate, min: -1 } : wall(s, spec.tz), wf = ev.allDay ? { date: ev.endDate, min: -1 } : wall(f, spec.tz);
    return { ev, s, ws, wf };
  }).sort((a, b) => dayNum(a.ws.date) - dayNum(b.ws.date) || a.ws.min - b.ws.min || a.ev.line - b.ev.line);
  if (singles.length) {
    out.push("", "Events:");
    for (const { ev, ws, wf } of singles) {
      let when: string;
      if (ev.allDay) when = `${dateWords(ev.startDate)}${ev.endDate !== ev.startDate ? ` to ${dateWords(ev.endDate)}` : ""}, all day`;
      else if (ws.date === wf.date) when = `${dateWords(ws.date)} ${range(ws.min, wf.min)}`;
      else when = `${dateWords(ws.date)} ${hm(ws.min)} to ${dateWords(wf.date)} ${hm(wf.min)}`;
      let own = "";
      if (!ev.allDay && ev.tz !== spec.tz) own = ` (${ev.startDate === ev.endDate ? `${range(ev.startMin, ev.endMin)} on ${dateWords(ev.startDate)}` : `${hm(ev.startMin)} ${dateWords(ev.startDate)} to ${hm(ev.endMin)} ${dateWords(ev.endDate)}`} in ${ev.tz})`;
      out.push(`- ${when}${own}: ${tail(ev)}.${ev.note ? ` ${ev.note}` : ""}`.replace(/\.\.$/, "."));
    }
  }
  return out.join("\n");
}
export { WEEKDAYS_LONG };
