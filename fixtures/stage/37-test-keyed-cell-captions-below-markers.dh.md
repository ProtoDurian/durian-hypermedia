---
title: "Test: keyed cell captions below markers"
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

## Test: keyed cell captions below markers

Words too wide for a phone cell stand on end inside it; longer phrases sit under the row, each tied to its own cell by a short line. Marker formulas sit below their lines, with fixed positions across steps.

```animation
title: Parcel receipts | complete words in a short grid
time: 0..7 | shifts
cells: 1
ticks: 0, 1, 2, 3, 4, 5, 6, 7
row job draft "Draft": +operators 0..4; +payload 4..7 @3
row server receiver "Receiver": +save, payload 0..2 @2; +to two operators 2..7 @3
row job archive "Archive": +receipt 0..2; +archived, payload 2..4 @2; _ 4..7 @3
@step Begin: The first entries keep their places.
keep at 2 [accent] [below]: check = shift 2
@step Copy: The receiver records the parcel.
@step Finish: Every full word remains readable.
keep at 4 [bad] [below]: switch = shift 4
```
