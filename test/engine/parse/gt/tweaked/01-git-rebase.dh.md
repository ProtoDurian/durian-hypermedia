---
title: Git rebase
roles: { commit: c1, replay: c2 }
---

# Git rebase

A rebase copies your branch's commits onto the new tip of `main`. The old commits stay in the repository until they are cleaned up, but no branch points at them.

```animation
title: git rebase main | run on the topic branch
## main
commit a: A | first commit
commit b: B | add login
commit e: E | fix typo
## topic
commit c: C | add cart
commit d: D | cart tests
## topic after rebase
replay c2: C' | add cart
replay d2: D' | cart tests
@step Fork: Topic branched from B. Main has since moved on to E.
a -> b
b -> e
b -> c
c -> d
tag e: main
say d: topic points here
@step Replay C: Git copies C on top of E as a new commit, C'.
show c2
e -> c2 (replay): new parent
c --> c2 (replay): same change
@step Replay D: Git copies D on top of C' as D'.
show d2
c2 -> d2 (replay)
d --> d2 (replay): same change
@step Move the label: The topic label now points at D'. C and D are left behind.
dim c,d
tag d2: topic
key commit: original commit
key replay: copied by the rebase
```
