---
title: HTTP, good
---
# HTTP messages

A request and its response, as text.

```http title="Create an order"
POST /v1/orders?dry_run=false&currency=usd HTTP/1.1
Host: api.example.com
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>
Idempotency-Key: 6f1c2d0e
User-Agent: shop-cli/2.4
X-Request-Id: req-7a91

{ "sku": "tea", "qty": 2, "ship": { "to": "198.51.100.7", "express": true }, "notes": ["gift", "no receipt"] }

HTTP/1.1 201 Created
Content-Type: application/json
Location: /v1/orders/o-7

{ "id": "o-7", "status": "open", "total": { "amount": 1840, "currency": "usd" } }
```

```http static
HTTP/1.1 404 Not Found
Content-Type: text/plain

nope
```
