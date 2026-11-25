// The calendar part (the format): day, 3-day (the phone's), week, month and list views; Back, Today, Next, a date picker,
// a legend that switches calendars, a popover for every event, a swipe on a phone, keys on a desktop. Our own code:
// dates and zones with Intl, the events already expanded at build time (tools/calendar.ts, under the document budget).
import {useDh} from "../../react/context";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MONTHS, MONTHS_LONG, WEEKDAYS, dateWords, dayIso, dayNum, hm, wall, weekdayOf, zoneLabel } from "../kit/places";
import { repeatWords, type CalSpec } from "./model";
import { usePop } from "../kit/places-pop";
import {useStatic} from "../kit/static";
import { wrap } from "../kit/text";
import type { Ui } from "../../ui/ui";

type View = "day" | "3day" | "week" | "month" | "list";
type Seg = { key: string; e: number; date: string; a: number; b: number; col: number; cols: number; h: number; from: number; to: number };
type Item = { key: string; e: number; allDay: boolean; d0: string; d1: string; m0: number; m1: number; s: number; f: number };
const HOUR_DEFAULT = 48, MIN_H = 34;
const VIEW_LABEL: Record<View, string> = { day: "Day", "3day": "3 days", week: "Week", month: "Month", list: "List" };

const addDays = (iso: string, n: number) => dayIso(dayNum(iso) + n);
const monday = (iso: string) => addDays(iso, -weekdayOf(iso));
const addMonths = (iso: string, n: number) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)!; const t = +m[1] * 12 + (+m[2] - 1) + n; const y = Math.floor(t / 12), mo = t % 12; const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return `${y}-${String(mo + 1).padStart(2, "0")}-${String(Math.min(+m[3], dim)).padStart(2, "0")}`; };
const dm = (iso: string) => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) });

