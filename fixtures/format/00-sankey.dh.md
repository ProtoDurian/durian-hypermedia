---
title: Sankey — follow the flow
---

# Sankey — follow the flow

Follow a request's time through the service. Band widths show milliseconds; hover, focus or tap a band to read its share. Full labels stay on plates in either theme.

```sankey title="Where a request's time goes" unit=ms
request -> auth: 12
request -> handler: 80
node request "Incoming request" [c1]
node auth "Authentication" [c2]
node handler "Application processing" [c3]
node db "Database queries" [c4]
node render "Response assembly" [c5]
node cache "Cache lookup" [c6]
@step Enter the service
@step Follow the work
handler -> db: 55
handler -> render: 20
handler -> cache: 5
```

## The same flow, ready to print

```sankey static title="Where a request's time goes" unit=ms
request -> auth: 12
request -> handler: 80
handler -> db: 55
handler -> render: 20
handler -> cache: 5
node request "Incoming request" [c1]
node auth "Authentication" [c2]
node handler "Application processing" [c3]
node db "Database queries" [c4]
node render "Response assembly" [c5]
node cache "Cache lookup" [c6]
```
