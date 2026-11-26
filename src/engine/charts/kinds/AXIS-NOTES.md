# The five axis kinds (histogram, boxplot, violin, funnel, waterfall) as primitives

Files: `histogram.ts boxplot.ts violin.ts funnel.ts waterfall.ts`, the shared frame in `axisframe.ts`, the look in `axis-kinds.css`
(classes `kd-*`; the sheet is meant to be joined to the chart sheet by the generator). Numbers come from
`src/parts/chart-kinds/compute.ts` (unchanged); the drawing calls `layout.ts` (`niceTicks fitTicks placeValues`) and `fmt.ts`.

## What the page needs to know
- **Keys** are fixed per mark: `bin:<i>:<series>`, `box:<name>:<w|cap|r|m|mean|v|ib|o:<j>>`, `stage:<i>[:name|name2|val|share|drop]`,
  `wf:<name>[:c|:v]`, `mark:<i>:l|c` (dashed line and chip), frame `g:y:<tick> t:y:<tick> t:x:<tick> axis:base axis:zero title:x title:y c:<name>:<line>`.
  Words that depend on room (a waterfall's value over a bar, a funnel's second name line and share, a histogram's x words, outliers) appear and
  disappear between steps; everything else keeps its key.
- **Still scales:** `ctx.max` rows are read as `numbersOf(view)` gives them (histogram: counts per series; boxplot/violin row 4 = largest max;
  waterfall row 1 = largest running total). The top of the scale is the largest of the story; the bottom follows the step (no number of the story is a smallest).
- **Marks** (`KMark`, in walking order): histogram: every bin `bin:<i>`, then `mark:<i>` (p50, p95), then `pick` (`skip: true`, the whole plot); box/violin:
  one per category then the marks; funnel: one per stage; waterfall: one per bar. Rects are in the chart's own coordinates, inside the rect given.
- **Chips** are at their centre (`x`) and the baseline of their words (`y`), as `charts/paint.tsx` draws them.
- **Classes beat the painter's attributes** (CSS over SVG presentation attributes): `kd-boxr kd-violin kd-fun kd-r24..46 kd-bar kd-wfbar ...` set the soft fills.
  Every primitive of a kind carries `kd-t-<tone>` (sets `--kd-tone`).
- **Height** never depends on the width: histogram 320; box/violin/waterfall 340 (+16 when a name is longer than 6 letters or has a space: two lines of words);
  funnel 48 per stage + 26 per gap + 8.
- No rotated words (a primitive cannot rotate): a name that does not fit its band wraps to two lines, then every k-th name is kept.
- The gradient of a histogram bar is gone (an SVG fill cannot be a CSS gradient); bars are one flat tone.
