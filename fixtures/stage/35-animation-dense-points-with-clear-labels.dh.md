---
title: "Animation: dense points with clear labels"
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

## Animation: dense points with clear labels

A phone keeps the planned dot pitch and clears marker strokes behind caption words. Fill changes only paint.

```animation
title: Receiver pulses | points stay in place
time: -150..212 | seconds
ruler: below
row labels: beside
ticks: -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180, 210
row server receiver "Receiver": _ -150..-148 [dot]; _ -135..-133 [dot]; _ -120..-118 [dot]; _ -105..-103 [dot]; _ -90..-88 [dot]; _ -75..-73 [dot]; _ -60..-58 [dot]; _ -45..-43 [dot]; _ -30..-28 [dot]; _ -15..-13 [dot]; _ 0..2 [dot]; _ 15..17 [dot]; _ 30..32 [dot]; _ 45..47 [dot] @2; _ 60..62 [dot] @2; _ 75..77 [dot] @2; _ 90..92 [dot] @2; _ 105..107 [dot] @2; _ 120..122 [dot] @2; _ 135..137 [dot] @2; _ 150..152 [dot] @2; _ 165..167 [dot] @2; _ 180..182 [dot] @2; _ 195..197 [dot] @2; _ 210..212 [dot] @2
row job storage "Storage": received 36..38 [dot] [plain]
at 37 [solid]: checkpoint
@step Receive: The first points appear.
@step Fill: Solid points retain the same centres.
keep fill receiver
keep span receiver -150..2 [line] [plain]: one range caption
@step Reset: The open paint returns.
off receiver
```
