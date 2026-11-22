---
title: "Animation: colour families, the way a diagram uses them"
description: A fixture made from the Format page section of the same name.
---

## Animation: colour families, the way a diagram uses them

Colour marks what a thing *is*, and words stay readable: a family's colour goes on the border, the lines and the dots, with a light tint inside (`fill=soft`, the default) or none (`fill=none`, the border only); the words are always in ink. A container can be one family and hold things of other families: each keeps its own colour. A thing of the same family as its container drops the tint, so it stands out. Set `fill=` on one thing, or on the whole scene (`` ```animation fill=none ``). Here, letters go from post boxes (border only) through a sorting centre (one family) whose two machines are two other families.

```animation
family box "post boxes"
family sort "sorting centres"
family a "machine A"
family b "machine B"
family van "vans"
group boxes "post boxes" layout=column
box p1 "Hill Road" in boxes is=box fill=none
box p2 "Lake Street" in boxes is=box fill=none
box p3 "Market Square" in boxes is=box fill=none
group c1 "north centre" layout=row is=sort
box c1a "machine A" in c1 is=a size=s
box c1b "machine B" in c1 is=b size=s
group c2 "south centre" layout=row is=sort
box c2a "machine A" in c2 is=a size=s
box c2b "machine B" in c2 is=b size=s
group vans "vans" layout=column is=van
box v1 "van 1" in vans is=van
box v2 "van 2" in vans is=van
cylinder po "post office" is=van
p1 --> c1 is=box
p2 --> c1 is=box
p3 --> c2 is=box
c1 --> v1 is=sort
c2 --> v2 is=sort
v1 --> po is=van
v2 --> po is=van
@step Letters wait in three post boxes. The colours say what each thing is; the words stay in ink.
@step A collection takes the Hill Road letters to the north centre.
send "letters" p1 -> c1
@step Machine A reads the addresses. Machine B, another family inside the same centre, stands by.
highlight c1a
set c1b dim=yes
@step Machine A breaks down, and machine B takes over.
set c1a down=yes
set c1b dim=no
highlight c1b tone=good
@step The sorted letters go out to van 1.
send arrow "sorted" c1 -> v1
@step Van 1 takes them to the post office.
send both "delivery" v1 -> po
```
