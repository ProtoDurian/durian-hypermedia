---
format: 12
title: Rebase
roles: { commit: c1, plain: c0 }
---

```animation
title: Git rebase | moving a branch
layout: graph
commit a [circle]: A
commit b [circle]: B
commit c [circle]: C
commit d [circle]: D
commit e [circle]: E
commit c2 [circle]: C'
commit d2 [circle]: D'
plain main [ref]: main
plain topic [ref]: topic
a -> b
b -> c
c -> d
b -> e
e -> c2
c2 -> d2
main at e
topic at d
@step Fork: The topic branch starts from B.
light c, d
@step Copy: C and D are copied on top of E as C' and D'; the old C and D are left behind.
show c2, d2
dim c, d
tone c2, d2 good
@step Move the label: The topic label moves to D'.
topic at d2
```
