---
title: "Animation by a new author: a CDN miss, then a hit"
description: A fixture made from the Format page section of the same name.
---

## Animation by a new author: a CDN miss, then a hit

The second scene from the same first try.

```animation
person u1 "user 1"
group edge "CDN edge" layout=row
cylinder origin "origin server" note="holds the original file"
u1 <-> edge
edge <-> origin
@step User 1 asks the CDN edge for logo.png.
send "GET logo.png" u1 -> edge
@step The edge has no copy: a miss.
say edge: Miss!
highlight edge tone=warn
@step The edge fetches the file from the origin server.
send "GET logo.png" edge -> origin
camera edge origin
@step The origin answers, and the edge keeps a copy.
send "logo.png" origin -> edge
add box copy "logo.png" in edge
@step The edge answers user 1.
send "logo.png" edge -> u1
camera all
@step User 2 asks the edge for the same file.
add person u2 "user 2"
u2 <-> edge
send "GET logo.png" u2 -> edge
@step The edge has a copy: a hit. It answers at once, with no trip to the origin.
say edge: Hit!
highlight copy tone=good
send "logo.png" edge -> u2
camera edge u2
```
