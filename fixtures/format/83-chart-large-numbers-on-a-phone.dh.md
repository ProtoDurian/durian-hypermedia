---
title: "Chart: large numbers on a phone"
description: Value axes with big numbers; under 480 px they read 1k, 1.5k, 2M so the axis keeps its room for the chart.
---

## Chart: large numbers on a phone

On a wide screen the value axis writes the whole number (1,500). Under 480 px, on a phone, a plain number is compact (1.5k, 2M); money, percent, bytes and times keep their words. The tooltip and the table keep the whole number. All the numbers here are made up.

```chart
kind: bar
title: Page views per week
x: { label: week, values: [W1, W2, W3, W4, W5] }
y: { label: views }
series:
  - name: views
    data: [1200, 1850, 2400, 3100, 2750]
```

```chart
kind: line
title: Requests handled
x: { label: month, values: [Jul, Aug, Sep, Oct, Nov] }
y: { label: requests, format: number }
series:
  - name: requests
    data: [1250000, 1480000, 1710000, 1960000, 2300000]
```

```chart
kind: boxplot
title: Order size by region
x: { label: region, values: [North, South, East] }
y: { label: orders per day }
tone: c4
data:
  - [1200, 1500, 1650, 1400, 1800, 2100, 1750, 1950, 1300, 1600]
  - [2200, 2600, 2900, 3100, 2750, 2400, 3300, 2950, 2650, 3000]
  - [900, 1100, 1250, 1050, 1400, 1300, 980, 1150, 1350, 1200]
```

```chart
kind: waterfall
title: Visitors gained and lost
x: { label: step, values: [Start, Launch, Outage, Press, Subtotal, Referral, End] }
y: { label: visitors }
data: [12500, 4200, -1800, 3300, "=", 2000, "="]
```
