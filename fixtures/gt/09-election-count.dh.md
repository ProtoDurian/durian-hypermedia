---
title: An election count by region
roles: { region: c1, a: c2, b: c3 }
---

# An election count by region

Regions report one at a time, so the running total can change leader before the last count is in.

```animation
title: Mayor of Riverton | votes counted, in thousands
## Regions
region n: North | 40 thousand voters
region e: East | 25 thousand voters
region s: South | 55 thousand voters
region w: West | 30 thousand voters
bars 2 a: running total | thousand votes
  axis 0, 20, 40, 60, 80
  labels: Ada Lin, Ben Ortiz
  line majority of all 150: 75
@step North: North reports first: Ada Lin 26, Ben Ortiz 14.
light n
tag n: Lin 26, Ortiz 14
values: 26 14
@step East: East leans to Ortiz: 9 to 16. Lin still leads, 35 to 30.
light e
tag e: Lin 9, Ortiz 16
values: 35 30
@step South: South is the largest region and swings it: Ortiz 36, Lin 19. Ortiz leads 66 to 54.
light s
tag s: Lin 19, Ortiz 36
values: 54 66
@step West: West splits 15 to 15. Ortiz wins 81 to 69, past the majority line.
light w
tag w: Lin 15, Ortiz 15
values: 69 81
light Ben Ortiz: winner
```
