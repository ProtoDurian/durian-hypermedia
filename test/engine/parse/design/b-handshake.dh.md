---
format: 12
title: Handshake
roles: { node: c1, plain: c0 }
---

```animation
title: TCP handshake | one packet is lost
## Client
node c: client
## Router
node r: router
## Server
node s: server
@step SYN: The client asks to connect.
c -> r: SYN seq 100
c is SYN-SENT
s is LISTEN
@step Lost: The router drops it.
r -x s: SYN seq 100
say r: queue full, SYN dropped
@step Again: The client asks again and it gets through.
r -> s: SYN seq 101
@step SYN-ACK: The server answers.
s -> c: SYN-ACK
s is SYN-RECEIVED
@step ACK: The client confirms.
c -> s: ACK
c,s is ESTABLISHED
tone c,s good
```
