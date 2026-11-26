---
title: DNS lookup through caches
roles: { client: c1, resolver: c2, dns: c3 }
---

# A DNS lookup through caches

Each cache on the way is asked first. Only when all of them miss does the resolver walk from the root down.

```animation
title: Looking up shop.example.com | first visit of the day
## Laptop
client l: laptop
  client bc: browser cache | empty
  client oc: system cache | empty
## Resolver
resolver r: ISP resolver | 203.0.113.53
  resolver rc: resolver cache | no entry
## Name servers
dns root: root server | knows .com
dns tld: .com server | knows example.com
dns auth: example.com server | holds the answer
@step Browser: The browser checks its own cache. There is no entry.
light bc
say bc: miss
@step System: The browser asks the operating system. Its cache misses too.
bc -> oc: shop.example.com?
say oc: miss
@step Resolver: The laptop asks the resolver, which checks its cache. Another miss.
oc -> r: shop.example.com?
light rc
say rc: miss
@step Root: The resolver asks a root server. The root sends it to the .com servers.
r -> root: shop.example.com?
root --> r (dns): ask the .com servers
@step TLD: The .com server sends it to the servers for example.com.
r -> tld: shop.example.com?
tld --> r (dns): ask ns1.example.com
@step Answer: The example.com server has the answer: 198.51.100.20, keep it for 300 s.
r -> auth: shop.example.com?
auth -> r (dns): 198.51.100.20, TTL 300
@step Cache: The resolver stores the answer and passes it back. Each cache keeps a copy.
r -> oc (resolver): 198.51.100.20
oc -> bc: 198.51.100.20
tag rc,oc,bc: 300 s
tone rc,oc,bc good
```
