---
format: 12
title: Merge sort
roles: { split: c1, merge: c2, plain: c0 }
---

```animation
title: Merge sort | 8 numbers
layout: tree
split s [array]: 5 2 8 1 9 3 7 4
  split h1 [array]: 5 2 8 1
    split q1 [array]: 5 2
    split q2 [array]: 8 1
  split h2 [array]: 9 3 7 4
    split q3 [array]: 9 3
    split q4 [array]: 7 4
@step Split: The 8 numbers become two halves.
show h1,h2
@step Split again: Each half becomes two pairs.
show q1..q4
@step Sort pairs: The smaller number goes first.
q1 = 2 5
q2 = 1 8
q3 = 3 9
q4 = 4 7
@step Merge pairs: The numbers fly up from the pairs.
h1 = 1 2 5 8 from q1,q2
h2 = 3 4 7 9 from q3,q4
@step Merge halves: The two halves merge into one sorted list.
s = 1 2 3 4 5 7 8 9 from h1,h2
tone s good
```
