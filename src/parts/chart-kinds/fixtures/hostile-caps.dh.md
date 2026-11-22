---
title: Chart kinds, hostile
---
# Chart kinds over their caps

Too many bins, a tree nested past its levels, a calendar of a century, mismatched names, a step the kind does not have: each refused with a line and a fix, never a hang.

```chart
kind: histogram
bins: 1000000
data: [1, 2, 3, 4, 5, 6]
```

```chart
kind: treemap
data:
  - name: a
    children:
      - name: b
        children:
          - name: c
            children:
              - name: d
                children:
                  - name: e
                    children:
                      - name: f
                        children:
                          - name: g
                            children:
                              - name: h
                                children:
                                  - name: i
                                    children:
                                      - { name: j, value: 1 }
```

```chart
kind: calendar
from: 1900-01-01
to: 2026-12-31
data: [["2026-11-20", 4]]
```

```chart
kind: boxplot
x: { values: [Mon, Tue] }
data: [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
colour: red
```

```chart
kind: funnel
data: [[Visited, 100], [Paid, 10]]
steps:
  - title: one
    bins: 20
  - title: two
```
