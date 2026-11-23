---
title: "Animation: time"
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

## Animation: time

A `time:` block is a real axis: a tick ruler, rows of states, and per step a marker (`at`) or a bracket over a span (`span`). Every mark sits at its true place.

```animation
title: A pipeline | build, then test, then deploy
time: 0..60 | seconds
row job j1 "build": queued 0..4; +running 4..31; done 31..60
row job j2 "test": queued 0..31; +running 31..52; done 52..60
row server d1 "deploy": waiting 0..52; +rolling 52..60
@step Build: The build runs first, for 27 seconds.
span j1 4..31: 27 s
@step Test: The test starts when the build ends.
at 31: build done
@step Deploy: The deploy starts at 52 seconds.
at 52: tests pass
```
