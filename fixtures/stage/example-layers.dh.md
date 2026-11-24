---
title: The layers, through several routers
concept: network layers
description: One web request from a laptop through a switch, a home router and two internet routers to a server, and the answer back until the browser draws it, with every wrapper, table and field.
namespaces: []
roles:
  app: { label: "HTTP and the browser (layer 7)", colour: c1 }
  sec: { label: "TLS (layers 6 and 5, loosely)", colour: c2 }
  tcp: { label: "TCP (layer 4)", colour: c3 }
  ip: { label: "IP packets and headers (layer 3)", colour: c4 }
  router: { label: "routers (layer 3)", colour: c7 }
  table: { label: "routing and NAT tables (layer 3)", colour: c8 }
  link: { label: "Ethernet and ARP (layer 2)", colour: c5 }
  signal: { label: "bits as a signal (layer 1)", colour: c6 }
---

**The story:** a laptop's browser loads `https://example.com/` through a switch, a home router and two internet routers in two networks, and the answer comes back until the browser draws it. It follows one request packet, then the first packet of the answer.

**The point: layer 2 against layer 3.**

- A frame lives from one IP device to the next, across any switches between them. Every router takes it off and builds a new one, with two new MAC addresses. A switch passes it on unchanged.
- An IP packet is for the far end. On the way out its destination never changes. Each router takes 1 off the TTL. Only the home router's NAT rewrites an address and its port, and so also both checksums: the source going out, the destination coming back.
- Each router decides alone, by the longest prefix in its own table that covers the destination.

**Addresses:** documentation only. IPv4 from 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24; MACs from 00:00:5E:00:53:00 to FF; AS numbers 64496 and 64497. The exceptions are special by standard: the default route 0.0.0.0/0, the broadcast MAC and the all-zero MAC in an ARP question. 192.0.2.0/24 stands in for a home's private range.

## 1. The next hop's MAC

```animation
title: The next hop's MAC | ARP on the home network
## Laptop
app lap: laptop | 192.0.2.10/24 | MAC 00:00:5E:00:53:0A
  app know: what it knows | example.com is 203.0.113.80 (DNS, still cached) | neighbour cache: empty (entries age out in minutes)
  table t1: routing table T1 | 192.0.2.0/24: connected, next hop on this network, out copper to the switch | * 0.0.0.0/0: default (from DHCP), next hop 192.0.2.1, out copper to the switch: matches, longest, chosen
## Switch
link sw: switch | ports 1 and 5 | copper to each
  link mac: MAC table | empty (entries age out, often after 5 minutes)
## Home router
router hr: home router, home side | 192.0.2.1/24 | MAC 00:00:5E:00:53:01
  link nc: neighbour cache | 192.0.2.10 is 00:00:5E:00:53:0A (from the question)
nest: On the link
  link fr: Ethernet frame | 64 bytes | to FF:FF:FF:FF:FF:FF (broadcast); from 00:00:5E:00:53:0A; type 0x0806 (ARP); 18 bytes of padding; > FCS 4f 32 f5 0b
  link arp: ARP request | _ | hardware type 1 (Ethernet); protocol 0x0800 (IPv4); lengths 6 and 4; operation 1; sender 00:00:5E:00:53:0A 192.0.2.10; target 00:00:00:00:00:00 (not known) 192.0.2.1
@step The question: The laptop wants https://example.com/ and has the server's IP from DNS. A frame can only reach a machine on its own network. Which one?
light lap
@step Longest match: 203.0.113.80 is not in 192.0.2.0/24. Only the default route matches, so the next hop is 192.0.2.1, the home router.
show t1
@step ARP asks: A frame needs a MAC address. ARP asks every device on the home network: who has 192.0.2.1? The question goes to the broadcast MAC.
show fr, arp
lap -> sw: who has 192.0.2.1?
light fr
@step Learn and flood: The switch notes the sender's MAC on port 1. A broadcast goes out of every other port, unchanged.
text mac: * 00:00:5E:00:53:0A: port 1 (learned from the frame's source)
sw -> hr: the same broadcast frame
light mac
@step The answer: The home router keeps the laptop's pair from the question, and answers the laptop alone: 192.0.2.1 is at 00:00:5E:00:53:01.
clear
show nc
fields fr: to 00:00:5E:00:53:0A; from 00:00:5E:00:53:01; type 0x0806; 18 bytes of padding; > FCS ec 4e aa 87
title arp: ARP reply
fields arp: operation 2; * sender 00:00:5E:00:53:01 192.0.2.1; target 00:00:5E:00:53:0A 192.0.2.10
hr -> sw: the ARP reply
@step One port: The switch notes port 5 for the router, and knows port 1 for the laptop. So the answer leaves by port 1 only.
text mac: 00:00:5E:00:53:0A: port 1 | * 00:00:5E:00:53:01: port 5 (learned from the reply's source)
sw -> lap: out of port 1 only
light mac
@step Cached: The laptop keeps the answer. ARP never leaves the local network. IPv6 does the same job with Neighbour Discovery.
clear
hide fr, arp
text know: example.com is 203.0.113.80 | * neighbour cache: 192.0.2.1 is 00:00:5E:00:53:01
light know
```

## 2. The session, set up and kept

