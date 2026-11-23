---
title: "Chart line styles and markers"
description: A sample of the chart features of format version 11.
---

## Chart line styles and markers

Each series has its own line style and marker, and a key that shows both.

```chart
kind: line
x: { label: month, values: [Jan, Feb, Mar, Apr] }
y: { label: loans }
series:
  - name: This year
    line: solid
    marker: circle
    data: [820, 860, 910, 990]
  - name: Forecast
    line: dashed
    marker: diamond
    data: [null, null, 910, 1000]
  - name: Last year
    line: dotted
    marker: none
    data: [760, 790, 840, 900]
```
