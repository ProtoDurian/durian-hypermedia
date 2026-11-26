# render3: the 2D items the showcase page review found outside graph scenes (for SPEC.md and CHANGELOG.md, which the integrator writes)

Every edit is marked `render3`.

1. **Two lines that say the same words keep a label each** (`lanes/stage-src.ts` joinRels, `parse/print12.ts` oneLine): the
   lanes layout joined `a -> m: 30 crates` and `b -> m: 30 crates` into one bundle, so stage 18 showed one label. Only
   relations written on one source line (`m -> s, t: 12 each`) are joined; `dh migrate` writes such a line on one line
   again. Test: `test/engine/lanes/one-label-each.test.ts`.
2. **A format 12 graph scene on a page of many roles is raised** (`graph/raise.ts`): it named a family for every role of
   the page; the graph engine names at most 8, so on a page with more roles every raised scene was refused and ranked
   instead. Only the roles its things and lines use are named. Test: `test/engine/graph/many-roles.test.ts`.
3. **A cell keeps its own tone and dim** (`data/kit.ts` partLooks, `data.ts`): `tone a.3 good` (`set a.3 tone=good`) was
   dropped, as a part has no state. The data layout reads the facts that name its cells; they hold from their step on,
   by slot. Test: `test/engine/data/cell-tones.test.ts`.
4. **A rows panel keeps its columns over the story** (`core/stage-blocks.ts` rowsNeed and `Rows.keep`, set only by the
   lanes layout in `lanes.ts` keepColumns; the old engine is unchanged): every panel with the same head line gets the
   widest each column needs in any step, so a step that adds words to one column moves no column (example-layers 9).
   Test: `test/engine/lanes/keep-columns.test.ts`.
5. **An inset's range reads as a range** (`time/prims.ts` rangeWords): `Close-up (24–36)`, not `24..36` (read as 24.36).
   Test: `test/engine/time/range-words.test.ts`.
6. **A send whose words become an item draws them once** (`core/diff.ts` becomesItem): `send "seg 1" app -> buf as s1`
   showed "seg 1" on the line and in the buffer at once. Test: `test/engine/core/becomes-item.test.ts`.
7. **A token or a pointer may sit at a cell** (`core/states.ts` isCell): `i at a.2` was dropped, so the pointer was drawn
   apart from the array. The data layout gives each cell a rect; the pointer is drawn over it.
   Test: `test/engine/data/pointer-at-cell.test.ts`.
8. **A raised scene's data structure is as big as the data layout draws it** (`graph/legacy.ts`): an array, list, stack or
   queue (a map already was) gets its drawn size, keeps its middle where the graph engine put it, and its lines leave
   and enter it at that border (a stored route keeps its fanned ports; only an end inside the grown box moves out to its
   border). Test: `test/engine/graph/grown-ports.test.ts`.
9. **Structures beside each other in one group are ranked** (`graph/raise.ts`, `graph.ts`): raised, the graph engine gave them
   slots of its own sizes and they overlapped (format 63); ranked, they sit side by side, and on a phone a row wider than the
   stage is a column. A free group (68) is still raised. Test: `test/engine/graph/group-of-structures.test.ts`.
10. **A lit box in the grid is drawn lit** (`grid/paint.ts`): the stage's thick border and shadow (a bin taking items, a matrix
   cell); the class it had was not styled. Test: `test/engine/grid/lit-bin.test.ts`.

Left: a line a step draws between two items of a map's bucket chain is
drawn by the engine's router next to the chain's own link (two arrowheads); example-layers 9 at 390 (+2 moved, a phone
row wraps when its note is added) and 11 at 1280 (+3, packet fields reflow when their values change).
