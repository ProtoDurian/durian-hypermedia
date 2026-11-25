---
title: "Animation: a sent token becomes an item"
description: A token sent into a queue joins it as an item that pop and move work on (SPEC 6.15).
---

## Animation: a sent token becomes an item

`send ... as <id>` into a queue, a stack or a list leaves the token there as an item, so a later line can take it out.

```animation layout=graph
box app "app"
queue buf "send buffer"
box net "network"
app -> buf
buf -> net
@step The app sends a segment into the buffer.
send "seg 1" app -> buf as s1
@step The network reads the oldest segment.
pop buf to net
```
