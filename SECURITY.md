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
| Markdown written to make a parser search again and again (long runs of openers that never close) | read in time linear in its length (see [Work that is not an expression](#work-that-is-not-an-expression)) | `test/markdown-work.test.ts` |
| YAML with very many keys or values (every node costs a parser time; one map's keys cost some parsers the square of their number) | front matter ignored with a problem, a chart an error block, before any parser runs | `test/yaml-size.test.ts` |
| an animation whose layout needs too much work (many things, lines and steps) | an error block naming the cap; past the page's cap the later animations too | `test/anim-budget.test.ts` |
| an animation with too many things, steps or characters | an error block naming the cap, before anything is compiled | `hostile/09`, `10` |
| a chart with too many points; expressions that make huge lists, nest, recurse or loop | an error block and a problem for that chart; the rest of the page still draws. Every expression is paid for from one budget per page (see [The evaluation budget](#the-evaluation-budget)) | `hostile/11`, `test/budget.test.ts` |
| YAML anchors and aliases (an alias bomb), whatever the anchors are named | at most 16 aliases and, next to an alias, no merge key, tag or directive, checked before parsing; the parsed value sized against its text, extras charged to the page (see [The evaluation budget](#the-evaluation-budget)): front matter ignored with a problem; the part refused | `hostile/12`, `test/budget-paths.test.ts` |
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

- **steps**: one for each token read (and one per 8 characters of expression text and of a definition's key), each
  parse-tree node built or evaluated, each list element an operator, `-`, `!`, `if()` or a built-in visits, each
  definition and name checked, four for each call of the author's own function, one per 32 characters two texts
  compare with `==` or `!=`, and one per 8 slots of YAML data sized;
- **values**: one for each slot of each list made. A list that holds another list counts what that list holds, every
  time it holds it, so `fill` of a list, or a list literal that names one list many times, pays for every copy it stands
  for. A value slot is about 8 to 16 bytes;
- **characters**: one for each character of text made (`+` on text, `text()`, the joined text of a `{...}` hole).

| Cap (`LIMITS` / `parse(text, { limits })`) | One part | The whole page |
| --- | --- | --- |
| steps | `maxEvalSteps`: 100,000 | `maxPageEvalSteps`: 300,000 |
| values | `maxEvalValues`: 50,000 | `maxPageEvalValues`: 400,000 |
| characters | `maxEvalChars`: 50,000 | `maxPageEvalChars`: 400,000 |

What holds:

- **One budget per `parse()` call.** Every chart draws its own part budget from it, and its definitions, `x` and every
  series share that one part budget. A chart over its part cap, or a chart that finds the page budget spent, is an error
  block naming the cap and a problem; the rest of the page still draws. Once the page budget is spent no later chart is
  evaluated at all, so no part can restart the spend. A page of 20 ordinary computed charts (about 1,000 points each)
  fits with room.
- **The LLM view** of a chart uses the evaluation the page already paid for; it never evaluates again.
- **`check()`** evaluates each chart at its start values, every slider's ends and every select option, from one budget
  of its own per call, eight times the page's. When that budget is spent the rest is a warning ("not every control value
  was checked"), not an error on the chart. A chart over its own part cap at one of those values is an error.
- **A reader moving a control** evaluates the chart again with a fresh part budget of its own, from `LIMITS` (a host that
  lowers the caps for its readers lowers `LIMITS`); it never draws from or spends the page's budget.
- **Everything a chart returns** (its `vars`, `x`, every series with its name, tone and kind), counted as it is written
  out (a shared list or a text each time it is held), holds no more than its YAML text's length plus one part's values
  and characters. What it holds beyond its text and beyond what its part already paid for (one list named many times)
  is charged to the part, so to the page.
- **YAML anchors and aliases** (front matter and charts, with Bun's parser or one given to `setYamlParser`), whatever the
  anchors are named:
  - before any parser runs, from the text: at most `maxYamlAliases` (16) aliases. An alias is counted wherever it is
    written (parsers disagree about where a node starts), but only when an anchor (`&`) whose name starts the same way
    is somewhere in the text, so Markdown such as `**bold**` in a value is not taken for one. In a text that has an
    alias, a merge key (`<<`, in any spelling), a tag (a `!` not right after a letter or digit) and a directive (`%` as the
    first non-blank character of a line, after any indentation) are refused: write the keys out, or drop the tag.
    (A parser copies merged maps, so that work would come before anything could size it, and a tag or a directive can
    spell a merge without `<<`.) Without an alias, tags and merges of maps written in place are read as before.
  - after parsing, before anything reads, keeps or writes the value: counted as it is read (an alias counts what it
    stands for, a string each time it is held), it may pass its text's length by at most one part's caps (`maxEvalValues`
    slots, `maxEvalChars` characters). It may not nest more than 64 levels or hold itself.
  - what it adds beyond its text is charged to the page's budget, once for the front matter and once per part, so
    aliases across many parts share one page allowance.
  - over any of these, front matter is ignored with a problem and a chart is an error block. A few short aliases work
    as before. The caps given to `parse(text, { limits })` apply.
  - use a host parser that resolves an alias to the same object, as Bun's does. A parser that copies aliased values
    builds them before this check can run: within the 16 aliases that can be about 256 times its text.
  - the host parser's own work on plain YAML (no aliases) is not bounded here; `maxInputBytes` is the only cap on it.
- **Names and messages**: a name (and a control's name) has at most 64 characters, a definition key at most 256, a function at most 16
  parameters; a chart reports at most 10 definition errors (the rest are counted) and a message of at most 2,000
  characters; a chart has at most 100 controls and a select at most 1,000 options. An error message never prints a long
  value (text is cut to 60 characters, a list is "a list of n"). Keys are read in one pass, with no regular expression.
- **Shape limits**, each an error, never a stack overflow: a list itself holds at most 10,000 values; lists nest at most
  32 deep; one expression's parse tree is at most 200 levels deep; user functions call each other at most 50 deep;
  evaluation nests at most 1,000 levels in all. A chain of definitions of any length is read without recursion.
- `range()` needs finite numbers and a step above 0; `fill()` needs a count that is a number; `text()` digits are a whole
  number from 0 to 100.
- Names are only ever the author's own: `constructor`, `__proto__` and the like are unknown names, not the engine's.

The budget covers chart expressions and the YAML of charts and front matter. Other work is the next section.

## Work that is not an expression

**`parse()` time and memory grow linearly with the input**, for plain Markdown and for every part. Reading the page's
text (the Markdown, the parts' own syntax, the YAML), making the LLM view, `check()` and drawing the page the first time
take time linear in the length of the text, so `maxInputBytes` bounds them, except where a cap below says otherwise.
Four things keep it so: `test/linear.test.ts` (8 times the text may take at most 20 times as long, for typical replies,
constructs grown in place, short pieces repeated and each part; text that is quadratic takes 40 to 64 times),
`test/unit-fuzz.test.ts` (the same for seeded random short pieces of Markdown and of the parts' syntax, repeated, in
`parse()`, `llmView()` and `check()`), `bun run bench` (time, peak memory and held memory per KB of 1, 10 and 100 KB
replies, against budgets), and the CI workflow that runs them.

- **Markdown** is read by markdown-it (vendored in `src/vendor/`), which reads CommonMark in linear time. The rules this
  package adds (GFM tables, strikethrough, task items, autolink literals, `:kbd[]`, `:mouse[]`, a host's inline
  references) each read forward once and never scan the same text again from a later place (an autolink's domain and
  the rest of its run are read once for every start inside them). Inside a link's text the
  reader looks ahead at most 20 levels deep, so its constant stays small. A host's own inline pattern is run once over
  each text run; its speed is the host's (keep it simple).
- **Nesting**: a line that opens more than `maxDepth` quotes, or twice that many quotes and list markers, is shown as
  plain text before the reader sees it; past `maxDepth` levels in the tree the rest is plain text. No character is
  dropped either way.
- **The LLM view** rewrites keys, mouse actions, code spans and links to other pages in one pass each.
- **A code block** is drawn with one text token per line (Code Hike splits a many-line token once per line), and
  neighbouring one-line marks are handed to it as one annotation (at most 8 layers of the same mark on a line).
- **The parts' own syntax** (fences, containers, steps, file tree rows, `@file` lines, terminal prompts, tab headings,
  tier lists, alignment grids, code references in `check()`) is read in one pass, with no pattern that can backtrack.
  Past real pages, a few outputs have caps: a part's steps carry at most 1,000,000 characters of text (2,000,000 for the
  page), an alignment grid at most 400 cells and 400 regions, the tables of contents of a page at most 2,000 headings
  (each takes its headings as one slice, so its work is what it lists); past them the part is an error block and its
  source is shown as plain code (nothing is lost).
- **YAML** (front matter, each chart), before any parser runs, from the text: at most `maxYamlChars` characters and
  `maxYamlNodes` nodes in one text, and `maxPageYamlChars` and `maxPageYamlNodes` over all of a `parse()` call's YAML
  (`check()` gets three times the page's, as it reads the texts again); the values are in the table below.
  The node count is an upper bound for any parser, from the text as written: every `:`, `?`, `,`, `-`, `!`, `[`, `{`
  and line (quoted or not). A parser builds at most that many keys and about twice that many nodes, and its work grows
  with them: every node costs some microseconds, and the yaml package (2.x), which a host outside Bun may give to
  `setYamlParser`, compares each new key of a map with the keys before it. A chart with more data written out than
  the caps is an error block: compute the data, or raise the caps.
- **Animations** count their layout work (placing things, routing lines, wrapping labels, every step) as it is done,
  in units: at most `maxAnimWork` (15,000,000) for one animation and `maxPageAnimWork` (64,000,000) for all of a page's;
  a unit is some tens of nanoseconds. Over a cap the animation is an error block naming it (past the page's cap, every
  later animation too) and the rest of the page draws. Each animation is compiled once per `parse()`; the renderer's
  phone and narrow layouts draw from a budget of twice `LIMITS.maxAnimWork`.

**Two sets of caps.** `LIMITS` (the default) is for authored pages: the largest real pages measured need about half of
its YAML and animation caps. `UNTRUSTED_LIMITS` is for text nobody reviewed (a chat reply, a streamed message): the same
caps with these smaller:

| Cap | `LIMITS` | `UNTRUSTED_LIMITS` |
| --- | --- | --- |
| `maxYamlNodes` / `maxYamlChars` (one text) | 3,000 / 32,000 | 1,000 / 32,000 |
| `maxPageYamlNodes` / `maxPageYamlChars` | 24,000 / 200,000 | 4,000 / 64,000 |
| `maxAnimWork` / `maxPageAnimWork` | 15,000,000 / 64,000,000 | 3,000,000 / 6,000,000 |
| `maxReferences` / `maxReferenceBytes` / `maxSvgBytes` (format version 11) | 500 / 1,000,000 / 200,000 | 100 / 400,000 / 100,000 |

The reference caps are smaller on purpose: a chat reply rarely needs more than a few references, and each one is a call to the host and a part to read. `test/limits-presets.test.ts` lists every cap that may differ between the two sets; every other cap must be equal.

The slowest pages measured within each set, on the machine that made 0.6.2 while it was busy (the slowest first parse in a new
process, and the slowest best warm parse):

| Slowest page | `LIMITS` | `UNTRUSTED_LIMITS` |
| --- | --- | --- |
| YAML, with the yaml package 2.9.0 | 573 ms, 442 ms warm | 105 ms, 42 ms warm |
| YAML, with a bounded reader | 309 ms, 167 ms warm | 96 ms, 27 ms warm |
| animations (a page that spends the page cap) | 2.2 s, 1.8 s warm | 0.51 s, 0.48 s warm |

A host may lower any cap further: `parse(text, { limits: { ...UNTRUSTED_LIMITS, maxPageAnimWork: 2_000_000 } })`.

`test/markdown-work.test.ts` counts the reader's work (rule calls and the characters its link helpers read) on seeded
random text made of Markdown's punctuation, a few hundred families of it, and checks that 4 times the text is about 4
times the work. Measured on the machine that built 0.6.2, while it was busy with other work: no Markdown input up to
300 KB took more than about half a second to parse, and no Markdown input up to 16 KB more than about 21 ms warm (up to
about 100 ms on a first, cold parse in a new process).

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
  `createContextualFragment`, `document.write` or `srcdoc` (`test/trusted-types.test.ts`), and never reaches
  `durian-hypermedia/react/interactive`, the only module that sets a frame's page, under its own policy
  `dh-interactive` (`test/refs-tt.test.ts`).
- `bun run tt` renders every fixture (hostile ones included) in the browser only, through the strict entry, under the
  policy: 0 violations. A control page that puts a plain string into `innerHTML` must be refused, or the check fails.
- Mermaid diagrams go to the host's `Mermaid` slot. The full entry's in-page mermaid uses `innerHTML` inside the
  library and is refused under the policy (`bun scripts/csp-check.ts --trusted-types --full`).

## References (format version 11)

- **Nothing is fetched.** A reference `[[type:name "label"]]` names a part the host keeps; the host's
  `resolveReference` answers it. A name is letters, digits, `.`, `-` and `_`, at most 128: a path, a scheme or a
  URL is refused with the reason, so a name can never become an address.
- **One pass.** The reader looks at each `[[` once and reads forward no further than the line, the next `[[` or a
  fixed window (`test/refs.test.ts` counts the reader's work at n and 2n). Every reference charges one step to the
  page budget's "reference reader"; `maxReferences` caps a page (500, or 100 in `UNTRUSTED_LIMITS`).
- **The same caps as inline.** A ready part goes through the same part reader as an inline one, with the page's
  budgets; all of a page's resolved parts together are capped by `maxReferenceBytes`. A reference inside a part that a
  reference resolved to is refused, so a host's store cannot make a chain or a loop.
- **svg** is drawn only through an `<img>` (a `data:` address): script and event handlers in it never run, and the
  browser loads nothing it names. A DOCTYPE or ENTITY is refused.
- **interactive** runs only when the host turns it on, in `<iframe sandbox="allow-scripts">` with no
  `allow-same-origin` (an empty origin: no cookies, no storage, no access to the page), under
  `default-src 'none'` (no fetch, XHR, WebSocket, images from elsewhere or fonts), with no forms, pop-ups or top
  navigation. The page accepts only a height from it; it must answer within 5 s, it stops after 10 minutes, and it is
  stopped if it loads a second page. **A frame may still navigate itself once** (a sandbox cannot forbid it, and the
  frame's own `default-src 'none'` does not cover navigation): that one request leaves before the frame is stopped.
  A host that turns the part on sets `frame-src 'none'` in its page's CSP: a srcdoc frame still loads, and every
  navigation of it is refused before any request (`bun run ix` measures 1 request without it, 0 with it). The fallback is
  Markdown of the page, under the page's URL policy, like every resolved part. The checks refuse code that names the network, storage, cookies, `top`,
  `parent`, `location` or `RTCPeerConnection` before it runs. Not covered: a script that hides those names (the
  checks read words, not meaning); the sandbox and the policy are the barrier. A browser's WebRTC is not governed by
  `default-src`: a host that must rule it out serves the frame from an origin of its own with a
  `Permissions-Policy`.

## Reporting

Report a security problem privately to the maintainers (contact to be set when the repo opens), not in a public issue.
