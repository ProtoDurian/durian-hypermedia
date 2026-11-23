---
title: "Steps on any part"
description: A fixture made from the Format page section of the same name.
---

## Steps on any part

Steps are not a part of their own: any part becomes step by step when it holds `@step` lines. Here a sequence builds up one call a step.

```sequence
participant cli "CLI"
participant tc "template container"
@step The CLI sends an init call with every answer it holds.
cli -> tc: init call: all answers
@step The script stops at a question and sends it back.
tc --> cli: question reply
@step The next init call carries one answer more.
cli -> tc: init call: one more answer
```
