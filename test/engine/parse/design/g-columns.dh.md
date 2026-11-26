---
format: 12
title: Columns
roles: { store: c1, plain: c0 }
---

```animation
title: A lending library | one dot per book returned
store returns [chart dots]: books returned each month | books
  x: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
@step First half: Six months, 12 to 31 books a month.
returns = 24 19 31 22 27 12
@step The year: The second half adds six columns.
returns = 24 19 31 22 27 12 9 11 28 30 26 35
light returns.Jul..Dec
@step December: December is the busiest month of the year.
light returns.Dec
```
