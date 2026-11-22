---
title: Gantt, good
---
# Gantt

A release plan with sections, `after`, a milestone, progress, a colour and a today line.

```gantt title="Release 2.0" today=2026-12-09
section Build
design "Design" 2026-12-01 .. 2026-12-04 done
api "API" after design 8d 60%
ui "Screens" after design 6d
section Ship
beta "Beta" after api ui 3d [warn]
launch "Launch" milestone after beta
```

Steps change the plan as time passes; a slip carries what follows. Working days only, and the longest chain outlined.

```gantt title="A release that slips" workdays=on critical=on today=2026-12-14 tz=America/Los_Angeles
section Build
design "Design" 2026-12-01 .. 2026-12-04 done
api "API" after design 8d 40%
ui "Screens" after design 6d
section Test
qa "QA" after api ui 5d
@step The plan on 1 December
@step Design is done, the API is under way
progress api 60%
done ui
@step The API slips by a week
move api 2026-12-14
launch "Launch" milestone after qa
```

Hours and minutes, with a date and time start.

```gantt title="Deploy night" tz=UTC
prep "Prepare" 2026-12-05T20:00 90m
cut "Cut over" after prep 2h [bad]
check "Smoke test" after cut 45m
```
