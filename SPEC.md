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
| a part the host keeps (format version 11) | a reference, on its own paragraph or in a sentence | `[[chart:sales "Sales"]]` (section 8a) |
| steps on a part | a line `@step <title>` inside it | `@step Init call 1` |
| inline part | a word in a sentence | `:kbd[Left]`, `:mouse[click Next]` |
| table of contents | one line | `::toc` or `::toc{depth=2}` |
| callout | a blockquote with a bold marker | `> **Watch out:** ...` |
| own marks and prefixes | front matter (or the host's `marks` and `prefixes` options of `parse()`) | `marks:`, `prefixes:` (section 3.1) |

- **Parts with data** are `terminal` (also written `console` or `shellsession`), `filetree`, `editor`, `codewalk`, `chart` and `animation`. Any other fence (```` ```ts ````, ```` ```diff ````) is a plain code block. On any Markdown viewer (GitHub, an editor) a part still shows as readable text.
- **The info string** after the part name may carry `#id`, `key=value` or `key="two words"`. Ids are optional: give one only when something links to the part.
- **Containers** do not nest. Inside `:::tabs` and `:::accordion`, every heading (at the highest level used inside) starts one tab or row. Containers may hold fenced parts.
- **`:::llm` belongs to the part or `:::human` segment right before it** (blank lines between are fine). An LLM reads it instead of that part.
- **`.dh.md` only when needed.** doccheck refuses a `.dh.md` page with no part, and a `.md` page with one.

## 2. The LLM view: strip the wrapper, keep the content

| In the source | In the LLM view |
| --- | --- |
| prose, headings, lists, tables, code blocks, code references | kept unchanged |
| ```` ```terminal ````, ```` ```filetree ````, ```` ```editor ````, ```` ```codewalk ```` | the block as written; `#id` and `title=` dropped from the info string |
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

**Boxes and lines are an `animation`.** There is no separate diagram part: every drawing of boxes joined by lines is an `animation` (section 6), with no `@step` lines when it stands still. Since 0.7.0 a ```` ```mermaid ```` block is a plain code block, and doccheck refuses it with one message that names the `animation` part (and ```` ```sequence ```` for a sequence diagram).

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

#### Audio

````
```audio src="media/episode-12.mp3" title="Episode 12: the crash" wave=bars duration=12:34 skip=10
peaks: media/episode-12.peaks.json
chapter 0:00 Welcome
chapter 3:20 The bug
marker 5:02 The crash [bad]
0:00 Ana: Welcome back.
0:04 Ben: Today we look at a crash.
```
````

