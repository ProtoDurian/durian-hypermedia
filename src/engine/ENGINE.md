# The one engine (format 12): words and lane contracts

The design: one model for every layout. The types are in `src/engine/types.ts` (frozen; changes only through
the integrator). This file is the grammar the parser implements and the contract each lane meets.

## 1. Which form a block is

- A page whose front matter has `format: 12` writes every ```animation in the new form (section 2).
- Without it, a block is read as today: the composed stage (format 11) or, when `looksLikeGraph()` says so or the
  fence has `layout=`/`3d`, the graph engine (format 10). Both lower to the same `Model`
  (`parse/lower-stage.ts`, `parse/lower-graph.ts`), so every block draws through the new engine.
- `dh migrate <file>` rewrites a file to format 12 and prints the diff. It never writes without `--write`.

## 2. Format 12

````
```animation [3d | 3d only] [look=stage|classic] [size=s|m|l] [pace=slow|fast] [static]
title: Name | note
layout: lanes                      (the stage's layout; default: lanes when there is a `##`, else graph)
role name c3: words                (a role of this block: its colour here, its words in the colour key; before the first thing)
## Region title [flags]            (a region: a lane, a band, a layer, a row ... as the stage's layout reads it)
role id [flags]: title | line | line
  role child [flags]: title        (indent = held by the thing above)
role a..d [flags]: t1; t2; t3; t4  (several things: a range or a,b,c; one title each split by `;`)
a -> b: label                      (a relation; `-->` dashed, `--` line, `<->` both; `(role)` after the target)
a, b -> c: label                   (several pairs)
id = v1 v2 v3                      (values in the setup)
ids is words                       (any state fact may be written in the setup: the state at step 0)
<layout words>                     (setup lines a layout owns, e.g. `x:` under a chart, `time: 0..60 | s`)
@step Title: caption               (`\:` is a colon of the caption: `@step A miss\: the edge has no copy`)
<facts and events, one per line>
```
````

### 2.1 Thing lines

- `role` is a role from the front matter `roles:`; `plain` (or any undeclared word on a line whose second word is an
  id followed by `[` or `:`) is refused unless it is `plain` (neutral, c0).
- `id`: letters, digits, `-`, `_`, `.`; not a word of section 2.3.
- **Flags** sit in one bracket after the id, space-separated: shape (`box pill circle cylinder cloud person
  diamond text dot token ref`), a layout name (the thing is a container laid out that way: `array`, `tree`, `grid`
  ...), `chart <kind>` (the thing is a chart), look flags (`dashed solid soft plain bare lit`), placement hints
  (`left right below beside`), `closed`, `hidden-inside`, `values`, `compact`. Unknown flags are refused with the list.
- After the colon: a title and `|` lines. For a data structure (`array list stack queue map`) the text is its
  values: `split s [array]: 5 2 8 1`; a map's entries are `key: value, key: value`.
- `key=value` words after the flags bracket are kept in `Thing.keys` (`pos=2,1`, `buckets=4`, `note="..."`).

- **Roles of one block (fmt12):** `role name cN: words` in the setup, before the first thing, names a role for this
  block only. It wins over a page role of the same name inside the block, so samples from several pages can share one page
  without renaming roles. A role with words is in the colour key above the stage (SPEC 6.10); `role name cN` (no words) only
  colours. `dh migrate` writes a graph-engine `family id "words"` as `role id cN: words` (cN in declaration order, as the old
  engine gave them; a family with no words keeps its id as words, as the old key showed it).
- **A step's title (fmt12):** `@step Title: caption` ends the title at the first `: ` within 48 characters; the reader sees
  the caption. `\: ` is a colon of the words, not the title's end. `dh migrate` writes it for an old graph-engine step whose
  line holds `: ` (that engine showed the whole line), so the migrated caption is the whole old line.

### 2.2 Step lines (DESIGN 2.2)

| Line | Fact |
| --- | --- |
| `show ids`, `hide ids` | `show` / `hide` (a thing named in a later `show` starts hidden, with what it holds) |
| `ids at place` | `at` |
| `ids in container [left\|right] [after id]` | `in` |
| `ids is words`, `ids is -` | `is` (replaces the chip; `-` clears) |
| `text id: line \| line` | `text` |
| `tone ids good\|bad\|warn\|accent\|off` | `tone` |
| `dim ids`, `dim ids off` | `dim` |
| `id = v v v [from ids]`; `id.2 = ...` for a chart's second series (`.3` ...) | `values` (series 2.. in `ThingState.series`) |
| `clear` | `clear` |
| `a -> b: words`, `a -x b: words`, `a ~> b: words` | `rel` (the line stays from this step; words and dot this step) |
| `light ids[: note]` | `light` |
| `say id [above\|below\|left\|right] [(role)]: words` | `say` |
| `note: words`, `foot [(tone)]: words` | `note` / `foot` |
| `split id into a b ...`, `merge ids into id`, `drop ids [at id]` | events on tokens |
| `focus <region>\|all`, `zoom into ids`, `zoom out [all]`, `lift ids`, `put back [ids]` | camera and depth |
| `enter scene from id`, `leave [scene]`, `layers apart`, `layers together`, `then`, `pace slow\|fast` | as named |
| any word a layout registers in `words.step` | `layout` fact, handed to that layout |

- Ids may be ranges (`p1..p6`), lists (`a,b`), globs (`p*`) and parts (`returns.Jul..Dec`: a chart's categories).
- In one step, the last line about a thing wins. Writing a fact that is already true changes nothing.
- One hop per **beat** for `rel` events with words (a fan-out is fine): `then` splits a step into beats, so a relay is
  `c -> r: SYN`, `then`, `r -> s: SYN` (one step, two beats, played in order). Two hops in one beat are refused.

### 2.2.1 What `dh migrate` writes for the old words (eng-migrate2)

Every animation of fixtures/format, fixtures/stage and the generality scenes migrates and compiles with no refusal and
the same states (`test/engine/parse/migrate-compile.test.ts`). Where DESIGN section 4 gives no spelling, the plainest:

| Old | Format 12 | Who reads it |
| --- | --- | --- |
| `family id "words"` (graph engine) | `role id cN: words` in the block (fmt12) | parse12: the block's roles, the colour key |
| a line a graph-engine step draws with a label (`a -> b "label"`) | the line with its label in the setup, `hide a->b` there, `show a->b` in its step (fmt12) | core: the label stays on every later step, no dot |
| a graph-engine step line holding `: ` | the same line, its colon written `\: ` (fmt12) | parse12: the whole line is the caption |
| a relay drawn in one step | `then` between its hops | core (one hop per beat), the renderer plays beats in order |
| `dashed id` / `dashed id off`, `cross id [corner] [off]`, `fill id Key: value`, `mark id #3: tone`, `title id: words` | the same words, as `dim id [off]` is | the lanes layout (its step words); `fill` and `mark` in a worksheet are the sheet's |
| a state word `[+ open]` | `id is open` (+ `state-tone id bad` for another tone; a setup one keeps `stateTone=` on the thing) | lanes: drawn in the card's corner, not as a tag |
| step panels in a lanes scene (`card`, `calc`, `rows`, `list` ...) | the same words | the lanes layout (as the composed stage drew them); elsewhere the grid's |
| `show`, `hide`, `light` on a head block's items (a matrix cell `c.sb`, a nest box, a bin) | the same words | that block (it refuses a name it does not have) |
| a word two layouts own (`at` of a phase strip, `mark` of a worksheet) | the same word | the layout this scene uses |
| head blocks above the lanes (a time strip, a phase strip over them) | `lanes-at: N` in the setup (the lanes come after the first N head blocks; written only when N > 0) | lanes |
| `columns`, `bars`, `units` and their categories (`light Jul..Dec`) | a `[chart dots]`, `[chart bar]` or `[chart units]` thing, `id = values`, `light id.Jul ...` | the chart system (lanes keeps the block's place) |

### 2.3 Reserved words (never ids)

`title layout show hide at in is text tone dim clear light say note foot split merge drop focus zoom lift put enter
leave layers then pace all plain off from into`.

## 3. Lane contracts (one owner per folder; nobody edits another lane's files)

| Folder / file | Lane | Must export |
| --- | --- | --- |
| `parse/parse12.ts` | parse | `parse12(src: EngineSrc): Model` (`EngineSrc`: the body, its first page line, the fence words, the page roles, `format12`) |
| `parse/lower-stage.ts`, `parse/lower-graph.ts`, `parse/migrate.ts` | parse | `lowerStage(...)`, `lowerGraph(...)`, `migrate(text): string` |
| `core/states.ts`, `core/diff.ts`, `core/check.ts`, `core/llm.ts` | core | `states(model): StepState[]`, `diff(model, a, b): Motion`, `check(model, states): Problem[]`, `llm(model, states, plugins): string` |
| `layouts/<family>.ts` | one lane per family | `LayoutPlugin` objects for its layouts, registered in `layouts/index.ts` (pre-written: do not edit) |
| `render/svg.tsx`, `render/camera.ts`, `render/route.ts` | render | `<EngineStage compiled ui />`, `focusRect(...)`, `route(...)` |
| `render/three.ts` | L-3d | the 3D stage from a `Plan` + layers |
| `look/tokens.ts`, `look/look.css` | look | the two token sets |
| `charts/*.ts` | ch-xy, ch-radial, ch-wire | `ChartDraw` per kind, registered in `charts/index.ts` (pre-written) |
| `pipeline.ts` | integrator | `compile(src): Compiled` (glue only) |

- **The LLM view (llm3):** `core/llm.ts` says the model's story; each layout adds the facts only it holds through
  its one hook, `LayoutPlugin.llm(model, states): string[]`. A line `Step k: words` is placed under step k's caption,
  `End: words` last, any other line (or `Setup: words`) with the setup lines. Every layout with something in the story
  speaks: the stage's, a region's or a container's layout, a layout whose head words sit in the setup, and a layout that
  owns a step word written in a step. A layout never calls the old views.
- **Port, do not rewrite:** a layout lane moves the existing code (`src/core/stage*.ts`, `src/core/scene.ts`,
  `src/core/route.ts`) behind the plug-in interface, keeping its measured rules (still things, fanned lines,
  11 px words, phone forms). Delete nothing from the old engines: the integrator switches them off at the end.
- **Done for a lane** = its fixtures pass the match gate at 1280 and 390 against the
  baseline, its tests pass, and its commits pass the gates.

## 4. What still draws through an adapter

Format 12 words are read by the engine. These parts still get their drawing from the older code, which the engine calls for places and sizes only (SPEC.md 6.16 says the same to authors):

- **Graph and free geometry:** `layouts/graph/legacy.ts` and `raise.ts`. A format 12 graph scene is written back in the graph engine's words and laid out there; charts, regions, scenes in the scene, a layout's own words other than `set`, card lines, state chips and replaced lines use the engine's rank layout instead.
- **Lanes:** the composed stage's compile and layout give the places (`layouts/lanes/stage-src.ts` replays the stage's source). Chips on a card, head blocks, step panels and stage chart blocks the chart system cannot draw whole (`chartDraws` in `lanes.ts`) are drawn from that replay.
- **Timeline, grid and sheet:** the old blocks measure and place each item (`layouts/parts.ts`, `block-parts.ts`); the model says in which step it shows. Their words (about 57 time words, the grid's `matrix:`, `bins:` and `grid N`, the sheet, wrap and track words) are handed over as written.
- **Time words:** format 12 on a `timeline` takes the old spellings; they are not folded into format 12 words.
- **Notes of a worksheet and a phase strip** go to the caption; the stage's slot rules beside an outcome column are not ported.
