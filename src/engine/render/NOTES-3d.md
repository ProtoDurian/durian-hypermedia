# 3D on the one engine: notes for SPEC.md and CHANGELOG.md (the integrator folds these in)

Files: `render/three.ts` (the feed: Plan + StepState + Motion -> the old stage's View3), `render/three-host.tsx`
(React host, lazy import), `layouts/layers.ts` (2D bands; the floor plan 3D stands on), `src/ui/anim3d.ts` (the old
stage, opt-in fields on View3 only: `pillsOnLine`, `fitStack`, edge/send `poly`; the old feed sets none).

## What a reader gets (SPEC 6.9, 6.11, 6.13)
- `3d` and `3d only` fences draw in 3D on the page where the browser has WebGL (3D only with reduced motion: still
  frames); the server, a browser without WebGL, and a static page draw 2D. A `2D`/`3D` button switches (not for `3d only`).
- Each step frames what it touches; a close-up that spans half the layers or more is the whole stack; a scene inside the
  scene is framed whole; `camera <ids>` frames exactly those; `focus <layer>` fades every other layer (eased with the step).
- A step line's words and a packet's chip stay on their line (never moved more than about 40 px, never off it);
  lines between two things on one layer run where the 2D router drew them.
- `set id down=yes` draws the cross, `set id level=N` the meter (0 to 100, eased).
- A token that lands later among tokens already in a container keeps a faint cube with a ring on its place ("bytes
  from 1001 are missing", format 69 step 9).
- On a wide stage a stack of three layers or more is pulled in (60% of the usual gap between layers), so a tall stack fills the stage better.
- 3dframe: a framed shot keeps its labels whole and never fills the stage (close 78%, look 70%, whole 90%), a send's two ends are in the shot an author framed, a focused plane is seen from at least 0.55 rad up, and what a step touches is checked in the shot the stage draws.
- An author's `zoom into` / `camera <ids>` close-up hides what lies outside it (what holds the framed thing stays); on a phone the camera shows the whole stage unless the author framed something; zooming out to nothing shows the whole stage.

## Not done
- Line ends and tags (`ends=`): the Model has no field for them (types.ts is frozen); they need a Relation field first.
- Hold frames (the old stage's held views, `core/calm.ts`): the new Plan has no held span; the camera is per step.

## Labels sit still (eng-3d3)
- A small label (a step line's words, a packet's chip, a token's chip, speech) picks its step aside once per step, at rest (camera arrived, step over),
  and keeps it; while things move it rides with its thing and never re-picks (format 68 at 390 step 4: the seg chips turned 6-10 times).
  A layer's name works out its row from where the camera will rest, holds it while the step plays and eases to the new one when it ends
  (format 68 at 1280: "one network" hopped 25-42 px). `View3.playing` (set by the feed while a tween is under way) tells the stage.
- Layers together (two or more, no gap, no focus): at rest only the top layer's words and what the step touches show; the lower layers stand under it
  and their words piled on it (format 64 last step, format 73 step 8). The layer names stay.
- In the author's zoom the name of every layer that holds what is framed stays (a name is a fact; format 70 steps 4-5 showed none).
- Speech stays by its speaker: beside it before it climbs three lines.
- The Speed control reaches the 3D move: `ThreeHost` takes the page's `speed`, `mount3d` reads it at each step, and the tween is 760 ms divided by it (`tweenMs`); before, only the dwell followed it (test/engine/layers/speed3d.test.ts).
- A chip riding a short step line looks up to 64 px for a spot clear of words when 40 px has none ("read x" covered "L2 cache", format 73 step 3).
- A token's chip: when no spot inside its box is clear, the nearest spot within 40 px of its cube that is clear of words, other cubes and lines (over an outline if it must) is taken (format 68 at 390 steps 4-7: chips stood 57-76 px off their cubes, now 6-31 px).
- A thing whose label reads the same as a layer's name ("L2 cache") is no longer taken for that layer's name by the chip placer (judged by the kept spot, not the text).
- In the author's zoom the layer names stay only when the scene has two or more layers.
- Camera held while a step plays (format 65 step 4): when a step moves no packet or token, the story's camera reads where the things will REST (`hold`), not the tween, so the fit stops following fading things and labels stop riding with it.
- Layers together at rest: `stackHide` replaces the `stacked` part: every thing's name that has a clear spot shows (top layer first); one with none is left out; layer names stay. Fixes the eight unnamed middle boxes in 67 and the 73 unnamed boxes.
- Speech and step-line chips: a speech bubble is placed afresh when shown afresh and takes the nearest clear spot, over a line if it must (format 64 step 6 was 109 px off); of two spots as near, a spot below its anchor is taken before one above, so a name does not cover a figure's head (format 70, 71).
- A leaf's name keeps off every outline but its own and its parent's (format 71 people on a slab).
- Chips never lie on a word (format 68 at 390): a chip's spot is kept for the step, but if, with the step over and the camera arrived, it lies on a word that has settled since, it is picked afresh; the last-resort search for a chip's spot reaches 72 px from its cube (clear of words, other cubes and lines).
- Layers together: a layer's name stays on its own row (the placer no longer steps it aside, which left RAM/disk/registers pills stacked at 390); rows are held 6 px in from the stage bottom.
- Known, not mine: at the start of a step the layer names wait about 0.4 s and then hop to the goal rows (format 67 at 390 step 12 "TCP" 75 px, 73 step 8 "L2 cache" 38 px); the stage is relaid out when the caption changes height. Layer names kept on rows can still lie on a thing's name that has no other spot (64 steps 6, 7, 13 at 390).
