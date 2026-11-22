---
title: "Replacing a part for LLMs"
description: A fixture made from the Format page section of the same name.
---

## Replacing a part for LLMs

Any part can be followed by `:::llm`; an LLM reads that text instead of the part.

```filetree
hello-app/
  .scaffold_state.yaml  (new)
  README.md  (generated)
  LICENSE  (generated)
  package.json  (generated)
  src/
    index.ts  (generated)
```

:::llm
`scaffold create` makes the project folder with the state file `.scaffold_state.yaml` and the files the template made.
:::
