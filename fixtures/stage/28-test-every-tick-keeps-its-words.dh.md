---
title: "Test: every tick keeps its words"
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

## Test: every tick keeps its words

On a phone, tick labels can share several lines. No labelled tick is removed to make room for another one.

```animation
title: A labelled schedule | full words
time: 0..32
ticks: 0 p0, 4 p4 ▲ parcel ready, 8 p8, 28 p28, 30 p30, 32 p32
row job run "Run": +working 0..32
@step See: Every labelled tick keeps its words.
@step Lost: At 16 a copy is lost; the tick words stay.
keep at 16 [bad]: copy lost
```
