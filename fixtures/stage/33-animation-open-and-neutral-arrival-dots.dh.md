---
title: "Animation: open and neutral arrival dots"
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

## Animation: open and neutral arrival dots

A dot uses its row’s pale colour and outline. The existing plain style gives a neutral filled dot.

```animation
title: Arrivals by row | distinct dot styles
time: 0..8
ruler: none
row job root "Root": sent 1..2 [dot] [plain]
row server engine "Engine": working 3..4 [dot]
row job store "Store": saved 5..6 [dot] [plain] @5
@step Send: The root and engine are visible.
@step Pulse: The engine dot is solid for one step.
fill engine
@step Open: The dot returns to its pale paint.
@step Hold: The engine stays solid.
keep fill engine
@step Store: A neutral dot records storage.
@step Reset: The engine returns to its declared paint.
off engine
```
