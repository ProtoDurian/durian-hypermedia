---
title: "Chart: 100% stacked bar"
description: A fixture made from the Format page section of the same name.
---

## Chart: 100% stacked bar

`stacked: percent` scales each bar to 100%; the tooltip still shows the real number.

```chart
kind: bar
stacked: percent
title: Share of each init call's size
x: { label: init call, values: [1, 2, 3, 4] }
y: { label: share of bytes }
series:
  - name: answers
    data: [0, 48, 96, 144]
  - name: deterministic state
    data: [40, 40, 40, 40]
```