```animation
title: The session, set up and kept | the switch, A and B are on the path and keep nothing about the connection
track: tcp TCP | sec TLS, kept
## Laptop
app lap: laptop | 192.0.2.10
  tcp lc: connection | 192.0.2.10:51514 to 203.0.113.80:443: established
  sec ls: session | TLS 1.3 with example.com, checked | application keys: a key and IV for sending, a key and IV for receiving | record counters: 0 and 0 | next byte to send: 1001; next expected: 4001
## Home router
router hr: home router | outside 198.51.100.7
  table nat: NAT table | TCP: 192.0.2.10:51514 is 198.51.100.7:40001, toward 203.0.113.80:443 | state: SYN seen | expected back: 203.0.113.80:443 to 198.51.100.7:40001
## Server
app sv: server | 203.0.113.80
  tcp sc: connection | 203.0.113.80:443 to 198.51.100.7:40001: established (it only ever sees the public address)
  sec ss: session | the same application keys and IVs, the other way round | record counters: 0 and 0 | next byte expected: 1001; next to send: 4001
@step SYN: TCP opens a connection. The first packet, the SYN, also makes the home router write its NAT entry, which it keeps while the connection is in use.
at TCP
show nat
lap -> hr: SYN
hr -> sv: SYN
card tcp: SYN, laptop to server | seq 419; MSS 1460; window 64240
  as it leaves: 192.0.2.10:51514 to 203.0.113.80:443, TTL 64
  after NAT: 198.51.100.7:40001 to 203.0.113.80:443, TTL 63
@step SYN-ACK: The server answers: I have your 419, next I expect 420. My own numbering starts at 1100.
clear
sv -> hr: SYN-ACK
hr -> lap: SYN-ACK
text nat: TCP: 192.0.2.10:51514 is 198.51.100.7:40001, toward 203.0.113.80:443 | state: SYN and SYN-ACK seen | expected back: 203.0.113.80:443 to 198.51.100.7:40001
card tcp: SYN-ACK, server to laptop | seq 1100
  * ack 420
  MSS 1460; window 65160
  to 198.51.100.7:40001, which NAT turns back into 192.0.2.10:51514
@step ACK: Three messages and the connection is open. The two ends keep its numbers. The switch, A and B keep nothing.
clear
show lc, sc
lap -> hr: ACK
hr -> sv: ACK
text nat: TCP: 192.0.2.10:51514 is 198.51.100.7:40001, toward 203.0.113.80:443 | state: established | expected back: 203.0.113.80:443 to 198.51.100.7:40001
card tcp: ACK, laptop to server | seq 420; ack 1101; no data
@step ClientHello: TLS 1.3 starts on that connection. The laptop offers its ways to encrypt and half of a key exchange.
at TLS
clear
lap -> hr: ClientHello
hr -> sv: ClientHello
card sec: TLS ClientHello, laptop to server | not encrypted
  versions: TLS 1.3; cipher: TLS_AES_128_GCM_SHA256
  * key share: X25519
  server name: example.com; next protocol (ALPN): http/1.1
  bytes 420 to 936
@step The proof: The server's key share gives both sides the handshake keys. Under those it sends its certificate and a signature. The laptop checks both, and that a trusted authority vouches for example.com.
clear
sv -> hr: the server's flight
hr -> lap: the server's flight
card sec: TLS server's flight, server to laptop | bytes 1101 to 4000
  ServerHello: X25519 key share, TLS_AES_128_GCM_SHA256
  then a dummy ChangeCipherSpec, for old middleboxes
  * then, under the handshake keys: EncryptedExtensions (http/1.1), Certificate (example.com), CertificateVerify, Finished
@step Kept: TLS took one round trip, after TCP's one. Both ends keep the application keys and use them for every request and answer on this connection.
at kept
clear
show ls, ss
lap -> hr: Finished
hr -> sv: Finished
card sec: a dummy ChangeCipherSpec (6 bytes), then TLS Finished under the handshake keys, laptop to server | the client's bytes end at 1000
```

## 3. The laptop wraps

```animation
title: The laptop wraps | each card keeps its place while a wrapper is put round it
track: app 7 | sec 6 and 5 | tcp 4 | ip 3 | link 2
nest: Wrapped so far | the laptop's layers, 7 to 2
  link fr: Ethernet frame | 117 bytes | to 00:00:5E:00:53:01; from 00:00:5E:00:53:0A; type 0x0800 (IPv4); > FCS 0e be 36 b7, at the end
  ip pk: IP packet | 99 bytes | version 4; header 20; DSCP 0; total length 99; ID 0x1c46; flag DF, offset 0; TTL 64; protocol 6 (TCP); header checksum 0x1ff4; from 192.0.2.10; to 203.0.113.80
  tcp sg: TCP segment | 79 bytes | ports 51514 to 443; seq 1001; ack 4001; header 20; flags PSH, ACK; window 64240; checksum 0x551d; urgent 0; data 59 bytes
  sec rc: TLS record | 59 bytes | type 23 (application data); version 0x0303 (fixed, though this is TLS 1.3); length 54; sealed 34 bc 53 f1 70 5c 23 c9 …; tag 7b 4c e0 3c a9 0d d6 e8 68 ec 54 15 f7 b1 2d c2
  app rq: HTTP request | 37 bytes | GET / HTTP/1.1; Host: example.com; an empty line
@step HTTP: The browser writes the request: 37 bytes of readable text.
at 7
light rq
calc
  == app: HTTP request: 37
@step TLS: TLS seals the request with the session's key and adds a tag: only the two ends can read it, and any change is detected. Now 59 bytes.
at 6 and 5
show rc
title rq: HTTP request, sealed
fields rq: unreadable without the keys
calc
  HTTP request: 37
  type byte and tag: +17
  record header: +5
  == sec: record: 59
@step TCP: TCP adds the two programs' ports and numbers the bytes: these are 1001 to 1059. A longer record would be cut into several segments.
at 4
show sg
light sg: seq 1001
calc
  record: 59
  TCP header: +20
  == tcp: segment: 79
@step IP: IP adds the two ends' addresses and a TTL of 64. Each router will take 1 off; at 0 the packet is dropped.
at 3
show pk
light pk: to 203.0.113.80
calc
  segment: 79
  IP header: +20
  == ip: packet: 99
@step Ethernet: Ethernet wraps it for the home network only: to the next hop's MAC, not the server's. A checksum at the end (FCS) catches damage on each link.
at 2
show fr
light fr: to 00:00:5E:00:53:01
calc
  packet: 99
  Ethernet header: +14
  FCS, at the end: +4
  == link: frame: 117
@step Two addresses: Two addresses, two jobs. The MAC gets it to the next router. The IP address gets it to the server.
card link: Side by side | two addresses, two jobs
  link: layer 2 | addressed to 00:00:5E:00:53:01 | the home router, one hop away (two links, through the switch)
  ip: layer 3 | addressed to 203.0.113.80 | the server, five links away
```

## 4. Bits become a signal

```animation
title: Bits become a signal | the wire time of the request's frame: 1,000 bits, 1,000 ns at 1 Gb/s
time: 0..1000 | ns, as the MAC hands it over; copper and fibre share this scale
ticks: 0, 200, 400, 600, 800, 1000
row link fr "the frame": +preamble 0..56; +start marker 56..64; +Ethernet header 64..176; +the IP packet 176..968; +FCS 968..1000
zoom: 48..64 | two bytes as the MAC hands them over, lowest bit first | below @2..5
zoom ticks: 48, 56, 64
zoom row signal bits "0x55 then 0xd5": +1 48..49; 0 49..50; +1 50..51; 0 51..52; +1 52..53; 0 53..54; +1 54..55; 0 55..56; +1 56..57; 0 57..58; +1 58..59; 0 59..60; +1 60..61; 0 61..62; +1 62..63; +1 63..64
## Copper
signal cu: copper (links 1, 2, 5) | four wire pairs, each in both directions at once | 125 million symbols a second on each pair | five levels: -2, -1, 0, +1, +2 | one byte becomes four symbols, one on each pair | the first two preamble bytes go out as start-of-stream symbols (SSD1, SSD2) | between frames, idle symbols keep both ends in step | * example, not computed: pair A +2, B -1, C 0, D +1
## Fibre
signal fi: fibre (link 3) | each byte becomes 10 line bits (8b/10b): 1.25 billion a second | brighter light is 1, dimmer is 0 | between frames, idle symbols keep both ends in step | * preamble 0x55 is D21.2: 1 0 1 0 1 0 0 1 0 1 | start marker 0xd5 is D21.6: 1 0 1 0 1 0 0 1 1 0 | the frame opens with a start symbol, /S/ (K27.7), in place of a preamble byte; one preamble byte may be lost to keep the symbols aligned
## Radio
signal ra: radio (link 4) | not to this scale: a radio has its own rate and framing, and need not send the preamble | bits are scrambled and protected, then sent in groups | QPSK, a simple mode, 2 bits a symbol: 00 is 45°, 01 is 135°, 11 is 225°, 10 is 315° | * example bits 10 11 00 01: phases 315°, 225°, 45°, 135° | faster modes change strength as well (QAM)
@step A thousand bits: The network card sends 8 bytes of lead-in, then the 117 byte frame: 1,000 bits. At 1 gigabit a second that is 1 microsecond.
rows
  0 to 56 ns | preamble, 7 bytes of 0x55
  56 to 64 ns | start marker, 0xd5
  64 to 176 ns | Ethernet header, 14 bytes
  176 to 968 ns | the IP packet, 99 bytes
  968 to 1,000 ns | FCS, 4 bytes
@step Bytes to bits: Lowest bit first. The final 1, 1 says the frame starts now. The 1, 0 preamble set the beat on early Ethernet; gigabit links keep in step between frames.
span fr 56..64: start marker, 0xd5
rows
  preamble 0x55 | 1 0 1 0 1 0 1 0
  start marker 0xd5 | 1 0 1 0 1 0 1 1
@step Copper: On copper, gigabit Ethernet scrambles and codes each byte into four voltage steps, one on each wire pair, from five possible levels.
show cu
@step Fibre: On fibre each byte becomes 10 bits, chosen so ones and zeros balance over time. A laser sends them as brighter and dimmer light.
show fi
@step Radio: On radio, groups of bits set the phase of a wave, and in faster modes its strength too. Wi-Fi does the same, inside its own kind of frame.
show ra
```

