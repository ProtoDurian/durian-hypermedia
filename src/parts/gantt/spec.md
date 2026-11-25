#### Gantt

````
```gantt title="Release 2.0" today=2026-12-09
section Build
design "Design" 2026-12-01 .. 2026-12-04 done
api "API" after design 8d 60%
ui "Screens" after design 6d
section Ship
beta "Beta" after api ui 3d [warn]
launch "Launch" milestone after beta
```
````

- A task line is `<id> "label" <start> <end or length> [progress%] [done] [colour]`. A start is a date (`2026-12-01`), a date and time (`2026-12-01T09:00`) or `after <id> [<id> ...]` (the day after the last of them ends). An end is `.. <date>` (the last day of the bar) or a length: `3d`, `2w`, `4h`, `90m`. `milestone` is a point. `section <name>` groups the lines after it. An id is letters, digits, `_`, `.` and `-`; colours are the colour words (`c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`), never a hex value.
- **Fence keys:** `title=`, `today=` (a line on that date; never the real clock), `workdays=on` (lengths skip Saturday and Sunday), `critical=on` (the longest chain of `after`s is outlined), `tz=` (an IANA zone; dates are wall-clock in it, default UTC).
- **Steps:** `progress <id> 80%`, `done <id>`, `move <id> 2026-12-12` (a slip; the tasks after it follow); tasks and sections written under a step appear in it. **Static:** `static=` on the fence draws one step whole, at the scale the page picked, with no Day/Week/Month buttons, no control row and no hint.
- **Reading it:** hover, tap or focus a bar for its dates and what it waits for; Day, Week and Month change the scale; on a phone the names sit above the bars and the scale scrolls sideways inside its box. A table of the tasks sits under it. The part is the same height before and after the page measures its width, so the Next button never moves under a finger.
- **LLM view:** `Gantt: <title>.` and a table `task | start | end | after` for each section (progress, done and milestone in the task cell), then the critical chain with `critical=on`, and for each later step only the tasks that changed.
- **Caps:** `ganttTasks` (200; 100 in UNTRUSTED_LIMITS), `ganttSteps` (30; 15), `ganttSections` (30; 15), `ganttDeps` (600 `after` arrows; 300) and `ganttSpanDays` (3,700 days; 1,850). The schedule of every task at every step is charged to the page's work budget when the part is read.
- **doccheck refuses:** `after` an unknown id, a task that waits for itself or for one that first appears in a later step, a loop of `after`s (it names the tasks), an end before its start, an unknown length unit, a length of 0 or a length over the span, progress over 100%, a task written twice, an unknown colour, a line it does not understand, a step command (`progress`, `done`, `move`) outside a step or on an unknown task, an unknown fence key, a `tz`, `today` or `workdays` it cannot read, no tasks, more tasks, sections, arrows or steps than the caps, a chart that would span more days than the cap, and a part over the page's work budget. It warns on a label over 60 characters.
