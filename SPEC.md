# Durian Hypermedia: the format

> Format version 10 (pass 10, 2026-11-21 Pacific time). Version 9 is in SPEC.v9.md, version 8 in SPEC.v8.md, version 7 in SPEC.v7.md, version 6 in SPEC.v6.md, version 5 in SPEC.v5.md, version 4 in SPEC.v4.md, version 3 in SPEC.v3.md, version 2 in SPEC.v2.md.

**Answer first.** Durian Hypermedia is plain Markdown plus a few parts. Plain Markdown is used wherever it already says the thing. A part with data is a fenced code block whose info string names the part (```` ```terminal ````, ```` ```animation ````). A part that holds prose is one of four containers (`:::tabs`, `:::accordion`, `:::human`, `:::llm`). Steps are not a part: any part becomes step by step when it holds `@step` lines. An animation is one engine for everything: entities, layouts, a camera the reader can move, and steps (section 6). The same scene draws flat (2D) or in 3D, where its layers can be split apart and zoomed into (section 6.9). Every size, colour and placement on the stage comes from a small design system (section 6.10). The LLM view takes the wrapper off and keeps the content; only a chart (its data, as a table), a tier list (one line per tier), an alignment grid (a table of cells or points) and an animation (what it starts with, then its captions) get something in their place.

People write one source file (`.dh.md`; a page with no part stays `.md`). A person reads the rich page made from it; an LLM reads the LLM view, which `dh llm` writes from the same source. The `dh` tool only parses and writes; every check is doccheck's.

On the stateless replay article: source about 5,200 tokens, what a person reads about 4,700, LLM view about 4,200.

## 1. The building blocks

| Block | Written as | Example |
| --- | --- | --- |
| a part with data | a code fence named for the part | ```` ```terminal ```` |
| a part that holds prose | a line `:::name`, closed by a line `:::` | `:::tabs` |
| steps on a part | a line `@step <title>` inside it | `@step Init call 1` |
| inline part | a word in a sentence | `:kbd[Left]`, `:mouse[click Next]` |
| table of contents | one line | `::toc` or `::toc{depth=2}` |
| callout | a blockquote with a bold marker | `> **Watch out:** ...` |
| own marks and prefixes | front matter (or the host's `marks` and `prefixes` options of `parse()`) | `marks:`, `prefixes:` (section 3.1) |

- **Parts with data** are `terminal` (also written `console` or `shellsession`), `filetree`, `editor`, `codewalk`, `chart`, `mermaid` and `animation`. Any other fence (```` ```ts ````, ```` ```diff ````) is a plain code block. On any Markdown viewer (GitHub, an editor) a part still shows as readable text.
- **The info string** after the part name may carry `#id`, `key=value` or `key="two words"`. Ids are optional: give one only when something links to the part.
- **Containers** do not nest. Inside `:::tabs` and `:::accordion`, every heading (at the highest level used inside) starts one tab or row. Containers may hold fenced parts.
- **`:::llm` belongs to the part or `:::human` segment right before it** (blank lines between are fine). An LLM reads it instead of that part.
- **`.dh.md` only when needed.** doccheck refuses a `.dh.md` page with no part, and a `.md` page with one.

## 2. The LLM view: strip the wrapper, keep the content

| In the source | In the LLM view |
| --- | --- |
| prose, headings, lists, tables, code blocks, code references | kept unchanged |
| ```` ```terminal ````, ```` ```filetree ````, ```` ```editor ````, ```` ```codewalk ````, ```` ```mermaid ```` | the block as written; `#id` and `title=` dropped from the info string |
| ```` ```chart ```` with fixed data | its data as a Markdown table, under one line naming the kind and title |
| ```` ```chart ```` with controls or formulas | its source as it is (the formulas say more than one set of numbers) |
| ```` ```tierlist ```` | one line per tier, `S: Postgres (does everything), SQLite`, under a line naming the list; colours dropped |
| ```` ```alignment ```` | one line naming the axes, then a table cell → items and a table item → (x, y); empty cells left out |
| ```` ```animation ```` | one line of what the stage starts with (entities and connectors), then the step captions as a numbered list |
| `:::tabs`, `:::accordion` | the headings and the text under them |
| `:::human` | the `:::llm` after it, or nothing when it is `:::human llm=none` |
| any part followed by `:::llm` | the `:::llm` text |
| `::toc` | dropped (the headings are there) |
| `:kbd[Ctrl+K, Ctrl+S]`, `:kbd[Left]` | `Ctrl+K, then Ctrl+S`, `Left arrow` |
| `:mouse[double-click index.ts]` | `double-click index.ts` |
| callouts | kept; `> **Security finding:**` is dropped only from the public render's view (`dh llm --public`) |
| a relative link to a `.dh.md` page | the same link to its `.md` view |
| front matter | `title`, `concept`, `description`, `namespaces`, `type`, `pins`, `marks`, `prefixes`, plus `source:` |

- **The size rule.** A fenced part whose LLM form is over 400 tokens (characters ÷ 4) needs a `:::llm` after it. doccheck's check "LLM text present" names the size and the limit.
- **The only way to give LLMs nothing** is `:::human llm=none`, so it is always a visible choice.
- **Inside `:::human`** parts need nothing for LLMs: the segment's `:::llm` replaces all of it.
- **A `:::llm` text is short and stands alone.** doccheck warns above 160 words. It may not hold a watch-out or security block.

## 3. Every part from one example

Each example below is complete; an author or an LLM can write the part from it alone. The Format page shows each one rendered and as an LLM reads it.

**Terminal.** The shell-session convention every docs site uses (GitHub's and Shiki's `console`): a line that starts with `$ ` (or `% `, or `# ` for root) is a command, typed at that prompt and highlighted as bash; **every other line is output**, shown as it is, including a program's own questions and the answers typed into them. Each command is one step; `@step <title>` lines set the steps instead. ```` ```console ```` and ```` ```shellsession ```` are the same part. A ```` ```sh ```` block stays still. A page may add prompts of its own, such as `>>> ` for a Python session (section 3.1).

````
```terminal title="two people"
$ scaffold create acme/hello ./hello-app
? Project name? hello-app
✔ Created hello-app
```
````

**File tree.** Two spaces per level; a name ending in `/` is a folder. A mark is a word in brackets after the name: one from the built-in list, or one of your own (section 3.1); the page shows its label as a chip, only where it is used. `# text` is a note; `...` stands for entries left out.

````
```filetree
@step After scaffold create
hello-app/
  .scaffold_state.yaml  (new)  # answers, kept for update
  node_modules/  (closed)
    ...
@step After the user edits it
hello-app/
  README.md  (changed)
```
````

**Editor.** The file tree and one file pane, no tabs. A line with a path is a file of a repo, read at the page's pin (`repo=` names the repo, or the path starts with a pinned repo). `@file <path>` makes a file up, right here; its lines follow. `(open)` marks the file shown first. `@step <title>` is an edit: `+` adds a line, `-` removes one, a space keeps one; a first line `@@ <path>` picks the file, else the edit is in the file shown. An edit line is one sign (`+`, `-` or a space) followed by the file's line exactly as written, its own indentation included.

````
```editor
@file src/greet.ts (open)
export function greet(name: string) {
  return 'Hi ' + name;
}
@step Add an exclamation mark
@@ src/greet.ts
-  return 'Hi ' + name;
+  return 'Hi ' + name + '!';
```
````

**Code walk.** Each `@step` names a code reference with a line range, then `focus=` and `mark=`; the note follows. `#L..` alone keeps the file of the step before. Code Hike draws it; focused lines are marked and the rest stay readable. **Code may also be written right here**, with the editor's syntax: before the first `@step`, `@file <path>` starts a made-up file whose lines follow; a step names that path (a made-up file wins over a repo file of the same path), and may leave out the range to show the whole file. So the editor and the code walk both take either a repo reference or inline code.

````
```codewalk repo=example-repo
@step sdks/node/src/domain/template/service.ts#L16-L24 focus=17-18
The SDK builds the inquirer for this call only.
@step #L25-L31 focus=28
The checkpoint exception becomes a question reply.
```
````

````
```codewalk
@file src/greet.ts
export function greet(name: string) {
  return 'Hi ' + name.trim();
}
@step src/greet.ts focus=2
Trim the name before greeting.
@step src/greet.ts#L1 focus=1
The name is a plain string.
```
````

**Animated or still.** A code walk moves between steps in one of two ways. *Animated* morphs the lines of one step into the next and is for the same code changing (a function growing step by step). *Still* does not morph: the step's file is shown whole, the step's lines (`#L..`) are open and marked, the rest of the file is folded into a one-line bar ("… 12 lines") the reader can open, and a move to the next step switches marks and folds at once. Moving between different functions or files is still, because a morph between unrelated code only confuses. By default a move is animated when the next step is in the same file and its lines share a line with the step before, and still otherwise. To say it, write `animate=on`, `animate=off` or `animate=auto` on the fence (every move) or on a `@step` line (the move into that step; it beats the fence; `auto` there means the default rule). `animate=` is not allowed on step 1. An LLM reads the code and the notes; the LLM view leaves `animate=` out. Add to the table of section 3: `code walk | animate=on|off|auto | animated or still moves (default auto)`.

**Diagram.** A plain mermaid block. With `%% @step <title>` lines (a mermaid comment, so it still draws anywhere) it builds up: step k draws every line up to its end.

**Chart.** The chart keys: `kind` (bar, line, area, scatter, bubble, radar, pie, doughnut, polar, candlestick), `title`, `x` (a list, or `{label, values, min, max, scale}`), `y` (`{label, min, max, scale}`), `y2` (a second value axis on the right: `{label, min, max, scale}`), `series` (each `name`, `data`, and optional `kind`, `axis`, `tone`), `stacked` (`true` or `percent`), `horizontal`. Plus `controls` (slider, select, toggle, button) and `let` (formulas in the small expression language of SPEC.v2.md section 8). Section 7 says what each kind and option does and what doccheck refuses.

