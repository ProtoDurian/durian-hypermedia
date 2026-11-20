---
title: "Editor"
description: A fixture made from the Format page section of the same name.
---

## Editor

A small IDE: the file tree on the left and one file pane. Files come from a repo at the page's pin, or are made up right here with `@file`. Each `@step` is an edit: `+` adds a line, `-` removes one, a space keeps one; `@@ <file>` picks the file.

```editor
@file src/index.ts (open)
import { greet } from './greet';

console.log(greet('hello-app'));
@file src/greet.ts
export function greet(name: string) {
  return 'Hi ' + name;
}
@step Greet with an exclamation mark
@@ src/greet.ts
 export function greet(name: string) {
-  return 'Hi ' + name;
+  return 'Hi ' + name + '!';
 }
@step Pass the license too
@@ src/index.ts
-console.log(greet('hello-app'));
+console.log(greet('hello-app'), 'MIT');
```
