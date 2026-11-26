---
title: A monthly budget
roles: { in: c2, account: c1, out: c4 }
---

# A monthly budget

Money comes in at the start of the month and goes out over it. What is left at the end goes to savings.

```animation
title: Budget for March | one person, in dollars
## Money in
in pay: salary | 3,200 on the 1st
in side: side job | 400 on the 15th
## Account
account acc: current account | balance at the start: 0
## Money out
out rent: rent | 1,300
out food: food | 550
out travel: travel | 180
out fun: going out | 300
out save: savings | what is left
bars 5 out: spent in March | dollars
  axis 0, 500, 1000, 1500
  labels: rent, food, travel, going out, savings
@step Pay: The salary arrives on the 1st.
pay -> acc: 3,200
text acc: balance 3,200
@step Rent: Rent goes out on the 2nd, the biggest cost of the month.
acc -> rent: 1,300
text acc: balance 1,900
values: 1300 0 0 0 0
@step Side job: The side job pays 400 on the 15th.
side -> acc: 400
text acc: balance 2,300
@step Spend: Over the month, food, travel and going out take 1,030.
acc -> food: 550
acc -> travel: 180
acc -> fun: 300
text acc: balance 1,270
values: 1300 550 180 300 0
@step Save: On the 31st, the 1,270 left moves to savings. The account is back to 0.
acc -> save: 1,270
text acc: balance 0
tone save good
values: 1300 550 180 300 1270
```
