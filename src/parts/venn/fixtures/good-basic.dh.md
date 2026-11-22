---
title: Venn, good
---
# Venn

Two to four sets in fixed, even shapes; the names are written in the regions.

```venn title="Who writes what"
set go "Go" [c1]
set rust "Rust" [c2]
set zig "Zig" [c3]
go: Ana, Ben
go & rust: Cy
go & rust & zig: Dee (writes all three)
rust: Eve, Fay
zig: 4 people
```

Two sets, and a name with a comma in quotes.

```venn title="Overlap"
set a "Readers"
set b "Writers"
a: Ana, "Ben, the elder" (reads late)
a & b: Cy
b: 12
```

With steps, one set at a time.

```venn title="Adding one set at a time"
set a "Readers" [c4]
set b "Writers" [c5]
set c "Reviewers" [c6]
@step Readers and writers overlap.
a: Ana, Ben
a & b: Cy
b: Dee
@step Reviewers join; some people do all three.
c: Eve
a & b & c: Fay
```

All four sets.

```venn title="Four sets"
set n "North" [c1]
set e "East" [c2]
set s "South" [c3]
set w "West" [c4]
n: a
e: b
s: c
w: d
n & e & s & w: everyone
```
