---
title: "Animation: arrivals over a bottom ruler"
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

## Animation: arrivals over a bottom ruler

The ruler can sit below the rows. Arrival dots use their role’s pale fill and coloured border, and a marker can put its words in the step caption without a second stage label.

```animation
title: A parcel strip | arrivals over time
time: 0..12 | parcel spacing
ruler: below
row labels: beside
ticks: 0, 4, 8, 12
at 10 [solid] [good]: storage ready
row job first "First": packed 3.9..4.1 [dot]
row server second "Second": stored 7.9..8.1 [dot]
at 6 [solid] [good] [caption]: The parcel is released.
@step Pack: The first dot records packing.
@step Store: The second dot records storage.
```
