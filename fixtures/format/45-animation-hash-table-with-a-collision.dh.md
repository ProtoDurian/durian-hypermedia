---
title: "Animation: hash table with a collision"
description: A fixture made from the Format page section of the same name.
---

## Animation: hash table with a collision

`buckets` makes a hash table's buckets; two keys in one bucket make a chain. `send` moves a token along a path.

```animation
buckets h "hash table" count=5
@step hash("apple") mod 5 is 2, so apple goes in bucket 2.
add pill apple "apple" in h.2
highlight h.2
@step hash("kiwi") mod 5 is 4; bucket 4 is empty.
add pill kiwi "kiwi" in h.4
@step hash("grape") mod 5 is also 2: a collision.
add pill grape "grape" in h.2
highlight apple grape tone=warn
say h.2: two keys, one bucket
@step The bucket keeps a chain. Finding grape starts at bucket 2, which leads to apple.
send "find grape" h.2 -> apple
@step apple is not grape, so the search follows the chain one more link, to grape.
send "find grape" apple -> grape
```
