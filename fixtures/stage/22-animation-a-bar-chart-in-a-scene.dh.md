---
title: "Animation: a bar chart in a scene"
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

## Animation: a bar chart in a scene

A `bars` block is a small bar chart on one value axis: grid values, reference lines, and per step new values, a dotted peak line, a dashed limit (bars over it light up in its step), and moves from one bar to others, drawn as dashed arrows with the moved amount stacked on the taker. Every bar top and line sits at its true value.

```animation
title: A café | cups sold, by day
bars 7 server: day of the week · bar = cups sold ÷ the weekly average | ×
  axis 0, 0.5, 1, 1.5
  line average: 1
  labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  tabs One barista: 1..3; Two baristas: 4
@step Busy Friday: Friday sells 1.4 times the average day.
values: 0.7 0.8 0.9 1.0 1.4 1.3 0.9
peak: busiest 1.4×
heading: cups by day | the week of 3 March
big: 1.4× | busiest ÷ average
@step A cap: No day should go over 1.2 times the average; two days do.
limit 1.2: cap 1.2×
heading: cap = 1.2 × the average · 2 days are over it
@step Move orders: Friday and Saturday hand pre-orders to Monday and Tuesday.
values: 0.9 0.9 0.9 1.0 1.2 1.2 0.9
move 2 from Fri to Mon; 1 from Sat to Tue
peak: busiest 1.2×
big: 1.2× | busiest ÷ average
heading: the moves: Fri → Mon (2 trays), Sat → Tue (1 tray) | the week's total does not change
@step Two baristas: Saturday remains the busiest day; Friday is also above average.
values: 0.9 0.9 1.0 1.0 1.1 1.2 0.9
light Sat: the busiest
heading: two baristas, a month later
```
