---
title: "Chart time axis and annotations"
description: A sample of the chart features of format version 11.
---

## Chart time axis and annotations

A time axis in a named zone, with an event, a range and a threshold. Each marker is a button that opens a note.

```chart
kind: line
title: Latency
x: { scale: time }
y: { label: latency, format: duration-ms }
tz: America/Los_Angeles
series:
  - name: p95
    data: [["2026-11-20T10:00", 120], ["2026-11-20T10:05", 130], ["2026-11-20T10:10", 410], ["2026-11-20T10:15", 150]]
annotations:
  - at: 2026-11-20T10:08
    label: Deploy v1.4
    text: Moved sessions to the new cache.
    tone: acc
  - from: 2026-11-20T10:09
    to: 2026-11-20T10:13
    label: Incident 42
    tone: bad
  - y: 300
    label: SLO
    tone: warn
    fill: above
```
