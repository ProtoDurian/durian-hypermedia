An `http` block is a request and, after a blank line, its response, as text. It is drawn as a method tag and the address (the query split into names and values), the headers (folded after six), the body (JSON is pretty and can be folded), the status as a tag coloured by its class, and a button that copies the request as `curl`. A secret in a header is never written out: use a placeholder such as `<token>`.

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

With `static` the whole message is drawn: every header, the whole JSON tree, no button.

```http static
HTTP/1.1 404 Not Found
Content-Type: application/json
Cache-Control: no-store

{ "error": "not_found", "detail": { "resource": "order", "id": "o-9" } }
```
