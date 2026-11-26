# blocks2: timeline, sheet, wrap, track and the grid's ported words draw from the Model

For the integrator (SPEC.md and CHANGELOG.md are brant's). Code: `layouts/parts.ts`, `layouts/block-parts.ts`, and the five
layouts (`time.ts`, `sheet.ts`, `grid.ts`). Tests: `test/engine/blocks2/`.

## What changed
1. **A part is a Model thing.** The old blocks still MEASURE (their `layout()` gives items with a window: `from`, `to`, `on`, `hot`,
   `dim`). Items with one window are one part. The front ends (`lowerStage`, `parse12`, last line, `blockParts(model)`) make
   one Model thing per part (`flags: ["part"]`, id `<layout>-<n>`, `keys.sig` = the window) and write its life into the steps as
   facts: `show` / `hide` when its window opens and closes, `dim` when it fades, `light` when it is lit. Windows are read at a
   wide (1280) and a phone (390) drawing, so both forms have their parts.
2. **The StepState decides.** `decor(step)` draws an item only when its part is visible in `states[step]`, faded when the state
   says dim, lit when the step's `light` fact names it. If a Model fact changes (a `hide` on a part) the drawing follows. A
   bare test with no states, or a width whose window no part has, falls back to the block's own window (the match tests show
   both give identical frames on every fixture).
3. **Rects are real.** `Placed.at(step)` gives every visible part the union of what its items cover (still for the whole story),
   so `core.diff` marks it touched and the auto camera frames what a step shows. `draw` returns `[]` for parts (decor draws them).
4. **Width.** The three layouts honour `input.avail` (a timeline or worksheet inside a container is as wide as it is given).
5. **Fonts.** The layouts measure at the phone's sizes through `render/font.ts` `atSizes`; nothing sets the global flag.
6. **Never named to a reader.** `core/llm.ts` and `core/check.ts` skip things flagged `part` (marked `// eng-blocks2`);
   `print12` leaves them out and `parse12` makes them again.

## Still an adapter (named)
- **Format-12 FOLD of the 57 time words.** Format 12 on `timeline` still takes the old spellings, handed over verbatim to the
  time block (as format 11). The DESIGN section 4 fold (about 10 words; chart system for `plot:` `ticks:` `zoom` ...) is NOT done.
  Likewise the grid's `matrix:` `bins:` `grid N` words and the sheet/wrap/track words stay as written (sheet/wrap/track already
  have the thing form for containers, `sheet/things.ts`).
- **A part is a window, not a meaning.** The things are "what appears in step 2", not "the marker at 6". The block still decides
  where and what an item is; the Model decides when. A step that only changes words inside an item (a time marker's text) is
  a different window only if the block gave it one.
- **Chart things lowered from a block head** (`units`, `bars`, `columns` in a time or grid scene) keep no rect: the block draws
  them, and a rect would make the chart system draw them again.
- **Scenes with no steps** (static blocks) have no parts: nothing to say in facts; they draw by their own window.
- Containers laid out by these layouts inside another layout (format 12 `[sheet]`, `[wrap]`, `[track]` with children) keep
  the child things' own rects; their drawing windows are not parts yet.
