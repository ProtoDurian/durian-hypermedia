# Flame

```flame unit=ms
0 120 request
  2 14 auth.check
  15 95 handler.order
    16 70 db.query
```

```flame unit=samples colour=heat
main;serve;parse 120
main;serve;db.query 300
main;gc 45
```
