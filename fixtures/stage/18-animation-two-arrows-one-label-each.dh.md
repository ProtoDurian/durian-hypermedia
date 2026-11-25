---
title: "Animation: two arrows, one label each"
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

## Animation: two arrows, one label each

A connector line of one pair keeps its own label: two lines that both say `30 crates` show it on both arrows. A line of several pairs, `m -> s, t: 12 each`, shows its label once for the bundle, and so do such lines with one label across one gap.

```animation
title: A market morning | crates in, crates out
## Farms
job a: hill farm | apples
job b: river farm | pears
## Market
store m: market hall | one floor
## Shops
client s: corner shop
client t: station kiosk
@step Arrive: Both farms bring the same load.
a -> m: 30 crates
b -> m: 30 crates
@step Share: The hall sends some on, the same to each shop.
m -> s, t: 12 each
@step Again: Next morning the hill farm comes again with the same load.
clear
a -> m: 30 crates
```
