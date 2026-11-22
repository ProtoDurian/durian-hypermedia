---
title: Plain charts that use none of the version 11 chart words
---

## Scatter with an axis range

```chart
kind: scatter
x: { label: a, min: 1, max: 3 }
y: { label: b, min: 0, max: 10 }
series:
  - name: s
    data: [[1, 2], [2, 5], [3, 9]]
```

## Line with a log axis

```chart
kind: line
x: [a, b, c]
y: { scale: log }
series:
  - name: s
    data: [1, 10, 100]
```

## Bar with two axes

```chart
kind: bar
x: [a, b]
y: { label: left, min: 0 }
y2: { label: right }
series:
  - name: l
    data: [1, 2]
  - name: r
    axis: y2
    data: [10, 20]
```

## Bad plain chart

```chart
kind: scatter
x: { min: 5, max: 1 }
series:
  - name: s
    data: [[1, 2]]
```

## Pie

```chart
kind: pie
x: [a, b, c]
series:
  - name: s
    data: [1, 2, 3]
```
