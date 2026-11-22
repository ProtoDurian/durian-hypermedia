---
title: Compare, good
---
# Compare

A comparison of three queues, then the same idea with plain words.

```compare title="Which queue?" winner=on pick=Kafka
options: Redis Streams [c1], Kafka [c2], SQS [c3]
Ordering: yes, yes, partial (FIFO queues only)
Runs itself: no, no, yes
Throughput: 3, 5, 3 (score 1-5)
Latency (lower is better): 4 ms, 12 ms, 25 ms
Cost at our size: good, bad, good
```

```compare title="Where to host the docs" view=single
options: Own servers, Static host, Wiki service
Set-up time: a week, an hour, a day
Custom domain: good, good, warn (paid plan only)
```
