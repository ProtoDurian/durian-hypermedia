---
title: "Chart heatmap"
description: A sample of the chart features of format version 11.
---

## Chart heatmap

A heatmap draws one cell per value; an empty cell is null.

```chart
kind: heatmap
title: Errors by hour
x: { label: hour, values: ["00", "04", "08"] }
y: { label: day, values: [Mon, Tue] }
series:
  - name: errors
    data:
      - [0, 1, 4]
      - [null, 2, 12]
```
