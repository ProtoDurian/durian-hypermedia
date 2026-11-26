---
title: "Chart: pie and radar with controls"
description: Two charts the reader moves; the slices and the outline glide to the new numbers.
---

## Chart: pie and radar with controls

Move a control and the chart does not redraw: the slices and the outline slide from where they were to the new numbers. With reduced motion they jump.

A pie with a slider and a choice (made-up hours of a day):

```chart
kind: pie
title: Where the hours of a day go
controls:
  - slider: sleep
    label: Hours of sleep
    min: 4
    max: 10
    step: 0.5
    value: 7
  - select: day
    label: Kind of day
    options: [weekday, weekend]
let:
  awake: 24 - sleep
  work: "day == 'weekday' ? awake * 0.5 : awake * 0.1"
  meals: 2.5
  play: awake - work - meals
x: { values: [Sleep, Work, Meals, Play] }
series:
  - name: hours
    data: "[sleep, work, meals, play]"
```

A radar with a slider and a choice (made-up scores out of 6):

```chart
kind: radar
title: How two teams score
controls:
  - slider: focus
    label: Focus on speed
    min: 0
    max: 4
    value: 2
  - select: team
    label: Compare with
    options: [Team Maple, Team Pine]
let:
  mine: "[2 + focus, 6 - focus, 3, 1 + focus, 5 - focus / 2]"
  other: "team == 'Team Maple' ? [4, 4, 5, 2, 3] : [2, 5, 3, 5, 4]"
x: [Speed, Safety, Size, Clarity, Cost]
y: { min: 0, max: 6 }
series:
  - name: Our team
    data: mine
  - name: "Other team"
    data: other
```
