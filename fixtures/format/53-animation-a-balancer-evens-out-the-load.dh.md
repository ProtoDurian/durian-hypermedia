---
title: "Animation: a balancer evens out the load"
description: A fixture made from the Format page section of the same name.
---

## Animation: a balancer evens out the load

Meters on several things show a balance changing step by step. Here, a kitchen's three cooks get orders; a pass moves orders from the busiest cook to the least busy one.

```animation dir=down
family pass "the pass"
family cook "cooks"
box pass "the pass" is=pass note="the counter where orders are handed out"
group line "the line" layout=row
box c1 "grill" in line is=cook level=90
box c2 "salads" in line is=cook level=20
box c3 "pasta" in line is=cook level=40
pass -> c1
pass -> c2
pass -> c3
@step Orders pile up at the grill; the salad cook is nearly idle.
highlight c1 tone=hot
@step The pass sends the next two orders to the salad cook instead.
send both "2 orders" pass -> c2
set c2 level=45
@step The grill finishes what it had, and gets nothing new until it catches up.
set c1 level=60
@step Now each cook has about the same amount of work.
set c1 level=50
set c3 level=45
highlight c1 c2 c3 tone=good
```
