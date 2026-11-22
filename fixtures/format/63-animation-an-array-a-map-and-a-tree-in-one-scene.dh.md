---
title: "Animation: an array, a map and a tree in one scene"
description: A fixture made from the Format page section of the same name.
---

## Animation: an array, a map and a tree in one scene

Data structures are things like any other, and live in one scene with a person, a service and a database. Each is `closed=yes`: small and faint until the story zooms into it. `map cart "cart sizes" buckets=3: ana: 3, ...` is a map of keys and values, drawn as a hash table: a key's bucket is the sum of its letters' codes, mod 3. `get cart ana` looks a key up (its bucket and entry light up), `get ids 3` reads an array by index, and `put cart dee: 4` adds an entry. `dir=down` on the fence runs the scene top to bottom. Without `buckets=`, a map is a table of keys and values.

```animation dir=down size=s
family svc "the service"
family data "its data"
person ana "Ana"
group api "orders service" layout=row is=svc
array ids "sorted ids" in api closed=yes is=data: 12, 19, 27, 34
map cart "cart sizes" in api buckets=3 closed=yes is=data: ana: 3, ben: 7, cy: 9
tree idx "price index" in api closed=yes is=data
pill p30 "30" in idx
pill p20 "20" in idx under p30 left
pill p50 "50" in idx under p30 right
pill p40 "40" in idx under p50 left
cylinder db "orders database"
ana -> api
api -> db
@step Ana asks for her orders. The service keeps three structures in memory.
say ana: my orders, please
@step Zoom into the array: four ids, sorted.
zoom into ids
@step Index 3 is read at once: 34. No search.
get ids 3
@step Now the map. A key's bucket: the sum of its letters' codes, mod 3.
zoom out
then
zoom into cart
@step ana goes to bucket 1, which cy shares (a chain). Its value: 3 items.
get cart ana
@step A new key, dee, goes to bucket 2.
put cart dee: 4
@step Now the tree: smaller prices go left, bigger right.
zoom out
then
zoom into idx
@step Find 40: at the root, 30, go right.
highlight p30
@step At 50, go left: 40 is found.
highlight p50
then
highlight p40 tone=good
@step Back out: the service answered from memory, not the database.
zoom out
say ana: that was fast
```