function CalendarRenderer({ spec, ui, now, width }: { spec: CalSpec; ui: Ui; now?: number; width:number }) {
  const [view, setView] = useState<View>((spec.view as View) || "week");
  const [cursor, setCursor] = useState(spec.date);
  const [tz, setTz] = useState(spec.tz);
  const [readerTz, setReaderTz] = useState("");
  const [off, setOff] = useState<string[]>([]);
  const [phone, setPhone] = useState(false);
  const root = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  const pop = usePop(root);
  const [host, setHost] = useState({ w: 800, h: 600 });
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [hourH, setHourH] = useState(HOUR_DEFAULT);   // --calendar-hour-h, read once the page is live
  useEffect(() => { const v = parseFloat(getComputedStyle(root.current!).getPropertyValue("--calendar-hour-h")); if (v > 20 && v < 200) setHourH(v); }, []);

  // the phone opens in a 3-day view; the reader's own zone is offered when it differs
  useEffect(() => {
    try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (z && z !== spec.tz) setReaderTz(z); } catch {}
  },[spec.tz]);
  useEffect(()=>{
    if(!width)return;
    const narrow=width<640;setPhone(narrow);
    setView(v=>narrow&&v==="week"?"3day":!narrow&&v==="3day"?"week":v);
  },[width]);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); setHost({ w: Math.round(r.width), h: Math.round(r.height) }); };
    read(); const ro = new ResizeObserver(read); ro.observe(el); return () => ro.disconnect();
  }, []);

  const calOf = (e: number) => spec.calendars.find((c) => c.id === spec.events[e].cal);
  const colourOf = (e: number) => spec.events[e].colour ?? calOf(e)?.colour ?? (spec.calendars.length ? "acc" : "c1");
  const calKey = (e: number) => spec.events[e].cal;

  // every occurrence in the shown zone
  const items = useMemo<Item[]>(() => spec.occ.map((o, k) => {
    const ev = spec.events[o.e];
    if (ev.allDay) return { key: `o${k}`, e: o.e, allDay: true, d0: o.d0, d1: o.d1, m0: 0, m1: 0, s: 0, f: 0 };
    const a = wall(o.s, tz); let b = wall(o.f, tz);
    if (o.f === o.s) b = { date: a.date, min: a.min };
    let d1 = b.date, m1 = b.min;
    if (m1 === 0 && dayNum(d1) > dayNum(a.date)) { d1 = addDays(d1, -1); m1 = 1440; }
    return { key: `o${k}`, e: o.e, allDay: false, d0: a.date, d1, m0: a.min, m1, s: o.s, f: o.f };
  }), [spec, tz]);
  const shown = items.filter((it) => !off.includes(calKey(it.e)));
  const todayIso = now !== undefined ? wall(now, tz).date : spec.date;

  // the days a view shows
  const days = useMemo(() => {
    if (view === "day") return [cursor];
    if (view === "3day") return [0, 1, 2].map((k) => addDays(cursor, k));
    if (view === "week") { const m = monday(cursor); return [0, 1, 2, 3, 4, 5, 6].map((k) => addDays(m, k)); }
    return [];
  }, [view, cursor]);
  const monthDays = useMemo(() => {
    if (view !== "month") return [] as string[];
    const first = `${cursor.slice(0, 8)}01`, start = monday(first), dim = new Date(Date.UTC(dm(cursor).y, dm(cursor).m, 0)).getUTCDate();
    const weeks = Math.ceil((weekdayOf(first) + dim) / 7);
    return Array.from({ length: weeks * 7 }, (_, k) => addDays(start, k));
  }, [view, cursor]);

  const go = (dir: number) => setCursor((c) => view === "month" ? addMonths(c, dir) : view === "day" ? addDays(c, dir) : view === "3day" ? addDays(c, 3 * dir) : addDays(c, 7 * dir));
  const title = (() => {
    const f = (iso: string) => `${MONTHS[dm(iso).m - 1]} ${dm(iso).d}`;
    if (view === "month") return `${MONTHS_LONG[dm(cursor).m - 1]} ${dm(cursor).y}`;
    if (view === "day") return `${WEEKDAYS[weekdayOf(cursor)]}, ${f(cursor)}, ${dm(cursor).y}`;
    if (view === "list") return `From ${dateWords(cursor)}`;
    const a = days[0], b = days[days.length - 1];
    return `${f(a)} – ${dm(a).m === dm(b).m ? dm(b).d : f(b)}, ${dm(b).y}`;
  })();

  // timed segments of a day, laid out side by side when they overlap
  const segsOf = (date: string): Seg[] => {
    const raw = shown.filter((it) => !it.allDay && dayNum(it.d0) <= dayNum(date) && dayNum(date) <= dayNum(it.d1))
      .map((it) => ({ key: `${it.key}-${date}`, e: it.e, date, a: it.d0 === date ? it.m0 : 0, b: it.d1 === date ? it.m1 : 1440, col: 0, cols: 1, h: MIN_H, from: 0, to: 0 }));
    raw.sort((x, y) => x.a - y.a || y.b - x.b);
    const vis = (s: Seg) => Math.max(s.b, s.a + ((s.h + 2) / hourH) * 60);
    // Titles wrap before they shorten. Growing a short label also reserves its painted
    // height when assigning overlap columns; widths and heights settle together.
    for (let pass = 0; pass <= raw.length; pass++) {
      let cluster: Seg[] = [], end = -1;
      const flush = () => { const cols = Math.max(1, ...cluster.map((s) => s.col + 1)); cluster.forEach((s) => { s.cols = cols; }); cluster = []; };
      const lastEnd: number[] = [];
      for (const s of raw) {
        if (cluster.length && s.a >= end) { flush(); lastEnd.length = 0; end = -1; }
        let c = lastEnd.findIndex((x) => x <= s.a); if (c < 0) c = lastEnd.length;
        s.col = c; lastEnd[c] = vis(s); cluster.push(s); end = Math.max(end, vis(s));
      }
      flush();
      let grew = false;
      for (const s of raw) {
        const textW = Math.max(8, ((host.w - 50) / days.length / s.cols - 10) * 0.85);
        const need = Math.max(MIN_H, wrap(spec.events[s.e].title, textW, 12, Infinity).length * 15 + (s.cols > 1 ? 0 : 14) + 4);
        if (need > s.h) { s.h = need; grew = true; }
      }
      if (!grew) break;
    }
    return raw;
  };
  const allDayOf = (date: string) => shown.filter((it) => it.allDay && dayNum(it.d0) <= dayNum(date) && dayNum(date) <= dayNum(it.d1));
  const eventsOn = (date: string) => shown.filter((it) => dayNum(it.d0) <= dayNum(date) && dayNum(date) <= dayNum(it.d1)).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || a.m0 - b.m0 || a.e - b.e);

  const when = (it: Item): string => {
    const ev = spec.events[it.e];
    if (it.allDay) return it.d0 === it.d1 ? `${dateWords(it.d0)}, all day` : `${dateWords(it.d0)} to ${dateWords(it.d1)}, all day`;
    const t = it.d0 === it.d1 ? `${dateWords(it.d0)} ${hm(it.m0)}-${hm(it.m1)}` : `${dateWords(it.d0)} ${hm(it.m0)} to ${dateWords(it.d1)} ${hm(it.m1 === 1440 ? 0 : it.m1)}`;
    if (ev.tz !== tz) {
      const a = wall(it.s, ev.tz), b = wall(it.f, ev.tz);
      return `${t} (${tz})\n${hm(a.min)}-${hm(b.min)} on ${dateWords(a.date)} in ${ev.tz} (${zoneLabel(ev.tz, it.s)})`;
    }
    return t;
  };
  const openEvent = (it: Item) => (el: Element) => {
    const ev = spec.events[it.e], r = el.getBoundingClientRect(), h = root.current!.getBoundingClientRect();
    const lines = [[ev.place, calOf(it.e)?.name].filter(Boolean).join(" · "), ev.repeat ? `Repeats ${repeatWords(ev.repeat)}` : "", ev.note].filter(Boolean).join("\n");
    const [first, ...more] = when(it).split("\n");
    return { data: { id: it.key, title: ev.title, meta: first, text: [more.join("\n"), lines].filter(Boolean).join("\n") || undefined, tone: colourOf(it.e), actions: [{ label: "Open day", onClick: () => { setCursor(it.d0); setView("day"); pop.close(); } }] }, at: { x: r.left - h.left + r.width / 2, y: r.top - h.top + r.height / 2 } };
  };

  const evButton = (it: Item, cls: string, style?: React.CSSProperties, children?: React.ReactNode) => {
    const ev = spec.events[it.e];
    return <button key={it.key} type="button" className={`${cls} pl-${colourOf(it.e)} ${pop.open?.data.id === it.key ? "is-on" : ""}`} style={style} data-dh-slot={cls.includes("allday") ? "allday" : "event"} aria-label={`${ev.title}, ${when(it).split("\n")[0]}`} {...pop.anchor(it.key, openEvent(it))}>{children ?? <><b>{ev.title}</b>{!it.allDay ? <span>{hm(it.m0)}</span> : null}</>}</button>;
  };

  // keys: arrows move by a day or a week, d w m l switch views, t is today
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as Element).closest("input, select, textarea, .pop") || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowLeft") setCursor((c) => addDays(c, -1)); else if (k === "ArrowRight") setCursor((c) => addDays(c, 1));
    else if (k === "ArrowUp") setCursor((c) => addDays(c, -7)); else if (k === "ArrowDown") setCursor((c) => addDays(c, 7));
    else if (k === "d") setView("day"); else if (k === "w") setView(phone ? "3day" : "week"); else if (k === "m") setView("month"); else if (k === "l") setView("list"); else if (k === "t") setCursor(todayIso);
    else return;
    e.preventDefault();
  };
  // swipe moves by days
  const onTouchStart = (e: React.TouchEvent) => { swipe.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current; swipe.current = null; if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { pop.close(); go(dx < 0 ? 1 : -1); }
  };
  // Keep an event crossing the opening hour whole (including events converted from another zone).
  useEffect(() => {
    const opening = spec.hours[0] * 60;
    const starts = days.flatMap(d => shown.filter(it => !it.allDay && it.d0 <= d && d <= it.d1)
      .map(it => ({ a: it.d0 === d ? it.m0 : 0, b: it.d1 === d ? it.m1 : 1440 }))
      .filter(it => it.a < opening && it.b >= opening).map(it => it.a));
    if (scroller.current) scroller.current.scrollTop = Math.max(0, Math.min(opening, ...starts) / 60 * hourH - 10);
  }, [view, cursor, tz, spec.hours, hourH]);

  const dayHead = (d: string, k?: number) => (
    <div key={d} className={`cal-dh ${d === todayIso ? "is-today" : ""} ${weekdayOf(d) > 4 ? "is-weekend" : ""}`} data-dh-slot="day-head">
      <span className="cal-dow">{WEEKDAYS[weekdayOf(d)]}</span><span className="cal-dnum">{dm(d).d}</span>
    </div>
  );
  const cols = days.length;
  const calendarsShown = spec.calendars.length ? spec.calendars : [];

  let body: React.ReactNode;
  if (view === "month") {
    const sel = eventsOn(cursor);
    body = (
      <div className="cal-month" data-dh-slot="grid" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="cal-mh">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="cal-mg">
          {monthDays.map((d) => {
            const ev = eventsOn(d), outside = dm(d).m !== dm(cursor).m, max = phone ? 0 : 3;
            return (
              <div key={d} className={`cal-cell ${outside ? "is-out" : ""} ${weekdayOf(d) > 4 ? "is-weekend" : ""} ${d === cursor ? "is-cursor" : ""}`}>
                <button type="button" className={`cal-cn ${d === todayIso ? "is-today" : ""}`} aria-label={`${dateWords(d)}, ${ev.length} event${ev.length === 1 ? "" : "s"}`} onClick={() => { setCursor(d); if (!phone) setView("day"); }}>{dm(d).d}</button>
                {phone ? <div className="cal-dots" aria-hidden="true">{ev.slice(0, 4).map((it) => <i key={it.key} className={`pl-${colourOf(it.e)}`} />)}</div>
                  : <div className="cal-chips">{ev.slice(0, max).map((it) => evButton(it, "cal-chip", undefined, <span>{!it.allDay ? <em>{hm(it.m0)}</em> : null} {spec.events[it.e].title}</span>))}
                    {ev.length > max ? <button type="button" className="cal-more" data-dh-slot="more" onClick={() => { setCursor(d); setView("day"); }}>+{ev.length - max} more</button> : null}</div>}
              </div>
            );
          })}
        </div>
        {phone ? (
          <div className="cal-daylist" data-dh-slot="list-row">
            <div className="cal-dl-h">{dateWords(cursor)}</div>
            {sel.length ? sel.map((it) => evButton(it, "cal-row", undefined, <><i className="cal-rbar" /><span className="cal-rt">{it.allDay ? "all day" : hm(it.m0)}</span><b>{spec.events[it.e].title}</b></>)) : <p className="cal-none">Nothing on this day.</p>}
          </div>
        ) : null}
      </div>
    );
  } else if (view === "list") {
    const groups: { d: string; its: Item[] }[] = [];
    const lo = dayNum(cursor);
    const ds = [...new Set(shown.flatMap((it) => { const out: string[] = []; for (let n = Math.max(dayNum(it.d0), lo); n <= Math.min(dayNum(it.d1), lo + 60); n++) out.push(dayIso(n)); return out; }))].sort();
    for (const d of ds) groups.push({ d, its: eventsOn(d) });
    body = (
      <div className="cal-list" data-dh-slot="grid" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {groups.length ? groups.map((g) => (
          <section key={g.d} className="cal-lg"><h4 className={`cal-lh ${g.d === todayIso ? "is-today" : ""}`}>{dateWords(g.d)}</h4>
            {g.its.map((it) => evButton(it, "cal-row", undefined, <><i className="cal-rbar" /><span className="cal-rt">{it.allDay ? "all day" : `${hm(it.m0)}-${hm(it.m1 === 1440 ? 0 : it.m1)}`}</span><b>{spec.events[it.e].title}</b><span className="cal-rc">{[spec.events[it.e].place, calOf(it.e)?.name].filter(Boolean).join(" · ")}</span></>))}
          </section>
        )) : <p className="cal-none">No events in the 60 days from {dateWords(cursor)}.</p>}
      </div>
    );
  } else {
    const hasAllDay = days.some((d) => allDayOf(d).length);
    body = (
      <div className="cal-tg" data-dh-slot="grid" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="cal-head" style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(0, 1fr))` }}><span />{days.map((d) => dayHead(d))}</div>
        {hasAllDay ? <div className="cal-band" style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(0, 1fr))` }}><span className="cal-bl">all day</span>{days.map((d) => <div key={d} className="cal-bc">{allDayOf(d).map((it) => evButton({ ...it, key: `${it.key}-${d}` }, "cal-allday", undefined, <b>{spec.events[it.e].title}</b>))}</div>)}</div> : null}
        <div className="cal-scroll" ref={scroller}>
          <div className="cal-body" style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(0, 1fr))`, height: 24 * hourH }}>
            <div className="cal-hours">{Array.from({ length: 24 }, (_, h) => <span key={h} className="hour" data-dh-slot="hour" style={{ top: h * hourH }}>{h ? `${String(h).padStart(2, "0")}:00` : ""}</span>)}</div>
            {days.map((d) => (
              <div key={d} className={`cal-col ${weekdayOf(d) > 4 ? "is-weekend" : ""} ${d === todayIso ? "is-today" : ""}`}>
                {segsOf(d).map((s) => {
                  const it = shown.find((x) => `${x.key}-${d}` === s.key)!;
                  const top = (s.a / 60) * hourH, h = Math.max(((s.b - s.a) / 60) * hourH - 2, s.h);
                  return evButton({ ...it, key: s.key }, `cal-ev${h < 34 ? " is-short" : ""}${s.cols > 1 ? " is-narrow" : ""}`, { top, height: h, left: s.cols > 1 ? `${(s.col / s.cols) * 100}%` : "1px", width: s.cols > 1 ? `${100 / s.cols}%` : "calc(100% - 3px)" });
                })}
                {now && wall(now, tz).date === d ? <i className="cal-now" style={{ top: (wall(now, tz).min / 60) * hourH }} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const views: View[] = phone ? ["day", "3day", "month", "list"] : ["day", "week", "month", "list"];
  return (
    <div className="cal" data-dh-part="calendar" ref={root} onKeyDown={onKey} tabIndex={-1}>
      {spec.title ? <div className="cal-title-line">{spec.title}</div> : null}
      <div className="cal-bar" data-dh-slot="toolbar">
        <div className="cal-nav" role="group" aria-label="Move">
          <button type="button" className="cal-btn" onClick={() => { pop.close(); go(-1); }} aria-label="Back">←</button>
          <button type="button" className="cal-btn cal-today" onClick={() => { pop.close(); setCursor(todayIso); }}>Today</button>
          <button type="button" className="cal-btn" onClick={() => { pop.close(); go(1); }} aria-label="Next">→</button>
        </div>
        <label className="cal-pick"><span className="cal-title" aria-live="polite">{title}</span><input type="date" value={cursor} aria-label="Go to date" onChange={(e) => { if (e.target.value) { pop.close(); setCursor(e.target.value); } }} /></label>
        <div className="cal-views" role="group" aria-label="View">
          {views.map((v) => <button key={v} type="button" className="cal-btn" aria-pressed={view === v} onClick={() => { pop.close(); setView(v); }}>{VIEW_LABEL[v]}</button>)}
        </div>
      </div>
      {(calendarsShown.length > 0 || readerTz) ? (
        <div className="cal-opts">
          <div className="cal-legend" role="group" aria-label="Calendars">
            {calendarsShown.map((c) => <button key={c.id} type="button" className={`cal-chipbtn pl-${c.colour}`} aria-pressed={!off.includes(c.id)} onClick={() => setOff((o) => (o.includes(c.id) ? o.filter((x) => x !== c.id) : [...o, c.id]))}><i />{c.name}</button>)}
          </div>
          {readerTz ? <label className="cal-tz">Times in <select value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Time zone"><option value={spec.tz}>{spec.tz}</option><option value={readerTz}>{readerTz} (yours)</option></select></label> : null}
        </div>
      ) : null}
      {body}
      <p className="cal-hint">Arrows move by a day or a week · d w m l change the view · t is today{phone ? " · swipe to move" : ""}</p>
      {pop.node}
    </div>
  );
}

export default function CalendarView(p: import("../types").PartViewProps<CalSpec>) {
  const {now}=useDh();
  const sx=useStatic(p.static,0);
  if(p.data.errors.length)return <div className="cw-error">{p.data.errors[0].msg}</div>;
  if(sx.on)return <CalendarStill spec={p.data}/>;
  return <CalendarRenderer spec={p.data} ui={p.ui} now={now} width={p.stage.width}/>;
}

function CalendarStill({spec}:{spec:CalSpec}) {
  const start=(o:CalSpec["occ"][number])=>{const ev=spec.events[o.e],a=ev.allDay?{date:o.d0,min:0}:wall(o.s,spec.tz);return dayNum(a.date)*1440+a.min;};
  const ordered=[...spec.occ].sort((a,b)=>start(a)-start(b)||a.e-b.e);
  return <section className="cal cal-static" data-dh-part="calendar" data-dh-static="true" aria-label={spec.title||"Calendar"}>
    {spec.title&&<h3>{spec.title}</h3>}<p className="cal-zone">{spec.tz}</p>
    <ol className="cal-static-list">{ordered.map((o,k)=>{
      const ev=spec.events[o.e],cal=spec.calendars.find(c=>c.id===ev.cal),a=wall(o.s,spec.tz),b=wall(o.f,spec.tz);
      const when=ev.allDay?dateWords(o.d0)+(o.d1!==o.d0?" – "+dateWords(o.d1):"")+", all day":dateWords(a.date)+" "+hm(a.min)+" – "+(b.date!==a.date?dateWords(b.date)+" ":"")+hm(b.min);
      return <li key={k} className={"pl-"+(ev.colour??cal?.colour??"c1")}><time>{when}</time><strong>{ev.title}</strong>{cal&&<span>{cal.name}</span>}{ev.place&&<span>{ev.place}</span>}{ev.note&&<p>{ev.note}</p>}</li>;
    })}</ol>{!spec.occ.length&&<p>No events.</p>}
  </section>;
}
