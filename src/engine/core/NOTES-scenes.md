# Lane eng-scenes: notes for the integrator

A scene inside a scene (SPEC 6.12) on the one engine. Code: `core/scenes.ts` (new), the parts marked `eng-scenes`
in `core/states.ts`, `core/diff.ts`, `core/check.ts`, `core/llm.ts`, `pipeline.ts` and `parse/lower-graph.ts`
(`lowerScene` only, agreed with brant).

## What the engine does now

- **Parse:** a step's ops are lowered by the lowerer of the scene the story is in, so what a step inside a scene
  makes (split pieces, a merge, a new line) is a thing of that scene's model, not the overview's. The facts stay in
  the story's `model.steps`.
- **States:** `scenePath(model)` reads, once, the scenes the story is in at each step. A step's facts belong to the
  scene on top of the path, and only to it. Each scene is replayed on its own over the whole story (`sceneModel`:
  the scene's model with the story's steps, keeping only its own facts), so every scene keeps its own size for the
  whole story and is frozen while the story is elsewhere. `StepState.scene` is the scene after the step (an enter
  step already shows the scene's setup, a leave step the scene gone back to); `StepState.inner[id]` is every
  scene's own state at that step. Scenes are flat in `inner` (a scene two deep is keyed by its id too).
- **Diff:** a step inside a scene diffs that scene's states (in its model) and sets `Motion.scene`. An enter or
  leave step changes no thing; `Motion.scene` is the scene entered or left. A leave step touches the thing the scene
  was entered from, with the tokens and pointers at it, so the camera frames "where we left it".
- **Plan:** `plan.scene(id)` is the scene's own plan (its own `w`/`h`). `plan.frame/rects/focus/caption(step)` are
  the scene's when `states[step].scene` is set, in the scene's own coordinates; `plan.w/h` stay the overview's (the
  stage keeps one size; the renderer frames the scene into it).
- **Doccheck:** the SPEC 6.12 refusals that read the steps, with their lines: entering an undeclared scene (it lists
  them), entering from a thing not on the stage of the scene the story is in, a visit with fewer than 2 steps of its
  own, `leave` in the overview, `leave <id>` for a scene the story is not in, a story that ends inside a scene, a
  scene never entered, any other change in a step that enters or leaves, entering a scene the story is already in,
  going deeper than 2, one id in two scenes, the ids `all` and `overview`. Declared twice, no `end`, an unknown key,
  `end` with no scene open and `scene`/`end` under a `@step` are refused by the old parser (src/core/scenes.ts
  `splitScenes`), as before. A step inside a scene is checked against that scene's own things (an overview id there
  is "no thing ... on the stage").
- **LLM view:** the first line names the scenes (`with 1 scene inside it (up "TCP, up close"): steps in a scene are
  indented under the step that enters it`); the step that enters says `enters scene <id> "<label>" from <thing>.
  Starts with: ...`; the scene's steps are indented under it (three spaces per level); the step that leaves is back
  at the outer level with `leaves scene <id>: back to the overview|scene <id>, as it was, at <thing>`.
- Also fixed in the LLM view: a step whose title and caption are the same (every lowered format 10 step) no longer
  prints the caption twice (`Start.: Start.`).

## For SPEC.md / CHANGELOG.md (Unreleased)

- Nothing changes for authors: the words and refusals of SPEC 6.12 are the same. The LLM view reads as SPEC 6.12's
  example, except that what a step does inside the scene is said in the engine's words (`m.1 moves into rcv.`,
  where the old view said `snd -> rcv: seg 1, seg 2`), and a box is named by its kind (`box snd`, not `group snd`).

## Left for others

- **Layers lane (jovany):** the scene's plan
  draws (tested at 1280 and 390 in `test/engine/scenes/scenes.test.ts` through `planAt`). The enter/leave fly-in is
  theirs (3D) and the render lane's (2D): the thing flown into is `scenePath(model).via[k]`.
- **Graph/data lanes:** a format 10 `table` with `row` things draws empty rows (the row's values `from port, 51514`
  are not drawn); not scene-specific. The graph layout's phone form makes scene tcp wider at 390 (548) than at 1280.
- **Render lane:** the caption chip `Inside · <label>`, the band under the slider and "All steps" nested under the
  step that enters read `states[k].scene`, `scenePath(model)` and `sceneLabel(model, id)` from `core/scenes.ts`.
- **parse12 (format 12)** reads `scene id "label" ... end` (setup lines only); it should lower a step's facts the same
  way (things a step makes inside a scene go into that scene's model).
- A layout's own `llm` lines are added for the overview's layouts only, not for a scene's.
