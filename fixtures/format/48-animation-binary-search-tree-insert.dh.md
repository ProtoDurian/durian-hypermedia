---
title: "Animation: binary search tree insert"
description: A fixture made from the Format page section of the same name.
---

## Animation: binary search tree insert

A `tree` lays out its nodes; `under n3 right` puts a node on a side. A token walks down, and the camera moves in for the insert.

```animation
tree t
circle n8 "8" in t
circle n3 "3" in t under n8 left
circle n10 "10" in t under n8 right
circle n1 "1" in t under n3 left
circle n14 "14" in t under n10 right
@step Insert 6. Start at the root: 6 is less than 8, so go left.
add token k "6" at n8
highlight n8
@step 6 is more than 3, so go right.
move k to n3
highlight n3
@step 3 has no right child: 6 goes there.
add circle n6 "6" in t under n3 right
remove k
set n6 tone=good
camera n3
@step The order holds: everything left of a node is smaller, everything right of it is bigger.
camera all
```
