---
title: "Animation: pods, nodes, a service"
description: A fixture made from the Format page section of the same name.
---

## Animation: pods, nodes, a service

Containers nest: pods in nodes in a cluster. A service is a stable name in front of pods; when a node dies, a pod is started elsewhere.

```animation dir=down
family svc "service"
family web "web pods"
family cache "cache pods"
group cluster "cluster" layout=row
group n1 "node 1" in cluster
group n2 "node 2" in cluster
group n3 "node 3" in cluster
pill w1 "web-1" in n1 is=web
pill c1 "cache-1" in n1 is=cache
pill w2 "web-2" in n2 is=web
pill w3 "web-3" in n3 is=web
pill svc "service: web" is=svc
svc -> w1 is=svc
svc -> w2 is=svc
svc -> w3 is=svc
note svc: one stable name and address in front of the web pods
@step Pods run on nodes; nodes make up the cluster. The service is one name in front of the three web pods.
camera all
@step Calls to the service are spread over its pods: rules on every node pick one.
send "GET /" svc -> w1
send "GET /cart" svc -> w2
@step Node 2 dies, and web-2 with it.
set n2 down=yes
set w2 down=yes
camera cluster
@step The scheduler starts a new web-2 on node 3, which has room.
remove w2
add pill w2b "web-2" in n3 is=web
svc -> w2b is=svc
@step The rules now pick among the running pods only; nobody sees a gap.
send "GET /cart" svc -> w2b
camera all
```
