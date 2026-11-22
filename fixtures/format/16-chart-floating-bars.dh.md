---
title: "Chart: floating bars"
description: A fixture made from the Format page section of the same name.
---

## Chart: floating bars

A value written `[low, high]` floats the bar between the two. The LLM table reads it as "3 to 9".

```chart
kind: bar
title: Time each step takes, in seconds
x: { label: step, values: [Ask, Validate, Generate, Write] }
y: { label: seconds }
series:
  - name: range
    data: [[0, 4], [4, 9], [9, 21], [21, 26]]
```
