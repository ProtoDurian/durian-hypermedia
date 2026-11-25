---
title: "Animation: bins"
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

## Animation: bins

A `bins:` block sorts an inventory into named bins. `items p1..p8: words` names the things (one label for all, or one per id split by `;`); `items 40: word` is a count with no names, drawn as small squares. Each `bin role id "Label": the rule | a second line` is one bin, coloured by its role. In a step, `into <bin>: p1, p2..p4` drops those things, or `into <bin>: 12` drops the next 12 left. The block works out the count of each bin, the leftover in the inventory and a running total, and draws them: every thing has one place in the inventory and one reserved slot in its bin, so nothing moves between steps. A narrow screen stacks the bins.

```animation
title: Library returns | one trolley run
bins: Returned books | books
items b1..b9: Atlas; Birds; Cooking; Dunes; Engines; Fungi; Gardens; Harbours; Insects
bin job s "Science": shelves 500 to 599
bin store r "Reference": stays in the building
bin ops h "Home": goes back to a branch
@step Science: Natural history goes to the science shelves.
into s: b2, b4, b6, b9
@step Reference: Two heavy books stay in the building.
into r: b1, b5
@step Branch: Three go back to a branch.
into h: b3, b7, b8
@step Done: Every book has a bin; the inventory is empty.
```

The same block with many unnamed things: each square is one thing, the counts do the talking.

```animation
title: Seed packets | 60 packets, sorted by season
bins: Packets by season | packets
items 60: packet
bin job a "Spring": sow in March
bin store b "Summer": sow in June
bin ops c "Autumn": sow in September
@step Spring: The first batch is spring seed.
into a: 24
@step Summer: Then summer seed.
into b: 20
@step Autumn: Twelve go to autumn; four are left over.
into c: 12
```

A thing can drop again in a later step: it **moves** to another bin, and its old place stays as a dashed outline. `show c` in step 2 makes bin c appear there (its place is reserved from the start); `light c: words` lights a bin with a note in it. `ledger: Photo | Album` (or `... | Album from 0` to number the bins from 0) adds a list of every thing with the number of its bin in each step; a move reads `1 → 3` in the warning tone. A long label wraps inside its chip; it is never cut. `inventory: off` drops the inventory frame when everything is binned in step 1.

```animation
title: Photo albums | nine photos, re-sorted
bins: Albums | photos
items p1..p9: Beach · sunny; Beach · dusk; Hike · summit; Hike · lake; City · night; City · market; Beach · kite; Hike · camp; City · bridge
bin job a "Album 1": the first sort
bin store b "Album 2": the first sort
bin ops c "Album 3": added in step 2
ledger: Photo | Album
inventory: off
@step Two albums: Nine photos sit in two albums.
into a: p1, p2, p7, p3, p4
into b: p5, p6, p8, p9
@step Three albums: A third album appears and four photos move to it.
show c
light c: four photos move here
into c: p3, p4, p8, p9
```
