---
title: "Animation by a new author: a queue with workers"
description: A fixture made from the Format page section of the same name.
---

## Animation by a new author: a queue with workers

Written from the spec alone by a helper that had not seen the engine; doccheck passed it on the first try.

```animation
box api "API"
queue q "jobs"
group w1 "worker 1" layout=row
group w2 "worker 2" layout=row
api -> q
q -> w1
q -> w2
@step The API adds three jobs to the queue.
push q "job 1" as j1
push q "job 2" as j2
push q "job 3" as j3
@step Worker 1 takes the oldest job from the front.
pop q to w1
@step Worker 2 takes the next job.
pop q to w2
@step Worker 1 finishes job 1, so the job is gone.
remove j1
say w1: done!
@step Worker 1 takes the next job in line.
pop q to w1
@step The API keeps adding work while the workers run.
push q "job 4" as j4
```
