---
title: "Chart: 100% stacked bar"
description: A fixture made from the Format page section of the same name.
---

## Chart: 100% stacked bar

`stacked: percent` scales each bar to 100%; the tooltip still shows the real number. Init call 1 carries nothing, so it has no share and is left out.

```chart
kind: bar
stacked: percent
title: Share of each init call's size
x: { label: init call, values: [2, 3, 4] }
y: { label: share of bytes }
series:
  - name: answers
    data: [48, 96, 144]
  - name: deterministic state
    data: [40, 40, 40]
```
