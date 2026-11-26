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

- A request (request line, headers, a blank line, a body), then optionally its response (status line, headers, body). Drawn as a method tag and the address (the query split into names and values), the status as a tag (2xx `good`, 3xx `acc`, 4xx `warn`, 5xx `bad`), and under each message its parts as **sections** that open and close: *Headers* and *Body* of the request, *Headers* and *Body* of the response, and *curl*. Each section's button names it and its size (`9` headers, `12 rows`). A short one starts open (up to 6 headers; a body of up to 10 drawn rows, a JSON body counted as its tree), a long one starts closed, and curl starts closed. A JSON body is a tree that folds.
- **Editable in place.** The value of each query parameter and of each request header is a text field that looks like the text it replaces (dotted underline, a focus ring). The shown address and the **curl** follow every keystroke; **Reset edits** puts the author's request back. It is a reading aid: nothing is sent, and the response is never changed. In an edited parameter, space, `&`, `#` and line ends are written as `%20`, `%26`, `%23`, `%0A`; other characters are kept as typed.
- **Copy as curl** copies the request as currently edited, quoted for a shell: every word in single quotes (`'` written `'\''`), `-g` when the address holds `[ ] { }`, `--head` for HEAD, `-X GET` for a GET with a body, `Name;` for an empty header, `--request-target '*'` for `OPTIONS *`, and `--http1.0` or `--http2` when the version says so. `Host` and `Content-Length` are left out (curl writes them). A request with no `Host` and no full address has no curl, so no button. A phone stacks each header name over its value; the body scrolls inside its own box.
- **Static:** `static` on the fence draws the whole message: every header, the whole JSON tree, no section button, no field, no fold button and no Copy button. A printed page opens every section.
- **LLM view:** as written. **Keys:** `title=`, `static`.
- **Caps:** `httpLines` (600; 300 in UNTRUSTED_LIMITS) lines and `httpChars` (60000; 30000) characters a block, `httpHeaders` (80; 40) headers a message, `httpJsonDepth` (24; 16) levels and `httpJsonNodes` (3000; 1500) nodes of a JSON tree (past either, the body stays text).
- **doccheck:** a body that does not start with a request or status line stays a plain code block (a warning). **Refused:** a header line that is not a header (naming it), a line after the request that is not its response, more headers or lines than the caps, an unknown fence key, a block over the page's work budget, and a real-looking secret in `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key` or any header named like a token, secret, key or password (write `<token>`, `${TOKEN}` or `...`).
