---
title: "Test: labelled columns"
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

## Test: labelled columns

Boxed headers use the same columns as the ordinary cell rows. Tick positions name column centres; labels can include a short word.

```animation
title: A work week | one column per shift
time: 0..7 | shifts
cells: 1 | headers
ticks: 0.5 first, 1.5 second, 2.5 third check, 3.5 fourth, 4.5 fifth, 5.5 sixth switch, 6.5 seventh
row job draft "Draft": +ready 0..4; waiting 4..5 @1; +ready 4..5 @2; waiting 5..7
row server copy "Copy": waiting 0..7
@step Wait: The fifth shift waits.
@step Ready: The fifth shift is ready.
```
