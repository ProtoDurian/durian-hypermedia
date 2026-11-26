---
title: A payment refund through 3 systems
roles: { shop: c1, psp: c2, bank: c3 }
---

# A payment refund through three systems

A refund is asked for in seconds but settles in days. Each system keeps its own record, and they agree only at the end.

```animation
title: Refund for order 5521 | 49.00 EUR back to a card
## Shop
shop sb: shop backend | order 5521
## Payment provider
psp p: payment provider | refunds API
## Card bank
bank ib: customer's bank | card ending 4242
@step Ask: The customer asks for a refund. The shop calls the refunds API with a key, so a retry cannot refund twice.
sb -> p: POST /refunds, 49.00, key r-5521
text sb: refund asked
@step Accept: The provider accepts the refund but has not moved money yet. It answers "pending".
p -> sb (psp): 201 pending
text p: pending
@step Send: Overnight, the provider sends the refund to the customer's bank through the card network.
p -> ib: credit 49.00 to card 4242
text p: sent
@step Credit: Two days later the bank credits the card and confirms.
ib -> p (bank): credited
text ib: credited
tone ib good
@step Tell: The provider tells the shop with a callback. The shop marks the order refunded and emails the customer.
p -> sb (psp): callback refund.succeeded
text p: succeeded
text sb: refunded
tone sb,p good
```
