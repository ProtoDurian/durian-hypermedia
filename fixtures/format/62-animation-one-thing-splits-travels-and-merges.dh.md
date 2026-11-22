---
title: "Animation: one thing splits, travels and merges"
description: A fixture made from the Format page section of the same name.
---

## Animation: one thing splits, travels and merges

A token can be cut into pieces and put back together. `split f into 3 "part"` makes three tokens, `f.1` to `f.3` ("part 1" to "part 3"), where `f` was. `move f.1 f.2 f.3 into b` moves them together, as one hop. `merge f` puts the pieces back into `f`. A token can sit at a thing (`token t "req" at api`) or wait in a container (`token f "photo.jpg" in a`).

```animation
group a "sender" layout=column
group b "receiver" layout=column
a -> b
token f "photo.jpg" in a
@step The sender has a file that is too big for one packet.
highlight f
@step It is split into three parts.
split f into 3 "part"
@step The parts travel together: one hop.
move f.1 f.2 f.3 into b
@step The receiver joins them back into the file.
merge f
```
