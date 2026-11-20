# Changelog

This package follows [semantic versioning](https://semver.org). Before 1.0.0 a minor version may change the API;
every such change is listed here. The `Document` shape has its own number (`doc.ast`) and the format its own
(`doc.format`, SPEC.md).

## 0.5.0

Format version 9 (SPEC.md section 11): more control over animation for the author, and fixes to how scenes move.
`FORMAT_VERSION` is 9; `Document.format` says 9.

### Added (animation words; SPEC.md 6.5, one example each)

- **Beats:** a line `then` in a step starts the next beat; what comes after it waits for what came before. A thing
  added in one beat can move in the next. At most 6 beats. `Compiled.beats[k]` holds the frames at the end of each
  beat but the last; `Fx.beats`, `Fx.sendBeat`, `Fx.sayBeat`.
- **Pace:** `pace slow` / `pace fast` in a step, ```` ```animation pace=slow ```` for a whole scene.
- **Emphasis and placement:** `spotlight <id> ...` dims everything else for one step; `say <id> above: text` (below,
  left, right); `move <id> to <c> path=arc`.
- **Camera:** `camera <id> close` / `far`, `turn=front|left|right|back`, `tilt=low|mid|high|top` (3D; 2D uses close and
  far). The camera glides between steps; it is clamped above the planes and outside blocks, never refused for that.
- **Tokens:** a token can wait in a container (`token t "x" in q`, `move t into q`); `split msg into 4 "seg"` and
  `merge msg`; several ids in one move are one hop (`move a b c to x`); `drop <token> [at <thing>]`;
  `send ... as <id>` keeps the sent token; `pop q to x` takes a token from a queue.
- **Insides:** `closed=yes` on a container draws its inside faint and without words; `zoom into <id>` flies in and
  opens it, `zoom out` closes it (a semantic zoom: nothing around it moves).
- **LLM view:** what tokens do is listed under each caption (`msg splits into: seg 1, ...`, `ha -> q: seg 4, dropped
  there (lost)`, `zoom into r`); a closed thing says `closed` in the setup line. Scenes that move tokens now show those
  moves in their LLM view.
- **Checks:** `src/core/still9.ts` `stillCheck(compiled)` lists things that move although their step did not change
  them. doccheck refuses the new words used wrongly, each with the fix (SPEC.md 6.7).

### Changed (how scenes are drawn; SPEC.md 6.8)

- **Things a step does not change stay still.** In a group, a grid, a graph and the stage, a thing that leaves keeps
  its place empty; two things never there together share one place. Layouts change for every scene where something
  came or went (positions of untouched things no longer close up). Data structures and trees still close up.
- **Lines have room:** at least 32 units of line; things a line joins are laid out 38 apart (was the size's gap, 18
  for size m), lists and buckets 38. Scenes with joined neighbours get wider.
- **The laptop view never cuts a thing in half** at the stage's edge.
- **One-line hint:** the line under the stage is one line (short on a phone) with a `?` button for the whole text.
  New UI strings: `hintShort`, `hintShortOn`, `hintShort3d`, `hintShortOn3d`, `howTo` (6 languages).
- **3D:** the camera stays above every shown plane and layers in the way fade; a scene with no declared layers stands
  on one floor in 3D (its contents no longer hang under their container); a lit container lifts its contents; a
  moving token's label keeps its offset while it moves (no jumps or flicker); 3D names take their spots in order and
  fade to a ghost when there is no room.

### Fixed

- The fence's `fill=` was never passed to the scene (it is now, with `pace=`).
- A token's `split` and `merge` put the pieces into the stage's own row.

## 0.4.0

### Changed

- **Changed: anchors follow GitHub's slug rule.** A heading's id (`doc.headings[].id`, the `id` of a Markdown `h`
  block, the table of contents' links, the `id` and the `#` link in the rendered HTML, the `Heading` slot's `id`) is now
  what github.com gives the heading (`github-slugger` 2.0.0, SPEC.md section 1): lower case, punctuation dropped, each
  space becomes `-`, unicode letters kept. Before, any run of non-letters became one `-`, the slug was cut at 80
  characters, and a repeat got `-2`, `-2-2`. **Rendered anchors that change** (the old one stops working):
  - A heading with punctuation inside a word: `cyan.yaml` is `#dh-cyanyaml` (was `#dh-cyan-yaml`); `A host's own block`
    is `#dh-a-hosts-own-block` (was `#dh-a-host-s-own-block`); `v1.2` is `v12` (was `v1-2`).
  - A heading with punctuation and a space: `Case: big file` is `case-big-file` (same as before), but `C++ / C#` is
    `c--c` (was `c-c`), and a run of spaces is a run of dashes.
  - A repeated heading: `x`, `x-1`, `x-2` (was `x`, `x-2`, `x-2-2`). The numbering counts every heading of any level, and
    a tab or accordion title (it has no id) counts too, as on GitHub.
  - A heading over 80 characters is no longer cut.
  - Anchors that do not change: a heading of plain words (`Why this way` is `why-this-way`), the `dh-` prefix, a
    unicode heading without punctuation.
  - The text read: an image in a heading adds nothing to the id (its alt is still the shown text); raw HTML tags add
    nothing; `:kbd[]`, `:mouse[]` and host inline references read as their source text; numeric character references
    and `&amp; &lt; &gt; &quot; &apos; &nbsp;` are decoded; a code span is its source text.
  - A heading with no slug characters (`!!!`) gets the id `S` when `idPrefix` is empty (the prefix alone otherwise).
  - **Links**: a prose link `[x](#frag)` is treated as before (the `idPrefix` is put before the fragment unless the
    fragment already begins with it). Write the GitHub anchor (`#cyanyaml`). A link to an old anchor
    (`#dh-cyan-yaml`, `#dh-a-host-s-own-block`) now points nowhere, and an old repeat link such as `#dh-x-2` (the
    second repeat) now reaches the third `x`: check every link to a repeated heading; and a stored link to `#dh-cyan-yaml` in a
    page's own text must be edited. Persisted `Document` JSON keeps its old ids until the page is parsed again.
  - **Fixtures**: of the example site only the pages of two fixtures change, `#dh-a-host-s-own-block` becomes
    `#dh-a-hosts-own-block` (host-block) and `#dh-3d-not-only-code-a-building-s-floors` becomes
    `#dh-3d-not-only-code-a-buildings-floors` (format 61).
  - A heading in a code walk step note or in the banner no longer takes an id or a number from the page's counter
    (before it could shift the numbers of the repeats on the page).
  - **New warning**: when a heading and a part (or a tab or accordion item) get the same id, `problems` has a `warn`
    naming both. `cyan.yaml` and a part `#cyanyaml` now clash, which they did not before.
  - **Known differences from github.com** are listed in SPEC.md section 1 (named references beyond six, emoji shortcodes,
    reference links defined elsewhere, `:::llm` headings, two letters `github-slugger` lower-cases differently).
  Nothing else changes: on every fixture the LLM view (it prints no ids), the checks, `format` (still 8) and every other
  field of the parse tree are byte-equal to 0.3.0.

### Added

- **`slug(text)`** exported from `durian-hypermedia`: the one anchor rule (GitHub's), for a tool that links to or checks a
  heading anchor. SPEC.md section 1 states it.
- Dependency `github-slugger` 2.0.0 (exact version, the one doccheck pins).


## 0.3.0 (git tag v0.3.0)

A host can draw the Markdown elements itself, and the renderer runs under Trusted Types
(`require-trusted-types-for 'script'`). No change to the format (still version 8) or to the `Document` shape's number
(`ast: 1`; one optional field added).

### Added

- **Markdown slots** on `DocumentView` / `DhDocument` `slots`. They have no default: without one the renderer draws
  the element exactly as in 0.1.0.
  - `Code` gets `{ lang, text, meta, hl }` for a fenced code block (not a part): the host's colours, Copy button, references.
  - `InlineCode` gets `{ text }`.
  - `Link` gets `{ href, title, external, children }` for every link the URL policy let through. With the slot given,
    nothing sets `target`; the default renderer still opens external links in a new tab.
  - `Table` gets `{ align, head, rows, headText }`: the parsed header and rows, each cell drawn as React children (no
    HTML), and the header as plain text for phone row labels.
  - `Heading` gets `{ depth, level, id, text, children }` (`level` is after `demoteHeadings`).
  - `Mermaid` gets `{ src, title, step, active }` and draws one step of a mermaid diagram. With it given, the mermaid
    part never loads mermaid or DOMPurify.
- **`demoteHeadings`** on `DocumentView` / `DhDocument`: adds n to every Markdown heading's level (at most h6), so a
  message's `#` sits below the host's own headings.
- **`parse(text, { frontMatter: false })`**: a leading `---` block is Markdown (a rule and the text after it), not
  front matter; line numbers stay the same. `llmView` and `check` take the same option.
- **`durian-hypermedia/react/strict`**: every part, for pages under Trusted Types. Its mermaid part is
  `HostMermaidPart`: it imports neither mermaid nor DOMPurify, draws each step with the host's `Mermaid` slot, and
  without one shows the diagram's source as text.
- **`durian-hypermedia/react/mermaid-host`**: `HostMermaidPart` alone.
- **`meta` on Markdown code blocks** in the tree (`{ t: "code", lang, meta?, text }`): the info string after the
  language, only when there is one.
- **`inlineText(c)`**: the plain text of an inline tree.
- **Tests.** `test/slots.test.tsx`: each slot, heading demotion, front matter off, code walk notes, mermaid drawn by the
  host, and every fixture through the strict entry. `test/trusted-types.test.ts`: the strict entry's whole import
  graph (dependencies included, React left out) holds no mermaid, no DOMPurify and no HTML-string sink
  (`dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `createContextualFragment`,
  `document.write`, `srcdoc`), with a control on the full entry. `bun run tt`: every fixture (85 pages) rendered in
  headless Chrome by the strict entry, in the browser only, under `require-trusted-types-for 'script'`: 0 violations;
  a control page whose plain-string `innerHTML` must be refused proves the check sees violations.

### Changed

- **Code walk notes are React children**: the parsed inline tree, drawn by the renderer, so the `Link` and
  `InlineCode` slots reach notes too. They no longer go through `dangerouslySetInnerHTML`. A note's external link now
  opens in a new tab like every other link (in 0.1.0 it did not).

### Removed

- The legacy `Tabs` component with an `html` prop (`src/ui/parts.tsx`). No entry used it; `TabsPart` draws parsed
  blocks. Nothing under `src/` sets an HTML string any more.
- The internal `inlineHtml` helper (`src/markdown.ts`; it was never exported from an entry).

### Known limits

- The full entry (`durian-hypermedia/react`) still draws mermaid in the page when no `Mermaid` slot is given. Under
  Trusted Types the browser refuses mermaid's own `innerHTML` (4 fixture pages; see
  `bun scripts/csp-check.ts --trusted-types --full`): the diagram's source stays on the page. Use the strict entry or
  the slot there.
- Licence: still to be decided; no LICENSE file in this release (README, "Licence").
## 0.2.0

### Added

- **`texts` on every animation block** of the parse tree (`Document`, the JSON that `dh json` prints): an array of strings,
  the labels, captions, say texts and note texts the scene compiler reads, in story order (SPEC.md section 6.11).
  A scene with none has `[]`. Additive: no field is renamed or removed, and every other part of the output is
  byte-equal to 0.1.0 (`ast` stays 1).
- **`animationTexts(block)`** exported from `durian-hypermedia`: the same list for an `AnimationBlock`, compiled from
  `block.anim`, so a tool never reaches into scene internals and a block from older JSON still works.

### Changed

- `AnimationBlock` now has a required `texts: string[]` (type level: code that builds an `AnimationBlock` by hand must add it;
  `parse()` always fills it). `animationTexts` takes any block with an `anim`, so a block read from 0.1.0 JSON still works.
- This package is now the source of `src/core`, `src/ui` and `SPEC.md`. The file headers say so; `scripts/sync.ts`
  (a copy from the first private prototype) is frozen and no longer to be run.

## 0.1.0 (first public version; git tag v0.1.0)

### Added

- **The format**: SPEC.md (format version 8): plain Markdown plus fenced parts (terminal, file tree, editor, code walk,
  chart, mermaid, animation, tier list, alignment grid) and `:::` containers (tabs, accordion, human, llm).
- **The parser**: `parse(text, options)` to a typed `Document` (`ast: 1`), pure: no DOM, no files, no network; runs in
  Bun, Node, a browser or a worker (outside Bun, set a YAML parser once with `setYamlParser`).
- **The LLM view** `llmView(doc)` and **the checks** `check(doc)` as functions.
- **Safety**: raw HTML shown as text; a URL policy hook for every link and image; caps on input size, block count,
  nesting depth, animation things and steps, chart points and items, each giving an error block; mermaid drawn strict
  and cleaned; ids prefixed. A hostile fixture set with a test per attack.
- **Colours for code** on the server: `highlight(doc)` from `durian-hypermedia/server`.
- **The React renderer** (React 18 and 19): `DhDocument`, `DocumentView` with only the parts you pass, one entry per
  part, hydration helpers. No eval, no WebAssembly, no network in the browser; proved under a strict CSP.
- **Theming**: every token documented in THEME.md, scoped under `.dh-doc`; `variant` (with `flat` and `bold` as
  examples), `slots` for the chrome, `theme`, `motion="off"`; `prefers-reduced-motion` honoured everywhere.
- **Host extensions**: `defineBlock` / `registerBlock` for the host's own fenced blocks (parse, LLM text, check,
  component) and `defineInline` for its own inline references.
- **Pinning**: `VERSION` export; releases are git tags `v<version>` (ADOPT.md section 0).
- **Mermaid labels** are plain SVG text (`htmlLabels: false`), so the cleaned SVG keeps them and holds no foreignObject;
  a browser test checks that a flowchart's labels survive.
- **Fixtures**: one page per part and option, made from the format's samples, plus hand-written and hostile pages.
- **An example site**: every fixture, server-rendered and hydrated, with a style and theme switch.
