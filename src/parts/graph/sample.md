A graph is for finding your way around a big network: what uses what, and what breaks if one part goes. Write `group` and `node` lines, then one edge a line (`a -> b`, with a label in quotes if it needs one). A node an edge names and no line declares is added (here the outside libraries). `layout=layers` puts each package above what it uses. **Explore it:** search a package, tap one to focus it and its neighbours (1 or 2 steps out), fold a group into one box, pan and zoom; the list beside the graph shows its links in and out. Its LLM view is the graph itself, as lines.

```graph title="A shop's packages, and what each one uses" layout=layers
group apps "apps" [c1]
group domain "domain" [c2]
group data "data access" [c6]
group core "core" [c3]
node web "web shop" in apps
node admin "admin console" in apps
node worker "background worker" in apps
node cart, checkout, catalog, accounts, orders, search in domain
node db "database" in data
node cache, queue in data
node config, log in core
web -> cart, checkout, search
admin -> catalog, accounts, orders
worker -> orders
cart -> cache, db
checkout -> db, queue
catalog -> db, cache
accounts -> db
orders -> db, queue
search -> cache
queue -> ioredis
cache -> ioredis, config
db -> pg, config, log
```

`layout=force` pulls linked services together and pushes the rest apart, so the clusters show. It fits calls between services, where there is no top or bottom. An id may carry a numbered range: `node db-orders-{1..6} in data` declares six shards, and `orders -> db-orders-{1..6}` draws a line to each. **Fold a group** (beside the graph, or a double tap on its box) and its lines join on one box with a count; **Fold groups** folds them all. A graph over 300 nodes, or one that would be drawn too small to touch in its box (a phone), starts with every group folded. Its LLM view is the nodes by group, the edges as `a -> b` lines, and the most connected nodes: here far over 400 tokens, so a `:::llm` says it in short.

```graph title="Calls between the services of a shop" layout=force size=l
group edge "edge" [c1]
group identity "identity" [c2]
group catalog "catalog" [c3]
group orders "orders" [c4]
group payments "payments" [c5]
group fulfil "fulfilment" [c6]
group data "data stores" [c8]
group platform "platform" [c7]
node cdn, waf, gateway, web-bff, mobile-bff, admin-bff, graphql, rate-limit, bot-check, geo-route, edge-cache, ws-hub, upload-proxy, img-proxy, status-page in edge
node auth, sessions, users, profiles, roles, mfa, sso, tokens, consent, audit, password-reset, email-verify, devices, risk-score, api-keys in identity
node catalog-api, products, variants, inventory, prices, promos, reviews, search-api, indexer, recs, media, categories, brands, bundles, wishlist in catalog
node cart-api, checkout, orders-api, order-events, invoices, returns, refunds, tax, shipping-quote, gift-cards, loyalty, quotes, subscriptions, order-history, fraud in orders
node pay-api, card-vault, psp-a, psp-b, wallets, payouts, ledger, fx, disputes, settlements, pay-events, three-ds, chargebacks, billing, receipts in payments
node fulfil-api, warehouses, picking, packing, carriers, labels, tracking, dispatch, slots, couriers, stock-sync, returns-in, notify, sms, email in fulfil
node db-orders-{1..6}, db-users, db-catalog, cache-{1..3}, search-index, blob-store, event-bus, dw in data
node config-svc, flags, secrets, metrics, logs, traces, scheduler, jobs, alerts, ci, registry, mesh, dns, kms, backups in platform
cdn -> edge-cache, img-proxy, waf
waf -> gateway, bot-check, rate-limit
gateway -> web-bff, mobile-bff, admin-bff, graphql, ws-hub, upload-proxy, geo-route
web-bff -> auth, sessions, catalog-api, cart-api, search-api, recs, checkout
mobile-bff -> auth, sessions, catalog-api, cart-api, search-api, wishlist, checkout
admin-bff -> auth, roles, catalog-api, orders-api, refunds, users, audit
graphql -> catalog-api, orders-api, profiles, reviews
ws-hub -> tracking, order-events, sessions
upload-proxy -> media, blob-store
img-proxy -> media
status-page -> metrics, alerts
auth -> sessions, users, mfa, sso, tokens, risk-score, devices
sessions -> cache-1, tokens
users -> db-users, profiles, email-verify, audit
profiles -> db-users, media, consent
roles -> db-users, audit
mfa -> sms, email, devices
sso -> tokens, users
tokens -> kms, cache-1
password-reset -> email, tokens, users
email-verify -> email
api-keys -> tokens, db-users
risk-score -> devices, fraud
catalog-api -> products, categories, brands, prices, inventory, media, bundles
products -> variants, db-catalog, cache-2
variants -> db-catalog
inventory -> db-catalog, stock-sync, event-bus
prices -> promos, fx, cache-2
promos -> db-catalog
reviews -> db-catalog, users
search-api -> search-index, recs
indexer -> search-index, event-bus, products
recs -> dw, cache-2
wishlist -> db-users, products
cart-api -> products, prices, promos, cache-3, gift-cards
checkout -> cart-api, tax, shipping-quote, pay-api, orders-api, fraud, loyalty
orders-api -> db-orders-{1..6}, order-events, invoices
order-events -> event-bus
invoices -> tax, receipts, blob-store
returns -> orders-api, returns-in, refunds
refunds -> pay-api, ledger
tax -> fx
shipping-quote -> carriers, slots
gift-cards -> ledger
loyalty -> users, ledger
quotes -> prices, tax
subscriptions -> billing, orders-api, scheduler
order-history -> db-orders-{1..6}, dw
fraud -> risk-score, dw
pay-api -> card-vault, psp-a, psp-b, wallets, three-ds, ledger, pay-events
card-vault -> kms, secrets
psp-a, psp-b -> pay-events
wallets -> ledger
payouts -> ledger, psp-a, settlements
ledger -> fx, dw
disputes -> chargebacks, psp-a, psp-b
settlements -> ledger, dw
pay-events -> event-bus
chargebacks -> ledger
billing -> pay-api, receipts
receipts -> email, blob-store
fulfil-api -> warehouses, dispatch, labels, tracking
warehouses -> stock-sync, picking
picking -> packing
packing -> labels
labels -> carriers, blob-store
carriers -> tracking
tracking -> notify, event-bus
dispatch -> couriers, slots, carriers
stock-sync -> inventory, event-bus
returns-in -> warehouses, refunds
notify -> sms, email
event-bus -> fulfil-api, indexer, notify, dw, audit
scheduler -> jobs
jobs -> backups, indexer, payouts, settlements
alerts -> metrics, logs
mesh -> dns, traces, metrics
backups -> blob-store
ci -> registry
config-svc -> flags, secrets
secrets -> kms
gateway, auth, checkout, pay-api, orders-api -> mesh
```

