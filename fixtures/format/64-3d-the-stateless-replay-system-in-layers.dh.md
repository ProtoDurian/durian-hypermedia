---
title: "3D: the stateless replay system in layers"
description: A fixture made from the Format page section of the same name.
---

## 3D: the stateless replay system in layers

Format version 5 adds **layers**. `layer co "coordinator"` declares one (the first is the top), and `layer=co` puts a thing on it; a thing without `layer=` sits on its container's layer. `split layers` pulls the layers apart, `stack layers` puts them back, and `focus tc` flies the camera to one layer while the others fade. A fence written `` ```animation 3d `` opens the scene in 3D; the **2D/3D** button on every stage switches and keeps the step. In 3D: drag to turn; right-drag, Shift + drag or two fingers to move; the wheel, a pinch or + and − to zoom; once you click the stage, the arrow keys and W A S D move too. Click a thing for its note or a layer to zoom into it; the reset button puts the camera back. Here, one call goes down from the CLI to the template container and the answer comes back up.

```animation 3d
layer you "your machine"
layer co "coordinator"
layer tc "template container"
layer reg "registry"
family you "CLI"
family co "coordinator"
family tc "template container"
family reg "registry"
group cli "CLI" layer=you layout=column is=you
text a0 "no answers yet" in cli tone=muted
box coord "coordinator" layer=co is=co note="starts templates in Docker and forwards each call"
group box1 "template container" layer=tc layout=column is=tc note="runs the script; keeps nothing"
text t0 "keeps nothing" in box1 tone=muted
cylinder img "template image" layer=reg is=reg
cli -> coord -> box1
img --> coord
@step Four layers: your CLI, the coordinator, the template container, and the registry.
split layers
@step First the coordinator pulls the template's image.
send arrow "image" img -> coord
@step It starts the template container from it.
send arrow "start" coord -> box1
@step Init call 1 goes down: the CLI calls the coordinator. It carries no answers.
send arrow "init 1 · no answers" cli -> coord
@step The coordinator forwards the call to the template container.
send arrow "init 1" coord -> box1
@step The script makes project id A and stops at its first unanswered question.
add pill p1 "project-id A" in box1 tone=acc
say box1: no answer for name
@step The question and the state go back up. The container keeps nothing.
send arrow "question: name · state: A" box1 -> coord
remove p1
@step The coordinator hands them to the CLI.
send arrow "question · state A" coord -> cli
@step The container's layer alone: no answer, no session, no paused script.
focus tc
@step You type hello-app. The CLI keeps it, and project id A.
focus all
remove a0
add pill a1 "name = hello-app" in cli tone=good
add pill a2 "project-id A" in cli tone=acc
@step Call 2 carries both down to the coordinator.
send arrow "init 2 · name, A" cli -> coord
@step It forwards call 2. The script runs again from line 1, past the name.
send arrow "init 2" coord -> box1
@step Every call goes down and back this way. Only the CLI holds the answers.
stack layers
highlight cli
```

:::llm
Animation, 13 steps, 3D (2D flat on a phone or with no WebGL). Four layers: your CLI (a note "no answers yet"), the coordinator, the template container (keeps nothing), and the registry (the template image).

1. to 3. The layers split apart. The coordinator pulls the image from the registry and starts the template container from it.
4. to 6. Init call 1 goes down from the CLI through the coordinator to the container, with no answers. The script makes project id A and stops at its first unanswered question, "name".
7. to 9. The question and the state go back up to the CLI. The container keeps nothing: its layer alone shows no answer, no session, no paused script.
10. to 12. The CLI keeps "name = hello-app" and project id A, and sends call 2 with both down. The script runs again from line 1, past the name.
13. The layers stack back: only the CLI holds the answers.
:::
