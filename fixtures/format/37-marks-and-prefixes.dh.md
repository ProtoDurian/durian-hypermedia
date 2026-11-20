---
title: "Marks and prefixes"
description: A fixture made from the Format page section of the same name.
---

## Marks and prefixes

Every mark is written as a word in the source, and each part has a fixed list; doccheck refuses any other. The page shows the same word as a chip, so there are no letters to learn.

**File tree:** the mark goes in brackets after the name.

| Written | The page shows | Meaning |
| --- | --- | --- |
| `(new)` | a green "new" chip | the file did not exist before |
| `(changed)` | an orange "changed" chip | the file existed and was edited |
| `(removed)` | a pink "removed" chip, name struck | the file is deleted |
| `(generated)` | a blue "generated" chip | a tool made it; do not edit by hand |
| `(conflict)` | a pink "conflict" chip | two changes disagree here |
| `(closed)` | the folder starts closed | only on a folder |
| `# text` | a note after the name | |
| `...` | a "more files" row | entries left out |

**Editor:** a step's lines are a diff of the file shown.

| Written | Meaning |
| --- | --- |
| `+line` | the line is added (green) |
| `-line` | the line is removed (pink, under "Before") |
| ` line` (a space) | the line is kept, to say where the edit is |
| `@@ <path>` | the edit is in this file |
| `@file <path>` | a made-up file; its lines follow |
| `(open)` | the file shown first |
| an "edited" chip in the tree | the page adds it to a file a step has changed |

**Terminal:** only the start of a line counts.

| Written | Meaning |
| --- | --- |
| `$ ` or `% ` | a command, typed at that prompt |
| `# ` | a command typed as root |
| anything else | output, shown as it is |

**Code walk:** `focus=17-18` marks the lines the note is about; `mark=29` puts a marker on one line.