**Candlestick chart.** `kind: candlestick` draws one candle per period. The series that has no `kind` is the candles: its `data` is one `[open, high, low, close]` per period (`null` for a period with no candle), and `x` lists the periods. The body runs from the open to the close, the thin wick from the low to the high; a candle that closes at or above its open is up (the theme's `good`, a light body), one that closes lower is down (`bad`, a solid body), so colour is never the only difference. A series with `kind: line` is drawn on top (a moving average); it may use `y2`. `title`, `x`, `y` (`min`, `max`, `scale`) and `controls` work as in any chart; `stacked`, `horizontal`, a bar or area series and `tone` on the candles are refused. A tap or hover shows all four values.

````
```chart
kind: candlestick
title: One week of a share price
x: { label: day, values: [Mon, Tue, Wed] }
y: { label: price, min: 90 }
series:
  - name: price
    data: [[100, 108, 98, 105], [105, 110, 101, 102], [102, 104, 95, 96]]
  - name: 2-day average
    kind: line
    data: [null, 103.5, 100]
```
````

````
```chart
kind: bar
stacked: true
title: Size of each init call, in bytes
x: { label: init call, values: [1, 2, 3] }
series:
  - name: answers
    data: [0, 48, 96]
  - name: deterministic state
    data: [0, 40, 40]
```
````

**Tier list.** A ranking in rows, best first. It is line-based, not YAML: one line per tier (the tier's name, a colon, then its items separated by commas), so the source already reads like the LLM view and like plain text on GitHub, and a model writes it right the first time. A short note goes in brackets after an item (`Postgres (does everything)`); an item with a comma or a bracket in its name goes in quotes (`"Redis, as a cache" (fast)`). **A list may have any tiers, in any number**: three, four, seven. The tiers are `S`, `A`, `B`, `C`, `D` unless a first line `tiers:` names others (as many as you want, with any names) and may give each a colour in square brackets: `tiers: Must [good], Should [c6], Could, Won't [bad]`. A colour is `c1` to `c8` (the family colours) or `good`, `warn`, `bad`; a tier with no colour takes one by its place (pink, orange, yellow, green, blue, then the rest). Tier lines may come in any order and a tier with no line is an empty row; the page shows the rows in the order of the tiers. Each item sits in one tier, once. `title="..."` on the fence is the list's title. The page shows each tier as a tinted name block and its items as chips that wrap; an item with a note is a button that shows its note under the list when a reader taps or hovers it (the same text is the chip's `title`, so it also works without script). An LLM reads `Tier list: <title> (top tier first)` then one line per tier, `S: Postgres (does everything), SQLite`, an empty tier as `D: (empty)`.

````
```tierlist title="Databases for a small team"
S: Postgres (does almost everything), SQLite (no server to run)
A: MySQL, "Redis, as a cache" (fast, but memory is dear)
D: A spreadsheet
```
````

Own tiers, three of them (no S to D, and not five):

````
```tierlist title="Is it worth doing?"
tiers: Yes [good], Maybe [warn], No [bad]
Yes: Cache the build
Maybe: Rewrite the docs site (a lot of work)
No: Support every browser ever
```
````

**Alignment grid.** Two axes with names along them, drawn as a grid. It is free: each axis has **2 to 6 names** (the first and the last are the two ends, the rest sit between), and the two axes may differ, so a grid may be 2x2, 3x3, 2x4, 4x4, 5x3 or 6x6. More than 6 names would make cells too small to read. Also line-based. Two lines name the axes, `x:` and `y:`, each with its names joined by ` .. `. The first name is the left end of x and the top end of y. An item goes **in a cell**, by its column and row names (`lawful / good: Paladin (keeps oaths), Cleric`; a `"label"` before the colon names the cell, and a line with only a label and no items is fine), or **at a point**: `Fix the typo (one line) @ 0.12, 0.22`. A point's `x` and `y` run from **0 to 1**: 0 is the first end of the axis, 1 the last, the rest spread evenly between (so the top left corner is 0, 0). Cells and points may be mixed; each item is placed once.

**Looks of the grid** (all optional, all in theme colours: `c1` to `c8`, `good`, `warn`, `bad`, never a hex value):

| Line | Does |
| --- | --- |
| `low effort / high impact "Do first" [good]: ...` | a `[colour]` after the cell name (and its label) tints that cell; an empty cell may be tinted too |
| `region: low effort .. medium / high impact "Quick wins" [good]` | paints a block of cells: columns, a slash, rows, each one name or `first .. last` in axis order; an optional `"label"`; a colour is required. Regions may not overlap; a cell's own colour wins over its region's |
| `arrows: on` | draws an arrow along each axis, from the first name to the last (`off` is the default) |

The page draws the grid with the axis names on the top and left (on a phone the row names stand on their side so the cells keep their width, and a grid of five or six columns scrolls inside its own box, never the page); a point is a dot with its label, and the label is moved so that it covers no other label, dot or cell label (with a thin line back to its dot when it had to move). A tap or hover on an item with a note shows the note under the grid. An LLM reads one line, `Alignment grid: <title>. Columns (x, left to right): ... Rows (y, top to bottom): ...`, then a table `cell | items` (cells with an item or a label; "Cells not listed are empty."), one line per region (`Region "Quick wins": columns low effort to medium, rows high impact to medium.`) and, for points, a line saying what 0 and 1 mean and a table `item | x | y`. Colours and arrows are dropped.

````
```alignment title="Where does each task go?"
x: low effort .. medium .. high effort
y: high impact .. medium .. low impact
arrows: on
region: low effort .. medium / high impact .. medium "Quick wins" [good]
region: high effort / low impact "Avoid" [bad]
low effort / high impact "Do first" [c6]: Fix the typo
high effort / low impact: Rewrite the docs site
```
````

**doccheck on both** (each message names the fix): an unknown tier colour (it lists the colours); an item in a tier that does not exist (it lists the tiers, and says to add the name to a `tiers:` line); two tier lines for one tier; a `tiers:` line that is not first; an empty item (two commas); a duplicate item (in one tier or across tiers, any letter case; in a grid, in two cells or a cell and a point); an alignment axis with fewer than 2 or more than 6 names, a repeated axis name, or a missing `x:` or `y:` line; a colour that is not a theme name (a hex value too: the message lists the colours); a `region:` with no colour, with columns or rows out of the axis order or not on the axes, with a shape other than `columns / rows`, or overlapping another region; `arrows:` other than `on` or `off`, or twice; a cell whose column or row is not on the axes (a swapped pair is named: the column comes first); a point with x or y outside 0 to 1; a line that is neither a cell line nor a point line; an empty part, or one with no item; an attribute other than `#id` and `title=`.

**Tabs and accordion.**

```
:::tabs
#### Node
Install with `npm i @example/scaffold-sdk`.
#### Python
Install with `pip install scaffold-sdk`.
:::
```

**For people only, and what LLMs read instead.**

```
:::human
A long walk-through with a picture.
:::

:::llm
The short, precise version.
:::
```

**Animation.** See section 6.

### 3.1 Marks and prefixes: the built-in lists, and your own

Every mark is a word in the source. Each part has a built-in list; a page or a site may add its own for a file tree (marks) and a terminal (prefixes). doccheck refuses a word that is in neither.

| Part | Written | Meaning, and what the page shows |
| --- | --- | --- |
| file tree | `(new)` | did not exist before; a green "new" chip |
| file tree | `(changed)` | existed and was edited; an orange "changed" chip |
| file tree | `(removed)` | deleted; a pink "removed" chip, the name struck |
| file tree | `(generated)` | a tool made it; a blue "generated" chip |
| file tree | `(conflict)` | two changes disagree; a pink "conflict" chip |
| file tree | `(closed)`, `(open)` | a folder starts closed or open |
| editor | `+`, `-`, a space | a line added, removed, kept (in a `@step`) |
| editor, code walk | `@file <path>`, `(open)` | a made-up file; the file shown first |
| editor | `@@ <path>` | the file a step edits; the page marks edited files with an "edited" chip |
| terminal | `$ `, `% `, `# ` | a command at that prompt (`#` is root); any other line is output |
| code walk | `focus=`, `mark=` | the lines the note is about; one marked line |

There are no letters to learn: version 3 showed "A" for new and "G" for generated, which nothing in the source said.

**Your own marks and prefixes** (format version 10). A page defines them in its front matter, a whole site (a host) in one list: the `marks` and `prefixes` options of `parse()` take the same shape as the front matter (a docs site may keep the list in one file of its own and pass it on). A page sees the host's and its own, and its own entry beats the host's of the same name.

```
marks:                                   # file tree: written (deprecated) after a name
  deprecated:
    label: deprecated                    # the word the reader sees (default: the name)
    colour: warn                         # c1..c8, good, warn or bad: a theme name, never a hex value
    means: still works, but will be removed   # optional: what it says, shown in a key under the tree
prefixes:                                # terminal: a line that starts with the prefix and a space
  ">>>":
    label: Python
    colour: c4
    means: a line typed at the Python prompt
```

- **A mark's name** is lower-case letters and hyphens (`deprecated`, `needs-review`); a built-in name is refused. **A prefix** is 1 to 8 characters with no space (`>`, `>>>`, `sqlite>`); `$ `, `% ` and `# ` are built in. A line is a command at the longest prefix it starts with; any other line is output.
- **Defaults do not always show.** A file tree shows a chip only on the rows that use a mark, and a key under the tree only for the own marks it uses that say what they mean. A terminal lists the own prompts it uses (and nothing when it uses none). A mark or prefix that no part uses shows nowhere.
- **The LLM view:** a custom mark reads as its label (`(deprecated)` stays; `(needs-review)` with `label: needs a review` reads `(needs a review)`); a terminal that uses own prompts gets one line under it: `Prompts: >>> is Python (a line typed at the Python prompt).`. The `marks` and `prefixes` keys stay in the LLM view's front matter.
- **Translation:** a definition's `label` and `means` are translated; its name and its colour never are.
- **doccheck refuses**, naming the fix: a mark nobody defined (the message says where to define it: the page's front matter, or the host's list for every page); a definition that is not an object, a name that is not lower-case letters and hyphens, a built-in name or prefix, a prefix with a space or over 8 characters, a missing or unknown colour (it lists the colours; a hex value is named as not allowed), an empty label or one over 24 characters or with `(`, `)` or `#`, an unknown key, and `marks:` or `prefixes:` that is not a map.

### 3.2 Parts in their own folders (format version 11)

Each part below lives in a folder of its own in the package (`src/parts/<name>/`): its parser, checks, caps, view, styles, this section and its sample. A fenced part reads the same as any other: ```` ```<name> ```` and its lines; on any Markdown viewer it still shows as readable text. Every one charges the page's one work budget under its own name ("the fishbone part does too much work"), has its caps in both `LIMITS` and `UNTRUSTED_LIMITS`, and can be drawn static (`static=` on the fence: the finished state, a step number from 1, or a step's title).

<!-- parts:begin (generated by scripts/parts.ts from the folders under src/parts/: do not edit) -->

#### Downloads

````
```downloads title="Files for this guide"
media/q3-report.pdf "Q3 report" 2.4 MB sha256=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
media/requests.csv "Raw data" note="one row per request"
```
````

- A line: `<address> "label" [size] [sha256=|sha512=<hex>] [note=...]`. Each card has a type icon from the extension (document, sheet, archive, image, audio, video, code, text, other), the label, the file name, the size, a Download link (a plain `<a download>`; nothing is fetched, nothing is counted) and the checksum as a short chip that copies the whole value, with how to check it (`shasum -a 256 <file>`). `//` starts a comment line.
- **Addresses:** every address goes through the host's `urlPolicy` when the card is drawn; a refused one shows a plain note instead of the link. The parser itself never allows `data:`, `blob:`, `javascript:`, `file:`, any other scheme, a protocol-relative `//` address, or a space or control character.
- **LLM view:** `Downloads: <title>.` then `- <label>: <address> (PDF, 2.4 MB, sha256 9f86d0...0a08)` a line each, with the whole checksum on the next line.
- **Caps:** `downloadsFiles` (100; 40 in UNTRUSTED_LIMITS) files in one list.
- **doccheck refuses:** an address that is not allowed; a size with no unit (B, KB, MB, GB; decimal); a checksum of the wrong length or not hex; `md5=` or `sha1=` (weak: use `sha256=`); a second label; an unknown `key=`; a word that is not a size, a label or a key; a file listed twice; no files; more files than the cap; an unknown option; a part over the page's work budget.

#### Fishbone

````
```fishbone title="Why is checkout slow?"
effect: Checkout takes 4 seconds at p95
People: on-call is new to the service
Process: no load test before a release
  only staging has real data
```
````

- `effect:` is the head. Every other line is `<category>: <cause>`; an indented line is a cause of that cause (2 levels). Repeat a category to add a cause to its bone. 2 to 8 categories, each in the next family colour.
- **Steps:** build up one category or cause at a time; `highlight <category>` lights a bone. **Narrow:** under 600 px of width the spine turns vertical, the head at the bottom. **Static:** `static=` on the fence draws one step whole.
- **LLM view:** `Fishbone: <title>. Effect: ... Causes by category:` and a nested list (then the step captions, numbered).
- **Caps:** `fishboneCauses` (60) causes and `fishboneSubCauses` (240; 120 in UNTRUSTED_LIMITS) sub-causes a fishbone.
- **doccheck refuses:** no `effect:` or two, an empty effect, fewer than 2 or more than 8 categories, a third level, an indented line with no cause above it, an empty cause, a `highlight` of an unknown category, a line that is not `name: text`, a fishbone over its caps or over the page's work budget.

#### Flame chart and flame graph

```flame title="One request, traced" unit=ms
0 120 request
  2 14 auth.check
  15 95 handler.order
    16 70 db.query
```

```flame title="CPU, 30 seconds" unit=samples colour=heat
main;serve;handle;parse 120
main;serve;handle;db.query 300
main;serve;gc 45
```

Indented `start end name` lines are a **flame chart** (time left to right, nesting downward, like a trace); folded stacks `a;b;c count` (Brendan Gregg's format) are a **flame graph** (merged stacks, width is the share of samples). `dir=up|down` (a chart defaults to down, a graph to up), `colour=group|heat` (group: the text before the first dot picks a family colour; heat: self time on the `--flame-heat-*` ramp), `unit=`. Click or tap a frame to zoom it to the full width (a crumb row zooms out); a search lights matching frames and says their share; hover, tap or focus shows name, self, total and share; arrow keys walk the frames, Enter zooms, Esc zooms out. An LLM reads a chart as its lines with each frame's length (`db.query 16–70 (54 ms)`), a graph as a table of the top stacks and top self-time functions (all rows when under 400 tokens). doccheck refuses mixing the two forms, a child outside its parent's time, an end before its start, a count of 0 or less, an empty frame name, and more than 2,000 frames (it says to aggregate).

Caps in LIMITS and UNTRUSTED_LIMITS: `flameFrames` 2000, `flameLines` 6000, `flameDepth` 80, `flameName` 120. Hosts can lower these. Folded frame names are cut to the name cap. Also refused: unknown options, invalid dir or colour, tabs, an indented first frame, excessive depth or chart name length, no frames, @step lines, non-finite times or counts, and a spent work budget. Static draws the complete chart without search or zoom controls.

#### Gallery

````
```gallery title="The new editor" view=carousel
![The file tree, closed](media/tree-closed.png "Closed: only the top folders")
![On a phone](media/phone.png)
```
````

- One image a line: a Markdown image with alt text (required) and an optional quoted caption. Options: `view=single|grid|carousel` (a grid for two or more, `single` for one), `ratio=16:9|4:3|1:1|auto` (crops in the grid and the carousel, never in the lightbox), `columns=2..5` (two on a phone), `loop` (the carousel wraps), `start=<n>`. `//` starts a comment line.
- A tap or click opens the lightbox: wheel and pinch zoom (up to 8 times), one finger or the mouse pans, a double tap or double click zooms in and out, arrows or a swipe go to the next, Esc or Close closes, Tab stays inside, focus returns to the image. The caption stays under the picture. A carousel swipes, has Back and Next, dots (28 px targets) and arrow keys.
- **Addresses:** every image address goes through the host's `urlPolicy` (as an image) when the gallery is drawn; a refused one is left out and a note says so. The parser never allows `data:`, `blob:`, `javascript:`, `file:`, any other scheme or a protocol-relative address.
- **LLM view:** `Gallery: <title> (3 images).` then `1. <alt> (<address>): <caption>` a line each. **Tokens:** `--gallery-radius`, `--gallery-gap`, `--gallery-caption`, `--gallery-lightbox-bg`. **Slots:** `grid`, `image`, `caption`, `carousel`, `dots`, `lightbox`.
- **Caps:** `galleryImages` (60; 30 in UNTRUSTED_LIMITS) images in one gallery.
- **doccheck refuses:** a line that is not one image, an image with no alt text, an address that is not allowed or a file that is not an image (png, jpg, jpeg, gif, webp, avif, svg), a carousel of one image, a bad `view`, `ratio`, `columns` or `start`, an unknown option, no images, more images than the cap, a gallery over the page's work budget.

#### Sankey

````
```sankey title="Where a request's time goes" unit=ms
request -> auth: 12
request -> handler: 80
handler -> db: 55
node db "Postgres" [c3]
```
````

- One flow a line, `from -> to: amount`; `node <id> "label" [colour]` only to name or colour one; `unit=` on the fence. An id is letters, digits, `_`, `.` and `-`. Colours are the colour words (`c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`), never a hex value.
- **Steps:** flows under a step appear in it and the bands grow out of their source. **Static:** `static=` on the fence draws one step whole.
- **Reading it:** hover, tap or focus a band to light its path (the popover says `handler → Postgres: 55 ms · 69% of handler`) or a node for its in and out. A table of the flows sits under it. Under 520 px of width a sankey with more than 3 columns runs top to bottom. The layout is d3-sankey's; the SVG is ours, with the words as real text.
- **LLM view:** `Sankey: <title> (<unit>).` and a table `from | to | amount` in the order written (under `Step n: <caption>` headings when stepped).
- **Caps:** `sankeyFlows` (300; 150 in UNTRUSTED_LIMITS), `sankeyNodes` (120; 60) and `sankeySteps` (30). The layout's cost (about nodes times flows) is charged to the page's work budget when the part is read.
- **doccheck refuses:** a loop (it names it), an amount of 0 or less, a flow from a node to itself, an unknown colour, a line it does not understand, an unknown attribute, no flows, more flows, nodes or steps than the caps, and a part over the page's work budget. It warns when a node sends out more than comes in, and on a label over 60 characters.

#### Sequence

````
```sequence title="One init call"
actor dev "developer"
participant cli "CLI"
participant tc "template container"
dev -> cli: cyanprint create
cli -> tc: init call, all answers
tc --> cli: question reply
note tc: the script stopped at a question
loop until no question is left
  cli -> tc: init call, one more answer
  tc --> cli: question reply
end
cli --> dev: project written
```
````

- **Participants:** `participant`, `actor`, `database`, `queue`, `service` (`<kind> <id> "label"`), in the order written; one used with no line is added at the end. An id is letters, digits, `-`, `_` and `.`. At most 12.
- **Messages:** `a -> b: text` (a call), `a --> b: text` (a reply, dashed), `a ->> b: text` (async), `a -x b: text` (lost), `a -> a: text` (to itself). **Blocks:** `loop`, `alt` / `else`, `opt`, `par` / `and`, each closed by `end`, 3 deep at most. `note <id>: text`, `note <a> <b>: text`. An activation bar runs from a call to its reply.
- **Steps:** `@step <caption>` groups the messages after it; step k shows the messages up to its end, its own draw themselves, the earlier ones fade. `steps=each` on the fence makes every message a step (with no `@step` lines). **Static:** `static=` on the fence draws one step whole.
- **LLM view:** `Sequence: <title>. Participants: ...`, then the numbered messages, a block's messages indented under `loop <text>:`.
- **Phone:** the heads stay at the top while the box scrolls; three or more participants scroll sideways in the part's own box.
- **Caps:** `sequenceParticipants` (12), `sequenceItems` (200; 120 in UNTRUSTED_LIMITS) lines of participants, messages, blocks and notes together, and `sequenceDepth` (3).
- **doccheck refuses:** an `end`, `else` or `and` with no block open (or an `else` in a loop, an `and` in an alt), a block never closed, blocks nested too deep, a message or note with no text, an unknown participant kind, a participant declared twice, mermaid's `participant A as B`, an id with a character outside the set, a line that is none of these, no message at all, more participants or lines than the caps, `steps=each` with `@step` lines or with fewer than 2 messages, an unknown attribute, and a part over the page's work budget.

#### Trace waterfall

```trace title="POST /checkout" unit=ms trace=t-7f3a
web        POST /checkout        0 842  user=u7
  gateway  route /checkout       3 838
    auth   verify.token          6  44  method=jwt
    cart   cart.load            47 205  items=3
      db   SELECT prices       126 198  rows=3
    payment charge.card        208 812  error="payment provider timed out"
      payment provider.call    258 804  id=provider error="upstream timeout after 540 ms"
@log payment 804 error "upstream timeout after 540 ms, giving up"
@service db [c5] "Postgres"
```

The spans of one request across services, as a waterfall: one row per span, the service as a coloured chip (one family colour per service, in order of first use), a bar on one shared time scale, its length, and the spans the end waited for outlined.

- **A span line** is `<service> <name> <start> <end> [key=value ...] [colour]`. The service is an id (letters, digits, `-`, `_`, `.`); the name may hold spaces; times are numbers in `unit=` (default `ms`). Nest by indenting (two spaces or more; the parent holds the child), or write a flat list with `id=<id>` on every span that is a parent and `parent=<id>` on its children. Values with spaces go in double quotes. `error="..."` marks a failed span. `[c1]` to `[c8]`, `[acc]`, `[good]`, `[warn]`, `[bad]`, `[muted]` at the end colours that span's bar.
- **`@log <service> <time> <level> "text"`** puts a log line on the deepest span of that service that holds the time (`span=<id or name>` picks one). Levels: debug, info, warn, error. **`@service <id> [colour] "label"`** sets a service's colour and label.
- **Options:** `unit=` (a short word), `trace=` (the id a log line's `trace=` field names; `#id` is the default), `open=<levels>` (how many levels are open at the start), `critical=off` (no outline).
- **The critical path** (what the end waited for): from the end of the trace, the child that ended last, then the child that ended last before that one began, and so on, inside every span chosen. Spans that ran in parallel and ended earlier are not on it.
- **Explore:** each row folds with its arrow (Fold all, Unfold all); search finds a name, a service, an error text or a value, opens the path to each match and says their share of the trace; a mini map of the whole trace on top zooms a stretch (drag; the arrow keys move it, plus and minus zoom; Show all resets); the service chips isolate one service; a Flame button draws the same spans with the flame part. Hover, tap or focus a span for its card: attributes, logs, error, self time, and "Show in the log".
- **Links to a `log` part** on the same page: a log line with a `span=` field (and `trace=`, when both name one) matches the span with that `id=` (or, with no `id=`, that name). The span's card then offers "Show in the log", and the log line gets a "Show span" button.
- **LLM view:** the indented lines with each span's times and length, its attributes, `ERROR: ...`, the logs under their spans, then `Critical path (what the end waited for): a > b > c`, **Slowest spans** (by the time each ran itself) and **Errors**. A trace over 400 tokens in this view needs a `:::llm` block.
- **Tokens** `--trace-bar-h`, `--trace-critical`, `--trace-error`, `--trace-grid`, `--trace-stripe`, `--trace-minimap-h`, `--trace-brush`, `--trace-log-debug`, `--trace-log-info`, `--trace-log-warn`, `--trace-log-error`. **Slots** `span`, `span-bar`, `service`, `minimap`, `span-detail`, `view`, `search`.
- **Phone:** the waterfall is its own sideways scroll box (the rest of the page does not move); rows are 40 px apart; every button is 40 px.
- **Drawn by** our own SVG; reading and layout charge the document's work budget, and a reader's search has a budget of its own.


Caps in LIMITS and UNTRUSTED_LIMITS: `traceSpans` 2000, `traceLines` 6000, `traceDepth` 80, `traceName` 120, `traceAttrs` 24, `traceValue` 240, `traceLogs` 500, `traceServices` 40 `traceText` 400, `traceServiceLabel` 60 (labels are cut), and `traceOpen` 99. Hosts may lower them. Non-finite times or lengths are refused; scale the times down. Static shows the complete waterfall without controls or motion. A matching log row in the same document adds Show in the log to the span card.

**doccheck refuses:** a malformed span, log or service line; unknown option or directive; invalid service/id/trace id, unit, open or critical; tabs or an indented first span; end before start; child outside parent; duplicate ids, missing parents or a parent cycle; unknown colour or log level; a log with no service, span or time interval that matches; an unused @service; empty trace; any cap above or the work budget. It warns on multiple roots or a zero-length trace.

#### Venn

````
```venn title="Who writes what"
set go "Go" [c1]
set rust "Rust" [c2]
set zig "Zig" [c3]
go: Ana, Ben
go & rust: Cy
go & rust & zig: Dee (writes all three)
zig: 4 people
```
````

- **2, 3 or 4 sets** (`set <id> "label" [colour]`; an id is letters, digits, `-`, `_` and `.`), drawn as fixed, even shapes (circles, or the classic ellipses for 4); not to scale, on purpose. A region is its sets joined by `&` in any order, then names (a note in brackets, a name with a comma in quotes) or a count (`12`, `4 people`). Colours are the colour words (`c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`), never a hex value.
- **Steps:** `set` and region lines under a step appear in it. A region that names a set of a later step is refused. **Static:** `static=` on the fence draws one step whole.
- **Look:** hover, tap, focus or Enter on a region outlines it and reads its items in the card; names that do not fit show as `+3`. On a narrow stage the regions are also listed under the figure.
- **LLM view:** `Venn: <title>. Sets: ...`, then a line per region: `Go and Rust only: Cy`, `all three: ...` (under the step captions when stepped).
- **Caps:** `vennNames` (120; 60 in UNTRUSTED_LIMITS) names in one figure. The figure's own layout costs the same for every page of that many sets and is charged to the budget when it is drawn.
- **doccheck refuses:** fewer than 2 sets or a fifth set, a set written twice, an id with a character outside the set, an unknown colour or a word after the label that is not a colour, a region that names something that is not a set, names a set twice or is written twice, a region of a set from a later step, a region with nothing after its colon, a count with the word first, a name in two regions, an empty or badly bracketed name, a line that is none of these, more names than the cap, an unknown attribute, and a part over the page's work budget.

<!-- parts:end -->

## 4. Steps are an attachment

- **One marker:** a line `@step <title>` inside a fenced part (`%% @step <title>` in mermaid). The text up to the next `@step` belongs to that step.
- **Parts that take steps:** terminal, file tree, editor, code walk, mermaid and animation. A chart has controls instead; doccheck refuses `@step` in a chart.
- **At least 2 steps, or none.** One `@step` is refused, except in an editor: its files as they are come first, so one edit already makes two states.
- **What may come before the first `@step`:** in an editor its files (and `@file` blocks), in an animation its setup lines, in mermaid the start of the diagram. In a terminal or a file tree with `@step` lines, every line sits under a step; nothing comes before the first one.
- **No nested steppers.** Containers do not nest and a part cannot hold a part, so a stepped part is never inside another stepped part.
- **Play starts at once** (format version 10). Pressing Play does the next thing now: an animation steps to its next step (or back to the first, from the last) and a terminal moves on from a finished step or types its next key, with no wait for the step tick. The pause between steps comes after that first move. Measured on the 26 players of the Format page (a script clicks Play on each and times the first change): under 100 ms for all (before: 1.5 to 3.2 s).
- **Every stepped part looks and works the same:** a fixed-size stage, the step's title under it, and one control row (Back, Play where it plays, a slider, the count, Next); :kbd[Left] and :kbd[Right] step the part that has focus. Stepping never moves the buttons.
- **The editor on a phone** (format version 10, 640 px and narrower): the file tree sits above the file (it starts as a closed "Files" drawer, a button in the crumbs row, when the repo has more than 4 tree rows), tree rows are at least 36 px tall, the code is 14 px (the chart rule's 12 px is the floor), the code pane is at least 8 lines tall, and nothing sticks out of the screen. A browser script measures all of it at 390 and 360 px.
- **The old stepper part is gone.** Its job (a few states side by side) is a Markdown table; the article's worked example is now one.

## 5. Callouts

**How the icon is chosen.** The author never picks an icon. The marker word picks it, and the colour with it:

| Marker | Icon | Use it for |
| --- | --- | --- |
| `> **Note:**` | an "i" in a circle | a fact worth knowing, not needed to follow the text |
| `> **Tip:**` | a light bulb | a shortcut or a better way |
| `> **Important:**` | an exclamation mark | a fact the reader must not miss |
| `> **Watch out:**` | a warning triangle | a trap; at most 5 lines, never in the summary or a human-only segment |
| `> **Security finding:**` | a padlock | one finding per block; dropped from the public LLM view |

A callout sits in the text, as many as needed. A note about the whole page (the page is new, a draft, a sample) is a callout under the title.

**The banner is gone** (format version 10): the front matter `banner:` was not useful enough to keep. doccheck refuses a page with `banner:` (or the old `:::banner`): *banner was removed in format version 10: put the note in a callout under the title (> **Note:** ...), or drop it.*

## 6. Animation

### 6.1 One engine, not kinds

Version 3 had 7 fixed kinds (sequence, flow, cells ...). They could not be mixed or explored. Version 4 has **one engine**: a free 2D stage of **entities** that **layouts** place, **connectors** that follow their ends, a **camera**, and **steps** of changes that run together. The reader can step through, or explore: drag to move, pinch or Ctrl + wheel to zoom, click a thing to read its note, "Back to the story" to follow the steps again, and an "All steps" list to jump.

We build it ourselves on SVG (RESEARCH-ENGINE.md compares 16 engines with their licences): only SVG reads the page's colour tokens with no code, no engine had nesting + steps + a reader's camera, and tldraw, Ilograph and Remotion's player need payment for a company. The source still holds **no colour, no pixel and no time**: layouts place things, tones are roles that map to page tokens, the engine times the motion.

### 6.2 The shape of a block

````
```animation
<setup: the entities, connectors and notes on the stage at the start>
@step <caption: the sentence a reader sees>
<changes in this step, one per line; they run together>
@step <caption>
<changes>
```
````

- Step k shows the setup plus the changes of steps 1 to k. At least 2 steps.
- One line, one thing. `// text` is a comment. A label goes in double quotes; ids never do. The text after a colon (`say db: 3 rows`, `note db: holds users`, the values of `array a: 5 2 8`) needs no quotes.
- After the fence: `3d` (```` ```animation 3d ````) opens the scene in 3D (section 6.9); without it, it opens flat. Either way the reader can switch. Also `size=s`, `m` or `l` (the whole scene's size, section 6.10; default m), `fill=soft` or `fill=none` (the family tint on or off for the whole scene, section 6.10; default soft), `layout=` (the stage's own layout, see 6.4; default: `graph` when top-level things are connected, else `row`) and `dir=right` or `dir=down` (which way a graph flows; default right).
- An **id** is letters, digits, `-`, `_`, `.`; it names the entity in later lines. The **label** in quotes is what the reader sees; without one, the id is shown. A container shows a heading only when it has a label.

### 6.3 Entities

A setup line, or `add <line>` in a step:

```
<kind> <id> ["label"] [in <container>] [after <id> | before <id> | first] [key=value ...]
```

| Kind | What it is |
| --- | --- |
| `box`, `circle`, `pill`, `cylinder`, `cloud`, `person`, `diamond`, `text`, `dot` | shapes; `cylinder` for a database, `person` for a person, `text` a plain label |
| `group` | a frame that holds entities; `layout=` row (default), column, grid, tree, graph, free |
| `array`, `list`, `stack`, `queue` | data structures; values after a colon: `array a: 5 2 8 1`. Items get ids `a.0`, `a.1`, ... A list runs left to right from its head, with arrows between items; a stack grows upward (its top, the newest, is highest); a queue reads the way work flows (format version 8): in a row, new items join at the back on the left and the front (the oldest, the next to leave) is on the right, by what takes from it; with `layout=column` the front is at the top |
| `tree` | lays out nodes added `under <parent> [left \| right]` |
| `graph`, `grid` | a frame with that layout (`grid g cols=3`) |
| `buckets` | a hash table's buckets: `buckets h "hash table" count=5` makes `h.0` ... `h.4`; put entities `in h.2` |
| `table`, `row` | `table t "users": id, name`, then `row r1 in t: 1, alice`; columns line up |
| `token`, `pointer` | sit **on** an entity: `token t "req" at api`, `pointer i "i" at a.0`; `move t to db`. A token can also **wait in** a container (format version 9): `token f "photo.jpg" in sender`; it is laid out with what the container holds, and a queue keeps tokens in order like any item |

Keys: `size=s|m|l` (its size; a container's size also sizes what it holds, section 6.10), `is=<family>` (the family it stands for, which gives its colour, section 6.10), `fill=soft|none` (its family tint on or off, section 6.10), `layer=` (the layer it sits on, section 6.9), `tone=` (plain, acc, good, warn, hot, muted), `dim=yes`, `down=yes` (crossed out: a machine that died), `level=0..100` (a meter along its bottom: load, a buffer's fill, progress; its fill is a colour of its own, the theme's `--meter`, never the family's or the tone's, so it stands apart from the box's border), `note="..."` (what a click shows), `closed=yes` (format version 9; a container only: its inside is drawn faint and without words until the story zooms into it with `zoom into`; for a thing whose parts matter only up close, such as a router's queue and ports), and for containers `layout=`, `dir=`, `cols=`, and `pos=2,1` for a child of a `free` layout (columns and rows of 40). **Only these hold things:** `group`, `array`, `list`, `stack`, `queue`, `tree`, `graph`, `grid`, `buckets` (in one bucket, `h.2`) and `table` (rows only). A shape (`box`, `pill`, `cloud` ...) holds nothing: to give a worker jobs, declare it as `group w1 "worker 1"`. Anything can go inside a container, at any depth: a list inside a pod inside a node is fine.

**Connectors** follow their ends wherever they move: `a -> b` (arrow), `a --> b` (dashed), `a -- b` (a line), `a <-> b` (both ways), a chain `a -> b -> c`, and a label last: `app -> db "writes"`; `is=<family>` after it colours it. In a step a connector line adds one; `remove a -> b` takes it away.

### 6.4 Layouts

Positions come from layouts, not numbers. `row` and `column` line children up; `grid` fills `cols=` columns; `tree` puts each node centred over its children (a binary tree keeps an empty side's room); `graph` puts things in layers along the connectors (left to right, or top to bottom with `dir=down`) and orders each layer to cut crossings; `free` uses `pos=`. A connector between two things inside two containers counts for the containers' layout. A graph keeps its layers for the whole story: they come from every connector the story ever has, so adding or removing one does not shuffle the stage.

### 6.5 Changes in a step

| Line | What happens |
| --- | --- |
| `add <entity line>` | it appears (fades in where its layout puts it) |
| `a -> b ["label"]` | a connector is drawn |
| `remove <id> [<id> ...]`, `remove a -> b` | it fades out, with what it holds, its connectors and the tokens on it |
| `move <id> to <container> [after <id> \| before <id> \| first]` | it travels into the container; everything around reflows. For a token or pointer: `move t to <entity>` |
| `move <id> to <tree> under <id> [left \| right]` | into a tree, under a node |
| `swap <id> <id>` | two things in one container trade places. In an array the names are the places: after `swap a.0 a.1`, `a.0` is still the first cell |
| `set <id> key=value ...` | `label=`, `tone=`, `dim=`, `down=`, `layout=`, `dir=`, `cols=`, `layer=`, `size=`, `is=`, `fill=`, `level=` (the meter slides to it) |
| `highlight <id> ... [tone=warn]` | a ring for this step only |
| `say <id>: text` | a speech bubble for this step only |
| `note <id>: text` | the note a click shows (also in the setup) |
| `send [arrow \| both \| stream] ["label"] a -> b [is=<family>]` | **one hop per step** (format version 7): a request moves from one thing to the next, and the next hop is a step of its own with its own caption; only a `send stream` (a steady flow, not one request) may run a longer path `a -> b -> c`. The movement, shown as a small token that travels the path and waits at the end (the default), an arrow that draws itself from source to target (`send arrow`), both (`send both`), or a stream of small dots that keep flowing along the path for the whole step (`send stream`: traffic, a feed, readings; with reduced motion the dots stand still along the path; a stream that runs in the step before and in this one, along the same path, keeps flowing when the reader steps on (format version 8): it does not fade in or start again, even when its label changes; it fades out in the step that drops it); it needs no connector; on a connector, a token runs beside it (so its dot never covers the connector's label or arrowhead), and an arrow draws itself on it when the connector has no label and nothing else runs on it in that step, else beside it (format version 10). Its colour is its family's, else that of the thing it starts from |
| `push <stack, queue or list> "label" [as <id>]` | a new item at the top or the end (also in the setup) |
| `pop <stack or queue> [to <container>]` | a stack gives its newest item, a queue its oldest; `to` moves it there (it keeps its id) instead of removing it; a token taken from a queue goes into the target if it is a container, else it sits at it: `pop q to port2` |
| `move <id> [<id> ...] to <thing>` | (format version 9) several things move together, as **one hop**: `move seg1 seg2 seg3 to router` |
| `move <token> into <container> [after <id> \| before <id> \| first]` | (format version 9) a token goes **into** a container and waits there; in a queue it joins at the back: `move msg.1 msg.2 into q`. (`to` still means "sit at": `move bill to house`) |
| `split <token> into <n> ["label"]` | (format version 9) a token becomes n tokens (2 to 8), `<token>.1` … `<token>.n`, labelled "label 1" … (without a label: "1/n" …), where the token was: `split msg into 4 "seg"` |
| `merge <token>` | (format version 9) the pieces of a split token become it again, with its label; every piece must be on the stage, in one place: `merge msg` |
| `drop <token> [<token> ...] [at <thing>]` | (format version 9) a token is lost: with `at`, it first travels there (one hop); it turns red, is crossed out and fades: `drop msg.4 at router` |
| `send ... as <id>` | (format version 9) the sent token stays where it arrives, as token `<id>`, which later lines can move, split or drop: `send "GET /" browser -> api as req`; at a queue, a stack or a list it joins it as an item |
| `zoom into <id>` | (format version 9) the camera flies in (as `camera <id> close`) and the thing's inside opens: its words fade in: `zoom into router` |
| `zoom out` | (format version 9) the inside closes again, and the camera goes back to what it was before the zoom |
| `split <id> into <id> ["label"] <id> ["label"] ...` | one shape becomes several, which grow out of it and keep its connectors (format version 9: a token too) |
| `merge <id> <id> ... into <id> ["label"]` | several shapes become one (format version 9: tokens too) |
| `camera <id> [<id> ...] [close \| far] [turn=...] [tilt=...]`, `camera all [far] [turn=...] [tilt=...]` | the story's camera frames those things (default: everything), from the angle and at the distance named (format version 9); it stays until the next `camera` line. `close` flies in until they fill the stage (up to 2 times natural size; the plain camera stops at 1.5): `camera grape close`; `far` pulls back: `camera all far`; `turn=front\|left\|right\|back` (3D) is where the camera stands around the scene: `camera db3 turn=right`; `tilt=low\|mid\|high\|top` (3D) how high it looks from: `camera a5 b5 tilt=low`. A `camera` line sets the whole camera: a word it leaves out goes back to its default. 2D ignores `turn=` and `tilt=` |
| `split layers`, `stack layers` | the layers move apart (an exploded view), or back together (section 6.9); also in the setup |
| `focus <layer>`, `focus all` | the camera flies to one layer and the others fade; `focus all` ends it; also in the setup |
| `then` | (format version 9; a line alone in a step) the next **beat**: the changes after it start when the ones before it end, so a thing added in one beat can move in the next. At most 6 beats; more is several steps |
| `pace slow`, `pace fast` | (format version 9; a line alone in a step) this step plays slower or faster; ```` ```animation pace=slow ```` sets every step |
| `spotlight <id> [<id> ...]` | (format version 9) for this step only, everything else dims; these things, what holds them and what they hold stay lit |
| `say <id> above: text` | (format version 9) `above`, `below`, `left` or `right`: where the speech goes, if that spot covers no word (else the nearest free one) |
| `move <id> to <c> path=arc` | (format version 9) it travels over an arc instead of straight (`path=straight`, the default) |

### 6.6 One example

````
```animation
pill router "router"
group s1 "shard 1" layout=column
group s2 "shard 2" layout=column
pill k3 "users 201–300" in s2
pill k4 "users 301–400" in s2
router -> s1
router -> s2
@step The router sends each request to the shard that holds the key's range.
send "user 250" router -> s2
@step A third shard joins, and the range 301–400 moves to it.
add group s3 "shard 3" layout=column
router -> s3
move k4 to s3
```
````

The Format page shows 8 scenes, each in this language: an array sorted, a binary search tree insert, a hash table with a collision, sharding then rebalancing, replicas and a failover, pods in nodes in a cluster behind a service (a node dies, a pod is rescheduled), a service mesh with sidecars, and how a bill becomes a law.

### 6.7 What doccheck refuses

It replays every step with the engine the page draws with, and names the line:

- an unknown entity kind, change, key, tone or layout; a line it cannot read (it lists the forms);
- an id used before it exists, or twice (the message names the id and, when close, the one meant);
- a change that cannot happen: `in` a shape that is not a container, a container moved into itself, a swap across containers, a pop from an empty stack, a second root in a tree or a side already taken, removing a tree node that still has children, a connector between a container and something inside it, two connectors between the same pair;
- a `size=` other than s, m or l; a `level=` that is not a whole number from 0 to 100; an `is=` naming a family that is not named; the old word `concept` (refused: `"concept" in a scene is now "family"`); a family named twice, under a `@step`, or a ninth one (the palette has 8 colours);
- **two hops in one step** (format version 7): a `send` along `a -> b -> c`, or two sends where one starts where the other ends (`a -> b` then `b -> c`, or a reply `b -> a`); the message names the hops and says to give the second its own step. A fan-out (`a -> b` and `a -> c`) is one hop each; a `send stream` may run a longer path;
- a `fill=` other than soft or none;
- a step with no caption; fewer than 2 steps; a version 3 kind word after `animation` (only `3d` or `2d` may follow it);
- a `layer=` or `focus` naming a layer that is not declared (the message lists the layers); a layer declared twice, or under a `@step`; `focus` in a scene with no layers.

- (format version 9) `then` first or last in a step, or two in a row (a change must come before and after it); more than 6 beats in a step; a `pace` other than slow, normal or fast (also on the fence); `say <id> <side>:` with a side other than above, below, left or right; a move's `path=` other than straight or arc, or another key on a move; `spotlight` with no id or an unknown one.

- (format version 9, tokens and insides) a split into more than 8 pieces or fewer than 2, or of a pointer; a `merge` of tokens that are not all in one place (the message says which to move first), of tokens with shapes, or `merge msg` when `msg` was never split or a piece is gone; **one hop per step for tokens**: a token that moves twice in one step (two moves, a move and a drop, or `send … as t` and a move of `t`); `move t into x` when `x` is not a container, or a pointer moved into one; `drop` on what is not a token (use `remove`); `send arrow … as m` or `send stream … as m` (only a token stays); `zoom into x` when `x` holds nothing or is a shape; `zoom out` with nothing zoomed into; `closed=` on a shape, or other than yes or no; **a step that points at what a closed thing hides** (`highlight`, `say`, a send that is not a stream, `move … into` or `drop … at` a thing inside a closed thing not zoomed into): zoom in, in that step or before. A `send stream` may run through a closed thing, and a token may leave one.

- (format version 9, the camera) `close` with `all` or with no thing (`camera db close`); `close` and `far` together; a `turn=` or `tilt=` value not in its list; the words `near`, `in` or `zoom` (write `close`); the keys `zoom=`, `dist=`, `distance=` or any other; `all` with things.

It warns (and does not refuse) when a token's label is over 18 characters: the stage cuts a token's chip with "…"; put the detail in the caption or a note, or write `send arrow`, whose label may be longer.

### 6.8 How it is drawn, and what an LLM reads

- **A fixed stage** for the whole story: its shape comes from everything the story ever shows (between 1.25 and 2.4 wide per unit of height, at least 260 pixels tall; on a phone, since format version 10, a tall scene may be as tall as 0.62 wide per unit of height, so it is not cut at its top or bottom), so the buttons never move.
- **The controls sit in a bar above the stage** (the colour legend, reset the view, the 2D/3D button, zoom out, zoom in, show everything, "Back to the story"), never over the scene; **how to move** is a line under the stage, always shown. Only a thing's note, which the reader opens by clicking, shows on the stage.
- **The story's camera** frames what the author asked for (`camera`, `focus`, else everything) **plus everything the step touches**: what it adds, moves, changes, sends along, highlights or makes speak, with their words and their tokens, and a margin. It never draws larger than 1.5 times natural size, and (format version 10) **never smaller than the size at which its smallest words are 11 pixels on the screen, on every screen**: a laptop too (version 9 drew a laptop down to 0.65, which made words of 6 to 9 pixels in dense scenes). When everything the step touches fits at that size, all of it is in frame. When it does not (a stream along a whole flow, a send between two things far apart, a fan-out to things spread wide), the camera frames the step's **focus**, taking each of these in order while it still fits with what it has: what the step says or leaves at rest (speech, a token's chip, an arrow's or a stream's label, which sits mid-path) with what it belongs to; what the step adds, moves, changes or lights; where each send arrives, then where it starts; then the rest of each path, the nearest first. So the reader sees where the step ends up, with as much of the way there as fits. A touched thing bigger than the stage at that size (a whole cluster lit) shows its top-left part, with its heading. The rest still plays off-stage, and each stage edge with more of the scene beyond it is shaded with a small arrow, on every screen; the reader moves, or presses "Show everything", to see it all. **In frame** means everything the step touches when it fits at that size, else its focus (the checks count it that way). On a stage under 480 pixels wide (a phone) a scene uses its **narrow layout** (the stage's own row or left-to-right graph runs top to bottom) when it is wide (more than 1.4 wide per unit of height), or when the narrow layout keeps more steps whole (fewer cut to their focus) than the phone layout, so a scene of 1.3 that is too big is turned too. In the narrow layout a column whose things connect outside it turns into a row: the flow turns a quarter and the column turns with it, so its things still stand side by side across the flow and their lines leave side by side (kept a column, the lines into it would run down through its own things).
- **On a phone** (format version 8; a stage under 480 pixels wide) every scene is drawn with the phone's spacing: the same type sizes (a heading at least 11), tighter padding and gaps, and labels, speech and line labels that wrap sooner. The story's camera never draws the smallest words under **11 pixels** on the screen (since format version 10 on every screen, see above); what the step touches is in frame when it fits at that size, else the step's focus is, and the reader moves to see the rest. The part runs edge to edge (the width of the page without its scrollbar), the camera's buttons sit under the stage at a finger's size (40 pixels), an edge with more of the scene beyond it is shaded with a small arrow, and the line under the stage says how to move by touch (tap the stage, then one finger moves and two fingers zoom; in 3D one finger turns). Since format version 9 that line is always one line: a short one on a phone ("Tap, then drag to move"; in 3D "Drag to turn"), and a **?** button beside it opens the whole text, every key and gesture. A tap on a thing frames it no smaller than the same 11 pixels. In 3D, every word is 11 pixels or more.
- **Things a step does not change stay still** (format version 9). In a group, a grid, a graph and the stage itself, a thing that leaves (moves out, is removed, or is not added yet) leaves its place empty, so nothing around it closes up or slides: only what the step adds, moves, swaps, splits, merges, pushes or pops moves, with what it holds. Two things that are never in a container at the same time, of the same kind and size, share one place (the job a worker finishes and the next job it takes). Data structures (array, list, stack, queue, bucket, table) and trees still close up: a queue moving up is what a pop means. If the author reorders things in a group (`move a to g after b`), that group closes up. A test checks every step of every sample, wide and on a phone: no untouched thing moves or changes size.
- **Lines have room** (format version 9): every connector and every arrow between list items shows at least 32 units of line between its two shapes. Things side by side that a line joins are laid out 38 apart, and layer bands that a line crosses leave the same room. A test measures every line of every step, wide and on a phone.
- **Lines fan out, never cross, never double back** (format version 10). A line leaves a thing from the side that faces the other end. Several lines on one side **fan out**: each leaves from its own point, 16 apart (closer on a short side), in the order of where the lines go, so they cannot cross there; a line that can be straight keeps its point. A line is **straight** where its two points face each other and nothing is in the way; else it runs at **right angles** (down, across, down) with rounded corners, its middle leg in the free gap between the outermost boxes, or through the gap between two boxes. Lines to things in one row run on the outside of each other's turn. Right angles, not curves, because a fan of curves from one point bent past each other and crossed; straight and right-angle lines read as a diagram and keep the same shape at any zoom. A line never crosses another line, never runs along one or along a container's edge, never swings past its target, and never heads away from it (no turn of more than 90 degrees from the way to its end). When no simple way is free, the engine searches the free space for a path with more corners. A send's arrow, token or stream travels its connector's own path (a token beside it; an arrow on it when the connector has no label and nothing else runs on it in that step, else beside it); between steps a line's ends slide along their sides. In 3D a line between two things on one layer runs on the floor along the same path (before, it arched over the things between). A test counts crossings, lines on top of each other, lines from one point, swings, S-curves and turns back for every step of every sample, wide and on a phone (format version 10: 0 of each; 654 before). If a scene's things are placed so that two lines must cross, doccheck warns and names them.
- **Whole things at the edge** (format version 9): on a laptop the story's view never cuts a thing, a container that would fit, a container's heading or a layer's name in half at the stage's edge (in a close-up, `camera ... close` or `zoom into`, its neighbours may be cut); it grows to show it whole, or slides to take it in or leave it out, keeping what the step touches in frame. It never runs past the scene on one side while it cuts the scene on the other: it stays within the scene, or is centred on it. (On a phone, and since format version 10 on a laptop when a step is cut to its focus, a big scene runs past the stage on purpose, with shaded edges.) Since format version 10 a phone also grows the view to show a thing whole, never past the least size, and on every screen the view then slides (it keeps its size) to the place that cuts the fewest things in half, keeping what the step touches in frame and staying within the scene: a scene as wide as the stage is never cut by its margin, and a phone shows a big container from its heading. Each side where the view still cuts a thing is shaded, even by a few pixels.
- **Beats** (format version 9): a step with `then` lines plays its beats one after another; each beat moves the stage from the end of the beat before to its own end, and a send or a speech bubble shows in its own beat. Going back a step is one move.
- **One size per thing for the whole story.** The engine lays out every step, keeps each thing's largest size and lays out again, so nothing grows or shrinks as things come and go: a group that will hold three items has their room from the start, and a lift keeps its size full or empty. A container's contents start at its left in a row (centred in any other layout); in layer bands, containers in one column share its width. A thing that moves to another layer with no `after`/`before`/`first` keeps its place in the row: what moves between floors goes straight up or down.
- **A closed thing** (format version 9) keeps one size and one place for the whole story. Its inside is drawn faint (about a quarter strength) with no words; lines into it keep full strength, so a stream or a connector still visibly goes in. `zoom into` flies the story's camera in and the inside fades in with its words; `zoom out` fades it back. A closed thing's hidden words never count for the smallest words a step shows. This is a **semantic zoom**, not a second scene: nothing around it moves, and it is the same in 2D and 3D.
- **Split, merge, drop** (format version 9): a split's pieces grow out of the token; a merge's pieces flow into the result; a dropped token travels to where it is lost, turns red, is crossed out, sinks a little and fades. A step that moves or drops a token runs as long as a send.
- **Small things never cover words.** A token, a pointer, a sent token at rest, an arrow's label, speech and a connector's label are each placed by the engine: it tries spots around what they belong to (above first, then the sides, then further out) and takes the first that covers no label, no shape and no line, and prefers one off container edges. doccheck and the tests count overlaps for every step of every sample (pass 6: 0).
- **Lines never cross words.** A connector or an arrow that would run through a thing it does not end at, or a word, goes around it: the least detour that clears it (format version 10: at right angles; a circle's lines and a list's arrows keep the least bow). A container's heading slides along its top (left, right, middle) to the one place no line crosses in the whole story, so it never moves between steps. An arrow drawn beside a connector moves further off when the connector's own label is in its way. The tests count lines over words (every label, heading, layer name and chip, except a line's own label and the words of what it ends at) and lines through things, for every step of every sample, in the wide and the phone layout (pass 6: 0 and 0). In 3D, words are drawn over the lines, and a container's name keeps a clear gap from the words of what it holds.
- **Motion:** what moved slides to its new place (items that trade places pass on an arc), what is new fades in, what is gone fades out, a split grows out of its source, a merge flows into its result, a sent token (a dot) travels the path, an arrow draws itself along it, the camera glides. Reduced motion shows each step's end at once.
- **Colours are page tokens only** (`--acc`, `--good`, `--warn`, `--hot`, `--surface`, `--line`, `--ink`, and the family palette `--c1` ... `--c8` with `-soft` and `-ink`), so light and dark need nothing from the author, and a theme recolours every scene: the 2D stage uses them through CSS, and the 3D stage reads them from the page and reads them again when the theme or the palette changes (`data-theme`, `data-palette` on the page, or a `dh-theme` event). The engine and the stages hold no colour value; a test checks it.
- **Moving through the stage (2D):** drag (mouse, pen or one finger) moves the view; Ctrl or Cmd + wheel, or a pinch, zooms at the pointer. Once the reader **takes the stage** (clicks, taps or tabs into it; a coloured edge shows it), a plain wheel or a trackpad's two-finger scroll moves the view too (Shift + wheel moves sideways), one finger moves it instead of scrolling the page, and the keys work: arrows move, `+` and `−` zoom, `0` or Esc go back to the story, PageUp and PageDown change the step. Before that, a wheel scrolls the page past the stage, so a reader is never caught by it. The cursor is a hand (grab, grabbing); "Back to the story" shows while the view is the reader's, and the reset button is always in the bar.
- **The LLM view** is one line of what the stage starts with (entities, nested in brackets, and connectors), then the captions as a numbered list; under each caption, each `send` of that step as `a -> b: label` (the same line for a token, an arrow or both):

```
Animation, 2 steps. Starts with: pill router; group s1 "shard 1"; group s2 "shard 2" [pill k3 "users 201–300", pill k4 "users 301–400"]. Connected: router -> s1, router -> s2.

1. The router sends each request to the shard that holds the key's range.
   router -> s2: user 250
2. A third shard joins, and the range 301–400 moves to it.
```

- **Tokens in the LLM view** (format version 9): under each caption, after its sends, what tokens do, in the same shape (`from -> to: what`): `msg splits into: seg 1, seg 2, seg 3, seg 4`; `zoom into r`; `ha -> q: seg 4, dropped there (lost)`; `q -> p2: seg 1`; `seg 1, seg 2, seg 3, seg 4 merge into msg: message`. A closed thing says so in the setup line: `group r "router" closed [queue q "input queue": empty, ...]`.
- **Families in the LLM view:** a scene that names families adds one line: `Families, one colour each: app "apps" (a, b); proxy "sidecar proxies" (pxa, pxb, pxa -> pxb).`
- **Layers in the LLM view:** a scene that declares layers adds one line: `Layers, top to bottom: app "application" (a1, b1); tls "TLS" (a2, b2); ...`, each with the outermost things on it.

### 6.9 Layers and 3D

The same scene, drawn in 3D: every thing keeps its place on the floor plan the layouts give it, and is lifted to its **layer**'s height. Layers stack top to bottom. Use it for complex things: a system in layers, a network stack, a cluster, regions.

```
layer <id> ["label"] [note="..."]      (setup only; the first declared is the top)
<entity line> layer=<id>               (puts it on that layer)
split layers | stack layers            (pull the layers apart, or put them back)
focus <layer> | focus all              (fly to one layer, the others fade; or end it)
```

- **Which layer a thing is on:** its own `layer=`; without one, its container's layer; a top-level thing without one, the first layer. A token or pointer is on the layer of what it sits on. Moving a thing into a container on another layer carries it (and what it holds) up or down.
- **The floor plan is the 2D layout.** `layout=`, `dir=` and nesting still place things on their layer. When the top-level things sit on two or more layers, each layer is a row of its things in the order written, and the stage's own `layout=` and `dir=` are not used; a thing needs no connector to find its place.
- **Changes keep their meaning:** `highlight` and `say` last one step; `set`, `add`, `move` and `focus` last until changed; a `note` shows when the reader clicks the thing.
- **No layers declared:** each nesting level is a layer (top-level things, what they hold, what that holds ...). `split layers` works; `focus` needs a declared layer.
- **In 2D,** when the top-level things sit on two or more layers, the stage is a column of bands, one per layer, with its name; the n-th thing of every band shares a column, so two stacks stand side by side. Otherwise layers change nothing in 2D. `focus` frames that layer and dims the others; `split layers` and `stack layers` show only in 3D.
- **The 3D stage:** layers are planes; shapes are blocks, cylinders and spheres on them; containers are thin slabs, and what they hold stands on them; connectors are tubes, curving over things on the same layer and running straight between layers; sent tokens travel through the layers. Every word is a flat label over the 3D view, in the page's font and colours.
- **The author's camera in 3D** (format version 9): the camera glides between steps (the short way round), and the reader still moves freely; "Back to the story" returns to the author's camera for that step. What would break is clamped, never drawn: the camera never goes below the top plane that is shown (a low tilt stops above it, then the camera backs off), never inside a block, and what the step touches stays in frame (so `close` flies in only as far as all of it fits). `focus` keeps the angle and looks from nearly in front.
- **Looking into a lower layer** (format version 9; a click on a thing there, or a story camera that frames things there): the layers between the camera and that layer fade, as with `focus`, so nothing stands between the camera and what it looks at.
- **A scene with no declared layers, in 3D** (format version 9; every 2D scene opened with the button) stands on one floor: what a container holds stands on its slab; `split layers` lifts each nesting level above its container, never below. A lit container lifts what stands on it. Such a scene is seen from nearly in front, as in 2D, so it fills the stage.
- **Words in 3D** (format version 9): names take their spot in order (the layer in focus, what the step touches or lights, other layer names, then the nearest); each takes its own spot, else moves a little, else fades to a ghost the reader zooms in to read. A small label on a moving token keeps its offset while the token moves (it travels with it, in the same frame) and eases to a free spot only at rest, so it never jumps or flickers. A speech bubble takes its spot as it fades in and keeps it; a chip at rest steps aside for it. A lit thing's name is underlined in the accent colour (never boxed), and its ring hugs the thing's own foot and rises with it.
- **Only who takes part** (format version 10, section 6.11): before the order above, the labels rule runs: while a step plays, the label of a thing that does not take part is hidden (it eases out, it does not blink), so only the names of what the step touches, reveals, lifts or frames take spots; they come back about a second after the step ends and the player stops, or when the reader moves the camera. `labels=all` on the fence turns the rule off.
- **The reader in 3D:** left-drag to turn; right-drag, Shift + drag or two fingers to move; the wheel (once the stage is taken), Ctrl + wheel, a pinch, `+` and `−` or the buttons to zoom; arrows move across the screen, W A S D walk over the ground; click a thing for its note, click a layer to zoom into it; the reset button and "Back to the story" put the story's camera back. **The camera never goes below the top plane** (nor the highest thing): turning down stops a margin above it, so a plane is never seen from underneath.
- **Show everything in 3D** (format version 10): the fit button frames every thing and every plane inside the stage, even when its words then draw under 11 pixels, because the reader asked to see the whole scene; a press that comes before the 3D stage is ready is kept and done when it is.
- **Things rest on their planes:** a thing's bottom is at its layer plane's top surface; a thing in a container stands on the container's slab; words float above. The draw order follows: lower layers first, on each layer its plane, then its slabs (outer first), then its things; a thing at full opacity is drawn solid, so no see-through plane or slab can paint over it. A test checks every thing of every step of every sample (its bottom at or above its plane's top and its container's slab), and the lowest camera tilt. The **2D/3D** button on every stage switches and keeps the step. Without WebGL, or when the reader asks for reduced motion, the stage stays 2D and the button is hidden.
- **A 3D-only scene** (format version 10, section 6.11; ```` ```animation 3d only ````) has no button and opens in 3D. Without WebGL its stage shows a note and its steps as a list; with reduced motion it still opens in 3D, as still frames (the camera jumps).
- **Lifted things** (format version 10, `lift`): a lifted thing rises above its box with what it holds and the tokens on it, a thin outline marks the place it rose from, and everything else is drawn faint; `put back` and `zoom out` lower it into the same place. A hidden inside (`closed=hidden`) is not drawn until the story zooms in; the camera's view of a thing it frames includes what that thing holds, also on lower planes (a zoom into a pod frames its containers below it).
- **Stage:** a scene with layers, or one that opens in 3D, has a stage at most 1.5 wide per unit of height (taller than a flat scene may be), the same in 2D and 3D, so buttons never move.
- **Loading:** three.js (MIT licence) is about 530 KB (about 135 KB compressed), in its own file that the page fetches only when a reader opens a 3D view.

````
```animation 3d
layer app "application"
layer tcp "TCP"
layer link "link"
box a1 "browser" layer=app
box b1 "web server" layer=app
box a2 "segments" layer=tcp
box b2 "segments" layer=tcp
box a3 "Wi-Fi" layer=link
box b3 "Ethernet" layer=link
a1 -> a2 -> a3
b3 -> b2 -> b1
a3 -> b3 "the wire"
@step Each machine has the same layers; split apart, a request goes down one stack and up the other.
split layers
send "GET /" a1 -> a2
@step TCP cuts it into segments; one hop per step, down one stack and up the other.
send "segments" a2 -> a3
@step TCP talks only to TCP on the other machine.
focus tcp
highlight a2 b2
```
````

The Format page shows five 3D scenes (the stateless replay system, Kubernetes, a network request, a database in three regions, a building's floors) and one pass-4 2D scene, unchanged, which the reader opens in 3D with the button.

### 6.10 The design system: size, words, shape and colour

The source still holds no pixel and no colour. Sizes come from three named sizes, colours from roles and families.

| Size | Words (font, line) | Padding (across, down) | Width (least, wrap at) |
| --- | --- | --- | --- |
| s | 11 px, 14 px | 10, 6 | 52, 120 |
| m (default) | 13 px, 17 px | 14, 9 | 72, 160 |
| l | 15 px, 20 px | 18, 12 | 96, 200 |

| Size | Least height | Corner radius | Container padding, gap |
| --- | --- | --- | --- |
| s | 28 | 6 (container 10) | 8, 12 |
| m | 38 | 8 (container 12) | 12, 18 |
| l | 48 | 10 (container 14) | 16, 24 |

- **Words wrap** at their size's width, at most 3 lines, with even lines (no lone word on a last line); a longer label ends in "…" and is whole in the thing's tooltip and the LLM view. A container's heading is one line, in a smaller semibold type, and the container is at least as wide as it.
- **Shapes look like their kind:** a box (rounded), a pill, a circle, a cylinder (a database, with its words below the lid), a cloud, a person (a head and shoulders above the words), a diamond, a dot, plain text. Cells of an array, a stack or a queue are squares of the size's cell (32, 40, 48).
- **Small things are small whatever the size:** a token is a dot and a one-line chip (11 px, at most about 18 characters); an arrow's label, a connector's label and speech are 11 px chips that wrap at 2 lines.
- **Size per scene or per thing, nothing finer:** ````animation size=s```` or `size=l` on one thing. A container's size also sizes what it holds.
- **3D uses the same tokens:** its labels take the same font size and wrap width.

**Colour: one colour per family.** A scene may name up to 8 families in its setup; each takes the next colour of a fixed palette, and keeps it on every shape, connector, arrow, token, chip and in the legend above the stage:

```
family app "apps"
family proxy "sidecar proxies"
box a "orders app" is=app
box pxa "proxy" is=proxy
pxa -> pxb "mTLS" is=proxy
send both "pay order 7" a -> pxa        (takes a's colour; is=proxy would give it proxy's)
```

- **Each colour has three variants:** the base (borders, lines, arrows, dots, a chip's border), `-soft` (the light tint inside a shape) and `-ink` (the words of small tags: a connector's label, a token's chip, an arrow's label). Light and dark each have their own palette (`--c1` ... `--c8` in the page's theme), so a scene needs nothing for dark mode.
- **Words stay in ink** (format version 7, from the reference the owner pointed to): a thing's label and a container's heading are in the page's ink whatever the family or tone, so they read the same on every colour. The family is on the border (1.5 px), the lines (1.8 px) and the tint; the legend's words are neutral too, next to a swatch of the colour.
- **The tint is optional:** `fill=soft` (the default) puts the family's light tint inside; `fill=none` draws the border only, on the plain surface. Per scene (```` ```animation fill=none ````) or per thing (`fill=none`, also `set x fill=none`); a thing's own wins.
- **Containers and what they hold:** a container is its own family and the things inside keep theirs, so a sorting centre (one family) can hold two machines of two other families. A thing of the **same** family as its container drops the tint (plain surface, family border), so it stands out on its container's tint. A container with no family is a neutral frame.
- **Neutral things** (no family, no tone) are a plain surface with a grey border: the colour is kept for what it means.
- **A tone is a state and wins over a family:** `tone=good` (a new pod), `warn`, `hot`, `muted`, `acc` show what happened to a thing (its border and tint); `is=` shows what it is. A thing with a tone shows the tone; its words stay in ink. A highlight rings a thing and thickens its border, and keeps its colours.
- **Without families** a scene is drawn as before: neutral shapes, the accent for highlights and arrows, pink for sent tokens.

### 6.11 Depth: 3D-only scenes, nested boxes, lift, labels

Format version 10. Some ideas live in depth: containers inside containers, many levels deep (a cluster holds nodes, a node holds pods, a pod holds containers), opened one level at a time as the camera goes in. These words say it. The engine, doccheck, both stages and the LLM view read the same state.

| Word | What it does | Example |
| --- | --- | --- |
| `3d only` (on the fence) | the scene has no flat form: no 2D/3D button, it opens in 3D | ```` ```animation 3d only ```` |
| `labels=all` (on the fence) | in 3D, every label shows while a step plays (the default: only who takes part) | ```` ```animation 3d labels=all ```` |
| `closed=hidden` | a container's inside is **not drawn at all** until the story zooms into it; it keeps its room, so nothing moves when it opens | `group n1 "node 1" closed=hidden` |
| `zoom into <id> [<id> ...]` | the camera flies in and the inside appears; a zoom into a thing inside the open one goes one level deeper; several things at one level open together | `zoom into n1 n2`, then `zoom into p1` |
| `zoom out`, `zoom out all` | back one level (that inside closes, the camera goes back to what it was before that zoom), or all the way | `zoom out all` |
| `lift <id> [<id> ...]` | (3D only) they rise up out of their boxes, with what they hold; everything else fades; they stay up until put back; lifts nest (lift a node, then a pod out of it) | `lift fe w2` |
| `put back [<id> ...]` | (3D only) they settle back into exactly the same place, with anything lifted out of them (without ids: everything lifted) | `put back fe` |

- **Levels of detail.** `closed=yes` (format version 9) draws the inside faint, so the reader sees there is one; `closed=hidden` hides it, so a scene can talk about one level at a time: first the nodes, then the pods, then the containers. A zoom into a `closed=hidden` thing also fades what is outside the things it opens (to about a fifth), except what the step touches; a `closed=yes` zoom fades nothing.
- **Zooms nest.** The story keeps a stack of open levels. `zoom into x` when x is inside the open level pushes a level; when x is outside it, the levels that do not hold x close first (a sideways move). `zoom out` pops one level, `zoom out all` every level; each puts back what was lifted inside what it closes.
- **Lift.** A lifted thing rises above its box in 3D (about a box's height and a half), with what it holds and the tokens on it, and a thin outline stays on the floor where it was. Everything not lifted fades, except what the step touches, so sends and tokens between lifted things read clearly, also between two things lifted from two different boxes. The floor plan never changes: a lifted thing goes back to exactly where it was, and the still check holds. **Lifts nest:** a thing inside a lifted one may be lifted too, in a later step; it rises again, above it (a node pulled out of its cluster, then a pod out of the node, then a container out of the pod). Then only the innermost lifted things stay strong and take part; what they rose out of fades like the rest. The outer one rises first and settles last: `put back` or a `zoom out` of it settles what was lifted out of it too.
- **Labels in 3D: only who takes part.** While a step plays, the 3D stage shows only the labels of what the step touches (adds, moves, changes, sends along, highlights, makes speak, lifts or puts back), what a zoom in that step opens and reveals, what is lifted (with what it holds; with nested lifts, the innermost) and the things on a focused layer; every other label hides, so nothing covers what the camera pans onto. A `camera` line frames: its targets take part only in a step that does nothing else (a step that only flies to redis shows redis), never because the camera stays on them from an earlier step. A connector's label shows when a send in the step runs along it, or when both its ends take part (one end is not enough); a send's chip and speech always show. The others ease back about a second after the step ends and the player stops, or as soon as the reader moves the camera. A step that touches nothing and frames nothing in particular keeps every label. `labels=all` keeps them all.
- **Without 3D.** A 3D-only scene needs WebGL. Without it, the stage shows a short note and the steps as a list, with the current one marked (this is also what a page shows before its script runs). With reduced motion, a 3D-only scene still opens in 3D: each step is a still frame, and the camera jumps instead of gliding.

````
```animation 3d only
group c "cluster"
group n1 "node 1" in c closed=hidden
group n2 "node 2" in c closed=hidden
group fe "frontend" in n1
group w2 "web-2" in n2
@step Two nodes; what runs in them is hidden.
camera all
@step Zoom in: the pods appear.
zoom into n1 n2
@step Two pods rise out of their nodes; one calls the other.
lift fe w2
send "GET /" fe -> w2
@step Zoom out: they settle back and hide.
zoom out
```
````

**What doccheck refuses** (each names the line and the fix):

- `lift` or `put back` in a scene whose fence does not say `3d only`; `only` without `3d` before it (`2d only`, or `only` alone); `labels=` other than part or all; `closed=` other than yes, no or hidden;
- `zoom into` a thing and what holds it in one line (`zoom into n1 p1`: zoom into n1 first); the same zoom again; `zoom out` or `zoom out all` with nothing open; a zoom line in any other form;
- `lift` of a token or a pointer (lift what it sits at), of a thing in no box, of a thing inside a closed thing not zoomed into, of a thing already lifted, of a thing holding a lifted one (lift the outer one first), or of a thing and what holds it together (lift the outer one, then the inner one in a later step);
- `put back` with nothing lifted, or of a thing that is not lifted; a `move` or `swap` of a thing lifted in or before that step (put it back first);
- as in format version 9, a step that points at what a closed inside hides (`highlight`, `say`, a send ...): the message says whether the inside is drawn faint or not drawn.

**The LLM view.** The first line says `Animation, 10 steps, 3D only.`; a hidden inside is named in the setup line (`group n1 "node 1" closed, inside hidden [...]`); under each caption: `zoom into n1, n2: their insides appear, the rest fades`, `zoom out of n1, n2`, `zoom out all the way`, `lift fe, w2 out of n1, n2`, `put back fe`, and after a zoom out that puts things back, `fe, w2 settle back into place`.

The Format page shows two: Kubernetes, cluster to container (boxes inside boxes, a tree that only works in 3D: a cluster box holds node boxes, a node holds pod boxes, a pod holds containers; each level `closed=hidden` and opened by a nested zoom, and each zoom pulls the box it opens up out of its box with `lift` (node 1 out of the cluster, cache-1 out of node 1); redis pulled up out of its pod, the camera on it with only its label shown; `zoom out` and `zoom out all` close the levels again and put each box back), and a packet through kube-proxy (nodes only, then the pods, two pods lifted, the service added at the step where the frontend calls it, its virtual IP rewritten to a pod's IP by the rules kube-proxy writes, then everything settles back).
### 6.12 A scene inside a scene, and data structures

Format version 10. Two things the stage could not say before: **zoom into one detail that becomes a scene of its own**, and **data structures (an array, a map, a tree) as things that live in one scene** with boxes, people and databases, each one closed at the overview and readable up close.

#### A scene inside a scene

From an overview, the story zooms into one detail. That detail is its own scene: the overview is left out (not faded), the scene has its own things, layout and steps, and the story comes back out to the overview exactly where it left it.

```
scene <id> ["label"] [layout=...] [dir=...] [size=...] [fill=...]    (in the setup; its own lines follow, then end)
end
enter <scene> from <thing>     (a step of its own: the camera flies into the thing, and the scene is shown)
leave [<scene>]                (a step of its own: back where the story was before it entered)
```

````
```animation
box a "browser"
box t "TCP"
a -> t
scene up "TCP, up close" layout=row
  group snd "sender"
  token m "message" in snd
  group rcv "receiver"
  snd -> rcv
end
@step The browser hands its message to TCP.
highlight t
@step Up close: what TCP does with it.
enter up from t
@step TCP cuts it in two.
split m into 2 "seg"
@step Both pieces cross to the receiver.
move m.1 m.2 into rcv
@step Back at the overview, where we left it.
leave
```
````

- **Declared in the setup**, before the first `@step`, between a `scene` line and an `end` line. Its lines are a setup like any other (indenting them is only for the eye): its own things, connectors, layers and notes; `layout=`, `dir=`, `size=` and `fill=` on the scene line are its own. The overview's families are every scene's, so a family keeps its colour inside.
- **`enter` and `leave` are steps of their own.** A step that enters does only that: its caption says what the reader is about to see, and the stage shows the scene's setup. The steps after it change the scene, not the overview. A step that leaves does only that, and shows the scene the story goes back to, as it was.
- **Each scene lives on its own.** It is played and laid out over the whole story; while the story is in another scene, nothing in it changes. So the still rule (6.8) holds in every scene and across entering and leaving: the overview comes back with every thing in the same place and size. Every scene keeps its own size for the whole story.
- **Depth:** at most 2 below the overview (a scene, and a scene inside it). A scene enters another from one of its own things; `leave` goes back one level.
- **One id, one thing:** an id names a thing in one scene only.
- **The stage keeps one size:** the overview's shape. A scene inside is framed into it by the story's camera, with the same rules (in frame, words of 11 px or more, whole things at the edge).

**How it is drawn.** Going in, the camera flies into the thing the scene is entered from and the overview fades out; then the scene grows from the middle of the stage. Going out is the opposite: the scene shrinks away, then the camera flies back out of that thing to the overview. Nothing tweens between two scenes, so nothing of one scene seems to turn into a thing of the other. In 3D the camera flies into the thing, then starts far back from the scene inside and comes in; going out it starts at the thing and pulls back. Going back a step across a scene runs the same move the other way. Reduced motion shows each step's end at once.

**Which scene the reader is in.** The step count and the slider count every step of the story, the scenes' too. Under the slider, a band marks the steps inside each scene. The caption of a step inside a scene starts with a chip, `Inside · <label>`. "All steps" lists a scene's steps as a list inside the step that enters it.

**What doccheck refuses** (each names the line and the fix): entering a scene that is not declared (it lists the scenes); entering from a thing that is not on the stage of the scene the story is in; a visit with fewer than 2 steps of its own after the step that enters (show it as a step of the overview instead); `leave` in the overview, or `leave <id>` for a scene the story is not in; a story that ends inside a scene; a scene declared but never entered, declared twice, with no `end`, or with an unknown key; `end` with no scene open; `scene` or `end` under a `@step`; entering a scene the story is already in; going deeper than 2; any other change in a step that enters or leaves; one id in two scenes; the ids `all` and `overview`.

**The LLM view.** The steps inside a scene are indented under the step that enters it, with what the scene starts with; the step that leaves is back at the outer level:

```
Animation, 5 steps, with 1 scene inside it (up "TCP, up close"): steps in a scene are indented under the step that enters it. Starts with: box a "browser"; box t "TCP". Connected: a -> t.

1. The browser hands its message to TCP.
2. Up close: what TCP does with it.
   enters scene up "TCP, up close" from t. Starts with: group snd "sender" [token m "message"]; group rcv "receiver". Connected: snd -> rcv.
   3. TCP cuts it in two.
      m splits into: seg 1, seg 2
   4. Both pieces cross to the receiver.
      snd -> rcv: seg 1, seg 2
5. Back at the overview, where we left it.
   leaves scene up: back to the overview, as it was, at t
```

The Format page shows it with the seven OSI layers: a request goes down one machine's layers, splits into segments at layer 4, the story zooms into TCP (a header with ports and sequence numbers, three segments, one late and put back in place, an acknowledgement), and comes back out to follow the segments down, across the wire and up the other machine's layers.

#### Data structures as entities

`array`, `list`, `stack`, `queue`, `tree`, `buckets` and `table` were containers already, so they could sit in any scene. Format version 10 adds a **map** and two **lookups**. Any of them can be `closed=yes` (small and faint at the overview, its words hidden; its title says how many it holds, `sorted ids · 4 items`, `cart sizes · 3 keys`, `price index · 4 nodes`, when that fits its width, so it never reads as empty) and opened with `zoom into` (6.5), so several live in one scene and the camera visits each in turn.

| Line | What it is |
| --- | --- |
| `map <id> ["label"]: key: value, ...` | a dictionary: a table with the columns key and value, one row per entry, named `<id>.<key>`: `map cache "session cache": u7: Ana, u12: Ben` |
| `map ... buckets=<n>: ...` | the same map drawn as a hash table: n buckets (`<id>.b0` ...), each entry a box "key: value" in bucket hash(key) mod n, where hash(key) is the sum of the key's character codes (a real map uses a stronger hash; one key, one bucket, every time, is the same idea); two keys in one bucket make a chain: `map cache buckets=4: ana: cart 3, cy: cart 9` |
| `put <map> <key>: <value>` | adds the entry (in its bucket), or gives the key its new value: `put cache dee: cart 4` |
| `get <map> <key>` | a lookup: the entry, and its bucket in a hash table, are lit for this step and framed: `get cache ana` |
| `get <array> <index>` | an array read by index: `get ids 3` |

A key becomes part of an id, so it is letters, digits, `-` and `_`. doccheck refuses: an entry that is not `key: value`, a key that is not an id, a key twice, `buckets=` that is not 1 to 16 or that is on anything but a map, a key that looks like a bucket's id (`b1`), `get` of a key the map does not hold (it lists the keys) or of an index past the end, `get` on what is neither a map nor an array, `put` on what is not a map, and a `get` inside a closed thing that the story has not zoomed into (zoom in, in that step or before).

**The LLM view:** a map in the setup line as `map cache "session cache": u7: Ana, u12: Ben`, or for a hash table `map cache "session cache", 4 buckets, a key's bucket is the sum of its letters' codes mod 4: ana: cart 3 (bucket 0), ...`; under a caption, `get cache ana -> cart 3 (bucket 0)`, `get ids 3 -> 34`, `put cache dee: cart 4` (and "(it replaces the old value)" when it does).

The Format page shows one scene where an array, a hash map and a tree live in one service with a person and a database: the camera zooms into the array (a read by index), the map (a key to its bucket, its value, a new entry) and the tree (a walk down to a price), then back out to the whole.

## 7. Charts

- **Kinds.** `bar`, `line`, `area` (a line with its fill): `x` lists the categories and each series' `data` holds one number per category (`null` leaves a gap). `scatter`: no category list; `data` is points `[x, y]`. `bubble`: points `[x, y, size]`; the bubble's area follows the size. `radar`: `x` names the axes (at least three), each series is one outline. `pie`, `doughnut`, `polar` (polar area): `x` names the slices, values are 0 or more, and the slice colours follow the default colour order. `candlestick` (format version 10): `x` lists the periods and the series with no `kind` holds one `[open, high, low, close]` per period (`null` leaves a gap). `x` is always the category (or point-x) axis and `y` always the value axis, also when `horizontal: true` turns them on their side.
- **Options.** Several bar series are grouped (side by side) by default. `stacked: true` stacks bar, line and area series; `stacked: percent` scales every bar or area to 100% (the tooltip shows the real value). `horizontal: true` is for `kind: bar`. A **floating bar** is a value written `[low, high]` in a bar series. **Mixed**: a series' own `kind` (bar, line or area) draws it in another style on the same chart; `axis: y2` puts it on the second axis, declared by the chart's `y2`. A line in a stacked chart is not stacked with the bars. A mixed chart cannot be horizontal.
- **Scales.** `scale: linear` (the default) or `scale: log` on `y`, `y2`, and on the `x` of a scatter or bubble chart. A log axis labels the powers of ten (and 2 and 5 on a short one) and needs values above 0. Not supported: `symlog`, because Chart.js has no such scale and a hand-made one would break the tooltips and ticks; and `time`, because Chart.js needs a date adapter (a new runtime dependency) to draw one. Write dates as category labels instead. doccheck refuses both as an unknown scale.
- **Candlesticks.** Chart.js 4.5.1 has no candlestick, and no dependency is added: the bodies are Chart.js floating bars (open to close) and a small plugin of our own draws each wick (low to high) under them. An up candle (close at or above open) has a light body with a `good` edge, a down candle a solid `bad` body, so the two differ in more than colour, in light and dark. A series with `kind: line` is drawn over them (a moving average, on `y` or `y2`) and appears in the legend; under the chart a key says what up and down mean. The value axis does not start at 0 (give `min` to choose). The tooltip shows all four values ("Open, High, Low, Close", in the page's language). Animation is off for this kind so a body and its wick never part. Not allowed (refused): `stacked`, `horizontal`, a series of kind `bar` or `area`, `tone` on the candles, `axis: y2` on the candles, a second set of candles, `scale` on `x`.
- **Colours.** A series takes its colour from the theme: by default `--series-1` to `--series-5`, then `--c6` to `--c8`, then again. `tone: 1` to `8` picks `--c1` to `--c8`; `accent`, `good`, `warn`, `bad` and `muted` pick those tokens. Light and dark both come from the tokens, and so do the grid and the ticks.
- **Narrow screens.** Under 480 px a chart wraps long labels (axis ticks, radar axes) onto several lines, and a log axis labels only the powers of ten; a horizontal chart grows with its bars and a round one is squarer. Text is never under 12 px, and every chart has its numbers as a table under it ("Show the numbers as a table"; a candlestick's is `period | open | high | low | close`).
- **An LLM reads the data**, not a description: a chart with fixed data becomes a table; a chart with controls or formulas goes as its source. The line `Chart (kind): title` comes first (`bar + line` for a mixed one, `stacked` or `100% stacked` before the kind). A short note follows when the chart needs one: which series are bars, lines or areas and which are on the right axis (`y2`); `Log scale on y.`; the bars run horizontally; a cell `3 to 9` is a floating bar; `Each bar or area is scaled to 100%`; the bubble size. Then the table: category kinds one row per category and a column per series (a radar's first column is `axis`, a pie's `part`); scatter one row per point (`series`, x, y); bubble adds `size`; a candlestick one row per period, `period | open | high | low | close`, then a column for each line on top, under a note that up means the close is at or above the open.
- **doccheck draws each chart** at its start values, at both ends of every slider, at every option and after every button, and refuses one that breaks. It also refuses, naming the fix: an unknown kind, chart key, axis key or series key; `scale` other than `linear` or `log`, or on a kind that has none; a log axis with a value or `min` of 0 or less, or one that is stacked; a floating bar whose low is above its high, that is not a pair, that is in a line series or that is stacked; a radar with fewer than three axes; a bubble point with no size (or a size of 0 or less), a scatter point with a size; `axis: y2` with no `y2` declared, and a `y2` no series uses; `stacked` or `horizontal` on a kind that cannot take it; a series `kind` or `axis` on a pie, radar or point chart; `stacked: percent` with a line on the main axis; a negative pie value; an unknown `tone`; for a candlestick: a candle that is not four numbers (or a series of the wrong length), a high below the open, close or low, a low above the open, close or high, no candle series or more than one, a series kind other than a line, `tone` or `axis: y2` on the candles, `stacked`, `horizontal`, and a log axis with a candle value of 0 or less.

## 8. Inline parts

- **Keys** are typed names: `:kbd[Esc]`, `:kbd[Ctrl+Shift+P]`, a sequence `:kbd[Ctrl+K, Ctrl+S]`, and `:kbd[Left]`, `:kbd[Right]`, `:kbd[Up]`, `:kbd[Down]`, `:kbd[Enter]`, `:kbd[Cmd]`. The page draws the symbol (←, →, ↵, ⌘); doccheck refuses a symbol in the source.
- **Mouse** is one icon and the action: `:mouse[click Next]`, `:mouse[right-click src/]`. Action words: click, double-click, right-click, middle-click, drag, drop, scroll, hover, select. The icon is about two lines tall and **fills the button the action presses**: the left button for click, double-click, drag and select; the right one for right-click; the wheel for middle-click and scroll. A double click adds a "2" badge, so it never looks like a single click; scroll adds arrows by the wheel, drag a move arrow, drop a down arrow, hover motion lines, select a text cursor. The Format page shows all nine.

## 9. doccheck's checks (format version 10)

| Check | Refuses |
| --- | --- |
| docs parse | a fence or container never closed; a container inside a container; `:::llm` after prose |
| parts known | an unknown `:::` container; a `.dh.md` page with no part; a `.md` page with one |
| LLM text present | a fenced part over 400 tokens in the LLM view with no `:::llm`; `llm=none` on anything but `:::human` |
| fence partner | a `:::human` with neither `:::llm` after it nor `llm=none` |
| LLM text placed | an empty `:::llm`; warns above 160 words |
| part data | each part's own rules (sections 3, 4, 6, 7, 8; the tier list and alignment grid rules are in section 3, own marks and prefixes in section 3.1, candlesticks in section 7), a front matter `banner:` (removed in version 10), a bad `marks:` or `prefixes:` definition, duplicate ids; an animation is replayed step by step (section 6.7), with one hop per step; a code walk's `animate=` is on, off or auto, and not on step 1 |
| code walk ranges, code references | a range past the end of the file, a focus or mark outside it, a missing file or symbol at the pin |
| watch-out blocks, security blocks | as in version 2 |
| translation behind, translation shape | as in version 2; the shape now compares parts by order |
| LLM view in step | a `docs-llm/` file that is not what `dh llm` makes now |
| lines cross (format version 10) | warns, does not refuse: two lines of an animation cross in a step because no way around them is free; it names the step, the two lines and the fix (put the things a line joins next to each other, in the order of where their lines come from, or show fewer lines at once) |

## 10. Translations

A translation keeps every part, attribute, code reference and code block of its source, in order; doccheck's "translation shape" compares them. Translated: prose, headings, list items, table cells, callout text, front matter `title`, `description` and the `label` and `means` of own marks and prefixes, `:::llm` texts, mermaid labels, terminal and file tree step titles, code walk notes, chart `title`/`label`/`name` (a second axis's `label` too; the category names in `x` stay as they are), a tier list's title, tier names, item names and notes, an alignment grid's title, axis names, cell and region labels, item names and notes (translate a tier or axis name the same way everywhere it is written, on the `tiers:` line and in the tier lines, on the axis lines, the `region:` lines and the cell lines; never the colours in square brackets, the keys `tiers:`, `x:`, `y:`, `region:`, `arrows:` or the `@ x, y` numbers), and an animation's captions, its quoted labels and its say and note texts (never its ids, entity kinds or change words). No native speaker has read the five translations yet.

## 11. What changed from version 9

Version 10 adds no word that changes what a version 9 page means, except one: front matter `banner:` is refused (put the note in a callout under the title). Every other version 9 page reads and draws as before, with the fixes below.

### Scenes: a scene inside a scene, and data structures (section 6.12)

- `scene <id> "label" ... end` in the setup: a scene of its own; `enter <scene> from <thing>` zooms into it, `leave` comes back to where the story was. Each scene is laid out on its own; the still rule holds across entering and leaving.
- The caption's chip `Inside · <label>`, a band under the slider, and "All steps" nested under the step that enters; the LLM view indents a scene's steps under it.
- `map <id>: key: value, ...` (a table of key and value), `buckets=<n>` (a hash table), `put <map> <key>: <value>`, `get <map> <key>`, `get <array> <index>`.

### Words: never under 11 pixels (section 6.8)

- **The story camera never draws words under 11 pixels on the screen, on every screen** (version 9: a phone only; a laptop went down to 0.65). Before: 79 of 235 steps at 1280 had words under 11 pixels (smallest 6.6), 11 at 390, 17 at 360; after: 0, 0, 0 (counted over every scene and sample).
- **The focus:** when what a step touches does not fit at that size, the camera frames, in order, what it says or leaves at rest, what it adds, moves, changes or lights, where each send arrives, where it starts, then the rest of the path, nearest first. "In frame" counts the focus for such a step.
- **Shaded edges on every screen,** not only on a phone.
- **The narrow layout on a phone** also when it keeps more steps whole than the phone layout (not only above 1.4 wide). A column still turns into a row there, and the reason is now written down.
- No new author words: the source still holds no pixel.

### Depth: 3D-only scenes, nested boxes, lift, labels (section 6.11)

| Version 9 | Version 10 |
| --- | --- |
| every scene could be flat or 3D; the button was always there | ```` ```animation 3d only ````: no flat form, no button; without WebGL a list of the steps, with reduced motion still 3D frames |
| a closed inside was drawn faint | `closed=hidden`: not drawn until the zoom; a deep zoom fades what is outside it |
| one zoom at a time | zooms nest (`zoom into n1`, then `zoom into p1`); `zoom into n1 n2`; `zoom out` goes back one level, `zoom out all` all the way |
| nothing could rise out of its box | `lift` and `put back` (3D only): it rises with what it holds, the rest fades, an outline marks its place; it goes back exactly |
| in 3D every label showed all the time and could cover what the camera panned onto | while a step plays, only who takes part shows a label; the rest come back at rest; `labels=all` keeps them |
### Review fixes: nested Kubernetes, the phone bar, closed data, the candle key

- The Format page's Kubernetes scene is boxes inside boxes (3D only, no layers): nested `zoom into`, `lift` of redis, `put back`, `zoom out`, `zoom out all` (section 6.11).
- A closed data structure (`array`, `list`, `stack`, `queue`, `tree`, a map) that is not zoomed into says how many it holds in its title (`sorted ids · 4 items`), when that fits; nothing moves (section 6.12). No new author word.
- The site's page bar on a phone rests on whole links with the current page's link showing; a link cut by an edge is not drawn until it scrolls fully in, and a small arrow marks the side with more.
- The candlestick key keeps each swatch with its words: it wraps between the two items, never inside one.

### Lines: fan out, never cross, never double back (section 6.8)

- Lines on one side of a thing fan out from their own points (16 apart, in the order of where they go) instead of leaving from one point.
- A line is straight where it can be, else at right angles with rounded corners; it goes around what is in its way by the least detour, through the free gaps.
- No line crosses another, runs along one, swings past its target or heads away from it; a test counts all of these for every step of every sample (654 before, 0 now).
- Sends travel their connector's path; a line's ends slide between steps.
- 3D: a line on one layer runs on the floor along the 2D path, not in an arch over the things between.
- doccheck warns (it does not refuse) when two lines must cross, naming them and the fix.

### Edges: whole things at the edge on every screen (section 6.8)

- The story's view slides to cut the fewest things at the stage's edge on a phone too (version 9: a laptop only), keeping its size, what the step touches and the scene's bounds. Things cut at rest over every step, at 1280, 390 and 360: 811 before, 337 after; none where the whole scene fits the view.
- A side where the view cuts a thing is shaded with its arrow even when less than 6 units of the scene lie beyond it (22 such steps were cut with no shade before, 0 now).
- A tall scene gets a tall phone stage (down to 0.62 wide per unit of height, as the narrow layout already could): the replay scene and the scene inside the seven-layer scene now show whole on a phone.
- On a phone the view also grows to show a thing whole, never past the size where words are 11 pixels (the regions' names at step 4).
- 3D: the whole view counts things a highlight dims (it left them out and slid to what the step lights), and a flat scene keeps its angle when the author frames part of it, so it does not swing between steps.
- No new author words.

### Lines: ends on the outline, words off the lines (section 6.8)

- A line meets a queue's rails and a stack's walls under its heading, not the empty space beside the heading.
- An arrow or a stream beside its connector keeps both ends on the two things; when no spot beside it is clean (a pill's short side already holds two lines), it takes a way of its own, as a send with no connector does.
- Speech, a token's chip and an arrow's label keep 4 units off every line, so none rests on a line or by an arrowhead.
- A line keeps out of a container that holds neither of its ends when a way round is free, and off a container's edge (7 units, was 4), except in the middle of a narrow gap between two nested containers.
- An arrow alone on a connector runs on it even when the connector has a label (beside it, it read as a doubled wire); the stage draws that label again over the arrow. A call and its reply in one step still run beside it.
- A token's chip and an arrow's label stay by what they name: a spot near it with a small fault (a container's edge) beats a clean one far off, but never one over a word, a thing or a line.
- The line test also counts line ends off a thing's drawn outline, step words resting on a line, lines inside a container that holds neither end, lines along a container's edge, tags in a container their dot is not in, and sends doubled beside their connector (all 0 now); tags more than 32 units from what they name are reported apart (before: up to 160 units off; now 9, eight of them 34 to 44 units off).

### Polish: no new words, faults fixed

- A long name breaks after its own `-`, `_`, `.`, `/` or `:` (`service-web-` / `replica-b-7f9c`), with no hyphen added; only a plain word of letters is cut with a hyphen.
- Chips (a token's, a send's, an arrow's label) are sized from the measured width of their semibold words, so wide digits (`seq 2001`) fit and the dot keeps clear of the first letter.
- A token sent along a connector travels beside it (15 units off, further when a word is in the way), so its dot never runs over the connector's label or rests on its arrowhead. Shown both ways, the dot rides just behind the arrow's head.
- An arrow sent along a connector with no label, and no other send on it in the step, draws itself on the connector (it lights up) instead of beside it, so it no longer reads as a doubled line; with a label, or a call and its reply in one step, it stays beside.
- A line never dips under a box to come back up into a thing's side; a line in the gap between two nested containers runs in the gap's middle, not on an edge.
- A chart's category axis with long labels that would overlap (about 12 long names on a phone) sets each label on one line, cut with "…" (the tooltip has it whole), turned up to 90 degrees.
- 3D: meters (`level=`) are drawn, as a bar on the top face along the front edge; on a phone the gap between stacked layers grows with the scene, so a line between layers reads as a line; a floor line climbs over the container slabs it crosses instead of passing through their walls; during a move into or out of a scene inside the scene the layer planes fade with the things; a chip that moves steps aside (smoothly) from words and other chips, so the pieces of a split no longer pile up; no 3D word is set under 11 px. Inside a scene inside the scene, the labels of who takes part show while a step plays, as they do in the overview.
- The code walk's fold bar ("… 40 lines") is never dimmed with the lines out of focus, and its border shows on dark.
- A page makes the parts on screen work first (one at a time, so it paints between them), then the one the reader scrolls to, then the rest in page order; a part the reader touches works at once. On a slow phone the server's first drawing used to stay 12 to 15 seconds, now about 1. Until an animation has measured its stage, a phone shows its stage empty rather than the server's wide drawing (words of about 6 px); without scripts the server's drawing stays.

### Parts: banner out, candlesticks, free grids, own marks, the phone editor, Play

- **Banner removed.** Front matter `banner:` is refused; a note about the page is a callout under the title. Section 5 is "Callouts".
- **`kind: candlestick`** with `data: [[open, high, low, close], ...]`, lines on top, `y2`, controls; up and down from the theme's good and bad; the LLM view is `period | open | high | low | close` (sections 3 and 7).
- **Tier lists** state plainly that `tiers:` takes any names and any count; the Format page shows 3 and 7 tiers (section 3).
- **Alignment grid:** 2 to 6 names an axis, axes may differ (2x4, 5x3, 6x6); `[colour]` on a cell, `region: columns / rows "label" [colour]`, `arrows: on`; the 2x2 and 3x3 refusals are replaced by `an axis may have 2 to 6 names` (section 3).
- **Own marks and prefixes:** `marks:` and `prefixes:` in a page's front matter or the host's list, each with a label, a theme colour and an optional `means`; only what a part uses shows; an undefined mark is refused with where to define it (section 3.1).
- **The editor on a phone:** tree above the file (a closed drawer when long), code 14 px, pane at least 8 lines, rows of 36 px (section 4).
- **Play starts at once** in the terminal and the animation (2D and 3D) (section 4).

### Fix: 3D on a phone, 3D stages that stay drawn, meters (sections 6.8 and 6.9)

- On a phone, when the 3D story camera's whole view would draw the scene smaller than the size its words were laid out for (the smallest words at 11 pixels), it frames what the step touches at that size instead, looking into its highest layer (the layers above fade); the reader turns or zooms out for the rest. A step that leaves a scene inside the scene touches the thing it was entered from, with its tokens, in 2D and 3D ("where we left it").
- In a close 3D view each layer's name sits at the left end of the part of its plane that shows; names keep layer order a row apart; a plane past the stage's edge keeps its name at that edge.
- While the 3D camera flies into or out of a scene inside the scene, words stay hidden; they come in when it arrives. A 3D name at rest keeps off lines that do not end at its own thing, and a chip keeps 3 pixels from every word, when such a spot is free.
- The 3D fit uses each thing's own corners (a turned scene filled a third of the stage).
- A page asks for WebGL once and gives the test back at once; a 3D stage holds a WebGL context only near the screen and takes it again when the reader comes back, so a jump straight to a 3D scene is drawn (before, about 45 test contexts at load pushed the stage's own out: a blank stage with floating words).
- In 3D, what a zoom opens takes part in that step (its names show at once); the other names come back 0.6 s after a step (was 1.2 s).
- A meter is 7 units tall in an outlined track (was 4: a full one read as a line); in 3D it stands on the front face.
- No new author words.

### Labels and lifts: the owner's words, before the tag (section 6.11)

- A `camera` line no longer makes its targets take part in every later step: they take part only in a step that does nothing else. A connector's label needs a send along it or both ends taking part (one end was enough).
- Lifts nest: a thing inside a lifted one may rise again, above it; only the innermost lifted things stay strong and take part. Refused: lifting a thing that holds a lifted one.
- The Kubernetes sample pulls node 1 out of the cluster and cache-1 out of node 1 as it zooms in, and puts them back as it zooms out; the kube-proxy sample opens with the nodes only and adds the service at the step that calls it.

### Fit: Show everything and the first frame in 3D on a phone (section 6.9)

- **Show everything** frames every thing and every plane inside the stage, at 390 and 360 too; its words may draw under 11 pixels there. A press before the 3D stage is ready (the part comes alive on that press, or three.js is still loading) is kept and done once the stage is up; before, it was lost and the story's crop stayed.
- On a phone, a 3D story view cut to what the step touches (the 11 pixel rule) slides to keep within the scene, as the 2D view does: no band of empty stage on one side while the other side is cut. What the step touches stays in frame, and the size does not change.
- A layer whose plane is wholly off the stage: only the nearest one on each side keeps its name, at that edge, dashed, with an arrow pointing off the stage; the names of the others are left out (before, they piled at the edge as if their planes were there).
- A 3D name whose spot is on the stage is not cut at the stage's side.
- No new author words.

## 12. What changed from version 8

| Version 8 | Version 9 |
| --- | --- |
| when a thing left a group (a lift left its floor), the things around it closed up and slid | things a step does not change stay still: a thing that leaves leaves its place empty; two things never there together share one place; a test checks every step |
| a line between two things side by side could be a stub with an arrow head | every line shows at least 32 units; joined things are laid out 38 apart (tested) |
| on a phone the line under the stage ran to 3 lines | one short line, and a ? button with the whole text |
| the laptop's story view could cut a thing in half at the stage's edge, or slide past the scene and leave a third of the stage empty | it grows, or slides, to show it whole or leave it out, and stays within the scene |
| every change of a step ran at once, at one speed | `then` (beats), `pace slow`/`fast`, `spotlight`, `say <id> above:`, `move ... path=arc` |
| the camera framed things; nothing more | `camera <id> close`/`far`, `turn=`, `tilt=`; it glides between steps; clamped above the planes |
| in 3D, clicking a thing on a lower layer put the camera between planes; 2D scenes opened in 3D hung their contents under their container; a lit container swallowed its contents | the camera stays above every shown plane and layers in the way fade; such scenes stand on one floor; a lit container lifts its contents; a check of what is drawn covers every step, 11 camera paths, 1280, 390 and 360 and a resize |
| a token's tag jumped and flickered as the token moved in 3D | it keeps its offset while moving and eases at rest; 3D names take their spots in order |
| a token could only sit at a thing; split and merge were for shapes | tokens wait in containers and queues, split into pieces and merge back, move several as one hop, `drop`, `send ... as`; `closed=yes` with `zoom into` and `zoom out` (a semantic zoom) |
| the fence's `fill=` was not passed to the scene | it is, with `pace=` |

## 13. What changed from version 6

| Version 6 | Version 7 |
| --- | --- |
| a family coloured the words too (its ink), and always tinted the inside | words stay in ink; the family is on the border, the lines and an optional tint (`fill=soft` default, `fill=none`); a thing of its container's family drops the tint; the legend's words are neutral |
| a request could go `a -> b -> c` in one step | one hop per step; doccheck refuses a longer path or a chain of sends in one step (a stream may run a longer path) |
| in 3D the camera could turn below the upper planes, so things looked under them; see-through planes could paint over slabs | the camera stays above the top plane; planes, slabs and things draw in order, solid things solid; a test checks that every thing rests on its plane |
| only drag and Ctrl + wheel moved the view; the hint hid behind the legend; arrows changed the step | wheel and trackpad scroll, arrow keys, + and −, W A S D (3D), right-drag (3D), a tap then one finger (phone); the hint is a line under the stage; a reset button |
| the 3D stage read the colour tokens only on a dark-mode switch | it reads them again on any theme or palette switch; no colour value in the engine (tested) |
| a code walk always morphed between steps | `animate=on|off|auto`: a move between different functions or files is still (open and highlighted, the rest folded); a morph only when the same code changes |

## 14. What changed from version 5

| Version 5 | Version 6 |
| --- | --- |
| a sent token was a pill with its whole label, resting on the thing it reached | a small dot with a one-line chip, placed where it covers no label; `send arrow` draws an arrow from source to target, `send both` does both |
| the camera framed what the author asked for; on a phone it could leave things out | the camera adds everything the step touches; a phone gets a narrow (top to bottom) layout; never larger than 1.5 times |
| the zoom buttons and the hint sat on the stage | they sit in a bar above it |
| a container grew and shrank as things came and went; a thing moving between layers jumped across | one size per thing for the whole story; a thing moving between layers keeps its place in the row |
| sizes were numbers in the code; labels never wrapped | a design system: sizes s, m, l (`size=`), wrapping at 3 lines, one radius per shape |
| a stream started again at every step; a meter's fill had the box's border colour; a queue's front was far from its workers | streams that run on keep flowing; `--meter`; a queue's front sits by what takes from it (format version 8) |
| a step could not show a steady flow or a fill level | `send stream` (dots that keep flowing for the step) and `level=0..100` (a meter in any thing) |
| colour came from tones only | families: `family app "apps"` and `is=app`, one palette colour per family, with soft and ink variants, light and dark; a legend |
| the LLM view: captions only | each caption is followed by its sends as `a -> b: label`; a line names the families |

## 15. What changed from version 4

| Version 4 | Version 5 |
| --- | --- |
| an animation is drawn flat only; 3D was an idea | the same scene draws flat or in 3D; a **2D/3D** button on every stage keeps the step; ```animation 3d opens in 3D |
| no layers | `layer <id> "label"`, `layer=` on any entity, `split layers`, `stack layers`, `focus <layer>` (section 6.9) |
| the 2D stage: one layout for the top level | top-level things on two or more layers are drawn as bands, one per layer, with lined-up columns |
| the LLM view: what the stage starts with, then captions | the same, plus one line naming the layers, top to bottom, with what is on each |
| doccheck refused any word after `animation` | `3d` and `2d` are allowed; an unknown layer and a focus on an undeclared layer are refused |

## 16. What changed from version 3

| Version 3 | Version 4 |
| --- | --- |
| 7 animation kinds (```animation sequence, flow, cells, tree, trace, stack, state) | one engine: entities, containers, data structures, connectors, layouts, a camera, steps (section 6) |
| an animation is watched | the reader can also pan, zoom, click a thing for its note, and jump to any step |
| terminal: `? ` lines were a question and its typed answer, `# ` a comment | the shell-session convention: `$ `, `% `, `# ` (root) are commands; every other line is output |
| commands shown as plain text | commands highlighted as bash |
| code walk: repo references only | code walk takes `@file` inline code too, like the editor |
| file tree chips with letters (A, M, D, G, C) | chips with the mark's own word; the fixed lists are in section 3.1 |
| one small mouse icon | a larger icon that fills the pressed button; a "2" for a double click |
| the animation's LLM view: its kind and actors, then captions | what the stage starts with, then captions |
