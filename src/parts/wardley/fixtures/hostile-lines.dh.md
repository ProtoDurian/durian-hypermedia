---
title: Wardley, hostile
---
# Wardley with wrong lines

A bare pair, a value outside the range, a need on an unknown component, a circle of needs and a line that is none of these: each refused with its line.

```wardley title="Wrong lines"
component a "A" [0.4, 0.6]
component b "B" visible=1.5 evolution=0.5
component c "C" visible=0.5 evolution=0.5
component d "D" visible=0.4 evolution=0.5
component e "E" visible=0.3 evolution=0.5
c -> d
d -> e
e -> c
c -> zz
what is this
```
