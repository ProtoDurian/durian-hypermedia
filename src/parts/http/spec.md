#### Http

````
```http title="Create an order"
POST /v1/orders HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>

{ "sku": "tea", "qty": 2 }

HTTP/1.1 201 Created

{ "id": "o-7" }
```
````

- A request (request line, headers, a blank line, a body), then optionally its response (status line, headers, body). Drawn as a method tag and the address (the query split into names and values), headers folded after 6, a JSON body as a tree that folds, the status as a tag (2xx `good`, 3xx `acc`, 4xx `warn`, 5xx `bad`), and **Copy as curl**. A phone stacks each header name over its value; the body scrolls inside its own box.
- **Static:** `static` on the fence draws the whole message: every header, the whole JSON tree, no fold button and no Copy button.
- **LLM view:** as written. **Keys:** `title=`, `static`.
- **Caps:** `httpLines` (600; 300 in UNTRUSTED_LIMITS) lines and `httpChars` (60000; 30000) characters a block, `httpHeaders` (80; 40) headers a message, `httpJsonDepth` (24; 16) levels and `httpJsonNodes` (3000; 1500) nodes of a JSON tree (past either, the body stays text).
- **doccheck:** a body that does not start with a request or status line stays a plain code block (a warning). **Refused:** a header line that is not a header (naming it), a line after the request that is not its response, more headers or lines than the caps, an unknown fence key, a block over the page's work budget, and a real-looking secret in `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` or any header named like a token, secret, key or password (write `<token>`, `${TOKEN}` or `...`).
