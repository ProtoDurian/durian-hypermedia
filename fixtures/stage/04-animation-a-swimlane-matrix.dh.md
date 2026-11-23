---
title: "Animation: a swimlane matrix"
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

## Animation: a swimlane matrix

A `matrix:` crosses **lanes** (rows) with **columns** (`column id: Title`) into cells; each cell holds cards, chips and an "and more" line. `light lane.column: words` lights a cell with a few words under its contents; `show t4` brings a card in and `light t3` puts one in focus. Every cell and card has its place from the first step, so nothing moves. A phone stacks the matrix by lane: each lane is a block, with its columns as small headings.

```animation
title: A photo upload | who does what, stage by stage
matrix: Who holds the photo | five parts, four stages
column sb: Submit | the request
column qu: Queue | waits for a worker
column rn: Run | the work
column rp: Report | the answer
client c: Browser | the person
  sb: [u1] Upload | 4 MB, one file
  rp: [u3] Done page | thumbnail shown
server a: API | checks and accepts
  sb: [a1] Accept | size and type checked; + 202
  rp: [a2] Status | answers polling
job w: Worker | does the slow part
  rn: [w1] Resize | three sizes; + strip metadata
cache k: Job queue | keeps the order
  qu: [q1] Waiting job | first in, first out; ... about 30 more
store s: Storage | keeps the files
  rn: + original; + 3 sizes
@step Send: The browser sends the file.
light c.sb: the request leaves
light u1
@step Accept: The API checks it and queues a job.
light a.sb: 202 sent back
light k.qu: one more waiting
@step Work: A worker takes the job and writes the sizes.
light w.rn
light s.rn: files written
@step Done: The browser polls and shows the result.
show u3
light c.rp, a.rp
```
