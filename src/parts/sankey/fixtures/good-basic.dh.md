---
title: Sankey, good
---
# Sankey

A flow a line, `from -> to: amount`; `node <id> "label" [colour]` only to name or colour one. Hover, tap or focus a band to light its path and read its share.

```sankey title="Where a request's time goes" unit=ms
request -> auth: 12
request -> handler: 80
handler -> db: 55
handler -> render: 20
handler -> cache: 5
node db "Postgres" [c3]
node cache "Redis" [c2]
```

Flows under a step appear in it: the bands grow out of their source. In a narrow column, a sankey with more than three columns runs top to bottom.

```sankey title="Where the month's budget goes" unit=USD
income -> payroll: 62000
income -> infra: 21000
income -> tools: 6000
income -> reserve: 11000
@step The money in and where it goes
@step Infrastructure breaks down
infra -> compute: 12500
infra -> storage: 5200
infra -> network: 3300
@step Compute splits by team
compute -> web: 7000
compute -> data: 4100
compute -> ml: 1400
node income "Revenue" [c1]
node payroll "People" [c4]
node infra "Infrastructure" [c6]
```
