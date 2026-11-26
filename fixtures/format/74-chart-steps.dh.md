---
title: "Chart steps"
description: A sample of the chart features of format version 11.
---

## Chart steps

Each step shows its own data on top of the one before; one control row steps through them.

```chart
kind: line
title: Requests per second
x: { label: time, values: ["10:00", "10:05", "10:10"] }
y: { label: requests/s }
series:
  - name: api
    data: [120, 130, 125]
steps:
  - title: A normal morning.
  - title: The deploy doubles the load.
    series:
      - name: api
        data: [120, 130, 260]
  - title: A worker joins.
    series:
      - name: worker
        add: true
        data: [1, 2, 3]
```
