---
title: "Diagram"
description: A fixture made from the Format page section of the same name.
---

## Diagram

A plain `mermaid` code block. LLMs read mermaid well, so it reaches them unchanged.

```mermaid
flowchart LR
  CLI -- "init call" --> TC["template container"]
  TC -- "question reply" --> CLI
```
