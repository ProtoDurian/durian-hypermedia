# Lane sheet: what the three layouts read, and what they draw

`sheet` (worksheet), `wrap` (the old `nest:`, boxes inside boxes with fields) and `track` (the phase strip) are a port:
the old head blocks (`src/core/stage-sheet.ts`, `stage-nest.ts`, `stage-blocks.ts` `track`) lay themselves out; this
folder reads them from the Model (`blocks.ts`), stacks them (`place.ts`) and turns their items into primitives (`items.ts`).

## What it reads (as lowerStage hands it over)

- `model.layoutWords.sheet | wrap | track`: the head line is an entry (`word` = `sheet` / `nest` / `track`, `arg`, `body` = the
  lines indented under it, dedented by two); each line the block claims after it (a sheet's groups, rows, `=>` outcome) and
  each of its own words (`labels:`, `carry:`, `where:` ...) is an entry of its own, in source order.
- `model.layoutWords.timeline` with a `time` head: tells a track its phases are separators, not a journey.
- Step words: `layout` facts (`keep mark` is `word: "keep mark"`); `show`/`hide`/`light` of ids that are not things arrive as
  `layout` facts too and go back to the block that owns the id.
- Members of the scene that are containers with another layout (`time`, `grid`...) are stacked under the blocks with
  `ctx.child`; members that never show in the same step share one place (the stage's panel region).
- At the root `Placed.w` is `ctx.width` and the blocks are drawn at x 14; for a container of this lane `Placed.w` is
  `ctx.width - 28`, drawn at x 0 (the caller puts it at x 14).

## What it draws

Prims with keys `sh:<container>:<head word>:<n>`; a thing that shows in several steps keeps its key. Box paints:
`role:NAME:soft` -> box with `role`, `good:soft` -> box with `tone`; neutral boxes and regions -> `rect`. What the old item
carried that a prim cannot (the stage's paint names, thick borders, strike) rides in `cls` (`stg-thick`, `stg-struck`,
`fill-<name>`, `stroke-<name>`, `ink-<name>`, `stg-hot`, `stg-dim`). The step notes (`note:`, `= formula`, a sheet's slot and
the phone `slot.under` lift) are the renderer's: the outcome column of a phone worksheet sits right under the groups.
