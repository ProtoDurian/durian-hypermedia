---
title: "Animation: replicas and failover"
description: A fixture made from the Format page section of the same name.
---

## Animation: replicas and failover

`set d1 down=yes` takes the primary down; `move d2 to pg` promotes a replica into the primary's place, and the connectors change with it.

```animation
family app "the app"
family db "databases"
family copy "copying"
pill app "app" is=app
group pg "primary" layout=column
cylinder d1 "db-1" in pg is=db
group rg "replicas" layout=column
cylinder d2 "db-2" in rg is=db
cylinder d3 "db-3" in rg is=db
app -> d1 "writes" is=app
d1 --> d2 "copies" is=copy
d1 --> d3 "copies" is=copy
@step The app writes to the primary.
send "write" app -> d1
@step The primary copies the write to both replicas.
send "copy" d1 -> d2 is=copy
send "copy" d1 -> d3 is=copy
@step The primary's machine dies. The app's writes fail.
set d1 down=yes
say d1: no heartbeat
@step db-2 has the newest copy, so it is promoted: it moves to the primary's place, and the app writes to it.
move d2 to pg
remove app -> d1
app -> d2 "writes" is=app
@step The dead one is taken out, and the app writes to the new primary.
remove d1
d2 --> d3 "copies" is=copy
send "write" app -> d2
@step db-3 now copies from the new primary.
send "copy" d2 -> d3 is=copy
```
