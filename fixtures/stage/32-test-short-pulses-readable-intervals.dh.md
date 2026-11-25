---
title: "Test: short pulses, readable intervals"
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

## Test: short pulses, readable intervals

A bar too short for its name keeps its exact place; the name sits under the row, tied to its bar by a short line.

```animation
title: Repeated pings | short intervals
time: 0..24 | seconds
row job refresh "Refreshes": ping 0.2..0.8; ping 2.2..2.8; ping 4.2..4.8; ping 6.2..6.8
row server engine "Engine": +working behind peers 0..24
@step Watch: Each ping keeps its exact range.
@step Complete: The captions keep their places.
at 20 [good]: all refreshed
```
