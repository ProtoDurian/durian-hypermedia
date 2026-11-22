---
title: "Marks and prefixes"
description: A fixture made from the Format page section of the same name.
marks:
  deprecated:
    label: deprecated
    colour: warn
    means: still works, but will be removed
  experimental:
    label: experimental
    colour: c3
    means: may change without notice
prefixes:
  ">>>":
    label: Python
    colour: c4
    means: a line typed at the Python prompt
---

## Marks and prefixes

Every mark is written as a word in the source. Each part has a built-in list, and a page or a site may add its own (see the last block of this section); doccheck refuses a word that is in neither. The page shows the word as a chip, so there are no letters to learn.

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

**Your own marks and prefixes.** A page may define its own, and a site too (see section 3.1 of the spec): a name, a label and a colour. They show only where a part uses them. The front matter of this page defines two marks and one prompt:



```filetree
app/
  api.ts
  parse.ts  (deprecated)
  next.ts  (experimental)  (new)
```

```terminal
$ python3
>>> print(1 + 1)
2
```

**Code walk:** `focus=17-18` marks the lines the note is about; `mark=29` puts a marker on one line.
