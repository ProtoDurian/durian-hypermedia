---
format: 12
title: Regions
roles: { user: c1, db: c2, copy: c3, plain: c0 }
---

```animation 3d
layout: layers
## us-east
user u1 [person]: user in Virginia
db db1 [cylinder]: primary | takes every write
## eu-west
user u2 [person]: user in Paris
db db2 [cylinder]: replica | a read-only copy
## ap-south
user u3 [person]: user in Mumbai
db db3 [cylinder]: replica | a read-only copy
db1 --> db2, db3 (copy): copies
db1,db2,db3 is change 40
layers apart
@step Write: A user adds an item to the cart.
u1 -> db1: write cart +1
db1 is change 41
@step Copy: The primary sends change 41 to the other regions.
db1 -> db2, db3 (copy): change 41
@step Paris: Paris gets it first.
db2 is change 41
tone db2 good
@step Mumbai: Mumbai is further away, still at 40.
tone db3 warn
```
