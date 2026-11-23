---
title: Graph hostile fixture
---

# A graph that asks for too much

Ten thousand edges from one short line, by a pattern:

```graph title="a hundred times a hundred"
x{1..100} -> y{1..100}
```

A group inside itself and a ring of groups:

```graph title="groups in groups"
group a in a
group b in c
group c in b
node n in a
```

A pattern that makes a billion names:

```graph title="a billion names"
node big-{1..1000000000}
```

Groups nested far too deep:

```graph title="too deep"
group g0
group g1 in g0
group g2 in g1
group g3 in g2
group g4 in g3
group g5 in g4
group g6 in g5
group g7 in g6
group g8 in g7
node n in g8
```

A line that is not a graph line, an open quote and an edge with an empty end:

```graph title="broken lines"
node a "open
a b c
b ->
```

More edges than any graph may hold, across lines (7,500):

```graph title="too many edges"
a{1..50} -> b{1..50}
c{1..50} -> d{1..50}
e{1..50} -> f{1..50}
```
