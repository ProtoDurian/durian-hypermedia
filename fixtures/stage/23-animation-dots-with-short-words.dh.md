---
title: "Animation: dots with short words"
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

## Animation: dots with short words

On a phone, a row of dots keeps its short word beside the dot when it fits, with the row heading immediately above. Each dot stays on its true time.

```animation
title: A small copy desk | two arrivals
time: 0..10 | seconds
ruler: none
row job draft "Draft": +draft 2.9..3.1 @1..1 [dot]; +stored 2.9..3.1 @2 [dot]
row server copy "Copy": +copy 4.9..5.1 @1..1 [dot]; +saved 4.9..5.1 @2 [dot]
@step Arrive: The pieces arrive at different times.
keep at 2 [guide]: first copy
keep at 8 [guide] [good]: last copy
@step Save: The words change while the dots stay still.
```
