---
title: "Animation: a key"
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

## Animation: a key

With the setup line `key at: top right`, the scene's `key role: words; words` entries form a legend at the stage's top right, each a small swatch in the role's colour with its words beside it. An entry shows from the step that writes it; its place is kept from the start, so nothing moves. Without that line the key stays at the bottom left.

```animation
title: A bike shop | parts in, bikes out
key at: top right
## Store room
store p: parts shelf | wheels, chains
## Bench
job f: fitter | one bench
## Door
client c: rider
@step Parts: The fitter takes parts from the shelf.
p -> f: two wheels
key store: kept in stock
key job: work done here
@step Ride: The bike goes out of the door.
f -> c: one bike
key client: who it is for
```
