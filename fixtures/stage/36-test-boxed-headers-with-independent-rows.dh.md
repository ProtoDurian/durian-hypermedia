---
title: "Test: boxed headers with independent rows"
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

## Test: boxed headers with independent rows

Each tick header is a band. Independent row ranges reveal in place without an extra header body row.

```animation
title: Numbered shifts | boxed tick headers
time: 840..872
cells: 1 | headers
row job draft "draft": +x 840..848 @2; x 848..869 @3 [warn]; x 869..872 @4 [good]
row server copy "copy": +x 840..848 @2; x 848..869 @3 [warn]; x 869..872 @4 [good]
row job archive "archive": +x 840..848 @2; x 848..869 @3 [warn]; x 869..872 @4 [good]
@step Wait: The fixed header shows the planned domain; the rows keep their places, empty.
@step Eight: Each row shows eight cells.
@step Continue: The next interval appears.
@step Finish: The final interval appears.
```
