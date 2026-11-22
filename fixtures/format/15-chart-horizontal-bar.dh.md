---
title: "Chart: horizontal bar"
description: A fixture made from the Format page section of the same name.
---

## Chart: horizontal bar

`horizontal: true` turns the bars on their side; long names get room.

```chart
kind: bar
horizontal: true
title: Time to create, by way of working
x: { label: way, values: [Edit files by hand, Run the template once, Ask every question, Replay all answers] }
y: { label: seconds }
series:
  - name: seconds
    data: [95, 12, 31, 48]
```
