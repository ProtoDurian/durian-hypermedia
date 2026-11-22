# durian-hypermedia

**Markdown with rich parts, for two readers: a person sees the rich page; an LLM reads the same content without the wrappers.**

Plain Markdown is used wherever it already says the thing. A part with data is a code fence named for the part
(```` ```terminal ````, ```` ```chart ````, ```` ```animation ````); a part that holds prose is a `:::` container
(`:::tabs`, `:::accordion`, `:::human`, `:::llm`). The format is in [SPEC.md](SPEC.md).

This package holds:

| Piece | Import | What it does |
| --- | --- | --- |
| the format | [SPEC.md](SPEC.md) | every part, its syntax and its LLM view |
| the parser | `durian-hypermedia` | `parse(text)` to a typed, safe tree; pure (no DOM, no files, no network) |
| the LLM view | `durian-hypermedia` | `llmView(doc)`: what an LLM reads |
| the checks | `durian-hypermedia` | `check(doc)`: the doccheck rules, as a list |
| colours for code | `durian-hypermedia/server` | `highlight(doc)`, once, on the server |
| the renderer | `durian-hypermedia/react` | React 18 or 19 components; one entry per part |
| the styles | `durian-hypermedia/styles.css` | scoped under `.dh-doc`; themed by CSS custom properties ([THEME.md](THEME.md)) |
| fixtures | `fixtures/` | one page per part and option, plus a hostile set |

Licence: to be decided (see [Licence](#licence)).

## Quick start

```sh
bun add durian-hypermedia react react-dom
```

On the server (Bun or Node):

```ts
import { parse, llmView } from "durian-hypermedia";
import { highlight } from "durian-hypermedia/server";
import { renderToString } from "react-dom/server";
import { DhDocument } from "durian-hypermedia/react";

const doc = await highlight(parse(text));        // untrusted text is fine: see SECURITY.md
const html = renderToString(<DhDocument doc={doc} />);
const forLlm = llmView(doc);
// send html, and the doc as JSON in <script type="application/json" id="dh-doc"> (documentJson(doc) escapes it)
```

In the browser:

```ts
import "durian-hypermedia/styles.css";
import { hydrateDocument, readDocument } from "durian-hypermedia/react/hydrate";

hydrateDocument(document.getElementById("dh-root")!, readDocument("dh-doc")!);
```

`hydrateDocument` hydrates the heavy parts in the order the reader needs them (on screen first, one per task) and puts the
class `js` on `<html>`; a host with its own shell adds that class itself (ADOPT.md section 4).

Or render in the browser only: `renderDocument(el, parse(text))` (code then shows without colours; the colours need
`highlight()`, which runs on WebAssembly and so belongs on the server under a strict CSP).

A smaller bundle: draw only the parts you use.

```tsx
import { DocumentView } from "durian-hypermedia/react/document";
import { TerminalPart } from "durian-hypermedia/react/terminal";
import { ChartPart } from "durian-hypermedia/react/chart";

<DocumentView doc={doc} components={{ terminal: TerminalPart, chart: ChartPart }} />
// a part with no component shows its LLM text, so nothing is lost
```

## What the parser gives you

`parse(text, options)` returns a `Document`: front matter, `blocks` (one typed object per Markdown run or
part), `headings`, `problems` (what it refused or changed) and `llm` (the LLM view). Every block kind has an exported
TypeScript type (`TerminalBlock`, `ChartBlock`, `AnimationBlock` ...). Markdown arrives as a small tree (paragraphs,
lists, tables, links ...), never as HTML. Every animation block also has `texts`, its labels, captions, say and note texts in
story order (also `animationTexts(block)`; SPEC.md section 6.11), for tools that read only the JSON.

| Option | Default | What it does |
| --- | --- | --- |
| `urlPolicy(url, kind)` | http, https, mailto, relative links; https and relative images | every link and image URL passes it; return a URL or `null` |
| `limits` | `LIMITS` | caps on size, blocks, nesting, animation things and steps, chart points, items, and the evaluation budget of one part and of the whole page (SECURITY.md) |
| `idPrefix` | `"dh-"` | before every id the page makes, so a page cannot clobber the host's ids |
| `blocks` | none | the host's own fenced blocks (ADOPT.md) |
| `inlines` | none | the host's own inline references, like `@src/a.ts` (ADOPT.md) |
| `publicView` | `false` | drop `> **Security finding:**` callouts from the LLM view |
| `frontMatter` | `true` | `false`: a leading `---` block is Markdown (a rule and text the reader sees), not front matter |
| `marks` | none | own file tree marks for every page, as the front matter `marks:` writes them (ADOPT.md); a page's own entry wins |
| `prefixes` | none | own terminal prompts for every page, as the front matter `prefixes:` writes them |

## Drawing Markdown your own way

`slots` also take the Markdown elements. Each has no default: leave it out and the renderer draws the element itself.

| Slot | Gets | For |
| --- | --- | --- |
| `Code` | `{ lang, text, meta, hl }` | fenced code blocks: your own colours, a Copy button |
| `InlineCode` | `{ text }` | inline code spans |
| `Link` | `{ href, title, external, children }` | every link the URL policy let through; nothing sets `target` when you draw it |
| `Table` | `{ align, head, rows, headText }` | tables; cells arrive as React children, never HTML |
| `Heading` | `{ depth, level, id, text, children }` | headings; `demoteHeadings={2}` turns `#` into `<h3>` with or without the slot |
| `Mermaid` | `{ src, title, step, active }` | each step of a mermaid diagram, drawn your way (mermaid is then never loaded) |

```tsx
<DhDocument doc={doc} demoteHeadings={2}
  slots={{ Code: MyCode, InlineCode: MyInlineCode, Link: MyLink, Table: MyTable, Mermaid: MyDiagram }} />
```

## Trusted Types

`durian-hypermedia/react/strict` is every part for a page under `require-trusted-types-for 'script'`: it imports
neither mermaid nor DOMPurify (diagrams go to your `Mermaid` slot, or show their source), and no module it reaches sets
an HTML string. `test/trusted-types.test.ts` checks the import graph; `bun run tt` renders every fixture under the
policy in headless Chrome (0 violations).

## Theming

Every colour, radius, shadow, font and duration is a CSS custom property set on `.dh-doc`; [THEME.md](THEME.md) lists
all of them with their light and dark defaults. `variant="flat"` and `variant="bold"` ship as examples of a host style;
`slots` swap the chrome components; `motion="off"` and `prefers-reduced-motion` still everything.

## Develop

```sh
bun install
bun test ./test/            # parser, renderer, hostile input, caps, host blocks
bun run typecheck
bun run example             # every fixture at http://127.0.0.1:4517/, served with a strict CSP
bun run csp                 # opens every example page in headless Chrome and counts CSP violations (needs Chrome)
bun run tt                  # every fixture through the strict entry under require-trusted-types-for 'script' (needs Chrome)
bun run sizes               # bundle size per entry, minified and gzipped
bun run hygiene             # fails on machine paths, emails, tokens, names
bun run build               # dist/ (ESM per entry) and dist/styles.css
```

This package is the source of `src/core/`, `src/ui/` and `SPEC.md`: edit them here. `scripts/sync.ts` copied them from a
private prototype once and is frozen: running it would overwrite this package's files with that older copy.

## Licence

MIT. See [LICENSE](LICENSE).

## Versions

The package follows semver ([CHANGELOG.md](CHANGELOG.md)). The `Document` shape has its own number (`doc.ast`, now 1)
and the format its own (`doc.format`, SPEC.md).
