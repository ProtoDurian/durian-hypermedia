---
title: "Terminal"
description: A fixture made from the Format page section of the same name.
---

## Terminal

The shell-session convention every docs site already uses (it is GitHub's and Shiki's `console`/`shellsession`): a line that starts with `$ ` (or `% `, or `# ` for root) is a command, typed at that prompt and highlighted as bash; every other line is output, shown as it is, including a program's own questions and the answers typed into them. Each command is one step. The fence names `console` and `shellsession` give the same part.

```terminal
$ scaffold create acme/hello ./hello-app
? Project name? hello-app
? License? MIT
✔ Created hello-app
$ ls hello-app | grep -v node_modules
README.md
.scaffold_state.yaml
# chown -R app:app hello-app
```
