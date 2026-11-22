**A comparison matrix puts options side by side, one line for each thing you judge them on.** The first line names the options; every other line is a criterion and one value for each option, in the same order. A note in round brackets shows when a reader hovers, focuses or taps the value. With `winner=on` the best value of each yes/no, scored or good/bad row is marked; `pick=` flags the option you recommend.

```compare title="Which queue?" winner=on pick=Kafka
options: Redis Streams [c1], Kafka [c2], SQS [c3]
Ordering: yes, yes, partial (FIFO queues only)
Runs itself: no, no, yes
Throughput: 3, 5, 3 (score 1-5)
Latency (lower is better): 4 ms (in one region), 12 ms, 25 ms
Replay old messages: yes (until trimmed), yes (by offset), no
Cost at our size: good, bad, good (pay per request)
Team knows it: yes, partial (two people), yes
```

With `view=single`, a phone shows one option at a time, chosen from buttons. Here the values are plain words and good, warn and bad, so no row is marked as the best.

```compare title="Where to host the docs" view=single
options: Own servers, Static host, Wiki service
Set-up time: a week, an hour, a day
Custom domain: good, good, warn (paid plan only)
Search: warn (add one), warn (add one), good
Who can edit: developers, developers, anyone with an account
```
