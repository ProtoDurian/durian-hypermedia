---
title: "Animation: a service mesh"
description: A fixture made from the Format page section of the same name.
---

## Animation: a service mesh

Each pod holds its app and a sidecar proxy, on two nodes with the network under them; the control plane, a pod of its own on node 1, pushes config to the proxies. A `send` shows its movement as a small token (the default), as an arrow that draws itself from source to target (`send arrow`), or both (`send both`); an LLM reads each the same way, as `a -> b: label` under the step. `family app "apps"` names a family in the setup and `is=app` gives a thing, a connector or a send its colour: each family gets one colour from a fixed palette (a soft fill, a line, an ink for words), the same on every shape, arrow, token and chip, in light and dark, with a legend above the stage. A send takes the colour of the thing it starts from.

```animation layout=row
family app "apps"
family proxy "sidecar proxies"
family net "network cards and the network"
family ctl "control plane"
group n1 "node 1" layout=column note="node IP 198.51.100.21"
group cp "control plane" in n1 is=ctl
box cfg "mesh config" in cp is=ctl note="holds the mesh's rules and pushes them to the proxies; it runs in a pod of its own, here on node 1"
group pa "pod: orders" in n1 layout=row
box a "orders app" in pa is=app
box pxa "proxy" in pa is=proxy note="the orders pod's sidecar; pod IP 198.51.100.4"
box e1 "network card" in n1 is=net note="eth0, node 1's network card"
box net "the network" is=net note="the network under the cluster: it carries the bytes from node to node and only ever sees them encrypted"
group n2 "node 2" layout=column note="node IP 198.51.100.22"
box e2 "network card" in n2 is=net note="eth0, node 2's network card"
group pb "pod: payments" in n2 layout=row
box pxb "proxy" in pb is=proxy note="the payments pod's sidecar; pod IP 198.51.100.7"
box b "payments app" in pb is=app
e1 -> net
net -> e2
@step Each pod runs its app and a sidecar proxy. The app talks only to its own proxy: pay order 7.
send both a -> pxa
@step The orders proxy encrypts the call with mutual TLS and sends it from its pod's IP, out through node 1's network card.
send both "encrypted" pxa -> e1
@step The network under the cluster carries the encrypted bytes toward node 2. It cannot read them.
send "encrypted" e1 -> net
@step It delivers them to node 2's network card.
send net -> e2
@step Node 2 hands them to the payments proxy, which decrypts the call. Each side has proved who it is.
send both "pay order 7" e2 -> pxb
@step The payments proxy hands "pay order 7" to its app. Neither app sees the encryption.
send both pxb -> b
@step The control plane pushes a new rule to the orders proxy: retry twice. No app changes.
send arrow "retry: 2" cfg -> pxa
say pxa: retries twice on failure
@step A call fails once at the payments app.
highlight b tone=hot
say b: failed once
@step The orders proxy retries by itself, out through node 1's card again.
send both "retry" pxa -> e1
@step Across the network, still encrypted.
send "retry" e1 -> net
@step Into node 2's card.
send "retry" net -> e2
@step To the payments proxy, which decrypts it.
send e2 -> pxb
@step This time the payments app takes the call.
send both pxb -> b
```

:::llm
Animation, 13 steps, flat. Node 1 (the control plane's mesh config; pod orders: the orders app and its proxy; node 1's network card), the network under the cluster, node 2 (pod payments: its proxy and the payments app; node 2's network card).

1. to 6. The orders app calls its own proxy; the proxy encrypts the call with mutual TLS and sends it out of node 1's card, across the network, into node 2's card, to the payments proxy, which decrypts it and hands it to its app.
7. The control plane pushes "retry twice" to the orders proxy. No app changes.
8. A call fails once at the payments app.
9. to 13. The orders proxy retries by itself on the same path; the payments app takes the second try.
:::
