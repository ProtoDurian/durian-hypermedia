---
title: "Animation: a panel with an enlarged inset"
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

## Animation: a panel with an enlarged inset

Place the panels before the time block. A lone panel with two shares leaves room for the enlarged inset; on a phone the panel, inset and overview stack in that order.

```animation
title: A close look | panel and detail
panels
time: 0..12 | overview
ticks: 0, 4, 8, 12
zoom: 8..12 | enlarged
zoom ticks: 8, 10, 12
zoom row job detail "Detail": +working 8..12
row job run "Run": +working 0..12
@step Begin: The same places are reserved from the first step.
@step Calculate: A calculation occupies the left half.
beside 1, 1
list Calculation
  first: 1
  second: 2
note: The saved sample is checked before the overview continues.
@step Finish: The result keeps the same place.
beside 1, 1
list Result
  first: 3
note: The result is ready to compare with the full window.
```
