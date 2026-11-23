---
title: "Animation: counted pieces beside a card"
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

## Animation: counted pieces beside a card

Counted rows can sit beside another step panel. The role before the parentheses colours the squares; the role inside colours the badge. Plain and muted text follow the counts.

```animation
title: A copy desk | counted pieces
@step Leaving: Some pieces are leaving each desk.
card job: Draft | A copy remains here.
beside
units Stored pieces | One square is one piece.
  job (client) 12: kept 8, leaving 4
  job (server) 12: kept 10, leaving 2
  Both desks retain a copy.
  ~ Thick borders show departing pieces.
@step Gone: The departed pieces are faint.
card job: Draft | The retained copy is ready.
beside
units Stored pieces | One square is one piece.
  job (client) 12: kept 8, gone 4
  job (server) 12: kept 10, gone 2
  Both desks retain a copy.
  ~ Faint squares show departed pieces.
```
