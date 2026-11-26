---
title: A restaurant order
roles: { guest: c1, floor: c2, kitchen: c3 }
---

# A restaurant order, table to kitchen to table

The waiter writes one ticket. The kitchen splits it by station, and the pass puts the plates back together before they go out.

```animation
title: Table 7 | two mains and a salad
## Dining room
guest t7: table 7 | 3 guests
## Floor
floor w: waiter | Sam
floor pos: till | prints tickets
## Kitchen
kitchen grill: grill station | steak, burger
kitchen cold: cold station | salad
kitchen ps: the pass | head chef checks every plate
@step Order: The guests order a steak, a burger and a salad.
t7 -> w: steak, burger, salad
@step Ticket: The waiter keys the order into the till, which prints one ticket per station.
w -> pos: order for table 7
pos -> grill: steak, burger
pos -> cold: salad
@step Cook: The stations cook at the same time. The salad is ready first and waits at the pass.
light grill,cold
cold -> ps: salad
tag ps: 1 of 3 plates
@step Plate: The steak and burger reach the pass. The chef checks all three and calls the waiter.
grill -> ps: steak, burger
tag ps: 3 of 3 plates
tone ps good
@step Serve: The waiter carries the three plates to table 7 together.
ps -> w: 3 plates
w -> t7: dinner
tone t7 good
```
