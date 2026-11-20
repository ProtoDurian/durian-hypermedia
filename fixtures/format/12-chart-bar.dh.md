---
title: "Chart: bar"
description: A fixture made from the Format page section of the same name.
---

## Chart: bar

An LLM reads a chart's data as a table.

```chart
kind: bar
title: Answers carried by each init call
x: { label: init call, values: [1, 2, 3, 4, 5] }
y: { label: answers }
series:
  - name: answers
    data: [0, 1, 2, 3, 4]
```
