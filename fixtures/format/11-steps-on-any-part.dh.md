---
title: "Steps on any part"
description: A fixture made from the Format page section of the same name.
---

## Steps on any part

Steps are not a part of their own: any part becomes step by step when it holds `@step` lines (in mermaid, `%% @step`, a mermaid comment, so the diagram still draws anywhere). Here a diagram builds up one arrow per step.

```mermaid
flowchart LR
  CLI["CLI"]
  TC["template container"]
%% @step The CLI sends an init call with every answer it holds.
  CLI -- "init call: all answers" --> TC
%% @step The script stops at a question and sends it back.
  TC -- "question reply" --> CLI
%% @step The next init call carries one answer more.
  CLI -- "init call: one more answer" --> TC
```
