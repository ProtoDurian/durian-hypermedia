---
title: "Animation: time detail, static"
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

## Animation: time detail, static

The same real axes can be printed as a selected step. The marker, inset and values keep their places.

```animation static=2
title: A studio export | the handoff, held still
time: 0..60 | seconds
row job export "export": +prepare 0..24; +render 24..36; delivered 36..60
at 30: 30 s, review starts
zoom: 24..36 | Close-up
plot: 0..100 | percent complete
point job start at 0: 0 | Start
point job halfway at 30: 50 | Halfway
point job finish at 60: 100 | Complete
@step Prepare: The first 24 seconds prepare the export.
span export 0..24: preparation
@step Handoff: Review begins halfway through rendering.
at 30: halfway
```
