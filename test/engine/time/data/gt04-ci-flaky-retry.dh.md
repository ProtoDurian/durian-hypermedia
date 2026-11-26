---
title: CI pipeline with a flaky retry
roles: { job: c1, retry: c3 }
---

# A CI pipeline with a flaky test

One test fails at random. The pipeline retries the test job once, and the second try passes. The whole run takes 4 minutes longer.

```animation
title: Pipeline 4812 | push to main
time: 0..16 | minutes
ticks: 0, 4, 8, 12, 16
row job b "build": +running 0..3 @1
row job t1 "test, try 1": +running 3..7 @2; failed 7..8 [bad] @3
row retry t2 "test, try 2": +running 8..12 @4
row job d "deploy": +running 12..14 @5
@step Build: The build job compiles and packs the app in 3 minutes.
at 3: build done
@step Test: The tests start as soon as the build is done.
@step Flaky: One test times out at 7 minutes. Nothing in the code changed.
at 7: test failed
@step Retry: The pipeline retries the test job once. This time every test passes.
at 12: tests pass
@step Deploy: Deploy runs and the pipeline is green at 14 minutes, 4 minutes late.
span d 0..14: 14 minutes in all
```
