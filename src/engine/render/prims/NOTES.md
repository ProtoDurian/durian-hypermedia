# Plain things: how `thingPrims` draws them

`thingPrims(thing, state, rect, look, phone)` draws one plain thing in the rect its layout gave it. The rect is the truth:
nothing is drawn outside it and a box a layout sized is never re-wrapped beyond it.

## Words are fitted to the rect

`prims/fit.ts` wraps the title and the lines at the rect's width less the look's padding, at the stage's sizes (13.5 px
title, 12.5 px body, 12 px lines; 12.5, 11.5 and 11 px on a phone). When they do not fit the height, in this order:

1. the padding gets tighter,
2. the title steps down a size (title, then body, then lines size; the smallest is 11 px on a phone, 12 px elsewhere),
3. the optional lines (a card's lines, a note) take the room that is left and the last one ends in an ellipsis; when not even
   one fits, they are dropped (the model and the LLM view keep them),
4. the title itself ends in an ellipsis.

The title never shrinks only to make room for the optional lines. A gap of 3 px sits between the title and its lines. The
stage measures medium-weight type (title, lane) about 8% wider than the browser draws it, so a title is wrapped at its width
less that (`fit.ts`, `MEDIUM`).

## What each shape draws

| Shape | Words |
| --- | --- |
| box | left from the top (stage look), centred (classic look) |
| pill, circle, diamond, cloud | centred in the room inside the shape |
| cylinder | centred, under the lid |
| person | centred, under the icon |
| text | its words only, as many lines as the rect holds |
| dot | a circle with its words under it |
| token, ref | a chip just under what it sits at; a pointer label above it with a short arrow |

A container draws its title as a heading (none for array, list, stack, queue, map and tree: their layout draws it). The state
chip (`is`) sits on the top edge at the right and moves up when the title's first line reaches under it. One key per thing,
so a new state replaces the old.

## Keys a step sets (`ThingState.keys` over `Thing.keys`)

| Key | Drawn as |
| --- | --- |
| `down=yes` | tone bad, dimmed, a cross inset 6 px (`t:<id>:x`, class `eng-down`) |
| `level=N` | a meter along the bottom: track and fill (`t:<id>:meter`, `t:<id>:meter-fill`, class `eng-meter`); 12 px reserved under the words |
| `fill=none` | the border only (a rect with no fill) for a box or pill |

## Classes (CSS is in `render/engine.css`)

`eng-dim` is on every primitive of a dimmed or down thing; `eng-token`, `eng-ref`, `eng-state`, `eng-bare`, `eng-down`,
`eng-meter` name the parts.

## Known limits

- Says (the speech bubbles) and line labels are drawn by the renderer from the step's events, not here.
- Several tokens at one thing sit on top of each other: the pipeline gives each token a copy of the rect it sits at.
- The full text of a cut title is kept in the model only; a primitive has no tooltip field.
- `test/engine/prims/audit.ts` is a headless check of words against rects and each other (`bun test/engine/prims/audit.ts [--list] [fence words]`).
