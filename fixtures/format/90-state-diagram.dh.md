---
title: "State: a state machine that its steps walk"
description: A state diagram drawn from its transitions; each step walks one transition (SPEC 3.2 State). Shown live, then static.
---

## State: a state machine that its steps walk

A `state` part draws a state machine from its transitions. `at` says where the walk is, and `fire` takes the one transition with that event from there.

```state title="An order"
[start] -> cart
cart -> paying "check out"
paying -> paid "card accepted"
paying -> cart "card declined"
paid -> shipped "ship"
shipped -> [end]
state paying "Paying" note="waits up to 10 minutes for the bank"
group done "Fulfilment": paid, shipped
@step A shopper fills the cart.
at cart
@step They check out.
fire check out
@step The bank declines the card: back to the cart.
fire card declined
@step They try another card, and the bank takes it.
at paying
fire card accepted
```


The same machine, static (the finished walk, no player):

```state static=true title="An order, static"
[start] -> cart
cart -> paying "check out"
paying -> paid "card accepted"
paying -> cart "card declined"
paid -> shipped "ship"
shipped -> [end]
state paying "Paying" note="waits up to 10 minutes for the bank"
group done "Fulfilment": paid, shipped
@step A shopper fills the cart.
at cart
@step They check out.
fire check out
@step The bank declines the card: back to the cart.
fire card declined
@step They try another card, and the bank takes it.
at paying
fire card accepted
```