:::llm
A force-laid call graph of a shop: 120 services in 8 groups, 232 calls. Edge (cdn, waf, gateway, three backends for web, mobile and admin, graphql, ws-hub ...) calls identity (auth, sessions, users, tokens, mfa, sso ...) and catalog (catalog-api, products, prices, search-api, recs ...). Checkout calls cart-api, tax, shipping-quote, fraud, loyalty, pay-api and orders-api; orders-api writes six shards, db-orders-1 to db-orders-6. pay-api calls card-vault, two payment providers, wallets, three-ds and the ledger. Events go through event-bus to fulfilment (warehouses, picking, packing, labels, carriers, tracking), the indexer, notify, the warehouse (dw) and audit. Platform: config, flags, secrets, kms, metrics, logs, traces, the mesh, scheduler and jobs. Most connected: orders-api (5 in, 9 out), auth, catalog-api, pay-api, event-bus (6 in, 5 out).
:::

`layout=radial centre=<node>` puts one node in the middle and each ring one step further away, in either direction: what it uses and what uses it. Use it to answer "what touches this?". A small graph needs no `:::llm`: its LLM view is the graph itself, as lines.

```graph title="What touches the sign-in service" layout=radial centre=auth
group callers "calls sign-in" [c1]
group needs "sign-in calls" [c6]
node web, mobile, admin, cli in callers
node sessions, users, mfa, tokens in needs
node auth "sign-in"
web, mobile, admin, cli -> auth
auth -> sessions, users, mfa, tokens
mfa -> sms "codes"
tokens -> kms "signing keys"
sessions, users -> postgres
```

`static` draws the part still: the groups with how many nodes each holds, and a line that counts the edges between two groups. It is for print, a PDF, an email, or a reader who asks for less motion.

```graph title="The same sign-in graph, drawn still" layout=radial centre=auth static
group callers "calls sign-in" [c1]
group needs "sign-in calls" [c6]
node web, mobile, admin, cli in callers
node sessions, users, mfa, tokens in needs
node auth "sign-in"
web, mobile, admin, cli -> auth
auth -> sessions, users, mfa, tokens
mfa -> sms "codes"
tokens -> kms "signing keys"
sessions, users -> postgres
```
