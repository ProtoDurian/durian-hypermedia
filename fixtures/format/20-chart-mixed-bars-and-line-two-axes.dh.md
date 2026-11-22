---
title: "Chart: mixed bars and line, two axes"
description: A fixture made from the Format page section of the same name.
---

## Chart: mixed bars and line, two axes

A series can have its own `kind`, and `axis: y2` puts it on a second axis on the right. The chart declares that axis with `y2`.

```chart
kind: bar
title: Runs and time, by number of questions
x: { label: questions, values: [1, 2, 3, 4, 5] }
y: { label: runs }
y2: { label: seconds, min: 0 }
series:
  - name: runs
    data: [2, 3, 4, 5, 6]
  - name: time
    kind: line
    axis: y2
    tone: 5
    data: [4, 7, 11, 16, 22]
```
