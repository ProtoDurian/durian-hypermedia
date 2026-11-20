---
title: A chart with too many points
expect: an error block naming the cap
---

```chart
kind: line
title: Many points
let:
  xs: range(1, 9000)
x: xs
series:
  - name: y
    data: xs * 2
```
