# The grid layout: what it reads, what it gives

Lane L-grid. Plug-in: `../grid.ts` (`Grid`). Two paths, chosen by the words the model hands it.

## 1. The ported words (format 11 blocks)

`matrix:`, `bins:` (head blocks) and the step panels `grid N`, `rows`, `map`, `list`, `card`, `calc`, `cells`, `chips`
are read and laid out by the stage's own block code (`src/core/stage-slanes.ts`, `stage-bins.ts`, `stage-blocks.ts`,
`stage-panels2.ts`, `stage-cells.ts`); this layout only reads them from the model (`grid/legacy.ts`), stacks them
(`grid/place-legacy.ts`) and turns what they draw into primitives (`grid/paint.ts`).

What the front-end hands over (`parse/lower-stage.ts` does):
- `model.layoutWords.grid[]`: a head's entry (`word` matrix | bins, `arg`, `body` = its own indented lines), then one entry per
  setup line it claims (`word` = the first word, `arg` = the rest, `body` = the line's children).
- step facts `{ k: "layout", word, arg, body }` for the panel words, `into`, `beside`, and `show` / `light` of ids the head
  owns; a repeated panel is `keep <word>`, or the bare word with nothing under it.
- Needs `model.layout = "grid"` (a stage that is only a matrix, bins or panels). A scene with lanes and panels is drawn by the
  lanes layout through the old stage (integrator's decision), so it never reaches this path.

What it gives:
- one `Placed`: `w` the drawing width, `h` as tall as the tallest step (the still rule); `decor(step)` the primitives that show
  in that step (keys stable across steps: `h<head>:<n>` and `p<step>.<panel>:<n>`); `at(step)` the rect of every card, bin
  or binned thing that is a model thing; `draw` returns `[]` for those (the layout drew them), so the engine adds nothing.
- Primitives keep the old paints as a role, a tone and two classes: `gf-<fill>` (soft, plane, surface, surface-2, none) and
  `ge-<edge>`, with the old class (`stg-mcell`, `scn-frame`, `stg-sel` ...). `g-hot`, `g-dim`, `g-strike`, `g-thick` carry state.
- `step()` reports the refusals of these words once per model; `llm()` gives each block's facts (`Setup: ...`, `Step k: ...`).

The layout says `words: "own"`: each step's `note:`, formula (`=`) and `foot:` lines are drawn by it, in a band under that step's own
panels (the stage's `stepBand`, `grid/notes.ts`), and the region keeps their room. Width: `input.avail ?? ctx.width`.

Not done here: a panel region sharing the free column of a time block (the time layout draws its own inset); lanes and panels
mixed in one scene (the lanes layout draws those through the old stage).

## 2. The native grid (format 12)

`layout: grid` on the stage or a `[grid]` container (`cols=N` in its keys; else as many as fit).
- Regions are rows (`## Row`); a row's things are its cells, one column width each. A phone: the row's title over its cells, two per line.
- A thing that is itself a `[grid]` container (a bin) is a framed cell: title, a count of what is in it now (worked out from the states)
  and its members in their own grid. `x in bin2` slides `x` between slots; a member has a slot in every container it ever sits in,
  so nothing else moves. A cell is as tall as the tallest wording of the story.
