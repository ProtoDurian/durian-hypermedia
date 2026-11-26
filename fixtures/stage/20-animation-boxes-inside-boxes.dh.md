---
title: "Animation: boxes inside boxes"
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

## Animation: boxes inside boxes

A `nest:` draws wrappers as boxes inside boxes, outside first, each with a role, a title, a size and its fields; a field after `> ` sits at the box's end, under what it holds. Every box has its place from the first step, so a wrapper put round later, or taken off, moves nothing. A step can `show` a wrapper, `light` it or one of its fields, give it new `fields` or a new `title`, `set` one field (the old value struck beside the new one, for that step), `unwrap` it (the wrapper comes off what it holds: dashed and struck for that step, then gone) or `hide` it. Fields are written in the mono face, so they line up.

```animation
title: A parcel | wrapped for the trip, unwrapped at the door
nest: The parcel | outside in
  store crate: shipping crate | 40 kg | to the depot; from the warehouse; > seal 7731
  job box: box | 2 kg | to the house; status: packed
  client gift: gift | a mug | wrapped in paper
@step Boxed: The gift goes in a box addressed to the house.
light gift
@step Crated: The box rides in a crate addressed to the depot, not to the house.
show crate
light crate: to the depot
@step At the depot: The crate comes off; the box goes on the van.
unwrap crate
set box: status: packed => status: out for delivery
@step At the door: The box comes off, and the gift is there.
unwrap box
set box: status: out for delivery => status: delivered
light gift
```

The full example, one web request through a switch, a home router and two internet routers and back, is its own page: [the layers, through several routers](../layers/).