```animation
title: Copper: pair A over five bytes | one wire pair, five symbols of 8 ns each, one from each byte (pairs B, C, D carry the rest at the same time); example levels, not computed
time: 0..40 | ns
ticks: 0, 8, 16, 24, 32, 40
plot: -2..2 | level on pair A (five levels, -2 to +2) | line
point signal c0a at 0: 0 | 0
point signal c0b at 7.99: 0
point signal c1a at 8: 2 | +2
point signal c1b at 15.99: 2
point signal c2a at 16: -2 | -2
point signal c2b at 23.99: -2
point signal c3a at 24: 1 | +1
point signal c3b at 31.99: 1
point signal c4a at 32: -1 | -1
point signal c4b at 39.99: -1
```

```animation
title: Fibre: brighter and dimmer light | the line bits of 0x55 (D21.2) and 0xd5 (D21.6): 20 bits, 0.8 ns each
time: 0..16 | ns
ticks: 0, 4, 8, 12, 16
plot: 0..1 | light (1 brighter, 0 dimmer) | line
point signal f0a at 0: 1 | D21.2
point signal f0b at 0.79: 1
point signal f1a at 0.8: 0
point signal f1b at 1.59: 0
point signal f2a at 1.6: 1
point signal f2b at 2.39: 1
point signal f3a at 2.4: 0
point signal f3b at 3.19: 0
point signal f4a at 3.2: 1
point signal f4b at 3.99: 1
point signal f5a at 4: 0
point signal f5b at 4.79: 0
point signal f6a at 4.8: 0
point signal f6b at 5.59: 0
point signal f7a at 5.6: 1
point signal f7b at 6.39: 1
point signal f8a at 6.4: 0
point signal f8b at 7.19: 0
point signal f9a at 7.2: 1
point signal f9b at 7.99: 1
point signal f10a at 8: 1 | D21.6
point signal f10b at 8.79: 1
point signal f11a at 8.8: 0
point signal f11b at 9.59: 0
point signal f12a at 9.6: 1
point signal f12b at 10.39: 1
point signal f13a at 10.4: 0
point signal f13b at 11.19: 0
point signal f14a at 11.2: 1
point signal f14b at 11.99: 1
point signal f15a at 12: 0
point signal f15b at 12.79: 0
point signal f16a at 12.8: 0
point signal f16b at 13.59: 0
point signal f17a at 13.6: 1
point signal f17b at 14.39: 1
point signal f18a at 14.4: 1
point signal f18b at 15.19: 1
point signal f19a at 15.2: 0
point signal f19b at 15.99: 0
```

