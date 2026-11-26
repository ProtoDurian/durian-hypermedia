# phonecam: a scene wider than the stage shrinks to fit (for SPEC.md 6.8 and CHANGELOG.md, which the integrator writes)

Every edit is marked `phonecam`.

- **What:** when a scene's things (over the whole story) are wider than the stage at natural size, the story camera
  frames them whole, shrunk, as the old camera did (`core/readable.ts` leastScale): down to the scale where a step's
  smallest words are 11 px on the screen (never under 0.8 on a phone, 0.65 on a laptop). Only when they do not fit at
  that scale is the step a natural-size window with shaded edges, as before.
- **The step's smallest words** (`minWordPx` in `svg.tsx`): its things' words and chips, its lines' words (a line's own
  label, or what a send carries) and its speech, at the sizes `fontStyle` gives (a phone: title and lane 12.5, body
  11.5, sub and chip 11). So on a phone a step with words on a line cannot shrink; a step with only cards can, to 0.957.
- **One frame per scene:** a scene shrinks only when every one of its steps fits that way, and then all its steps share
  one frame (the narrowest of theirs). Shrinking only the steps that fit zoomed in and out between steps (format 55 at
  390: 9 words moved on 3 of 6 steps in the match run), so a scene where some steps do not fit keeps the natural-size
  window on every step.
- **The stage's width on the screen** (`cameraOf(c, plan, step, px)`): the live stage passes its measured width, so the
  11 px is on the screen. With no width (the server's HTML, tests) it is the plan's width: words are then a little
  larger than 11 px, never smaller.
- **No shade for a cut border** (`BORDER_CUT`, 6 px a side): the story already frames things up to 12 px wider than the
  stage, centred, cutting only outer borders (never words); such a view no longer shades its edges with arrows (format
  55's cards, 358 wide on a 356 stage, looked cut). A larger cut is shaded as before.
- On this base (ba558e0) only `format/55` changes, at 390: no shaded edge, nothing cut but a 1 px border, the same
  frame on every step. At a 380 or wider stage it shrinks whole. 51, 53 and 66 already fit after render2. 1280 is
  unchanged for every fence (cameras and shading checked on all 109 fixture fences at plan widths 326 to 1178).
- Test: `test/engine/render/phonecam.test.ts`.
