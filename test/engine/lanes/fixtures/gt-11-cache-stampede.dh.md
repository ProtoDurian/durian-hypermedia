---
title: A cache stampede
roles: { client: c1, app: c2, cache: c3, db: c4 }
---

# A cache stampede

When a popular cache entry expires, every request misses at the same moment and they all hit the database at once. A lock lets one request rebuild the entry while the others wait.

```animation
title: The home page feed | 6 requests in the same 10 ms
## Requests
client r1..r6: request 1; request 2; request 3; request 4; request 5; request 6
## App
app a: app server | builds the feed
## Cache
cache k: cache | key home:feed
## Database
db d: database | the feed query takes 2 s
@step Hit: Normally every request finds the feed in the cache.
r1,r2,r3,r4,r5,r6 -> a
a -> k: get home:feed
k -> a (cache): hit
tag k: fresh
@step Expire: The entry's 60 second lifetime ends. The next requests all miss at once.
tone k warn
tag k: expired
k -> a (cache): miss x6
@step Stampede: Each of the 6 misses runs the same slow query. The database is overloaded.
a -> d: same query x6
tone d bad
say d: 6 copies of one query, CPU at 100%
@step Lock: The fix: the first miss takes a lock and runs the query. The other 5 wait for its result.
tone d off
a -> k: lock home:feed
a -> d: one query
say a: 5 requests wait
@step Refill: The one query fills the cache. The waiting requests read the new entry.
d -> a (db): feed
a -> k: set home:feed, 60 s
tone k good
tag k: fresh
```
