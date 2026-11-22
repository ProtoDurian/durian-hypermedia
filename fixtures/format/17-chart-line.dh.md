---
title: "Chart: line"
description: A fixture made from the Format page section of the same name.
---

## Chart: line

```chart
kind: line
title: Script runs per create, by number of questions
x: { label: questions, values: [1, 2, 3, 4, 5, 6] }
y: { label: runs }
series:
  - name: init calls
    data: [2, 3, 4, 5, 6, 7]
  - name: with one validate call per question
    data: [3, 5, 7, 9, 11, 13]
```
