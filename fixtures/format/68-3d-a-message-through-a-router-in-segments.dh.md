---
title: "3D: a message through a router, in segments"
description: A fixture made from the Format page section of the same name.
---

## 3D: a message through a router, in segments

A thing can have an inside. `group r "router" closed=yes` draws the router's inside faint and without words; `zoom into r` flies the camera in and opens it, and `zoom out` closes it again. Inside, a queue holds tokens: `move ... into q` puts them at its back, and `pop q to p2` takes the front one out. `drop msg.4 at q` sends a token there and loses it, the way a full router drops a packet. Here, TCP cuts a message into segments, a router forwards them, one is lost and sent again, and host B puts the message back together.

```animation 3d
layer net "one network"
family a "host A"
family b "host B"
family rr "router"
group ha "host A" layout=column is=a
group r "router" closed=yes layout=free is=rr
queue q "input queue" in r pos=0,0 is=rr
table rt "routing table" in r pos=0,2.2 is=rr: to, port
row r1 in rt: host B, 2
row r2 in rt: host C, 1
group p2 "port 2" in r layout=column pos=4.4,2.2 is=rr
group hb "host B" layout=column is=b
ha -> q
p2 -> hb
token msg "message" in ha is=a
@step Host A has one message for host B: too big for one packet.
highlight msg
@step TCP cuts it into four numbered segments.
split msg into 4 "seg"
@step Zoom into the router: an input queue, a routing table, and port 2.
zoom into r
@step The segments arrive. The queue holds three; segment 4 finds it full.
move msg.1 msg.2 msg.3 into q
drop msg.4 at q
@step The routing table says host B is behind port 2.
highlight r1
@step The oldest segment leaves the queue for port 2.
pop q to p2
@step The next one follows; segment 3 waits its turn.
pop q to p2
@step Zoom out: segments 1 and 2 cross the wire to host B.
zoom out
move msg.1 msg.2 into hb
@step Segment 3 follows them.
pop q to hb
@step Host B has 1, 2 and 3, but not 4. Host A sends segment 4 again.
add token msg.4 "seg 4" in ha
@step This time it gets through the router.
move msg.4 to r
@step It reaches host B.
move msg.4 into hb
@step Host B puts the four segments back in order: the message.
merge msg
```
