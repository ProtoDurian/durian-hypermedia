---
title: "File tree with steps"
description: A fixture made from the Format page section of the same name.
---

## File tree with steps

```filetree
@step After scaffold create
hello-app/
  .scaffold_state.yaml  (new)  # answers, kept for update
  README.md  (generated)
@step After the user edits it
hello-app/
  .scaffold_state.yaml
  README.md  (changed)  # the user's own edit
  LICENSE  (new)
  old-notes.txt  (removed)
```
