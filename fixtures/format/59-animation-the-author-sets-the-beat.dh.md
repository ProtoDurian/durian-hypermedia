---
title: "Animation: the author sets the beat"
description: A fixture made from the Format page section of the same name.
---

## Animation: the author sets the beat

Format version 9 gives the author more say over motion, still with no times or pixels. `then` starts the next beat of a step: what comes after it waits for what came before. `pace slow` or `pace fast` sets a step's speed. `spotlight` dims everything else for one step. `say cache below: …` says where the speech goes. `path=arc` makes a move travel over an arc. Things a step does not change never move.

```animation
family app "the app"
family data "data"
person u "reader"
group app "web app" layout=column is=app
box h "handler" in app is=app
box cache "cache" is=data
cylinder db "database" is=data
group tray "pages ready" layout=row
u -> app
app -> cache
app -> db
@step A reader asks the web app for a page.
send "GET /a" u -> app
@step The app looks in the cache; then the cache answers.
spotlight app cache
send "find /a" app -> cache
then
say cache below: not here
@step So the app reads the database. The pace is slow, so the wait shows.
pace slow
send "read /a" app -> db
@step The handler builds the page; then it moves over to the pages that are ready.
add box page "page /a" in app is=app
then
move page to tray path=arc
```
