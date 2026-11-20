---
title: A host block
description: A block the host registers itself (fy-task), drawn by the host's component, with its own LLM text and check.
---

# A host's own block

The host registered a block named `fy-task`. The package parses it with the host's parse function, shows the host's component, and puts the host's text in the LLM view.

```fy-task
id: T-12
title: Write the adoption guide
state: doing
```

A task with a state the host's check refuses:

```fy-task
id: T-13
title: Ship it
state: maybe
```

## Inline references

The host also registered two inline references: a file, @src/cart/total.ts, and a task, &T-12. The LLM reads them as written; the page draws them with the host's components. An email such as someone@example.com is not a file reference.
