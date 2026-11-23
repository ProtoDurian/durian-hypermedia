---
title: "Chart calculator"
description: A sample of the chart features of format version 11.
---

## Chart calculator

The calculator layout: inputs, one row per formula and one result.

```chart
layout: calculator
title: Storage bill
controls:
  - slider: stored
    label: Data stored
    unit: GB
    min: 100
    max: 5000
    step: 100
    value: 1200
  - slider: price
    label: Price per GB
    unit: USD per GB
    min: 0.01
    max: 0.1
    step: 0.001
    value: 0.023
  - toggle: second
    label: Second copy
    value: false
let:
  storage: "stored * price * (second ? 2 : 1)"
  fees: stored / 100
  total: storage + fees
calc:
  - let: storage
    label: Storage
    format: money
  - let: fees
    label: Fees
    unit: units
  - let: total
    label: Monthly bill
    format: money
    result: true
```
