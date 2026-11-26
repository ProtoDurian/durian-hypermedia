# Match harness (`scripts/match.ts`)

The measuring stick for the one-engine rewrite: it draws every animation and chart fence of `fixtures/` alone on a page,
at 1280 and 390 px, shoots every step and measures what is drawn. It reads the page and changes nothing in the package.

## Run
```
bun scripts/match.ts --out <run folder>                    # all 152 fences, both widths
bun scripts/match.ts --only 'format/4*' --width 390        # a glob over the fence id; one width
bun scripts/match.ts --jobs 4                              # Chrome at once (default 3, never more than 4)
bun scripts/match.ts --settle 2500                         # wait after each step, in milliseconds
bun scripts/match.ts --engine new --settle 2500            # force the one engine (src/engine) on the server page and the client; default old
bun scripts/match.ts --scheme dark                         # Chrome with prefers-color-scheme: dark (default light)
bun scripts/gate-run.ts --pair light=<new run>,<baseline run> --out GATE-RUN.md   # new run against baseline: worst first, by lane owner
bun scripts/match.ts --compare <baseline run> <new run>    # writes compare.md and compare.json into the new run
```
Fence ids are `<file under fixtures/>#<n>` (n counts the file's animation and chart fences). The 22 generality scenes
live in `fixtures/gt/` (12) and `fixtures/gt/tweaked/` (10). `--only` takes `*` (also across `/`), `?` and `{a,b}`; a plain
word means `*word*`. Each Chrome gets a fresh profile (scripts/cdp.ts) that is deleted when it closes (every 30 fences and at the end).
A run takes about 10 minutes at 3 jobs. `--settle` sets the wait after each step for motion to finish; it overrides
`MATCH_SETTLE_MS` and defaults to 850. The new engine needs at least 2500, and more for slow steps or several beats:
with `--engine new` each step also waits for `stepMs` of that step (the engine's own motion time) plus 120 ms when that is longer.
`--engine new` forces the engine on both sides, the server page (`DhDocument engine: "new"`) and the client (a build plugin adds
`engine: "new"` to the example client's props; the checked-in client is not changed), (`test/engine/graph/run-match.ts` is now only a short name for `match.ts --engine new`).
The default `old` measures what a page draws today. The report's `meta` says which engine and scheme a run used.
`scripts/gate-run.ts` sets a new run against a baseline (the old engine at the same scheme): a fence is worse when a check's
total over its steps, at a width, is higher than the baseline's. It names the lane that owns each fence, lists fences drawn
as an error box, and counts the layout warnings of `src/engine/core/check-layout.ts` (small words, crossing lines, things
that should stay still, overlaps) over the same fences.

## What a run writes
- `report.json`: per fence, per width, per step (chart: per control state): the check counts, the screenshot path, a few samples.
- `summary.md`: counts per check, fences that did not run clean, worst fences first (tables of at most 4 columns).
- `shots/<fence>/<width>/NN.png`: one screenshot of the part per step. `sheets/<fence>-<width>.png`: the contact sheet (steps side by side).
- `llm/<fence>.txt`: the fence's LLM view (`llmView()`). `site/`: the pages that were drawn.

## The checks (every one a count; 0 is clean)
| Check | What |
| --- | --- |
| overlap | words (svg text) whose boxes overlap by more than 2 x 3 px |
| labels | `label-check.ts`'s probe, run unchanged: drawn words overlapping (svg and canvas) |
| small | `part-check.ts`'s probe, run unchanged: words under 11 px on screen (chart canvas words too) |
| outside, ellipsis, sideways | words outside the part's box; words cut with an ellipsis; the page scrolls sideways |
| crossings | pairs of connector lines (stroked paths) that cross away from their ends; animations only |
| moved | words that were in the step before and sit more than 3 px elsewhere now (a stand-in for "things that should stay still": it also counts things that are meant to move, so judge it against the baseline) |
| errors | script errors and console errors (a React hydration warning counts) |

`label-check.ts` and `part-check.ts` are scripts, not modules: the harness reads their probe text out of the file and runs it,
so a fix there reaches the harness. If a probe cannot be found, that check stays 0 (the run says nothing; check the script's shape).
The graph engine's own pure checks (`crossWarnings` and `overlaps` and `minFont` in `src/core/scene.ts`, and `check()` problems) are
read per fence into `report.json` (`core`, `problems`) when the build still has them; a build without them reports nothing.
Chart control states are set one after another on the same page (steps; first and last option of each select; min and max of each slider;
each switch and button), so a later state starts from the one before.

## Compare
`--compare <baseline> <new>` lists, per fence and worst first: checks that went up (step by step), LLM-view lines that were lost or gained,
and a pixel score per step (the share of pixels that differ by more than 24 of 255; a picture of another size counts its extra area).
A rewrite lane must keep every check at or under the baseline and explain every LLM-view change and every step above about 0.1%.
