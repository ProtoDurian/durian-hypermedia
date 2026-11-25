---
title: "Test: full words in narrow columns"
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

## Test: full words in narrow columns

When a word cannot fit level inside a phone cell, it stands on end inside its own cell. Header words too wide for their columns stand on end inside them too.

```animation
title: A labelled archive | full cell words
time: 0..8
cells: 1 | headers
ticks: 0.5 first, 1.5 receiptTick, 2.5 third, 3.5 fourth, 4.5 fifth, 5.5 sixth, 6.5 seventh, 7.5 eighth
row job archive "": operators 0..4; /receipt 4..5; archived 5..6; payload 6..7 @2; paused 7..8 @2
@step Read: Full words remain readable.
@step Keep: The payload and the pause arrive; the other cells keep their places.
```
