# Lane eng-core2: notes for the integrator

Answers review M1 items for the core. Code: `core/gone.ts`, `core/texts.ts`, `page.ts`, `bridge.ts`, `parse/migrate-cli.ts`,
`scripts/migrate.ts`, and small edits in `core/states.ts`, `parse/parse12.ts` (one line), `core/dh-lib.ts`, `core/doccheck.ts`,
`document.ts`, `react/animation.tsx`.

## What changed (SPEC and CHANGELOG should say)

- **`set` in two forms.** `set id k=v` (graph) is the core's; `set box: a => b` (the wrap layout's, the id ends in a colon) is the
  layout's. The 4 fences that failed (`stage/example-layers` #8 #9 #11, `stage/20`) compile.
- **A gone word is refused with its new spelling in format 12** (`core/gone.ts`: `add remove move swap push pop send join highlight
  spotlight tag state hush keep off fill dashed cross mark inside peak limit bars units counts calc chips grid rows map list cells`).
  Also refused: a word of a layout the scene does not use (`unwrap` in a graph), naming the layout. Words of a layout the scene uses
  pass to it as before. Old (format 10/11) blocks are unchanged: an unowned word is a warning, because the lanes adapter reads it from
  the block's own text (`layouts/lanes/stage-src.ts`); making it a refusal would send 13 of 109 fences back to the old engines.
- **The page reads the engine** when the engine draws a block: a format-12 page always; every block with `ParseOptions.engine: "new"`;
  with `"auto"`, the blocks `tryEngine` draws. Default is `ENGINE_DEFAULT` ("new") since 0.8.0; a host that draws with another mode passes it to `parse()`.
  Then `llmView`, `block.texts` / `animationTexts` and `check()` come from `core/llm.ts`, `core/texts.ts` and the core check, and the
  drawing gets `srText` (the LLM view). The doccheck adds `checkLayout` (gate2) as warnings with the step's line, at the page's own
  widths (the page's own plan widths nearest 1000 and 390, TRY_WIDTHS); it runs in `check()` only, never in `parse()` or when the page is drawn.
- **`dh migrate <file> [--write]`**: `migrateCommand(argv, io)` in `parse/migrate-cli.ts`; `bun scripts/migrate.ts <file> [--write]`
  (`bun run migrate`). Prints a unified diff; writes only with `--write`; exit 1 when the old reader refuses a block (names the line),
  2 for wrong arguments. The `dh` tool is not in this package: it calls `migrateCommand` with its own io.
- **Speed.** `tryEngine` plans 971 and 380 (`TRY_WIDTHS`, the page's own plan widths nearest 1000 and 390), not 1000 and 390: the server's
  `EngineStage` plans every width in `SSR_W` + `PRINT_W` anyway, so these two are free. A 190-step lanes story (180 steps is the line cap):
  `tryEngine` + the 13 server plans took 9.65 s, now 8.5 s. What is left is the old stage's layout at each width (about 0.6 s each at 190
  steps), inside `layouts/lanes.ts`; the 13 server plans are `render/svg.tsx`'s. Both need their own lane.

## Left

- The server draws 6 widths and print (`ENG_SSR_W`), and the browser keeps them instead of laying out its own.
- `srText` passed to the drawing is the page's LLM view (`block.llm`), so a host that draws with `engine="new"` but parsed without
  `engine` gets the old view as its text alternative (still a true description).
