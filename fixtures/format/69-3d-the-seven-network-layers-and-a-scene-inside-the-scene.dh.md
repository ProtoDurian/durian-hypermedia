---
title: "3D: the seven network layers, and a scene inside the scene"
description: A fixture made from the Format page section of the same name.
---

## 3D: the seven network layers, and a scene inside the scene

A scene can hold a scene of its own. `scene tcp "Transport, up close"` in the setup, its own lines, then `end`, declares it, with its own things and layout. `enter tcp from a4` flies the camera into `a4` and shows that scene instead of the overview; the steps after it change that scene; `leave` flies back out to the overview, just as it was left. The caption says which scene you are in, the slider marks its steps, and "All steps" lists them inside the step that enters. Here, a request goes down the seven layers of the OSI model on one machine and up them on the other; at layer 4 the story zooms into how TCP labels, cuts and rebuilds the message. It reads the same in 2D: press **2D**.

```animation 3d size=s
layer l7 "7 application"
layer l6 "6 presentation"
layer l5 "5 session"
layer l4 "4 transport"
layer l3 "3 network"
layer l2 "2 data link"
layer l1 "1 physical"
family cl "the browser's machine"
family sv "the server's machine"
box a7 "browser" layer=l7 is=cl
box b7 "web server" layer=l7 is=sv
box a6 "format, encrypt" layer=l6 is=cl
box b6 "decrypt" layer=l6 is=sv
box a5 "session" layer=l5 is=cl
box b5 "session" layer=l5 is=sv
box a4 "TCP" layer=l4 is=cl
box b4 "TCP" layer=l4 is=sv
box a3 "IP" layer=l3 is=cl
box b3 "IP" layer=l3 is=sv
box a2 "Ethernet" layer=l2 is=cl
box b2 "Ethernet" layer=l2 is=sv
box a1 "signals" layer=l1 is=cl
box b1 "signals" layer=l1 is=sv
a7 -> a6 -> a5 -> a4 -> a3 -> a2 -> a1
b1 -> b2 -> b3 -> b4 -> b5 -> b6 -> b7
a1 -> b1 "the wire"
token msg "GET /" at a7 is=cl
scene tcp "Transport, up close" layout=column
  group snd "sender's TCP" layout=column is=cl
  group out "to send" in snd layout=row
  token m "3,000 bytes" in out is=cl
  table hdr "TCP header" in snd: field, value
  row h1 in hdr: from port, 51514
  row h2 in hdr: to port, 443
  row h3 in hdr: sequence, its first byte
  cloud net "the network"
  group rcv "receiver's TCP" layout=column is=sv
  group buf "receive buffer" in rcv layout=row
  snd -> net -> rcv
end
@step A browser asks a web server for a page. The request starts at layer 7, application: HTTP.
split layers
highlight a7
@step Layer 6, presentation: the request is put in an agreed format and encrypted.
move msg to a6
set msg label=encrypted
@step Layer 5, session: the conversation between the two programs stays open for the reply.
move msg to a5
@step Layer 4, transport: TCP cuts the message into three numbered segments.
move msg to a4
then
split msg into 3 "seg"
@step Up close: how TCP labels the segments, sends them, and puts them back together.
enter tcp from a4
@step Each segment gets a TCP header: the ports say which program it is from and for; the sequence number says where its bytes go.
highlight hdr
@step TCP cuts the 3,000 bytes into three segments of 1,000. Each is numbered by its first byte: 1, 1001, 2001.
split m into s1 "seq 1" s2 "seq 1001" s3 "seq 2001"
@step All three go out on the network. Each may take its own path.
move s1 s2 s3 to net
@step Segments 1 and 3 arrive first. TCP keeps 3 aside: bytes from 1001 are missing.
move s1 s3 into buf
@step Segment 2 arrives late. Its sequence number says where it goes: between 1 and 3.
move s2 into buf after s1
@step In order again, the segments are joined back into the 3,000 bytes. TCP sends back ACK 3001: "next, I expect byte 3001".
merge s1 s2 s3 into m2 "3,000 bytes"
send arrow "ACK 3001" rcv -> net
@step Back at the overview, where we left it. Now follow the segments down, across and up.
leave
@step Layer 3, network: each segment gets an IP header with both machines' addresses. It is now a packet.
move msg.1 msg.2 msg.3 to a3
@step Layer 2, data link: each packet goes in a frame for the next hop on the local network.
move msg.1 msg.2 msg.3 to a2
@step Layer 1, physical: the frames become signals.
move msg.1 msg.2 msg.3 to a1
@step The signals cross the wire to the server's machine.
move msg.1 msg.2 msg.3 to b1
@step Going up, layers 1 to 3 each read and remove their twin's header. TCP joins the segments, as we saw up close.
move msg.1 msg.2 msg.3 to b4
then
merge msg
@step Up through session and presentation, where it is decrypted, the web server reads the request.
move msg to b7
set msg label="GET /"
highlight b7 tone=good
```

:::llm
Animation, 18 steps, with 1 scene inside it (tcp "Transport, up close"). Two machines, each with the seven OSI layers; a request ("GET /") starts in the browser at layer 7.

1. to 4. Down layers 7, 6 (formatted, encrypted) and 5 (session) to layer 4, where TCP splits it into seg 1 to 3.
5. Enters scene tcp from a4: the sender's TCP (the 3,000 bytes, a header with ports and a sequence number), a network, the receiver's TCP.
   6. to 11. Cut into seq 1, seq 1001, seq 2001; all cross the network; 1 and 3 arrive first; 2 arrives late and goes between them; joined again; the receiver answers ACK 3001.
12. Leaves scene tcp: back to the overview, as it was, at a4.
13. to 18. Down layers 3, 2 and 1, across the wire, up to layer 4 where TCP joins the segments, and up to the web server, which reads GET /.
:::
