---
title: Graph fixture
---

# Package dependencies

```graph title="A small layered graph" layout=layers
group core "core" [c1]
node parse "parser" in core
node check "doccheck" in core
node react "react renderer" [c2]
check -> parse
react -> parse
react -> chart.js "lazy"
```

```graph title="Services and their shards" layout=force
group api "api" [c3]
group data "data" [c6]
node api-{1..4} in api
node db-{1..3} in data
web -> api-{1..4}
api-{1..4} -> db-{1..3}
```

```graph title="What touches the sign-in" layout=radial centre=auth
node auth "sign-in"
web, mobile -> auth
auth -> sessions, users
```

```graph title="The same, drawn still" layout=radial centre=auth static
node auth "sign-in"
web, mobile -> auth
auth -> sessions, users
```
