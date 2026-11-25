---
title: Showcase
description: Several parts on one page, to compare the style variants (soft, flat, bold) and light and dark.
---

> **Note:** One page, three styles. Switch them at the top.

## A terminal

```terminal title="setup"
$ bun add durian-markdown
installed durian-markdown@0.1.0
$ bun test
301 pass, 0 fail
```

> **Tip:** Every part steps with :kbd[Left] and :kbd[Right], or a tap on Next.

## A chart

```chart
kind: bar
title: Bundle size, gzipped
x: { label: entry, values: [parser, terminal, chart, animation] }
y: { label: KB }
series:
  - name: first load
    data: [60, 10, 17, 39]
```

## A tier list

```tierlist title="Which part to reach for"
S: terminal, code walk
A: chart, tier list
B: animation (when time matters)
C: sequence (when the order of calls is the point)
```

## Tabs

:::tabs
### Server

Parse and highlight on the server, render to HTML, hydrate in the browser.

### Browser only

Parse and render in the browser; code shows without colours.
:::

## A code walk

```codewalk
@file src/page.tsx
import { parse } from "durian-markdown";
import { DhDocument } from "durian-markdown/react";

export function Page({ text }: { text: string }) {
  const doc = parse(text);
  return <DhDocument doc={doc} variant="flat" />;
}
@step src/page.tsx#L4-L7 focus=5
Parse the text: the tree is plain data.
@step src/page.tsx#L4-L7 focus=6
Draw it, in the host's style.
```
