---
title: Worksheet shapes
concept: worksheet shapes
description: Public samples of every worksheet shape of the composed stage, about kilns, valleys, ovens and ferries.
roles:
  hub: c2
  desk: c3
  plain: c0
---

# Worksheet shapes

## A window of samples

Rows of twenty cells; the cells outside the window fade; a result per row in its tone, replaced in its place by the next.

```animation
title: Rise over the window | probes by kiln
sheet: kilns, each with its own probes | 2 of 9 kilns
hub k0: kiln east | owns 2 probes
  plain pa "probe A": 40 43 46 49 52 55 58 61 64 67 70 73 76 79 82 85 88 91 94 97
  plain pb "probe B": 50 53 56 59 62 65 68 71 74 77 80 83 86 89 92 95 98 105 2 16
hub k1: kiln west | owns 1 probe
  plain pc "probe C": 10 12 14 16 18 20 22 24 26 28 30 32 34 36 38 40 42 44 46 48
=> desk out: the yard | adds the partials
@step Samples: Twenty samples of each probe.
@step The window: Only the last ten samples count.
dim pa pb pc 1..10
@step Last minus first: Probe B falls back after a restart.
mark pb 19: bad a restart: the count falls back near zero
value pa pb pc: last − first | 27, -82, 18
@step Filter: A fall is dropped, the others kept.
value pa pb pc: kept or dropped | 30.00, -91.11 (bad struck), 20.00
@step Partials: One pair per kiln.
sum k0: partial of this kiln | a = 30.00 | n = 1 -> (30.00, 1)
sum k1: partial of this kiln | a = 20.00 | n = 1 -> (20.00, 1)
@step Final: The yard adds the pairs.
total out: a = 30.00 + 20.00 = 50.00 | n = 2 => written | 50.00
aside out: without the filter: -41.11
```

## Partials that travel

Roomy rows (`spacing: roomy`). Each valley's readings are chips in its partial card, and its pair a chip that moves to the office in the next step (or in the same step with `pass`), labelled by the valley's short name. `light v0, v1` and `light out` give the active boxes the stage's halo.

```animation
title: Mean rainfall | gauges by valley
sheet: valleys, each with its own gauges | 3 of 9 valleys
spacing: roomy
hub v0 "north": valley north | owns 3 gauges
  plain ga "gauge A": 14
  plain gb "gauge B": 6
  plain gc "gauge C": 10
hub v1 "south": valley south | owns 1 gauge
  plain gd "gauge D": 8
=> desk out: the office | adds the partials
@step Readings: 14, 6, 10 in the north; 8 in the south.
@step Sum and count: Each valley sends (sum, count).
sum v0: partial of this valley | + A 14; B 6; C 10 | a = 30 | n = 3 -> (30, 3)
sum v1: partial of this valley | + D 8 | a = 8 | n = 1 -> (8, 1)
light v0, v1
@step The office adds: 38 rain in 4 gauges.
aside out: Σa = 30 + 8 = 38
aside out: Σn = 3 + 1 = 4
@step Divide once: 38 ÷ 4 = 9.50, the mean of every gauge.
total out: Σa ÷ Σn, divided once => mean | 38 ÷ 4 = 9.50
light out
@step Not a mean of means: Averaging the valley means is wrong.
total out wrong: the valley means 10 and 8, their weights lost => the mean of the means | (10 + 8) ÷ 2 = 9.00 (bad struck)
```

## Columns, empty cells and tiles

Two columns named under each row; the second is empty until a step fills it; tiles in the outcome column change in place.

```animation
title: Loaves per oven | one day, by the hour
sheet: ovens, each with its own trays | 3 of 9 ovens
labels: before, now
hub o0: oven east | owns 2 trays
  plain ta "tray A": 211 _
  plain tb "tray B": 18 _
hub o1: oven west | owns 1 tray
  plain tc "tray C": 340 _
=> desk out: the bakery | keeps the day, per oven
@step A day is long: The bakery keeps one tile per hour.
tile out h1: hour 1 | 24 | 6+5+7+6
tile out h2: hour 2 | 25 | 6+8+5+6
tile out h3: hour 3 (now) | 7 | 7, one batch
tile out more: … 21 more
@step This batch: Each tray's increase; tray B was emptied.
fill ta tb tc 2: 214, 2, 341
mark tb 2: bad emptied: the new count is the increase
value ta tb tc: now − before | +3, +2 (warn), +1
@step The hour grows: Hour 3 takes this batch.
sum o0: partial of this oven | a = 3 + 2 = 5 | n = 2 -> (5, 2)
sum o1: partial of this oven | a = 1 | n = 1 -> (1, 1)
pass o0
pass o1
tile out h3: hour 3 (now) | 13 | 7+6, two batches
@step Loaves an hour: The day's sum over the time it covers.
total out: Σ tiles = 24 + 25 + 13 = 62 | covered = 2 hours and 2 batches of 4 => rate | 62 ÷ 2.5 hours = 24.8 an hour
@step A day later: The oldest tile drops each hour.
total out: Σ tiles = the loaves of the last day | covered = 23 hours and 1 to 4 batches => rate | Σ tiles ÷ about 24 hours
```

## A strip in the outcome column

The office keeps the last twenty sums as a strip of small cells, its two ends named and lit.

```animation
title: Change over four minutes | ferries by pier
sheet: piers, each with its own ferries | 2 of 9 piers
hub p0: pier north | owns 2 ferries
  plain fa "ferry A": 330
  plain fb "ferry B": 170
hub p1: pier south | owns 1 ferry
  plain fc "ferry C": 620
=> desk out: the harbour office | adds, then takes the change
@step Counts: 330 and 170 in the north, 620 in the south.
@step The office adds: 1120, the newest sum.
sum p0: partial of this pier | a = 330 + 170 = 500 | n = 2 -> (500, 2)
sum p1: partial of this pier | a = 620 | n = 1 -> (620, 1)
pass p0
pass p1
aside out: a = 500 + 620 = 1120 (the two piers together)
@step It keeps four minutes: Twenty sums, 1050 to 1120.
strip out ring: keeps the last 20 sums (240 s ÷ 12 s) | 1050 1054 1057 1061 1065 1068 1072 1076 1079 1083 1087 1091 1094 1098 1102 1105 1109 1113 1116 1120 | oldest, this tick
keep mark ring 1: accent
keep mark ring 20: accent
@step The change: 1120 − 1050 = 70, scaled up to 240 s.
total out: newest − oldest = 1120 − 1050 = 70 | the 20 sums cover 228 s of the 240: × 240/228 => change | 70 × 240/228 = 73.68
```

## Cards that go

Three cards and their dashed arrows show in the first step only; `hide` ends them, their place stays, and a list takes the stage.

```animation
title: Picking a bound | three terms, one bound
## Terms
hub t1..t3: term one; term two; term three | a candidate
## Bound
desk bd: the bound | the smallest term
@step Terms: Three terms point at the bound.
t1,t2,t3 --> bd
@step The list: The terms go; the rule stays.
hide t1..t3
list The rule
  the bound: the smallest term
  + checked once a step
  - the old guess
@step Done: The bound alone remains.
```
