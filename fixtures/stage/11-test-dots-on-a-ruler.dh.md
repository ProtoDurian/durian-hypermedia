---
title: "Test: dots on a ruler"
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

## Test: dots on a ruler

Dots can sit on the ruler without a value plot. A dashed box names the observation window, and a marker above the ruler stays visible from its step onward.

```animation
title: A delivery check | samples along a window
time: 0..40 | minutes
ticks: 0 start, 10, 20, 30, 40 check
window: 0..40 | observation window
zoom: 38..42 | A write around the check | below @1..1
zoom ticks: 40 check
zoom labels: 38 before, 39 near, 41 after, 42 end
zoom row job receipt "Receipt: three entries": +writing 39..41 [warn]
dot 5, 15
dot 25 [good]: saved
dot 30: newest
@step Watch: One newer sample arrives during the window.
span axis 0..20 [line] [warn]: first half
keep span receipt 39..41 [line] [warn]: three entries
@step Check: The check runs at the end of the window.
keep at 40 [solid] [plain]: check runs
span axis 0..20 [line] [warn]: first half
@step Retire: The marker line stays while its label retires.
hush at 40
span axis 0..20 [line] [warn]: first half
```
