---
title: "Chart: stacked area"
description: A fixture made from the Format page section of the same name.
---

## Chart: stacked area

```chart
kind: area
stacked: true
title: Calls sent so far, by kind
x: { label: init call, values: [1, 2, 3, 4, 5] }
y: { label: calls }
series:
  - name: init calls
    data: [1, 2, 3, 4, 5]
  - name: validate calls
    data: [0, 1, 2, 3, 4]
```
