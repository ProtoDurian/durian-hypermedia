# Charts on the one engine (lane chwire): notes for SPEC.md, CHANGELOG.md and the integrator

## What changed for a reader of the format
- **Chart.js is gone** (`chart.js` and `chartjs-chart-matrix` are no longer dependencies). Every ```chart and every chart-kinds
  fence (histogram, boxplot, violin, funnel, waterfall, treemap, sunburst, calendar) is drawn by our own renderer as SVG with the
  page's tokens. The first load no longer fetches a chart library (ADOPT.md's size table: `react/chart` loses the 73 KB gzip
  "later" chunk; re-run `bun scripts/sizes.ts`).
- **Smooth controls for every kind** (owner point 1, 16): a slider, a dropdown, a toggle or a step sets new numbers and each bar, line,
  point, slice, radar corner, box, stage, block, arc and day glides to its new place (primitives keep their key). Reduced motion,
  static and print draw the end state, no popovers.
- **One popover per mark** on every kind (hover, tap, focus), the arrow keys walk the marks (one tab stop), Esc closes. A series' key
  item is a button that hides or shows the series. Annotations are marks too (they were buttons over the canvas).
- Scales stay still while a control moves: `ChartCtx.max` is the largest number of every series and category over the control's cases
  (slider ends, every dropdown option, each toggle flipped, each button) or over the chart's steps.
- The chart's table (`Show the numbers as a table`) and the list of annotations stay as they were.
- Dropped: the candlestick words in another language through the old config (`words:`), the Chart.js canvas `aria-label` (the
  SVG has `role="img"` and the same label).

- **A calendar never scrolls sideways**: a year that does not fit wraps into strips of whole weeks (each strip has its weekday words and
  month words, the key sits under the last one; cells shrink to 15 px on a phone, 19 px elsewhere before a strip is added). Its height
  follows the room (`stripsOf` in `kinds/calendar.ts`). Names under bars that are a little wider than their band sit on two staggered
  lines (`nameWords`) instead of being cut. The chart-kinds part sits in a card like the other charts (`.ck[data-dh-kind]`).
- **No hydration warning on a chart's table**: `useTableMore` (react/table-more.ts) leaves a table inside a part alone until the part has
  hydrated (the hydration queue sets `data-wait` on the part's marker, `waiting()` reads it).

## Files
| File | What |
| --- | --- |
| `charts/page.tsx` | `ChartView` (the chart part), `ChartCanvas` (the drawing alone: width, phone, glide, marks) |
| `charts/paint.tsx` | `Prims` (primitives as SVG, attributes so classes win), `useGlide` (tween by key) |
| `charts/build.ts` | `buildChart`: primitives and marks for any kind (xy, kinds, round) |
| `charts/legacy.ts` | `chartFrom`: a page's ```chart YAML as ChartSpec and numbers for any kind (xy via `xy/legacy.ts`) |
| `charts/kinds.ts`, `charts/kinds/*` | the eight kinds as `ChartDraw`; `kinds/common.ts` has the contract (a View in `spec.opts.view`) |
| `charts/gen.ts` | writes `src/ui/chartprims.css` from `xy/xy.css`, `page.css`, `kinds/*.css` (run it after editing any of them) |
| `src/parts/chart-kinds/view.tsx` | the part's frame (steps, zoom path, table) around `ChartCanvas` |

## Left for others / found on the way
- **xy lane**: the horizontal bar chart draws its two axis titles on the same spot (`title:x` and `title:y` overprint at the bottom right). The first x label of a time axis touches the y axis labels.
  A chart whose steps add a series moves its plot (the key appears): the key height should come from the largest model.
- **render lane**: `tweenFrames` is reused as it is; `Shape` in `render/svg.tsx` is not exported, so the chart part has its own small painter.
- The kinds words: no rotated words (prims cannot rotate), so long names wrap, cut with an ellipsis or thin out; the sunburst names are
  horizontal.
