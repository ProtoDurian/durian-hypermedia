---
title: "Alignment grid: points"
description: A fixture made from the Format page section of the same name.
---

## Alignment grid: points

An item can sit at a point instead: `item @ x, y`, with x and y from 0 to 1 (0 is the first end of the axis, 1 the last, 0.5 the middle). Cells and points can be mixed; here the cells only carry labels.

```alignment title="Which task first?"
x: low effort .. high effort
y: high impact .. low impact
low effort / high impact "Do first":
high effort / high impact "Plan it":
low effort / low impact "Fill a gap":
high effort / low impact "Skip":
Fix the typo (one line) @ 0.12, 0.22
Add a sample (people copy it) @ 0.32, 0.3
Speed up the build @ 0.66, 0.2
Rewrite the docs site @ 0.86, 0.62
Rename a variable @ 0.14, 0.78
Move the logo @ 0.4, 0.88
```
