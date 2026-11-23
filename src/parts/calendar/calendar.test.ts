import {describe,expect,test} from "bun:test";
import {Budget,BudgetError,pageBudget} from "../../core/budget";
import {parse,check,LIMITS} from "../../index";
const attrs = (s: string) => Object.fromEntries([...s.matchAll(/(\w+)=("([^"]*)"|\S+)/g)].map((m) => [m[1], m[3] ?? m[2]]));
// a fenced part as the parser would hand it over: the info string's attributes, the body, the steps
function part(body: string, info = "") {
  const lines = body.split("\n"), head: string[] = [], steps: { title: string; raw: string; line: number }[] = [];
  let cur: { title: string; raw: string[]; line: number } | null = null;
  lines.forEach((l, i) => {
    const m = l.match(/^@step\s*(.*)$/);
    if (m) { if (cur) steps.push({ title: cur.title, raw: cur.raw.join("\n"), line: cur.line }); cur = { title: m[1], raw: [], line: i + 2 }; } else (cur ? cur.raw : head).push(l);
  });
  if (cur) steps.push({ title: (cur as any).title, raw: (cur as any).raw.join("\n"), line: (cur as any).line });
  return { line:1, head: head.join("\n"), body, bodyLine: 2, steps, attrs: attrs(info) };
}
const msgs = (e: { msg: string }[]) => e.map((x) => x.msg).join("\n");
import {CAL_CAPS,calendarLlm,calendarOf,parseCalendar,parseRepeat,repeatDates} from "./model";
import {dayNum,instant,wall,weekdayOf,isZone,isDate} from "../kit/places";
const page=(s:string)=>"# Calendar\n\n"+s;
describe("calendar: parse and expand", () => {
  const body = [
    `calendar eng "Engineering" [c2]`, `calendar ops "On-call" [c5]`,
    `2026-11-23 09:00-09:15 Stand-up in eng every weekday until 2026-12-18`,
    `2026-11-24 14:00-15:30 Design review @ Room 4 in eng note="Bring the mock-ups"`,
    `2026-11-25 all day Code freeze [warn]`,
    `2026-11-26 .. 2026-11-27 Thanksgiving [muted]`,
    `2026-11-24 23:00 .. 2026-11-25 01:00 Database migration in ops`,
    `2026-11-25 18:00-19:00 Call with the Sydney team tz=Australia/Sydney`,
  ].join("\n");
  const s = calendarOf(part(body, `title="Launch week" tz=America/Los_Angeles date=2026-11-23 view=week`));
  test("events, calendars, places, notes, colours", () => {
    expect(s.errors).toEqual([]);
    expect(s.calendars.map((c) => [c.id, c.name, c.colour])).toEqual([["eng", "Engineering", "c2"], ["ops", "On-call", "c5"]]);
    const e = s.events;
    expect([e[0].title, e[0].cal, e[0].startMin, e[0].endMin]).toEqual(["Stand-up", "eng", 540, 555]);
    expect([e[1].title, e[1].place, e[1].cal, e[1].note]).toEqual(["Design review", "Room 4", "eng", "Bring the mock-ups"]);
    expect([e[2].allDay, e[2].colour]).toEqual([true, "warn"]);
    expect([e[3].startDate, e[3].endDate, e[3].allDay]).toEqual(["2026-11-26", "2026-11-27", true]);
    expect([e[4].startDate, e[4].endDate, e[4].startMin, e[4].endMin]).toEqual(["2026-11-24", "2026-11-25", 1380, 60]);
    expect(e[5].tz).toBe("Australia/Sydney");
  });
  test("every weekday until a date: 20 stand-ups, none on a weekend", () => {
    const o = s.occ.filter((x) => x.e === 0);
    expect(o.length).toBe(20);
    expect(o.every((x) => weekdayOf(x.d0) < 5)).toBe(true);
    expect(o[0].d0).toBe("2026-11-23"); expect(o[19].d0).toBe("2026-12-18");
  });
  test("an event in another zone is shown in the calendar's zone", () => {
    const o = s.occ.find((x) => x.e === 5)!;
    expect(wall(o.s, "America/Los_Angeles")).toEqual({ date: "2026-11-24", min: 23 * 60 });
    expect(wall(o.s, "Australia/Sydney")).toEqual({ date: "2026-11-25", min: 18 * 60 });
  });
  test("zones: instants round-trip across a daylight-saving change", () => {
    const t = instant("2026-03-08", 12 * 60, "America/Los_Angeles");   // the day the US clocks go forward
    expect(wall(t, "America/Los_Angeles")).toEqual({ date: "2026-03-08", min: 720 });
    expect(wall(instant("2026-11-01", 90, "America/Los_Angeles"), "America/Los_Angeles").date).toBe("2026-11-01");
    expect(isZone("America/Los_Angeles") && isZone("UTC") && !isZone("Mars/Base")).toBe(true);
  });
  test("view: a fence key, or week when it fits 7 days and month when it does not", () => {
    expect(s.view).toBe("week");
    const wide = calendarOf(part(`2026-11-23 10:00-11:00 A\n2026-12-23 10:00-11:00 B`, `tz=UTC`));
    expect(wide.view).toBe("month");
    expect(calendarOf(part(`2026-11-23 10:00-11:00 A\n2026-11-25 10:00-11:00 B`, `tz=UTC`)).view).toBe("week");
  });
  test("repeats: every 2 weeks on Mon times=3; times and except", () => {
    expect(repeatDates("2026-11-30", (parseRepeat("2 weeks on Mon times=3", "2026-11-30") as any).repeat, 50).dates).toEqual(["2026-11-30", "2026-12-14", "2026-12-28"]);
    expect(repeatDates("2026-11-23", (parseRepeat("day times=5 except 2026-11-25", "2026-11-23") as any).repeat, 50).dates).toEqual(["2026-11-23", "2026-11-24", "2026-11-26", "2026-11-27"]);
    expect(repeatDates("2026-11-23", (parseRepeat("week on Mon, Wed until 2026-12-02", "2026-11-23") as any).repeat, 50).dates).toEqual(["2026-11-23", "2026-11-25", "2026-11-30", "2026-12-02"]);
  });
  test("a monthly repeat on the 31st skips the months that have no 31st", () => {
    const d = repeatDates("2026-01-31", (parseRepeat("month times=5", "2026-01-31") as any).repeat, 50).dates;
    expect(d).toEqual(["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31", "2026-08-31"].slice(0, 5));
  });
  test("a yearly repeat", () => expect(repeatDates("2026-11-23", (parseRepeat("year times=3", "2026-11-23") as any).repeat, 50).dates).toEqual(["2026-11-23", "2027-11-23", "2028-11-23"]));
  test("the LLM view: repeats in words, then the dated list, with the other zone said", () => {
    const t = calendarLlm(s);
    expect(t).toContain("Calendar: Launch week (times in America/Los_Angeles).");
    expect(t).toContain("- Every weekday 09:00-09:15 from Mon 23 Nov 2026 until Fri 18 Dec 2026: Stand-up (Engineering)");
    expect(t).toContain("- Tue 24 Nov 2026 14:00-15:30: Design review, Room 4 (Engineering). Bring the mock-ups");
    expect(t).toContain("Tue 24 Nov 2026 23:00 to Wed 25 Nov 2026 00:00 (18:00-19:00 on Wed 25 Nov 2026 in Australia/Sydney): Call with the Sydney team.");
    expect(t).toContain("- Thu 26 Nov 2026 to Fri 27 Nov 2026, all day: Thanksgiving.");
  });
});

describe("calendar: every refusal, the cap and the budget", () => {
  const bad = (...lines: string[]) => msgs(calendarOf(part(lines.join("\n"), `tz=UTC`)).errors);
  test("a date that is not ISO", () => expect(bad(`11/23/2026 10:00-11:00 A`)).toContain(`"11/23/2026" is not an ISO date`));
  test("a date that does not exist", () => expect(bad(`2026-02-30 10:00-11:00 A`)).toContain(`"2026-02-30" is not an ISO date`));
  test("a time that is not 24-hour", () => { expect(bad(`2026-11-23 25:00-26:00 A`)).toContain("is not a 24-hour time"); expect(bad(`2026-11-23 9am-10am A`)).toContain("not a 24-hour time"); });
  test("an end before its start", () => { expect(bad(`2026-11-23 11:00-10:00 A`)).toContain("ends (10:00) before it starts (11:00)"); expect(bad(`2026-11-23 .. 2026-11-22 A`)).toContain("before it starts"); });
  test("an unknown zone", () => { expect(bad(`2026-11-23 10:00-11:00 A tz=Mars/Base`)).toContain(`unknown time zone "Mars/Base"`); expect(msgs(calendarOf(part(`2026-11-23 10:00-11:00 A`, `tz=Nowhere/X`)).errors)).toContain(`unknown time zone "Nowhere/X"`); });
  test("an unknown calendar names the known ones", () => expect(bad(`calendar eng "Eng"`, `2026-11-23 10:00-11:00 A in nope`)).toContain(`unknown calendar "nope"; the calendars are eng`));
  test("an unknown colour", () => expect(bad(`2026-11-23 10:00-11:00 A [pink]`)).toContain(`unknown colour "[pink]"`));
  test("a repeat it cannot read lists the forms", () => expect(bad(`2026-11-23 10:00-11:00 A every fortnight`)).toContain("the forms are: every day | every weekday"));
  test("until before the start", () => expect(bad(`2026-11-23 10:00-11:00 A every day until 2026-11-01`)).toContain("is before the start date"));
  test("an unknown view and bad hours", () => { expect(msgs(calendarOf(part(`2026-11-23 10:00-11:00 A`, `view=year`)).errors)).toContain("the views are day, week, month, list"); expect(msgs(calendarOf(part(`2026-11-23 10:00-11:00 A`, `hours=20-08`)).errors)).toContain("hours="); });
  test("a repeat with no end stops at the cap and is refused", () => {
    const t = calendarOf(part(`2026-11-23 10:00-11:00 Stand-up every day`, `tz=UTC`));
    expect(t.occ.length).toBe(CAL_CAPS.occurrences);
    expect(msgs(t.errors)).toContain("has no end");
    expect(msgs(t.errors)).toContain("until <date>");
  });
  test("a repeat that ends but makes too many events is refused", () => {
    const t = calendarOf(part(`2026-01-01 10:00-11:00 Daily every day until 2040-01-01`, `tz=UTC`));
    expect(t.occ.length).toBe(CAL_CAPS.occurrences); expect(msgs(t.errors)).toContain("makes more than the cap of 2000");
  });
  test("over 500 lines", () => expect(bad(...Array.from({ length: 501 }, (_, i) => `2026-11-23 10:00-11:00 E${i}`))).toContain("the cap is 500"));
  test("repeat loops charge the caller's budget and cannot restart it",()=>{
    const b=new Budget({steps:100,values:2000,chars:10000});
    expect(()=>calendarOf(part('2026-11-23 10:00-11:00 Daily every day times=1000'),b)).toThrow(BudgetError);
    expect(()=>calendarOf(part('2026-11-23 10:00-11:00 Again'),b)).toThrow(BudgetError);
  });
  test("two events that overlap exactly warn", () => {
    const i = check(parse(page("```calendar tz=UTC\n2026-11-23 10:00-11:00 A\n2026-11-23 10:00-11:00 B\n```")));
    expect(i.filter((x) => x.level === "warn").map((x) => x.message).join()).toContain("overlaps the event at line");
  });
});

