---
title: "3D: Kubernetes, cluster to container"
description: A fixture made from the Format page section of the same name.
---

## 3D: Kubernetes, cluster to container

Each nesting level is its own layer: the cluster, its nodes, their pods, the pods' containers. Split them, then zoom into one node with `camera`.

```animation 3d
layer cl "cluster"
layer nodes "nodes"
layer pods "pods"
layer ctrs "containers"
group c "cluster" layer=cl
group n1 "node 1" in c layer=nodes
group n2 "node 2" in c layer=nodes
group p1 "web-1" in n1 layer=pods
group p2 "cache-1" in n1 layer=pods
group p3 "web-2" in n2 layer=pods
box k1 "nginx" in p1 layer=ctrs
box k2 "log agent" in p1 layer=ctrs
box k3 "redis" in p2 layer=ctrs
box k4 "nginx" in p3 layer=ctrs
box k5 "log agent" in p3 layer=ctrs
note n1: a machine; the kubelet on it runs the pods it is given
note p2: the unit the scheduler places; its containers share one network address
@step A cluster is made of nodes, nodes run pods, and pods hold containers. Drawn flat, each layer hides the next.
camera all
@step Split apart, each layer shows on its own: one cluster, two nodes, three pods, five containers.
split layers
@step Zoom into node 1: it runs two pods, web-1 and cache-1, and their three containers sit below them.
camera n1 p1 p2 k1 k2 k3
@step The redis container in cache-1 crashes.
set k3 down=yes
highlight k3 tone=hot
@step The kubelet on node 1 starts it again in the same pod; the pod and the node stay as they were.
remove k3
add box k3b "redis" in p2 layer=ctrs tone=good
@step Look at the pods' layer alone: three pods, spread over two nodes.
focus pods
@step Stacked again, it is one cluster.
focus all
stack layers
camera all
```
