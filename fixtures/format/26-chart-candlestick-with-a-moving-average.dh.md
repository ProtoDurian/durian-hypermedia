---
title: "Chart: candlestick with a moving average"
description: A fixture made from the Format page section of the same name.
---

## Chart: candlestick with a moving average

Another series with `kind: line` draws on top of the candles: here the average of the last three closing prices. It may use `y2` for a second axis, like any other chart.

```chart
kind: candlestick
title: Two weeks of a share price, with its 3-day average
x: { label: day, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
y: { label: price, min: 90 }
series:
  - name: price
    data: [[100, 106, 98, 104], [104, 109, 102, 107], [107, 111, 105, 106], [106, 108, 101, 102], [102, 105, 97, 99], [99, 104, 96, 103], [103, 110, 102, 109], [109, 113, 107, 112], [112, 114, 108, 109], [109, 112, 106, 111]]
  - name: 3-day average
    kind: line
    tone: 6
    data: [null, null, 105.7, 105, 102.3, 101.3, 103.7, 108, 110, 110.7]
```
