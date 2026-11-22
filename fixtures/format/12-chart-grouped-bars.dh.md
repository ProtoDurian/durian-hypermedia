---
title: "Chart: grouped bars"
description: A fixture made from the Format page section of the same name.
---

## Chart: grouped bars

Several series side by side is the default for bars.

```chart
kind: bar
title: Runs per create, by number of questions
x: { label: questions, values: [2, 4, 6] }
y: { label: runs }
series:
  - name: init calls
    data: [3, 5, 7]
  - name: validate calls
    data: [2, 4, 6]
  - name: both
    data: [5, 9, 13]
```
