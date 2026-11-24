---
title: "Animation: the engine"
description: A fixture made from the Format page section of the same name.
---

## Animation: the engine

One language for every animation: a free 2D space of **entities** (shapes, containers, data structures, tokens), **connectors** that follow their ends, **layouts** that place things, a **camera**, and **steps** of changes that run together. The reader can step, or explore: drag to move, pinch or Ctrl + wheel to zoom, click a thing to read its note, then "Back to the story". Here, an array is sorted: `swap` trades two cells, `highlight` lights them for one step, a pointer moves.

```animation
array a: 5 2 8 1
pointer i "i" at a.0
@step Bubble sort compares neighbours. 5 and 2 are out of order.
highlight a.0 a.1
@step So they swap: 2 now comes first.
swap a.0 a.1
@step It compares 5 and 8: in order, so they stay.
move i to a.1
highlight a.1 a.2
@step 8 and 1 are not: they swap, and 8, the biggest, has reached the end.
move i to a.2
swap a.2 a.3
set a.3 tone=good
@step Two more passes move 1 to the front. The array is sorted.
swap a.1 a.2
swap a.0 a.1
set a.0 tone=good
set a.1 tone=good
set a.2 tone=good
remove i
```
