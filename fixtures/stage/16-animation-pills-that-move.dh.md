---
title: "Animation: pills that move"
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

## Animation: pills that move

`pill ids: words; words` under a card stacks pills at its foot. `move p3 to w` draws the pill in the other card from that step on; both cards keep a place for it, so nothing else moves. `light p1: note` lights a pill with a note at its right end, `tone id bad` (or `good`, `warn`, `accent`, `off`) and `dim id` change a card from that step on, and `align: top` gives the cards of a row one top and one foot.

```animation
title: Bakery shelves | trays move as they sell
align: top
## Oven
job o: oven | batch 1
cache t: timer | 20 minutes
## Shelf A
server sa: shelf A | by the door
  pill p1,p2,p3: rye · fresh; spelt · fresh; oat · cooling
## Shelf B
server sb: shelf B | at the back
  pill p4: seed · fresh
## Window
client w: window | on the street
  pill p5: brioche · on show
@step Bake: The oven fills shelf A.
o -> sa: trays
@step Sell: Rye sells out and the oat loaf moves to the window.
move p3 to w
light p1: sold
dim p1
text sa: rye is gone | spelt stays
@step Late: Shelf B runs low and closes; the timer is off.
tone sb bad
dim t
text sb: closed for the night
```
