# Lanes layout: notes for SPEC.md and CHANGELOG.md (integrator)

## Cards draw from the Model (review M1, item 1)

- The composed stage's compile and layout (`src/core/stage*.ts`) are called for **geometry only**: the lanes' places,
  each card's rect at each step (the still rule, the phone's stacking), where a card's parts sit inside it (record rows,
  token chips, pill slots, badges, the strip kept above a card for its state chip), and the lines in the lane gaps with
  their words' chips.
- What a card shows comes from the Model and the core's states (`lanes/cards.ts`, drawn through `thingPrims`):
  - title: `Thing.title`, or a step's `title` (a layout fact);
  - lines: `ThingState.text`, else `Thing.lines` (a line's own style marks `* `, `** `, `= `, `. `, `~ `, `> `, `(tone) `
    are taken off; the words stay);
  - state: `ThingState.is` (`tag` and a card's state word both lower to `is`; it replaces, never stacks). A tag (the
    stage keeps a strip above the card) is a chip on that strip; a state word (`[+ open]`) is small bold words at the
    card's top right in its tone (good unless a `state-tone` fact or, for the setup, `Thing.keys.stateTone` says
    another; not written when gone);
  - a line's marks give it its look (`* ` the card's colour, `= ` / `. ` body size, `** ` headline, `(tone) `, `> `
    indent): one text per drawn line (`t:id:lines`, `t:id:lines:1` ...);
  - a tone paints the whole card (its role colour gives way); a lit card is the stage's thick border, its box
    `eng-noring` (the renderer adds no ring; svg.tsx);
  - tone, dim, shape and flags (`[cylinder]` draws a cylinder in a lanes card), dashed (a step's `dashed`), crossed out
    (`cross`, `cross ... corner`);
  - pills: things; each sits in the slot of the card `ThingState.at` names (a moved pill keeps its key and glides);
  - token chips (`tokens:`) and record keys (`keys:`) from `Thing.keys`; their tones (`mark`, that step only) and values
    (`fill`, from their step on) from the step's layout facts (`lanes/words.ts`);
  - badges from `Thing.keys.badges`;
  - lit cards: the stage's rule, read from the Model's `light`, `rel` and `show` facts.
- The decor keeps only the lanes' own drawing: regions, headings, `...` lines, keys, notes, says, line words, head blocks.
  None of the stage's card items is drawn (test: `test/engine/lanes/model-words.test.ts`, every frame of 36 lanes fences
  at 1280 and 390).
- A phone keeps the stage's form for lines every card of a lane shares: written once under the lane heading
  (`each: ...`), not in each card.

## Adapter: stage chart blocks the chart system cannot draw whole

- `chartDraws` (lanes.ts): a stage chart block (`bars`, `columns`, `units`) goes to the chart system only when it
  uses no setup word but `axis`, `every`, `total`, `badges`, `text`, and no step word of its own block
  (`peak`, `heading`, `big`, `limit`, `move`, `card`, `keep` ...). Otherwise it stays the stage's own drawing. A block
  lowered with `opts.stage = "bars"` (eng-stagebars: the chart system draws the stage's bars whole) always goes to the
  chart system; `max` (a column block's scale over the story) is allowed.
  Today that is stage 22 (bars: tabs, readouts, busiest and cap lines, move arrows), gt 09 (bars with a `line`: the chart system put its words outside the part at 390) and stage 14 and 38 (units with
  `card` / `keep`). Remove when the chart system draws those words.

## Drawing order and lit borders (pipeline.ts, svg.tsx, blocks.css: marked eng-lanes2)

- `eng-top` (types.ts Prim): drawn after the lines. Lanes marks every chip of its own words (a line's words, a say, an
  `inside` chip, every line of them) and the state chip, so a chip on a card or a line is never under it.
- `stg-w-hot` (lanes/items.ts, sheet/items.ts): a lit frame or chip; the renderer leaves its width to blocks.css, which
  draws the stage's lit box (3.2 px, its shadow; 4 4 dashes when dashed).
- A wrap scene's step notes (sheet/notes.ts, the stage's stepBand): a strip under the last part that draws in that step;
  `words: "own"` only when the scene has no says and no relations. Sheet and track notes stay in the caption.

## Lines a pair and its reverse share

- The stage draws one line for a pair and its reverse (gt 05: `bc -> oc`, later `oc -> bc`). `routes()` gives the later
  relation that line run backwards, so what it carries travels from its own source.
- `pipeline.ts` (marked eng-lanes2): a relation whose layout route has the same two ends as one already drawn in the
  step is an `eng-shared` prim; `engine.css` takes its stroke off (the line is drawn once; the match counted its
  crossings twice), its arrowhead and its send dot stay. Seen in gt 05, and gt 02, 03, 10, 11 at 390.

## Format 12 on lanes (review M1 1.1, row 2)

- `printStage` (`lanes/stage-src.ts`) now feeds the stage's geometry only, so nothing it cannot say is lost:
  flags keep their shape (a taller shape gets the room it needs), `is -` clears the chip, `-x` and `~>` stay lost and
  streamed (the renderer plays them from the core's events), tokens and pointers are not cards (they sit at the thing the
  core says, and move with it), values get a line of room.
- `ids in container` for a card is refused by `printStage` ("a card keeps its place in its lane"), through
  `ctx.problem`, which reaches the doccheck since 9da3a37; core already refuses `in` on a thing that is not a container.

## Changelog line (Unreleased)

- Lanes cards (the composed stage's 53 fences) draw from the one engine's Model and states; the old stage gives only
  their places. Format 12 on a lanes layout keeps flags, `is -`, `-x` and `~>`.

## Open

- `Thing.keys.tokens` and `keys.keys` are comma-joined by parse/lower-stage.ts; a token may end in a comma
  (`flour,`), so `lanes/words.ts` splits on a comma not followed by another. A JSON list (parse lane) would remove the
  guess; both forms are read.
- `keep mark` (a token mark that lasts) is not carried by lower-stage's `mark` fact; every mark is one step.
- A tag's own role (`tag id (role): words`) is not carried by lower-stage's `is` fact; the chip takes the card's role.
- The letter chip before a title (`+ (a)`) lowers to `is`, so it draws as a state word.
- Left to the polish lane: timeline rows at 390 (stage 13, layers 4), the shorter stage window at 390 (layers 2, 3, stage 15).
  The red strike line and the units squares are done (render/POLISH-NOTES.md).

## render2: a line's words never cover a card's title

The composed stage puts a line's words inside its target, just past the arrowhead, when it finds no room on the line;
it also keeps an earlier step's words in a gap as taken for every step that line shows. So replies sat on the card's
title (gt 10's "201 pending", gt 05's DNS question, gt 02's ACK, gt 03's GET). `lanes/chips.ts` moves such a chip (and
one cut off under the stage) onto its own line in the gap, else just over or under the card it covered, where it covers
no card (a card that holds others: its heading, down to the first card it holds), no other chip and none of the
stage's words in its steps; with no such place it stays. Over the lanes fixtures at the stage widths of a 1280 page and
a 390 phone: 61 chips over a card before, 1 after (example-layers #8). Test: `test/engine/lanes/chips.test.ts`.
