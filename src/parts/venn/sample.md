Two to four sets in fixed, even shapes. It is not drawn to scale on purpose: the names are written in the regions. Hover, tap or focus a region to read its items; on a narrow screen they are listed under the figure.

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

With steps, one set comes in at a time, with its regions.

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
