# Changelog

This package follows [semantic versioning](https://semver.org). Before 1.0.0 a minor version may change the API;
every such change is listed here. The `Document` shape has its own number (`doc.ast`) and the format its own
(`doc.format`, SPEC.md).

## 0.6.1

A security fix: chart expressions now run on a real work budget. Format version 10 is unchanged; every fixture and the
Format page parse, check and render exactly as in 0.6.0.

### Fixed

- **One evaluation budget per `parse()` call** (SECURITY.md, "The evaluation budget"). The expression language
  promised its limits, but the step count started again in every evaluation (per definition, per series, per chart),
  operators and built-ins visited values without counting them, and only the outer length of a built-in's result was
  checked. Now steps, value slots and characters of text are charged before the work, from one page budget that every
  chart draws a part from; nested lists count what they hold. Over a cap: an error block and a problem for that chart,
  the rest of the page still draws, and no later chart restarts the spend.
- `check()` evaluates all control cases from one budget of its own; the LLM view reuses the page's evaluation; a reader
  moving a control gets a fresh budget of its own.
- Deep expressions, long chains of definitions and deeply nested lists give an error, never a stack overflow.
- Error messages that quote a value are short (text cut to 60 characters; a list is "a list of n"); a chart reports at
  most 10 definition errors (the rest are counted) in at most 2,000 characters.
- **YAML anchors and aliases**, whatever the anchors are named (front matter and charts, Bun's parser or one given to
  `setYamlParser`): at most 16 aliases per YAML text, checked before parsing; a parsed value may pass its text's length
  by at most one part's caps (an aliased string counts each time it is held); what aliases add is charged to the page,
  so many parts share one allowance. Front matter over it is ignored with a problem; a chart over it is refused.
- Everything a chart returns (`vars`, `x`, series and their names) is sized against its YAML text plus one part's caps,
  and what it repeats beyond what it paid for is charged to the page.
- Comparing two texts with `==` or `!=` pays for the characters compared; a definition key is read in one pass.
- Two regular expressions that could backtrack on author text are replaced by one-pass code with the same results.
- `check()` of a page over `maxInputBytes` returns its problems instead of throwing.

### Added

- `LIMITS` (and `parse(text, { limits })`): `maxEvalSteps` (100,000), `maxEvalValues` (50,000), `maxEvalChars`
  (50,000) for one part, and `maxPageEvalSteps` (300,000), `maxPageEvalValues` (400,000), `maxPageEvalChars` (400,000)
  for the whole page.
- `check()` has a budget of its own, eight times the page's; when it is spent the rest is a warning ("not every control
  value was checked"), not an error.

### Changed (the expression language, for input that was already broken)

- `range()` needs finite numbers; `fill()` of a count that is not a number is an error (it was an empty list);
  `text()` digits must be a whole number from 0 to 100 (an engine error before); `round()` digits must be finite.
- `constructor`, `toString`, `__proto__` and other names an object inherits are unknown names and unknown functions
  (they reached the engine's own objects before); `__proto__` may be an author's own definition.
- A chart result over a budget carries `limit: "part"` or `limit: "page"` next to `error`.
- A name has at most 64 characters, a definition key at most 256, a user function at most 16 parameters; a chart has at
  most 100 controls and a select at most 1,000 options. A control name over 64 characters is an error (it could not be
  used in an expression).
- A series name is shown to at most 200 characters, a series tone or kind to 20 (longer ones are cut with "…").
- **YAML merge keys** (`<<`) are not read in a YAML text that also uses an alias: the front matter or chart is refused
  with a message to write the keys out. A merge of a map written in place still works.
- `LIMITS.maxYamlAliases` (16): aliases one YAML text may use.

## 0.6.0

Format version 10 (SPEC.md section 11): a scene inside a scene, depth, lines that never cross, words never under 11 pixels,
candlesticks, free alignment grids, your own marks and prompts, and a banner that is gone. `FORMAT_VERSION` is 10;
`Document.format` says 10. A page that was valid in version 9 reads and draws as before, except one with a front matter
`banner:`, which `check()` now refuses.

### Removed (API change)

- **The banner.** Front matter `banner:` and the old `:::banner` are refused by `check()` (*banner was removed in format
  version 10: put the note in a callout under the title (> **Note:** ...), or drop it*); `parse()` ignores them and draws
  nothing. Removed from the API:
  - `Document.banner` (the field) and the exported `Banner` type;
  - the `Banner` slot (`Slots.Banner`, `DEFAULT_SLOTS.Banner`) of `DhDocument` / `DocumentView`;
  - `Ui.bannerKind` (the banner's words, in every language);
  - the CSS `.banner`, `.banner-<kind>`, `.banner-icon`, `.banner-kind`; a note about the whole page is a callout under
    the title.
  To move: drop `Banner` from your `slots`, and write `> **Note:** ...` under the title instead of `banner:`.

### Added (one bullet per new author word or part)

- **A scene inside a scene** (SPEC.md 6.12): `scene <id> "label" ... end` in the setup, `enter <scene> from <thing>`, `leave`.
  The caption shows the chip `Inside · <label>` (`Ui.inScene`, 6 languages); "All steps" nests under the step that enters.
- **Data structures** (SPEC.md 6.12): `map <id>: key: value, ...`, `buckets=<n>` (a hash table), `put <map> <key>: <value>`,
  `get <map> <key>` and `get <array> <index>`.
- **3D only** (SPEC.md 6.11): ```` ```animation 3d only ````, a scene with no flat form (a list of steps without WebGL).
- **`closed=hidden`** (SPEC.md 6.11): an inside not drawn until the story zooms in; zooms nest: `zoom into n1 n2`, `zoom out`
  (one level), `zoom out all`.
- **`lift <ids>` and `put back [ids]`** (SPEC.md 6.11, 3D only): a box rises with what it holds, the rest fades.
- **`labels=all`** on the fence (SPEC.md 6.11): keep every 3D label showing while a step plays.
- **`kind: candlestick`** (SPEC.md 3 and 7): `data: [[open, high, low, close], ...]`, lines on top, `y2`, controls; up and down
  take the theme's good and bad; the LLM view is `period | open | high | low | close`. New UI strings: `candleUp`, `candleDown`,
  `candlePeriod`, `candleWords`, `marksKey`.
- **Alignment grids of any size** (SPEC.md 3): 2 to 6 names on an axis, the axes may differ; `[colour]` on a cell;
  `region: <columns> / <rows> "label" [colour]`; `arrows: on`. The 2x2 and 3x3 refusals are replaced by *an axis may have 2
  to 6 names*.
- **Tier lists** say plainly that `tiers:` takes any names and any count (SPEC.md 3).
- **Own marks and prefixes** (SPEC.md 3.1): front matter `marks:` for a file tree and `prefixes:` for a terminal, each with a
  label, a theme colour and an optional `means`; only what a part uses shows. For every page of a host: the new `marks` and
  `prefixes` options of `parse()` (same shape; the page's own entry wins). `FileTreeBlock.marks`, `TerminalBlock.prefixes`
  and the `MarkDef` type carry them to the renderer; the LLM view reads a mark as its label and lists a custom prompt under
  the terminal. doccheck refuses an undefined mark, naming where to define it.
- **New CSS class** `.dh-turn`: a block with no height at the top of a part, where the hydration queue finds it.
- **Checks:** `src/core/readable.ts` (the story camera's focus), `src/core/route.ts` (line routes) and the line counts used
  by `test/animation-v10.test.ts`.

### Changed

- **Lines** (SPEC.md 6.8): lines on one side of a thing fan out from their own points; a line is straight where it can be, else
  at right angles with rounded corners, around what is in the way; none crosses another or doubles back; sends travel their
  connector; in 3D a line on one layer runs on the floor. doccheck warns when two lines must cross.
- **Words never under 11 px** (SPEC.md 6.8): the story camera never draws words under 11 pixels on any screen (version 9:
  a phone only); when what a step touches does not fit at that size, it frames the step's focus. Shaded edges on every
  screen; the narrow layout on a phone also when it keeps more steps whole.
- **3D labels** (SPEC.md 6.11): while a step plays only who takes part shows a label; the rest come back at rest.
- **Play starts at once** (SPEC.md 4) in the terminal and the animation, 2D and 3D.
- **The editor on a phone** (SPEC.md 4): the tree above the file (a closed drawer when long), code at 14 px, a pane of at
  least 8 lines, rows of 36 px.
- **Hydration order** (SPEC.md 11, ADOPT.md section 4): `hydrateDocument()` hydrates the heavy parts on screen first, one per
  task, the one scrolled to next, then in page order; a part the reader touches works at once. It also puts the class `js` on
  `<html>`, which the phone's first-paint rule needs: under 560 px an animation shows an empty stage until it has measured
  itself, instead of the server's wide drawing. On a slow phone the first drawing used to stay 12 to 15 seconds, now about
  one. A host that calls `hydrateRoot` itself gets the old behaviour (everything at once) and adds the class itself.
- `check()` reports a bad `marks:` or `prefixes:` definition, a front matter `banner:` and a mark nobody defined.

### Fixed

- A long name breaks after its own `-`, `_`, `.`, `/` or `:`, with no hyphen added; chips are sized from the measured width of
  their words (`seq 2001` fits); a token sent along a connector travels beside it, clear of its label and arrowhead; an
  arrow alone on a connector with no label draws on it, not as a second line.
- A line never dips under a box to come back into a side, and runs in the middle of the gap between two nested boxes.
- A chart's crowded category axis sets each label on one line, cut with "…", turned up to 90 degrees.
- 3D: meters (`level=`) are drawn; the gap between stacked layers grows on a phone; a floor line climbs over container slabs
  instead of through their walls; layer planes fade during a move into or out of a scene; moving chips step aside from words
  and other chips; no 3D word is under 11 px; labels of who takes part show inside a scene inside the scene.
- The code walk's fold bar is not dimmed with the lines out of focus, and its border shows on dark.
- 3D stages stay drawn: a page asks for WebGL once and gives the test context back at once, and a 3D stage holds its WebGL
  context only near the screen (before, about 45 test contexts at load pushed out the one on screen: a blank stage with
  floating words after a jump straight to a 3D scene). A lost context is taken again and redrawn.
- 3D on a phone: when the whole view would draw words under 11 px, the camera frames what the step touches; layer names
  keep their order and their plane; words hide while the camera flies into or out of a scene inside the scene; a 3D name at
  rest keeps off lines that do not end at its own thing; the 3D fit fills the stage (a turned scene used a third of it).
- 2D: the view slides to cut the fewest things, and every side where it cuts one is shaded; a tag rests nearer its dot.
- Meters are 7 units tall in an outlined track (a full one read as a line); in 3D they stand on the front face.
- A closed array, map or tree says what it holds in its title (`sorted ids · 4 items`) when it fits.
- The code walk's note keeps inline code in its sentence; the editor's step badge counts from 1; a walk or editor pane is
  as tall as its code (no floor of 6 or 8 rows; the phone editor keeps 8).
- Alignment grids: columns wide enough for two-line chips, labels kept inside their own cell, a swipe hint when a grid is
  wider than the page.
- Charts: whole-number ticks for counts, log axes ending on powers of ten, radar and polar grids that show on dark; the
  candlestick key wraps between items.
- A file tree row removed in its first step is tinted as removed, not as added.
- 3D "Show everything" pressed before the 3D stage is up (right after a jump, while three.js loads) is kept and done
  once the stage mounts; before, it was lost and the story's crop stayed (seven layers on a phone: the lower four layers
  below the stage). On a phone, a 3D story view cut to what the step touches slides to keep within the scene: no empty band
  on one side while the other is cut. Only the nearest layer off each edge keeps its name, with an arrow pointing off the
  stage (the others piled at the edge, away from their planes). A 3D name on the stage is not cut at its side.
- 3D labels: a `camera` line makes its targets take part only in a step that does nothing else (before, a camera target
  kept its label in every later step), and a connector's label needs a send along it or both ends taking part (one end was
  enough). Lifts nest: a thing inside a lifted one may rise again; only the innermost lifted things stay strong. The
  Kubernetes sample lifts each box it zooms into and puts each back on the way out; the kube-proxy sample opens with the
  nodes only and adds the service at the step that calls it.

## 0.5.1

- Licence: MIT. Adds the `LICENSE` file; `package.json` `license` is `MIT`. No code or format change.

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
- **The laptop view never cuts a thing in half** at the stage's edge (nor a container that would fit, a heading or a layer's
  name; a close-up may cut its neighbours), and never runs past the scene on one side while it cuts it on the other.
  `close` draws things at most 2 times natural size.
- **One-line hint:** the line under the stage is one line (short on a phone) with a `?` button for the whole text.
  New UI strings: `hintShort`, `hintShortOn`, `hintShort3d`, `hintShortOn3d`, `howTo` (6 languages).
- **3D:** the camera stays above every shown plane and layers in the way fade; a scene with no declared layers stands
  on one floor in 3D (its contents no longer hang under their container); a lit container lifts its contents; a
  moving token's label keeps its offset while it moves (no jumps or flicker); 3D names take their spots in order and
  fade to a ghost when there is no room. A 2D scene opened in 3D is seen from nearly in front. A lit thing's name is
  underlined (it was boxed) and its ring hugs its own foot (it lay on the floor, offset). A speech bubble keeps the
  spot it appeared in.

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
