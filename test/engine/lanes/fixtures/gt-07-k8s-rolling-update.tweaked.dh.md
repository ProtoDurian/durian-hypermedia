---
title: Kubernetes rolling update
roles: { svc: c0, old: c1, new: c2 }
---

# A Kubernetes rolling update

The rollout swaps pods one at a time. It starts one new pod, waits until it is ready, then stops one old pod, so 3 pods always serve traffic.

```animation
title: Rollout web | image v1 to v2, max surge 1, max unavailable 0
## Service
svc s: Service web | sends traffic to ready pods
## Version 1
old p1..p3: pod web-v1-a; pod web-v1-b; pod web-v1-c | image v1
## Version 2
new q1..q3: pod web-v2-a; pod web-v2-b; pod web-v2-c | image v2
@step Before: Three v1 pods serve all traffic.
s -> p1,p2,p3
@step Start one: Kubernetes starts one v2 pod. It is not ready, so it gets no traffic yet.
show q1
tone q1 warn
text q1: starting
@step Swap one: The v2 pod passes its readiness check. It joins the service and one v1 pod stops.
tone q1 off
text q1: ready
s -> q1
hide p1
@step Swap two: The same again: a second v2 pod starts, becomes ready, and a second v1 pod stops.
show q2
text q2: ready
s -> q2
hide p2
@step Done: The last v1 pod is replaced. All traffic goes to v2.
show q3
text q3: ready
s -> q3
hide p3
tone q1,q2,q3 good
```
