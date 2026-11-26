---
format: 12
title: Tree insert
roles: { plain: c0 }
---

```animation
title: Tree insert | a binary search tree
layout: tree
plain n8 [circle]: 8
  plain n3 [circle]: 3
    plain n1 [circle]: 1
    plain n6 [circle right]: 6
  plain n10 [circle right]: 10
    plain n14 [circle right]: 14
plain k [token]: 6
hide n6
@step Start: Insert 6. 6 is less than 8, so go left.
show k
k at n8
light n8
@step Right: 6 is more than 3, so go right.
k at n3
light n3
@step Insert: 3 has no right child, so 6 goes there.
show n6
hide k
tone n6 good
@step The order holds: Everything left of a node is smaller, everything right is bigger.
```
