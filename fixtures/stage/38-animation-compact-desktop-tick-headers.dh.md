---
title: "Animation: compact desktop tick headers"
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

## Animation: compact desktop tick headers

Dense numeric tick headers share a compact strip. Longer desktop row labels have room beside the cells; formulas remain below their lines.

```animation
title: Parcel holders | a dense tick grid
panels
time: 840..872 | ticks per parcel
cells: 1 | headers
row job old "parcel 7 · old keeper": _ 840..872
row server next "parcel 32 · new keeper": _ 840..872
row job receiver "receiver": _ 840..872
@step Begin: Half of parcel 7's pieces are leaving its old holder.
units Stored pieces | one square per parcel
  job 16: kept 8, leaving 8
  j, parcel 7: 8 kept, 8 leaving.
@step Change: The leaving pieces are gone; the summary keeps its place.
units Stored pieces | one square per parcel
  job 16: kept 8, gone 8
  j, parcel 7: 8 kept, 8 gone.
foot: 8 of 16 pieces stay.
keep at 848 [below]: previousTick
keep at 870 [bad] [below]: currentTick
```
