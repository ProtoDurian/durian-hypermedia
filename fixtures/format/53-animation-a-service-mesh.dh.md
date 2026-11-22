---
title: "Animation: a service mesh"
description: A fixture made from the Format page section of the same name.
---

## Animation: a service mesh

Each pod holds its app and a sidecar proxy; the control plane pushes config to every proxy. A `send` shows its movement as a small token (the default), as an arrow that draws itself from source to target (`send arrow`), or both (`send both`); an LLM reads each the same way, as `a -> b: label` under the step. `family app "apps"` names a family in the setup and `is=app` gives a thing, a connector or a send its colour: each family gets one colour from a fixed palette (a soft fill, a line, an ink for words), the same on every shape, arrow, token and chip, in light and dark, with a legend above the stage. A send takes the colour of the thing it starts from.

```animation dir=down
family app "apps"
family proxy "sidecar proxies"
family ctl "control plane"
group cp "control plane" is=ctl
box cfg "mesh config" in cp is=ctl
group mesh
group pa "pod: orders" in mesh
box a "orders app" in pa is=app
box pxa "proxy" in pa is=proxy
group pb "pod: payments" in mesh
box pxb "proxy" in pb is=proxy
box b "payments app" in pb is=app
a -> pxa
pxa -> pxb "mTLS" is=proxy
pxb -> b
cfg --> pxa is=ctl
cfg --> pxb is=ctl
@step Each pod runs its app and a sidecar proxy. The app talks only to its own proxy.
send both "pay order 7" a -> pxa
@step The two proxies talk over mutual TLS: the call is encrypted, and each side proves who it is.
send both "encrypted" pxa -> pxb
@step The payments proxy hands the call to its app. Neither app sees the encryption.
send both "pay order 7" pxb -> b
camera pb
@step The control plane pushes a new rule to every proxy: retry twice. No app changes.
send arrow "retry: 2" cfg -> pxa
send arrow "retry: 2" cfg -> pxb
note pxa: retries twice on failure
note pxb: retries twice on failure
camera all
@step A call fails once at the payments app.
highlight b tone=hot
say b: failed once
@step The orders proxy retries by itself; the second try reaches the payments proxy, and then the app.
send both "retry" pxa -> pxb
```
