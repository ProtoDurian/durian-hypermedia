# eng-polish: what it changed (for SPEC.md and CHANGELOG.md, which the integrator writes)

Four drawing differences from the old stage, found after the render, chart, lanes and blocks lanes had ended. Every edit is marked `eng-polish`.

1. **Counted units** (`charts/radial/units.ts`). A unit is a square. A remaining (or `gone`) unit is the stage's: the surface-2 band fill with the
   faint edge at full strength (`stg-box ps-scn-faint-edge`, time.css), no role colour, so it is lighter than the others but still reads as a square.
   The key under a one-grid units block is one group to a row at the left (as the stage's was); a panel's key still wraps in a row.
2. **A time block inside a lanes scene** (`layouts/lanes/items.ts`). A box item that carries the time block's classes (`stg-time-*`, `stg-seg`,
   `stg-span-bar`, `stg-ruler-dot`) is drawn by the timeline layout's own mapping (`layouts/time/prims.ts itemToPrim`), a flat rect with the
   stage's paints, not as a card (a card is round, outlined and can be lit). A path whose ink is `line`, `line-2` or `muted` keeps that colour
   (class `pi-<ink>`, time.css): the row rule under a hidden ruler was drawn in the dark wire colour.
3. **The phone's foot** (`render/engine.css`). The sticky foot is one row at 560 px and under: back, play, speed, the step count, next. The step
   slider is hidden there (it stays on wider screens). The two-row player was 51 px taller than the old stage's one row of dots and covered the bottom of
   the stage window (the note panel under a tall scene).
4. **Struck words** (`render/svg.tsx StrikeLines`, `layouts/blocks.css`). SVG text ignores `text-decoration-color`, so a struck word (`stg-struck`,
   or the grid's `g-strike`) is now a text plus its own line per row of words in `--stg-struck-line` (the stage's red), at the stage's place
   (baseline less 0.32 em, the word's width plus a pixel each side; `struckSlash` in ui/stage.tsx). The CSS `text-decoration` rule is gone.

Tests: `test/engine/polish/polish.test.tsx`, `test/engine/chradial/radial.test.ts` (the unit remainder).

## Round two: v0.7.0's renderer fixes and the lanes review's lines

5. **The camera leaves a box out whole** (`render/camera.ts wholeAtEdge`, v0.7.0 cab61bb): the slide also tries the exact places that leave a cut
   thing out, and a frame may run up to `SLACK` (12 px) past the scene, only where that cuts fewer than any place within it.
6. **A container's heading rides with the view** (`render/svg.tsx`, v0.7.0 149ccb8): a heading the view cuts is drawn just inside the view's edge (class
   `eng-ride`, a halo of the container's ground, engine.css), using `core/edge10.ts rideHeads`. The "more beyond" line of the old stage has no twin here.
7. **The phone's step scroll** (`render/svg.tsx`, v0.7.0 8ded128): `followBy` (ui/stage.tsx) picks the screenful with the most lit items; accent words a
   step brings that the step before did not have count as lit (class `eng-fresh`: a table's chosen row).
8. **Hot lines** (`pipeline.ts`): the relation a step sends along or lights is a `width: "hot"` path: 2.2 px at full strength.
9. **Arrowheads and dots** (`render/svg.tsx`): a head is the stage's 10 px by 0.6; a send's dot stops `HEAD_ROOM` (15.2 px) short of an end that has a
   head, and its place is rounded to 0.01 px (server and browser disagreed in the last digit: a hydration warning).
10. **A hidden ruler** (`layouts/lanes/items.ts`): a path with ink `none` is drawn with `pi-none` (no stroke); boxes whose id starts `time-` (the range
    box on a ruler) are flat.
11. **A wrapped category word on a horizontal bar** (`charts/xy/frame.ts`): the lines are 18 px apart (label-check saw 16 touch).
Not ported, with the reason: 5510b4d is the graph part (`src/parts/graph`), which is not drawn by this renderer; it came in with the v0.7.0 merge.
