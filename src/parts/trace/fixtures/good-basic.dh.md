# Trace

```trace unit=ms
web root 0 100 id=root
  api lookup 10 80 id=lookup
    db query 20 60 rows=3
@log api 40 warn "cache miss" span=lookup
@service db [c5] "Database"
```
