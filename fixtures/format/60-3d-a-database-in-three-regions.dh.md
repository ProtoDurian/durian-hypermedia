---
title: "3D: a database in three regions"
description: A fixture made from the Format page section of the same name.
---

## 3D: a database in three regions

Regions as layers: a write lands in one region, and its copies arrive in the others at different times.

```animation 3d
layer us "us-east"
layer eu "eu-west"
layer ap "ap-south"
family user "users"
family db "database"
family copy "copying"
person u1 "user in Virginia" layer=us is=user
cylinder db1 "primary" layer=us is=db note="takes every write"
person u2 "user in Paris" layer=eu is=user
cylinder db2 "replica" layer=eu is=db note="a read-only copy"
person u3 "user in Mumbai" layer=ap is=user
cylinder db3 "replica" layer=ap is=db note="a read-only copy"
db1 --> db2 "copies" is=copy
db1 --> db3 "copies" is=copy
@step Three regions, each with a copy of the database. Only the primary, in us-east, takes writes.
split layers
@step A user in Virginia adds an item to their cart. The primary writes it as change 41.
send "write: cart +1" u1 -> db1
say db1: change 41
@step The primary sends change 41 down to the other regions.
send arrow "change 41" db1 -> db2 is=copy
send arrow "change 41" db1 -> db3 is=copy
@step Paris gets it first. Mumbai is further away and still has change 40.
highlight db2 tone=good
highlight db3 tone=warn
say db3: still at 40
@step Look at ap-south alone: a read here now gets the cart without the new item. That gap is replication lag.
focus ap
send "read cart" u3 -> db3
@step A moment later change 41 arrives, and every region reads the same cart.
focus all
highlight db3 tone=good
send "read cart" u3 -> db3
```