```animation
title: Radio: the phase of a wave | QPSK: the example bits 10 11 00 01, 2 bits a symbol; not to scale
time: 0..4 | symbol times
ticks: 0, 1, 2, 3, 4
plot: -1..1 | the wave (its phase carries the bits) | line
point signal r0_0 at 0: 0.707 | 10: 315°
point signal r0_1 at 0.021: 0.866
point signal r0_2 at 0.042: 0.966
point signal r0_3 at 0.063: 1
point signal r0_4 at 0.083: 0.966
point signal r0_5 at 0.104: 0.866
point signal r0_6 at 0.125: 0.707
point signal r0_7 at 0.146: 0.5
point signal r0_8 at 0.167: 0.259
point signal r0_9 at 0.188: 0
point signal r0_10 at 0.208: -0.259
point signal r0_11 at 0.229: -0.5
point signal r0_12 at 0.25: -0.707
point signal r0_13 at 0.271: -0.866
point signal r0_14 at 0.292: -0.966
point signal r0_15 at 0.313: -1
point signal r0_16 at 0.333: -0.966
point signal r0_17 at 0.354: -0.866
point signal r0_18 at 0.375: -0.707
point signal r0_19 at 0.396: -0.5
point signal r0_20 at 0.417: -0.259
point signal r0_21 at 0.438: 0
point signal r0_22 at 0.458: 0.259
point signal r0_23 at 0.479: 0.5
point signal r0_24 at 0.5: 0.707
point signal r0_25 at 0.521: 0.866
point signal r0_26 at 0.542: 0.966
point signal r0_27 at 0.563: 1
point signal r0_28 at 0.583: 0.966
point signal r0_29 at 0.604: 0.866
point signal r0_30 at 0.625: 0.707
point signal r0_31 at 0.646: 0.5
point signal r0_32 at 0.667: 0.259
point signal r0_33 at 0.688: 0
point signal r0_34 at 0.708: -0.259
point signal r0_35 at 0.729: -0.5
point signal r0_36 at 0.75: -0.707
point signal r0_37 at 0.771: -0.866
point signal r0_38 at 0.792: -0.966
point signal r0_39 at 0.813: -1
point signal r0_40 at 0.833: -0.966
point signal r0_41 at 0.854: -0.866
point signal r0_42 at 0.875: -0.707
point signal r0_43 at 0.896: -0.5
point signal r0_44 at 0.917: -0.259
point signal r0_45 at 0.938: 0
point signal r0_46 at 0.958: 0.259
point signal r0_47 at 0.979: 0.5
point signal r0_48 at 0.999: 0.707
point signal r1_0 at 1: -0.707 | 11: 225°
point signal r1_1 at 1.021: -0.5
point signal r1_2 at 1.042: -0.259
point signal r1_3 at 1.063: 0
point signal r1_4 at 1.083: 0.259
point signal r1_5 at 1.104: 0.5
point signal r1_6 at 1.125: 0.707
point signal r1_7 at 1.146: 0.866
point signal r1_8 at 1.167: 0.966
point signal r1_9 at 1.188: 1
point signal r1_10 at 1.208: 0.966
point signal r1_11 at 1.229: 0.866
point signal r1_12 at 1.25: 0.707
point signal r1_13 at 1.271: 0.5
point signal r1_14 at 1.292: 0.259
point signal r1_15 at 1.313: 0
point signal r1_16 at 1.333: -0.259
point signal r1_17 at 1.354: -0.5
point signal r1_18 at 1.375: -0.707
point signal r1_19 at 1.396: -0.866
point signal r1_20 at 1.417: -0.966
point signal r1_21 at 1.438: -1
point signal r1_22 at 1.458: -0.966
point signal r1_23 at 1.479: -0.866
point signal r1_24 at 1.5: -0.707
point signal r1_25 at 1.521: -0.5
point signal r1_26 at 1.542: -0.259
point signal r1_27 at 1.563: 0
point signal r1_28 at 1.583: 0.259
point signal r1_29 at 1.604: 0.5
point signal r1_30 at 1.625: 0.707
point signal r1_31 at 1.646: 0.866
point signal r1_32 at 1.667: 0.966
point signal r1_33 at 1.688: 1
point signal r1_34 at 1.708: 0.966
point signal r1_35 at 1.729: 0.866
point signal r1_36 at 1.75: 0.707
point signal r1_37 at 1.771: 0.5
point signal r1_38 at 1.792: 0.259
point signal r1_39 at 1.813: 0
point signal r1_40 at 1.833: -0.259
point signal r1_41 at 1.854: -0.5
point signal r1_42 at 1.875: -0.707
point signal r1_43 at 1.896: -0.866
point signal r1_44 at 1.917: -0.966
point signal r1_45 at 1.938: -1
point signal r1_46 at 1.958: -0.966
point signal r1_47 at 1.979: -0.866
point signal r1_48 at 1.999: -0.707
point signal r2_0 at 2: 0.707 | 00: 45°
point signal r2_1 at 2.021: 0.5
point signal r2_2 at 2.042: 0.259
point signal r2_3 at 2.063: 0
point signal r2_4 at 2.083: -0.259
point signal r2_5 at 2.104: -0.5
point signal r2_6 at 2.125: -0.707
point signal r2_7 at 2.146: -0.866
point signal r2_8 at 2.167: -0.966
point signal r2_9 at 2.188: -1
point signal r2_10 at 2.208: -0.966
point signal r2_11 at 2.229: -0.866
point signal r2_12 at 2.25: -0.707
point signal r2_13 at 2.271: -0.5
point signal r2_14 at 2.292: -0.259
point signal r2_15 at 2.313: 0
point signal r2_16 at 2.333: 0.259
point signal r2_17 at 2.354: 0.5
point signal r2_18 at 2.375: 0.707
point signal r2_19 at 2.396: 0.866
point signal r2_20 at 2.417: 0.966
point signal r2_21 at 2.438: 1
point signal r2_22 at 2.458: 0.966
point signal r2_23 at 2.479: 0.866
point signal r2_24 at 2.5: 0.707
point signal r2_25 at 2.521: 0.5
point signal r2_26 at 2.542: 0.259
point signal r2_27 at 2.563: 0
point signal r2_28 at 2.583: -0.259
point signal r2_29 at 2.604: -0.5
point signal r2_30 at 2.625: -0.707
point signal r2_31 at 2.646: -0.866
point signal r2_32 at 2.667: -0.966
point signal r2_33 at 2.688: -1
point signal r2_34 at 2.708: -0.966
point signal r2_35 at 2.729: -0.866
point signal r2_36 at 2.75: -0.707
point signal r2_37 at 2.771: -0.5
point signal r2_38 at 2.792: -0.259
point signal r2_39 at 2.813: 0
point signal r2_40 at 2.833: 0.259
point signal r2_41 at 2.854: 0.5
point signal r2_42 at 2.875: 0.707
point signal r2_43 at 2.896: 0.866
point signal r2_44 at 2.917: 0.966
point signal r2_45 at 2.938: 1
point signal r2_46 at 2.958: 0.966
point signal r2_47 at 2.979: 0.866
point signal r2_48 at 2.999: 0.707
point signal r3_0 at 3: -0.707 | 01: 135°
point signal r3_1 at 3.021: -0.866
point signal r3_2 at 3.042: -0.966
point signal r3_3 at 3.063: -1
point signal r3_4 at 3.083: -0.966
point signal r3_5 at 3.104: -0.866
point signal r3_6 at 3.125: -0.707
point signal r3_7 at 3.146: -0.5
point signal r3_8 at 3.167: -0.259
point signal r3_9 at 3.188: 0
point signal r3_10 at 3.208: 0.259
point signal r3_11 at 3.229: 0.5
point signal r3_12 at 3.25: 0.707
point signal r3_13 at 3.271: 0.866
point signal r3_14 at 3.292: 0.966
point signal r3_15 at 3.313: 1
point signal r3_16 at 3.333: 0.966
point signal r3_17 at 3.354: 0.866
point signal r3_18 at 3.375: 0.707
point signal r3_19 at 3.396: 0.5
point signal r3_20 at 3.417: 0.259
point signal r3_21 at 3.438: 0
point signal r3_22 at 3.458: -0.259
point signal r3_23 at 3.479: -0.5
point signal r3_24 at 3.5: -0.707
point signal r3_25 at 3.521: -0.866
point signal r3_26 at 3.542: -0.966
point signal r3_27 at 3.563: -1
point signal r3_28 at 3.583: -0.966
point signal r3_29 at 3.604: -0.866
point signal r3_30 at 3.625: -0.707
point signal r3_31 at 3.646: -0.5
point signal r3_32 at 3.667: -0.259
point signal r3_33 at 3.688: 0
point signal r3_34 at 3.708: 0.259
point signal r3_35 at 3.729: 0.5
point signal r3_36 at 3.75: 0.707
point signal r3_37 at 3.771: 0.866
point signal r3_38 at 3.792: 0.966
point signal r3_39 at 3.813: 1
point signal r3_40 at 3.833: 0.966
point signal r3_41 at 3.854: 0.866
point signal r3_42 at 3.875: 0.707
point signal r3_43 at 3.896: 0.5
point signal r3_44 at 3.917: 0.259
point signal r3_45 at 3.938: 0
point signal r3_46 at 3.958: -0.259
point signal r3_47 at 3.979: -0.5
point signal r3_48 at 3.999: -0.707
```

## 5. The switch and the home router

