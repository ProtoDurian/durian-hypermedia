A task line is `<id> "label" <start> <end or length> [progress%] [done] [colour]`; a start is a date or `after <id> ...`; `milestone` is a point; `section` groups the lines after it. `today=` draws a line (never the real clock). Hover, tap or focus a bar for its dates and what it waits for; Day, Week and Month change the scale.

```gantt title="Release 2.0" today=2026-12-09
section Build
design "Design" 2026-12-01 .. 2026-12-04 done
api "API" after design 8d 60%
ui "Screens" after design 6d
section Ship
beta "Beta" after api ui 3d [warn]
launch "Launch" milestone after beta
```

Under steps, `progress`, `done` and `move` change the plan as time passes; a slip carries the tasks after it. `workdays=on` makes lengths skip Saturday and Sunday, and `critical=on` outlines the longest chain.

```gantt title="A release that slips" workdays=on critical=on today=2026-12-14
section Build
design "Design" 2026-12-01 .. 2026-12-04 done
api "API" after design 8d 40%
ui "Screens" after design 6d
section Test
qa "QA" after api ui 5d
@step The plan on 1 December
@step Design is done, the API is under way
progress api 60%
progress ui 100%
@step The API slips by a week
move api 2026-12-14
launch "Launch" milestone after qa
```
