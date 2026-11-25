# Changelog

This package follows [semantic versioning](https://semver.org). Before 1.0.0 a minor version may change the API;
every such change is listed here. The `Document` shape has its own number (`doc.ast`) and the format its own
(`doc.format`, SPEC.md).

## 0.7.0-rc.3

The third release candidate of 0.7.0. The format number stays 10.

### Fixed: the trace waterfall fits its box, no sideways scroll (SPEC.md, trace)

- The waterfall was drawn for a width guessed from the stage and, on a phone, never narrower than 570 px, so inside a narrow box it was a sideways scroller and the bars started off to the right until swiped. It is now as wide as its measured box at every width; on a phone the name sits on a line above each bar and the bars use the whole width.
- New `bun scripts/fit-check.ts --part <name> [--widths 1280,390,360] [--column N] [<page>]`: draws a part's page in a browser and fails when anything inside the part scrolls sideways or a drawing is wider than the part.

### Fixed: sankey colours and sample words (SPEC.md, sankey)

- A node with no colour word now skips the family colours that other nodes of the same sankey were given by word: on the parts page `auth` and `Redis` both drew in `c2` (and `handler` and `Postgres` in `c3`). Nothing changes when no node is given a colour word.
- The sample's first step said "the big three" over four targets; it now reads "The money in and where it goes". A test checks that a step caption that counts (two to six) counts the targets its flows add.

### Fixed: trace length words stay clear of event diamonds and inside the plot (SPEC.md, trace)

- On the parts page the event diamond of `UPDATE stock` sat on top of its `109 ms`, and `20 ms` after the last bar ran past the plot's edge and was cut. A span's length word now takes the first of four places (inside left, inside right, after the bar, before the bar) that is inside the plot and clear of every diamond of its row.
- `bun scripts/label-check.ts` now counts a trace's event diamonds as things a word must not cover.

### Fixed: calendar week titles stay whole

- Short and overlapping appointments wrap their complete titles at readable sizes; all-day titles wrap too. Label height participates in overlap placement. An appointment crossing the opening hour, including one converted from another time zone, opens whole instead of as a clipped sliver.

### Fixed: chart labels never overlap, at any width (SPEC.md, chart-kinds)

- A waterfall at 390 px drew the values over its bars on top of each other (`−€9.1K` over `−€2.3K`, `€85.1K` over `+€4.8K`), and tilted names under the bars could touch. The words are now measured: names stay level when they all fit, else upright and thinned; a value over a bar is drawn only where it has room (totals first); a histogram keeps only the number ticks that clear each other. Every name and value stays in the card and the LLM view.
- New `bun scripts/label-check.ts [--widths 390,360] <page>...`: draws pages in a browser and fails when any two words of a chart (svg text, calendar months, Chart.js canvas text) overlap.

### Fixed: a line between side-by-side cards never runs through the card between them (SPEC.md)

- In the narrow form, two cards side by side in one row with a card between them are joined over the row (else under
  it), 14 to 30 px clear of every card, never straight through the card between or its pills.
- One line "a, b -> c: words" shares one label; where the first card's line hops over the row, the label sits on
  that hop, the line it names.

### Fixed: a card line is measured as Poppins draws it and never runs past its card's border (SPEC.md)

- The stage now has the browser widths of its font (per character, weight and stage size, the larger of the hinted
  and the font's own widths). A card line whose drawn width would reach its border breaks again; other lines, sizes
  and layout choices keep their place. Hosts must map the stage font to Poppins.

### Fixed: a [bad] time cell never draws an X over or above its words (SPEC.md)

- A worded `[bad]` cell draws its corner cross only beside its words (30 px or more of room) or in a cell without
  words; on a phone's narrow cell it is its thick border alone, as on the wide stage.

### Added: layer 1 as a signal; no cut words in stage cards (SPEC.md)

- **A plain plot line.** `plot: a..b | unit | line` draws a role's points as one line, a signal: no dots, words only on
  labelled points, a grid line at every level of a few whole-number levels, labels kept off the line; the LLM view says
  the line as runs of one value. The layers example draws layer 1 three ways under its signal scene: copper's voltage
  levels on pair A, fibre's light for two 8b/10b codes, radio's phase for QPSK.
- **No clamp drops a fact.** A card line broken again by its drawn width takes the lines it needs instead of cutting a
  word; a grid card's lines and a card's second line (up to 8 lines) are no longer cut with "…" off a phone.
- **Labels and table cells keep every word.** A connector's label with no clear place by its line takes the nearest
  place that covers no words; a plain table's cell takes the lines it needs and a column is at least its longest word.
- **The phone footer.** On a phone a stage's step buttons and caption stay at the foot of the screen while a tall stage
  scrolls under them; the stage keeps its height. After a step the reader asks for (not Play's own), the page scrolls the step's lit items above it, never within 800 ms of the reader moving the page.

### Changed: the graph engine's animation is calm (SPEC.md 6.14)

- **No jitter.** A thing that takes no part in a step keeps its place: only items that pass another item of their row
  travel on an arc (a queue moving up goes straight); a step's first frame is its start (no back step, no flash of a
  beat's end); in 3D a thing that moves to another parent or floor rises along its way (no hop).
- **One held view from zoom to zoom.** The steps between two camera words share one view of all they touch, so the
  camera moves only at a zoom in or out (2D and 3D); a zoomed step says so under its caption. On a phone the stage grows
  a little (at most 680 px) where that keeps the camera still.
- **One focus at a time.** At rest only the tokens a step is about keep their words; the others keep their pills. Inside
  a 3D zoom what is outside it and untouched leaves the stage, the layer plane too.
- **The reader's camera only when asked.** An animation shows the 3D button, zoom, show everything and drag or wheel to
  move only when its fence says `zoom` (new bare fence word) or `3d`. The story's camera, the player and its keys stay.
- **Words are cut whole or not at all.** An arrow's label counts in a scene's bounds and in what a view cuts (one was
  clipped to a letter at 1180 wide). A story cut by its frame says so in words at that edge.

### Added

- **The `graph` part (SPEC.md 3.2 Graph): an explorable network graph.** `group`, `node` and `a -> b "label"` lines
  (lists, chains and numbered ranges such as `api-{1..8}` keep a 120-service graph short), with `layers`, `force` and
  `radial centre=` layouts. A reader searches (the match is framed and lit), focuses a node one or two steps out (the
  rest fades), folds and opens groups, pans and zooms (pinch on a phone) and reads a side list of the focused node's
  links in and out; over 300 nodes every group starts folded, and a phone starts folded where the open graph would
  draw under a third of its size. The look is ours, filled from the base tokens, light and dark; Tab, Enter, arrows
  and Escape work. The canvas library loads only when the part scrolls near; before that, and with no script, a still
  picture of the groups and their counts is drawn (it is also the `static` form). It has an LLM view of its own (the
  nodes by group, the edges, the most connected). Caps `graphNodes` 2000, `graphEdges` 5000, `graphGroups` 300,
  `graphDepth` 6 and `graphFoldFirst` 300, each lower in the chat preset; the force layout has a fixed iteration cap.
- **cytoscape 3.34.4 is a dependency** (MIT), used only by the graph part and loaded in its own chunk. It is the newest release more than 14 days old (published 15 October 2026); 3.34.5 and 3.35.0 came out on 10 November and are held back until they have aged.
- **The graph's still picture draws its counts at 13 px,** so on a phone (where the picture is never drawn under 11/13 of its size) every word in it stays 11 px or more; it was 12 px, 10.2 px on a 390 px screen.

- Map and routes, country/state choropleths, directed flow arcs and an optional globe; bounded calendar repeats with time zones, overlap packing and narrow layouts. Both parts include static output, LLM summaries, checks and host-lowerable caps. Optional base-map providers are an explicit host entry; source text cannot select them or a router.
- **`state`, `class` and `er` parts (SPEC.md 3.3, 6.15).** Three diagrams, each in a small language of its own, drawn by
  the animation engine instead of a diagram library: a state machine that its steps walk (`at`, `fire`), a class
  diagram from members and relations written in words (`extends`, `implements`, `owns`, `has`, `uses`, `->`), and an
  ER diagram with crow's-foot lines from key to key (`highlight` lights a table or a column). Each has its own LLM
  view and its own doccheck rules (every refusal names its line and the fix); a diagram that cannot be drawn shows its
  reason and its source as text. Caps: 60 boxes, 120 lines, 40 steps, 1500 lines of source, 300 characters a line; the
  layout is charged to the page's animation budget. Three Format fixtures (live and `static=true`) and a hostile one.
- **The graph engine gains records, line ends and end labels:** a box with a row per field where a line may end
  (`record order "Order" as=entity: id: uuid [pk]`), UML and crow's-foot shapes at either end (`start=`, `end=`), a
  word by an end (`start-label=`, `end-label=`), a second line between two things or a loop (`also=yes`), and the
  `initial` and `final` shapes.

- **Inline marks in an animation's prose (SPEC.md 6.15).** Captions, `say` and `note=` take `code`, **bold** and
  *italic*, in 2D, in 3D and in the "All steps" list; a translation must keep a caption's code spans, and an unclosed
  backtick is a doccheck error with its line. The scan is one pass with no pattern that can backtrack. The state,
  class and ER parts use it for their captions and notes.
- **Long paths in labels (SPEC.md 6.15).** A path breaks only after a `/` and keeps its file's name on a laptop and on a
  phone (no more `registry/…` with the file lost); a one-line chip keeps the end of a path.
- **A token sent into a queue, stack or list is an item there (SPEC.md 6.15).** `send ... as <id>` joins the container
  like a push, so `pop`, `move`, `split` and `drop` work on it; a line that needs a sent token that kept nothing says to
  give the send an id. The static step list of every part draws a caption's inline marks.
- **The example site shows each fixture's source and LLM view:** every fixture page (the hand-written ones, the
  Format page samples, the composed stage samples, the folder parts and the hostile pages) opens with two closed
  toggles, `Source` (the fixture as written) and `LLM view` (what `llmView` returns, or a line saying an LLM reads
  nothing). They need no script, and they sit above the part, so a part that grows as it loads moves nothing it did
  not move before.
- **Still scenes** (SPEC.md 6.14): an `animation` with no `@step` is its setup, drawn once: no player, no toolbar, pan or
  zoom unless the fence says `zoom` or `3d`; it shows whole (top to bottom when too wide, sideways scrolling in its box
  when still too wide for 11 px words); a tall one is as tall as it is. Before, it was refused ("needs at least 2 @step
  lines"). Its LLM view is its setup. `src/core/whole.ts`, `src/core/calm.ts`.
- **Static on the graph engine's animation** (SPEC.md 4.1): the fence's `static`, or the page's or host's, draws one step
  whole and flat with its step list and `data-dh-static`; print and reduced motion switch it on.

- **Stat tiles** (`stats`): the row of big numbers at the top of a dashboard: a figure, its change with a colour word (the colour says good or bad, never the sign), a note, a sparkline, a glyph, a trend and a sub-line; a static form. Caps `statsTiles` 12 (8 untrusted), `statsSpark` 60 (40), `statsText` 60, `statsNote` 120 (80).
- **HTTP** (`http`): a request and its response: method chip, query split out, headers folded after 6, a JSON body as a foldable tree, a status chip, Copy as curl; a real-looking secret in a sensitive header is refused and never drawn; a static form. Caps `httpLines` 600 (300), `httpHeaders` 80 (40), `httpJsonDepth` 24 (16), `httpJsonNodes` 3,000 (1,500), `httpChars` 60,000 (30,000).
- **Diff** (`diff`): a unified diff: files, both line numbers, changed words marked by jsdiff 9.0.0 at parse time, folded runs, unified or split layout, sticky line numbers and sign on a phone (the body scrolls inside its own box); a static form. Caps `diffLines` 4,000 (2,000), `diffFiles` 40 (20), `diffWordLine` 1,200 (600), `diffWordTokens` 300 (150), `diffEditLength` 60 (40). New dependency: `diff` 9.0.0.
- **Weather** (`weather`): a forecast written in the source with a units switch (°C/°F, km/h, mph, m/s, knots, mm/in, hPa/inHg): real buttons, the default from the fence (or the host's `partOptions={{ weather: { units } }}` on the document: the new `DocumentProps.partOptions` / `DhSettings.partOptions`, options for the folder parts by part name), the reader's choice remembered in the browser and shared by every weather part on the page; a static form draws the fence's unit with no menu. Caps `weatherRows` 200 (100 untrusted), `weatherLineChars` 400, `weatherNoteChars` 160. The shared `kit/places.ts` (dates, zones, colour words, label scans) comes with it.
- **Maths** (`$...$`, `$$...$$` and a `math` fence), drawn by KaTeX 0.19.1 at parse time into a tree of elements (never an HTML string; the page runs no maths script). The marks are read from the Markdown source itself, so `\\`, `_` and `*` stay the author's TeX (`InlineDef.raw`, a new way for a part of a sentence to read the source before Markdown does). `trust` is off; `\href`, `\url`, `\htmlClass`, `\htmlData`, `\htmlId`, `\htmlStyle` and `\includegraphics` are refused by name; KaTeX writes MathML only, which the browser draws with its own maths font: no font file, no stylesheet and nothing for a host to set up (KaTeX's fonts are under the SIL Open Font Licence, so they are not bundled). Caps: `mathChars` 4,000 (1,500 untrusted), `mathFormulas` 600 (150), `mathNodes` 60,000 (20,000). New dependency: `katex` 0.19.1.
- **Citations** (`[@key]`, `[@key, p. 12]`, `[@a; @b]` and a `references` block), in apa, ieee and chicago, seven entry types, with a card on each mark and the list drawn with "cited N times" and links back. The formatter is the package's own. Caps: `referencesEntries` 400 (100 untrusted), `referencesAuthors` 30 (12), `referencesText` 600 (300), `referencesCites` 2,000 (500). `InlinePage.texts` and `PartContext.texts` give a part the page's Markdown text (to number cites over the whole page).
- Fishbone and Sankey lead the example index, with live and static examples in both themes. Source and LLM panels wrap long lines within the page.
- Sankey node labels keep every word on measured, theme-coloured backing plates; narrow layouts wrap labels without ellipsis and reserve their positions across steps.
- **The layers example** (`fixtures/stage/example-layers.dh.md`, SPEC.md 6.13): one request packet from a laptop's
  browser through a switch, a home router and two internet routers to a server, and the first packet of the answer
  back, on the composed stage: ten scenes, 67 steps, each layer a role of its own, the wrappers as boxes inside boxes,
  and a still last scene setting layer 2 against layer 3 hop by hop. `scripts/fixtures.ts` makes it from the source's
  `samples/layers.dh.md` with the Format page fixtures (`EXAMPLES`).

- **The composed stage's newest words** (SPEC.md 6.13): the short forms (`arrived 3 [dot]` is a dot at one time,
  `@2 only` the one-step spelling of `@2..2`, `count 0..31` a row of one state per unit, `keep units` the last
  step's panel again, a bare tone word after ids); `state ...: gone` dims a thing without printing a reserved word;
  `role id below time: title` is a band of one card under everything else on the stage; a thing can stay still while
  a wrapper comes or goes around it (`group layout=free`, `pos=`, `move ... after`). On a phone, time rows keep
  their words and big crosses stay inside their cells.

### Changed: the role palette is measured (SPEC.md 6.10)

- **The measured role palette** (SPEC.md 6.10): the eight family colours, light and dark, are new and measured. Any two
  families differ in border and fill, also with protanopia or deuteranopia simulated; every border is 3:1 on the stage,
  the surface and every other family's fill (one measured exception in light: the yellow family's border is 2.5:1 on
  the lilac, pink and green fills); every word 4.5:1. A family has one fill for its boxes and its containers
  (`--cN-plane` is new and names the same colour); in dark a family's words are a light tint of its hue. The stage's
  own borders are new tokens (`--scn-edge`, `--scn-frame-edge`, `--scn-band-edge`, `--scn-acc-edge`, `--scn-good-edge`,
  `--scn-warn-edge`, `--scn-hot-edge`, `--scn-muted-edge`), 3:1 on what they sit on, in 2D and 3D. A composed stage's
  column dots are the family colour in both themes. The middle dot (U+00B7) draws from IBM Plex Mono, so it shows at
  small sizes. No source changes: a page names roles and families, never a colour. A host that set `--c1` to `--c8`
  keeps its own colours.
- The stylesheet build loads `colours.css` after the other part sheets.
- The tone inks are 4.5:1 on every family fill too (a state pill's word or a lit count on a card): light `--acc-ink`,
  `--good-ink`, `--warn-ink`, `--hot-ink` and `--bad-ink` are a little darker, dark `--hot-ink` and `--bad-ink` a little
  lighter, each in its own hue.
- Faint states have an edge everyone can see: a counted unit of no group (remaining, gone), a bin's empty slot and its
  waiting chips, an idle stretch or soft dot on a time row, and a sheet's empty cell drew their edge in the page
  hairline (1.3:1 in dark, so they disappeared). They now draw it in `--scn-faint-edge`, 3:1 on the stage, the page and
  every family fill in both themes. Frames, cells with words and guides keep the hairline. A bin's empty slot has the
  class `stg-slot`.
- The layers example tells layer 3's things apart: packets and headers, routers, and the routing and NAT tables are
  three families (each labelled layer 3), so a router, its table and the packet are no longer one colour. The 3D router
  of "a message through a router, in segments" is a family of its own: zoomed in it shows that family's fill and border,
  and its input queue, routing table and port 2 carry its border, told apart from the two hosts.
- A composed stage's `rows` takes a role: `rows <role>` draws each row's box in that family's fill and border, `rows plain
  <role>` a plain row's words in its ink (SPEC 6.13); doccheck refuses a role the page does not declare. The layers example's
  routing tables are `rows table` and the switch's MAC table `rows link`, so they are told apart like the cards beside them.
- A composed stage's `list` takes a role after `|`: `list Title | <role>` draws its box in that family's fill and border
  (`roomy` and a role may go together; doccheck refuses a role the page does not declare). The layers example's NAT table
  list is `| table` and its neighbour cache list `| link`.

### Removed (breaking)

- **mermaid is gone from the package.** There is no `mermaid` part any more: a ```` ```mermaid ```` block is a plain code
  block, and `check()` refuses each one with one message that names the part to use instead (```` ```animation ```` for
  boxes and lines, with no `@step` lines for a still drawing; ```` ```sequence ```` for a sequence diagram). What leaves
  the API: the `MermaidBlock` type and `"mermaid"` in `PART_NAMES` and `BlockType`; `MermaidPart`, `HostMermaidPart`
  and the `durian-hypermedia/react/mermaid` and `durian-hypermedia/react/mermaid-host` entries; the `Mermaid` slot and
  `MermaidSlotProps`; the `maxMermaidChars` limit; the optional `mermaid` peer dependency and the `dompurify`
  dependency; the `.diagram`, `.dg`, `.mermaid-*` and `.dh-mermaid` classes. `durian-hypermedia/react/strict` stays
  and now holds the same parts as `durian-hypermedia/react`. The fixtures that drew with mermaid now use an
  `animation` (`format/07`, `format/09-still-scene`) or a stepped `sequence` (`format/10`); `hostile/06` is gone with
  the part it attacked. To move a page: rewrite each mermaid block as the part the message names (SPEC.md section 6).

### Fixed

- **"More beyond the edge" never covers a word** (SPEC.md 6.14; the rc.3 review: the service mesh at 390). The line
  under a story cut at its edge stood in the middle of that edge, over whatever was drawn there. It now takes the
  middle, else the edge's left end, else its right end, off every word the drawing has (its names, the numbers of
  cells and buckets, arrow labels, chips and speech); where each spot would cover one, only the shaded edge and its
  arrow say so. Over the fixtures with steps it lay on a word on 4 steps at 390 and 4 at 360; now on none.
- **A row of containers stacks on a phone** (SPEC.md 6.14; the rc.3 review: pods, nodes and a service at 390, node 3
  cut at every step): the narrow layout turned the scene's own row into a column but kept every row inside it, so a
  cluster's three nodes side by side were wider than a phone at the least word size. A row whose children are all
  containers (not linked to each other, and not a stage the story runs into and on out of) now stacks into a column
  there, and so do those containers' own rows of things; what links into the
  column from outside (the service) stands beside it, so its lines reach each node from the side and none runs down
  through the nodes above. A 3D scene keeps its rows. On a phone only the two fixtures with that cluster change; on a
  laptop nothing changes at 1280, and between 448 and 640 px layout widths the same two take the stacked layout where
  the wide one was cut.
- **The story camera cuts less of what it shows** (SPEC.md 6.14; the rc.3 review: the service mesh at 390, from step 7
  node 1's heading cut at the top). One held view for several steps now gives way where it would cut a thing or a
  container's heading that a step's own view shows whole; a phone stage grows a little where that lets every step show
  its things whole; and its heights are judged at the least height the stylesheet draws (360 px; they were judged from
  260 px). In a browser, the fixtures with steps on a 390 px phone: steps whose view cuts a thing or a heading 31 to
  24 (360 px: cut headings 48 to 26; laptop none before or after); the service mesh has none. Left: a row of three
  nodes wider than a phone at the least word size (two fixtures, 10 steps), and 14 steps of three others (the
  hash table, eight colours, the array, map and tree) whose view cuts a heading or a container larger than it.
- **Speech stands by the thing that says it** (SPEC.md 6.14; the rc.3 review: the service mesh at 1280). A bubble could
  take a free spot nearer another thing than its speaker, and read as that thing's words ("retries twice on failure"
  36 px from the other proxy, 72 px from its own). Such a spot now costs more than resting on a line, so it is taken
  only when every spot by the speaker covers a word or a thing. Over the fixtures (laptop, phone and narrow layouts, every
  step): bubbles nearer another thing than their speaker 8 to 0; none of the 8 moved bubbles covers a word, a thing
  or a line.
- **A card line of addresses stays inside its card** (SPEC.md 6.13; the rc.3 review: the layers example's routing table T3 at
  1280). Off a phone, a card line whose drawn width would cross the border (digits draw wider than the measure said) breaks
  again by its drawn width; lines that fit keep their places.
- **A class, state or ER diagram on a phone keeps readable words:** the server shapes its stage for the rows layout the
  browser draws, so a class diagram at 390 px draws 12.6 px words (they were squeezed to 4.3 px) in a stage of its true
  height.
- **The graph part's still sample is the live sample,** so its static form shows the same nodes and lines (it was a
  smaller graph); **the ER sample and its SPEC example light one column per step.**
- **The player's controls stay put when Play turns into Pause:** the button keeps room for both labels, and on a phone
  Pause drops its icon so the controls fit beside the title as before; the button's accessible name is Play or Pause.
- **A '~' on a stage still reads as a tilde:** only the fixed-width rows are drawn with geometric precision; other stage
  text keeps the browser's normal rendering, so a tilde is not flattened to look like a hyphen at 1x.
- **A stage drawn smaller or larger than its plan keeps its words inside their boxes:** stage text is drawn with
  geometric precision, so the browser no longer rounds some glyphs at their native width while the box around them
  scales (fixed-width field rows spilled out of their highlights near a 732 px box).
- **Words on a phone stay readable at every width:** two more screen plans (286 and 312 px) serve viewports from 320
  to 359 px, so a composed stage keeps its words at 11 px or more on every phone width from 320 to 430 px.
- **A composed stage is drawn near its own size at every screen width** (SPEC.md 6.13): the server draws ten plans
  (326, 341, 356, 380, 458, 551, 664, 800, 971 and 1178 px) instead of seven, and hydration and print choose among them by
  the same CSS rule, so between 320 and 1280 px a stage is drawn at 0.90 to 1.10 times its plan (it could be stretched
  1.92 times, a 380 px plan in a 731 px box) and keeps its height when it hydrates (it shrank up to 22 px at 800 px).
- **The example draws in the faces the composed stage measures with:** it self-hosts Poppins (300 to 600) and IBM Plex
  Mono (SIL OFL 1.1, licences beside them), preloads the regular faces and holds the page column hidden until they load,
  1 s at most, so stage lines no longer run past their boxes on a machine without Poppins. The package still loads no
  font; SPEC 6.13, ADOPT.md and THEME.md say the stage measures with Poppins metrics and a host maps `--font-sans` to it.
- **A fishbone paints its causes in the step they belong to** on a desktop: a nested group no longer fades in a step
  late (its opacity was animated); the causes of the current step are drawn at once, in both themes.
- **Parts keep their room when the page loads:** the server reserves a gantt's rows and a venn's or map's list and
  caption, so nothing moves when the part hydrates; a map's pins and globe move inside its transforms; audio markers
  sit at a share of the width, and the example ships the audio sample's media.
- **A connector's chip slides off an upright line** (SPEC.md 6.13). In the stacked form at 480 px and wider, a chip
  that an upright line ran through moves along its row to the nearest place 6 px clear of every upright, where there
  is one.
- **A graph whose groups start folded draws light lines that do not overlap** (SPEC.md 3.2): a folded group's line is
  at most 2.2 times as wide as one line and a little fainter, and the folded groups' pills alternate left and right in
  one column.
- **A graph-engine scene wider than its laptop stage is no longer cut at the right** (SPEC.md 6.14). Without `zoom`
  on its fence the reader had no way to see the rest (a word 110 px past the stage's edge). At the least size it now
  lays out top to bottom when that fits, else it can be dragged sideways, with the shaded edge saying so. The server
  writes the stage's shape for each laptop width, so it does not move on load.
- **Tabs and accordions print every panel.** A sheet cannot be clicked, so a scene or table in a tab the reader never
  opened, or in a closed accordion row, did not print at all. In print every tab panel shows under its own title (the
  tab bar is not printed) and every accordion row is open: CSS only for the tabs (each panel carries its title in
  `data-title`); the rows open by `::details-content` where the browser has it, and `AccordionPart` opens the closed
  rows on `beforeprint` and closes them again after. The screen is unchanged.
- **A graph-engine scene with steps does not move on load on a phone** (SPEC.md 6.14). Its phone layout and its calm
  height came from the script (the height from the window's), so the stage grew or shrank when it ran (96 to 134 px on
  two fixtures). The calm height is now worked out for a fixed phone window and the server writes each phone width's
  shape; one phone rule, min(680px, 82svh), holds every stage. A 3D-only scene's control row and hint are in the
  server's page (they appeared when the script ran; they leave only if the browser cannot draw in 3D).
- **A stage printed before it hydrated prints whole.** A stage waiting for its turn to hydrate, or on a page with
  scripts off, had no print height: the print rule held it to one sheet and its drawing ran over the text below it
  (on a long page, most of its stages). The server now also draws each stage at the print width (`PRINT_W`), shown
  only on paper, and writes that drawing's print sizes and shape into the stage's `style` attribute as custom
  properties (`cssVars`, `src/ui/css-vars.ts`; no style element, so strict Trusted Types holds). A stage's server
  markup grows by one plan (8 instead of 7).
- **A still or static graph-engine scene does not move on load** (SPEC.md 6.14). Its stage height was set by the script,
  so the server's page drew it at the default shape and the page below jumped when the script ran (4 to 11 px on a
  laptop, up to 287 px on a phone); its heights are now custom properties in the part's `style` attribute, picked by
  container queries. On a phone every animation is edge to edge before the script runs (it was its column's width).
- **3D names no longer crowd, touch dots or float** (SPEC.md 6.14). Names keep 4 px from each other, from every
  token's dot and from other things' outlines; a name is nearest its own box; pills stay by their cube; two names on
  one line keep 16 px apart; a layer plane is whole or left out, its name kept. Over the eight 3D fixtures at 1280 and
  390 (every step at rest): words under 4 px apart 106 to 7, words on a token's dot 32 to 1, two names read as one
  phrase 29 to 1, words on an outline 1523 to 249, words on a line 213 to 108, names nearer another box than their own
  658 to 490. No name is hidden that was shown before (62 not shown, before and after).
- **A sent token's label pill no longer touches the moving dot** (SPEC.md 6.14). It was placed off the dot's own
  size, 0.5 px from the halo drawn around it; it now keeps 3 px off the halo.
- **Speech beside a thing points at it** (SPEC.md 6.14). Only speech above or below had a tail; on a phone, where speech
  often sits beside the thing, it pointed at nothing.
- **An issue in Markdown that follows a plain code block points at the Markdown's first line**, as every Markdown issue
  does, not at the line after the code block (a code reference above a ```` ```ts ```` block was reported 30 lines
  below itself).
- **Stepping a composed stage never moves the page:** the caption under the steps keeps the room of the tallest
  step's caption from the first step (every caption sits in one grid cell, the others hidden and `aria-hidden`), so
  on a phone a caption that wraps to one more line no longer makes the stage 18 px taller on that step.
- **A composed stage's LLM view reads as words, not source** (rc.2 reviews): a time row's look is said in words in
  its brackets (`hold 1 to 2 (step 1 only, warning)`, not `(steps 1 to 1) [warn]`; `[plain]` reads `neutral`); a row
  label's `|` reads as a comma (`(a) Draft, writes`); a row drawn without a label is named by its id when that is a
  word, else as `the server row`; an unlabelled dot is `Dot 5.`; `cells: 1` reads `One state cell per shift.`; a
  grid item whose chip is its own state says it once (`kept.`, not `kept, kept.`); a sheet's `sum` card names its
  group once; a `say` with a `|` reads with `;`. The drawing does not change.
- **doccheck wording:** a colour or pixel size in a stage reads `no colour value (#ff0000): ...` (it read `no a colour
  value`); a composed stage with one `@step` is refused once, in the stage's own words (it was refused twice).
- SPEC 6.13 names the package's stage files (`src/ui/stage.tsx`, `src/core/stage.ts`, `src/core/stage-core.ts`), not
  the prototype's, and says the tick label's later-step reveal once.
- **SPEC 6.13 opens with the stage's core words:** one table of fourteen rows (roles, lanes, cards, cards inside cards,
  steps, lines, show, hide and light, tones, tags and says, keys, the head blocks, `static`), each with a real example;
  the long tail follows as before. A test builds a page from the examples and checks it clean.

### Added: static on the terminal, file tree, editor and code walk; a static page; print draws every part (SPEC 4.1)

- `static` (the bare word), `static=<number>`, `static="<step title>"` and `static=false` on a terminal, file tree,
  editor or code walk draw one state whole on the server: every command typed (a terminal), the last tree, the file
  after the last edit, the last step of a walk (or the step named), with no control row. The bare word `static` now
  reaches every fenced part (before, only folder parts read it) and is never an animation's kind.
- Front matter `static: true` makes every part of the page static. `DocumentView`'s `static` prop (the host's option)
  wins over it; a fence's own `static` wins over both.
- Print: `hydrateDocument` adds `printUnseen` (also exported from `react/hydrate`): before the page prints, a part still
  waiting for its turn to hydrate is drawn at once, static, where the server's HTML stood; after printing it goes back.
  Print CSS for these parts: no control row, panes grow to what they hold.
- doccheck: `static=<number>` outside the part's steps and `static=<title>` that names no step are errors (a terminal's
  steps are its commands); a value on a part with one state is a warning; a front matter `static:` that is not true
  or false is an error. `static="<title>"` reaches the renderer as its step number.
- Every fixture renders the same HTML as in 0.7.0-rc.2 (none asks for static on these parts); one new fixture,
  `fixtures/format/81-static-live-and-still.dh.md`, shows the same parts live and static.

### Fixed: static drops the media controls; the Wardley map fits a phone (SPEC 4.1, wardley)

- **Static media.** Under a page's `static: true` (or the host's, print, or the fence's own `static`) the carousel shows
  every image as a grid, the PDF one page with no toolbar, and the Lottie its still frame with no control row. Before,
  all three kept their arrows, page buttons and scrubber. Audio and video keep their players.
- **Wardley map on a phone.** The map is laid out at the width it has (300 px at least), so "Customer" and the
  evolution words are whole at 390 and no sideways swipe is needed. A wide stage and the server's HTML are unchanged.

### Changed: the composed stage samples: stories first, edge cases apart

- **Eighteen stage samples that check one edge case of the layout are titled `Test: ...`** (their fixtures are
  `fixtures/stage/NN-test-*.dh.md`; the first says what the group is). The example index lists them after the stories,
  under "The composed stage: tests and edge cases" (rc.2 reviews: about half the samples read like fixtures).
- **The swimlane matrix sample's chips come in when the story makes them** (fixture 04): the API's `202` at the step
  it answers, the stored `original` and `3 sizes` at the step the worker writes them (`+ [id] words` and `show id`).

### Changed: kube-proxy and the Kubernetes samples; a wide table says to swipe

- **kube-proxy takes the real path** (Format fixture 66, now `Animation: a packet through kube-proxy`): a flat scene
  in one fixed view; the packet goes from the frontend's veth into node 1's kernel (a rule kube-proxy wrote rewrites
  the service IP to web-2's), out of node 1's network card, through the VPC (its route shown) into node 2's card and
  kernel, then web-2's veth; the reply comes back the same hops and node 1's conntrack undoes the rewrite. The old
  3D-only scene ("goes straight to web-2: pod to pod") is kept as a test fixture of the 3D engine.
- **The other Kubernetes and service-mesh samples say the same:** a service is a stable name and address whose calls
  rules on every node spread over its pods (fixtures 52 and 72).
- **The service mesh draws the real hop too** (fixture 53), laid out as kube-proxy: node 1 (the control plane's pod,
  pod orders, its network card), the network under the cluster, node 2 (its card, pod payments); on a phone they stack.
  The encrypted call leaves the orders proxy, goes out of node 1's card, across the network and into node 2's card
  before the payments proxy decrypts it, and the retry takes the same hops. No line runs proxy to proxy any more, and
  the camera no longer moves.
- **One focus per step** in both scenes: kube-proxy's opening steps light one thing (kube-proxy, not its rules too),
  and the mesh moves one token per step; its control plane pushes the retry rule to the orders proxy, the one that retries.
- **One focus per step in the array, map and tree scene too** (fixture 63): finding 40 in the tree lights 50, then 40,
  in steps of their own (it lit both in one step).
- **Two lit things in a step only when the words name one relation** (compare, collide, talk to, an even load):
  fixture 70 lights Paris, then Mumbai, in steps of their own, and the captions of fixtures 47, 57, 67 and 94 now say
  the relation; `test/rc3-one-focus.test.ts` lists every step that may light two or more.
- **A lookup in a hash table is one focus.** `get <map> <key>` lights the entry only; its bucket is framed (a thin
  grey outline, about 3:1 where the lit accent ring is 4.7:1 or more; its fill, words and border stay) and still kept in view, in 2D and 3D. It lit both.
- **A table wider than its box** fades on the side that has more of it and says `↔ Swipe the table to see all of it`
  under it, both following the scroll (`DocumentView`; `src/react/table-more.ts`); neither shows in print.
- **A table wider than the text column leaves it on a wide screen** (a Markdown table of the document itself, not one
  in a list, a quote or a part): as wide as its columns need, at most the page less 16 px each side, centred on the
  column, so a wide screen shows every column (at 1680 px a 6-column table had lost its last 3). A table that fits
  keeps the column exactly; one still wider than the page scrolls with the fade and the swipe line. CSS only
  (`src/styles/dh.css`): it paints at its final width, so nothing moves on load; print keeps the column. A host whose
  text column is not centred on the page caps it with `--dh-table-max` (`100%` turns it off).

## 0.7.0-rc.2

The second release candidate of 0.7.0 adds one new part: the composed stage. The format number stays 10 in this
candidate, as in 0.7.0-rc.1. Every page, fixture and sample that parsed in 0.7.0-rc.1 parses, checks and renders the
same: an `animation` whose setup reads like a graph (boxes, pills, groups and their lines) stays the graph engine's, and
none of the package's own animations changes (checked on every fixture and the example).

### Added

- **The composed stage** (`animation`, SPEC.md 3.12 to 3.14): a scene laid out once for every step, so nothing moves
  between steps. An `animation` is a composed stage unless its fence asks for the graph engine (`layout=graph` or
  another engine layout, `3d`, a kind) or its setup reads like a graph. Its words, by group:
  - **Scene and steps:** `title:`, lanes (`## Lane`, left to right), bands under or over lanes (`## Band under A..B`,
    `## X above A..B`), `@step Title: caption`; per step `show`, `hide` (cards, and `hide ## Title` for a heading),
    `light` (`light none` for no card), `dim`, `dashed`, `cross` (and `cross ids corner`), `text id:`, `state id:`,
    `tone ids`, a key (`key role [tone]: words`, `[dashed]` for a state not reached yet); `notes: above`, `flow: off`, `lines: straight`, `layout: row`.
  - **Cards and panels:** a card `role ids: title | line | line` (a box tone after the role: `card job [bad]: title`),
    cards inside a card (one level), pills that move,
    token chips, records, badges (`+ (a) words`, `badges: stacked`), lines in a tone or role (`(good) words`) and the
    panel marks (`. `, `> `, `~ `, `= `); panels shown in one step in one region: `grid N`, `rows` (`_` an empty cell,
    `- words` a dropped one, ` [chip]` boxed cells), `list Title` (`| roomy`), `cells a: 32, +4 new` with `labels:`.
  - **Connectors:** `a, b -> c: label` (`-->` dashed, `<-` from the right side), ends at a pill or a badge (`id.a`),
    a label in a tone (`(bad)`), `keep a -> b: words` (the words stay while the line does), `x2` (two per pair;
    `x2: first | second` labels each copy), a chain `a1, a2 --> b --> c` (each hop as if on its own line).
  - **Head blocks:** a phase track (`track:`, `at phase`; `form: chips`, `form: chips | arrows`, `form: chips | roles`,
    `place: beside where`; only the current phase is drawn as current), a worksheet (`sheet:`, `fill`, `mark`, `sum`, `pass`, an outcome column), bins, counted columns and a
    bar chart in a scene (`columns`, `bars`: a `peak:` bar keeps its highlight, and a bar is drawn over a
    `limit` only when it is above it), and a swimlane matrix (`matrix:`).
  - **Time block:** `time: a..b | unit`, rows of states (`row role id "Label": a 0..3; b 3..7`), a state in its own
    role (`b 3..7 (server)`), `[soft]`, `[dot]` and `[dot] [plain]`, markers (`at`, `keep at`, `[beside]`, `[below]`,
    `[tick]`, `[caption]`), `ticks:` with words, a reveal step (`@3`) and a tone, `zoom:` (`| below`, `| bracket`),
    `window:` with `height: N lines`, `axis: First..Last` under the lanes, `band role id "Title": first..last`, `span
    row a..b [bar]`, `tag row a..b: words`, `hush at`, `hush span`, `dot row a..b [tone]`, `fill row`, arrows between
    rows (`arrow a -> b at 1.5`) with one tone, counted units, a row label as a chip (`row ... [chip]:`), span words
    `[above]` the stroke or `[bare]` without one, `[dashed]` with a tone (a faded preview), a band's `| compact`, and
    the caption on the tick-number line (`time: a..b | caption | beside`); a marker's words sit above the rows by their
    own line.
  - **Roles and colours:** `roles:` in the front matter names each role's colour (`c0` the neutral, `c1` to `c8`);
    several roles may share a colour on a page, never in one scene; `theme: { fill-c1: "#RRGGBB #RRGGBB" }` sets a
    colour's fill on the page's stages, light then dark.
  - **On a phone:** lanes stack and stacked lanes never on screen together share a place; a line that would cross a
    card takes the side channel, and a gap whose lines fall back to the right edge grows (4 px at a time, at most 12 a
    gap and 24 a stage); numbers in narrow cells stay level, or stand on end only inside their own cell, or stagger,
    and every cell keeps its number; a word too wide for its cell gets a key and a caption row; staggered words keep
    10 px from their neighbours on a page-coloured backing, each with a leader from its own cell; a carried chip and a
    token's remark stay inside their frame; no word is ever under 11 px.
  - **doccheck:** a composed scene is exempt from the 400-token rule and warns over 2,000 tokens in the LLM view; it
    refuses, naming the line and the fix: a coordinate, pixel size, colour value or millisecond option in the source,
    a role the page does not declare (it lists those it does), two roles of one colour in one scene, an unknown card,
    lane, phase, pill, token, key, sheet row or column, or time row (each lists the known ones), ids that do not match
    their titles or appear twice, a time axis, tick, zoom, window, band, span, tag or marker that does not read
    (SPEC.md section 9 lists them all), and a scene over its caps or over the page's stage budget.
  - **LLM view:** a stage's words follow its drawing: a `[dot]` interval is a dot, a row drawn only in the zoom inset
    is listed under the inset, a bar chart names its tabs and every lit bar and why it is lit (the peak, over the
    limit, gives, takes, marked, lit), and a counted column lit again is "lit", with its change since the step before,
    not "new".
- **`AnimationBlock.stage`** (additive): a composed stage's block carries `stage: { src, roles }` beside `anim`, which
  every animation block still has; `animationTexts(block)` reads either. The React `AnimationPart` draws a stage with
  the stage's own view, and `dist/styles.css` holds its rules (`.stg*`).
- **Theme tokens:** `--c0`, `--c0-fill`, `--c0-soft`, `--c0-plane`, `--c0-ink` (the neutral role, light and dark), and
  in dark `--c1-dot` to `--c8-dot`, `--acc-dot` and their `-dot-new` (a column's plain and lit dots); a stage's own
  `--stg-*` tokens live in its stylesheet.
- **A budget for each stage:** each stage's compile, and each of its plans (one width), runs on a budget of its own
  (38,000,000 units of work, four times the heaviest real plan); every part of a layout counts, the connector router's
  search included, so a page of many stages, laid out again on every resize, never runs out, and a scene of a few
  hundred connectors is refused in about a second and a half instead of keeping a page busy. A stage over it is never
  blank: it shows its title, a message that names the budget and the fix, and every step in
  words; every other stage draws. In a parse, a stage over the page's budget is an error block and a problem, like any
  part over its budget.
## 0.7.0-rc.1

A release candidate of 0.7.0. It holds what has passed review so far; 0.7.0 itself may still change before it is final,
and the package's new name comes with 0.7.0, not with this candidate. The format number (`FORMAT_VERSION`,
`doc.format`) stays 10 in this candidate; it becomes 11 with 0.7.0, when SPEC.md is renumbered (the additions marked
"format version 11" below and in SPEC.md are already here). Every format 10 page, fixture
and sample parses, checks and renders as in 0.6.2, apart from the parts that moved into folders (listed below), which
read the same text and draw the same things.

### Added

- **One folder per part.** A part is a folder under `src/parts/<name>/` with its parser, its view, its LLM view, its
  doccheck rules, its tests and its own sample; `bun run parts` generates the lists that load them, and `bun run
  part-check <name>` builds its sample and checks it in a browser (1280 and 390, light and dark, strict Trusted Types).
  A part's parse context carries the page's front matter (read-only); a part may claim more fences, chart kinds and
  bare-word flags, may name the local files its data refers to, and may be exempt from the 400-token rule. The
  generator refuses a folder named `svg` or `interactive` (they exist only as references).
- **Parts in folders:** fishbone, sankey, timeline, venn, sequence, gantt, wardley, flame, trace, stacktrace, log,
  explore, compare, compare-image, gallery, downloads, audio, video, lottie, pdf, and `chart-kinds` (histogram,
  boxplot, violin, funnel, waterfall, treemap, sunburst, calendar). The core chart gains steps, a time axis with time
  zones, annotations, number formats, a heatmap, line styles, a scale switch and a calculator.
- **Inline parts** on one hook in the Markdown core: the `:spark` sparkline in a sentence, and the **glossary**
  (a block of terms; each term's first use in a section is marked and opens its card; `ParseOptions.glossary` lets a
  host hand in a word list, which the page's own definition overrides).
- **A Node-only entry** `durian-hypermedia/node` that checks the local files media parts name: sizes, checksums,
  Lottie contents, PDF pages and that every path exists. `parse` and the browser never call it.
- **A part budget can carry the part's name**, so a refusal says which part ran out; without a name the words stay the
  same.
- **References** (format version 11, SPEC.md section 8a): `[[<type>:<name> "label"]]` stands for a part the host keeps.
  On its own paragraph it is a block, in a sentence a chip, in code text. `parse(text, { resolveReference })` asks the
  host, which answers pending, ready (the part's source, read with the same caps and budgets as an inline part and drawn
  by the same part dispatch) or failed. No resolver: the label as a chip. The LLM view keeps the reference as written.
- **`svg` and `interactive` exist only as references.** An SVG is drawn only through an `<img>`. An interactive part
  runs in a sandboxed frame with an empty origin, no network and no storage, only when the host turns it on
  (`interactive="on"` and `InteractivePart` from the new entry `durian-hypermedia/react/interactive`, the only module
  with a Trusted Types policy, `dh-interactive`). A fenced ```` ```svg ```` or ```` ```interactive ```` is refused, naming the
  reference form.
- **Caps** `maxReferences` (500; 100 in `UNTRUSTED_LIMITS`), `maxReferenceBytes` (1,000,000; 400,000),
  `maxSvgBytes` (200,000; 100,000), `maxInteractiveBytes` (204,800). Each reference charges the page budget.
- **Block types** `ReferenceBlock`, `SvgBlock`, `InteractiveBlock`; inline `{ t: "reference" }`; tokens `--ref-*`, `--ix-*`.

### Changed

- **New dependencies**, pinned: `lottie-web` 5.13.0 (light build), `pdfjs-dist` 6.5.438 and `chartjs-chart-matrix`
  3.1.0. Each is loaded only by the part that needs it; the Markdown renderer loads only the inline parts' views.
- The sankey fits its card, keeps room for its end labels and no longer changes height when it loads.

### Fixed

- A gantt in a named time zone charges its zone work to the part's budget.
- The built `dist/` uses production JSX (`react/jsx-runtime`), so it imports under `NODE_ENV=production`.
- The Node entry checks the paths it is given more strictly, and its checksum message says only that the checksum differs.
- A glossary meaning's links go through the host's `urlPolicy`.
- Media parts cap the bytes they read while reading and ask the host's `image` policy for their addresses (download cards use its `link` policy); new caps for captions, thumbnails and transcripts (SECURITY.md, Media).
- A Lottie file is kept inside its part (SECURITY.md, Media).
- A backslash-quote inside a double-quoted attribute is a quote, read by one linear scan.
- The CSP check and part-check serve on a port the system says is free, stop when their page server did not start, and
  their headless browser never outlives its runner and removes its own profile and temporary folders.
- An interactive frame reports its body's height, so it also shrinks to fit.
- explore and log: the query languages and their regular expressions are charged for every step and every character
  they read or make, before the work is done; a log keeps at most `logLines` lines and a CSV table at most
  `exploreCsvCols` columns in the parsed page. A long chain of alternatives in a query is charged for the work it does
  (a page of them stays within the explore figures in SECURITY.md), and a text tool that cannot make its text
  is refused as a query error that `try` can catch.

## 0.6.2

A security fix: the text of a page is read in time linear in its length, and the work that cannot be (a YAML parser's,
an animation's layout) has caps. Format version 10 is unchanged; every fixture, sample and the Format page parse, check
and render exactly as in 0.6.1. Of about 2,400 other real pages compared with 0.6.1, all but 26 read exactly the same:
18 differ only as listed under Changed, and 8 drafts with an animation over `maxAnimWork` show it as an error block.

### Fixed

- **Markdown is read by markdown-it, in linear time.** marked (0.6.1 and before) backtracks on some ordinary-looking
  text, so a short message could keep a page busy for seconds. markdown-it 15.0.3 (MIT) reads CommonMark in time
  linear in the text; its library build is vendored in `src/vendor/` (src/vendor/README.md says why and what). GFM
  tables, strikethrough, task items and autolink literals are rules of this package, each one pass over the text. The
  tree keeps 0.6.1's choices where a page could tell: a list item's paragraphs are text, white space at the start of a
  line stays, character references other than the five it always decoded stay as written, a link's address and title
  are as written.
- The LLM view's rewrites of keys, mouse actions, code spans and links to other pages are one pass each (same results).
- **Long ordinary text is much faster.** Every part and plain Markdown now take time and memory linear in the input. `test/linear.test.ts` checks it; `bun run bench` holds time and memory per KB to a budget; a CI workflow
  runs both.
- A long code block renders in linear time (one text token per line for Code Hike).
- The parts' own syntax (fences, containers, steps, file tree rows, `@file` lines, terminal prompts, tab headings,
  tier lists, alignment grids) and `check()`'s scans of prose and code references are read in one pass. A code
  reference's symbol is matched as text (one with `[` used to stop `check()`).
- **YAML is sized before any parser reads it.** A parser's work grows with the keys and values it builds, in some
  parsers with the square of one map's keys. Front matter and each chart may have at most `maxYamlChars` characters
  and `maxYamlNodes` nodes, and a page `maxPageYamlChars` and `maxPageYamlNodes` in all, counted from the text for
  any parser; over them, front matter is ignored with a problem and a chart is an error block. The default caps
  (`LIMITS`) give the largest real pages measured about twice the room they need; a chart with more data written out
  than the caps is an error block (compute it, or raise the caps).
- **Animations are laid out on a work budget.** Layout and line routing are counted as they are done, up to
  `maxAnimWork` for one animation and `maxPageAnimWork` for a page; over them the animation is an error block and the
  rest of the page draws. Each animation is compiled once per `parse()` (it was compiled about five times), and label
  wrapping, kept slots and the line router's search no longer rescan; what is drawn is the same.

### Changed

- Markdown edge cases follow CommonMark and GFM where marked did not (on the CommonMark spec's examples: 20 now match
  the spec that did not, 1 white-space-only case matched before and not now; on GFM's: 19 and 1; the full list is in
  the 0.6.2 pull request). What real pages showed, checked against commonmark.js and GFM:
  - one-tilde strikethrough follows the same flanking rules as `~~`: text such as "about ~5 of ~10 (~50%)" stays as
    written (marked struck through the words between two of the tildes);
  - white space at the end of a paragraph, and at the start of its continuation lines, is not kept (the page looks the
    same);
  - a tab in a fenced code block inside a list item stays a tab (marked turned it into spaces);
  - `<` followed by something that is not an HTML tag (`<file_name>`) is plain text in one piece (the same text);
  - a bare `www.` starts at a line start, after white space or after `*`, `_`, `~`, `(` (GFM); a bare `http://`,
    `https://` or `ftp://` after any character that is not a letter or a digit, as in 0.6.1 (`url=https://...`,
    `"https://..."`), but not after a letter or a digit, nor after a `<` that opens no autolink; a domain is judged
    without the punctuation after it, so `_https://example.com_` and `www.example` are links;
  - an ordered list that does not start at 1 does not interrupt a paragraph (inside a list item it still nests, as
    before).
- New output caps far past real pages: a part's steps carry at most 1,000,000 characters (2,000,000 a page), an
  alignment grid at most 400 cells and 400 regions, a page's tables of contents at most 2,000 headings; past them, an
  error block with the source as plain code.
- `Limits` (and `parse(text, { limits })`) has six new caps: `maxYamlChars`, `maxPageYamlChars`, `maxYamlNodes`,
  `maxPageYamlNodes`, `maxAnimWork`, `maxPageAnimWork` (SECURITY.md).
- New export `UNTRUSTED_LIMITS`: `LIMITS` with smaller YAML and animation caps, for text nobody reviewed (a chat reply,
  a streamed message): its slowest pages parse about three to five times quicker. `LIMITS` stays the default
  and is sized for authored pages (SECURITY.md has both sets and their measured worst cases).
- Dependencies: `marked` is gone; markdown-it's runtime imports `entities`, `linkify-it`, `mdurl`, `punycode.js`
  and `uc.micro` are added (MIT, BSD-2-Clause).

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
- **YAML merge keys** (`<<`), **tags** (`!`) and **directives** (`%`) are not read in a YAML text that also uses an
  alias: the front matter or chart is refused with a message saying so. Without an alias they are read as before.
  An alias counts wherever it is written, but only when an anchor with the same name start exists, so Markdown in
  values is never one. Next to a real alias, a "!" after a blank in a value (as in "x !y") is taken for a tag.
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
