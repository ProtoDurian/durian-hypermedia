---
title: "Animation: a packet through kube-proxy"
description: A fixture made from the Format page section of the same name.
---

## Animation: a packet through kube-proxy

Two nodes and the VPC under them, drawn flat so every word reads: each node shows its pods, its kernel and its network card, and every step is drawn at one fixed place. `layout=row` puts the nodes side by side with the VPC between them; on a phone they stack, node 1 above the VPC above node 2. The call takes the real path: the frontend's veth, node 1's kernel, where a rule kube-proxy wrote rewrites the service's virtual IP to one pod's IP (kube-proxy itself never carries the packet), node 1's network card, the VPC, node 2's network card and kernel, web-2's veth. The reply comes back the same way, and node 1's conntrack undoes the rewrite.

```animation layout=row
family pod "pods"
family kp "kube-proxy"
family kern "node kernels"
family net "network cards and the VPC"
group n1 "node 1" layout=column note="node IP 198.51.100.21"
group n1p in n1 layout=row
box fe "frontend" in n1p is=pod note="a pod; pod IP 198.51.100.4"
box kp1 "kube-proxy" in n1p is=kp note="runs on every node; watches the API for services and their pods, and writes the rules. It never carries a packet"
group n1k "kernel" in n1 layout=row is=kern
box v1 "veth" in n1k is=kern size=s note="the frontend's veth: a cable with one end in the pod and one in the node"
box r1 "rules" in n1k is=kern size=s note="the iptables rules kube-proxy wrote: every packet to 192.0.2.10 meets them"
box ct1 "conntrack" in n1k is=kern size=s note="remembers each rewrite, to undo it on the reply"
box e1 "network card" in n1 is=net note="eth0, node 1's network card"
box vr "VPC" is=net note="the network under the cluster. Its route table: 198.51.100.0/24 is local. With AWS's VPC CNI, web-2's IP 198.51.100.7 is a second address of node 2's network card"
group n2 "node 2" layout=column note="node IP 198.51.100.22"
group n2p in n2 layout=row
box w2 "web-2" in n2p is=pod note="a pod of the service web; pod IP 198.51.100.7"
box kp2 "kube-proxy" in n2p is=kp note="the same on every node"
group n2k "kernel" in n2 layout=row is=kern
box v2 "veth" in n2k is=kern size=s note="web-2's veth"
box rt2 "routes" in n2k is=kern size=s note="198.51.100.7 is a pod on this node: through web-2's veth"
box e2 "network card" in n2 is=net note="eth0, node 2's network card"
e1 -> vr
vr -> e2
@step Two nodes and the VPC, the network under them.
@step On each node: its pods at the top, its kernel, and its network card at the bottom, where packets leave and enter the node.
highlight e1
highlight e2
@step kube-proxy runs on every node. It watches the API for the service web and writes rules into the kernel's iptables (both lit). It never carries a packet.
highlight kp1
highlight r1
@step The frontend calls the service web at 192.0.2.10. No pod and no machine has that address: it lives only in rules.
highlight fe
@step The packet leaves the frontend through its veth, into node 1's kernel.
send fe -> v1
@step In node 1's kernel it meets the rules kube-proxy wrote. kube-proxy itself never touches the packet.
send "to 192.0.2.10" v1 -> r1
@step A rule picks one of the service's pods at random, web-2, and rewrites the destination to its IP. conntrack writes the rewrite down.
say r1 above: → 198.51.100.7
highlight r1
@step 198.51.100.7 is not on node 1, so node 1's kernel routes the packet out of its own network card.
send r1 -> e1
@step The packet enters the VPC. Its route table knows 198.51.100.7: on AWS's VPC CNI, it is an address of node 2's network card.
send "to 198.51.100.7" e1 -> vr
say vr above: 198.51.100.7 → node 2
@step The VPC delivers it to node 2's network card. No tunnel and no rewrite on the way.
send vr -> e2
@step Node 2's kernel looks up its routes: 198.51.100.7 is a pod on this node.
send e2 -> rt2
@step The route sends it into web-2's veth.
send rt2 -> v2
@step Through the veth into web-2. No second rewrite: the address is already a pod's.
send v2 -> w2
@step web-2 answers from 198.51.100.7, back into its veth.
send w2 -> v2
@step Into node 2's kernel, which routes the reply toward 198.51.100.4.
send "200 OK" v2 -> rt2
@step Out of node 2's network card.
send rt2 -> e2
@step Into the VPC: 198.51.100.4 is an address of node 1's network card.
send "200 OK" e2 -> vr
@step The VPC delivers it to node 1's network card.
send "200 OK" vr -> e1
@step Into node 1's kernel, where conntrack knows this reply: it belongs to the rewrite it wrote down.
send e1 -> ct1
@step conntrack undoes the rewrite: the source 198.51.100.7 becomes 192.0.2.10 again.
highlight ct1
@step Out of node 1's kernel into the frontend's veth.
send "from 192.0.2.10" ct1 -> v1
@step Into the frontend, which sees the service answer. Other networks under a cluster do the middle hop another way: a routed CNI has a route "node 2's pod range → node 2"; an overlay wraps the packet from node IP to node IP. The kube-proxy part stays the same.
send v1 -> fe
```

:::llm
Animation, 22 steps, flat. Node 1 (frontend pod 198.51.100.4, kube-proxy; kernel with the frontend's veth, the iptables rules, conntrack; network card), the VPC, node 2 (web-2 198.51.100.7, kube-proxy; kernel with web-2's veth and routes; network card). kube-proxy only writes the rules.

1. to 4. The nodes and the VPC; kube-proxy writes rules on every node; the frontend calls the service at 192.0.2.10, a virtual IP.
5. to 8. Veth, node 1's kernel: a rule rewrites the destination to 198.51.100.7, conntrack notes it, node 1 routes it out of its card.
9. to 13. The VPC (AWS VPC CNI: the IP belongs to node 2's card) delivers it; node 2's kernel routes it through the veth into web-2. No second rewrite.
14. to 22. The reply comes back the same hops; node 1's conntrack restores the source 192.0.2.10. A routed CNI or an overlay would do the middle hop instead.
:::
