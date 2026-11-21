---
title: "3D by a new author: a memory read"
description: A fixture made from the Format page section of the same name.
---

## 3D by a new author: a memory read

Written from the spec alone by a helper that had not seen the engine; doccheck passed it on the first try.

```animation 3d dir=down
layer reg "registers" note="Inside the CPU. Tiny and the fastest place there is."
layer l1 "L1 cache" note="Small and very fast. Each core has its own."
layer l2 "L2 cache" note="Bigger than L1 and a bit slower."
layer ram "RAM" note="Main memory. Large, but far slower than the caches."
layer disk "disk" note="Storage. Huge, and by far the slowest."
box cpu "program" layer=reg
box c1 "L1 cache" layer=l1
box c2 "L2 cache" layer=l2
box mem "RAM" layer=ram note="Holds the data the program is using right now."
cylinder dsk "disk" layer=disk
pill vx "x = 42" layer=ram
cpu -> c1 -> c2 -> mem -> dsk
@step The program wants the value x. It asks the fastest place first, the L1 cache, and x is not there (a miss).
split layers
send "read x" cpu -> c1
say c1: miss, no x here
@step The L1 cache passes the question down to the L2 cache. Another miss.
send "read x" c1 -> c2
say c2: miss, no x here
highlight c2 tone=warn
@step The L2 cache asks RAM, and RAM has x (a hit). The disk is not needed.
send "read x" c2 -> mem
say mem: found x
highlight mem vx tone=good
set dsk dim=yes
@step Zoom in on RAM. This is the slow part of the trip, which is why caches exist.
focus ram
note vx: the value the program asked for
@step The camera pulls back. The value starts its way up, and the L2 cache keeps a copy.
focus all
send "x = 42" mem -> c2
add pill x2 "x = 42" layer=l2
@step The L1 cache keeps a copy too.
send "x = 42" c2 -> c1
add pill x1 "x = 42" layer=l1
@step The value reaches the program and is held in a register.
send "x = 42" c1 -> cpu
add pill xr "x = 42" layer=reg
@step Layers back together. The next read of x is answered at once, with no trip down.
stack layers
highlight xr tone=good
```
