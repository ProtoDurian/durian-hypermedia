---
title: "Chart: stacked bar"
description: A fixture made from the Format page section of the same name.
---

## Chart: stacked bar

```chart
kind: bar
stacked: true
title: Size of each init call, in bytes
x: { label: init call, values: [1, 2, 3, 4] }
y: { label: bytes }
series:
  - name: answers
    data: [0, 48, 96, 144]
  - name: deterministic state
    data: [0, 40, 40, 40]
```
