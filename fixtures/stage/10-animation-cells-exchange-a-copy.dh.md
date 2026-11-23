---
title: "Animation: cells exchange a copy"
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

## Animation: cells exchange a copy

Roomy cells can keep words while idle, change their state on a later step, and pass a copy to another row. Row labels can include a badge and a second line.

```animation
title: A print desk | one column per sheet
time: 0..4 | sheets
cells: 1 | roomy
ticks: 0.5 first, 1.5 second, 2.5 third, 3.5 fourth
row job draft "(a) Draft | writes": +×1 0..1; hold 1..2 @1 [warn]; +×2 1..2 @2 [lit]; +×3 2..3 @3; _ 3..4 @3 [dashed]
row server copy "| Copy | stores": paused 0..1 [dashed]; +×1 1..2 @2; issue 2..3 @2 [bad]; ×3 2..3 @3 [good]; _ 3..4 @3 [dashed]
@step Draft: The second sheet waits at the desk.
@step Copy: A saved sheet returns to the draft row.
arrow copy -> draft at 1.5: saved copy
@step Input: A new sheet arrives from above.
arrow above -> draft at 2.5 [dashed]: new sheet
```