- **Options:** `src` (mp3, m4a, aac, wav, ogg, oga, opus, weba, flac), `title`, `wave=bars|line|mirror|dots|live`, `height=s|m|l`, `compact`, `tone=<colour word>`, `speed=on|off`, `speeds=0.75,1,1.25,1.5,2`, `skip=10|15|30` (back and forward buttons), `start=1:20`, `loop`, `volume=on|off`, `download=on`, `transcript=open|closed|off`, `duration=12:34`. Flags are bare words (`loop`, `compact`). **`autoplay` is refused: a reader presses Play.** Times are `m:ss` or `h:mm:ss`.
- **Body lines:** `peaks: <file.json>` (the BBC audiowaveform format; `bun src/parts/audio/peaks.ts <file>` writes one with ffmpeg), `transcript: <file.vtt|.srt>`, `chapter m:ss Title`, `marker m:ss Title [colour]`, and transcript lines `m:ss Speaker: text` (or `m:ss text`). `//` starts a comment.
- **The wave** is drawn across the player from the peaks (without a peaks file the browser decodes the file when it is on the page's own origin and under `audioDecodeBytes`, else a flat line until it plays). While it plays, the played part fills, the playhead glides, and the bars around it rise and fall with the sound (the Web Audio analyser when the file is same-origin, else a pulse on the peaks; none under reduced motion). `wave=live` shows a window of eight seconds, centred on now. Chapters split the wave with gaps, markers are flags on it.
- **The transcript** lights the line being spoken and keeps it in view inside its own box (the page never scrolls by itself); a tap on a line seeks there; a search box filters and marks words. **Keys** (the player has focus): Space or `k` play and pause, `j` and `l` 10 s, Left and Right 5 s, `,` and `.` speed, `0` to `9` a tenth of the way, `m` mute, Home and End. The wave is a slider (`role=slider`, `aria-valuetext` "1:23 of 12:34").
- **Addresses:** the file, the peaks file and the transcript file go through the host's `urlPolicy` as `image` when the player is drawn; a refused file shows a note. Nothing is fetched before the page is drawn, and nothing plays before Play.
- **LLM view:** `Audio: <title> (<duration>), <address>. Chapters: ... Markers: ...` and then the transcript as written.
- **Tokens:** `--audio-bg`, `--audio-ink`, `--audio-wave`, `--audio-played`, `--audio-played-2`, `--audio-playhead`, `--audio-buffer`, `--audio-chapter-gap`, `--audio-marker`, `--audio-radius`, `--audio-bar-w`, `--audio-bar-gap`. **Slots:** `play`, `wave`, `chapter`, `marker`, `time`, `speed`, `volume`, `transcript`, `cue`, `cue-active`.
- **Caps:** `audioTranscriptLines` (2,000; 1,000 in UNTRUSTED_LIMITS), `audioChapters` (200; 100), `audioMarkers` (200; 100) checked when the page is parsed; `audioVttCues` (5,000; 2,000), `audioWaveformSamples` (20,000; 10,000), `audioPeaksBytes` (1 MB; 500 KB), `audioDecodeBytes` (20 MB; 10 MB) and `audioTranscriptBytes` (1,000,000; 256,000) travel in the data and are checked in the browser when the file loads. Response bytes are capped while reading.
- **doccheck refuses:** no `src`; a `src` that is not an audio file; an address that is not allowed (`data:`, `blob:`, `javascript:`, `file:`, `//`); `autoplay`; an unknown option; a wave style, tone word, `skip=`, `speeds=`, `duration=`, `start=` or `transcript=` that is wrong; a chapter out of order or past `duration=`; a transcript line out of order or past it; a `transcript:` file that is not `.vtt` or `.srt`; a `peaks:` file that is not `.json`; a marker colour that is not a colour word; a line the part does not know; a player over its caps or over the page's work budget.

#### Chart kinds

Eight kinds of a `chart`: `histogram`, `boxplot`, `violin`, `funnel`, `waterfall`, `treemap`, `sunburst` and `calendar`. The fence is still ```` ```chart ````; a top-level `kind:` of one of these is this part (its block type is `chart-kinds`, its doccheck messages start `chart:`). The YAML is read by the package's own reader, so its size caps and the page's work budget apply.

````
```chart
kind: histogram
title: How long a request takes
x: { label: latency, format: duration-ms }
bins: 20
marks: [p50, p95, p99]
data: [112, 98, 143, 131, 87, 205, 119]
```
````

- **histogram:** `data: [numbers]`, or `series: [{ name, data, tone }]` (up to 4, drawn over each other on the same bins). `bins: 20` (1 to 400) or `bin: 5` (the width of one bin); `from` and `to` set the range. `x` says what the values are (`label`, `format`, `currency`); `y.label` names the count. **LLM view:** `from | to | count` (one count column per series), then the marks.
- **boxplot** and **violin:** `x: { values: [names] }` and `data: [[numbers], [numbers], ...]`, one list per name. The box is the quartiles (linear interpolation), the line the median, the diamond the mean, whiskers reach the furthest value within 1.5 box lengths, rings are the outliers beyond. The violin is a Gaussian kernel density (`bandwidth:` sets its smoothness; Silverman's rule by default) with the box inside. **LLM view:** `category | min | p25 | median | p75 | max | outliers`.
- **`marks: [p50, p95, p99.9, mean, 120]`** (at most 8): dashed lines at percentiles of all the values, the mean, or a plain number. Each is a button with a card that says what it means.
- **funnel:** at least 2 stages, each `[name, count]` or `{ name, value }`. The shape narrows with the count; a chip between stages shows the share lost. **LLM view:** `stage | count | of the first | of the one before`.
- **waterfall:** `data` is the start (a number), changes (plus or minus) and `"="` where a running total shows; `x.values` names each entry. Rises are `good`, falls `bad`, start and totals the accent (a waterfall takes no `tone`). **LLM view:** `step | change | running total`.
- **treemap** and **sunburst:** `data` is a tree of `{ name, value }` leaves and `{ name, children: [...] }` branches; a branch is the sum of what is in it. A top-level entry may take `tone:`; its branch is that colour. `depth:` is how many levels show at once (treemap 1 to 4, default 2; sunburst 1 to 5, default 3). Click, tap or Enter opens a branch; the path above, Backspace or (sunburst) the centre goes back. **LLM view:** an indented list, `name: value (share)`.
- **calendar:** `data: [["2026-11-20", 4], ...]`, a date and a number per day; `from` and `to` (ISO dates) set the range, by default the first and last date; `week: mon|sun`. Each day is a square coloured by its number; a day with no data is dashed. **LLM view:** `month | days with data | total | busiest day`. (The `calendar` fence of places and time is a different part.)
- **Common words:** `title`, `tone` (`c1` to `c8` or `1` to `8`, `acc`, `good`, `warn`, `bad`, `muted`; a tree takes it on a top-level entry, a waterfall not at all), `y: { label, format, currency }` with the formats `number`, `percent`, `money`, `duration`, `duration-ms`, `bytes`. **`steps:`** (2 to the cap) each name what they change (`data`, `series`, `marks`, `bins`, `bin`, `from`, `to`, `tone`, `depth`, `bandwidth`) and play with the kit's one control row; static draws one step whole.
- **Reading it:** every bin, box, stage, block, arc and day opens the one card (hover, tap, focus); arrow keys walk the data; Esc closes. The grid of a calendar scrolls inside its own box on a phone. A table of the numbers sits under each chart.
- **Caps** (LIMITS; UNTRUSTED_LIMITS in brackets): `chartKindsValues` 5000 (2500) raw values, `chartKindsViolinValues` 1500 (750), `chartKindsBins` 400 (200), `chartKindsCategories` 40 (20), `chartKindsSeries` 4, `chartKindsMarks` 8, `chartKindsStages` 20, `chartKindsSteps` 20 (10), `chartKindsTreeNodes` 2000 (1000), `chartKindsTreeDepth` 8 (6), `chartKindsDays` 740 (400), `chartKindsLabel` 60 characters of a tree name. Counting, sorting, the density (about 48 steps a value), the tree and both layouts are charged to the page's work budget when the part is read.
- **doccheck refuses:** YAML that cannot be read or has no `kind:`; no data, a value that is not a number (it names the index), an empty list; `bins` not a whole number from 1 to the cap, `bins` with `bin`, a `bin` that makes too many bins; a mark that is not `pNN`, `mean` or a number; more marks, series, categories, stages, steps or values than the caps; a name list that does not match the data lists; a funnel with fewer than 2 stages or a first stage of 0; a waterfall that starts with `"="` or has an entry that is neither a number nor `"="`; a tree leaf with no value above 0, an entry with no name, an unknown key, `tone` on a deeper entry, an empty `children`, a bad `depth`, a tree past its caps; a calendar date that is not real, twice, outside `from`/`to`, over the day cap, a bad `week`; an unknown key (it lists the keys), tone or format; a step that changes what the kind does not have; and a chart over the page's work budget. It warns about values outside `from`/`to` and a funnel stage larger than the one before.

#### Compare

````
```compare title="Which queue?" winner=on pick=Kafka
options: Redis Streams [c1], Kafka [c2], SQS [c3]
Ordering: yes, yes, partial (FIFO queues only)
Runs itself: no, no, yes
Throughput: 3, 5, 3 (score 1-5)
Latency (lower is better): 4 ms, 12 ms, 25 ms
Cost at our size: good, bad, good
```
````

- The first line is `options:` and the names (an optional colour word in square brackets after a name). Every other line is `<criterion>: <value>, <value>, ...`, one value for each option, in order. A value is `yes`, `no`, `partial`, `good`, `warn`, `bad`, a number with an optional unit (a score), `-` or `n/a` (no data), or a word. A note in round brackets after a value shows on hover, focus or tap, in the one popover card. `score 1-5` in a note sets the row's scale (the bar); `(lower is better)` in the criterion or a note turns a score round.
- **One row holds one kind of value** (yes/no/partial, good/warn/bad, numbers, or words). Lines starting `//` are comments.
- Fence keys: `title`, `winner=on` (marks the best value of each yes/no, scored and good/bad row, and says how many rows each option wins; a row of equal values has no best), `pick=<option>` (a flag on the option you recommend), `view=single` (on a phone, one option at a time), `static=`.
- On a wide stage the options are columns. Under 560 px the matrix scrolls inside its own box with the criterion fixed at the left and a shaded edge, and a switcher offers one option at a time. Colour is never the only signal: a yes is a tick and the word, a good is the word in a chip. Slots: `title`, `switch`, `tabs`, `scroll`, `table`, `pick`, `wins`, `best`, `popover`.
- **LLM view:** a Markdown table, options as columns, notes kept; with `winner=on` the best values are bold. A body that does not read stays a code block.
- **Caps:** `compareOptions` (8), `compareRows` (40; 25 in UNTRUSTED_LIMITS), `compareValue` (120) and `compareName` (80) characters, `compareNote` (300; 200) characters.
- **doccheck refuses:** a row with the wrong number of values (it counts them), mixed kinds in one row (it names both), a first line that is not `options:`, fewer than 2 options, a repeated option, a colour word that is not one, an empty value, a scale that does not go up or a value outside it, an unknown key, `winner=` not `on` or `off`, `view=` not `table` or `single`, a `pick=` that is not an option, more options, rows, characters than the caps, and a part over the page's work budget.

#### Compare image

````
```compare-image title="A dashboard, light and dark" before="Light" after="Dark"
before: media/before-light.svg "A dashboard with four tiles and a bar chart on a light page"
after: media/after-dark.svg "The same dashboard on a dark page"
```
````

- Each image line is `before:` or `after:`, an address and the **alt text in double quotes** (required: it is the LLM view and what a screen reader says; `\"` is a quote inside it). The address goes through a URL policy: a relative path, http or https, to an image file (png, jpg, webp, gif, avif, svg); never `data:`, `blob:`, `javascript:`, a `//` address, a backslash or a `..` that leaves the folder. The host's own `urlPolicy` is applied again when the image is drawn, and an address it refuses is shown as a message in place of the pictures. Lines starting `//` are comments.
- Fence keys: `title`, `before=` and `after=` (the two labels, "Before" and "After" by default), `start=` (0 to 100, the bar's first place), `direction=vertical`, `ratio=16:9`, `fit=contain` (with `ratio=`), `static=`.
- Drag the bar or anywhere on the picture; the arrow keys move it by 1 (Shift: 10), Page Up and Page Down by 10, Home and End to either side; Enter or Space flips from one picture to the other; a tap that does not move flips too; the two labels are buttons that show a whole picture. The bar is a slider (`aria-valuenow`, "Light 40%, Dark 60%"); the grip is 44 px. Slots: `title`, `stage`, `before`, `after`, `label-before`, `label-after`, `bar`, `handle`.
- **LLM view:** the title and the two labels, then each label with its alt text. A body that does not read stays a code block.
- **Caps:** `compareImageAlt` (300; 200 in UNTRUSTED_LIMITS) characters of alt text, `compareImageLabel` (40) of a label, `compareImageUrl` (500; 300) of an address.
- **doccheck refuses:** a line with no alt text, a missing `before` or `after`, one given twice, an address the policy refuses (it says why), an empty alt text or one over its cap, a bad `start=`, `direction=`, `ratio=` or `fit=`, an unknown key, and a part over the page's work budget.

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
- **Caps:** `downloadsFiles` (100; 40 in UNTRUSTED_LIMITS) files in one list, and `downloadsCheckBytes` (64 MB; 16 MB) the most the Node entry reads of one file to check its checksum.
- **Local files:** `checkLocalFiles` from `durian-hypermedia/node` (never the core) reads each file named under the host's root: the stated size must be what the file has at the precision written, and the checksum must match; a missing file, an absolute path or a `..` is refused.
- **doccheck refuses:** an address that is not allowed; a size with no unit (B, KB, MB, GB; decimal); a checksum of the wrong length or not hex; `md5=` or `sha1=` (weak: use `sha256=`); a second label; an unknown `key=`; a word that is not a size, a label or a key; a file listed twice; no files; more files than the cap; an unknown option; a part over the page's work budget.

#### Explore

```json explore query=".items[] | select(.qty > 1)"
{"items":[{"name":"tea","qty":2},{"name":"cup","qty":1}]}
```

A json, yaml or csv fence with the bare word explore draws a foldable tree, counts, search that opens matching ancestors, path copying, a table for lists of objects, starter queries and a jq subset box. Without explore it remains an ordinary fence. The author query= runs during parsing on the page budget. A reader query always receives a new budget, so a failed query does not spend the next one. The LLM reads the original data followed by the author query result. :::llm can replace it.

The query subset provides paths, iteration, select, map, pipes, arithmetic, arrays/objects, variables, conditionals, try, sorting/grouping, strings and a metered non-backtracking regex test. Unsupported syntax or functions are refused by name. Integer-looking object keys follow JavaScript order. CSV accepts quoted fields, doubled quotes and newlines in fields, and recognizes plain decimal numbers. YAML uses the host reader and its page, node and alias caps.

TOML explore is recognized but explicitly refused: TOML explore needs a TOML reader; this build has none.

Caps (authored; strict in parentheses when lower): exploreChars 262144 (131072), exploreDepth 64 (32), exploreCsvRows 5000 (2500), exploreCsvCols 30 (20), exploreQueryChars 2000 (1000), exploreReaderQueryChars 500, exploreQueryDepth 100 (50), exploreQueryResults 10000 (5000), exploreRegexChars 2000, exploreRegexProgram 4000 (2000), exploreRegexRepeat 200, exploreQueryJsonChars 100000, exploreReaderSteps 200000 (100000), exploreReaderValues 400000 (200000), exploreReaderChars 1000000, exploreRowsPerNode 100, exploreSearchNodes 20000 (10000), exploreTableRows 200, exploreTableCols 12, exploreStringCut 120. Hosts can lower all caps.

Doccheck refuses unknown options, invalid JSON or YAML, malformed or unclosed CSV, duplicate headers, a missing CSV header or data row, too many columns/rows, too much data, nesting over the cap, query errors, unsupported syntax, too many query results, and work beyond the page budget.

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

#### Gantt

````
```gantt title="Release 2.0" today=2026-12-09
section Build
design "Design" 2026-12-01 .. 2026-12-04 done
api "API" after design 8d 60%
ui "Screens" after design 6d
section Ship
beta "Beta" after api ui 3d [warn]
launch "Launch" milestone after beta
```
````

- A task line is `<id> "label" <start> <end or length> [progress%] [done] [colour]`. A start is a date (`2026-12-01`), a date and time (`2026-12-01T09:00`) or `after <id> [<id> ...]` (the day after the last of them ends). An end is `.. <date>` (the last day of the bar) or a length: `3d`, `2w`, `4h`, `90m`. `milestone` is a point. `section <name>` groups the lines after it. An id is letters, digits, `_`, `.` and `-`; colours are the colour words (`c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`), never a hex value.
- **Fence keys:** `title=`, `today=` (a line on that date; never the real clock), `workdays=on` (lengths skip Saturday and Sunday), `critical=on` (the longest chain of `after`s is outlined), `tz=` (an IANA zone; dates are wall-clock in it, default UTC).
- **Steps:** `progress <id> 80%`, `done <id>`, `move <id> 2026-12-12` (a slip; the tasks after it follow); tasks and sections written under a step appear in it. **Static:** `static=` on the fence draws one step whole, at the scale the page picked, with no Day/Week/Month buttons, no control row and no hint.
- **Reading it:** hover, tap or focus a bar for its dates and what it waits for; Day, Week and Month change the scale; on a phone the names sit above the bars and the scale scrolls sideways inside its box. A table of the tasks sits under it. The part is the same height before and after the page measures its width, so the Next button never moves under a finger.
- **LLM view:** `Gantt: <title>.` and a table `task | start | end | after` for each section (progress, done and milestone in the task cell), then the critical chain with `critical=on`, and for each later step only the tasks that changed.
- **Caps:** `ganttTasks` (200; 100 in UNTRUSTED_LIMITS), `ganttSteps` (30; 15), `ganttSections` (30; 15), `ganttDeps` (600 `after` arrows; 300) and `ganttSpanDays` (3,700 days; 1,850). The schedule of every task at every step is charged to the page's work budget when the part is read.
- **doccheck refuses:** `after` an unknown id, a task that waits for itself or for one that first appears in a later step, a loop of `after`s (it names the tasks), an end before its start, an unknown length unit, a length of 0 or a length over the span, progress over 100%, a task written twice, an unknown colour, a line it does not understand, a step command (`progress`, `done`, `move`) outside a step or on an unknown task, an unknown fence key, a `tz`, `today` or `workdays` it cannot read, no tasks, more tasks, sections, arrows or steps than the caps, a chart that would span more days than the cap, and a part over the page's work budget. It warns on a label over 60 characters.

#### Glossary

````
```glossary title="Words we use"
term "UL" also "ubiquitous language": the words a team agrees on and uses in code and in talk
term bc "bounded context" also "context map": one part of the system with its own **words**
```

Each team keeps its own UL inside a bounded context.
````

- A glossary block draws the list of its terms, each with an anchor (`<idPrefix>term-<id>`: the page's id prefix, `dh-` by default, so two documents on one page share no id). A line is `term [id] "<term>" [also "<other name>", ...]: <meaning>`; an indented line goes on with the meaning; a blank line or `//` line is skipped. The meaning is small Markdown: `code`, **bold**, *italic* and an https link. The id is made from the term unless given. `title=` names the list; `#id` is the block's id.
- The same terms can go in front matter: `glossary:` and then `UL: the words a team agrees on`. A term defined in front matter or in a block is a term of the whole page.
- **In the text:** a term is found as a whole word (the first letter's case is free, the rest as written; the longest name wins), and its first use in each section (up to the next heading of level 1 or 2) is a button with a dotted underline. Hover (after a short wait), tap, or focus it and press Enter: a card shows the meaning, "All terms" (when the page has a glossary block) and Copy; Esc or a tap outside closes it. A term is never marked inside inline code, a code block, a link, an image, a heading, a table's rule row or an HTML tag.
- **A host's word list:** `parse(text, { glossary: [{ term, aliases?, def }] })` hands in a site-wide list. Its terms are marked like the page's own; a term the page defines (front matter or a block), by name or other name, wins and the host's is left out. The list is checked with the same caps (a problem names the entry), is not warned about when unused, and is listed once in the LLM view after the front matter (`Glossary (from the site):`).
- **LLM view:** the glossary once, as a list (`- **UL** (also: ...): meaning`), where the block is; front matter terms are kept in the front matter at the top. The marks in the text are plain text.
- **Caps:** `glossaryTerms` (200 on a page; 100 in UNTRUSTED_LIMITS), `glossaryLabel` (60 characters), `glossaryDef` (600 characters; 400 in UNTRUSTED_LIMITS) and `glossaryAliases` (5 other names).
- **doccheck refuses:** a line that is not a term line, an empty meaning, a name or meaning over its cap, a bad id, too many other names, more terms than the cap, a term (or its id) defined twice (it names both lines), an unknown key, front matter `glossary:` that is not a map of text. It warns on a term the text never uses.

#### Log

```log labels="app=shop" title="Checkout"
2026-11-20T10:00:00Z info request status=200
2026-11-20T10:00:01Z error timeout status=504
@highlight |= "timeout" [bad] "the request timed out"
```

Reads JSON, logfmt and time/level/message lines. Consecutive repeated lines fold (fold=off disables it). Level chips, as-written or relative times, matched-word marks, author highlights and a reader LogQL box are included. @highlight accepts a LogQL filter or line 3-5, optional colour word and a quoted reason. llm=highlights keeps matching lines and two nearby lines; otherwise the LLM reads highlights first and the log as written, folding repeats.

The LogQL subset supports selectors, literal and non-backtracking regex line filters, json/logfmt parser stages and field comparisons (including durations and bytes), joined by and, or or comma. Metric queries and unsupported stages are refused by name. Every reader query receives a new budget.

Caps: logLines 5000 (2500 strict), logQueryChars 2000 (1000), logReaderQueryChars 500, logQueryDepth 100 (50), logQueryResults 10000 (5000), logRegexChars 2000, logRegexProgram 4000 (2000), logRegexRepeat 200, logQueryJsonChars 100000, logReaderSteps 200000 (100000), logReaderValues 400000 (200000), logReaderChars 1000000. Hosts may lower each. All author work shares the page budget.

Doccheck refuses an empty log, unknown option, too many lines, bad filter or unsupported query stage, invalid highlight, missing or empty reason, unknown colour, reversed or zero line range, highlight past the end, highlight matching no line, and work over the budget.

Rows expose data-span and optional data-trace, accept keyboard focus and show a Show span action when the trace marks them data-trace-linked=1. The action dispatches dh-trace-focus on document with span and trace.

#### Lottie

````
```lottie src="media/loading.json" title="What happens while it builds" loop
alt: A box fills with blocks, one row at a time, then a tick appears.
colours: dh-c1 = c1, dh-warn = warn
```
````

- **Options:** `src` (`.json`), `title`, `loop`, `speed=0.25..4`, `start=paused|play`, `height=s|m|l`. `alt:` is required (screen readers, the LLM view). `colours:` maps a layer or group name in the file (`dh-c1`) to a theme colour word, so the file follows light and dark and is painted again when the theme changes. `//` starts a comment line.
- It plays while on screen and stops off it. Under reduced motion, or with `start=paused`, it shows one still frame (the finished state) and plays only when the reader presses Play. Controls: Play and Pause, Replay, a frame slider, a speed menu. lottie-web's light build is loaded (as `lottie-web`) when the part is drawn.
- **Checked at load, before the library is fetched:** the file's size, its frames, its layers and its values, no expressions, and nothing loaded from outside the file: no image that is remote or a separate file (an embedded `data:image/png|jpeg|webp|gif` image is allowed), and text only as the file's own glyphs. The file is kept inside its part. The walk of the file charges a budget of its own. A file that fails shows its reason in place of the animation.
- **Addresses:** the file goes through the host's `urlPolicy` as `image` when the part is drawn. Response bytes are capped while reading.
- **LLM view:** `Lottie animation: <title>. <alt>`. **Tokens:** `--lottie-bg`, `--lottie-radius`. **Slots:** `stage`, `play`, `speed`, `alt`.
- **Local file:** `checkLocalFiles` from `durian-hypermedia/node` reads the file and runs the checks the browser runs at load (size, frames, layers, no expression, nothing loaded from outside the file) and checks that every `colours:` name is in the file.
- **Caps** (travel in the data, checked in the browser when the file loads): `lottieBytes` (1 MB; 256 KB in UNTRUSTED_LIMITS), `lottieFrames` (3,600; 1,800), `lottieLayers` (500; 200), `lottieNodes` (200,000; 50,000).
- **doccheck refuses:** no `alt:` line; no `src`; a `src` that is not a `.json` file or not an allowed address; a `colours:` entry that is not `name = colour` or names a colour that is not a theme colour word; `speed=` outside 0.25 to 4; `start=` other than paused or play; a bad `height`; an unknown option; a line the part does not know; a part over the page's work budget.

#### PDF

````
```pdf src="media/q3-report.pdf" title="Q3 report" page=3 view=page height=m
```
````

- **Options:** `src` (`.pdf`), `title`, `page=<n>`, `view=page|scroll` (a page at a time, or all pages scrolling), `height=s|m|l`. No body lines.
- A toolbar with page number and count, Previous and Next, zoom (fit width, fit page, in, out), search (every page's text is read once; a run charges a budget of its own; matches are marked on the page and counted), the outline (bookmarks) as a side list (a drawer on a phone), and Download. Text is selectable. Keys: PageUp and PageDown (and Left and Right in the page view), `+`, `-`, `0`, `/` search, Home and End. On a phone a swipe turns the page.
- **The file** is fetched by us with response bytes capped while reading and checked at load against `pdfBytes` and `pdfPages` before pdf.js parses it; pdf.js runs with `isEvalSupported: false` and scripting off. Form fields, scripts and link annotations are not drawn. The address goes through the host's `urlPolicy` as `image`.
- **The worker.** Under strict Trusted Types the viewer must not start a `Worker` (a script-URL sink), so by default pdf.js's worker module is imported into the main thread (`globalThis.pdfjsWorker`, pdf.js's own hook): no `Worker`, no `eval`, no HTML string, no policy. A host that wants a real Worker serves `pdf.worker.min.mjs` from its own origin and sets `<html data-dh-pdf-worker="worker" data-dh-pdf-worker-src="/assets/pdf.worker.min.mjs">` (used only when the page's own header does not require Trusted Types).
- **LLM view:** `PDF: <title>, <address>.` (the text of the file is not read by the parser; a host that wants it gives a `:::llm`). **Tokens:** `--pdf-bg`, `--pdf-radius`, `--pdf-page-bg` (white in dark too, pages are paper), `--pdf-gap`. **Slots:** `toolbar`, `page`, `outline`, `search`.
- **Local file:** `checkLocalFiles` from `durian-hypermedia/node` checks the file is a PDF within its cap and has the page `page=` names (pages are counted as page objects; a file that keeps them in compressed object streams is not page-checked).
- **Caps** (travel in the data, checked in the browser at load): `pdfPages` (500; 200 in UNTRUSTED_LIMITS), `pdfBytes` (20 MB; 8 MB).
- **doccheck refuses:** a `src` that is not a `.pdf` file or not an allowed address, no `src`, `page=` that is not a number from 1, a `view` other than page or scroll, a bad `height`, an unknown option, any body line, a part over the page's work budget.

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
- **Labels:** full node labels sit on theme-coloured plates, wrapping at spaces when needed; no ellipsis. Positions are reserved across steps. The example index leads with Fishbone and Sankey, each with live and static drawings.
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
dev -> cli: scaffold create
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
- **doccheck refuses:** an `end`, `else` or `and` with no block open (or an `else` in a loop, an `and` in an alt), a block never closed, blocks nested too deep, a message or note with no text, an unknown participant kind, a participant declared twice, the form `participant A as B`, an id with a character outside the set, a line that is none of these, no message at all, more participants or lines than the caps, `steps=each` with `@step` lines or with fewer than 2 messages, an unknown attribute, and a part over the page's work budget.

#### Sparkline in a sentence (`:spark[...]`)

```
Sign-ups were :spark[120,135,128,160,182,171,205] this week, and errors fell to :spark[14,12,15,9,7,4,3 bar good].
```

- `:spark[3,5,2,8,9]` draws a tiny line the height of the text; `:spark[3,5,2,8,9 bar good]` makes bars and sets the colour. The numbers are joined by commas; then, optionally, `line` or `bar`, and one colour word (`c1` to `c8`, `acc`, `good`, `warn`, `bad`, `muted`). Hover, focus or tap it for the numbers; it is plain inline SVG with the numbers in its label.
- It is a part of a sentence: it is read in a paragraph, a list item, a quote, a callout or a table cell, and never inside inline code, a link, an image, a heading or an HTML tag (there it stays as written).
- **LLM view:** `(3, 5, 2, 8, 9)`.
- **Caps:** `sparkValues` (200; 100 in UNTRUSTED_LIMITS) numbers in one sparkline.
- **doccheck refuses:** fewer than 2 numbers, a word that is not a number, a style or a colour, more numbers than the cap. A wrong sparkline stays as written text.

#### Stacktrace

A printed Go, .NET, Bun/Node, Dart, Java or Python trace.

```stacktrace lang=js app=/src/shop
Error: request failed
    at handler (/src/shop/api.ts:42:11)
    at run (node:internal/process:10:5)
```

Language detection can be overridden with lang=. Library frames fold; app= marks a comma-separated set of module, package, function or path prefixes. Vendored code stays a library. Causes, suppressed errors, goroutine groups, Python source lines, async gaps and omitted-frame counts are preserved. Tap or focus a frame to read its raw detail. repo= and strip= identify code references. The matching front matter pins entry supplies the commit: the frame detail shows its first seven characters, and the reference tooltip keeps the complete commit. Without a matching pin the reference still names the file and line.

The LLM reads the trace as written. Above 400 tokens library runs become one line; llm=full retains all frames. A following :::llm replaces this view.

Caps: stacktraceLines is 2000 (1000 in UNTRUSTED_LIMITS); hosts may lower it. Every scan charges the page budget.

Doccheck refuses unknown options, an unknown language, strip= without repo=, secret-looking text, an undetectable language, no recognizable frame, a .NET frame before its exception, too many lines, and too much work. app= matching no frame warns.

#### Timeline

````
```timeline title="A release plan"
2026-05-04 Design review [c1]
  Scope and owners agreed
2026-11-23 Version 2 ships [good] note="the big one"
```
````

- One line per event: a year (`2026`), a month (`2026-11`) or a day (`2026-11-23`), a title, an optional `[colour]` (the colour words `c1`..`c8`, `acc`, `good`, `warn`, `bad`, `muted`, never a hex value) and `note="..."`. An indented line is a detail. List events oldest first (doccheck warns otherwise). `dir=across` lays it out sideways on a wide stage; a narrow stage is always top to bottom. Steps build it up: an event under a later step is there but invisible, so the size never changes. **Static:** `static=` on the fence draws one step whole.
- **LLM view:** `Timeline: <title>.` and a dated list: `- 2026-11-23: Version 2 ships (the big one) — a detail; another`, under the step captions when stepped.
- **Caps:** `timelineEvents` (80; 50 in UNTRUSTED_LIMITS).
- **doccheck refuses:** a line that does not start with a date, a month that is not 01 to 12, a day that is not 01 to 31, an event with no title, an unknown colour, a detail with no event above it, no event at all, more events than the cap, an unknown attribute or a `dir` that is not `down` or `across`, and a part over the page's work budget. It warns on an event listed before an earlier one of the same kind of date.

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

#### Video

````
```video src="media/create.mp4" poster="media/create.jpg" title="Creating a project" duration=1:58
source: media/create.webm
captions: media/create.en.vtt "English" default
captions: media/create.es.vtt "Español"
thumbs: media/create.thumbs.vtt
chapter 0:00 Start
chapter 0:42 Answer the questions
```
````

- **Options:** `src` (mp4, m4v, webm, ogv, mov, or an `.m3u8` stream, which plays where the browser can), `poster`, `title`, `clip`, `loop`, `start`, `height=s|m|l`, `duration`, `speed`, `speeds`, `skip`, `volume`, `download`, `transcript`. Flags are bare words. **`autoplay` is refused.** **Body:** `source: <file>` (another format), `captions: <file.vtt> "Label" [default]`, `thumbs: <file.vtt>` (cues name an image, `sprite.jpg#xywh=x,y,w,h`), `transcript: <file.vtt|.srt>`, `chapter m:ss Title`, and transcript lines `m:ss Speaker: text`. `//` starts a comment.
- **Controls:** a big play button on the poster; a bar with the chapters as segments (hover or touch shows the chapter's title, the time and, with `thumbs:`, a still); time; volume; a speed menu; a captions menu; picture in picture; full screen. Captions are drawn by us from the VTT (`--video-cue-bg`, `--video-cue-ink`). Keys: Space or `k`, `j` and `l` 10 s, arrows 5 s, Up and Down volume, `f`, `c`, `i`, `m`, `,` and `.` a frame when paused, `0` to `9`. On a phone a double tap on the left or right third jumps 10 s; a mouse double click is full screen.
- **`clip`:** a short silent loop that plays muted while in view and stops off screen or under reduced motion (a screen recording that would be a GIF). It takes no sound options, captions, chapters, transcript or `autoplay`.
- **Addresses:** the file, its other sources, the poster, the captions, the thumbs and their images all go through the host's `urlPolicy` as `image` when the player is drawn. Nothing plays before Play (except a `clip`, muted, in view).
- **LLM view:** `Video: <title> (<duration>), <address>. Chapters: ... Captions: English, Español.` and the transcript if written (the transcript is the content, so a long one needs no `:::llm`). **Tokens:** `--video-bg`, `--video-played`, `--video-played-2`, `--video-chapter-gap`, `--video-radius`, `--video-cue-bg`, `--video-cue-ink`. **Slots:** `poster`, `big-play`, `captions`, `captions-menu`, `bar`, `chapter`, `time`, `speed`, `volume`, `pip`, `fullscreen`, `thumb`.
- **Caps:** `videoTranscriptLines` (2,000; 1,000 in UNTRUSTED_LIMITS), `videoChapters` (200; 100), `videoCaptionFiles` (12; 6) checked when the page is parsed; `videoVttCues` (5,000; 2,000), `videoVttBytes`, `videoThumbsBytes` and `videoTranscriptBytes` (each 1,000,000; 256,000) travel in the data and are checked in the browser when a captions, thumbs or transcript file loads. Response bytes are capped while reading.
- **doccheck refuses:** no `src`; a `src` that is not a video file; an address that is not allowed; a YouTube or Vimeo address (embeds that phone home are not in this version); `autoplay`; an unknown option; two `default` captions; a captions file that is not `.vtt` or has no label; a `thumbs:` that is not `.vtt`; a clip with sound options, captions, chapters or a transcript; a poster that is not an image; a chapter or transcript line out of order or past `duration=`; a line the part does not know; a video over its caps or over the page's work budget.

#### Wardley map

````
```wardley title="A tea shop"
anchor customer "Customer" visible=0.95 evolution=0.6
component kettle "Kettle" visible=0.45 evolution=0.4
component power "Power" visible=0.1 evolution=0.85
customer -> kettle
kettle -> power
@step Today the kettle is a product we buy.
highlight kettle
@step A smart kettle moves it further to the right.
evolve kettle 0.65 "smart kettle"
```
````

- **Axes:** evolution left to right (genesis, custom built, product, commodity), visibility top (seen by the user) to bottom. Positions are named keys: `visible=` 0 to 1, `evolution=` 0 to 1 or a stage word (`genesis`, `custom`, `product`, `commodity`: the middle of that stage). A bare pair like `[0.4, 0.6]` is refused.
- **Lines:** `anchor` and `component <id> "label" visible= evolution=` (an id is letters, digits, `-`, `_` and `.`), `a -> b` (a needs b), `evolve <id> <evolution> ["label"]`, `inertia <id>`, `pipeline <id> from= to=`, `note "text" visible= evolution=`, `group <id> "label": a, b`, `highlight <id>`.
- **Steps:** build up; `evolve` under a step moves the component along its dashed arrow, `highlight` rings one. **Static:** `static=` on the fence draws one step whole.
- **Look:** a small word placer keeps each label off the dots, the lines and the other labels. On a narrow stage the map scrolls sideways in its own box.
- **LLM view:** a table `component | evolution | visible` (`product (0.40)`), then the needs, moves, inertia, pipelines, groups and notes as lines, then the step captions.
- **Caps:** `wardleyComponents` (60; 40 in UNTRUSTED_LIMITS). The word placer looks at a bounded number of things for each label, and its cost is charged to the budget when the map is drawn.
- **doccheck refuses:** a bare pair, a value outside 0 to 1, a component with no `visible=` or no `evolution=`, an unknown key, an id with a character outside the set or written twice, a need, `inertia`, `highlight`, `pipeline`, `group` or `evolve` that names something that is not a component, a pipeline with no `from=` or `to=`, a note with no text or position, needs that go round in a circle, a line that is none of these, no component, more components than the cap, an unknown attribute, and a part over the page's work budget. It warns when `evolve` goes to the left.

<!-- parts:end -->

## 4. Steps are an attachment

- **One marker:** a line `@step <title>` inside a fenced part. The text up to the next `@step` belongs to that step.
- **Parts that take steps:** terminal, file tree, editor, code walk and animation. A chart has controls instead; doccheck refuses `@step` in a chart.
- **At least 2 steps, or none.** One `@step` is refused, except in an editor: its files as they are come first, so one edit already makes two states.
- **What may come before the first `@step`:** in an editor its files (and `@file` blocks), in an animation its setup lines. In a terminal or a file tree with `@step` lines, every line sits under a step; nothing comes before the first one.
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
- **Colour (0.7.0-rc.3): eight families told apart by everyone.** Each family has a border and lines (`--cN`), one fill for its boxes and its containers alike (`--cN-soft`; `--cN-plane` names the same colour) and words in its colour (`--cN-ink`; in dark a light tint of the family's own hue). The palettes are measured, light and dark apart: any two of the eight differ by at least 15 in their borders and 10 in their fills (OKLab distance x100), and by at least 8 and 4 with protanopia or deuteranopia simulated (Machado 2009). Every border is at least 3:1 on the stage, the surface and any other family's fill, so a box of one family inside a container of another stays easy to see; one measured exception in light: the yellow family's olive border (`--c3`) is at least 2.5:1 on the lilac, pink and green fills (`--c4-soft`, `--c7-soft`, `--c8-soft`), where its own yellow fill marks its edge too. The stage's own borders, of a plain box (`--scn-edge`), a plain container (`--scn-frame-edge`), a layer band (`--scn-band-edge`) and a tone (`--scn-acc-edge` and the rest), are at least 3:1 on what they sit on; every word at least 4.5:1. A composed stage's column dots are the family's colour in both themes (3:1), stronger in a lit column (`--cN-dot`, `--cN-dot-new`). The source still names no colour. **The neutral, `c0`**, is the plain look (a white card with the slate edge in light, a grey-slate fill in dark; words in ink): it is for things with no role, not a ninth hue, so it is outside the pair limits by design (no grey can be told apart from all eight hues: measured). A page may give one colour to several roles; one scene never draws two roles of one colour (doccheck refuses it, naming both).

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

### 6.13 The composed stage (format version 11)

````animation
title: Orders | one request, end to end
## Browsers
client b1..b4: laptop; phone; tablet; kiosk | sends GET /orders
... about 2,000 sessions
## Servers
server s0,s1: api 0; api 1 | answers in JSON
  + (a) worker a; (b) worker b
## Storage
store db: orders database | primary
## _ under Servers..Storage
ops cfg: config service | pushes routes
@step Ask: Each browser asks one server.
b1,b3 --> s0: GET
b2,b4 --> s1: GET
tag b1,b3: to api 0
@step Read: The servers read from the database.
s0,s1 -> db (store): SELECT
@step Config: The config service is off the data path.
clear
show cfg
cfg -> s1, db: polled
````

An ```` ```animation ```` is **composed** by default: a stage of lanes, cards, bands, panels and blocks, laid out once for every step, so a thing that stays never moves; a step only shows, hides and lights things. `layout=graph` on the fence (or another engine layout, `3d`, or an old kind word) sends a scene to the graph engine of section 6 instead. The source never holds a coordinate, a pixel size, a colour value or a time in milliseconds.

- **Roles (colours)** are declared once, in the front matter: `roles: { client: c1, store: { label: "the database", colour: c3 }, ops: {} }`. A role keeps its one colour on every scene of the page; several roles may share a colour across a page (a long page has more roles than colours), but one scene may not draw two roles of one colour; `c0` is the neutral; a role with no colour takes the lowest free one in the order of the list. Every card, phase, row and connector names a role.
- **Setup:** `title: Name | source note`; `## Lane` (lanes go left to right); `## Band under A..B` (a band under lanes A to B; `_` for no heading); `## Band above A..B` (the same band over them); a band of one card in one line: `role id under A..B: title`; a card `role ids: title | line | line` (ids `a`, `a,b`, or a range `p1..p6`; one title, or one per id split by `;`; a line `* words` is in the card's colour); badges `+ (a) words; (b) words` indented under it; `... words` (and more; on a phone, when lines cross the gap under the lane, one such line joins the heading's line where it fits and its own line stays as room for the lines; when lines between two stacked rows still fall back to the right edge, their gap grows over the upper row's caption and under the gap's heading row, 4 px at a time, at most 12 a gap and 24 a stage, where that sends the most of them through); `## Band across A..B` (a band whose cards run left to right in one row; `next row` starts the row under them); `align: top` (the cards of a row share one top and one foot); `flow: off` (no moving dot on this scene's connectors; on by default); `lines: straight` (a side arrow with nothing in its way is one straight line; on a phone a line into the next lane runs straight down even past that lane's heading, which is drawn over it; curved by default); `layout: row` under a lane's heading (its cards stand side by side across the lane's width, arrows between neighbours run along the row with their labels under it at each gap, a line from another lane runs straight across when clear, else over the row; `role id under A..B: title` there puts a card on its own line under row cards A to B, as wide as they are; on a phone the row wraps; nothing moves between steps).
- **What a card holds** (indented under it): a card line (a card **inside** it, one level; a connector to or from it starts or ends level with it: by a side, on its own edge, running on through the holder's padding; by the top or the foot, on the holder's edge above or below it; on a phone, by its own right edge, through the side channel; a line `ends: on this card` under the holder makes them end on the holder's edge, level with the inner card); `pill ids: words; words` (pills stacked at its foot; `pill role ids:` gives them a role); `tokens: a b c` (its words as chips, in order, wrapped); a line `(good) words` (a tone, or a role, in brackets: that line's words in its ink; an unknown one is refused); the panel lines' marks with their panel meanings (`. ` body size in plain ink, `> ` indented, repeatable, `~ ` small and muted, `= ` body size in the card's colour); a line `** words` (a headline, big and centred in the card's colour; the title size on a phone); `+ (a)` alone (a letter chip before the title, on its row, no row of its own); a line `badges: stacked` (its badges one per row, top to bottom, each the card's width; a connector end `id.a` leaves or reaches the card level with its badge (a); `badges: stacked plain`: the same rows, words only, no letter chip, the letters still naming the rows for ends); `keys: A; B` (a record whose values read `...` until filled; a line `spacing: roomy` under it spaces its rows 9 px wider). A title may end in a state word, `[+ on]`, `[- off]` or `[= idle]`.
- **Card step words** (from the step on, until changed): `text id: line | line` (new lines in the card's one reserved place), `state id: [+ on]` (or `off`), `tone ids bad` (`good`, `warn`, `accent`, or `off`), `dim ids` (a pill's id dims only that pill), `dashed ids` and `cross ids` (a large X over the card, in the struck look; `cross ids corner`: a big bold x in the card's top-right corner) (or `... off`), `move p1,p2 to card` (a pill goes to another card; both keep its place), `fill id A, B: value; value`. This step only: `light p1: note` (a lit pill with a note at its right end), `mark id word, word: tone remark` (tokens boxed in a tone, the remark under their row; a token is named by its words without a trailing comma, or by its place, `#3`; this step only, or with `keep mark` from this step until the next `keep mark` on that token, a one-step mark winning on its own step).
- **One kind per thing:** a card is a card in a lane, in a band and inside a card; pills and tokens are chips on every step. Each lane and band is one region that carries its own heading (`data-bar-label`).
- **Panels** shown in one step, in one region as tall as the tallest: `grid N` (items `role: title | line [+ kept]`, `[- why]` or `[= chip]`), `rows` (aligned cells split by ` | `, lines by `; `, `=> role: text` a chip, `! ` warning, `* ` accent; a cell `_` draws nothing, its column kept; a cell `- words` is a dropped cell; a row ending ` [chip]` draws each cell as a boxed chip, a dropped one dashed, a `=> role: words` one in that role's colours at the row's own height), `map label`, `list Title` (`list Title | roomy`: rows with thick spacing, filling a card), `chips N: title` (kept and struck words), `calc` (a formula box), `card role: title | line` (cards inside it, `in:` chips, a `right:` column; `; ` splits a line into display lines, as in a rows cell).
- **Step words:** `@step Title: caption`; `show ids` (shown and lit from this step; its place is reserved from the start); `light ids` (`p*` = every id that is `p` and digits); `hide ids` (those cards and their connectors go from this step; a later `show` brings them back; in a lane, runs of cards that are never on screen together share one place, as tall as the tallest; on a phone, stacked lanes never on screen together share one place too, each heading shown in its own steps); `hide ## Title` / `show ## Title` (a lane or band heading, by its title or its start, goes and comes back (from step 1: never drawn, its lane and band ranges kept); its place stays); `a, b -> c: label` (an end may be a pill id: the line leaves or reaches its card at that pill; or `id.a`, a card id, a dot and a badge letter: at that badge, and a letter the card lacks is refused; `a -> b (bad): words` draws the label as plain words in the tone, large (the title size), beside its own line (wide: centred in the free gap, clear of both end cards and the arrowhead; phone: beside the upright line); a connector written again while the same one still shows draws no second line, it only gives that line its words from this step) (`-->` dashed, `(role)` after the targets colours it, `a <- b` drawn from b; a tone after the words, `a -> b: words (bad)`, is refused with the form to write); `keep a -> b: words` keeps the words while the line stays (one label, drawn once; otherwise a data connector's words show in their own step only); `a -> b x2` (two connectors per pair); `cut a --> b` (a red cross on that connector from this step, or halfway between the two cards when no connector joins them; LLM view: `Cut: a to b.`); `clear` (earlier connectors go); `show all` (every connector of the scene in this step); `tag ids: text` (a chip on the card's top edge, from this step on); `say id: text` (under the card, this step; `say id (role): text` colours it; so does `tag ids (role): text`); `inside ids: text` (a chip in the card's bottom row, under each badge, this step); `key role: text; text` (key entries, in the first lane's free space when they fit, as one legend box (bar kind legend) holding an unstamped swatch and its words per entry; with the setup line `key at: top right` or `key at: bottom right`, a legend at that corner instead (bottom right: the lowest free place at the right in the stage's lower half, inside a lane, band, panel or row that has room there but never on a card, else under the stage), right-aligned rows, its place kept from the start; each entry is a small wordless swatch chip in the role's colour with its words beside it); `key role: text`; `note: Title | line`; `= formula | why` (an outcome band); `foot: text` (`foot (warn): text` in a tone or a role's colour).
- **A cell row** (a panel): `cells a: 32, +4 new` draws a row of 32 plain small cells, then 4 in the accent tone (`+N word`: a group in the accent tone, the word names it in the LLM view), with the row badge `a` (in role `a`'s colour when the page declares it); an optional indented `labels: 0..31 | 32-35 new` has one entry per group (`x..y` under the group's first and last cell, one word centred under it, `_` none); lines one under the other are one panel, rows aligned; a phone wraps the row and every cell keeps one place on every step; at most 64 cells and 8 groups a row.
- **Head blocks:** `track: role phase, phase | role phase` with `carry:`, `where:` and `form: chips` (one row of two-line chips, no arrows), then `at phase` in a step; `sheet:` (a worksheet: `labels: a, b` under the cells, `rows: tall` taller rows, groups of rows of values (`_` an empty cell), an outcome column `=> role id: title`; step words `mark` (this step) and `keep mark` (until replaced) a cell in a tone (words that are one amount, `+15`, are a pill under the cell holding it; words after ` | ` sit under the row), a `sum` partial lit in its own step, `dim` cells from a step (`off` undoes), `fill` an empty cell, `value` a result per row (`(bad struck)` after it), `sum` a group's partial card (parts `+ a; b` are chips in it; `-> chip` inside it, moving to the outcome column at the next step or at `pass`; a group's `"short name"` labels it there), `tile` a small card (a tone after its value), `strip` a strip of small cells with named ends, `total` (a named `total out wrong:` is a second result) and `aside` in the outcome column; a later thing in the same place replaces the earlier; the outcome column puts what arrives (sent chips and the asides of their arrival step) at its top, then the rest in source order; the step notes sit beside the outcome column, and on a phone right under the groups, before it); `time: 0..60 | unit` with `row role id "label": state 0..4; +state 4..9`, step words `at 31: text` and `span id 4..31: text` (every mark at its true place).
- **Wrappers, boxes inside boxes** (`nest:`, a head block): `nest: Heading | note`, then one indented line per wrapper, outside first, each inside the one above it: `role id: title | size | field; field; > trailer` (a size `_` is none; a field after `> ` sits at the box's end, under what it holds). Every box has its place from the first step, so a wrapper put round later or taken off moves nothing. Step words: `show id` (it comes in from this step; after an `unwrap` or a `hide`, it comes back), `light id` (lit) or `light id: field` (that field lit), `fields id: a; * lit; - struck` (its fields from this step on; the marks for this step only), `set id: old => new` (one field's value changed: the old value struck beside the new, lit one, for this step), `title id: words`, `unwrap id` (the wrapper comes off what it holds, which stays: dashed and its title struck in this step, gone after it) and `hide id` (gone from this step, with no mark). Fields are drawn in the mono face, so their widths are exact and they line up. LLM view: the wrappers outside in with their fields, then per step what is put round, taken off, changed (`TTL 64 becomes TTL 63`) and lit.
- **Type:** in this release the stage's type is fixed. The layout measures every word with fixed metrics: 13.5, 12.5, 12, 12.5, 11.5, 21, 12 and 11.5 px for titles, body, sub lines, lane names, chips, big numbers, code and small bold words, and on a phone 12.5, 11.5, 11 and 11 px for titles, body, sub lines and chips (never under 11 px). A page's front matter `theme:` takes only `fill-c0` to `fill-c8` and `sheet-outcome`; anything else is refused. A host stylesheet can still set `--stg-font`, `--stg-title-weight`, `--stg-fs-title`, `--stg-fs-body`, `--stg-fs-sub`, `--stg-fs-lane`, `--stg-fs-chip`, `--stg-fs-big`, `--stg-fs-mono`, `--stg-fs-small-b` and `--stg-phone-title`, `--stg-phone-body`, `--stg-phone-sub`, `--stg-phone-chip` with a rule on `.stg` itself (they are declared there, so a value on `:root` does not reach the stage), but the layout does not measure with them: a wider font or a larger size can make words overlap or leave their boxes. Type a page can set and the layout follows is planned for a later 0.7 release.
- **Role fills (theme tokens):** a page may set a role colour's fill on its stages in the front matter, light then dark: `theme: { fill-c1: "#EEF0FF #1E2340" }` (`fill-c0` to `fill-c8`, two `#RRGGBB` values, refused otherwise). Cards, groups, lanes and panels of that colour take it; borders and inks keep the palette's. Without it the palette's fill is used.
- **The stage** is as wide as the page's content (up to `--stg-max`, 1180 px), leaving the text column; connectors are drawn after layout from fanned ports, never through a card; a label stands at the target's top corner on the side the bundle comes in (above a target that is alone in its lane, centred over a vertical bundle) and shows in its connector's own step, the line stays; an "and more" line starts with an ellipsis and steps aside when a band under its lane comes in; a tag sits on its card's top edge at the right; a line of several pairs (`a, b -> c: label`) shows its label once per step and gap, as do several such lines with one label; a line of one pair keeps its own (two arrows into one card, each written with its label, show it twice). Under about 700 px the lanes and bands stack, connectors run in a channel at the side (a step's labels keep clear only of labels drawn in that step, so a later step reuses earlier places, and no label runs past the stage's edge), and words stay at 11 px or more (long titles wrap twice, then end in "…" with the whole text on hover). Struck words (a sheet value's `(bad struck)`, a struck list or chips item) are drawn in their own tone, not faded, with a straight line in the bad tone across the whole word at its drawn size, not an ink line-through; the look is the theme tokens `--stg-struck-fade` (1), `--stg-struck-line` (the bad tone) and `--stg-struck-w` (1.6 px). No camera, pan or zoom.
- **Seven plans.** The server lays each stage out at seven widths, 326, 341, 356, 380, 734, 990 and 1178 px (the drawing's width in 360, 375, 390 and 414 px phones, 768 and 1024 px tablets, and every window of 1212 px or more), and sends all seven plans; the page shows the widest plan that fits the stage's box. Where the box is one of those widths, the drawing the server sends is the drawing the reader keeps; after the page loads the browser lays each stage out once more, at its own width.
- **Buttons.** The player's Back, Next and Play buttons are at least 32 px tall, and on a phone (720 px wide or less) so are the numbered step buttons.
- **Print.** A printed stage is never drawn smaller than 0.97 of its size, so its smallest word (11 px) prints at 8 pt or more; a stage taller than the sheet breaks between its blocks, never through a drawing.
- **Over the budget, never blank.** Each compile and each plan (one width) runs on a stage budget of its own: 38,000,000 units of work and 24,000,000 of memory, four times the heaviest real plan. A stage over it is shown still: its title, a message that names the budget and the fix ("This scene needs more work than one stage may use (the stage layout budget, 38,000,000 units of work), so it is shown still, in words. Show fewer cards, lines or steps, or split it into two scenes."), and every step in words, in order. Every other stage on the page draws.
- **On a phone** (a stage under 480 px, or lanes too wide side by side) the stage takes its denser phone form: the same words, never one cut with "…" or broken inside a word (a long token breaks only after `-. / _:`), type at the phone sizes (title 12.5, body 11.5, sub 11, chip 11 px; never under 11), lanes one under another. A line every card of a lane shares (`shelf s1..s6: names | holds 40 books`) is said once under the lane's heading as **`each: holds 40 books`**; the wide stage keeps it in every card (a shared line without `each:` covers one card).
- **The player** is one row: the title and its note, Back, Next, Play, the count; the named steps as numbered buttons; one caption. Arrow keys step. **Static** (section 4.1) draws one step with no player.
- **A longer example:** `fixtures/stage/example-layers.dh.md`, one request packet from a laptop's browser through a switch, a home router (NAT) and two internet routers to a server, and the first packet of the answer back, in ten scenes and 67 steps: each layer's wrapper (`nest:`), each router's table, the frame rewritten at every hop while the IP packet keeps its addresses, and a still last scene (`static`) setting layer 2 against layer 3 hop by hop. Six roles, one per layer; every address is from the ranges kept for documentation.
- **LLM view:** the facts in order: the lanes and their cards, then per step what shows, each connector (`label: a to b`), tags, panels, notes and keys. It is content: it is not held to the 400-token `:::llm` rule; over 2,000 tokens doccheck warns (split the scene).
- **Caps:** 400 lines, 120 cards, 400 connectors, 64 ids in a range, 24 phases, 60 grid items, 40 rows, 12 sheet groups, 120 sheet rows of 24 values, 48 strip cells, 12 tiles, 400 sheet step words, 16 time rows, 8 wrappers a nest, 12 cards inside a card, 64 pills, 64 tokens and 24 keys a card; the layout charges the document's work budget.
- **Tokens** `--stg-bg`, `--stg-edge`, `--stg-radius`, `--stg-line-w`, `--stg-line-hot-w`, `--stg-dim`, `--stg-dash`, `--stg-fade`, `--stg-flow`, `--stg-max`; roles use `--cN`, `--cN-soft`, `--cN-plane`, `--cN-ink`. Slot: `stage`.
- **Drawn by** `site/src/stage.tsx` from `tools/stage.ts`; blocks are pluggable (`tools/stage-core.ts`: a block parses its lines, lays itself out in a box and lists its facts).

#### Composed time and counted units

Time uses the shared step words: `at 30: check` selects a numeric time, while `at build` selects a track phase. `keep at` and `keep span` retain a remark from its step; `dot` is setup or a one-step remark; `arrow` connects rows. The inset words are `zoom row`, `zoom ticks` and `zoom labels`, the continuous plot starts with `plot:`, and the state styles use `[dashed]`, `[lit]` and `[accent]`. Retired spellings are refused with their replacement, without silent aliases.

`ruler: none` hides its line and tick labels while retaining the axis caption and numeric geometry. `row labels: above` removes the side gutter; an explicitly empty quoted row label takes no heading space. `[after]` puts a state's words to the right of a thin bar (with cells, also use `[wide]`). `[below]` on a marker places its label under the rows and shares a line with another label when it fits. Name an axis (`time durations: 0..24 | seconds`) and write `show durations` in the first visible step to reveal the whole block with its space reserved.

A step panel `units Stored pieces | one square is one piece` takes indented rows such as `job 24: kept 18, leaving 6`. It draws the exact total in role-coloured squares, up to 40 per line. `leaving` uses a thick border; `gone` is faint. A later panel supplies later counts; `beside` places it with another panel. Counts, groups, roles, indentation and the shared expansion budget are validated before drawing.

An optional badge role separates the two colours: `job (server) 12: kept 9, leaving 3` uses job-coloured squares and a server-coloured badge. Both roles must be declared; each square-role/badge-role pair appears once. Badges use a soft fill and line border. Plain indented lines after all counted rows add text below the end note; prefix a line with `~ ` for smaller muted text. These lines stay inside the panel.

Short cell rows use a compact default pitch on both screen sizes. Wrapped words retain the height they need. Roomy worksheet row and group bounds follow the visible cells; labels paint separately inside the reserved stage. Ordinary timelines keep their full reserved frames. The ruler, cell positions and row positions stay fixed across steps.

On a phone, a number too wide for its tick header or cell is drawn in full, bottom to top, at the 11.5 px chip font. Numbers that fit stay level; words and desktop drawings stay level. Authored tick labels wrap or stack rather than disappear. Phone words wrap at spaces or -. / _: only; a cell word too wide for its cell sits intact in a packed caption shelf below the row. `row labels: beside` keeps short row headings to the left of the cells on phones; `row labels: above` retains full-width rows with headings above.
`ruler: below` puts the continuous ruler below its state rows, with tick labels under it and marker lines crossing down to it. In this form, state `[dot]` draws a 16 px role-coloured arrival dot with a fitting label beside it. A `[dot] [plain]` state is neutral filled grey; other dot rows use their role’s pale fill and coloured outline. The unit caption sits directly above the lanes, whose edges and vertical guides align with the ticks; `row labels: beside` right-aligns plain row headings to their left. Boxed `headers` keep their own form and cannot combine with `ruler: below`.

Marker labels on the stage are the authored words only; their line already marks the time. To show a value, include it in the words: `at 31: 31 s, build done`. A marker's words, a setup one or a one-step one, sit above the rows by their own line; markers shown in different steps share that row, and two shown in the same step at the same place stack.

`at 31 [caption]: words` and `keep at 31 [caption]: words` retain the marker line and add the words to the existing step caption, without a stage label or numeric prefix; setup markers apply to every step. Doccheck refuses `[caption]` with `[below]`.

`hush at [axis name] <value>` retires a setup or kept marker’s label from that step while its line and reserved space stay fixed. Identical axis spans repeated across steps share one stable path, identity and slot; their label sits beside the stroke on its line. Row arrows prefer available space to the right of the head within the revealed group, with a left fallback when needed. `hush span [axis name] <row> a..b` does the same for a kept span's words (its line or bar and its place stay), and one hush line may list several with commas: `hush at 40, span ms -25..37`.

`tag <row> a..b: words` puts a chip above that time row’s declared interval, with no marker path; it persists from its step like a card tag. A named time axis may prefix the row.

`span <row> a..b [bar]` draws a filled bar over that range in the row's role colour (a tone such as `[good]` or a role in brackets changes it), on its own line under the row; bars that show in the same step stack one per line; when none of the row's states lies in their time range they stack inside the row itself: when every one has a one-line chip and the chips never touch on one line, the chips take one line at the row's top and the bars are 5 px tall, 7 px apart under it (words that would touch another bar go under the stack); otherwise about 19 px apart, a chip on each bar's line. Words after a colon sit beside the bar, or under it when they do not fit. A `tag <row> a..b: R` on the same row and range in the same step is drawn as the chip at that bar's left end, centred on its start, on the bar's line, and stays from its step like any tag. Such a tag needs no declared state there when its span is written first. Example: `span lease 0..10 [bar]` then `tag lease 0..10: R`.

`axis: First lane..Last lane` (time setup) runs the axis and its cells under those lanes of the stage: 0 under the first lane's left edge, the end under the last lane's right edge; row labels stay at its left. A phone, where lanes stack, keeps the full-width axis. Example: `axis: Workers..Collector`.

A marker's `[beside]` flag puts its words at the top of the time rows, level with the first row, beside its line: left of it in the axis's right half, right of it in the left half, wrapped to that room. When row words, cells, chips or spans occupy that place on any step the words show, they go to a shelf of their own under the time block's caption, ending 6 px before the line, and the line runs up beside them (unless a lower shelf's words would cross it); the choice is made once for all steps. `[beside]` does not combine with `[below]` or `[caption]`. With `ruler: below`, `[below]` puts the words between the last row and the ruler, just beside the line, wrapped so that no other marker line crosses them, and the line runs only in that gap. On a phone without that ruler, when a `[below]` label would slide along the block's edge, or the labels would stack, each label instead ends at its own line, wrapped (its two halves either side of ` · `) back no further than the line of the `[below]` label before it, when that takes no more height. Example: `keep at 13.5 [bad] [beside]: the latest it closes`. A `[dot]` state's words that do not fit beside the dot on one line wrap beside it on up to two lines, left of any marker line shown with them, and the row grows to hold them; only longer words go under the row.

On a phone, a row of `[numbered]` cells, or of cells whose names are numbers, picks one way to show its numbers: level when each fits its cell; standing on end (bottom to top) only when the turned digits and a 3 px gap fit the cell; on end inside its own cell, on two or three heights 3 px apart, when the turned digits fit the cell (rc.2: each number stays matched to its own cell); level in two to four staggered rows when they fit that many cells, each with a leader in its cell's column from the row's nearer edge (sized with room for the browser's slightly wider digits, packed at the digits' height and 3 px); otherwise on end in two or three staggered rows. A number a marker line crosses gets a page-coloured backing, so the line passes behind it; staggered numbers are drawn after every cell of their row, on a backing in their cell's colour over the cell borders, and kept inside the row's last cell edge (a number held in pushes the ones before it on its staggered line left, 3 px apart). A `[wide]` cell whose number cannot keep 2 px each side on a phone shows it in the caption under the row. Every cell keeps its number drawn; only cells under about 4 px, where nothing fits, show fewer numbers (every few cells, keeping the first of each range). Numbers are never under 11 px and never closer than 3 px; a single digit never stands on end.

`band role id "Title": first..last` (time setup) draws a titled region tinted in the role's colour behind the rows first to last, across the whole block width; on a desktop its title sits in a left gutter beside the region, level with its first row, and on a phone on its own line above the first row. Up to 8 bands; they never overlap. Example: `band job b0 "Node 0": r0..a0`. Ending the line with `| compact` packs the band's rows as one tight group: its title splits at ` · ` into a name (in the role's ink) and a muted sub line, the rows inside draw no labels of their own, and they stand 2 px apart: `band job b0 "desk 0 · writer": r0..a0 | compact`. A time block's caption may sit beside the block instead of above it: `time: 0..60 | seconds | beside` puts it on the tick-number line, in the gutter left of the axis, when it fits there (a phone, a ruler below, no ruler or a window keep it above).

In a step, `dot <row> <interval start or a..b> [tone]` recolours existing dots for that step; `(role)` may replace the tone, exactly one colour is required, `keep dot` persists and `off <row>` restores declared paint. A range selects declared interval starts inclusively; geometry and filled/hollow state stay unchanged.

`fill <row>` makes a time row’s dots solid in its step only; `keep fill <row>` persists; an optional increasing `a..b` selects only dot midpoints inside that axis interval; `off <row>` clears all fills and restores their declared paint; a row without dots is refused. Dot centres and sizes never change with fill.

`row job r "Owner" [chip]: states` draws only that row label as a content-width role chip (chip kind and its own stable ID); the row retains its worksheet-row identity and arrow endpoints, without a duplicate explicit label. On a phone the chip has a clear band above its cells; wordless cells compensate for the gap.

Phone time-cell caption keys name their actual tick values (for example, 869–871), rather than column ordinals; staggered cell words reserve glyph clearance between neighbours, and each has a leader in its cell's ink from its own cell's bottom edge down to the word, passing behind the other words' backings. Numeric phone header cells stand on end inside their own column when the turned digits fit it (on two heights when one would leave them under 3 px apart); a header caption wider than its cell gets a leader in its column from the header band's nearer edge.

Time arrows use the source row’s role colour; an arrow from above uses its target row’s role. `[bad]` cells keep a corner cross while they show; the thick border and halo last their first step only (a light lasts one step); `[lit]` gives the halo in its first step only. Phone row cards retain all subtitle lines. A leading pipe inside the quoted row label, as in `row server archive "| Archive"`, draws a role-coloured label box without a badge. Cell words use regular shared sub text (11 px on phones, 12 px on desktop); active cells retain the role’s soft fill and coloured ink.

An inset may end with `@N` or `@N..M`, after its placement: `zoom: 38..42 | detail | below @1..2`. The inset, its rows, ticks and overview highlight share that visibility, while their layout space stays reserved. Plot point names sit beside their dots with collision avoidance; crowded labels have a short guide to their point. Remarks shown in different steps share the same bracket slot directly below the measured bar.

In roomy cell grids, each ruler tick and label appears with its column's first visible cell; the painted ruler reaches only the revealed columns. The full numeric axis stays fixed. Row and group bounds follow those cells without painted frames; arrow labels use the currently revealed columns when choosing space beside their arrows, without widening the bounds. Axis spans carry the time-bar measurement kind. Cell and arrow words wrap fully. Standalone journey tracks retain all adjacent directional links, including wrapped-row links; a track accompanying a numeric time axis uses decorative separators.

`cells: 1 | headers` keeps ordinary cells and draws boxed tick labels at column centres, with one band per selected column and no painted ruler line. For a 0..7 axis, use ticks at 0.5..6.5; named labels wrap inside their column boxes; on a phone, a word wider than its column sits intact in a shared caption shelf. Without explicit ticks, each column gets its interval-start number, including a short final interval.

A composed animation can contain a continuous time axis. Existing words stay the same: `time: 0..60 | seconds`, `row job build "build": queued 0..4; +running 4..31; done 31..60`, and the step words `at 31: ready` and `span build 4..31: 27 s`. A leading plus gives a state its row role colour. State ranges are ordered and do not overlap; gaps are allowed. Optional `cells: 1` draws each interval of one axis unit as its own counted cell, keeping state boundaries and true ruler positions. The interval is positive, is no larger than the domain, and is declared once; huge grids spend the document budget before allocation.

`ticks: 0, 20, 40, 60` chooses numeric ruler marks; otherwise ticks are automatic. A tick may have its own label: `ticks: 0 start, 30 middle, 60 end`. `at 31: ready` keeps a marker on the axis in every step. `zoom: 24..36 | Close-up` draws that smaller stretch beside the full ruler, or below it on a narrow page. It enlarges data; it does not move the stage. Append ` | below` to stack it on every screen. The inset may extend beyond the overview domain; `zoom row job receipt "Receipt": +writing 39..41` after `zoom: 38..42` creates a row only in the inset, with a caption above it. With inset-only rows the overview window, dots, markers and value plot are not repeated in the inset. `zoom ticks: 40 check` can select just one inset tick. `zoom labels: 38 before, 39 near, 41 after, 42 end` adds inset text at those values without tick lines or edge hooks; it appears only in the inset and shares its visibility. `plot: 0..100 | percent complete` adds a continuous value axis. Each `point job halfway at 30: 50 | Halfway` names its role, unique id, time, value and optional label. Points in each role increase in time and join with straight lines. All time and value positions are linear. Marker labels reserve separate lines, and the geometry stays fixed across steps. Words stay at least 11 px. Static and print retain the axes and the selected step. `keep at 31 [bad]: ready` and `keep span build 4..31 [warn]: held` persist from their step, and coexist with a phase track using `at`. Colours are optional: `[accent]`, `[good]`, `[bad]`, `[warn]` or `(role)`. State suffixes `@2` and `@2..3` reveal a range from a step or for bounded steps; a later state with exactly the same range replaces the earlier word. Styles are `[plain]`, `[dashed]` (dashed, with its word), `[good]`, `[warn]`, `[bad]` (corner cross), `[accent]`, `[wide]` (one spanning cell), and `[lit]` (thick). An underscore is an empty cell. `[dot]` draws a small round datum instead of a tall bar. `cells: 1 | roomy` gives discrete columns more space and regular sub text. A row label such as `"(a) Draft | writes"` becomes a coloured card with a badge and a second line. Phone grids keep one ruler and move compact row labels above it; cell words use the shared phone sizes (at least 11 px), and roomy row cards keep their badge, title and subtitle lines. A phone wraps only at spaces or -. / _:; a word wider than its cell sits intact below the row. `arrow copy -> draft at 1.5: saved copy` draws an arrow between those rows at that true time in its step only; `above` can be its source. Optional `[dashed]` after its numeric time makes a dashed arrow with one target head. Persistent time markers have their labels above the ruler. Time marker modifier `[tick]` draws a short tick below the rows while leaving the ruler in place; `[below]` places its words under that tick, and other markers keep their full height. `keep span axis 0..20 [line] [warn]: first half` draws a plain line under the ruler; any row id may replace `axis`. `dot 5` and `dot 25 [good]: saved` put dots on the ruler itself; setup `dot 5, 10, 15` draws an unlabelled list, with an optional shared colour at the end; `dot 30: newest` shows one in its step only. `window: 0..40 | observation` frames a range with a dashed box; `height: 4 lines` right after it keeps that frame at least four text lines tall (N from 1 to 12, the room added under the ruler). A tick label may show from a later step: `ticks: 0 start, 7 new shelf, empty @3` (its tick and place stay from step 1; quote a label that holds a comma); a label takes one tone as markers do: `3 "alarm" [bad]`. On a phone an `apart` cell's word that does not fit level stands on end in its cell, and a row span's caption stays centred under its own bracket. A tick label may show from a later step: `ticks: 0 start, 7 new shelf, empty @3` (its tick and place stay from step 1; quote a label that holds a comma). `cells: 1 | apart` draws separate rounded cells with a gap, no ruler line, and each tick's label centred above the cell that starts at it; a `[wide]` cell there is one rounded box like the others. `zoom: -3..1 | the last 3 minutes | bracket` draws the inset's words over a bracket spanning the inset.

`units 64: kept 16, added 8, removed 4` draws exactly 64 counted squares: 16 kept, 8 added, 4 removed and 36 remaining. Counts are nonnegative whole numbers; their sum cannot exceed the positive whole total. Each group appears once. The whole document budget meters the grid before allocation. In a panel on a phone, each row's squares stay at least 9 px (2 px apart, rows 3 px apart) and wrap onto even rows rather than shrinking. A marker may be `[solid]` instead of dashed, and `[plain]` uses the normal ink. `[guide]` makes it a reference guide rather than a connector. Observation windows automatically give the ruler and inset tick stubs explicit plain line hooks. Integer tick labels retain every digit without scientific notation. Named axes use `time ticks: 40..48 | ticks`; prefix numeric operations, as in `keep at ticks 43: point`. Row operations select the unique owning row, or accept an explicit axis name before the row. Reused row ids require that name. `[numbered]` on a state prints each cell interval start in place of its word. Each axis has distinct measurement ids. Time rows are worksheet rows, state cells and dots are chips, and groups of rows are lanes.

```animation
time: 0..60 | seconds
row job build "build": queued 0..4; +running 4..31; done 31..60
at 31: ready
zoom: 24..36 | Close-up
plot: 0..100 | percent complete
point job begin at 0: 0 | Begin
point job end at 60: 100 | Complete
units 64: kept 16, added 8, removed 4
```

#### Bins (a composed stage block)

An inventory of things dropped into named bins, step by step. Head lines in the setup of an `animation`:

```
bins: Returned books | books                       the heading, then the word for one thing
items b1..b9: Atlas; Birds; Cooking; ...           named things (one label for all, or one per id split by ";")
items 60: packet                                    or a count: 60 unnamed things, drawn as small squares
bin job s "Science": shelves 500 to 599 | line 2    role, id, "Label": the rule, then smaller lines
```

Also: `show c` in step 3 (bin c appears there, its place reserved from the start), `light c: words` (a bin lit, with a note in it); `ledger: Item | Bin` or `Bin from 0` (every thing with the number of its bin per step; a move reads `1 → 3`); `inventory: off`. A thing dropped again moves to the new bin (its old slot stays dashed); a long label wraps, never cut.

In a step: `into s: b2, b4..b6` drops those things into bin `s`; `into s: 12` drops the next 12 left in the inventory. The block works out each bin's count, the leftover and a running total itself and draws them; nothing is written twice. Each thing has one place in the inventory and one reserved slot in its bin (nothing moves between steps); a bin is coloured by its role; a narrow screen stacks the bins. LLM view: the setup line, then per step "Into Science: Birds, Dunes (2 in it now)." and "Total: 2 of 9 in bins, 7 left."

Caps: 200 things, 8 bins; the block charges the document's work budget (one charge per line and one for the layout).

#### Composed columns and bars

Two head blocks for counted and measured data inside a composed scene. Both keep every place for the whole scene: a step changes counts, heights and lights, never the frame.

**`columns N [role]: caption | unit`** is a dot histogram: N columns (1 to 64), one small mark per counted thing, stacked from the bottom, coloured by the role. Under it, `every K` labels every K-th column (default: as often as the labels fit) `labels: a, b,...` names the columns (default 0, 1, 2,...), and `leaving: darker` draws a mark darker until a later step takes it away. Step words: `counts M: n, n,...` sets the first M columns' counts (the number is optional and checked against the list; kept until the next `counts`; at most 500 places a column); a count may name the places its marks left, `19 [1 11 18]`, which stay empty, so a mark that stays never moves; `light a..b` or `light a, b` lights those columns as new in this step (a thick frame, marks in the warning tone). A column shows from the first step that counts it. A phone splits the columns into rows of at most 16.

**`bars N [role]: axis title | unit`** is a small bar chart on one value axis: N bars (1 to 64). Under it, `axis a, b, c` (labelled grid values from 0 up), `line name: v` (a solid reference line, at most 8), `every K`, `labels:...`, and `tabs Name: 1..3; Name: 4` (tabs over the chart, one lit per step). `values: v v v` in the setup draws a still chart. Step words: `values: v v v` (one per bar, kept until the next), `peak: words` (a dotted line at the step's highest bar, which is lit bad), `limit v: words` (a dashed line from this step on; bars over it are lit in its step), `heading: line | line` and `big: value | words` (the heading and the big number, kept until replaced), `light i: words` (one bar lit, a chip over it), and `move k from a to b;...` (dashed arrows from a's top to b's; b's growth since the last values is drawn as k stacked blocks). Move clearances paint behind the bars. With a limit in force, automatic over-the-limit warnings apply only above it; a peak (`peak:`) keeps its highlight whatever the limit, and explicit author tones still win.

Every column centre, bar top, grid value and line sits at its true place on a linear axis; the drawing carries `data-bar-axis`, `data-bar-value` and `data-bar-kind` for independent checks. Words stay at 11 px or more.

```animation
title: A café | cups sold, by day
bars 7: day of the week · bar = cups ÷ the weekly average | ×
  axis 0, 0.5, 1, 1.5
  line average: 1
  labels: Mon, Tue, Wed, Thu, Fri, Sat, Sun
@step Busy Friday: Friday sells 1.4 times the average day.
values: 0.7 0.8 0.9 1.0 1.4 1.3 0.9
peak: busiest 1.4×
@step A cap: Two days are over the cap.
limit 1.2: cap 1.2×
@step Move orders: Friday and Saturday hand pre-orders to Monday and Tuesday.
values: 0.9 0.9 0.9 1.0 1.2 1.2 0.9
move 2 from Fri to Mon; 1 from Sat to Tue
```

#### The swimlane matrix (`matrix:` in a composed stage)

Lanes (rows) crossed with columns into cells; each cell holds cards, chips and an "and more" line. It is a head block of the composed stage: written in the setup, laid out once, and a step only lights and shows.

````
matrix: Who holds the photo | five parts, four stages     (optional caption | note at the right)
column sb: Submit | the request                             (a column: id, title, optional note; at most 8)
column qu: Queue
client c: Browser | the person                            (a lane: role id: title | note; at most 16)
  sb: [u1] Upload | 4 MB, one file; + queued               (a cell: band id, then items split by ";")
  qu: [q1] Waiting job | first in, first out; ... about 30 more
@step Send: The browser sends the file.
light c.sb: the request leaves                             (light a cell; the words sit under its contents)
show  u3                                                  (a card appears; its place was reserved from the start)
light u1                                                   (a card takes the focus in this step)
````

- **Items:** a card `[id role] title | line | line` (the bracket is optional and holds an id and, if wanted, another role; with no bracket the lane's role colours it); a chip `+ words`; the "and more" `... words`. At most 12 items in a cell, 120 in a matrix, 6 second lines in a card.
- **Step words:** `light lane.column[,...][: words]` lights those cells (`lane.*` a row, `*.column` a column, `lane` the same as `lane.*`); words go with one cell only. `show a, b..c, p*` makes cards appear from this step on; `light a` with a card's id (no words) takes the focus in this step only. The older words `cell`, `enter` and `spot` are refused with the new word named.
- **Nothing moves:** every cell and every card has its place for the whole scene (a card that enters later has its room reserved); a lit cell reserves the room for its words.
- **Wide and narrow:** wide, the bands are columns with one head row and the lanes are rows, with shared columns aligned. Narrow (a phone, or when a column would be too thin for its words), each lane becomes a block and each non-empty cell sits under its band's label. No word is under 11 px.
- **Colour** is by role only (the page's `roles:`); the source holds no pixel, colour or time.
- **LLM view:** the columns, then one line per lane with each band's items (items that enter later are not there yet), then per step: the lit cells with their words, the cards that came in, the cards in focus.
- **Caps:** 8 bands, 16 lanes, 12 items a cell, 120 items; reading and layout charge the document's work budget.


### 6.14 Still scenes and a calm story (format version 11, graph engine)

**A still scene** is an `animation` with no `@step`: its setup, drawn once. It has the stage and the design system, and no player, no toolbar, no camera, no pan and no zoom. A thing's note still opens by a tap: that is reading, not a control. The word `zoom` on the fence (`animation zoom`) gives it pan and zoom, and `3d` the 3D stage with its controls. A colour key stays. It shows whole: when it is too wide it runs top to bottom; when it is still too wide for its words at the least size (11 px), it keeps that size and scrolls sideways in its own box, with a fade on the side that has more and a "Swipe to see all of it" line (as a wide table does). A tall one is as tall as it is (the page scrolls); a short one is as short as its drawing and its margin. Its LLM view is its setup lines. One `@step` is refused (a story needs two or more); a still scene with nothing to draw is refused.

**The reader's camera comes only when asked.** An animation with steps shows the 3D button, zoom in and out, show everything, drag and wheel to move, and the line that tells how, only when its fence says `zoom` or `3d`. Without them its own camera still follows the story, the steps keep their player and keys, and a note still opens by a tap.

**A calm story.** On every scene:
- A thing that takes no part in a step keeps its place to the pixel. Items of an array, list, queue or bucket travel on an arc only when they pass another item of their row (a queue that moves up when one leaves goes straight; two that trade places arc), on the step's own beat.
- A step's first frame is its start: a step never runs back first, and a step with beats never flashes its end.
- **One held view from one camera word to the next** (`zoom`, `camera`, `focus`, `enter`, a split): the steps in between share one view of everything they touch, so the camera moves only at a zoom in or out. Only where that view would draw words under the least size does it give way: it holds for as many steps as fit, then moves once. A zoomed step says so under its caption ("Zoomed in: router"). On a phone the stage grows a little (at most 680 px, and at most 82% of the window) where that, and only that, keeps the camera still between two zooms.
- In 3D a thing that moves to another parent or floor rises along its way, with no hop; inside a zoom a thing outside what is zoomed into, and not touched in the held span, leaves the stage (nothing stands half cut at the stage's edge), and so does the layer plane.
- **One focus at a time:** at rest only the tokens a step is about keep their words (the tokens its last line names, a split's pieces, else the tokens that take part); every other token keeps its pill. One token or none on the stage changes nothing.
- A story whose view cuts the scene says so in words at that edge ("more beyond the edge"), as well as the shaded edge.
- **Words are cut whole or not at all:** an arrow's label belongs to the scene's bounds, and a view that cuts an arrow's label, a send's label or speech counts it as cut, as it counts a thing's words.

**Static** (SPEC 4.1) on the graph engine: `static`, `static=<n or title>` on the fence, or the page's or host's static, draws one step whole and flat, with no player, camera, hint or motion, a closed thing's inside in full, the step's caption and every caption in a closed list (open in print). Print and reduced motion switch it on. Its root carries `data-dh-static`.

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

## 8a. References: a part the host keeps (format version 11)

**Answer first.** `[[<type>:<name> "label"]]` stands for a part the host keeps. Every special part may be written as a reference. `interactive` and `svg` may only be references, so their HTML, CSS, script or raw SVG never sits in the page. The page holds the reference and its label; the host answers for it. The file stays Markdown: on any viewer the reference reads as its text.

| Written | It is | With no resolver |
| --- | --- | --- |
| on a paragraph of its own | a block | the label, as a chip |
| in a sentence, a heading, a list item, a table cell or link text | a chip | the label, as a chip |
| in a code span or a code block | plain text | plain text |

```md
The month's numbers:

[[chart:revenue-2026 "Revenue by month, 2026"]]

The build log is in [[terminal:build-42 "the build"]], and the label is optional: [[filetree:repo-layout]].
```

- **Type:** the name of a fenced part (`terminal`, `filetree`, `editor`, `codewalk`, `chart`, `animation`, `tierlist`, `alignment`, every part added later, and a host block's name), or `interactive` or `svg`. Containers (`:::tabs` and the others) are not referenced. A word that is not a type (`[[note:this]]`) is plain text.
- **Name:** letters, digits, `.`, `-` and `_`, at most 128 characters. Never a path (`/`, `\`, a leading `.`, `..`), a scheme (`x:`) or a URL (`//`, `www.`). The host finds the part by its name; the package never fetches anything.
- **Label:** optional, in double quotes, on the same line, at most 200 characters. A reader sees it until the part is there; an LLM reads it.
- **Escape:** `\[[` is plain text.
- **A page with a reference** is a `.dh.md` page (doccheck counts it as a part).

**Resolving.** The host passes `resolveReference({ type, name })` to `parse()`. It answers one of three:

| Answer | A block is drawn as | A chip is drawn as |
| --- | --- | --- |
| `{ state: "pending" }` | a card that says Loading | the chip, dashed, Loading |
| `{ state: "ready", part }` | the part, read as if written there | the chip |
| `{ state: "failed", reason }` | a card that says Not available, and the reason | the chip, Not available |

- **`part`** is the part's source: as it would be written inline (its fence included), or only what goes inside the fence. For `svg` it is the SVG text; for `interactive`, its sections (below).
- **A ready part is read with the page's caps and budgets**, by the same part reader as a part written inline, on the reference's line, and it renders through the same part dispatch. An answer of another type, or of more than one part, fails with the reason.
- **A chip asks for its state only;** it never draws the part.
- **The resolver never fetches inside `parse()`.** To fill a reference later (another process, a helper agent), answer pending, then parse again when the part is ready. A server can resolve before it sends the page (pre-render). No answer (`null`) leaves the reference unresolved (its label as a chip); an answer that is none of the three, or a resolver that throws, is a failure with a reason.
- **A reference inside a part that a reference resolved to is refused.**

**LLM view.** The reference as written, `[[chart:revenue-2026 "Revenue by month, 2026"]]`, resolved or not. Nothing of the part.

**Caps.** In both `LIMITS` and `UNTRUSTED_LIMITS`; a host may change them.

| Cap | What it counts | LIMITS | UNTRUSTED_LIMITS |
| --- | --- | --- | --- |
| `maxReferences` | references on one page (the rest show as their labels) | 500 | 100 |
| `maxReferenceBytes` | UTF-8 bytes of all the parts a page's references resolve to | 1,000,000 | 400,000 |
| `maxSvgBytes` | one SVG | 200,000 | 100,000 |
| `maxInteractiveBytes` | one interactive part | 204,800 | 204,800 |

Every reference charges one step to one part budget of the page, "the reference reader". The Markdown reader looks at each `[[` once and reads forward no further than the line, the next `[[` or a fixed window: the work is linear in the page.

### 8a.1 svg

Raw SVG the host keeps, drawn only through an `<img>` with a `data:` address: no script in it runs, and nothing it names is fetched. The image's text alternative is the label. Refused: a text that does not start with `<svg` (after an `<?xml ?>` line and comments), a DOCTYPE or an ENTITY, more than `maxSvgBytes`. A host's CSP needs `img-src data:` to show it.

### 8a.2 interactive

A small component the host keeps, in sections: `@html`, `@css`, `@script` and an optional `@fallback` (Markdown shown when it does not run; without one, the label).

```text
@html
<label>Growth <input id="g" type="range" min="0" max="50" value="20"></label> <output id="o"></output>
@css
output { font-weight: 600; }
@script
const g = document.getElementById("g"), o = document.getElementById("o");
g.addEventListener("input", () => { o.textContent = g.value + "%"; });
@fallback
Revenue grows 20% a year: year 5 is about 2.07 times year 1.
```

- **Off unless the host turns it on.** Off (the default) shows the still and a chip, "Interactive part: off on this site". `interactive="static"` draws the HTML and CSS with no script; `interactive="on"` runs it. Both need `InteractivePart` from `durian-hypermedia/react/interactive`.
- **Isolated.** An `<iframe sandbox="allow-scripts">` with no `allow-same-origin`: an empty origin of its own, so no cookies, no storage and no reach into the page; no forms, pop-ups or top navigation. Its page has the policy `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'`, so nothing is fetched. It gets the theme tokens as CSS variables, and new values when the theme changes.
- **One message.** The page accepts only the frame's height, a number, from that frame. With `interactive="on"` the frame must say it within 5 seconds; it is stopped after 10 minutes; a frame that loads a second page (it tried to leave) is stopped. A stopped frame is removed and the still comes back.
- **The host sets `frame-src 'none'`.** A sandbox cannot stop a frame from navigating itself; the host page's `frame-src 'none'` refuses every navigation before a request (the srcdoc frame still loads). Without it, one request can leave before the frame is stopped.
- **Trusted Types.** Only `durian-hypermedia/react/interactive` makes a policy, named `dh-interactive`. A page that requires Trusted Types lists that name to run the part; otherwise the still stays.
- **The host page's CSP holds in the frame too** (a srcdoc frame keeps its page's policy). On a page whose CSP has no `'unsafe-inline'` for scripts, the frame's script does not run and the part stops at its 5 second check.
- **What it is for:** a picture the reader changes (bars, a curve, a grid, with sliders, toggles, a select). Never a stepper, a slideshow or a quiz: a sequence is prose or steps.

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
| references (format version 11) | a bad name (empty, over 128 characters, a path, a scheme, a URL, any other character); a label with no closing quote or over 200 characters; anything but a label after the name; more references than `maxReferences` (one problem; the rest show as their labels); a reference inside a part a reference resolved to; a fenced ```` ```svg ```` or ```` ```interactive ```` (write the reference instead); a resolved part over the caps, of another type or more than one part; an SVG that is not SVG, holds a DOCTYPE or ENTITY, or is over `maxSvgBytes`; an interactive part over 200 KB, with an unknown section, with no @html and no @script, an inline `on...=` handler, a `<script>` in @html, `<form`, `<iframe`, `<object`, `<embed`, `<link`, `<base` or `<meta`, a URL with a scheme or `//`, `@import`, `fetch(`, XMLHttpRequest, WebSocket, EventSource, `import(`, storage, `document.cookie`, `window.open`, `top.`, `parent.`, `location`, `navigator.sendBeacon`, `eval(`, `new Function`, `Worker(` or RTCPeerConnection. Each message names the fix |
| bins (format version 11) | a bin line that is not `bin role id "Label": rule`; a bin or thing declared twice; an unknown role; an id that is not letters, digits, `-`, `_`, `.`; `items` with a wrong number of labels; over 200 things or 8 bins; `into` with no bins or things declared, an unknown bin or thing (it lists them), a thing dropped twice, a count larger than what is left; a spent work budget |
| composed time and units (format version 11) | nonfinite or reversed axes; state ranges outside the axis or overlapping; unknown roles, repeated row or point ids; over 16 time rows; unordered or repeated ticks; a zoom outside the full axis or not smaller; a point before values, outside either axis or out of time order; an invalid marker or span; repeated axis settings; negative, fractional or repeated unit counts, counts above the total; a tick label's `@N` outside the scene's steps; a cells mode other than `roomy`, `headers` or `apart`; a `| bracket` zoom without words; a spent whole document budget |
| time axis under lanes, bars and bands | `axis:` naming a lane that does not exist, the lanes right to left, or written twice; `band` without `role id "Title": first..last`, an empty title, a row that is not in the block, rows bottom to top, overlapping bands, more than 8, a repeated id; `[bar]` on `axis` or with `[line]`; a `tag` whose range neither the row's states nor a span written before it in that step cover; `[beside]` with `[below]` or `[caption]`; `hush span` naming no kept span with words at that exact range, or a row not in the block |
| composed stage (format version 11) | a coordinate, pixel size, colour value or millisecond option in the source; a role the page does not declare (it lists those it does), two roles on one colour in one scene (a page may give one colour to several roles), an unknown colour; an unknown card, lane, phase, sheet row or column, time row (each lists the known ones); a sheet cell outside its row or strip, a tone that is not good, bad, warn or accent, a fill or value whose count does not match its rows, a `pass` with no partial chip; a line that does not read (it lists the words), a graph scene with no `layout=graph` (it says so); titles that do not match ids, an id twice, a range that is not one; a card inside a card inside a card, cards or pills under a line of many ids, an unknown pill, token or key (each lists the known ones), an unknown tone, a state that is not `[+ x]`, `[- x]`, `[= x]` or `off`, `light` mixing pills and cards, an `align:` other than `top`, a `layout:` other than `row` or one not under a lane's heading, a `flow:` other than `off`, a `lines:` other than `straight`, a row's `under` that does not name two of its cards left to right; one step; the caps of section 6.13. Warns: a scene over 2,000 tokens in the LLM view |
| matrix (format version 11) | no columns or no lanes; a column or lane declared twice, with a bad id, no title, over 8 columns or 16 lanes; a lane with no cells; a cell for a column that is not declared (it lists them), the same band twice in a lane, an empty cell, over 12 items in a cell or 120 in a matrix; an item with an unclosed or empty bracket, a bad id, an id used twice, an undeclared role, a chip with a second line, over 6 second lines, a `...` with no words; `cell` naming an unknown lane or band (it lists them), nothing, or words on more than one cell; `enter` and `spot` naming a card that does not exist (it lists them) or none; a second matrix in a scene; a pixel size or a colour value in a cell |
| composed columns and bars (format version 11) | an empty place outside its column or named twice; a count of columns or bars outside 1 to 64, an unknown role; `every` outside 1 to N; labels that are not one per column or bar, or repeat; a repeated `every`, `labels`, `axis`, `tabs`; an axis that does not increase from 0; a reference line that is not `name: value`, over 8 lines; a tab that is not `Name: a..b`, over 6 tabs; counts that are not whole numbers, more counts than columns, a count over 500, a stated number that does not match the list; values that are not one number from 0 up per bar; `counts`, `values` or `limit` twice in a step; `light` naming no column, bar or card; a move that is not `move k from a to b` between two different bars, with k from 1 to 40, over 16 moves a step; a spent document budget |
| lines cross (format version 10) | warns, does not refuse: two lines of an animation cross in a step because no way around them is free; it names the step, the two lines and the fix (put the things a line joins next to each other, in the order of where their lines come from, or show fewer lines at once) |

## 10. Translations

A translation keeps every part, attribute, code reference and code block of its source, in order; doccheck's "translation shape" compares them. Translated: prose, headings, list items, table cells, callout text, front matter `title`, `description` and the `label` and `means` of own marks and prefixes, `:::llm` texts, terminal and file tree step titles, code walk notes, chart `title`/`label`/`name` (a second axis's `label` too; the category names in `x` stay as they are), a tier list's title, tier names, item names and notes, an alignment grid's title, axis names, cell and region labels, item names and notes (translate a tier or axis name the same way everywhere it is written, on the `tiers:` line and in the tier lines, on the axis lines, the `region:` lines and the cell lines; never the colours in square brackets, the keys `tiers:`, `x:`, `y:`, `region:`, `arrows:` or the `@ x, y` numbers), and an animation's captions, its quoted labels and its say and note texts (never its ids, entity kinds or change words). No native speaker has read the five translations yet.

## What changed from version 10

### The composed stage (section 6.13)

- An `animation` is a composed stage unless its fence asks for the graph engine (`layout=graph` or another engine layout, `3d`, a kind) or its setup reads like a graph: lanes, cards, bands, panels, a phase track, a worksheet, a time block, bins, columns and bars and a swimlane matrix, laid out once for every step; nothing moves between steps. Every animation that was drawn before is still drawn by the graph engine.
- Colours by role, declared once in the front matter (`roles:`); several roles may share a colour across a page, never in one scene; `theme: { fill-cN: ... }` sets a colour's fill.
- The stage leaves the text column (up to 1180 px); a phone stacks lanes and never shows words under 11 px.
- doccheck: a composed scene is exempt from the 400-token rule and warns over 2,000; its refusals are in section 9.
- The JSON: a composed stage's block carries `stage: { src, roles }` beside `anim` (additive).

#### Its newest words

Each entry: the spelling, what it does, what doccheck refuses. Nothing here moves a stage that does not use it, except the phone rules at the end.

Page and roles:

- `roles:` may give one colour to several roles across a page (a long page has more roles than colours). Refused: two roles of one colour drawn in one scene (the message names both).
- `theme: { fill-c1: "#EEF0FF #1E2340" }` in the front matter: a role colour's fill on this page's stages, light then dark; cards, groups, lanes and panels of that colour take it, borders and inks keep the palette's. `fill-c0` to `fill-c8`. Refused: anything but two `#RRGGBB` values.

Setup:

- `## X above A..B` (and `role id above A..B: title` for a band of one card): a band over lanes A to B; on a phone it is the first row.
- `role id under A..B: title` in a row: the card on its own line under row cards A to B, as wide as they are. Refused: an `under` that does not name two of the row's cards left to right.
- `layout: row` under a lane's heading: the lane's cards side by side across its width, arrows between neighbours along the row; a phone wraps the row. Refused: any other value, or the line not under a lane's heading.
- `flow: off`: no moving dot on the scene's connectors (on by default). Refused: any other value.
- `lines: straight`: a side arrow with nothing in its way is one straight line (curved by default). Refused: any other value.
- `badges: stacked` under a card with badges: one badge per row, each the card's width (default: one row when they fit).
- `+ (a)`: a letter chip before the card's title, on the title's row.
- A card line starting with a tone or a role in brackets, `role id: title | (good) words`: those words in that ink, the rest of the card unchanged (also in `text id:...`). Refused: an unknown tone or role.
- Card lines take the panel lines' marks: `. ` body size in plain ink, `> ` indented one step (repeat for deeper), `~ ` small and muted, `= ` body size in the card's colour.
- `key role [dashed]: words` (alone or beside a tone flag, `key pen [dashed]: not counted`) draws the key's swatch dashed, same size and place: a pending or not-yet state, as the cells it names. In the chips track beside the where line a phase not yet reached is a dashed outline alone (its role chip is hidden on those steps).

Steps:

- `keep a -> b: words`: the connector's words stay while its line stays, drawn once; without `keep` a data connector's words show in their own step only. A neutral-role (control, config) connector's words always stay while its line shows.
- `a -> b (bad): words` (or another tone in place of a role): the label as plain words in that tone, in the title size, centred in the free gap. Refused: a tone after the words.
- A connector end `id.a` (card id, dot, badge letter): the line starts or ends level with that badge.
- `light none`: the step lights no card. With `light ids` a step lights only those; without `light` it lights its connectors' senders and the cards it shows that it does not only send to.
- `hide ## Title` / `show ## Title`: a lane or band heading goes from this step (and comes back); its place stays; hidden from step 1 it is never drawn.
- `dim ids` takes a pill's id: only that pill is faint, its card stays strong.
- `cross ids` / `cross ids off`: a large X corner to corner over the card from this step on, its words still readable. `cross ids corner`: a big bold x in the bad tone at the card's top-right corner; the title never runs under it.
- `key role [warn]: words`: a key entry whose swatch takes one tone (`[good]`, `[bad]`, `[warn]`, `[accent]` or `[plain]`); without a flag, the role colour.

Panels and tracks:

- `rows`: a cell `_` draws nothing and keeps its column; a cell `- words` is a dropped cell (dashed); a row ending ` [chip]` draws each cell as a boxed chip inside the same row height.
- `list Title | roomy`: the list's rows with thick spacing (28 px row pitch, 21 on a phone).
- `cells a: 32, +4 new` with an indented `labels: 0..31 | 32-35 new`: a wordless row of small cells, 32 plain then 4 in the accent tone (`+N word` names the group for the LLM view), `a` the row badge; labels one entry per group (`x..y` under its first and last cell, `_` none); a phone wraps it, every cell in one place on every step.
- `form: chips` under `track:`: the phases as one row of two-line chips (first word over the rest), no arrows; phases before the step's place are done (good tone), the place is lit in its step only, later ones faded; before the first `at` every chip is future. `form: chips | arrows` adds a small arrow between neighbours in a row. `place: beside where` (with `form: chips` and `where:`): on a wide stage the where words at the left and the phases at the right of the same line, when both fit.

Time blocks:

- A state takes its own role, spelled as on a connector: `row r "": a 0..3 (job); b 3..7 (server); wait 3..4 @1 [dashed]`; each tile (and dot or bar) is in its role's colour and carries that role; the row's role stays the default. Refused: a role the page does not declare, or two roles on one state.
- `row job r "Owner" [chip]: states`: the row label drawn as a content-width role chip; the row keeps its identity and its arrow ends.
- `[soft]` with `[good]`, `[bad]`, `[warn]` or `[accent]`: only the tone's soft fill, ordinary ink and border, no cross, thick border or halo.
- Different state ranges in one row may overlap only when their step windows never meet. Refused: ranges that overlap while they show together.
- `[dot] [plain]`: a neutral filled grey dot. `dot 5, 10, 15` (setup): unlabelled dots on the ruler.
- `dot <row> <interval start or a..b> [tone]` in a step: recolours existing dots for that step (`(role)` may replace the tone; exactly one colour); `keep dot` holds it; `off <row>` restores the declared paint. A range selects interval starts, both ends included; positions and filled or hollow state never change.
- `fill <row>`: the row's dots solid in this step only; `keep fill <row>` holds it; an optional `a..b` selects the dots whose midpoints lie in that interval; `off <row>` clears fills and tones. Refused: a row without dots.
- `window: -120..0 | words` then `height: N lines`: the window's dashed frame at least N text lines tall (18 px each), any missing room under the ruler. Refused: without a window, N outside 1 to 12, or written twice.
- `axis: First..Last` (setup): the axis and its cells run under those lanes, 0 under the first lane's left edge, the end under the last lane's right edge; a phone keeps the full-width axis. Refused: a name that is not a lane, the lanes right to left, or the line twice.
- `span <row> a..b [bar]`: a filled bar over that range in the row's role colour (a tone or role in brackets changes it), one line under the row; bars shown together stack; bars over a range with no state of the row stack inside the row. Refused: `[bar]` on `axis` or with `[line]`.
- `tag <row> a..b: words`: a chip above the row's interval, no marker line; it stays from its step; on the same range as a `[bar]` span it is the chip at the bar's left end. Refused: a range that neither the row's states nor a span written before it in that step cover.
- `band role id "Title": first..last` (setup): a titled region tinted in the role's colour behind rows first to last; its title in a left gutter on a desktop, on its own line on a phone. Refused: a missing or empty title, a row not in the block, rows bottom to top, overlapping bands, more than 8, a repeated id.
- A marker's `[beside]`: its words at the top of the rows beside its line (left of it in the axis's right half), else on a shelf with the line running up beside them; `[below]` with `ruler: below`: the words between the last row and the ruler; `[tick]`: only a short tick under the rows. Refused: `[beside]` with `[below]` or `[caption]`.
- `hush span <row> a..b`: retires a kept span's words from that step (its line, bar and place stay); one hush line may list several: `hush at 40, span ms -25..37`. Refused: no kept span with words at that exact range, or a row not in the block.
- A tick label's own reveal `7 words @3` (`@N..M` for those steps), a quoted label with a comma `7 "new pod a, cold" @3`, and one tone as on markers `3 "alarm" [bad]`. Refused: `@N` outside the scene's steps, two tones.
- `cells: 1 | apart`: cells as separate rounded boxes, no ruler line, each tick's label above its cell; in this form a `[below]` marker is its words alone under its cell, with no line. Refused: a cells mode other than `roomy`, `headers` or `apart`.
- `zoom: a..b | words | bracket`: the inset's words over a bracket across its range. Refused: `| bracket` without words.
- `arrow a -> b at 1.5 [dashed] [plain]: words`: one optional tone (`[plain]`, `[accent]`, `[good]`, `[bad]` or `[warn]`) beside `[dashed]`; by default the source row's role colour.
- A row span may use `[above]` to put its words above the stroke with a clear backing, in the same reserved slot; `[above]` does not combine with `axis` or `[bar]`. `form: chips | roles` keeps every track chip in its declared role from step 1 and marks only the active outline, without future/done tints.
- Time states combining [dashed] with a tone retain that tone as a faded preview (fill and border faint, words readable); bare [dashed] stays neutral. A counted cell group may end with one declared role, e.g. `cells a: 32 (eval), +4 new (warm)`, including groups without +.
- A span may use [bare] for words at its range in the same reserved slot, without a stroke; [bare] cannot combine with [line] or [bar]. Bottom-ruler marker captions follow the unit header and meet their own lines. Card body identifiers wrap at =, -, _,. and comma boundaries; a single part shrinks only when necessary, to no less than 11 px.
- `band role id "Title": first..last | compact` packs the band's rows under a name and a sub title. `time: a..b | caption | beside`: the caption on the tick-number line.
- Simple time blocks with the same number of columns share their default label gutter on a wide stage; explicit row-label layouts retain their own gutter. Plot labels sit beside their own value where space permits; a displaced label has a visible leader to its datum.

Phone rules (no new words):

- Numbers in `[numbered]` cells, or cells named with numbers: one mode per row: level when they fit; on end only when the turned digits and 3 px fit their own cell; else level, or on end, on staggered rows. Every cell keeps its number; never under 11 px, never closer than 3 px.
- Cell words too wide for their cell: a key in the cell names the tick values (for example 869–871) and a caption row holds the words. Staggered words stand on lines under their row, 10 px from their neighbours, on a page-coloured backing so marker lines pass behind them.
- When lines between two stacked rows still fall back to the right edge, the gap between the rows grows, 4 px at a time, at most 12 px a gap and 24 px a stage.
- A lane's `... words` line joins the heading's line when lines cross the gap under the lane, and steps aside when its band comes in.
- A connector chain, `a1,a2,a3 --> bd --> pl`, expands to the same connectors as each hop on its own line; each hop retains its arrow form, role/tone, copies and ordinary refusals, and `keep` applies to every hop. Quote literal arrow text inside a label.
- A card or grid item takes its box tone after the role (`card job [bad]: title`, `job [good]: title`); a list takes it after the title (`list Replay [bad] | roomy`), and a value may start `(bad)`, `(good)`, `(warn)` or `(accent)`. A list row prefixed `(bad)` (or `(good)`, `(warn)`, `(accent)`) tones both key and value; `key: (bad) value` tones just the value. A list tone colours its fill and border only; its title and ordinary rows retain neutral ink, and value/kept/struck tones keep their own ink. A grid item ending `[dashed]` has a neutral unfilled dashed outline and muted words. `zoom: a..b [warn] | words` fills the inset and its otherwise untoned intervals. These flags change paint only.
- `a -> b x2: first | second` gives each copy its own label (`_` leaves one unlabelled); one unsplit label still labels the bundle. Copies retain separate target ports on desktop and phones. This form does not change stage height.
- On phones, repeated time samples use smaller dots inside an inset ruler, with caption backings contained by the same frame; single arrivals keep their larger dots. Assignment labels keep extra room before a card border. Role dots retain the page theme stroke for solid fills.

### References (section 8a)

- New: `[[<type>:<name> "label"]]` stands for a part the host keeps; on its own paragraph a block, in a sentence a chip, in code text. A version 10 page with none reads and draws as before.
- New types that exist only as references: `svg` (drawn through an `<img>`) and `interactive` (run in a sandboxed frame, off unless the host turns it on). A fenced ```` ```svg ```` or ```` ```interactive ```` is refused, naming the reference form; its text still shows as code.
- New `parse()` option `resolveReference`, new caps `maxReferences`, `maxReferenceBytes`, `maxSvgBytes`, `maxInteractiveBytes`, new entry `durian-hypermedia/react/interactive`, new tokens `--ref-*` and `--ix-*`.

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
