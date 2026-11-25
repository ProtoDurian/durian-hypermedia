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
`bun run csp` opens every page in headless Chrome under a strict CSP and also checks the live DOM after the
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
- **Data explorer and log queries** (the jq and LogQL subsets and their regular expressions) are charged for every step
  and for every character they read or make, before the work is done, from the part's budget (an author's `query=`) or
  a reader's own budget. A log keeps at most `logLines` lines and a CSV table at most `exploreCsvRows` rows and
  `exploreCsvCols` columns; past them `check()` names the cap.
  A long chain of alternatives is charged for the work it does, and a text tool that cannot make its text is refused as
  a query error.
- **Gantt time zones.** A gantt in a named time zone charges its zone work to its part's budget before the work is
  done. On the measuring machine a page of gantts in named zones, up to 730 KB, parsed in about 0.5 s with
  `UNTRUSTED_LIMITS` (about 0.3 s in UTC); past that the page's work cap stops the rest.

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
| explore and log parts (a page that spends each part's cap), measured for 0.7.0 | 40 ms, 7 ms warm | 52 ms, 9 ms warm |

A reader's query in the explore box or the log filter runs on its own budget (`exploreReaderSteps`, `logReaderSteps`);
the slowest measured for 0.7.0 ended within 25 ms in either set.

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

**Author text in CSS.** The URL policy sees an address as one string, so an address must never be put into CSS (`url("...")`, `image-set`, a custom property) without its own check: one holding `")` could end the string and start a second value the policy never saw. The only place the package puts an address in CSS is a video's thumbnail sprite, which refuses a name holding a quote, parenthesis, backslash, white space or control character and escapes the rest (0.7.0 did not: fixed in 0.8.0). Colour words go into `var(--word)` only when they are plain lower-case words (`cssWord`), at every place the package writes one. A reference's link goes through the host's `urlPolicy` as a `link`, like every other link.

## Media

Media addresses are checked by the host's `image` policy. Download cards use its `link` policy.
Media response bytes are capped while reading; file and cue checks apply before drawing. The host may lower these caps:

| Cap | `LIMITS` | `UNTRUSTED_LIMITS` |
| --- | --- | --- |
| `lottieBytes` | 1048576 | 262144 |
| `pdfBytes` | 20971520 | 8388608 |
| `audioPeaksBytes` | 1000000 | 500000 |
| `audioDecodeBytes` | 20971520 | 10485760 |
| `audioTranscriptBytes` | 1000000 | 256000 |
| `videoVttBytes` | 1000000 | 256000 |
| `videoThumbsBytes` | 1000000 | 256000 |
| `videoTranscriptBytes` | 1000000 | 256000 |

Measured doubling ratios for counted work: response copying 2.15, address policy checks 1.85.
`test/media-fetch.test.ts` and `test/media-loads.test.tsx` check these costs and caps.
Importing the package leaves the host's Lottie globals and timers alone; the Lottie player initializes when drawn
(`test/media-imports.test.ts`). Browser-managed audio and video playback use the browser's streaming loader.
A Lottie file is kept inside its part: what the check refuses is named, and the page outside the part is unchanged
(`test/lottie-host.test.ts`, in a browser under strict Trusted Types).

**A host media loader** (`loadMedia`, ADOPT.md "The host media loader"; 0.8.0) is the one way a `blob:` address, or bytes the author did not name by URL, get into a media part. Who checks what:

- *The host* decides what a claimed address (`media:`, `@path`: the prefixes it lists in `mediaPrefixes`) means, who may read it and what to answer. The package gives the author's text to the loader as it is written (no space or control character, at most 2048 characters). A claimed address is never put in a `src`, `href` or request; it can show as text in a part's error note.
- *The host must not fetch what it did not claim.* The loader is also asked about every other media address, after the `urlPolicy` and the default rules, so that it can answer `{ useDefault: true }`. An address like that is the author's text: a loader that fetches it (through a daemon, with its credentials and network reach) turns a document into server-side requests. A claimed `@path` is the author's text too: the host must confine it (this package does not clean a path).
- *The package* checks every answer. `{ objectUrl }` is accepted only when it is a `blob:` URL; `data:`, `javascript:`, `https:` and everything else is a refusal. `{ bytes }` is copied, then held to the kind's cap (`pdfBytes`, `lottieBytes`, the caption, peaks and transcript caps; 32 MiB, 512 MiB and 64 MiB for an image, video and audio source set on an element) and to one document's total of 256 MiB of loader bytes held at once (kept with the document, so a loader function made on each render does not reset it); the loader is told its cap (`maxBytes`) so it can stop reading. A blob made from bytes is revoked when the part unmounts or its address changes. A `blob:` URL the loader returned for `pdf`, `lottie`, captions, peaks or a transcript is fetched under the same byte cap; for an image, video or audio source the browser streams it and its size is the host's to keep (answer `{ bytes }` to have it checked here, or an `objectUrl` for a large video). A loader that throws, rejects or answers in no known shape is a refusal with a fixed message: its own error text is never shown, a refusal reason is cut to 200 characters with control characters removed. A part far from the screen does not ask, and a video or audio file is asked for on Play, so a long page does not read every file at once.
- *No svg from bytes.* Loader bytes never become an `image/svg+xml` blob: such a blob is a same-origin document, and "open image in new tab" would run its script wherever the page's CSP allows inline script. A host that serves svg answers an `objectUrl` and owns that risk (its CSP should forbid inline script).
- *The parser* never accepts a `blob:` address an author wrote, with or without a loader (`applyUrlPolicy` refuses it; a prefix list cannot name `blob:`, `data:`, `javascript:`, `file:`, `http:` or `https:`). An address that is not claimed passes the host's `urlPolicy` and the default rules before the loader sees it, so a loader cannot be used to reach what the policy refuses unless the host's own loader fetches it.
- *A thumbnail sprite name is CSS input.* A video's thumbnail track (a captions-style file the author writes) names sprite images that are drawn as a CSS `background-image`. The `urlPolicy` sees the name as one string, so one like `s.jpg"), url("/x` would add a second image the policy never checked (a request to anywhere: 0.7.0 had this). A sprite address is now refused when it holds a quote, parenthesis, backslash, white space or control character (after the policy and after the loader), and the CSS `url()` escapes it anyway.
- *Not checked:* what the bytes are. A `pdf` still goes to pdf.js with scripting off, a Lottie file through its structure checks and an image through `<img>`, as for any other source; the loader's bytes get no extra trust.

## Content-Security-Policy

Nothing in the browser uses `eval`, `new Function` or WebAssembly (checked on the bundles and at run time). The
highlighter (Code Hike's TextMate grammars on WebAssembly) runs on the server in `highlight()`; its colours travel in
the Document. A page works under:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'
```

`style-src 'unsafe-inline'` is needed in one case (measured with `bun run csp -- --strict-style`):

- **Server-rendered HTML.** React writes `style="..."` attributes (code colours, part sizes, positions) into the HTML:
  4 to 26 blocked per page without it.

A page rendered only in the browser works under `style-src 'self'`: React sets styles through the
DOM, which CSP allows (0 violations on every other part).

## Trusted Types

No module under `src/` sets an HTML string: Markdown, code walk notes and tabs are React elements. For a page under `require-trusted-types-for 'script'`:

- `durian-markdown/react/strict`: its whole import graph (dependencies
  included, React left out) has no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `createContextualFragment`, `document.write` or `srcdoc` (`test/trusted-types.test.ts`), and never reaches
  `durian-markdown/react/interactive`, the only module that sets a frame's page, under its own policy
  `dh-interactive` (`test/refs-tt.test.ts`).
- `bun run tt` renders every fixture (hostile ones included) in the browser only, through the strict entry, under the
  policy: 0 violations. A control page that puts a plain string into `innerHTML` must be refused, or the check fails.

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
  A host using the default srcdoc path sets `frame-src 'none'` in its page's CSP: a srcdoc frame still loads, and every
  navigation of it is refused before any request (`bun run ix` measures 1 request without it, 0 with it). The fallback is
  Markdown of the page, under the page's URL policy, like every resolved part. The checks refuse code that names the network, storage, cookies, `top`,
  `parent`, `location` or `RTCPeerConnection` before it runs. Not covered: a script that hides those names (the
  checks read words, not meaning); the sandbox and the policy are the barrier. A browser's WebRTC is not governed by
  `default-src`: a host that must rule it out serves the frame from an origin of its own with a
  `Permissions-Policy`.

### Host-served interactive frame (`frameSrc`)

`InteractivePart` can load a fixed host page through its `frameSrc` prop. It accepts only same-origin HTTP(S) URLs
without credentials; it refuses an empty, cross-origin or other-scheme URL before creating a frame. Markdown cannot
set this option. The parent uses `src`, not `srcdoc`, and does not call the `dh-interactive` Trusted Types policy
factory. Its own CSP may keep `script-src 'self'`, `require-trusted-types-for 'script'` and `trusted-types 'none'`.
The external page has its own response CSP rather than inheriting the parent's script restriction.

The host must serve the fixed `interactiveFrame().html`, with `interactiveFrame().csp` as its HTTP CSP header,
`Content-Type: text/html; charset=utf-8`, and no redirect, user data or author content in that response. The returned
policy is `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none';
base-uri 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; sandbox allow-scripts; frame-ancestors 'self'`.
The response-header sandbox forces an opaque origin even for an iframe without a sandbox attribute, and
`frame-ancestors 'self'` blocks cross-origin ancestors. These two directives cannot be delivered by meta CSP: the
HTML repeats only the remaining restrictions. The bootstrap refuses to start unless `window.origin === "null"`;
every incoming message must have both `event.source === window.parent` and `event.origin === location.origin`
(the HTTP shell URL's origin). Thus an arbitrary cross-site framer cannot initialize the shell at the host origin,
even when the iframe attribute is missing; the origin check still refuses it if the ancestor directive is omitted.
The header itself is mandatory, not replaced by these checks. In particular, the
host must not broaden network access. The shell's own policy must allow its inline bootstrap and author script,
and must not require Trusted Types for its DOMParser/script installation. The parent need not allow either.
The initial shell request is ordinary HTTP and may carry ambient cookies; the sandbox prevents script access to
cookies and storage, not server access to credentials. Never serve account data from this route.
Exclude this route from global app CSP/Trusted Types and frame-header middleware; send `X-Content-Type-Options:
nosniff` and `Cache-Control: no-store` as well as the response CSP. Keep the same fixed response for query strings
and cookies, with no login redirect or state-changing action (ADOPT.md).

The parent still sets exactly `sandbox="allow-scripts"`, no `allow-same-origin`, with `referrerpolicy="no-referrer"`
and an empty `allow`. On `{ dhReady: true }` from `frame.contentWindow`, it sends the checked content, mode and theme
once. The shell accepts initialization only from the same-origin `window.parent` and only once; it also caps the combined HTML,
CSS and script at 204,800 UTF-8 bytes. The parser's original section checks, code checks, page budget and host byte
cap run before component dispatch; the shell does not repeat that code checker. `"static"` sends no author script,
but runs the shell bootstrap to draw the markup and report height. Before installing static markup, the shell adds
a second meta CSP, `script-src 'none'`, to block author scripts and inline handlers; its already admitted bootstrap
continues handling theme and height. An inline script probe checks this restriction before installing markup;
if that script executes, static initialization is refused, no content or height is installed, and the parent stops
at the 5 second deadline. This static path is **Chromium-measured**, not a cross-browser guarantee: unlike srcdoc
static's `sandbox=""`, it admits the shell bootstrap, and other engines require host validation. The parent accepts ready or a finite height
with no extra fields, verifies `event.source === frame.contentWindow` on every reply, clamps heights to 80–1200 px,
and accepts no action, link, fetch or storage command. Both `"on"` and host-frame `"static"` require a height within
5 seconds (ready is insufficient), stop at 10 minutes and are removed on a second load. `"off"` makes no shell request.
Messages use target origin `"*"` because the sandboxed frame has an opaque origin. Theme updates carry only the
listed CSS tokens and dark flag. Hosts that replace the component take responsibility for these rules themselves.
Every other message listener on the host page must also validate `event.source` against its own expected sender:
author code can post arbitrary messages to the parent; shape checks alone cannot authenticate this frame.

The parent's `frame-src` **must list the exact same-origin shell URL**, not the whole origin (`'self'`). This means it
cannot use `'none'` to rule out all self-navigation as it can for srcdoc. Under a deliberately broad `'self'` test
policy, the **measured residual is 1 request** to a same-origin destination that completes a second load, with
0 beacon requests, in
`bun scripts/interactive-check.ts --frame-src`. This is a measurement, not a universal one-request ceiling: redirects
or navigations before a load event can make further requests. A 204/205 response or a navigation that never finishes
fires no second load: with broad `'self'`, author code can loop credentialed same-origin GETs until the 10 minute
deadline. The exact-path test runs the shell and measures **0 requests** to an off-route destination. Even that
policy does not match query strings: self-navigation to the allowed shell URL with `?data=...` can put data in
server/proxy logs. Allowed shell routes must be fixed, secret-free and have no state-changing behavior; hosts must
account for that query channel. The frame's own `connect-src 'none'` does not prevent its self-navigation. The same check measures script access to
storage, cookies, the parent, fetch, XHR, WebSocket, beacon and indexedDB as refused, with 0 parent CSP/Trusted Types
violations. Obfuscated code is still possible; the word checks are not the sandbox. WebRTC remains a residual
outside CSP network directives as described above. The default srcdoc page is unchanged.

## Reporting

Report a security problem privately to the maintainers (contact to be set when the repo opens), not in a public issue.
