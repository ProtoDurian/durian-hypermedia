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
| a chart with too many points; expressions that make huge lists or loop | an error block; the expression language has its own limits (10,000 values, 200,000 steps) | `hostile/11` |
| YAML anchors and aliases (an alias bomb) | front matter ignored with a problem; the part refused | `hostile/12` |
| an unclosed fence or container | one error block, the page shown as text | `hostile/13` |
| an unknown container | an error block | `hostile/14` |
| ids that clobber page globals (`id="location"`) | every id the page makes is prefixed (`dh-`), and `#anchor` links follow | `hostile/15` |
| a host block whose parse throws | an error block with its message | `hostile/16` |
| broken front matter; HTML in a banner | ignored with a problem; banner text is text, an unknown kind becomes `info` | `hostile/17`, `18` |
| a huge page | over `maxInputBytes` (UTF-8): one error block, nothing else is parsed | `test/caps.test.ts` |

`test/hostile.test.tsx` renders each fixture and checks that no `<script>`, `<iframe>`, `<object>`, `<embed>`,
`<foreignObject>` or `<style>` element, no `on*` attribute and no script, data, vbscript or file URL is in the HTML.
`bun run csp` opens every page in headless Chrome under a strict CSP and also checks the live DOM after mermaid, the
charts and the 3D stage have drawn (0 violations, 0 errors, 0 dangerous nodes, 0 `alert()` calls).

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
