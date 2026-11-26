# core/check-layout.ts (lane gate2)

Layout-quality checks on the **plan** (what the layouts drew), run at 1000 and 390 px. `check.ts` reads the source and
the states; this reads primitives. Every finding is a doccheck **warning** with the step's line.

| Finding | Rule | Ported from |
| --- | --- | --- |
| small | words drawn under 11 px on the screen (font size x how much the stage is shrunk to its box) | `core/scene.ts` `minFont`, `MIN_PX` |
| cross | two relation lines cross away from the thing they share | `core/scene.ts` `crossWarnings`, `core/route.ts` `meet` |
| moved | a thing the step does not move (`in`, `at`, enter, exit) sits elsewhere than in the step before | the "nothing untouched moves" rule of `scripts/match.ts` |
| overlap | words over words (more than 2 x 3 px); a token or pointer over a shape it does not sit at | `core/scene.ts` `overlaps`, the harness's `overlap` |

- `layoutFindings(compiled)` gives every finding with its step and width; `checkLayout(compiled)` gives `Problem[]`
  (`warn: true`), one per step and finding, "at 1000 and 390 px" when both widths say the same.
- A finding that repeats in the next step is said once. Nothing is refused.
- Not wired into `compile().problems` (that is `pipeline.ts`, the integrator's): the host that wants the warnings (doccheck,
  `dh check`) calls `checkLayout(compiled)` after `tryEngine`. Planning two widths costs about what `tryEngine` already
  spends (the pipeline caches the plans).
- Not covered: a line's own words (the renderer places them), 3D depth, the shaded edges of a zoomed camera.
