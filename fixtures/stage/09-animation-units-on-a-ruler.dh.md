---
title: "Animation: units on a ruler"
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

## Animation: units on a ruler

Every cell is one hour. State changes, markers and spans use the same ruler.

```animation
title: A workshop day | one cell per hour
time: 0..12 | hours
cells: 1
ticks: 0, 3, 6, 9, 12
row job batch "batch": queued 0..3; +working 3..9; done 9..12 @2
row server pack "packing": _ 0..6 [dashed]; hold 6..7 @1 [warn]; +box 6..7 @2 [lit]; packing 7..11 @2 [good]; done 11..12 @2
at 6: packing begins
@step Make: The batch takes six hours to make.
keep span batch 3..9 [warn]: six hours
@step Pack: Packing overlaps the last three hours of making.
keep at 6 [bad]: both are active
```
