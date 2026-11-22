---
title: Sequence, good
---
# Sequence

Who calls whom, in order. A call is a solid arrow, a reply a dashed one.

```sequence title="One init call"
actor dev "developer"
participant cli "CLI"
participant tc "template container"
dev -> cli: cyanprint create
cli -> tc: init call, all answers
tc --> cli: question reply
note tc: the script stopped at a question
loop until no question is left
  cli -> tc: init call, one more answer
  tc --> cli: question reply
end
cli --> dev: project written
```

With steps, one call builds up at a time.

```sequence
participant cli "CLI"
participant tc "template container"
@step The CLI sends an init call with every answer it holds.
cli -> tc: init call: all answers
@step The script stops at a question and sends it back.
tc --> cli: question reply
```

One message a step, with every kind of arrow and a block.

```sequence title="Every arrow" steps=each
database db "orders"
queue q "events"
service api "API"
api -> db: read the order
db --> api: the order
api ->> q: order seen
alt the queue is down
  api -x q: lost
else
  api -> api: retry later
end
```
