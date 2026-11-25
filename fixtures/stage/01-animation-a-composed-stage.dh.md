---
title: "Animation: a composed stage"
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

## Animation: a composed stage

An animation is **composed** by default: lanes left to right, cards with lines and badges, bands under lanes, then steps that show, light, tag and connect. The stage is laid out once for every step, so nothing moves; connectors are drawn after layout, from fanned ports, with their labels in the gap between lanes. Colours come from the page's `roles:` in the front matter, one per role on the whole page. A phone stacks the lanes. `layout=graph` on the fence sends a scene to the graph engine below instead.

```animation
title: Orders | one request, end to end
## Browsers
client b1..b4: laptop; phone; tablet; kiosk | sends GET /orders
... about 2,000 sessions
## Servers
server s0,s1: api 0; api 1 | answers in JSON
  + (a) worker a; (b) worker b
## Storage
store db: orders database | primary | region east
## _ under Servers..Storage
ops cfg: config service | pushes routes and limits
@step Ask: Each browser asks one server.
b1,b3 --> s0: GET
b2,b4 --> s1: GET
tag b1,b3: to api 0
tag b2,b4: to api 1
light s0,s1
@step Read: The servers read from the database.
s0,s1 --> db (store): SELECT
say db: one primary
light db
@step Config: The config service is off the data path.
cfg -> s1, db: polled
light cfg
@step In short: Browsers pull from servers; servers read one database.
key client: GET  browser to server
key store: SELECT  server to database
```
