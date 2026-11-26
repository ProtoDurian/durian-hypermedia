# Graph and free layouts

Graph lays things in ranks along every relation the story ever uses. Ranks run left to right, or top to bottom
with `dir=down`. Cycles are cut for ranking, then two neighbour sweeps reduce crossings. Both the whole relation
set and each member's largest size are kept for all steps: showing or hiding a thing does not shift the rest.
An explicit move changes which container draws a member; both homes reserve its space for the story.

Free retains the existing `pos=x,y` grid: one grid unit is 40 drawing units. Negative coordinates keep their
relative spacing and are shifted into the plan's bounds. Things without a position follow the existing row rule.

Nested graph-engine groups keep their row, column and grid arrangements. The parser lowers them to the graph
family with `keys["legacy-layout"]` (or the stage's `fence["legacy-layout"]`), plus `cols` for a grid. These groups
are distinct from a composed-stage grid or matrix. Each child's plan includes its title band and padding; the
pipeline recursively places it at the container's outer origin.
Data and tree containers draw their headings and counts through their own layout's decor. The graph parent's draw
hook supplies their frame and state chip, leaving out the generic container title so it is never drawn twice.

On a phone, graph ranks run down the page and a top-level row stacks. A column whose relations leave its group
turns into a row so those lines can leave side by side. Still/static phone graphs split a broad rank into rows;
the reserved line channel is counted when choosing where to wrap.
On a laptop, a live graph also takes its downward plan when its wide plan would cut words at the least readable
scale and its downward plan fits. This preserves the existing `cutAt`/`laptopKey` choice at the actual stage width.

Graph-engine input keeps its source in `model.fence["graph-src"]`. The adapter calls the existing graph engine's
layout and slot code once per model/width, preserving its measured phone choices, shared slots and special
routes. A setup frame joins the same sizing pass as all authored steps. Shifted container headings keep the
position chosen for the whole story so routes avoid them. Format 12 models use the extracted ranking and leaf
measurement code. Other relations use the common renderer's router.

Checks: the focused tests cover stable ranks and sizes, descendant relations, cycles, group layouts, phone rank
wrapping and free placement. All 20 assigned fixture files also compare member geometry at 1280 and 390 and draw
every compiled pipeline frame. The browser wrapper in `test/engine/graph/run-match.ts` forces the new engine on
both server and client, waiting for each step's motion duration before measuring. Shared renderer fixes are
still needed before the actual side-by-side browser check passes; geometry checks alone do not imply acceptance.

## render2: format 12 graph scenes take the graph engine's layout (raise.ts is a geometry adapter)

`raise.ts` is a geometry adapter: the graph engine places, the model decides what shows. A format 12 scene in the graph family is written back in the graph engine's own words (`graph/raise.ts`: the things
where each step shows them, the lines, the sizes and the words lines carry) and laid out by `legacy.ts`, as the old form
of the same scene is. So a migrated block sits exactly where its old form sits, at 1280 and at 390: rows of groups, the
phone's own form, the slots the lines take. The page review found the rank layout cut at 390 (service mesh, kube-proxy,
colour families, sharding, eight colours, splits and merges) and lines through pills (pods, nodes, a service).
Not raised (the rank layout above is used): charts, regions, scenes inside the scene, a layout's own words other than
`set`, card lines, state chips (`is`) and replaced lines (the graph engine sizes a box by its title), `pos=`, and any
scene whose raised words the graph engine refuses. A line drawn only for the step that sends along it is the graph
engine's send (no connector); a line that first shows with words carries them as its label, so room is kept for them.
Tests: `test/engine/graph/raise.test.ts` (19 fixtures sit exactly where their old form does, 7 more within the room
the old send kinds took); `layout.test.ts` switches raise12On off to test the rank layout itself.
