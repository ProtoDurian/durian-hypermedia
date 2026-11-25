---
title: "Animation: token chips and a record"
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

## Animation: token chips and a record

`tokens: ...` under a card lays out its words as chips, in order, wrapped. `mark id word, word: tone remark` boxes some in a tone for that step only, with the remark under their row (a word with a comma is named without it, or by its place, `#3`). `keys: A; B` makes the card a record whose values read `...` until a step fills them: `fill id A, B: value; value`. The record keeps its size on every step.

```animation
title: Reading a recipe line | words become a plan
## _
plain q: the line
  tokens: mix ( flour, sugar, salt ) then bake ( 180C, 25min )
store r: the plan
  keys: Action; Inputs; Then; Heat; Time
@step Read: The line is read word by word; the plan is still empty.
@step Mix: The first call names what to mix.
mark q mix, flour, sugar, salt: accent
fill r Action, Inputs: mix; flour, sugar, salt
@step Drop: Salt is optional here, so it is dropped.
mark q salt: bad dropped: optional
fill r Inputs: flour, sugar
@step Bake: Then the oven, hot and for a time.
mark q bake, 180C, 25min: accent
fill r Then, Heat, Time: bake; 180C; 25 minutes
```
