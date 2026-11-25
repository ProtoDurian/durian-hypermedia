
A fence in the data's own language, followed by `explore`, becomes a foldable tree with a search box, a copy-path button on every key and a **jq subset** query box. It reads JSON, YAML or CSV (a CSV's rows become objects). `query=` is the starting query. The box runs our own small jq (the "jq subset": paths, pipes, `select`, `map`, `keys`, `length`, `sort_by`, `group_by`, `to_entries`, `test`, string interpolation, building objects and arrays); a query that needs more work than a page may use says so, and a function outside the subset is named, never answered wrongly. It lacks assignment (`|=`), `reduce`, `foreach`, `def`, `paths`, `del`, `sub`, `gsub`, `match` and `walk`.

```json explore title="One order" query=".lines[] | select(.qty > 1)"
{
  "id": "o-7",
  "customer": { "id": "c-12", "name": "Ana", "tags": ["vip", "early"] },
  "lines": [
    { "sku": "tea", "qty": 2, "price": 3.5 },
    { "sku": "cup", "qty": 1, "price": 8 },
    { "sku": "pot", "qty": 3, "price": 12.25 }
  ],
  "paid": true,
  "note": null
}
```

The same reader takes YAML and CSV. TOML exploration is refused until a TOML reader is available; the TOML example below is ordinary code:

```yaml explore title="A service config" query=".limits | map_values(ascii_upcase)"
service: shop
replicas: 3
limits:
  cpu: 500m
  mem: 256Mi
hosts:
  - name: app-1.example.com
    zone: a
  - name: app-2.example.com
    zone: b
```

```toml
[server]
host = "198.51.100.7"
port = 8443
tls = true

[limits]
cpu = "500m"
```

```csv explore title="Latency by region" query="sort_by(.p95) | reverse | .[0].region"
region,p50,p95,requests
us-west,42,120,1200000
eu-central,55,180,830000
ap-south,70,260,410000
```

