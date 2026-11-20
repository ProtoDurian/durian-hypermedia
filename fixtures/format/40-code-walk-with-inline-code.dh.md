---
title: "Code walk with inline code"
description: A fixture made from the Format page section of the same name.
---

## Code walk with inline code

A code walk takes code written right here too, with the editor's syntax: before the first `@step`, `@file <path>` makes a file up and its lines follow. A step then names that path; its range may be left out (the whole file). The editor reads repo files the same way the code walk does, so both parts take either.

```codewalk
@file src/greet.ts
export function greet(name: string) {
  const clean = name.trim();
  return 'Hi ' + clean + '!';
}
@step src/greet.ts focus=2
Trim the name first.
@step src/greet.ts#L3 focus=3
Then build the greeting.
```
