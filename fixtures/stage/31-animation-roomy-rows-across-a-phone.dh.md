---
title: "Animation: roomy rows across a phone"
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

## Animation: roomy rows across a phone

Columns keep their full-axis pitch as cells appear. Row headings sit above phone cells; a transfer starts outside its source heading. Whole words retain the shared phone size.

```animation
title: A parcel desk | one column per shift
time: 0..7 | shifts
cells: 1 | roomy
row job draft "(a) Draft | first writer": +×1 0..4; +×2 4..7 @3
row server copy "(b) Copy | spare writer": +×1 0..4; lost 4..7 @3 [bad]
row job archive "| Archive": reads a parcel 0..4; +stored 4..7 @3
@step Draft: Four columns are revealed.
@step Copy: A reply returns to the draft.
tag copy 0..2: copy is ready
foot (job): the draft keeps its colour
arrow copy -> draft at 0.5 [dashed]: no reply
@step Input: The remaining columns appear in place.
arrow above -> draft at 5.5 [dashed]: a new parcel
```
