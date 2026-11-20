---
title: "Chart: log scale"
description: A fixture made from the Format page section of the same name.
---

## Chart: log scale

`scale: log` on an axis spaces the ticks by powers of ten. It needs values above 0.

```chart
kind: line
title: Size of the answer set, by number of questions
x: { label: questions, values: [1, 2, 3, 4, 5, 6] }
y: { label: possible answer sets, scale: log }
series:
  - name: answer sets
    data: [3, 9, 27, 81, 243, 729]
```