```animation
title: The switch and the home router | follow one packet
## Laptop
app lap: laptop | 192.0.2.10
## Switch
link sw: switch | ports 1 and 5
## Home router
router hr: home router | 192.0.2.1 at home | 198.51.100.7 to the provider
  link gone: dropped here | the frame: to 00:00:5E:00:53:01, from 00:00:5E:00:53:0A, FCS 0e be 36 b7 | its job is done
## Router A
router ra: router A | 198.51.100.6
nest: The packet | layer 2 outside, layer 3 inside
  link fr: Ethernet frame | 117 bytes | to 00:00:5E:00:53:01; from 00:00:5E:00:53:0A; type 0x0800 (IPv4); > FCS 0e be 36 b7, at the end
  ip pk: IP packet | 99 bytes | version 4; header 20; DSCP 0; total length 99; ID 0x1c46; flag DF, offset 0; TTL 64; protocol 6 (TCP); header checksum 0x1ff4; from 192.0.2.10; to 203.0.113.80
  tcp sg: TCP segment | 79 bytes | ports 51514 to 443; seq 1001; ack 4001; header 20; flags PSH, ACK; window 64240; checksum 0x551d; urgent 0; data 59 bytes
  sec rc: TLS record | 59 bytes | type 23 (application data); version 0x0303 (fixed, though this is TLS 1.3); length 54; sealed 34 bc 53 f1 70 5c 23 c9 …; tag 7b 4c e0 3c a9 0d d6 e8 68 ec 54 15 f7 b1 2d c2; carried, unreadable here
@step To the switch: Follow that one packet. It crosses the first link as a signal, and is a frame again at the switch.
lap -> sw: the first link, copper
@step MACs only: The switch checks the FCS, notes the source on port 1, and looks up the destination: port 5. A plain switch never reads the IP addresses.
rows link
  ^ the switch's MAC table | port | _
  00:00:5E:00:53:0A | port 1 | source: seen again
  * 00:00:5E:00:53:01 | * port 5 | => link: destination: used
@step Unchanged: The same frame leaves by port 5. Both MACs, the packet and the TTL are exactly as they came.
sw -> hr: port 5
light fr
list the switch passes it on
  out of port 5: the same frame, FCS 0e be 36 b7
  + MACs: kept
  + IPs: kept
  + TTL: kept
@step Frame off: The home router finds its own MAC and a good FCS, so it takes the frame off. It checks the IP checksum and reads the destination.
clear
unwrap fr
show gone
@step Next hop: For 203.0.113.80 only the default route matches. The next hop is 198.51.100.6, the provider's router A.
rows table
  ^ routing table T2 | learned from | next hop | out
  198.51.100.6/31 | connected | on this network | fibre to A
  192.0.2.0/24 | connected | on this network | copper to the switch
  * 0.0.0.0/0 | * default (from the provider) | * 198.51.100.6 | * fibre to A ; * matches, longest: chosen
@step TTL: It is forwarding, so it takes 1 off the TTL: 64 becomes 63.
set pk: TTL 64 => TTL 63
rows table
  ^ routing table T2 | learned from | next hop | out
  198.51.100.6/31 | connected | on this network | fibre to A
  192.0.2.0/24 | connected | on this network | copper to the switch
  0.0.0.0/0 | default (from the provider) | 198.51.100.6 | fibre to A ; matches, longest: chosen
@step NAT: NAT happens here: the source becomes the public 198.51.100.7, port 40001, from the entry the SYN made. The destination stays.
set pk: from 192.0.2.10 => from 198.51.100.7
set sg: ports 51514 to 443 => ports 40001 to 443
card table: NAT table T8 | TCP: 192.0.2.10:51514 is 198.51.100.7:40001, toward 203.0.113.80:443
  state: established (written by the SYN)
  expected back: 203.0.113.80:443 to 198.51.100.7:40001
@step Checksums: The router fixes the IP checksum, and the TCP one too, because that one also covers the addresses and ports.
set pk: header checksum 0x1ff4 => header checksum 0xb8c3
set sg: checksum 0x551d => checksum 0x19e6
calc
  IP: 0x1ff4 becomes 0xb8c3 (TTL and address changed)
  TCP: 0x551d becomes 0x19e6 (it covers addresses and ports)
@step The next MAC: It looks up the next hop's MAC in its ARP cache, 198.51.100.6 is at 00:00:5E:00:53:A1. Had it none, it would ask on that link.
card link: neighbour cache | on the link out: fibre
  * 198.51.100.6 is 00:00:5E:00:53:A1: used
@step A new frame: A new frame for the new link, with both MACs new and a new FCS. Inside, the destination is still 203.0.113.80.
show fr
fields fr: * to 00:00:5E:00:53:A1; * from 00:00:5E:00:53:02; type 0x0800 (IPv4); > FCS 40 44 8d ca, at the end
light fr
hr -> ra: link 3, fibre
card table: What the home router used | three tables
  neighbour cache: 198.51.100.6 is 00:00:5E:00:53:A1
  0.0.0.0/0: default (from the provider), next hop 198.51.100.6, out fibre to A: matches, longest, chosen
  TCP: 192.0.2.10:51514 is 198.51.100.7:40001, toward 203.0.113.80:443
  > state: established
  > expected back: 203.0.113.80:443 to 198.51.100.7:40001
```

## 6. Two internet routers: how they know the way

