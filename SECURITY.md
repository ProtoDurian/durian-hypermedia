# Security model

The input is untrusted: an agent or a stranger may have written it. `parse()` turns it into plain data and the renderer
draws that data with React, so author text is always a text node or an escaped attribute.

## What parse() does with hostile input

| Attack | What happens | Fixture |
| --- | --- | --- |
| raw HTML (`<script>`, `<iframe>`, `<div onclick>`, `<style>`) | shown as text; never passed through | `hostile/01`, `02` |
| `javascript:` links in disguise (case, entities, tabs, percent, zero-width and soft-hyphen characters) | the scheme is read the way a browser reads it; the link is dropped, its text stays | `hostile/03`, `05` |
| `data:`, `vbscript:`, `file:`, `blob:` links and images; `http:` images | dropped by the default policy; script-like schemes are dropped even if the host policy returns them | `hostile/04` |
| HTML inside a part's text (terminal, file tree, chart, tier list, code walk note, animation label) | text | `hostile/07` |
| mermaid `%%{init}%%` directives, `click` callbacks, HTML labels | directives dropped (with a problem); `securityLevel: "strict"`; no HTML labels; the SVG is cleaned with DOMPurify (no script, no foreignObject, no handlers) and attached as nodes | `hostile/06` |
| nesting deeper than `maxDepth` | that Markdown run is shown as plain text | `hostile/08` |
| an animation with too many things, steps or characters | an error block naming the cap, before anything is compiled | `hostile/09`, `10` |
| a chart with too many points; expressions that make huge lists, nest, recurse or loop | an error block and a problem for that chart; the rest of the page still draws. Every expression is paid for from one budget per page (see [The evaluation budget](#the-evaluation-budget)) | `hostile/11`, `test/budget.test.ts` |
| YAML anchors and aliases (an alias bomb) | front matter ignored with a problem; the part refused | `hostile/12` |
| an unclosed fence or container | one error block, the page shown as text | `hostile/13` |
| an unknown container | an error block | `hostile/14` |
| ids that clobber page globals (`id="location"`) | every id the page makes is prefixed (`dh-`), and `#anchor` links follow | `hostile/15` |
| a host block whose parse throws | an error block with its message | `hostile/16` |
| broken front matter | ignored with a problem; the page still renders (its text in the front matter is never drawn) | `hostile/17` |
| a front matter `banner:` with HTML (removed in format version 10) | nothing is drawn for it; `check()` refuses it | `hostile/18` |
| a huge page | over `maxInputBytes` (UTF-8): one error block, nothing else is parsed | `test/caps.test.ts` |

`test/hostile.test.tsx` renders each fixture and checks that no `<script>`, `<iframe>`, `<object>`, `<embed>`,
`<foreignObject>` or `<style>` element, no `on*` attribute and no script, data, vbscript or file URL is in the HTML.
`bun run csp` opens every page in headless Chrome under a strict CSP and also checks the live DOM after mermaid, the
charts and the 3D stage have drawn (0 violations, 0 errors, 0 dangerous nodes, 0 `alert()` calls).

## The evaluation budget

A chart computes its data from the author's expressions (`let`, `x`, `series`). That work is counted, never timed, so the
same page gives the same result on every machine. Three counters, each charged **before** the work or the memory it
pays for:

- **steps**: one for each token read (and one per 8 characters of expression text), each parse-tree node built or
  evaluated, each list element an operator, `-`, `!`, `if()` or a built-in visits, each definition and name checked;
- **values**: one for each slot of each list made. A list that holds another list counts what that list holds, every
  time it holds it, so `fill` of a list, or a list literal that names one list many times, pays for every copy it stands
  for. A value slot is about 8 to 16 bytes;
- **characters**: one for each character of text made (`+` on text, `text()`, the joined text of a `{...}` hole).

| Cap (`LIMITS` / `parse(text, { limits })`) | One part | The whole page |
| --- | --- | --- |
| steps | `maxEvalSteps`: 100,000 | `maxPageEvalSteps`: 300,000 |
| values | `maxEvalValues`: 50,000 | `maxPageEvalValues`: 150,000 |
| characters | `maxEvalChars`: 50,000 | `maxPageEvalChars`: 150,000 |

What holds:

- **One budget per `parse()` call.** Every chart draws its own part budget from it, and its definitions, `x` and every
  series share that one part budget. A chart over its part cap, or a chart that finds the page budget spent, is an error
  block naming the cap and a problem; the rest of the page still draws. Once the page budget is spent no later chart is
  evaluated at all, so no part can restart the spend.
- **The LLM view** of a chart uses the evaluation the page already paid for; it never evaluates again.
- **`check()`** evaluates each chart at its start values, every slider's ends and every select option, from one page
  budget of its own per call (the same caps).
- **A reader moving a control** evaluates the chart again with a fresh part budget of its own, from `LIMITS` (a host that
  lowers the caps for its readers lowers `LIMITS`); it never draws from or spends the page's budget.
- **What a chart draws** (its `x` and all its series together) holds no more than one part's values and characters,
  counted the same way, YAML anchors and aliases included as what they stand for. So the Document, its JSON and the LLM
  table of a chart stay within those caps.
- **Shape limits**, each an error, never a stack overflow: a list itself holds at most 10,000 values; lists nest at most
  32 deep; one expression's parse tree is at most 200 levels deep; user functions call each other at most 50 deep;
  evaluation nests at most 1,000 levels in all. A chain of definitions of any length is read without recursion.
- `range()` needs finite numbers and a step above 0; `fill()` needs a count that is a number; `text()` digits are a whole
  number from 0 to 100. An error message never prints a long value (text is cut to 60 characters, a list is
  "a list of n").
- Names are only ever the author's own: `constructor`, `__proto__` and the like are unknown names, not the engine's.

What it does not cover: work that grows with the size of the input but runs no expression (reading the YAML, the
Markdown, the parts' own syntax). `maxInputBytes` bounds that. Animations have their own caps (`maxAnim*`).

## The URL policy

```ts
parse(text, { urlPolicy: (url, kind) => string | null })   // kind: "link" | "image"
```

The default allows links to `http:`, `https:`, `mailto:`, relative paths and `#anchors`, and images from `https:` and
relative paths. A remote image is a request to someone else's server when the page opens; a host that shows untrusted
pages to people who should not be tracked returns `null` for remote images, or rewrites them to its own proxy. The
renderer runs the policy again at render time.

## Content-Security-Policy

Nothing in the browser uses `eval`, `new Function` or WebAssembly (checked on the bundles and at run time). The
highlighter (Code Hike's TextMate grammars on WebAssembly) runs on the server in `highlight()`; its colours travel in
the Document. A page works under:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'
```

`style-src 'unsafe-inline'` is needed in two cases (measured with `bun run csp -- --strict-style`):

- **Server-rendered HTML.** React writes `style="..."` attributes (code colours, part sizes, positions) into the HTML:
  4 to 26 blocked per page without it.
- **Mermaid, even when rendered only in the browser.** Its SVG carries a `<style>` element and style attributes
  (76 blocked on the diagram page). Without `'unsafe-inline'` the diagram still draws, but unstyled.

A page rendered only in the browser, without mermaid, works under `style-src 'self'`: React sets styles through the
DOM, which CSP allows (0 violations on every other part).

## Trusted Types

No module under `src/` sets an HTML string: Markdown, code walk notes and tabs are React elements, and the mermaid
part attaches its cleaned SVG as nodes. For a page under `require-trusted-types-for 'script'`:

- `durian-hypermedia/react/strict` reaches neither mermaid nor DOMPurify; its whole import graph (dependencies
  included, React left out) has no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `createContextualFragment`, `document.write` or `srcdoc` (`test/trusted-types.test.ts`).
- `bun run tt` renders every fixture (hostile ones included) in the browser only, through the strict entry, under the
  policy: 0 violations. A control page that puts a plain string into `innerHTML` must be refused, or the check fails.
- Mermaid diagrams go to the host's `Mermaid` slot. The full entry's in-page mermaid uses `innerHTML` inside the
  library and is refused under the policy (`bun scripts/csp-check.ts --trusted-types --full`).

## Reporting

Report a security problem privately to the maintainers (contact to be set when the repo opens), not in a public issue.
