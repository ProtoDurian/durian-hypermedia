---
title: "Chart: polar area"
description: A fixture made from the Format page section of the same name.
---

## Chart: polar area

Like a pie, but every slice has the same angle and its value is the length.

```chart
kind: polar
title: Calls by hour of the day
x: { values: [Morning, Noon, Afternoon, Evening, Night] }
series:
  - name: calls
    data: [34, 52, 61, 28, 9]
```
