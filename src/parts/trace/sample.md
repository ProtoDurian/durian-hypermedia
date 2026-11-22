A request across services. Fold spans, search, zoom the mini map, or switch to Flame.

```trace title="POST /checkout" unit=ms trace=t-7f3a
web        POST /checkout        0 842  user=u7 region=us-west-2
  gateway  route /checkout       3 838  route=checkout
    auth   verify.token          6  44  method=jwt
      db   SELECT sessions      10  38  rows=1
    cart   cart.load            47 205  items=3
      db   SELECT cart_items    52 121  rows=3
      db   SELECT prices       126 198  rows=3 cache=miss
    inventory stock.reserve     50 171  warehouse=w2
      db   UPDATE stock         57 166  rows=1 id=stock-update
    payment charge.card        208 812  provider=examplepay error="payment provider timed out"
      payment tls.connect      212 255
      payment provider.call    258 804  attempt=1 id=provider error="upstream timeout after 540 ms"
    queue  publish.retry       814 834  topic=payments.retry id=retry
@log db 130 warn "row lock held 94 ms" span=stock-update
@log payment 258 info "calling examplepay /v2/charge"
@log payment 804 error "upstream timeout after 540 ms, giving up"
@log queue 820 info "queued a retry for order o-2291"
@log web 840 error "answered 504 to the client"
@service db [c5] "Postgres"
```

:::llm
One checkout request, 842 ms, across 8 services. The payment provider call (258–804 ms) timed out, so charge.card and the request failed with a 504, and a retry was queued. Stock was reserved in parallel with the cart load and is not on the critical path; UPDATE stock in db waited 94 ms on a row lock.
:::

```trace title="GET /health" unit=ms open=2
web   GET /health        0 9
  api health.check       1 8
    db SELECT 1          2 6
```

```trace title="A flat list" unit=ms critical=off
web   GET /orders     0 60   id=a
api   orders.list     3 55   id=b parent=a
db    SELECT orders   8 40   id=c parent=b rows=25
api   orders.render  41 54   id=d parent=b
```
