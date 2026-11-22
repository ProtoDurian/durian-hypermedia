---
title: Fishbone, good
---
# Fishbone

Causes by category along a spine into the effect. In a narrow column the spine turns vertical.

```fishbone title="Why is checkout slow?"
effect: Checkout takes 4 seconds at p95
People: on-call is new to the service
Process: no load test before a release
  only staging has real data
Tools: the ORM loads every line item
  one query per line
Environment: the database is in another region
```

With steps, the bones come in one at a time, and `highlight` lights one.

```fishbone title="Why did the deploy fail?"
effect: The deploy rolled back
@step The first two causes.
Config: a key was renamed in one place only
Tests: the contract test was skipped
@step The third, and the one to fix first.
Release: two services shipped in the wrong order
highlight Config
```
