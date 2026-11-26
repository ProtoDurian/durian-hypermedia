# render2: the 2D items the showcase page review found (for SPEC.md and CHANGELOG.md, which the integrator writes)

Every edit is marked `render2`. Wrong in the old form drawn by the one engine, in the migrated format 12 form, or both.

1. **Format 12 graph scenes take the graph engine's layout** (`layouts/graph/raise.ts`, `legacy.ts`): see
   `layouts/graph/NOTES.md`. Service mesh, kube-proxy, colour families, sharding, eight colours, splits and merges, pods,
   the engine, a 2D scene unchanged, the long paths: each sits where its old form does at 1280 and 390.
2. **A line's words never cover a card's title** (`layouts/lanes/chips.ts`): see `layouts/lanes/NOTES.md`.
3. **A step's `beside` reaches the grid layout** (`parse/lower-stage.ts`): a step's panels side by side by shares (a card
   and its counted squares, stage 14) was dropped when an old block was lowered, so `migrate` lost it too; the squares
   stacked under the card. Wide: side by side from one top; a phone: stacked, as the composed stage. Test:
   `test/engine/grid/beside.test.ts`.
4. **A plot's line runs through no point label** (`layouts/time/labels.ts`): the composed stage keeps a point's label off
   other labels and points but not off the line that runs on past the point (stage 08: "Halfway", "Complete"; stage 06).
   A crossed label moves just above or under where it was, to the first place no line crosses and no words are; else it
   stays. `test/engine/time/same-items.test.ts` applies the same rule to the composed stage's items; test:
   `test/engine/time/labels.test.ts`.
5. **A line's words sit on the stage and on no card's tag** (`layouts/lanes/chips.ts`, fmt12's review of gt 05 step 7): a
   chip on a tag strip ("300 s") moves as one on a title does (beside the tag, else over it), and a chip the stage put
   off the stage (the second "198.51.100.20", under it; gt 03 at 800, over it) takes its place first, else slides back
   on. `test/engine/core/page-view.test.ts` now reads its layout warnings from gt 08: gt 10 has none left.
6. **A step's glide never starts from a point** (`render/svg.tsx` `glideFrom`): a step asked for before the stage had
   measured its width (no plan yet: the camera is the 1 x 1 stand-in) glided from that point, so the stage grew from
   nothing over the step (page review: cards inside cards at 390). It starts from the view on screen when there is one,
   else from the step's own frame. Timing-bound in a browser (it showed once in several runs of the page), so the test
   pins the choice: `test/engine/render/glide-from.test.ts`.
7. **A graph scene fills its stage on a wide screen** (`render/fill.ts`, hooked in `render/svg.tsx` cameraOf, Draw and the
   stage): SPEC 6.8's fixed stage (at least 260 tall, no wider than 2.4 per unit of height) and the story camera up to 1.5
   times natural size, framing all the things the story shows (one frame for every step that showed them all). Was: drawn
   at natural size in a box as tall as the scene (47 the engine small, 55a eight colours and 72 a thin strip). Not on a
   phone (phonecam's camera). The match check counts 55a's crossing near "orders service" at 1280 now (0 -> 2): the
   geometry is the same; drawn larger it is past the check's 12 px end margin. Test: `test/engine/render/fill.test.ts`.
8. **A finished send rests clear of words** (`render/svg.tsx`, `restsOnWords` in `render/fill.ts`): a token's dot at the
   end of its line once it has arrived is left out when it would sit on a text, a chip, a badge or a line's words.
9. **A box's words never break badly, and a graph scene's boxes share one title size** (`render/prims/fit.ts` badBreak and
   withTitleFloor, `pipeline.ts` frame; page2's review): a size whose wrap leaves 2 characters alone ("web-" / "3") or a
   file's extension alone ("checkout-overview." / "json", the stage look keeps the title size) is passed over when a
   smaller one fits cleanly; and in a graph scene, when its boxes' titles took different sizes, the frame is drawn again
   with every box at the smallest of them (long paths at 390: one bold, two thin). Test:
   `test/engine/render/words-break.test.ts`.
10. **A line's words cover no other chip and no stage words** (`layouts/lanes/chips.ts`, page2's review at 390): a chip on
    another line's chip (gt 03 step 1: "redirect to /authorize" on "click Sign in") or on the stage's words (gt 05: the
    lane word "Resolver") moves as one on a title does; it may also sit beside a vertical line, and with no room by its line
    (a line a few px long between two cards) it stacks just under or over the chip it met.
11. **A line's words sit by their own line** (`layouts/lanes/chips.ts`, page2's review of the format 12 examples at 390): a
    chip's own line is the connector that comes in the step it does (the nearest); a chip more than 36 px from it (gt 03's
    "GET /photos + token" in the browser's column, gt 10's callback on the provider-bank lines) moves onto it, and a chip
    another line runs through moves to a place no other line runs through (none: it stays).
