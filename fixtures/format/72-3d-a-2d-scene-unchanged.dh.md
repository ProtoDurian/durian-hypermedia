---
title: "3D: a 2D scene, unchanged"
description: A fixture made from the Format page section of the same name.
---

## 3D: a 2D scene, unchanged

The pass-4 scene of pods, nodes and a service, with the same source. Press **3D** on its stage: with no layers declared, each nesting level is a layer, so the cluster, the nodes and the pods stand at three heights.

```animation dir=down
group cluster "cluster" layout=row
group n1 "node 1" in cluster
group n2 "node 2" in cluster
group n3 "node 3" in cluster
pill w1 "web-1" in n1
pill c1 "cache-1" in n1
pill w2 "web-2" in n2
pill w3 "web-3" in n3
pill svc "service: web"
svc -> w1
svc -> w2
svc -> w3
note svc: one stable name in front of the web pods
@step Pods run on nodes; nodes make up the cluster. The service is one name in front of the three web pods.
camera all
@step The service spreads requests over the pods.
send "GET /" svc -> w1
send "GET /cart" svc -> w2
@step Node 2 dies, and web-2 with it.
set n2 down=yes
set w2 down=yes
camera cluster
@step The scheduler starts a new web-2 on node 3, which has room.
remove w2
add pill w2b "web-2" in n3 tone=good
svc -> w2b
@step The service sends to the running pods only; nobody sees a gap.
send "GET /cart" svc -> w2b
camera all
```
