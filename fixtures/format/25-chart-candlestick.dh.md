---
title: "Chart: candlestick"
description: A fixture made from the Format page section of the same name.
---

## Chart: candlestick

A candlestick chart draws one candle per period. Its series has no `kind`, and each value is four numbers, `[open, high, low, close]`. The body runs from the open to the close and the thin line (the wick) from the low to the high. A candle that closes at or above its open is up (green, light body); one that closes below is down (pink, solid body). Hover or tap a candle to read all four numbers.

```chart
kind: candlestick
title: One week of a share price
x: { label: day, values: [Mon, Tue, Wed, Thu, Fri] }
y: { label: price, min: 90 }
series:
  - name: price
    data: [[100, 108, 98, 105], [105, 110, 101, 102], [102, 104, 95, 96], [96, 103, 94, 101], [101, 109, 100, 108]]
```
