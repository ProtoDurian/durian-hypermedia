---
title: "Chart: bubble"
description: A fixture made from the Format page section of the same name.
---

## Chart: bubble

A bubble point is `[x, y, size]`; the area of the bubble follows the size.

```chart
kind: bubble
title: Templates by questions, run time and downloads
x: { label: questions }
y: { label: seconds }
series:
  - name: templates
    data: [[3, 8, 120], [6, 14, 480], [9, 30, 60], [12, 41, 900], [15, 52, 240]]
```
