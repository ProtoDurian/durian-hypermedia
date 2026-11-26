---
title: Merge sort on 8 numbers
roles: { split: c1, merge: c2 }
---

# Merge sort on 8 numbers

Merge sort splits the list in halves until each piece has one number, then merges pieces back two at a time, always taking the smaller front number.

```animation
title: Merge sort | 8 numbers
## Start
split s: 5 2 8 1 9 3 7 4
## Halves
split h1,h2: 5 2 8 1; 9 3 7 4
## Pairs
split q1..q4: 5 2; 8 1; 9 3; 7 4
## Sorted pairs
merge m1..m4: 2 5; 1 8; 3 9; 4 7
## Sorted halves
merge n1,n2: 1 2 5 8; 3 4 7 9
## Sorted
merge f: 1 2 3 4 5 7 8 9
@step Split: Split the 8 numbers into two halves of 4.
s -> h1,h2
@step Split again: Split each half into pairs.
h1 -> q1,q2
h2 -> q3,q4
@step Sort pairs: Splitting a pair gives single numbers; merging them back puts the smaller first.
q1 -> m1
q2 -> m2
q3 -> m3
q4 -> m4
@step Merge pairs: Merge two sorted pairs into a sorted group of 4 by taking the smaller front number each time.
m1,m2 -> n1
m3,m4 -> n2
@step Merge halves: Merge the two sorted halves. 7 comparisons at most; the list is sorted.
n1,n2 -> f
tone f good
```
