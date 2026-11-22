---
title: "3D: not only code, a building's floors"
description: A fixture made from the Format page section of the same name.
---

## 3D: not only code, a building's floors

Floors as layers, and people moving between them: `move` into a container on another layer carries a thing (and what it holds) up or down.

```animation 3d
layer f3 "3rd floor: offices"
layer f2 "2nd floor: cafe"
layer f1 "1st floor: gym"
layer gr "lobby"
group fl3 layer=f3
group fl2 layer=f2
group fl1 layer=f1
group lobby layer=gr
group lift "lift" in fl3 tone=acc
box desk "Ana's desk" in fl3
box cafe "cafe" in fl2
box gym "gym" in fl1
person ana "Ana" in lobby
person ben "Ben" in lobby
@step A building with four floors. Ana and Ben wait in the lobby; the lift is up on the 3rd floor.
split layers
@step The lift comes down to the lobby.
move lift to lobby
@step Ana and Ben step in.
move ana to lift
move ben to lift
@step The lift goes up to the 2nd floor, and Ben gets out for coffee.
move lift to fl2
then
move ben to fl2
@step The lift goes on to the 3rd floor, and Ana walks to her desk.
move lift to fl3
then
move ana to fl3 after desk
focus f3
```
