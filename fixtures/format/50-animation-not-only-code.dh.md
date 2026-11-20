---
title: "Animation: not only code"
description: A fixture made from the Format page section of the same name.
---

## Animation: not only code

The same entities tell any story: how a bill becomes a law (in the United States, simplified).

```animation dir=down
person rep "member of the House"
group house "House"
group senate "Senate"
person pres "President"
box law "law"
rep -> house
house -> senate
senate -> pres
pres -> law
token bill "bill" at rep
@step A member of the House writes a bill and introduces it.
highlight rep
@step A House committee studies it; then the whole House votes, and a majority passes it.
move bill to house
add pill hc "committee" in house
add pill hv "vote: passed" in house tone=good
@step The Senate does the same: its own committee, its own vote.
move bill to senate
add pill sc "committee" in senate
add pill sv "vote: passed" in senate tone=good
@step The President signs it.
move bill to pres
say pres: signed
@step The bill is now a law.
move bill to law
set law tone=good
```