```animation
title: Two internet routers: how they know the way | BGP between A and B; OSPF inside each AS
## AS 64496
router ra: router A | 198.51.100.6/31 to the home | 198.51.100.200/31 to B | 198.51.100.197/30 to its core
  link ga: dropped here | the frame from the home router: to 00:00:5E:00:53:A1, from 00:00:5E:00:53:02
  table t3: routing table T3 | 198.51.100.6/31: connected, next hop on this network, out fibre to the home | 198.51.100.200/31: connected, next hop on this network, out radio to B | 198.51.100.196/30: connected, next hop on this network, out core link | 198.51.100.128/26: OSPF, next hop 198.51.100.198, out core link | 198.51.100.0/24: static (so A can announce it), next hop discard, out none | 203.0.113.0/24: BGP, from AS 64497, next hop 198.51.100.201, out radio to B | 0.0.0.0/0: default (set by hand), next hop 198.51.100.198, out core link
router ca: core router | inside AS 64496
## AS 64497
router rb: router B | 198.51.100.201/31 to A | 203.0.113.65/26 to the server | 203.0.113.1/30 to its core
  link gb: dropped here | the radio link's frame: to 00:00:5E:00:53:B1, from 00:00:5E:00:53:A2
  table t4: routing table T4 | 203.0.113.64/26: connected, next hop on this network, out copper to the server — matches | 203.0.113.0/30: connected, next hop on this network, out core link | 198.51.100.200/31: connected, next hop on this network, out radio to A | 203.0.113.0/24: OSPF, next hop 203.0.113.2, out core link — matches | 198.51.100.0/24: BGP, from AS 64496, next hop 198.51.100.200, out radio to A | 0.0.0.0/0: default (set by hand), next hop 203.0.113.2, out core link — matches
app sv: server | 203.0.113.80/26
router cb: core router | inside AS 64497
nest: The packet | layer 2 outside, layer 3 inside
  link fr: Ethernet frame | 117 bytes | to 00:00:5E:00:53:A1; from 00:00:5E:00:53:02; type 0x0800 (IPv4); > FCS 40 44 8d ca, at the end
  ip pk: IP packet | 99 bytes | version 4; header 20; DSCP 0; total length 99; ID 0x1c46; flag DF, offset 0; TTL 63; protocol 6 (TCP); header checksum 0xb8c3; from 198.51.100.7; to 203.0.113.80
  tcp sg: TCP segment | 79 bytes | ports 40001 to 443; seq 1001; ack 4001; header 20; flags PSH, ACK; window 64240; checksum 0x19e6; urgent 0; data 59 bytes
  sec rc: TLS record | 59 bytes | type 23 (application data); version 0x0303 (fixed, though this is TLS 1.3); length 54; sealed 34 bc 53 f1 70 5c 23 c9 …; tag 7b 4c e0 3c a9 0d d6 e8 68 ec 54 15 f7 b1 2d c2; carried, unreadable here
@step At router A: Router A checks and takes off the fibre link's frame. It has never heard of the laptop. It only has the packet's destination and its own table.
unwrap fr
show ga
light pk: to 203.0.113.80
@step Where routes come from: Where do routes come from? Connected ones are A's own links. The default, set by hand, is for everything else.
show t3
say t3: Learned from: connected, OSPF, static, BGP, default
@step OSPF: Inside AS 64496 the routers flood the state of their links with OSPF, and each works out routes, such as the one to 198.51.100.128/26.
text t3: 198.51.100.6/31: connected, next hop on this network, out fibre to the home | 198.51.100.200/31: connected, next hop on this network, out radio to B | 198.51.100.196/30: connected, next hop on this network, out core link | * 198.51.100.128/26: OSPF, next hop 198.51.100.198, out core link | 198.51.100.0/24: static (so A can announce it), next hop discard, out none | 203.0.113.0/24: BGP, from AS 64497, next hop 198.51.100.201, out radio to B | 0.0.0.0/0: default (set by hand), next hop 198.51.100.198, out core link
light t3
ra --> ca: OSPF
@step BGP: Between networks it is BGP: router B announced that AS 64497 has 203.0.113.0/24, with next hop 198.51.100.201.
text t3: 198.51.100.6/31: connected, next hop on this network, out fibre to the home | 198.51.100.200/31: connected, next hop on this network, out radio to B | 198.51.100.196/30: connected, next hop on this network, out core link | 198.51.100.128/26: OSPF, next hop 198.51.100.198, out core link | 198.51.100.0/24: static (so A can announce it), next hop discard, out none | * 203.0.113.0/24: BGP, from AS 64497, next hop 198.51.100.201, out radio to B | 0.0.0.0/0: default (set by hand), next hop 198.51.100.198, out core link
light t3
rb --> ra: BGP: 203.0.113.0/24
@step Longest match: Two rows cover the server: /0 and /24. The longer prefix wins, so the next hop is 198.51.100.201, on A's radio link.
text t3: 198.51.100.6/31: connected, next hop on this network, out fibre to the home | 198.51.100.200/31: connected, next hop on this network, out radio to B | 198.51.100.196/30: connected, next hop on this network, out core link | 198.51.100.128/26: OSPF, next hop 198.51.100.198, out core link | 198.51.100.0/24: static (so A can announce it), next hop discard, out none | * 203.0.113.0/24: BGP, from AS 64497, next hop 198.51.100.201, out radio to B — matches, longest: chosen | 0.0.0.0/0: default (set by hand), next hop 198.51.100.198, out core link — matches
light t3
@step Sent on: TTL 63 becomes 62, and a new frame goes to B's MAC. Both IP addresses stay: A does no NAT.
show fr
fields fr: to 00:00:5E:00:53:B1; from 00:00:5E:00:53:A2; type 0x0800 (IPv4); > FCS 59 c6 51 a7, at the end
light fr
set pk: TTL 63 => TTL 62; header checksum 0xb8c3 => header checksum 0xb9c3
say ra (link): neighbour cache: 198.51.100.201 is 00:00:5E:00:53:B1
@step New network: The packet crosses from the provider's network, AS 64496, into the hosting company's, AS 64497. The packet itself does not notice.
ra -> rb: the radio link
foot: where it is: on the radio link: leaving AS 64496, entering AS 64497
@step At router B: B takes that frame off and looks in its own table. Three rows cover the server: /0, /24 from OSPF, and /26.
clear
unwrap fr
show gb, t4
@step B's longest match: /26 is the longest, and it is connected: the server is on B's own link. This time the next hop is the destination itself.
text t4: * 203.0.113.64/26: connected, next hop on this network, out copper to the server — matches, longest: chosen | 203.0.113.0/30: connected, next hop on this network, out core link | 198.51.100.200/31: connected, next hop on this network, out radio to A | 203.0.113.0/24: OSPF, next hop 203.0.113.2, out core link — matches | 198.51.100.0/24: BGP, from AS 64496, next hop 198.51.100.200, out radio to A | 0.0.0.0/0: default (set by hand), next hop 203.0.113.2, out core link — matches
light t4
@step The server's MAC: B takes 1 off the TTL: 62 becomes 61. It is the first router on the path that uses the server's own MAC.
set pk: TTL 62 => TTL 61; header checksum 0xb9c3 => header checksum 0xbac3
say rb (link): neighbour cache: 203.0.113.80 is 00:00:5E:00:53:80
@step The last frame: The last frame goes to the server's MAC, with TTL 61 inside. The IP destination is the one the laptop wrote.
show fr
fields fr: to 00:00:5E:00:53:80; from 00:00:5E:00:53:B2; type 0x0800 (IPv4); > FCS 15 1c 3c 4f, at the end
light fr
rb -> sv: copper
```

## 7. The server unwraps

