---
title: "Animation: code, bold and italic in captions"
description: Captions, speech and notes take three marks (SPEC 6.15); words on the stage stay plain.
---

## Animation: code, bold and italic in captions

Captions, `say` and `note=` take three marks: `code`, **bold** and *italic*. Words on the stage stay plain.

```animation layout=graph
person dev "you"
box repo "repo" note="Holds the `contract.yaml` and the **generated** files."
box ci "CI"
@step You run `task gen`; it is **never** done by *hand*.
dev -> repo "task gen"
say dev: I ran `task gen` first
@step CI checks that the **generated** files match.
repo -> ci "push"
@step Click the repo to read its note: it uses `code` and **bold** too.
highlight repo
```
