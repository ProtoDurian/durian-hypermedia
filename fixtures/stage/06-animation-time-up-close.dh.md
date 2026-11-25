---
title: "Animation: time up close"
description: A fixture made from the Format page section of the same name (a composed stage).
roles:
  client: c1
  server: c2
  store: c3
  job: c4
  cache: c5
  ops: c6
  plain: c0
---

## Animation: time up close

The full ruler and an enlarged inset share the same data. The handoff marker stays at 30 seconds, and progress uses a continuous value axis. A narrow page stacks the inset below the overview.

```animation
title: A studio export | prepare, render, deliver
time: 0..60 | seconds
ticks: 0, 15, 30, 45, 60
row job export "export": +prepare 0..24; +render 24..36; delivered 36..60
row server review "review": waiting 0..30; +checking 30..45; accepted 45..60
at 30: 30 s, review starts
zoom: 24..36 | Close-up
plot: 0..100 | percent complete
point job start at 0: 0 | Start
point job prepared at 24: 25 | Prepared
point job halfway at 30: 50 | Halfway
point job rendered at 36: 75 | Rendered
point job finish at 60: 100 | Complete
@step Prepare: Preparation takes the first 24 seconds.
span export 0..24: preparation
@step Handoff: Review begins halfway through rendering.
at 30: halfway
span export 24..36: rendering
@step Deliver: The export finishes before review ends.
at 36: export complete
```
