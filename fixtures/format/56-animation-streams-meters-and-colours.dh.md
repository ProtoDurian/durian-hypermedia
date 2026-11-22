---
title: "Animation: streams, meters and colours"
description: A fixture made from the Format page section of the same name.
---

## Animation: streams, meters and colours

A `send stream` keeps small dots flowing along a path for the whole step: traffic, a feed, readings. `level=0..100` puts a meter in a thing, and `set x level=` moves it. Here, weather stations stream readings to a hub, which batches them into a store; the hub's buffer fills and empties.

```animation
family st "stations"
family hub "the hub"
family store "the store"
group field "stations" layout=column
box s1 "hill station" in field is=st
box s2 "lake station" in field is=st
box s3 "city station" in field is=st
box hub "hub" is=hub level=10 note="keeps readings until it has a full batch"
cylinder db "readings store" is=store level=20 note="its meter: how full it is"
s1 -> hub
s2 -> hub
s3 -> hub
hub -> db
@step Three stations send a reading every few seconds. The hub keeps them in a buffer.
send stream s1 -> hub
send stream s2 -> hub
send stream s3 -> hub
set hub level=45
@step A storm: the hill station sends ten times as often, and the buffer fills.
send stream "storm: every second" s1 -> hub
send stream s2 -> hub
send stream s3 -> hub
set hub level=90 tone=warn
@step The buffer is full: the hub writes one batch to the store and empties.
send arrow "batch of 600" hub -> db
set hub level=5 tone=plain
set db level=40
@step Readings keep coming. When the buffer is full again, the next batch goes in: the store grows by a batch at a time.
send stream s1 -> hub
send stream s2 -> hub
send stream s3 -> hub
set hub level=90
then
send arrow "next batch" hub -> db
set hub level=5
set db level=60
```
