---
title: A YAML alias bomb
a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]
e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]
f: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e]
g: &g [*f,*f,*f,*f,*f,*f,*f,*f,*f]
expect: the front matter is ignored with a message; the chart is refused
---

```chart
kind: bar
x: &x [1, 2]
series:
  - name: a
    data: &d1 [1, 2]
  - name: b
    data: *d1
  - name: c
    data: *d1
  - name: d
    data: *d1
  - name: e
    data: *d1
  - name: f
    data: *d1
  - name: g
    data: *d1
  - name: h
    data: *d1
  - name: i
    data: *d1
  - name: j
    data: *d1
  - name: k
    data: *d1
  - name: l
    data: *d1
  - name: m
    data: *d1
  - name: n
    data: *d1
  - name: o
    data: *d1
  - name: p
    data: *d1
  - name: q
    data: *d1
```
