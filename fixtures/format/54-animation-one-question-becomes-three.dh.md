---
title: "Animation: one question becomes three"
description: A fixture made from the Format page section of the same name.
---

## Animation: one question becomes three

`split` and `merge` with arrows show one request fanning out and coming back together. Here, a library search asks three branch catalogues at once and merges their answers.

```animation
family q "the question"
family br "branch catalogues"
pill ask "find: tide tables" is=q
box planner "planner" is=q note="splits a search by branch"
group branches "branches" layout=column
cylinder b1 "north branch" in branches is=br
cylinder b2 "harbour branch" in branches is=br
cylinder b3 "old town branch" in branches is=br
box merge "merger" is=q
ask -> planner
planner -> b1
planner -> b2
planner -> b3
b1 -> merge
b2 -> merge
b3 -> merge
@step A reader asks for tide tables. The planner sees that three branches keep them.
send arrow ask -> planner
@step The planner asks all three branches at once.
send arrow "same question" planner -> b1
send arrow planner -> b2
send arrow planner -> b3
@step Each branch answers with what it has; the old town branch has nothing.
send both "2 books" b1 -> merge
send both "5 books" b2 -> merge
set b3 dim=yes
@step The merger joins the answers into one list for the reader.
add pill res "7 books, by date" is=q
merge -> res
send arrow merge -> res
```
