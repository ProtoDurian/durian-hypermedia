# Durian Hypermedia: the format

> Format version 9 (pass 9, 2026-11-20 Pacific time). Version 8 is in SPEC.v8.md, version 7 in SPEC.v7.md, version 6 in SPEC.v6.md, version 5 in SPEC.v5.md, version 4 in SPEC.v4.md, version 3 in SPEC.v3.md, version 2 in SPEC.v2.md.

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
| banner | front matter | `banner: {kind: new, text: ...}` |

- **Parts with data** are `terminal` (also written `console` or `shellsession`), `filetree`, `editor`, `codewalk`, `chart`, `mermaid` and `animation`. Any other fence (```` ```ts ````, ```` ```diff ````) is a plain code block. On any Markdown viewer (GitHub, an editor) a part still shows as readable text.
- **The info string** after the part name may carry `#id`, `key=value` or `key="two words"`. Ids are optional: give one only when something links to the part.
- **Containers** do not nest. Inside `:::tabs` and `:::accordion`, every heading (at the highest level used inside) starts one tab or row. Containers may hold fenced parts.
- **Heading anchors follow GitHub's slug rule, and only that rule.** A heading's id is the one github.com gives it, so a link such as `page.md#cyanyaml` works on GitHub, in the rich page, in the table of contents and in doccheck alike. The rule (the `github-slugger` package, exact version 2.0.0): lower case; every character that is not a letter, a digit, a combining mark, `-`, `_` or a space is dropped (`cyan.yaml` is `cyanyaml`, not `cyan-yaml`; `Why this way` is `why-this-way`); each space becomes `-` (a run of spaces is a run of dashes; nothing is trimmed or merged); letters and digits of every script stay; no length cut. A repeat is numbered `x`, `x-1`, `x-2`, in page order, counting every heading of any level (a heading already named `x-1` becomes `x-1-1`).
  - **The text it reads** is the heading's text as GitHub renders it: code, emphasis, strike and link text count; an image, a line break and the tags of raw HTML add nothing; `&#233;` and `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;` are decoded; a code span is its source text. `:kbd[...]`, `:mouse[...]` and a host's inline references are not GitHub syntax, so they read as their source text (character references decoded). A heading in a code walk step note or in the banner is not a page heading: it has no id and takes no number. A tab or accordion title is a heading on GitHub: it has no id here but it counts in the repeat numbering.
  - **The rich page** puts its `idPrefix` (default `dh-`) before the id (`#dh-cyanyaml`) and puts it before the fragment of every prose link `[x](#cyanyaml)` (a fragment that already begins with the prefix is left as it is), so the source's GitHub anchor is what an author writes. A heading with no slug at all (`!!!`) gets `S` when there is no prefix (a slug is never upper case); a second one is `-1`, as on GitHub.
  - **The package** exports the rule as `slug(text)` (one heading's text; no repeat counting) and uses it for every heading id, the table of contents and the `Heading` slot.
  - **Where the rich page differs from github.com** (known): a named character reference other than the six above (`&copy;`, `&eacute;`) and an emoji shortcode (`:smile:`) are shown as typed, so they read as typed; a reference-style link `[Label][key]` whose definition is in another Markdown chunk (or, for a tab or accordion title, outside the title) reads as typed; headings inside an `:::llm` text do not count; the letters `github-slugger` 2.0.0 lower-cases differently from github.com (final sigma, dotted capital I; upstream issue Flet/github-slugger#54) get the package's anchor; a prose link whose fragment begins with the prefix is not prefixed again. Also: a heading inside a multiline HTML comment in a `:::tabs` container still counts as a tab title; `:kbd[]`/`:mouse[]`/host references swallow the Markdown inside them (an image or code span there reads as source text); HTML declarations and CDATA (`<!DOCTYPE>`, `<![CDATA[`) and footnote references (`[^n]`) read as typed.
  - **One namespace**: a heading's id, a part's `#id` and a tab or accordion item's id are all ids of the page. When a heading and a part get the same id, `parse` adds a warning to `problems` naming both; rename the part's `#id`.
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
| front matter | `title`, `concept`, `description`, `namespaces`, `type`, `pins`, `banner`, plus `source:` |

- **The size rule.** A fenced part whose LLM form is over 400 tokens (characters ÷ 4) needs a `:::llm` after it. doccheck's check "LLM text present" names the size and the limit.
- **The only way to give LLMs nothing** is `:::human llm=none`, so it is always a visible choice.
- **Inside `:::human`** parts need nothing for LLMs: the segment's `:::llm` replaces all of it.
- **A `:::llm` text is short and stands alone.** doccheck warns above 160 words. It may not hold a watch-out or security block.

## 3. Every part from one example

Each example below is complete; an author or an LLM can write the part from it alone. The Format page shows each one rendered and as an LLM reads it.

**Terminal.** The shell-session convention every docs site uses (GitHub's and Shiki's `console`): a line that starts with `$ ` (or `% `, or `# ` for root) is a command, typed at that prompt and highlighted as bash; **every other line is output**, shown as it is, including a program's own questions and the answers typed into them. Each command is one step; `@step <title>` lines set the steps instead. ```` ```console ```` and ```` ```shellsession ```` are the same part. A ```` ```sh ```` block stays still.

````
```terminal title="two people"
$ scaffold create acme/hello ./hello-app
? Project name? hello-app
✔ Created hello-app
```
````

**File tree.** Two spaces per level; a name ending in `/` is a folder. A mark is a word in brackets after the name, from a fixed list (section 3.1); the page shows the same word as a chip. `# text` is a note; `...` stands for entries left out.

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

**Chart.** The chart keys: `kind` (bar, line, area, scatter, bubble, radar, pie, doughnut, polar), `title`, `x` (a list, or `{label, values, min, max, scale}`), `y` (`{label, min, max, scale}`), `y2` (a second value axis on the right: `{label, min, max, scale}`), `series` (each `name`, `data`, and optional `kind`, `axis`, `tone`), `stacked` (`true` or `percent`), `horizontal`. Plus `controls` (slider, select, toggle, button) and `let` (formulas in the small expression language of SPEC.v2.md section 8). Section 7 says what each kind and option does and what doccheck refuses.

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

**Tier list.** A ranking in rows, best first. It is line-based, not YAML: one line per tier (the tier's name, a colon, then its items separated by commas), so the source already reads like the LLM view and like plain text on GitHub, and a model writes it right the first time. A short note goes in brackets after an item (`Postgres (does everything)`); an item with a comma or a bracket in its name goes in quotes (`"Redis, as a cache" (fast)`). The tiers are `S`, `A`, `B`, `C`, `D` unless a first line `tiers:` names others and may give each a colour in square brackets: `tiers: Must [good], Should [c6], Could, Won't [bad]`. A colour is `c1` to `c8` (the family colours) or `good`, `warn`, `bad`; a tier with no colour takes one by its place (pink, orange, yellow, green, blue, then the rest). Tier lines may come in any order and a tier with no line is an empty row; the page shows the rows in the order of the tiers. Each item sits in one tier, once. `title="..."` on the fence is the list's title. The page shows each tier as a tinted name block and its items as chips that wrap; an item with a note is a button that shows its note under the list when a reader taps or hovers it (the same text is the chip's `title`, so it also works without script). An LLM reads `Tier list: <title> (top tier first)` then one line per tier, `S: Postgres (does everything), SQLite`, an empty tier as `D: (empty)`.

````
```tierlist title="Databases for a small team"
S: Postgres (does almost everything), SQLite (no server to run)
A: MySQL, "Redis, as a cache" (fast, but memory is dear)
D: A spreadsheet
```
````

**Alignment grid.** Two axes with a name at each end, drawn as a 2x2 or 3x3 grid (the classic lawful .. chaotic by good .. evil, or effort .. impact). Also line-based. Two lines name the axes, `x:` and `y:`, each with 2 names (the two ends) or 3 (the ends and the middle) joined by ` .. `; both axes have the same number of names, so a grid is 2x2 or 3x3. The first name is the left end of x and the top end of y. An item goes **in a cell**, by its column and row names (`lawful / good: Paladin (keeps oaths), Cleric`; a `"label"` before the colon names the cell, and a line with only a label and no items is fine), or **at a point**: `Fix the typo (one line) @ 0.12, 0.22`. A point's `x` and `y` run from **0 to 1**: 0 is the first end of the axis, 1 the last, 0.5 the middle (so the top left corner is 0, 0). Cells and points may be mixed; each item is placed once. The page draws the grid with the axis names on the top and left (on a phone the row names stand on their side so the cells keep their width); a point is a dot with its label, and the label is moved so that it covers no other label, dot or cell label (with a thin line back to its dot when it had to move). A tap or hover on an item with a note shows the note under the grid. An LLM reads one line, `Alignment grid: <title>. Columns (x, left to right): ... Rows (y, top to bottom): ...`, then a table `cell | items` (cells with an item or a label; "Cells not listed are empty.") and, for points, a line saying what 0 and 1 mean and a table `item | x | y`.

````
```alignment title="Which task first?"
x: low effort .. high effort
y: high impact .. low impact
low effort / high impact "Do first":
Fix the typo (one line) @ 0.12, 0.22
Speed up the build @ 0.66, 0.2
```
````

**doccheck on both** (each message names the fix): an unknown tier colour (it lists the colours); an item in a tier that does not exist (it lists the tiers, and says to add the name to a `tiers:` line); two tier lines for one tier; a `tiers:` line that is not first; an empty item (two commas); a duplicate item (in one tier or across tiers, any letter case; in a grid, in two cells or a cell and a point); an alignment axis with other than 2 or 3 names, two axes of different size (so not 2x2 or 3x3), or a missing `x:` or `y:` line; a cell whose column or row is not on the axes (a swapped pair is named: the column comes first); a point with x or y outside 0 to 1; a line that is neither a cell line nor a point line; an empty part, or one with no item; an attribute other than `#id` and `title=`.

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

### 3.1 Marks and prefixes: the fixed lists

Every mark is written as a word in the source; doccheck refuses any word not in its part's list.

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


## 4. Steps are an attachment

- **One marker:** a line `@step <title>` inside a fenced part (`%% @step <title>` in mermaid). The text up to the next `@step` belongs to that step.
- **Parts that take steps:** terminal, file tree, editor, code walk, mermaid and animation. A chart has controls instead; doccheck refuses `@step` in a chart.
- **At least 2 steps, or none.** One `@step` is refused, except in an editor: its files as they are come first, so one edit already makes two states.
- **What may come before the first `@step`:** in an editor its files (and `@file` blocks), in an animation its setup lines, in mermaid the start of the diagram. In a terminal or a file tree with `@step` lines, every line sits under a step; nothing comes before the first one.
- **No nested steppers.** Containers do not nest and a part cannot hold a part, so a stepped part is never inside another stepped part.
- **Every stepped part looks and works the same:** a fixed-size stage, the step's title under it, and one control row (Back, Play where it plays, a slider, the count, Next); :kbd[Left] and :kbd[Right] step the part that has focus. Stepping never moves the buttons.
- **The old stepper part is gone.** Its job (a few states side by side) is a Markdown table; the article's worked example is now one.

## 5. Callouts and banners

**How the icon is chosen.** The author never picks an icon. The marker word picks it, and the colour with it:

| Marker | Icon | Use it for |
| --- | --- | --- |
| `> **Note:**` | an "i" in a circle | a fact worth knowing, not needed to follow the text |
| `> **Tip:**` | a light bulb | a shortcut or a better way |
| `> **Important:**` | an exclamation mark | a fact the reader must not miss |
| `> **Watch out:**` | a warning triangle | a trap; at most 5 lines, never in the summary or a human-only segment |
| `> **Security finding:**` | a padlock | one finding per block; dropped from the public LLM view |

**Callout or banner.** They differ in what they talk about:

- **A callout is about the paragraph next to it.** It sits in the text, as many as needed.
- **A banner is about the whole page:** the page is new, a draft, deprecated, or a sample. So it is not in the text at all: it is front matter, one per page, and the page shows it above the title.

```
banner:
  kind: deprecated     # info, new, draft or deprecated
  text: Use the headless replay page instead.
```

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
| `send [arrow \| both \| stream] ["label"] a -> b [is=<family>]` | **one hop per step** (format version 7): a request moves from one thing to the next, and the next hop is a step of its own with its own caption; only a `send stream` (a steady flow, not one request) may run a longer path `a -> b -> c`. The movement, shown as a small token that travels the path and waits at the end (the default), an arrow that draws itself from source to target (`send arrow`), both (`send both`), or a stream of small dots that keep flowing along the path for the whole step (`send stream`: traffic, a feed, readings; with reduced motion the dots stand still along the path; a stream that runs in the step before and in this one, along the same path, keeps flowing when the reader steps on (format version 8): it does not fade in or start again, even when its label changes; it fades out in the step that drops it); it needs no connector, and runs beside one when there is one. Its colour is its family's, else that of the thing it starts from |
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

- **A fixed stage** for the whole story: its shape comes from everything the story ever shows (between 1.25 and 2.4 wide per unit of height, at least 260 pixels tall), so the buttons never move.
- **The controls sit in a bar above the stage** (the colour legend, reset the view, the 2D/3D button, zoom out, zoom in, show everything, "Back to the story"), never over the scene; **how to move** is a line under the stage, always shown. Only a thing's note, which the reader opens by clicking, shows on the stage.
- **The story's camera** frames what the author asked for (`camera`, `focus`, else everything) **plus everything the step touches**: what it adds, moves, changes, sends along, highlights or makes speak, with their words and their tokens, and a margin. It never draws larger than 1.5 times natural size. On a stage under 480 pixels wide (a phone) a wide scene (more than 1.4 wide per unit of height) uses its **narrow layout**: the stage's own row or left-to-right graph runs top to bottom, so words stay readable; on a wider stage it is drawn smaller, down to 0.65, before anything is left out.
- **On a phone** (format version 8; a stage under 480 pixels wide) every scene is drawn with the phone's spacing: the same type sizes (a heading at least 11), tighter padding and gaps, and labels, speech and line labels that wrap sooner. The story's camera never draws the smallest words under **11 pixels** on the screen; what the step touches is still always in frame, and the reader moves to see the rest. The part runs edge to edge (the width of the page without its scrollbar), the camera's buttons sit under the stage at a finger's size (40 pixels), an edge with more of the scene beyond it is shaded with a small arrow, and the line under the stage says how to move by touch (tap the stage, then one finger moves and two fingers zoom; in 3D one finger turns). Since format version 9 that line is always one line: a short one on a phone ("Tap, then drag to move"; in 3D "Drag to turn"), and a **?** button beside it opens the whole text, every key and gesture. A tap on a thing frames it no smaller than the same 11 pixels. In 3D, every word is 11 pixels or more.
- **Things a step does not change stay still** (format version 9). In a group, a grid, a graph and the stage itself, a thing that leaves (moves out, is removed, or is not added yet) leaves its place empty, so nothing around it closes up or slides: only what the step adds, moves, swaps, splits, merges, pushes or pops moves, with what it holds. Two things that are never in a container at the same time, of the same kind and size, share one place (the job a worker finishes and the next job it takes). Data structures (array, list, stack, queue, bucket, table) and trees still close up: a queue moving up is what a pop means. If the author reorders things in a group (`move a to g after b`), that group closes up. A test checks every step of every sample, wide and on a phone: no untouched thing moves or changes size.
- **Lines have room** (format version 9): every connector and every arrow between list items shows at least 32 units of line between its two shapes. Things side by side that a line joins are laid out 38 apart, and layer bands that a line crosses leave the same room. A test measures every line of every step, wide and on a phone.
- **Whole things at the edge** (format version 9): on a laptop the story's view never cuts a thing, a container that would fit, a container's heading or a layer's name in half at the stage's edge (in a close-up, `camera ... close` or `zoom into`, its neighbours may be cut); it grows to show it whole, or slides to take it in or leave it out, keeping what the step touches in frame. It never runs past the scene on one side while it cuts the scene on the other: it stays within the scene, or is centred on it. (On a phone a big scene still runs past the stage on purpose, with shaded edges.)
- **Beats** (format version 9): a step with `then` lines plays its beats one after another; each beat moves the stage from the end of the beat before to its own end, and a send or a speech bubble shows in its own beat. Going back a step is one move.
- **One size per thing for the whole story.** The engine lays out every step, keeps each thing's largest size and lays out again, so nothing grows or shrinks as things come and go: a group that will hold three items has their room from the start, and a lift keeps its size full or empty. A container's contents start at its left in a row (centred in any other layout); in layer bands, containers in one column share its width. A thing that moves to another layer with no `after`/`before`/`first` keeps its place in the row: what moves between floors goes straight up or down.
- **A closed thing** (format version 9) keeps one size and one place for the whole story. Its inside is drawn faint (about a quarter strength) with no words; lines into it keep full strength, so a stream or a connector still visibly goes in. `zoom into` flies the story's camera in and the inside fades in with its words; `zoom out` fades it back. A closed thing's hidden words never count for the smallest words a step shows. This is a **semantic zoom**, not a second scene: nothing around it moves, and it is the same in 2D and 3D.
- **Split, merge, drop** (format version 9): a split's pieces grow out of the token; a merge's pieces flow into the result; a dropped token travels to where it is lost, turns red, is crossed out, sinks a little and fades. A step that moves or drops a token runs as long as a send.
- **Small things never cover words.** A token, a pointer, a sent token at rest, an arrow's label, speech and a connector's label are each placed by the engine: it tries spots around what they belong to (above first, then the sides, then further out) and takes the first that covers no label, no shape and no line, and prefers one off container edges. doccheck and the tests count overlaps for every step of every sample (pass 6: 0).
- **Lines never cross words.** A connector or an arrow that would run through a thing it does not end at, or a word, bows around it (the least bow that clears it). A container's heading slides along its top (left, right, middle) to the one place no line crosses in the whole story, so it never moves between steps. An arrow drawn beside a connector moves further off when the connector's own label is in its way. The tests count lines over words (every label, heading, layer name and chip, except a line's own label and the words of what it ends at) and lines through things, for every step of every sample, in the wide and the phone layout (pass 6: 0 and 0). In 3D, words are drawn over the lines, and a container's name keeps a clear gap from the words of what it holds.
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
- **The reader in 3D:** left-drag to turn; right-drag, Shift + drag or two fingers to move; the wheel (once the stage is taken), Ctrl + wheel, a pinch, `+` and `−` or the buttons to zoom; arrows move across the screen, W A S D walk over the ground; click a thing for its note, click a layer to zoom into it; the reset button and "Back to the story" put the story's camera back. **The camera never goes below the top plane** (nor the highest thing): turning down stops a margin above it, so a plane is never seen from underneath.
- **Things rest on their planes:** a thing's bottom is at its layer plane's top surface; a thing in a container stands on the container's slab; words float above. The draw order follows: lower layers first, on each layer its plane, then its slabs (outer first), then its things; a thing at full opacity is drawn solid, so no see-through plane or slab can paint over it. A test checks every thing of every step of every sample (its bottom at or above its plane's top and its container's slab), and the lowest camera tilt. The **2D/3D** button on every stage switches and keeps the step. Without WebGL, or when the reader asks for reduced motion, the stage stays 2D and the button is hidden.
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

### 6.11 The animation's texts in the Document JSON

The Document JSON (what `parse()` returns, and what `dh json` prints; `ast: 1`) gives every animation block one more field, `texts`, so a tool that reads only the JSON, such as a word checker, sees every text a reader sees in a scene:

```json
{ "type": "animation", "anim": { "head": "...", "steps": [], "base": 0, "info": {} }, "texts": ["Web server", "Database", "The page asks the database.", "reads"] }
```

- **`texts` is an array of strings, always present** on a block of type `animation` (also inside tabs, accordions and `:::human`). A scene with none of the texts below has `"texts": []`. A part that was refused (an `error` block) has none, as it has no `anim`.
- **What is in it:** the quoted label of a thing, a family or a connector (`pill web "Web server"`, `app -> db "reads"`, a `send`'s label, the labels of `split` and `merge`, a `push` label, `set x label=...`); each step's caption (its `@step` title); each `say` text; each `note` text (a `note x: text` line, or `note="..."` on a thing); and the cells and items of `array`, `list`, `stack`, `queue`, `table` and `row` (a cell that is only a number is left out).
- **Order, and repeats:** the order the scene is read in: the setup lines first, top to bottom; then each step in turn, its caption first, then its own changes. A text is listed once for each place it is written, so the same label used twice is listed twice. A `note x:` line with no text gives an empty string.
- **What is not in it:** ids, entity kinds, change words, `tone=`, `is=` and other keys. This includes an id that the stage shows in place of a label because the thing, family or layer was declared without one (`pill worker` shows "worker" but adds no text): `texts` lists what the author wrote as text, not what the drawing falls back to.
- **One list, one source:** `texts` is exactly what the scene compiler (section 6.7) collects while it reads the block; `animationTexts(block)`, exported from the package entry (`import { animationTexts } from "durian-hypermedia"`), returns the same list for a block and compiles `block.anim` again, so it also works on a block read from JSON made before `texts` existed. Nothing else in the Document JSON changes: the field is additive, and `ast` stays 1.

## 7. Charts

- **Kinds.** `bar`, `line`, `area` (a line with its fill): `x` lists the categories and each series' `data` holds one number per category (`null` leaves a gap). `scatter`: no category list; `data` is points `[x, y]`. `bubble`: points `[x, y, size]`; the bubble's area follows the size. `radar`: `x` names the axes (at least three), each series is one outline. `pie`, `doughnut`, `polar` (polar area): `x` names the slices, values are 0 or more, and the slice colours follow the default colour order. `x` is always the category (or point-x) axis and `y` always the value axis, also when `horizontal: true` turns them on their side.
- **Options.** Several bar series are grouped (side by side) by default. `stacked: true` stacks bar, line and area series; `stacked: percent` scales every bar or area to 100% (the tooltip shows the real value). `horizontal: true` is for `kind: bar`. A **floating bar** is a value written `[low, high]` in a bar series. **Mixed**: a series' own `kind` (bar, line or area) draws it in another style on the same chart; `axis: y2` puts it on the second axis, declared by the chart's `y2`. A line in a stacked chart is not stacked with the bars. A mixed chart cannot be horizontal.
- **Scales.** `scale: linear` (the default) or `scale: log` on `y`, `y2`, and on the `x` of a scatter or bubble chart. A log axis labels the powers of ten (and 2 and 5 on a short one) and needs values above 0. Not supported: `symlog`, because Chart.js has no such scale and a hand-made one would break the tooltips and ticks; and `time`, because Chart.js needs a date adapter (a new runtime dependency) to draw one. Write dates as category labels instead. doccheck refuses both as an unknown scale.
- **Colours.** A series takes its colour from the theme: by default `--series-1` to `--series-5`, then `--c6` to `--c8`, then again. `tone: 1` to `8` picks `--c1` to `--c8`; `accent`, `good`, `warn`, `bad` and `muted` pick those tokens. Light and dark both come from the tokens, and so do the grid and the ticks.
- **Narrow screens.** Under 480 px a chart wraps long labels (axis ticks, radar axes) onto several lines, and a log axis labels only the powers of ten; a horizontal chart grows with its bars and a round one is squarer. Text is never under 12 px, and every chart has its numbers as a table under it ("Show the numbers as a table").
- **An LLM reads the data**, not a description: a chart with fixed data becomes a table; a chart with controls or formulas goes as its source. The line `Chart (kind): title` comes first (`bar + line` for a mixed one, `stacked` or `100% stacked` before the kind). A short note follows when the chart needs one: which series are bars, lines or areas and which are on the right axis (`y2`); `Log scale on y.`; the bars run horizontally; a cell `3 to 9` is a floating bar; `Each bar or area is scaled to 100%`; the bubble size. Then the table: category kinds one row per category and a column per series (a radar's first column is `axis`, a pie's `part`); scatter one row per point (`series`, x, y); bubble adds `size`.
- **doccheck draws each chart** at its start values, at both ends of every slider, at every option and after every button, and refuses one that breaks. It also refuses, naming the fix: an unknown kind, chart key, axis key or series key; `scale` other than `linear` or `log`, or on a kind that has none; a log axis with a value or `min` of 0 or less, or one that is stacked; a floating bar whose low is above its high, that is not a pair, that is in a line series or that is stacked; a radar with fewer than three axes; a bubble point with no size (or a size of 0 or less), a scatter point with a size; `axis: y2` with no `y2` declared, and a `y2` no series uses; `stacked` or `horizontal` on a kind that cannot take it; a series `kind` or `axis` on a pie, radar or point chart; `stacked: percent` with a line on the main axis; a negative pie value; an unknown `tone`.

## 8. Inline parts

- **Keys** are typed names: `:kbd[Esc]`, `:kbd[Ctrl+Shift+P]`, a sequence `:kbd[Ctrl+K, Ctrl+S]`, and `:kbd[Left]`, `:kbd[Right]`, `:kbd[Up]`, `:kbd[Down]`, `:kbd[Enter]`, `:kbd[Cmd]`. The page draws the symbol (←, →, ↵, ⌘); doccheck refuses a symbol in the source.
- **Mouse** is one icon and the action: `:mouse[click Next]`, `:mouse[right-click src/]`. Action words: click, double-click, right-click, middle-click, drag, drop, scroll, hover, select. The icon is about two lines tall and **fills the button the action presses**: the left button for click, double-click, drag and select; the right one for right-click; the wheel for middle-click and scroll. A double click adds a "2" badge, so it never looks like a single click; scroll adds arrows by the wheel, drag a move arrow, drop a down arrow, hover motion lines, select a text cursor. The Format page shows all nine.

## 9. doccheck's checks (format version 9)

| Check | Refuses |
| --- | --- |
| docs parse | a fence or container never closed; a container inside a container; `:::llm` after prose |
| parts known | an unknown `:::` container; a `.dh.md` page with no part; a `.md` page with one |
| LLM text present | a fenced part over 400 tokens in the LLM view with no `:::llm`; `llm=none` on anything but `:::human` |
| fence partner | a `:::human` with neither `:::llm` after it nor `llm=none` |
| LLM text placed | an empty `:::llm`; warns above 160 words |
| part data | each part's own rules (sections 3, 4, 6, 7, 8; the tier list and alignment grid rules are in section 3), a bad front matter banner, duplicate ids; an animation is replayed step by step (section 6.7), with one hop per step; a code walk's `animate=` is on, off or auto, and not on step 1 |
| code walk ranges, code references | a range past the end of the file, a focus or mark outside it, a missing file or symbol at the pin |
| watch-out blocks, security blocks | as in version 2 |
| translation behind, translation shape | as in version 2; the shape now compares parts by order |
| LLM view in step | a `docs-llm/` file that is not what `dh llm` makes now |

## 10. Translations

A translation keeps every part, attribute, code reference and code block of its source, in order; doccheck's "translation shape" compares them. Translated: prose, headings, list items, table cells, callout text, front matter `title`, `description` and `banner.text`, `:::llm` texts, mermaid labels, terminal and file tree step titles, code walk notes, chart `title`/`label`/`name` (a second axis's `label` too; the category names in `x` stay as they are), a tier list's title, tier names, item names and notes, an alignment grid's title, axis names, cell labels, item names and notes (translate a tier or axis name the same way everywhere it is written, on the `tiers:` line and in the tier lines, on the axis lines and in the cell lines; never the colours in square brackets, the keys `tiers:`, `x:`, `y:` or the `@ x, y` numbers), and an animation's captions, its quoted labels and its say and note texts (never its ids, entity kinds or change words). No native speaker has read the five translations yet.

## 11. What changed from version 8

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

## 12. What changed from version 6

| Version 6 | Version 7 |
| --- | --- |
| a family coloured the words too (its ink), and always tinted the inside | words stay in ink; the family is on the border, the lines and an optional tint (`fill=soft` default, `fill=none`); a thing of its container's family drops the tint; the legend's words are neutral |
| a request could go `a -> b -> c` in one step | one hop per step; doccheck refuses a longer path or a chain of sends in one step (a stream may run a longer path) |
| in 3D the camera could turn below the upper planes, so things looked under them; see-through planes could paint over slabs | the camera stays above the top plane; planes, slabs and things draw in order, solid things solid; a test checks that every thing rests on its plane |
| only drag and Ctrl + wheel moved the view; the hint hid behind the legend; arrows changed the step | wheel and trackpad scroll, arrow keys, + and −, W A S D (3D), right-drag (3D), a tap then one finger (phone); the hint is a line under the stage; a reset button |
| the 3D stage read the colour tokens only on a dark-mode switch | it reads them again on any theme or palette switch; no colour value in the engine (tested) |
| a code walk always morphed between steps | `animate=on|off|auto`: a move between different functions or files is still (open and highlighted, the rest folded); a morph only when the same code changes |

## 13. What changed from version 5

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

## 14. What changed from version 4

| Version 4 | Version 5 |
| --- | --- |
| an animation is drawn flat only; 3D was an idea | the same scene draws flat or in 3D; a **2D/3D** button on every stage keeps the step; ```animation 3d opens in 3D |
| no layers | `layer <id> "label"`, `layer=` on any entity, `split layers`, `stack layers`, `focus <layer>` (section 6.9) |
| the 2D stage: one layout for the top level | top-level things on two or more layers are drawn as bands, one per layer, with lined-up columns |
| the LLM view: what the stage starts with, then captions | the same, plus one line naming the layers, top to bottom, with what is on each |
| doccheck refused any word after `animation` | `3d` and `2d` are allowed; an unknown layer and a focus on an undeclared layer are refused |

## 15. What changed from version 3

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
