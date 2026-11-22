---
title: "3D: Kubernetes, cluster to container"
description: A fixture made from the Format page section of the same name.
---

## 3D: Kubernetes, cluster to container

Boxes inside boxes: a cluster box holds node boxes, a node holds pod boxes, a pod holds its containers. This is a tree that only works in 3D, so the fence says `3d only` and the stage has no 2D button. Every level starts `closed=hidden`: nothing inside it is drawn until `zoom into` opens it, so each step talks about one level and the smaller boxes stay out of the way. Zooms nest (`zoom into n1`, then `zoom into p2`). `lift k3` pulls redis up out of its pod to focus on it, `put back` sets it down again, and `zoom out` and `zoom out all` close the levels one at a time or all at once. While a step plays, only the labels of what it touches show: here, redis alone as the camera flies to it.

```animation 3d only
group c "cluster"
group n1 "node 1" in c closed=hidden
group n2 "node 2" in c closed=hidden
group p1 "web-1" in n1 closed=hidden
group p2 "cache-1" in n1 closed=hidden
group p3 "web-2" in n2 closed=hidden
box k1 "nginx" in p1
box k2 "log agent" in p1
box k3 "redis" in p2
box k4 "nginx" in p3
box k5 "log agent" in p3
note n1: a machine; the kubelet on it runs the pods it is given
note p2: the unit the scheduler places; its containers share one network address
@step One cluster box holds two node boxes. What runs on the nodes is hidden: at this level we talk about machines.
camera all
@step Zoom into node 1: its pod boxes appear, web-1 and cache-1. Node 2 fades.
zoom into n1
@step Zoom into cache-1: its box opens, and its one container shows, redis.
zoom into p2
@step Pull redis up out of its pod to focus on it. While the camera flies in, only its label shows.
lift k3
camera k3
@step The redis container crashes.
set k3 down=yes
highlight k3 tone=hot
@step The kubelet on node 1 starts it again, back in the same pod. The pod and the node stay as they were.
put back k3
remove k3
add box k3b "redis" in p2 tone=good
camera p2
@step Zoom out to node 1: cache-1 closes again, and its container hides.
zoom out
@step Zoom out all the way: one cluster of two nodes. The smaller boxes hide, and we are back to talking about machines.
zoom out all
```
