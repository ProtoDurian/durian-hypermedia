# xy charts: notes for SPEC.md, CHANGELOG.md and the integrator (lane stagebars)

## What changed for a reader of the format
- **The stage's bars draw in the chart system.** A composed stage's `bars` block (`tabs`, `every`, `line`, `axis`, `tone`; step words `values`,
  `peak`, `limit`, `heading`, `big`, `light`, `move`, `tone`) is one chart thing of kind `bar` with `opts.stage = "bars"`. It keeps every
  rule of the old block (the plot's place and size, labels never under 11 px, line words inside the part on a phone) and every bar, line,
  tab, readout and arrow keeps one key for the whole story, so a step glides them (a bar grows, the peak line slides, the tab underline moves).
- `columns` draws as before (kind `dots`); its height is now the most places any column holds in any step (`opts.max`), so no column or label moves between steps (stage/21 at 390).
- A hash table (`buckets`) in a graph-form (format 10) scene has a box as wide as its widest row (format/49: the border cut through "grape").

## Files
| File | What |
| --- | --- |
| `xy/stagebars.ts` | `drawStageBars`: the stage's bars as primitives; `readSetup` reads the setup words and the steps' JSON |
| `xy.ts` | the bar kind calls it when `spec.opts.stage` is `"bars"` (`// eng-stagebars`) |
| `parse/lower-stage.ts` | `stageBars`, `stageColumns`, `barMove` (`// eng-stagebars`): the words become opts, the bar words are no longer unowned layout words |
| `layouts/graph/legacy.ts` | a `map` container's box is at least its own layout's size (`// eng-stagebars`) |

## Left for others / found on the way
- **pipeline.ts** `chartPrims`: `ChartCtx.max` takes its shape from step 0's numbers; a chart whose numbers only come in steps (every stage `bars`/`columns`) gets `max = []`. The stage bars and columns read `bar-most` / `max` from opts instead; every other kind fed from steps only would still scale per step.
