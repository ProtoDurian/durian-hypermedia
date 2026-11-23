---
title: Fishbone — find the causes
---

# Fishbone — find the causes

Group possible causes around one effect, then reveal the next finding. Try the step controls, or compare the finished static drawing below. The theme buttons apply to both.

```fishbone title="Why is checkout slow?"
effect: Checkout takes 4 seconds at p95
@step Start with the service
Tools: the ORM loads every line item
  one query per line
Process: no load test before a release
@step Check the surroundings
Environment: the database is in another region
People: on-call is new to the service
highlight Tools
```

## The same diagram, ready to print

```fishbone static title="Why is checkout slow?"
effect: Checkout takes 4 seconds at p95
Tools: the ORM loads every line item
  one query per line
Process: no load test before a release
Environment: the database is in another region
People: on-call is new to the service
highlight Tools
```
