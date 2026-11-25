---
title: "Animation: eight colours, told apart by everyone"
description: A fixture made from the Format page section of the same name.
---

## Animation: eight colours, told apart by everyone

A scene can name up to eight families, and any two of them can stand side by side, so the eight colours are chosen by measurement, not by taste alone. Every pair differs in its **border** and in its **fill**, with normal sight and with the two common kinds of colour blindness (red-blind and green-blind, protanopia and deuteranopia, simulated). Every border is at least 3:1 against the stage and against any container it sits in; every word is at least 4.5:1 against what it sits on. A family has one fill for its boxes and its groups alike, and every border is at least 3:1 on any other family's fill, so a box of one family inside a group of another is still easy to see (one measured exception in light: the yellow family's olive border is 2.5:1 on the lilac, pink and green fills, where its own yellow fill marks its edge too). In dark a family writes its words in a light tint of its own colour. Light and dark each have their own eight, measured on their own backgrounds. Here all eight families share one scene, in two steps: one region (the services' family) holds things of four other families, and a worker of a fifth reads its queue from outside.

```animation
family user "people"
family edge "the edge"
family web "web servers"
family api "services"
family queue "queues"
family worker "workers"
family store "databases"
family cache "caches"
person u "reader" is=user
box cdn "CDN" is=edge
group region "one region" layout=row is=api
box w1 "web" in region is=web
box s1 "orders service" in region is=api
box q1 "orders queue" in region is=queue
box k1 "worker" is=worker
cylinder db "orders DB" in region is=store
box c1 "cache" in region is=cache
u -> cdn is=user
cdn -> w1 is=edge
w1 -> s1 is=web
s1 -> q1 is=api
q1 -> k1 is=queue
k1 -> db is=worker
s1 -> c1 is=api
@step Eight families on one stage: each has its own border and its own fill.
@step The services' region holds four other families; the worker of a fifth reads its queue from outside.
highlight k1
```

Which colour a family gets is the theme's business: the source names families and roles, never a colour value. A host restyles the palette with the tokens `--c1` to `--c8` (border and lines), `--c1-soft` (the fill of its boxes and groups alike; `--c1-plane` names the same colour) and `--c1-ink` (words in the family's colour), and the stage's own edges with `--scn-edge`, `--scn-frame-edge` and `--scn-band-edge`.
