---
title: TCP handshake with a lost packet
roles: { client: c1, net: c0, server: c2 }
---

# TCP handshake with a lost packet

A TCP connection opens with three packets. When the first one is lost, the client waits, then sends it again.

```animation
title: Opening a TCP connection | port 443, one packet lost
## Client
client c: laptop | 192.0.2.10
## Network
net r: router | drops a packet when its queue is full
## Server
server s: web server | 198.51.100.7, listening on 443
@step SYN: The client sends SYN (seq 100) and starts a 1 second timer.
c -> r: SYN seq 100
text c: SYN-SENT
text s: LISTEN
@step Lost: The router's queue is full, so it drops the SYN. The server never sees it.
tone r bad
say r: SYN dropped
@step Retry: After 1 second with no answer, the client sends the same SYN again.
tone r off
c -> r: SYN seq 100, again
r -> s: SYN seq 100
@step SYN-ACK: The server answers with its own number (seq 300) and acknowledges 101.
s -> r: SYN-ACK seq 300 ack 101
r -> c: SYN-ACK
text s: SYN-RECEIVED
@step ACK: The client acknowledges 301. Both sides are now connected.
c -> r: ACK 301
r -> s: ACK 301
text c: ESTABLISHED
text s: ESTABLISHED
tone c,s good
```