```animation
title: The server unwraps | server 203.0.113.80, port 443, MAC 00:00:5E:00:53:80
nest: Arrived
  link fr: Ethernet frame | 117 bytes | to 00:00:5E:00:53:80; from 00:00:5E:00:53:B2; type 0x0800 (IPv4); > FCS 15 1c 3c 4f, at the end
  ip pk: IP packet | 99 bytes | version 4; header 20; DSCP 0; total length 99; ID 0x1c46; flag DF, offset 0; TTL 61; protocol 6 (TCP); header checksum 0xbac3; from 198.51.100.7; to 203.0.113.80
  tcp sg: TCP segment | 79 bytes | ports 40001 to 443; seq 1001; ack 4001; header 20; flags PSH, ACK; window 64240; checksum 0x19e6; urgent 0; data 59 bytes
  sec rc: TLS record | 59 bytes | type 23 (application data); version 0x0303 (fixed, though this is TLS 1.3); length 54; sealed 34 bc 53 f1 70 5c 23 c9 …; tag 7b 4c e0 3c a9 0d d6 e8 68 ec 54 15 f7 b1 2d c2; still sealed
  app rq: HTTP request | 37 bytes | GET / HTTP/1.1; Host: example.com; an empty line
nest: The answer
  app ans: HTTP answer | 3,978 bytes | HTTP/1.1 200 OK; Date: Sun, 22 Nov 2026 21:00:00 GMT; Content-Type: text/html; charset=utf-8; Content-Length: 3860; an empty line; 3,860 bytes of HTML; > sealed: one record of 4,000 bytes; > cut: seq 4001 (1,460 bytes), seq 5461 (1,460 bytes), seq 6921 (1,080 bytes)
@step Signal to frame: The server's port keeps in step with the signal and decides each symbol, turns it back into bits, and finds the frame after the start marker.
light fr
note: Arrived | a signal on copper: the port decides 125 million symbols a second on each pair | decoded to bits; the start marker shows where the frame begins
@step Layer 2 off: The MAC is the server's and the FCS is right. The frame has done its job and comes off.
unwrap fr
grid 5
  link: layer 2 | MAC 00:00:5E:00:53:80 is mine, FCS 15 1c 3c 4f is right; frame dropped [= checked]
@step Layer 3 off: The IP destination is the server's own address, and the protocol is 6. What is inside goes to TCP.
unwrap pk
grid 5
  link: layer 2 [= checked]
  ip: layer 3 | to 203.0.113.80 is mine, checksum 0xbac3 is right, protocol 6 [= checked]
@step Layer 4 off: Addresses and ports pick the connection. Bytes 1001 to 1059 are the next in order, so the server will send ACK 1060.
unwrap sg
note: To acknowledge | 1060 (it rides on the answer)
grid 5
  link: layer 2 [= checked]
  ip: layer 3 [= checked]
  tcp: layer 4 | connection 198.51.100.7:40001 to :443; checksum 0x19e6; bytes 1001 to 1059 are the next expected [= checked]
@step Decrypted: TLS finds the keys it kept for this session, checks the tag, so nothing was changed, and decrypts.
unwrap rc
show rq
grid 5
  link: layer 2 [= checked]
  ip: layer 3 [= checked]
  tcp: layer 4 [= checked]
  sec: TLS | session found, record 0, tag right, decrypted [= checked]
@step The answer: The web server reads the request and makes the page. Sealed, the answer is 4,000 bytes, so TCP cuts it into three numbered segments.
grid 5
  link: layer 2 [= checked]
  ip: layer 3 [= checked]
  tcp: layer 4 [= checked]
  sec: TLS [= checked]
  app: HTTP | GET / for example.com [= served]
show ans
light ans: cut: seq 4001 (1,460 bytes), seq 5461 (1,460 bytes), seq 6921 (1,080 bytes)
```

## 8. The way back

```animation
title: The way back | followed: answer segment 1
## AS 64497
app sv: server | 203.0.113.80
router rb: router B | AS 64497
## AS 64496
router ra: router A | AS 64496
## Home
router hr: home router | 198.51.100.7 outside
link sw: switch | ports 1 and 5
app lap: laptop | 192.0.2.10
nest: The packet | layer 2 outside, layer 3 inside
  link fr: Ethernet frame | 1,518 bytes | to 00:00:5E:00:53:B2; from 00:00:5E:00:53:80; type 0x0800 (IPv4); > FCS b4 2a 84 1b, at the end
  ip pk: IP packet | 1,500 bytes | version 4; header 20; DSCP 0; total length 1500; ID 0x9a10; flag DF, offset 0; TTL 64; protocol 6 (TCP); header checksum 0x3480; from 203.0.113.80; to 198.51.100.7
  tcp sg: TCP segment | 1,480 bytes | ports 443 to 40001; seq 4001; ack 1060; header 20; flags ACK; window 65160; checksum 0xaba2; urgent 0; data 1,460 bytes
  sec dat: the first 1,460 bytes of the sealed answer record | _ | unreadable here
@step The server sends: Follow the first answer packet. It is wrapped the same way, to 198.51.100.7 with a fresh TTL of 64, in a frame to router B's MAC.
sv -> rb: copper
rows table
  ^ the server's table T5 | learned from | next hop | out
  203.0.113.64/26 | connected | on this network | copper to B
  * 0.0.0.0/0 | * default (set by hand) | * 203.0.113.65 | * copper to B ; * matches, longest: chosen
@step B, by BGP: B's longest match is 198.51.100.0/24, which A announced by BGP. TTL 63, and a new frame to A's MAC.
rb -> ra: radio
fields fr: to 00:00:5E:00:53:A2; from 00:00:5E:00:53:B1; type 0x0800 (IPv4); > FCS a0 9e 7d e2, at the end
set pk: TTL 64 => TTL 63; header checksum 0x3480 => header checksum 0x3580
rows plain table
  ^ routing table T4 | learned from | next hop | out
  203.0.113.64/26 | connected | on this network | copper to the server
  203.0.113.0/30 | connected | on this network | core link
  198.51.100.200/31 | connected | on this network | radio to A
  203.0.113.0/24 | OSPF | 203.0.113.2 | core link
  * 198.51.100.0/24 | * BGP, from AS 64496 | * 198.51.100.200 | * radio to A: matches, longest: chosen
  0.0.0.0/0 | default (set by hand) | 203.0.113.2 | core link: matches
@step A, connected: A's longest match is its connected /31: the home router is the next hop. TTL 62, and a new frame to its MAC.
ra -> hr: fibre
fields fr: to 00:00:5E:00:53:02; from 00:00:5E:00:53:A1; type 0x0800 (IPv4); > FCS e2 0f 29 60, at the end
set pk: TTL 63 => TTL 62; header checksum 0x3580 => header checksum 0x3680
rows plain table
  ^ routing table T3 | learned from | next hop | out
  * 198.51.100.6/31 | * connected | * on this network | * fibre to the home: matches, longest: chosen
  198.51.100.200/31 | connected | on this network | radio to B
  198.51.100.196/30 | connected | on this network | core link
  198.51.100.128/26 | OSPF | 198.51.100.198 | core link
  198.51.100.0/24 | static (so A can announce it) | discard | none: matches
  203.0.113.0/24 | BGP, from AS 64497 | 198.51.100.201 | radio to B
  0.0.0.0/0 | default (set by hand) | 198.51.100.198 | core link: matches
@step NAT restores: The home router finds port 40001 in its NAT table and puts the laptop back as the destination. Then it routes: TTL 61.
unwrap fr
set pk: to 198.51.100.7 => to 192.0.2.10; TTL 62 => TTL 61; header checksum 0x3680 => header checksum 0x9fb0
set sg: ports 443 to 40001 => ports 443 to 51514; checksum 0xaba2 => checksum 0xe6d9
list NAT table T8 | table
  TCP: 192.0.2.10:51514 is 198.51.100.7:40001, toward 203.0.113.80:443
  state: established
  expected back: 203.0.113.80:443 to 198.51.100.7:40001
  to: 198.51.100.7:40001 becomes 192.0.2.10:51514
  checksums: IP 0x3680 becomes 0x9fb0; TCP 0xaba2 becomes 0xe6d9
@step The home link: 192.0.2.0/24 is connected, so the next hop is the laptop itself. A new frame carries the laptop's MAC.
hr -> sw: copper
show fr
fields fr: * to 00:00:5E:00:53:0A; from 00:00:5E:00:53:01; type 0x0800 (IPv4); > FCS eb 7e fa 64, at the end
list neighbour cache | link
  192.0.2.10 is 00:00:5E:00:53:0A: kept since the ARP question
@step Unchanged: The switch sends the same frame out of port 1. The laptop gets a packet whose source is still the server.
sw -> lap: port 1
fields dat: still sealed
say lap: at the laptop
rows link
  ^ the switch's MAC table | port | _
  * 00:00:5E:00:53:0A | * port 1 | used; the same frame, FCS eb 7e fa 64
  ! the five links, as it crossed them
  1. server to B | MAC 00:00:5E:00:53:80 to 00:00:5E:00:53:B2 | IP 203.0.113.80:443 to 198.51.100.7:40001; TTL 64
  2. B to A | MAC 00:00:5E:00:53:B1 to 00:00:5E:00:53:A2 | IP 203.0.113.80:443 to 198.51.100.7:40001; TTL 63
  3. A to home router | MAC 00:00:5E:00:53:A1 to 00:00:5E:00:53:02 | IP 203.0.113.80:443 to 198.51.100.7:40001; TTL 62
  4. home router to switch | MAC 00:00:5E:00:53:01 to 00:00:5E:00:53:0A | IP 203.0.113.80:443 to 192.0.2.10:51514; TTL 61
  5. switch to laptop | MAC 00:00:5E:00:53:01 to 00:00:5E:00:53:0A | IP 203.0.113.80:443 to 192.0.2.10:51514; TTL 61
```

