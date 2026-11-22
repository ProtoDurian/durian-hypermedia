Eight more kinds of a `chart`, each a YAML map with `kind:` at the top: raw values are counted, quartiled or smoothed when the page is built, so a model reads the table. Hover, tap or focus a bin, box, stage, block or day for its card; the arrow keys walk the data.

```chart
kind: histogram
title: How long a request takes
x: { label: latency, format: duration-ms }
y: { label: requests }
bins: 12
marks: [p50, p95]
data: [74, 88, 109, 110, 86, 88, 122, 87, 132, 140, 93, 50, 99, 127, 56, 69, 80, 114, 67, 66, 89, 95, 125, 102, 120, 73, 91, 107, 42, 78, 75, 99, 155, 115, 25, 54, 113, 82, 84, 85, 94, 121, 168, 191]
```

```chart
kind: boxplot
title: Checkout time by day
x: { label: day, values: [Mon, Tue, Wed] }
y: { label: seconds to pay, format: duration }
tone: c4
data:
  - [120, 100, 121, 110, 106, 125, 169, 146, 134, 102, 132, 128, 114, 152]
  - [173, 121, 152, 144, 132, 143, 153, 117, 130, 134, 146, 176, 149, 166]
  - [118, 116, 162, 140, 161, 166, 136, 170, 158, 138, 126, 160, 154, 260]
```

```chart
kind: violin
title: Response time by service
x: { label: service, values: [api, search, checkout] }
y: { label: response, format: duration-ms }
tone: c2
data:
  - [57, 69, 117, 111, 105, 83, 98, 105, 124, 101, 88, 102, 117, 83, 99, 101, 101, 99]
  - [141, 198, 207, 164, 144, 149, 163, 206, 121, 232, 154, 227, 237, 119, 174, 148, 195, 192]
  - [243, 242, 239, 262, 246, 212, 247, 222, 252, 201, 213, 203, 204, 248, 234, 261, 258, 213]
```

```chart
kind: funnel
title: From visit to paid
tone: c1
data:
  - [Visited the site, 48200]
  - [Created an account, 8700]
  - [Started a trial, 4100]
  - [Paid, 1350]
steps:
  - title: Last quarter.
  - title: After the shorter sign-up form.
    data:
      - [Visited the site, 49500]
      - [Created an account, 11300]
      - [Started a trial, 5200]
      - [Paid, 1720]
```

```chart
kind: waterfall
title: Monthly revenue bridge
x: { label: driver, values: [October, New, Churn, Refunds, Subtotal, Price rise, November] }
y: { label: revenue, format: money, currency: EUR }
data: [84000, 12500, -9100, -2300, "=", 4800, "="]
```

```chart
kind: treemap
title: Where the disk went
y: { label: disk use, format: bytes }
data:
  - name: Media
    children:
      - { name: Videos, value: 412000000000 }
      - { name: Photos, value: 186000000000 }
  - name: Code
    children:
      - { name: Repos, value: 86000000000 }
      - { name: Build cache, value: 88000000000 }
  - { name: Backups, value: 140000000000 }
```

```chart
kind: sunburst
title: Lines of code by team and area (thousands)
y: { label: lines of code }
data:
  - name: Platform
    children:
      - { name: Runtime, value: 93 }
      - { name: Storage, value: 66 }
  - name: Product
    children:
      - { name: Web, value: 95 }
      - { name: Mobile, value: 69 }
  - { name: Docs, value: 18 }
```

```chart
kind: calendar
title: Commits, September to November
y: { label: commits }
tone: good
from: 2026-09-01
to: 2026-11-30
data: [["2026-09-01", 7], ["2026-09-02", 6], ["2026-09-03", 5], ["2026-09-07", 4], ["2026-09-09", 2], ["2026-09-12", 2], ["2026-09-14", 4], ["2026-09-15", 10], ["2026-09-16", 1], ["2026-09-17", 3], ["2026-09-18", 5], ["2026-09-21", 8], ["2026-09-23", 9], ["2026-09-24", 5], ["2026-09-25", 3], ["2026-09-26", 2], ["2026-09-27", 1], ["2026-09-28", 9], ["2026-09-29", 8], ["2026-09-30", 7], ["2026-10-01", 8], ["2026-10-02", 9], ["2026-10-04", 1], ["2026-10-05", 5], ["2026-10-06", 9], ["2026-10-11", 2], ["2026-10-12", 9], ["2026-10-13", 9], ["2026-10-15", 5], ["2026-10-16", 6], ["2026-10-17", 1], ["2026-10-18", 1], ["2026-10-20", 8], ["2026-10-21", 3], ["2026-10-22", 6], ["2026-10-23", 6], ["2026-10-24", 1], ["2026-10-25", 1], ["2026-10-26", 2], ["2026-10-29", 7], ["2026-10-30", 7], ["2026-10-31", 1], ["2026-11-01", 0], ["2026-11-04", 4], ["2026-11-06", 5], ["2026-11-07", 0], ["2026-11-08", 0], ["2026-11-09", 2], ["2026-11-11", 2], ["2026-11-12", 6], ["2026-11-13", 8], ["2026-11-14", 2], ["2026-11-15", 0], ["2026-11-16", 8], ["2026-11-17", 6], ["2026-11-18", 3], ["2026-11-19", 1], ["2026-11-21", 2], ["2026-11-22", 2], ["2026-11-23", 3], ["2026-11-24", 8], ["2026-11-26", 7], ["2026-11-27", 10], ["2026-11-28", 0], ["2026-11-29", 1], ["2026-11-30", 7]]
```

Each kind takes `title`, `tone` where it makes sense, `y: { label, format, currency }` for the value axis (the histogram's is `x`), and `steps:` that change `data`, `marks` or `bins` from one step to the next.
