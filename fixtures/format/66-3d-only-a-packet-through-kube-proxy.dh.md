---
title: "3D only: a packet through kube-proxy"
description: A fixture made from the Format page section of the same name.
---

## 3D only: a packet through kube-proxy

Nested boxes you open one level at a time. The nodes start with `closed=hidden`: nothing inside them is drawn until `zoom into n1 n2`. `lift fe w2` raises two pods up out of their nodes while everything else fades, so one call between them is easy to follow; `zoom out` puts them back in exactly the same place and hides them again. kube-proxy itself never touches the packet: it writes rules into each node's kernel, and those rules rewrite the service's virtual IP to one pod's IP.

```animation 3d only
family pod "pods"
group c "cluster"
pill svc "service web: 192.0.2.10" in c note="a virtual IP: no pod and no machine has it; it lives only in rules"
group n1 "node 1" in c closed=hidden layout=column
group n2 "node 2" in c closed=hidden layout=column
group n1p in n1
group fe "frontend" in n1p is=pod note="pod IP 198.51.100.4"
box fe1 "app" in fe
group w1 "web-1" in n1p is=pod note="pod IP 198.51.100.5"
box w1a "nginx" in w1
group n1k in n1
box kp1 "kube-proxy" in n1k note="watches the API for services and their pods, and writes the rules"
box r1 "iptables rules" in n1k note="in the node's kernel: every packet to 192.0.2.10 meets them"
group n2p in n2
group w2 "web-2" in n2p is=pod note="pod IP 198.51.100.7"
box w2a "nginx" in w2
group n2k in n2
box kp2 "kube-proxy" in n2k note="the same on every node"
box r2 "iptables rules" in n2k note="the same rules on every node"
kp1 --> r1 "writes"
kp2 --> r2 "writes"
@step A cluster of two nodes. What runs inside them is hidden for now.
camera all
@step Zoom in: the pods appear. On each node, kube-proxy writes the service's rules into the kernel.
zoom into n1 n2
@step The frontend pod and web-2 rise out of their nodes, to follow one call.
lift fe w2
camera fe w2 r1
@step The frontend calls the service web at 192.0.2.10. No pod has that address.
say fe above: GET 192.0.2.10:80
highlight svc
@step The packet leaves the pod and meets node 1's rules, not kube-proxy itself.
send "to 192.0.2.10" fe -> r1
@step A rule picks one of the service's pods at random, web-2, and rewrites the address to its IP.
say r1 below: 192.0.2.10 → 198.51.100.7
@step The rewritten packet crosses to node 2 and goes straight to web-2: pod to pod.
send "to 198.51.100.7" r1 -> w2
@step web-2 answers. The reply goes back to node 1.
send "200 OK" w2 -> r1
@step Node 1 remembers the rewrite and puts the service address back: 192.0.2.10 answers.
send "from 192.0.2.10" r1 -> fe
@step Zoom out: the pods settle back into their nodes and hide again.
zoom out
```
