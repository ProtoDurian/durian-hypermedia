---
title: "Chart with controls"
description: A fixture made from the Format page section of the same name.
---

## Chart with controls

The reader moves the slider or picks a view; the chart redraws from its formulas. A chart with formulas goes to an LLM as its source, since the formulas say more than one set of numbers.

```chart
kind: bar
title: Answers carried by each init call
controls:
  - slider: questions
    label: Questions in the script
    min: 1
    max: 20
    value: 6
  - select: view
    label: Show
    options: [per call, running total]
let:
  calls: range(1, questions + 1)
  carried: calls - 1
x: calls
y: { label: answers }
series:
  - name: answers
    data: "view == 'per call' ? carried : cumsum(carried)"
```
