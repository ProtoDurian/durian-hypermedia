---
title: "Chart log and linear switch"
description: A sample of the chart features of format version 11.
---

## Chart log and linear switch

The reader can switch the y axis between log and linear.

```chart
kind: line
x: { label: year, values: [2020, 2021, 2022, 2023] }
y: { label: requests, scale: log, toggle: true }
series:
  - name: Web
    data: [1200, 8100, 61000, 410000]
  - name: Batch
    data: [30, 70, 150, 400]
```
