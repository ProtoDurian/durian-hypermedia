---
title: "Animation: long paths in labels"
description: A path breaks only after a slash, on a laptop and on a phone, and always keeps the name of its file (SPEC 6.15).
---

## Animation: long paths in labels

A path breaks only after a `/`, on a laptop and on a phone, and always keeps the name of its file.

```animation layout=graph dir=down
box src "features/checkout/observability/contract.yaml"
box out "internal/wiring/registry/providers.go"
box dash "observability/dashboards/checkout-overview.json"
src -> out "task gen"
src -> dash
@step The contract is the one source.
highlight src
@step Both files are generated from it.
highlight out dash
```
