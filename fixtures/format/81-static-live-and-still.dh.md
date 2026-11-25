---
title: "Static: the same parts live and still"
description: The same scene, terminal and file tree twice, live and then static (SPEC 4.1); print draws every part this way.
---

## Static: the same parts live and still

Any part that steps or moves can stand still. `static` on the fence draws the finished state, and `static=2` or `static="<step title>"` draws that step, with no player, no control row and no motion. Printing, a page with `static: true` in its front matter, a host option and the reader's "reduce motion" setting use the same option. The LLM view is the same for both.

### A scene

Live:

```animation layout=graph
person u "reader"
box web "web server"
cylinder db "database"
box log "access log"
@step The reader asks for a page.
u -> web "GET /"
@step The server reads the row it needs.
web -> db "SELECT"
@step The server writes the visit to its log.
web -> log "visit"
```

Static, the finished state:

```animation layout=graph static
person u "reader"
box web "web server"
cylinder db "database"
box log "access log"
@step The reader asks for a page.
u -> web "GET /"
@step The server reads the row it needs.
web -> db "SELECT"
@step The server writes the visit to its log.
web -> log "visit"
```

### A terminal

Live:

```terminal title="setup"
$ bun add durian-markdown
installed durian-markdown
$ bun test
301 pass, 0 fail
```

Static, every command typed:

```terminal title="setup" static
$ bun add durian-markdown
installed durian-markdown
$ bun test
301 pass, 0 fail
```

### A file tree

Live:

```filetree
@step The app starts with one file
app/
  api.ts
@step A parser joins it
app/
  api.ts
  parse.ts  (new)
```

Static, the step named "The app starts with one file":

```filetree static="The app starts with one file"
@step The app starts with one file
app/
  api.ts
@step A parser joins it
app/
  api.ts
  parse.ts  (new)
```
