---
title: "Animation: counted columns"
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

## Animation: counted columns

A `columns` block is a dot histogram: one column per category, one dot per counted thing, stacked from the bottom. The columns' places are kept for the widest step, so adding columns moves nothing; `new` lights columns in the step that adds them.

```animation
title: A lending library | one dot per book returned
columns 12 store: books returned each month, one dot each, in their month's column | books
  every 3
  labels: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
@step First half: Six months: 12 to 31 books a month.
counts 6: 24, 19, 31, 22, 27, 12
@step The year: The second half adds six columns; the summer months are quiet.
counts 12: 24, 19, 31, 22, 27, 12, 9, 11, 28, 30, 26, 35
light Jul..Dec
@step December: December is the busiest month of the year.
light Dec
```
