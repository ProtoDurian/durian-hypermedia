# xy charts: what `ChartSpec` and the numbers mean

Kinds: `bar line area scatter bubble candlestick heatmap`. `draw(spec, values, rect, ctx)` gives primitives; `xyMarks(...)`
(src/engine/charts/xy.ts) gives the marks a page puts one popover each on (`src/parts/kit/popover`). `legacy.ts` turns a
page's ```chart YAML into this form (`fromLegacy`). Roles on prims are role names, `c1`..`c8` (palette) or a tone word
(`good bad warn accent muted`); text `y` is the baseline.

## `values[s]` (series s)
| Kind | Layout |
| --- | --- |
| bar, line, area | one number per `spec.x` category; `NaN` = no value. With `opts["s<k>.range"]="1"`: 2 per category, low then high (floating bar) |
| a series of (time, value) points | `opts["s<k>.points"]="1"`: `[t0,v0,t1,v1,...]` (t in ms) on a time axis |
| scatter | `[x0,y0,x1,y1,...]`; bubble: `[x0,y0,r0,...]` |
| candlestick | the candles: 4 per category `[open,high,low,close]` (`NaN`s = no candle); a line on top has `opts["s<k>.kind"]="line"` and 1 per category |
| heatmap | each series is a row (its name is the row label), one number per `spec.x` column |

## `spec.flags`
`stacked`, `percent` (with `stacked`: 100%), `horizontal`, `values` (numbers on the bars).

## `spec.opts` (all strings)
- Axes `x`, `y`, `y2`: `<a>.label`, `<a>.min`, `<a>.max`, `<a>.scale` (`log`; `time` on x), `<a>.format` (`number percent money duration duration-ms bytes`), `<a>.currency`.
- Time axis: `x.scale=time`, `tz`; the categories in `spec.x` are ISO times (or the series are points). `x.min`/`x.max` in ms bound it.
- Per series k (`s<k>.`): `kind` (`bar line area`, mixed charts), `axis` (`y2`), `line` (`solid dashed dotted`), `marker` (`circle square triangle diamond plus cross none`), `tone`.
- `ann`: JSON list of annotations `{kind: event|range|threshold, label, text, tone, when, from, to, y, y2, axis, fill: above|below, goal}`; from/to/y in the axis' own units (ms on a time axis, a category index otherwise).
- `hidden`: `"0,2"` series hidden by the key. `heat.diverge`, `heat.tone`. `word.open` ... (`open high low close up down size empty`) for other languages.

## `ChartCtx`
`max` (the largest numbers over the story, same layout as `values`) keeps every scale still; `lit` categories get class `xy-lit`.
Keys: bars `b:<category>:<series>`, lines `l:<series>`, points `p:<series>:<n>`, candles `c:<category>`, cells `h:<row>:<col>`, grid `g:y:<tick>`.
Styles by class: `xy.css` (`XY_CSS`): heat ramp (`xy-h0..19`, `xy-hp`, `xy-hn`), grid, axis, tick type.

## Stage bars (`spec.opts.stage = "bars"`, kind `bar`; `xy/stagebars.ts`)
The composed stage's `bars` block (`bars 7 team: axis title | unit`), drawn by us with the stage's own geometry (the plot's place is
fixed for the whole story; a step changes heights and paint only). `parse/lower-stage.ts` writes the words; `spec.title` is the axis
title, `spec.unit` the tick suffix, `spec.x` the bar labels, `spec.series[0].role` the bars' role, `values[0]` the bars' heights.
| opts | Meaning |
| --- | --- |
| `axis` | `0, 0.5, 1, 1.5`: the grid and tick values (the top one is the plot's top when no bar goes over it) |
| `line` | `name: value`, one per line: a solid reference line with its name at the right (inside, above the line, on a phone) |
| `every` | label every K-th bar (default: as often as the labels fit) |
| `tabs` | `One barista: 1..3; Two baristas: 4`: a tab row on top, the tab of the step lit, its underline glides to the next |
| `tone` | `23, 29 bad` / `Mon..Wed good`: those bars in a tone on every step (one per line) |
| `bar-most` | the largest number and limit of the whole story (so the scale never moves) |
| `bar-steps` | JSON `{"<step>": {peak, limit: {v, s}, head: [line, line], big: [value, words], bar: {i, s}, moves: [{from, to, k}], tone: [[i, tone or null]]}}`: `peak` (a dotted line at the step's highest bar, which is bad), `limit` (a dashed line from its step on; bars over it warn in that step), `head` (heading, two lines), `big` (a readout, kept until replaced), `bar` (one bar lit with a chip over it), `moves` (dashed arrows giver to taker, the taker's growth as stacked blocks, takers good, givers warn) |
Keys: bars `b:<label>:s0`, stacked blocks `blk:<label>:<j>`, grid `g:y:<tick>`, ticks `t:y:<tick>`, labels `x:<i>`, reference lines
`ref:<j>` / `refl:<j>`, `peak:line`, `peak:words:<q>`, `limit:line`, `limit:label`, moves `move:<from>:<to>`, the chip `lit:chip`, tabs
`tab:<i>` and `tabline`, `head:<line>:<row>`, `big:0`, `big:1`, axis title `title:<row>`. Classes `xy-sb-*` (css.ts).
The columns' height: `opts.max` (dots kind) is the most places any column holds in any step (lower-stage.ts sets it).
