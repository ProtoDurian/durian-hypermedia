---
title: "Animation: a worksheet"
description: A fixture made from the Format page section of the same name (a composed stage).
roles:
  client: c1
  server: c2
  store: c3
  job: c4
  cache: c5
  ops: c6
  plain: c0
---

## Animation: a worksheet

A `sheet:` lines up values in cells per row, rows in groups, and one outcome column. Steps `mark` a cell, give each row a `value`, `sum` a group (its result goes to the outcome column next) and write the `total`; `note:` and `= ...` are bands under the stage.

```animation
title: Takings | per hour, two shops
sheet: two shops, each with its own tills | 3 tills
server s0: shop north | 2 tills
  plain t1 "till 1": 40 55 70 85 20 35 50
  plain t2 "till 2": 10 20 30 40 50 60 70
server s1: shop south | 1 till
  plain t3 "till 3": 100 130 160 190 220 250 280
=> store out: head office | adds the shops
@step Counts: Each till's running count, read every 10 minutes.
@step Emptied: A drop means the till was emptied; the count before it is added back.
mark t1 5: bad +85
note: till 1 was emptied | 85 then 20 goes down: the till was emptied | so 85 is added back
@step Per hour: Each till's increase over the hour.
value t1 t2 t3: per hour | 100, 60, 180
@step Shops: Each shop adds its own tills.
sum s0: shop north | 100 + 60 = 160 -> 160
sum s1: shop south | 180 -> 180
@step Office: The office adds the shops.
total out: 160 + 180 = 340 => takings per hour | 340
aside out: an emptied till loses nothing
```
