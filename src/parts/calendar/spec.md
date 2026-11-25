#### Calendar

````
```calendar title="Launch week" tz=America/Los_Angeles date=2026-11-23 view=week
calendar eng "Engineering" [c2]
2026-11-23 09:00-09:15 Stand-up in eng every weekday until 2026-12-18
2026-11-24 14:00-15:30 Design review @ Room 4 in eng note="Bring the mock-ups"
2026-11-25 all day Code freeze [warn]
2026-11-26 .. 2026-11-27 Thanksgiving [muted]
2026-11-25 18:00-19:00 Call with the Sydney team tz=Australia/Sydney
```
````

- **An event line:** `<date> <start>-<end> <title>`, or `<date> all day <title>`, or `<date> .. <date> <title>` (all day, both days included), or `<date> <time> .. <date> <time> <title>`; then, in any order, `@ <place>`, `in <calendar>`, `[colour]`, `note="..."`, `tz=<zone>` (the event's own zone; it is shown in the calendar's) and a repeat: `every day|weekday|week|N days|N weeks|month|year [on Mon, Wed] [until <date> | times=<n>] [except <date>, <date>]`. A `calendar <id> "Name" [colour]` line declares a calendar. Dates are ISO, times 24-hour.
- **Fence keys:** `tz=` (the zone it is shown in), `date=` (where it opens; "Today" returns to it while the host gives no clock), `view=day|week|month|list`, `hours=08-20` (the hours a day or week shows first).
- **Explorable:** day, week, month and list views (a phone opens in a 3-day view); Back, Today, Next; a date picker in the title; a legend that switches calendars off and on; the reader's own time zone when it differs; a card for every event; overlapping events share the width; keys `d w m l t` and arrows; a swipe moves by days. Weeks start on Monday.
- **Repeats are expanded by our own code under the document's work budget** (`src/core/budget.ts`); a repeat with no end stops at the cap of 2,000 occurrences and is refused.
- **The LLM view:** `Calendar: <title> (times in <zone>).`, the repeats in words (`Every weekday 09:00-09:15 from Mon 23 Nov 2026 until Fri 18 Dec 2026: Stand-up (Engineering)`), then the dated list in order; an event in another zone also says its own time there.
- **doccheck refuses:** a date or time that is not ISO or 24-hour; an end before its start; an unknown zone (checked with `Intl`); an unknown calendar or colour; a repeat it cannot read (it lists the forms); `until` before the start; a repeat with no end; a repeat that makes over the cap; over 500 lines; a spent budget. It warns when two events of one calendar overlap exactly.


- **Static and print:** a read-only dated list keeps every expanded occurrence, title, calendar, place, note and time zone, with no toolbar or motion. `DocumentView now={epochMilliseconds}` supplies the optional host clock.