## 9. The browser puts it back together, and draws

```animation
title: The browser puts it back together, and draws | three reserved places, so nothing moves when one fills
track: tcp receive | sec decrypt | app HTTP, render
## Laptop
app lap: laptop | 192.0.2.10
## TCP's buffer
tcp b1: 4001 to 5460 | empty
tcp b2: 5461 to 6920 | empty
tcp b3: 6921 to 8000 | empty
## Browser
app win: browser window | empty
nest: Record
  sec rec: TLS record | 4,000 bytes | type 23 (application data); version 0x0303 (fixed, though this is TLS 1.3); length 3,995; sealed a3 1b 49 e3 e2 4f 2c 2c …; tag 03 18 b1 be c5 a4 6d 88 73 84 16 00 56 0d 43 13
  app ans: HTTP answer | 3,978 bytes | HTTP/1.1 200 OK; Date: Sun, 22 Nov 2026 21:00:00 GMT; Content-Type: text/html; charset=utf-8; Content-Length: 3860; an empty line; 3,860 bytes of HTML
@step Segment 1: Up the layers again: signal, bits, frame, packet, segment. TCP puts bytes 4001 to 5460 at the start of its buffer.
at receive
text b1: here
light b1
say lap (tcp): ACK sent: ack 5461
note: Arrived | signal to bits; frame off (FCS right); packet off (to 192.0.2.10); segment seq 4001, 1,460 bytes
@step Segment 3 first: The third segment arrives before the second. TCP holds it, leaves the gap, and at once repeats: I still expect 5461.
text b3: here, held
text b2: missing
light b2
say lap (tcp): ACK sent: ack 5461 again: a duplicate ACK, still waiting for 5461
note: Arrived | segment seq 6921, 1,080 bytes, before segment 2
@step Back in order: The late segment fills the gap. Bytes 4001 to 8000 are whole and in order: ACK 8001.
text b2: here
text b3: here
light b2
say lap (tcp): ACK sent: ack 8001, at once
note: Arrived | segment seq 5461, 1,460 bytes, late
@step One record: In order, the bytes are one whole TLS record. TLS cannot check or open it until every byte is there.
at decrypt
show rec
@step Decrypted: The same session checks the record and decrypts it. Only the laptop and the server could.
fields rec: * decrypted with the kept session's key, record 0, tag right: 3,978 bytes
@step HTTP: HTTP says 200 OK and that 3,860 bytes of HTML follow. All of them are here.
at HTTP
hide rec
show ans
light ans: HTTP/1.1 200 OK
@step Parse: The browser reads the HTML into a tree, the DOM, and the CSS into style rules.
at render
calc
  DOM: document
  > doctype: html
  > html
  > > head
  > > > meta charset utf-8
  > > > title: Example
  > > > style: h1, bold, 32 px sans-serif
  > > body
  > > > h1: Hello from example.com
  > > > p: One packet at a time.
  > > > ~ comment: 3,653 dots of padding (collapsed; never drawn)
@step Style and layout: It works out each element's style, then where each box goes and how big it is.
list Render
  styles: h1 is bold, 32 px; p has the default
  layout: two blocks, the heading above the paragraph
@step Paint: It paints the pixels. The page is there, and the session waits for the next request.
text win: window title: Example; address: https://example.com/ | * painted: Hello from example.com | * painted: One packet at a time.
say win (sec): the session is kept for the next request
```

## 10. Layer 2 against layer 3, standing still

```animation static
title: Layer 2 against layer 3, standing still | the request's five links, in the order it crosses them
## 1. laptop to switch
link m1: layer 2 | MAC to 00:00:5E:00:53:01 | MAC from 00:00:5E:00:53:0A | FCS 0e be 36 b7
ip i1: layer 3 | IP from 192.0.2.10 | * IP to 203.0.113.80 | TTL 64 | IP checksum 0x1ff4
tcp t1: layer 4 | source port 51514 | TCP checksum 0x551d
## 2. switch to home router
link m2: layer 2 | MAC to 00:00:5E:00:53:01 | MAC from 00:00:5E:00:53:0A | FCS 0e be 36 b7
ip i2: layer 3 | IP from 192.0.2.10 | * IP to 203.0.113.80 | TTL 64 | IP checksum 0x1ff4
tcp t2: layer 4 | source port 51514 | TCP checksum 0x551d
## 3. home router to A
link m3: layer 2, changed | MAC to 00:00:5E:00:53:A1 | MAC from 00:00:5E:00:53:02 | FCS 40 44 8d ca
ip i3: layer 3 | IP from 198.51.100.7, changed by NAT | * IP to 203.0.113.80 | TTL 63, changed | IP checksum 0xb8c3, changed
tcp t3: layer 4, changed by NAT | source port 40001 | TCP checksum 0x19e6
## 4. A to B
link m4: layer 2, changed | MAC to 00:00:5E:00:53:B1 | MAC from 00:00:5E:00:53:A2 | FCS 59 c6 51 a7
ip i4: layer 3 | IP from 198.51.100.7 | * IP to 203.0.113.80 | TTL 62, changed | IP checksum 0xb9c3, changed
tcp t4: layer 4 | source port 40001 | TCP checksum 0x19e6
## 5. B to server
link m5: layer 2, changed | MAC to 00:00:5E:00:53:80 | MAC from 00:00:5E:00:53:B2 | FCS 15 1c 3c 4f
ip i5: layer 3 | IP from 198.51.100.7 | * IP to 203.0.113.80 | TTL 61, changed | IP checksum 0xbac3, changed
tcp t5: layer 4 | source port 40001 | TCP checksum 0x19e6
## Who changed what across 1. laptop to switch..5. B to server
link w1: switch | nothing
router w2: home router | frame, TTL, IP checksum; by NAT the source address, the source port and the TCP checksum
router w3: router A | frame, TTL, IP checksum
router w4: router B | frame, TTL, IP checksum
```
