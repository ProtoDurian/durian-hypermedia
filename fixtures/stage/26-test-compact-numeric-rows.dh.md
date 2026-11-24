---
title: "Test: compact numeric rows"
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

## Test: compact numeric rows

On a phone, dense numbered cells show every digit, bottom to top when the number cannot fit level. A short row heading can sit beside the cells.

```animation
title: A compact schedule | two clocks
time slots: 200..232 | shifts
ruler: none
cells: 1
row job slots "": +_ 200..232 [numbered]
time reads: 0..31 | reading clock
ruler: none
row labels: beside
cells: 1
row server readings "reads": count 0..31
@step Read: Both clocks keep their full ranges.
@step Check: A guide marks a saved reading.
keep at reads 12 [guide]: saved
```
