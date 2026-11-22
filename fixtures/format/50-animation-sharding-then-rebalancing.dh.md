---
title: "Animation: sharding, then rebalancing"
description: A fixture made from the Format page section of the same name.
---

## Animation: sharding, then rebalancing

Shards are containers holding key ranges; `move` puts a range in another shard, and its connectors follow.

```animation
pill router "router"
group s1 "shard 1" layout=column
group s2 "shard 2" layout=column
pill k1 "users 1–100" in s1
pill k2 "users 101–200" in s1
pill k3 "users 201–300" in s2
pill k4 "users 301–400" in s2
router -> s1
router -> s2
note router: maps each key range to a shard
@step The router sends each request to the shard that holds the user's key range.
send "user 250" router -> s2
@step Shard 2 is getting full. A third shard joins, empty.
add group s3 "shard 3" layout=column
router -> s3
set s2 tone=warn
@step Rebalance: the range 301–400 moves to shard 3.
move k4 to s3
set s2 tone=plain
@step The router's map changes with it: user 350 now goes to shard 3.
send "user 350" router -> s3
```
