---
title: "3D: a request through the network layers"
description: A fixture made from the Format page section of the same name.
---

## 3D: a request through the network layers

Two machines with the same five layers. When top-level things sit on two or more layers, the 2D stage draws one band per layer and lines up each band's things in columns, so the two stacks stand side by side.

```animation 3d
layer app "application"
layer tls "TLS"
layer tcp "TCP"
layer ip "IP"
layer link "link"
family cl "the browser's machine"
family sv "the server's machine"
box a1 "browser" layer=app is=cl
box b1 "web server" layer=app is=sv
box a2 "encrypt" layer=tls is=cl
box b2 "decrypt" layer=tls is=sv
box a3 "segments" layer=tcp is=cl
box b3 "segments" layer=tcp is=sv
box a4 "packets" layer=ip is=cl
box b4 "packets" layer=ip is=sv
box a5 "Wi-Fi" layer=link is=cl note="the laptop's network card"
box b5 "Ethernet" layer=link is=sv note="the server's network card"
a1 -> a2 -> a3 -> a4 -> a5
b5 -> b4 -> b3 -> b2 -> b1
a5 -> b5 "the wire"
@step A browser on one machine asks a web server on another for a page. Each machine has the same five layers.
split layers
@step Going down: TLS encrypts the request.
send "GET /" a1 -> a2
@step TCP cuts it into numbered segments.
send "encrypted" a2 -> a3
@step IP addresses each one: packets.
send "segments" a3 -> a4
@step The link layer makes them signals.
send "packets" a4 -> a5
@step The signals cross the wire to the other machine.
send "bits" a5 -> b5
@step Going up, each layer undoes its twin's work: to IP.
send "bits" b5 -> b4
@step IP hands the segments to TCP.
send "packets" b4 -> b3
@step TCP puts them in order, for TLS.
send "segments" b3 -> b2
@step TLS decrypts the request, and the web server reads it.
send "GET /" b2 -> b1
@step Look at one layer: TCP on both machines talks only to TCP. The layers above and below are its tools.
focus tcp
highlight a3 b3
@step The reply goes back the same way, one layer per hop.
focus all
stack layers
highlight b1 a1 tone=good
say b1: 200 OK
```
