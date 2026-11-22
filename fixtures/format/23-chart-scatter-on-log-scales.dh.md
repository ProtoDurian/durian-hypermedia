---
title: "Chart: scatter on log scales"
description: A fixture made from the Format page section of the same name.
---

## Chart: scatter on log scales

Both axes of a scatter chart can be log.

```chart
kind: scatter
title: Run time against input size
x: { label: questions, scale: log }
y: { label: milliseconds, scale: log }
series:
  - name: runs
    data: [[1, 12], [3, 35], [10, 120], [30, 340], [100, 1200], [300, 3500]]
```
