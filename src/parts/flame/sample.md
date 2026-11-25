A traced request and folded profiler stacks. Tap a frame to zoom; search highlights matching frames.

```flame title="One request, traced" unit=ms
0 120 request
  2 14 auth.check
  15 95 handler.order
    16 70 db.query
    72 90 render.page
  96 118 respond.write
```

```flame title="CPU, 30 seconds" unit=samples colour=heat
main;serve;handle;parse 120
main;serve;handle;db.query 300
main;serve;handle;db.query;lock.wait 80
main;serve;handle;render.page 95
main;serve;gc 45
main;serve;accept 30
main;housekeeping;flush 60
```
