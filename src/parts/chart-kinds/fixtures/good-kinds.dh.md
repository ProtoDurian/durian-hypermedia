---
title: Chart kinds, good
---
# Chart kinds

A funnel with steps, a waterfall, a tree and a month of days: each one drawn, none with a problem.

```chart
kind: funnel
title: From visit to paid
data:
  - [Visited, 4820]
  - [Signed up, 870]
  - [Paid, 135]
steps:
  - title: Last quarter.
  - title: After the shorter form.
    data:
      - [Visited, 4950]
      - [Signed up, 1130]
      - [Paid, 172]
```

```chart
kind: waterfall
x: { values: [October, New, Churn, Subtotal, November] }
y: { format: money, currency: EUR }
data: [84000, 12500, -9100, "=", 3000]
```

```chart
kind: histogram
x: { label: latency, format: duration-ms }
bins: 6
marks: [p50, p95]
data: [74, 88, 109, 110, 86, 88, 122, 87, 132, 140, 93, 50, 99]
```

```chart
kind: treemap
data:
  - name: Media
    children:
      - { name: Videos, value: 41 }
      - { name: Photos, value: 18 }
  - { name: Backups, value: 14 }
```

```chart
kind: calendar
from: 2026-11-01
to: 2026-11-14
data: [["2026-11-02", 4], ["2026-11-03", 7], ["2026-11-05", 0]]
```
