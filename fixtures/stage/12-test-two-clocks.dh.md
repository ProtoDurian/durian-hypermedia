---
title: "Test: two clocks"
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

## Test: two clocks

Name each axis when a scene compares clocks. A numbered state prints each cell's interval start, and a marker can name its axis explicitly.

```animation
title: Two clocks | one task at two scales
time minutes: 0..8 | minutes
ruler: none
cells: 1
row job m "Minutes": +_ 0..4 [numbered]; _ 4..8 @2 [numbered]
time ticks: 40..48 | ticks
ruler: none
cells: 1
row server r "": +_ 40..44 [numbered]; _ 44..48 @2 [numbered]
@step First: The clocks show different ranges.
keep at minutes 3 [guide] [below]: minute
keep at ticks 43 [solid] [plain] [below]: tick
@step Second: The later cells arrive without moving earlier ones.
keep span r 40..44 [line]: early range
```
