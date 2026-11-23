---
title: "Animation: compact numeric rows"
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

## Animation: compact numeric rows

On a phone, dense numbered cells show every digit, bottom to top when the number cannot fit level. A short row heading can sit beside the cells.

```animation
title: A compact schedule | two clocks
time slots: 200..232 | shifts
ruler: none
cells: 1
row job slots "": +_ 200..232 [numbered]
time reads: 0..31 | reading clock
ruler: none
row labels: beside
cells: 1
row server readings "reads": 0 0..1; 1 1..2; 2 2..3; 3 3..4; 4 4..5; 5 5..6; 6 6..7; 7 7..8; 8 8..9; 9 9..10; 10 10..11; 11 11..12; 12 12..13; 13 13..14; 14 14..15; 15 15..16; 16 16..17; 17 17..18; 18 18..19; 19 19..20; 20 20..21; 21 21..22; 22 22..23; 23 23..24; 24 24..25; 25 25..26; 26 26..27; 27 27..28; 28 28..29; 29 29..30; 30 30..31
@step Read: Both clocks keep their full ranges.
@step Check: A guide marks a saved reading.
keep at reads 12 [guide]: saved
```
