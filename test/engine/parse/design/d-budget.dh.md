---
format: 12
title: Budget
roles: { store: c1, out: c2, plain: c0 }
---

```animation
title: A monthly budget | March
## Money
store acc: checking | balance
## Spending
out spent [chart bar values]: spent in March | dollars
  x: rent, food, travel, fun, saved
spent = 0 0 0 0 0
acc is 3,200
@step Rent: The rent leaves first.
acc -> spent: 1,300
acc is 1,900
spent = 1300 0 0 0 0
@step Food: Groceries for the month.
acc -> spent: 550
acc is 1,350
spent = 1300 550 0 0 0
@step Saved: What is left goes to savings.
spent = 1300 550 0 0 1350
acc is 0
```
