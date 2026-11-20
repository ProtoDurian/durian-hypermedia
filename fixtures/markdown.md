---
title: Plain Markdown
description: Everything plain Markdown does, as the renderer draws it (no parts).
---

# Plain Markdown

A paragraph with **bold**, *italic*, ~~struck~~ text, `inline code`, a [link to the format](https://example.com/format), an [anchor link](#lists) and a [relative link](./other-page.md).
Keys: :kbd[Ctrl+K, Ctrl+S] and :kbd[Left]. Mouse: :mouse[double-click index.ts]. A code reference: [the service](code:example-repo/src/service.ts#Service).

## Lists

- one
- two
  - two and a half
- three

1. first
2. second

- [x] a done task
- [ ] an open task

## A table

| Part | Written as | An LLM reads |
| :--- | :---: | ---: |
| terminal | a code fence | as it is |
| chart | a code fence with data | its data as a table |

## Code

```ts
export function greet(name: string): string {
  return `Hi ${name}`;
}
```

> A plain quote, with *emphasis*.

> **Tip:** A callout opens with a bold marker.

---

An image from a relative path: ![the logo](./logo.svg "The logo")
