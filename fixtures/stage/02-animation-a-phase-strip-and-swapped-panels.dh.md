---
title: "Animation: a phase strip and swapped panels"
description: A fixture made from the Format page section of the same name (a composed stage).
roles:
  client: c1
  server: c2
  store: c3
  job: c4
  cache: c5
  ops: c6
  plain: c0
---

## Animation: a phase strip and swapped panels

A `track:` is a strip of phases, coloured by role; `at` puts each step on it, and `carry:` follows the step. A panel (`grid`, `rows`, `map`, `list`) shows only in its step, in one region as tall as the tallest, so the page does not jump. A grid item ends with a verdict, `[+ kept]` or `[- why]`.

```animation
track: job fetch, resolve | cache lookup | job build, test | store publish
carry: one package
where: a monorepo of 40 packages · the main branch
@step Resolve: Every package is listed; drafts and private ones are dropped.
at resolve
grid 2
  job: ui-kit | 3.2.0 · ready [+ kept]
  job: router | 1.9.4 · ready [+ kept]
  job: icons | 0.8.0 · draft [- draft: skip]
  job: internal-tools | 0.1.0 · private [- private: skip]
foot: only ready, public packages go on
@step Cache: Each package's hash picks its cache shard.
at lookup
rows
  ui-kit ; 3.2.0 | hash = 0x51a2 ; * shard 2 of 8 | => cache: cache shard 2 | a hit ; built before
  router ; 1.9.4 | hash = 0x9f07 ; * shard 7 of 8 | => cache: cache shard 7 | ! a miss ; build it
  ! a miss sends the package on to build
@step Publish: The built package is renamed for the registry.
at publish
map rename
  job: router 1.9.4
  built from the main branch
  to
  + name; + version; + licence; - source maps; - test files
```
