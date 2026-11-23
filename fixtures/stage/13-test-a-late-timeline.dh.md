---
title: "Test: a late timeline"
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

## Test: a late timeline

A named time block can appear in a later step without moving the surrounding drawing. Hide its ruler while retaining its caption and true proportions. Words may sit after thin bars.

```animation
title: A publishing desk | three measured intervals
track: job prepare, review, publish
time durations: 0..24 | seconds
ruler: none
row job first "First": _ 0..6 [dashed] [after]
row server next "Next": +ready 0..12 [after]
row job last "Last": +finish 0..24 [after]
@step Prepare: The intervals have a reserved place.
at prepare
@step Review: The layout stays fixed.
at review
@step Publish: The measured bars appear together.
at publish
show durations
```
