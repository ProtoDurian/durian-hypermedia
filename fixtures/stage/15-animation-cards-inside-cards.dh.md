---
title: "Animation: cards inside cards"
description: A fixture made from the Format page section of the same name (a composed stage).
roles:
  client: c1
  server: c2
  store: c3
  job: c4
  cache: c5
  ops: c6
  plain: c0
---

## Animation: cards inside cards

A card line indented under a card is a card **inside** it (one level). The outer card is as tall as what it holds, and a connector to or from an inner card starts or ends at the card that holds it, so no line crosses a card. A title may end in a state word, `[+ open]` (good) or `[- shut]` (bad), that a step changes with `state`; `text id: line | line` gives a card new lines from that step on; `dashed` draws a card that is not there yet, and `dashed id off` makes it solid. `## Desk across Branches..Readers` is a band whose cards run left to right in one row; a line `next row` starts the row under them, centred.

```animation
title: A library | books between branches
## Branches
store h: main branch | two floors | open late
  store f1: ground floor [+ open] | returns desk
  store f2: top floor [- shut] | reading room
## Vans
job v: book van | one driver
  job v1: morning run | 8 stops
  job v2: evening run | 5 stops
## Readers
client r: readers
  client r1: card holder | borrows 3
  client r2: new reader | no card yet
## Desk across Branches..Readers
ops a: check in
ops b: shelve
ops c: lend
next row
ops d: repair
@step Morning: Books leave the main branch on the morning van.
dashed r2
f1 -> v: 40 books
v1 -> r: drop-off
@step Evening: The top floor opens and a new reader joins.
state f2: [+ open]
text v2: 5 stops | and the late club
dashed r2 off
tag r2: joined
say v2: runs late tonight and comes back by ten | one driver
say v2: no stops on the hill
@step Desk: Every book goes through the desk, one step at a time.
clear
a --> b: next
b --> c: next
d -> b: mended
```
